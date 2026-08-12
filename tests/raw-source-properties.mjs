// Property checks for the shared raw-source model (schema v3, Phase 1).
//
// Two things this file has to earn. First the completion condition: the manifest detects an ADDED,
// DELETED, RENAMED or BYTE-CHANGED source deterministically — rename being the one a digest over
// contents alone cannot see. Second, and learned the hard way: the DIGEST ITSELF must be attacked.
// The first version asserted only that digests CHANGED when they should, so swapping SHA-256 for
// SHA-1, or returning a padded file size instead of a content hash, passed every assertion.
//
// Fixtures live in a temp directory, never in the repository.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, linkSync, writeFileSync, unlinkSync, renameSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RAW_SOURCE_STATES, manifestBytes, openMaterialRoot, readRawSources, resolveRawSource } from '../.weavedoc/bin/lib/raw-source-model.mjs'

let cases = 0
let groups = 0
let linkKind = 'directory'
let rootAlias = 'none'
let hardlink = 'unsupported'
const check = (condition, message, input = '') => {
  cases++
  assert.ok(condition, `${message}\nINPUT=${JSON.stringify(input)}`)
}

const root = mkdtempSync(join(tmpdir(), 'wd-raw-'))
const mine = join(root, 'mine')
mkdirSync(mine, { recursive: true })
const fresh = name => {
  const d = join(mine, name)
  mkdirSync(d, { recursive: true })
  return d
}
const put = (d, name, body) => writeFileSync(join(d, name), body)
const read = (d, opts = {}) => readRawSources(d, { trustedRoot: mine, ...opts })
const sha = buf => createHash('sha256').update(buf).digest('hex')

