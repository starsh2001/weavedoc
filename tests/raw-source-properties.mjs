// Property checks for the shared raw-source model (schema v3, Phase 1).
//
// The completion condition this file exists to meet: the manifest detects an ADDED, DELETED,
// RENAMED or BYTE-CHANGED source deterministically. Rename is the one a naive "hash the contents"
// misses — the bytes are identical and only the address moved — so it is asserted explicitly rather
// than assumed to fall out of the others.
//
// Fixtures live in a temp directory, never in the repository: a test must not modify the tree it
// grades, which this suite learned the hard way and then re-learned when a cache-key probe edited a
// bundled contract in place.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, unlinkSync, renameSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { manifestBytes, readRawSources, resolveRawSource } from '../.weavedoc/bin/lib/raw-source-model.mjs'

let cases = 0
let groups = 0
let symlinkKind = 'directory'
const check = (condition, message, input = '') => {
  cases++
  assert.ok(condition, `${message}\nINPUT=${JSON.stringify(input)}`)
}

const root = mkdtempSync(join(tmpdir(), 'wd-raw-'))
const fresh = name => {
  const d = join(root, name)
  mkdirSync(d, { recursive: true })
  return d
}
const put = (d, name, body) => writeFileSync(join(d, name), body)

try {
  // ---- 1. the manifest detects every way a source set can change ------------------------------
  groups++
  {
    const d = fresh('changes')
    put(d, 'source.md', 'alpha\n')
    put(d, 'converted.md', 'not a source\n')
    const base = readRawSources(d)
    check(base.readable && base.entries.length === 1 && base.entries[0].name === 'source.md',
      'the flat source.* enumeration did not find exactly the one source', base.entries)
    check(base.treeDigest !== null && base.manifest !== null, 'a clean material produced no manifest', base.diagnostics)

    // DETERMINISM FIRST — without it every "the digest moved" below proves nothing.
    check(readRawSources(d).treeDigest === base.treeDigest, 'the same tree hashed differently on a second read')
    check(readRawSources(d).treeDigest === base.treeDigest, 'the same tree hashed differently on a third read')

    // ADD
    put(d, 'source.txt', 'beta\n')
    const added = readRawSources(d)
    check(added.entries.length === 2, 'a second raw source was not enumerated', added.entries)
    check(added.treeDigest !== base.treeDigest, 'adding a source did not move the tree digest')

    // RENAME — identical bytes, different address. A digest over contents alone cannot see this,
    // and the address is what a quote marker resolves against, so it has to be inside the seal.
    renameSync(join(d, 'source.txt'), join(d, 'source.text'))
    const renamed = readRawSources(d)
    check(renamed.entries.length === 2, 'the renamed source vanished from the enumeration', renamed.entries)
    check(renamed.treeDigest !== added.treeDigest, 'renaming a source with identical bytes did not move the tree digest')
    check(renamed.entries.map(e => e.digest).sort().join() === added.entries.map(e => e.digest).sort().join(),
      'the rename changed a content digest, so this case is not measuring what it claims')

    // BYTE CHANGE
    put(d, 'source.text', 'beta!\n')
    const edited = readRawSources(d)
    check(edited.treeDigest !== renamed.treeDigest, 'editing a source did not move the tree digest')
    check(edited.entries.length === 2, 'editing a source changed the enumeration')

    // DELETE, back to the original single-source tree — the digest must return to the ORIGINAL
    // value, not merely to some new one: a manifest that is order- or history-dependent would not.
    unlinkSync(join(d, 'source.text'))
    const deleted = readRawSources(d)
    check(deleted.entries.length === 1, 'deleting a source left it enumerated', deleted.entries)
    check(deleted.treeDigest === base.treeDigest, 'the tree digest did not return to its value for the identical source set')

    // A non-source file may change freely without touching the seal: the model's population is
    // `source.*`, and converted.md is sealed by its own hop.
    put(d, 'converted.md', 'edited prose\n')
    check(readRawSources(d).treeDigest === base.treeDigest, 'a non-source file moved the raw-source digest')
  }

  // ---- 2. what is and is not a raw source ------------------------------------------------------
  groups++
  {
    const d = fresh('names')
    for (const name of ['source.md', 'source.tar.gz', 'source.a']) put(d, name, name)
    for (const name of ['converted.md', 'source', 'source.', 'sources.md', 'notsource.md', 'SOURCE.md', '.source.md']) put(d, name, name)
    const m = readRawSources(d)
    const found = m.entries.map(e => e.name).sort()
    check(found.join() === ['source.a', 'source.md', 'source.tar.gz'].join(),
      'the raw-source name rule admitted or dropped the wrong files', found)
    // `source` and `source.` are deliberately NOT sources: an extensionless name and a trailing dot
    // name nothing, and admitting them would make the population depend on a typo.
    check(!found.includes('source') && !found.includes('source.'), 'a nameless extension counted as a source', found)
    // Case matters, because the filesystem underneath may not: matching `SOURCE.md` here would give
    // a different population on a case-insensitive volume than on a case-sensitive one.
    check(!found.includes('SOURCE.md'), 'the name rule is case-insensitive and would differ by filesystem', found)
  }

  // ---- 3. a non-regular source makes the manifest UNKNOWN, not partial -------------------------
  groups++
  {
    const d = fresh('irregular')
    put(d, 'source.md', 'real\n')
    const target = join(root, 'outside.txt')
    writeFileSync(target, 'outside\n')
    // Symlink creation needs a privilege Windows does not always grant. The CONTRACT under test is
    // "a `source.*` that is not a regular file is rejected", so when a link cannot be made a
    // directory stands in: same rule, same assertions, same count on every platform. Which kind ran
    // is printed rather than folded into the total, so this can never silently become vacuous.
    try {
      symlinkSync(target, join(d, 'source.link'))
      symlinkKind = 'symlink'
    } catch (e) {
      // THE FALLBACK IS WINDOWS-ONLY, ON PURPOSE. On POSIX a symlink needs no privilege, so a
      // failure there is a broken fixture, not a platform limit — and silently substituting a
      // directory would retire the symlink branch on the only hosts that can exercise it while the
      // suite stayed green. Refusing here is what lets CI's Linux and macOS legs be the measurement
      // that the branch ran; without it, green would be consistent with never testing symlinks at
      // all, anywhere.
      if (process.platform !== 'win32') throw new Error(`symlink creation failed on ${process.platform}, where it must succeed: ${e.code ?? e.message}`)
      mkdirSync(join(d, 'source.link'))
      symlinkKind = 'directory'
    }
    const m = readRawSources(d)
    check(m.readable, 'a listable material read as unreadable', m.diagnostics)
    check(m.rejected.length === 1 && m.rejected[0].name === 'source.link',
      'the non-regular source was not rejected', m.rejected)
    // EXACT, against what was actually created. Accepting either word would let the symlink branch
    // rot unnoticed on a host that can make links: measured — a mutation that stops calling lstat
    // survives on a Windows box where the fallback directory stands in, and dies on POSIX where the
    // link is real. Constant assertion count either way; only the demanded word changes.
    check(m.rejected[0].reason === symlinkKind,
      `the rejection did not name what the entry actually is (created a ${symlinkKind})`, m.rejected)
    // THE WHOLE POINT: no digest at all. A tree digest over the files that happened to be regular
    // is a complete-looking answer about an incomplete set, and every consumer reads a digest as
    // "these are the source bytes".
    check(m.manifest === null && m.treeDigest === null,
      'a rejected entry still produced a tree digest over the remainder', { manifest: m.manifest, digest: m.treeDigest })
    check(m.entries.length === 1 && m.entries[0].name === 'source.md',
      'the regular sibling was lost along with the rejected entry', m.entries)
    check(m.diagnostics.length >= 1 && m.diagnostics.every(x => typeof x.code === 'string' && x.code.startsWith('RAW-SOURCE-')),
      'the rejection produced no typed diagnostic', m.diagnostics)
  }

  // ---- 4. unreadable is not empty --------------------------------------------------------------
  groups++
  {
    const missing = join(root, 'no-such-material')
    const m = readRawSources(missing)
    check(!m.readable, 'a missing material directory read as readable', m)
    check(m.manifest === null && m.treeDigest === null,
      'an unlistable material produced a manifest, which would seal "no sources" as verified', m)
    check(m.entries.length === 0 && m.diagnostics.some(x => x.code === 'RAW-SOURCE-UNREADABLE'),
      'the unreadable material was not diagnosed', m.diagnostics)
    // And an EMPTY material is a different state from an unreadable one: it is readable, has no
    // sources, and does have a (degenerate) manifest.
    const empty = fresh('empty')
    const e = readRawSources(empty)
    check(e.readable && e.entries.length === 0 && e.treeDigest !== null,
      'an empty material was conflated with an unreadable one', e)
    check(e.treeDigest !== m.treeDigest, 'empty and unreadable produced the same answer')
  }

  // ---- 5. the manifest is exactly `name NUL digest LF`, sorted bytewise -------------------------
  groups++
  {
    const entries = [
      { name: 'source.md', digest: 'a'.repeat(64) },
      { name: 'source.a', digest: 'b'.repeat(64) }
    ]
    const bytes = manifestBytes(entries)
    const text = bytes.toString('latin1')
    check(text === `source.a\0${'b'.repeat(64)}\nsource.md\0${'a'.repeat(64)}\n`,
      'the manifest shape or its ordering changed', text)
    check(bytes.includes(0), 'the NUL separator is gone — a path could then forge a row boundary')
    // Sorting is bytewise, so it cannot depend on locale or on UTF-16 surrogate order.
    const astral = manifestBytes([
      { name: 'source.\u{1F600}', digest: 'c'.repeat(64) },
      { name: 'source.\uFF5E', digest: 'd'.repeat(64) }
    ]).toString('latin1')
    // U+1F600 sorts BEFORE U+FF5E by UTF-16 code unit (its lead surrogate D83D < FF5E) and AFTER it
    // by UTF-8 bytes (F0\u2026 > EF\u2026). So this pair tells the two orders apart, which a BMP-only pair
    // cannot do \u2014 that is the whole reason for choosing these two characters.
    const first = astral.split('\n')[0]
    check(first.startsWith(Buffer.from('source.\uFF5E', 'utf8').toString('latin1')),
      'the manifest sorted by UTF-16 code unit rather than by bytes', first)
  }

  // ---- 6. resolving a written address ----------------------------------------------------------
  groups++
  {
    const one = fresh('one')
    put(one, 'source.md', 'only\n')
    const single = readRawSources(one)
    check(resolveRawSource(single).ok && resolveRawSource(single).entry.name === 'source.md',
      'a lone source did not resolve without an address')
    check(resolveRawSource(single, 'source.md').ok, 'an exact address did not resolve')

    const many = fresh('many')
    put(many, 'source.md', 'a\n')
    put(many, 'source.txt', 'b\n')
    const multi = readRawSources(many)
    // AMBIGUOUS IS NOT "PICK ONE". Choosing silently attributes a quote to a file the writer never
    // named, which is the attribution this whole seal exists to make checkable.
    const noAddr = resolveRawSource(multi)
    check(!noAddr.ok && noAddr.code === 'RAW-SOURCE-AMBIGUOUS', 'several sources resolved without an address', noAddr)
    check(resolveRawSource(multi, 'source.txt').entry.name === 'source.txt', 'an exact address among several did not resolve')

    const absent = readRawSources(fresh('none'))
    check(resolveRawSource(absent).code === 'RAW-SOURCE-ABSENT', 'no sources resolved as ambiguous rather than absent')

    // PATH ESCAPE, refused on the written address rather than after normalising it.
    for (const bad of ['../source.md', '..\\source.md', '/etc/passwd', 'C:\\x\\source.md', 'a/../../source.md', 'sub/../source.md']) {
      const r = resolveRawSource(multi, bad)
      check(!r.ok, `an escaping address resolved: '${bad}'`, r)
      check(['RAW-SOURCE-ESCAPE', 'RAW-SOURCE-NOT-FOUND'].includes(r.code), `escape produced an unexpected code for '${bad}'`, r)
    }
    check(resolveRawSource(multi, '../source.md').code === 'RAW-SOURCE-ESCAPE', 'a parent-directory address was not named as an escape')
    // A nested address names nothing: raw sources are flat by contract, and answering for a nested
    // path would invent a layout rule no writer was told about.
    check(resolveRawSource(multi, 'sub/source.md').code === 'RAW-SOURCE-NOT-FOUND', 'a nested address was resolved')
    check(resolveRawSource(multi, 'source.pdf').code === 'RAW-SOURCE-NOT-FOUND', 'an absent name resolved')
    check(!resolveRawSource({ readable: false, entries: [], rejected: [] }).ok, 'an unreadable model resolved an address')
  }

  console.log(`raw-source-properties: groups=${groups} cases=${cases} nonregular=${symlinkKind}`)
} finally {
  try { chmodSync(root, 0o700) } catch { /* best effort */ }
  rmSync(root, { recursive: true, force: true })
}