try {
  // ---- 1. the digest is the digest it claims to be ---------------------------------------------
  groups++
  {
    const d = fresh('vectors')
    // KNOWN VECTORS. Without these, any hash function passes: the earlier suite only checked that
    // digests differed when the bytes differed, which SHA-1 and a padded file size both satisfy.
    const empty = Buffer.alloc(0)
    const abc = Buffer.from('abc', 'latin1')
    put(d, 'source.empty', empty)
    put(d, 'source.abc', abc)
    const m = read(d)
    check(m.state === 'complete', 'the vector material did not read complete', m.diagnostics)
    const byName = Object.fromEntries(m.entries.map(e => [e.name, e]))
    check(byName['source.empty'].digest === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      'the empty-input digest is not SHA-256', byName['source.empty'].digest)
    check(byName['source.abc'].digest === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      'the "abc" digest is not SHA-256', byName['source.abc'].digest)
    // Shape, so a hex-of-something-else cannot pass for a digest.
    for (const e of m.entries) {
      check(/^[0-9a-f]{64}$/.test(e.digest), `entry digest is not 64 lowercase hex: ${e.name}`, e.digest)
    }
    check(/^[0-9a-f]{64}$/.test(m.treeDigest), 'tree digest is not 64 lowercase hex', m.treeDigest)
    // The tree digest is SHA-256 OF THE MANIFEST, recomputed here independently rather than
    // compared against itself.
    check(m.treeDigest === sha(m.manifest), 'the tree digest is not the hash of the manifest it publishes')
    check(m.treeDigest !== m.manifest.toString('hex'), 'the tree digest is the manifest hex rather than its hash')

    // SAME-LENGTH byte change: the earlier edit fixture also changed the length, so a digest that
    // was really the file size passed. This one cannot.
    const before = read(d).treeDigest
    put(d, 'source.abc', Buffer.from('abd', 'latin1'))
    const after = read(d)
    check(after.entries.find(e => e.name === 'source.abc').size === 3, 'the same-length edit changed the size, so this case is not measuring what it claims')
    check(after.treeDigest !== before, 'a same-length byte change did not move the tree digest')

    // INVALID UTF-8, hashed as bytes. Decoding and re-encoding would silently replace 0x80 with
    // U+FFFD and hash something the file does not contain.
    const invalid = Buffer.from([0xff, 0xfe, 0x80, 0x00, 0x41])
    put(d, 'source.bin', invalid)
    const withBinary = read(d)
    check(withBinary.entries.find(e => e.name === 'source.bin').digest === sha(invalid),
      'invalid UTF-8 bytes were not hashed as bytes')
    check(withBinary.bytesOf('source.bin').equals(invalid), 'the snapshot did not preserve invalid UTF-8 bytes')
  }

  // ---- 2. the manifest detects every way a source set can change --------------------------------
  groups++
  {
    const d = fresh('changes')
    put(d, 'source.md', 'alpha\n')
    put(d, 'converted.md', 'not a source\n')
    const base = read(d)
    check(base.state === 'complete' && base.entries.length === 1 && base.entries[0].name === 'source.md',
      'the flat source.* enumeration did not find exactly the one source', base.entries)
    check(read(d).treeDigest === base.treeDigest, 'the same tree hashed differently on a second read')
    check(read(d).treeDigest === base.treeDigest, 'the same tree hashed differently on a third read')

    put(d, 'source.txt', 'beta\n')
    const added = read(d)
    check(added.entries.length === 2 && added.treeDigest !== base.treeDigest, 'adding a source did not move the tree digest')

    // RENAME — identical bytes, different address. The address is what a quote marker resolves
    // against, so it has to be inside the seal.
    renameSync(join(d, 'source.txt'), join(d, 'source.text'))
    const renamed = read(d)
    check(renamed.treeDigest !== added.treeDigest, 'renaming a source with identical bytes did not move the tree digest')
    check(renamed.entries.map(e => e.digest).sort().join() === added.entries.map(e => e.digest).sort().join(),
      'the rename changed a content digest, so this case is not measuring what it claims')

    put(d, 'source.text', 'beta!\n')
    const edited = read(d)
    check(edited.treeDigest !== renamed.treeDigest, 'editing a source did not move the tree digest')

    // DELETE back to the original set: the digest must return to its ORIGINAL value, which an
    // order- or history-dependent manifest would not.
    unlinkSync(join(d, 'source.text'))
    check(read(d).treeDigest === base.treeDigest, 'the tree digest did not return to its value for the identical source set')

    put(d, 'converted.md', 'edited prose\n')
    check(read(d).treeDigest === base.treeDigest, 'a non-source file moved the raw-source digest')
  }

  // ---- 3. what is and is not a raw source -------------------------------------------------------
  groups++
  {
    const d = fresh('names')
    for (const name of ['source.md', 'source.tar.gz', 'source.a']) put(d, name, name)
    for (const name of ['converted.md', 'source', 'source.', 'sources.md', 'notsource.md', 'SOURCE.md', '.source.md']) put(d, name, name)
    const found = read(d).entries.map(e => e.name).sort()
    check(found.join() === ['source.a', 'source.md', 'source.tar.gz'].join(),
      'the raw-source name rule admitted or dropped the wrong files', found)
    check(!found.includes('source') && !found.includes('source.'), 'a nameless extension counted as a source', found)
    // Case matters, because the filesystem underneath may not: matching `SOURCE.md` would give a
    // different population on a case-insensitive volume than on a case-sensitive one.
    check(!found.includes('SOURCE.md'), 'the name rule is case-insensitive and would differ by filesystem', found)
  }

  // ---- 4. every state is a state, and only two of them carry a manifest -------------------------
  groups++
  {
    const empty = read(fresh('empty'))
    check(empty.state === 'empty' && empty.entries.length === 0 && empty.treeDigest !== null,
      'an empty material is not the `empty` state with a degenerate manifest', empty)

    const missing = read(join(mine, 'no-such-material'))
    check(missing.state === 'unreadable' && missing.manifest === null,
      'an unlistable material produced a manifest, which would seal "no sources" as verified', missing)
    check(missing.treeDigest !== empty.treeDigest, 'empty and unreadable produced the same answer')

    const d = fresh('mixed')
    put(d, 'source.md', 'real\n')
    // A LINK TO A DIRECTORY, so this runs on every platform and there is no fallback left to hide
    // behind. A symlink to a FILE needs a privilege Windows may withhold, and the earlier fixture
    // substituted a plain directory when it could not make one — which concealed a real defect:
    // the model opened the path and asked the DESCRIPTOR whether it was a link, but `open` follows
    // links, so that test always answered false. Local Windows was green on the fallback while all
    // three CI legs failed on this line. A junction needs no privilege on Windows and
    // `symlinkSync`'s type argument is ignored on POSIX, so one form covers every host.
    const linkTarget = join(root, 'link-target')
    mkdirSync(linkTarget, { recursive: true })
    writeFileSync(join(linkTarget, 'source.md'), 'EXTERNAL\n')
    try { symlinkSync(linkTarget, join(d, 'source.link'), 'junction'); linkKind = 'symlink' } catch (e) {
      throw new Error(`no symlink form could be created on ${process.platform}: ${e.code ?? e.message}`)
    }
    const mixed = read(d)
    check(mixed.state === 'invalid', 'a non-regular entry did not make the set invalid', mixed.state)
    check(mixed.manifest === null && mixed.treeDigest === null, 'an invalid set still produced a tree digest', mixed)
    check(mixed.rejected.length === 1 && mixed.rejected[0].reason === linkKind,
      `the rejection did not name what the entry actually is (created a ${linkKind})`, mixed.rejected)
    check(mixed.entries.length === 1, 'the regular sibling was lost along with the rejected entry', mixed.entries)
    check(mixed.diagnostics.every(x => typeof x.code === 'string' && x.code.startsWith('RAW-SOURCE-')),
      'the rejection produced no typed diagnostic', mixed.diagnostics)
    check(RAW_SOURCE_STATES.includes(mixed.state) && RAW_SOURCE_STATES.includes(empty.state),
      'a state outside the declared set was published')
  }

  // ---- 5. an alias is not evidence --------------------------------------------------------------
  groups++
  {
    // ROOT ALIAS. A junction or symlink standing in for the material directory yields bytes that
    // live outside the mine and can be re-aimed without changing anything a digest covers.
    const external = join(root, 'external-material')
    mkdirSync(external, { recursive: true })
    writeFileSync(join(external, 'source.md'), 'EXTERNAL\n')
    const aliasRoot = join(mine, 'aliased')
    // MANDATORY, not best-effort. A junction needs no privilege on Windows and a symlink needs
    // none on POSIX, so one of these forms works on every platform this ships to — and a fixture
    // that quietly skips is a check that has never run. Skipping would also vary the assertion
    // count by host, which is how a vacuity guard starts failing for the wrong reason.
    for (const type of ['junction', 'dir']) {
      try { symlinkSync(external, aliasRoot, type); rootAlias = type; break } catch { /* try the next form */ }
    }
    if (rootAlias === 'none') throw new Error(`no directory alias could be created on ${process.platform}; the root-alias branch would go untested`)
    const aliased = read(aliasRoot)
    check(aliased.state === 'invalid', 'an aliased material root was read as a legitimate one', aliased.state)
    check(aliased.treeDigest === null && aliased.entries.length === 0, 'an aliased root sealed external bytes', aliased)
    check(aliased.diagnostics[0].code === 'RAW-SOURCE-ROOT-ALIAS', 'the root alias was not named', aliased.diagnostics)
    // Containment holds even for a real directory that simply is not under the trusted root.
    const outsideDir = join(root, 'not-in-mine')
    mkdirSync(outsideDir, { recursive: true })
    writeFileSync(join(outsideDir, 'source.md'), 'x')
    const escaped = readRawSources(outsideDir, { trustedRoot: mine })
    check(escaped.state === 'invalid' && escaped.diagnostics[0].code === 'RAW-SOURCE-ROOT-ESCAPE',
      'a material outside the trusted root was accepted', escaped)
    // `/a/b` is not inside `/a/bc`; a string-prefix containment test says it is.
    const sibling = join(root, 'mine-extra')
    mkdirSync(sibling, { recursive: true })
    check(readRawSources(sibling, { trustedRoot: mine }).state === 'invalid',
      'a sibling directory sharing a name prefix passed containment')
    // The trusted root is REQUIRED: a boundary that can be omitted is one that will be.
    let threw = false
    try { readRawSources(fresh('anything')) } catch { threw = true }
    check(threw, 'a material was read with no trusted root at all')

    // HARDLINK. One inode under two names lets converted.md also BE source.alias: the same bytes
    // counted as their own evidence.
    const h = fresh('hardlink')
    writeFileSync(join(h, 'converted.md'), 'CONVERTED\n')
    // Mandatory for the same reason: hardlinks need no privilege on any platform this ships to.
    try { linkSync(join(h, 'converted.md'), join(h, 'source.alias')); hardlink = 'made' } catch (e) {
      throw new Error(`hardlink creation failed on ${process.platform}: ${e.code ?? e.message}`)
    }
    const linked = read(h)
    check(linked.state === 'invalid', 'a hardlinked source was accepted as evidence', linked.state)
    check(linked.rejected[0]?.reason === 'hardlink', 'the hardlink was not named as one', linked.rejected)
    check(linked.treeDigest === null, 'a hardlinked source still produced a tree digest')
    check(openMaterialRoot(fresh('plain'), mine).ok, 'a plain material root failed the capability check')

    // THE TRUSTED ROOT MUST ITSELF BE REAL. Only the material was checked, so a junction standing in
    // for the materials directory passed containment trivially — both sides resolved to the same
    // external path, `relative()` returned '', and outside bytes sealed as ordinary evidence.
    const outsideMine = join(root, 'outside-mine')
    mkdirSync(join(outsideMine, 'm001'), { recursive: true })
    writeFileSync(join(outsideMine, 'm001', 'source.md'), 'EXTERNAL\n')
    const fakeMineParent = join(root, 'fake-mine')
    mkdirSync(fakeMineParent, { recursive: true })
    const fakeRoot = join(fakeMineParent, 'materials')
    let aliasedRootMade = false
    for (const type of ['junction', 'dir']) {
      try { symlinkSync(outsideMine, fakeRoot, type); aliasedRootMade = true; break } catch { /* next form */ }
    }
    if (!aliasedRootMade) throw new Error(`no directory alias could be created on ${process.platform}; the trusted-root branch would go untested`)
    const viaAliasedRoot = readRawSources(join(fakeRoot, 'm001'), { trustedRoot: fakeRoot })
    check(viaAliasedRoot.state === 'invalid', 'an aliased trusted root bounded nothing', viaAliasedRoot.state)
    check(viaAliasedRoot.treeDigest === null, 'an aliased trusted root still sealed external bytes', viaAliasedRoot)
    check(viaAliasedRoot.diagnostics[0].code === 'RAW-SOURCE-TRUSTED-ROOT-ALIAS',
      'the aliased trusted root was not named', viaAliasedRoot.diagnostics)
  }

  // ---- 6. a mixed-generation read is never published as complete --------------------------------
  groups++
  {
    // Injected through the model's fault seam: a race is the one condition a fixture cannot produce
    // by waiting, and an unexercised stability check is a check that has never run.
    const d = fresh('racy')
    put(d, 'source.md', 'original\n')
    const torn = read(d, { hooks: { afterRead: () => appendFileSync(join(d, 'source.md'), 'MORE\n') } })
    check(torn.state === 'unstable', 'a file rewritten during the read was published as a snapshot', torn.state)
    check(torn.manifest === null && torn.treeDigest === null, 'an unstable read still produced a digest', torn)
    check(torn.diagnostics[0].code === 'RAW-SOURCE-UNSTABLE', 'the instability was not named', torn.diagnostics)

    const d2 = fresh('racy-dir')
    put(d2, 'source.md', 'a\n')
    const grew = read(d2, { hooks: { afterEntries: () => put(d2, 'source.new', 'b\n') } })
    check(grew.state === 'unstable', 'a source appearing during the walk was published as a complete set', grew.state)
    check(grew.treeDigest === null, 'a set that changed during the walk still produced a digest')
    // Once settled, the same directory reads clean — so the check is about the race, not the tree.
    check(read(d2).state === 'complete', 'the settled directory did not read complete afterwards')

    // THE ALIAS THAT ARRIVES AFTER THE READ. nlink was checked before the bytes were taken, so a
    // file could be renamed aside and a hardlink to it dropped back under the same name mid-read:
    // the descriptor still described a singly-linked file, the final path was nlink=2, and the set
    // published as `complete` with a tree digest. Measured before the post-read lstat existed.
    const d3 = fresh('late-alias')
    put(d3, 'source.md', 'original\n')
    const late = read(d3, {
      hooks: {
        afterRead: () => {
          renameSync(join(d3, 'source.md'), join(d3, 'held.md'))
          linkSync(join(d3, 'held.md'), join(d3, 'source.md'))
        }
      }
    })
    check(late.state !== 'complete', 'a hardlink installed after the read still produced a complete set', late.state)
    check(late.treeDigest === null, 'a set aliased mid-read still produced a tree digest', late)

    // THE ROOT ITSELF CAN BE SWAPPED. Names matching is not the same as the directory being the same
    // directory: rename the material aside, put a fresh one with identical filenames back, and every
    // child re-lists identically while the snapshot describes files no longer at that path.
    const d4 = fresh('root-swap')
    put(d4, 'source.md', 'original\n')
    const swapped = read(d4, {
      hooks: {
        afterEntries: () => {
          renameSync(d4, join(mine, 'root-swap-moved'))
          mkdirSync(d4, { recursive: true })
          writeFileSync(join(d4, 'source.md'), 'IMPOSTOR\n')
        }
      }
    })
    check(swapped.state === 'unstable', 'the material root was replaced mid-read and the set still published', swapped.state)
    check(swapped.treeDigest === null, 'a swapped root still produced a tree digest', swapped)
  }

  // ---- 7. the manifest shape, and the snapshot it hands out -------------------------------------
  groups++
  {
    const entries = [
      { name: 'source.md', digest: 'a'.repeat(64) },
      { name: 'source.a', digest: 'b'.repeat(64) }
    ]
    const text = manifestBytes(entries).toString('latin1')
    check(text === `source.a\0${'b'.repeat(64)}\nsource.md\0${'a'.repeat(64)}\n`,
      'the manifest shape or its ordering changed', text)
    check(manifestBytes(entries).includes(0), 'the NUL separator is gone — a path could then forge a row boundary')
    // U+1F600 sorts BEFORE U+FF5E by UTF-16 code unit (lead surrogate D83D < FF5E) and AFTER it by
    // UTF-8 bytes (F0… > EF…), so this pair tells the two orders apart where a BMP pair cannot.
    const astral = manifestBytes([
      { name: 'source.\u{1F600}', digest: 'c'.repeat(64) },
      { name: 'source.\uFF5E', digest: 'd'.repeat(64) }
    ]).toString('latin1')
    check(astral.split('\n')[0].startsWith(Buffer.from('source.\uFF5E', 'utf8').toString('latin1')),
      'the manifest sorted by UTF-16 code unit rather than by bytes', astral.split('\n')[0])

    // THE SNAPSHOT IS THE MODEL'S. Without bytes on the model, the quote scanner must open the file
    // again — a second answer about the same source, which is what this module exists to prevent.
    const d = fresh('snapshot')
    put(d, 'source.md', 'held\n')
    const m = read(d)
    check(m.bytesOf('source.md').toString('latin1') === 'held\n', 'the model did not carry the bytes it hashed')
    check(m.bytesOf('missing.md') === null, 'the snapshot answered for a file it does not hold')
    const handed = m.bytesOf('source.md')
    handed[0] = 0x58
    check(m.bytesOf('source.md').toString('latin1') === 'held\n',
      'the snapshot handed out its own buffer, so one consumer can mutate what another is about to hash')
    check(m.entries[0].size === m.bytesOf('source.md').length && m.entries[0].digest === sha(m.bytesOf('source.md')),
      'size and digest do not describe the bytes the model holds')
  }

  // ---- 8. resolving a written address -----------------------------------------------------------
  groups++
  {
    const one = fresh('one')
    put(one, 'source.md', 'only\n')
    const single = read(one)
    check(resolveRawSource(single).ok && resolveRawSource(single).entry.name === 'source.md',
      'a lone source did not resolve without an address')

    const many = fresh('many')
    put(many, 'source.md', 'a\n')
    put(many, 'source.txt', 'b\n')
    const multi = read(many)
    check(resolveRawSource(multi).code === 'RAW-SOURCE-AMBIGUOUS', 'several sources resolved without an address')
    check(resolveRawSource(multi, 'source.txt').entry.name === 'source.txt', 'an exact address among several did not resolve')
    check(resolveRawSource(read(fresh('none'))).code === 'RAW-SOURCE-ABSENT', 'an empty set did not resolve as absent')

    // AN INCOMPLETE SET RESOLVES NOTHING. The first version checked only `entries`, so a material
    // with a rejected sibling — no tree digest, nothing sealed — still answered `ok` for its
    // regular file. Both directions are pinned: a good sibling does not rescue a broken set, and a
    // set that is only rejections is not "absent".
    const partial = fresh('partial')
    put(partial, 'source.md', 'good\n')
    mkdirSync(join(partial, 'source.bad'))
    const p = read(partial)
    check(p.state === 'invalid', 'the partial set was not invalid', p.state)
    check(!resolveRawSource(p).ok && !resolveRawSource(p, 'source.md').ok,
      'an address resolved out of a set with no tree digest', resolveRawSource(p, 'source.md'))
    const onlyBad = fresh('only-bad')
    mkdirSync(join(onlyBad, 'source.bad'))
    const ob = resolveRawSource(read(onlyBad))
    check(!ob.ok && ob.code !== 'RAW-SOURCE-ABSENT',
      'a set of nothing but rejected entries was reported as absent', ob)

    for (const bad of ['../source.md', '..\\source.md', '/etc/passwd', 'C:\\x\\source.md', 'a/../../source.md', 'sub/../source.md']) {
      const r = resolveRawSource(multi, bad)
      check(!r.ok && ['RAW-SOURCE-ESCAPE', 'RAW-SOURCE-NOT-FOUND'].includes(r.code), `an escaping address resolved: '${bad}'`, r)
    }
    check(resolveRawSource(multi, '../source.md').code === 'RAW-SOURCE-ESCAPE', 'a parent-directory address was not named as an escape')
    check(resolveRawSource(multi, 'sub/source.md').code === 'RAW-SOURCE-NOT-FOUND', 'a nested address was resolved')
    check(resolveRawSource(multi, 'source.pdf').code === 'RAW-SOURCE-NOT-FOUND', 'an absent name resolved')
    check(!resolveRawSource({ state: 'unstable', diagnostics: [{ code: 'RAW-SOURCE-UNSTABLE' }] }).ok, 'an unstable model resolved an address')
    check(!resolveRawSource(undefined).ok, 'a missing model resolved an address')
  }

  console.log(`raw-source-properties: groups=${groups} cases=${cases} nonregular=${linkKind} rootalias=${rootAlias} hardlink=${hardlink}`)
} finally {
  rmSync(root, { recursive: true, force: true })
}
