// The one reading of a material's raw sources: what they are, what bytes they hold, what they hash
// to, and what is not allowed to be one.
//
// Everything downstream that has to say "the source bytes changed" — conflict envelopes, support
// projections, confirmation projections, the source→converted seal, the quote scanner — reads this
// and does not walk the directory again. A second walk is a second answer about which bytes were
// verified, and that answer is the warranty.
//
// READ-ONLY AND UNWIRED (Phase 1). No production consumer imports this yet.
import { createHash } from 'node:crypto'
import { closeSync, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { relative as pathRelative } from 'node:path'

// `source.<something>`, directly in the material directory. NOT a `source/` directory, not a nested
// tree: today's layout is flat (`materials/mNNN/source.md`) and inventing a nesting rule here would
// be a contract nobody asked for. `source.` with nothing after it is not a source either.
const RAW_SOURCE_NAME = /^source\.[^.\\/]/

// THE STATE IS ONE WORD, not a combination consumers have to reassemble. The first version returned
// `readable` + `rejected` + `treeDigest` and let each caller decide what that meant together; the
// resolver then read only two of the three and happily answered from an INCOMPLETE set — a source
// address resolved while the tree digest was null. A discriminated state cannot be half-read.
//
//   complete   — every `source.*` is a regular file in a verified root; bytes and digests exist
//   empty      — verified root, no `source.*` at all; a manifest exists and is degenerate
//   invalid    — the root or an entry is not something this model may treat as evidence
//   unreadable — the root could not be listed, or a matching entry could not be read
//   unstable   — the directory or a file changed while it was being read
//
// Only `complete` and `empty` carry a manifest, and only `complete` resolves an address.
export const RAW_SOURCE_STATES = ['complete', 'empty', 'invalid', 'unreadable', 'unstable']

const sha256 = buf => createHash('sha256').update(buf).digest('hex')
// BYTE ORDER, not JS string order. They agree across the whole BMP and disagree above it, where a
// `.sort()` compares UTF-16 surrogate pairs — so a material with an astral character in a filename
// would manifest in a different order depending on nothing the user can see.
const bytewise = (a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))

const fail = (state, root, code, detail, extra = {}) => ({
  state,
  ok: false,
  root,
  realRoot: null,
  entries: [],
  rejected: [],
  manifest: null,
  treeDigest: null,
  diagnostics: [{ code, detail }],
  bytesOf: () => null,
  ...extra
})

// THE VERIFIED ROOT CAPABILITY, in one place so no consumer re-derives the boundary. A material
// root that is itself a symlink or a Windows junction is an alias: the bytes it yields live outside
// the mine and can be re-aimed without changing anything a digest covers. Measured — a junction
// pointing at an external directory sealed that directory's `source.md` as ordinary evidence.
export function openMaterialRoot (materialDir, trustedRoot) {
  if (typeof trustedRoot !== 'string' || trustedRoot === '') {
    // Required, not optional-with-a-default: a containment check that can be omitted is one that
    // will be, and then this boundary exists only in whichever caller remembered it.
    throw new Error('openMaterialRoot needs the trusted root the material must live inside')
  }
  // THE TRUSTED ROOT MUST ITSELF BE REAL. Checking only the material meant a junction standing in
  // for `materials/` passed containment trivially — both sides resolved to the same external path,
  // so `relative()` returned '' and an outside directory sealed as ordinary evidence. A root that
  // can be re-aimed is not a boundary.
  let trusted
  try { trusted = lstatSync(trustedRoot) } catch (e) { return { ok: false, code: 'RAW-SOURCE-UNREADABLE', state: 'unreadable', detail: `the trusted root ${trustedRoot} cannot be examined (${e.code ?? 'EUNKNOWN'})`, real: null } }
  if (trusted.isSymbolicLink()) return { ok: false, code: 'RAW-SOURCE-TRUSTED-ROOT-ALIAS', state: 'invalid', detail: `the trusted root ${trustedRoot} is a symlink or junction, so it bounds nothing`, real: null }
  if (!trusted.isDirectory()) return { ok: false, code: 'RAW-SOURCE-TRUSTED-ROOT-ALIAS', state: 'invalid', detail: `the trusted root ${trustedRoot} is not a directory`, real: null }
  let st
  try { st = lstatSync(materialDir) } catch (e) { return { ok: false, code: 'RAW-SOURCE-UNREADABLE', state: 'unreadable', detail: `${materialDir} cannot be examined (${e.code ?? 'EUNKNOWN'})`, real: null } }
  if (st.isSymbolicLink()) return { ok: false, code: 'RAW-SOURCE-ROOT-ALIAS', state: 'invalid', detail: `${materialDir} is a symlink or junction, so its bytes are not inside the mine`, real: null }
  if (!st.isDirectory()) return { ok: false, code: 'RAW-SOURCE-ROOT-NOT-DIR', state: 'invalid', detail: `${materialDir} is not a directory`, real: null }
  let real, realTrusted
  try {
    real = realpathSync(materialDir)
    realTrusted = realpathSync(trustedRoot)
  } catch (e) {
    return { ok: false, code: 'RAW-SOURCE-UNREADABLE', state: 'unreadable', detail: `canonical path unavailable (${e.code ?? 'EUNKNOWN'})`, real: null }
  }
  // `relative()` rather than a string prefix: `/a/b` is not inside `/a/bc`, and a prefix test says
  // it is. An empty result means the root IS the trusted root, which is allowed.
  const rel = pathRelative(realTrusted, real)
  if (rel.startsWith('..') || /^[A-Za-z]:/.test(rel)) {
    return { ok: false, code: 'RAW-SOURCE-ROOT-ESCAPE', state: 'invalid', detail: `${materialDir} resolves outside the trusted root`, real }
  }
  // The root's own identity is carried out, so the caller can prove at the END of the read that the
  // directory it enumerated is still the directory at that path.
  return { ok: true, code: null, state: null, detail: null, real, ino: st.ino, dev: st.dev }
}

// Re-examining the ROOT after the read, for the reason the entries are re-examined: a material
// directory can be renamed aside and a fresh directory — or a junction — installed under the same
// name while the walk is in flight. The names then match, every child re-lists identically, and the
// snapshot describes files that are no longer at that path. Measured before this existed.
function rootUnchanged (materialDir, trustedRoot, opened) {
  const now = openMaterialRoot(materialDir, trustedRoot)
  return now.ok && now.real === opened.real && now.ino === opened.ino && now.dev === opened.dev
}

// One file, read so that its identity and its bytes come from the SAME open description. The first
// version lstat'd, then separately read: `size` was from one instant and `digest` from another, so
// a file rewritten in between produced an entry whose own fields disagreed. fstat on the held fd,
// read, fstat again — if identity or size moved, this read is not a snapshot of anything.
function readEntry (dir, name, hooks) {
  const path = `${dir}/${name}`
  // LSTAT DECIDES THE TYPE, AND IT HAS TO COME FIRST. `open` FOLLOWS a symlink, so `fstat` on the
  // resulting descriptor describes the TARGET and can never report a link — testing the fd for
  // `isSymbolicLink()` is dead code that always answers false. The first rewrite did exactly that
  // and shipped: the local Windows sweep was green only because the host could not create a link,
  // so the fixture's directory fallback stood in and hid it. All three CI legs, where links are
  // creatable, failed on the same line.
  let pre
  try { pre = lstatSync(path) } catch (e) { return { kind: 'unreadable', code: e.code ?? 'EUNKNOWN' } }
  if (pre.isSymbolicLink()) return { kind: 'symlink' }
  if (pre.isDirectory()) return { kind: 'directory' }
  if (!pre.isFile()) return { kind: 'irregular' }
  let fd
  try { fd = openSync(path, 'r') } catch (e) { return { kind: 'unreadable', code: e.code ?? 'EUNKNOWN' } }
  try {
    const before = fstatSync(fd)
    // The name could have been re-pointed between the lstat and the open. Binding the two by
    // identity is what makes "the thing I typed" and "the thing I read" the same object.
    if (before.ino !== pre.ino || before.dev !== pre.dev) {
      return { kind: 'unstable', detail: `${name} was replaced between being examined and being opened` }
    }
    if (!before.isFile()) return { kind: 'irregular' }
    // A hardlink makes one inode reachable under two names, so `converted.md` can also BE
    // `source.alias`: the same bytes counted as their own evidence. Refused for the same reason a
    // symlink is — evidence has to be a thing in the mine, not a second name for something else.
    if (before.nlink > 1) return { kind: 'hardlink', nlink: before.nlink }
    const bytes = readFileSync(fd)
    // FAULT SEAM, injectable the way consecrate's and upgrade's write primitives are: a race is
    // the one condition a fixture cannot produce by waiting, and an untested stability check is a
    // check that has never run. Never set by production callers.
    if (hooks?.afterRead) hooks.afterRead(name)
    const after = fstatSync(fd)
    // MUTATION NOTE: the condition as a whole is killed by the injected race, but the final clause
    // is not separately killable — every fixture that moves the size also moves mtime, so the
    // earlier clause fires first. `after.size !== bytes.length` guards a SHORT READ, where the file
    // never changed and the read simply returned less than it should have; no fixture can stage
    // that, so it is redundancy carried on purpose rather than coverage anyone should claim.
    if (after.ino !== before.ino || after.dev !== before.dev || after.size !== before.size ||
        after.mtimeMs !== before.mtimeMs || after.size !== bytes.length) {
      return { kind: 'unstable', detail: `${name} changed while it was being read` }
    }
    // AND THE NAME, AFTER THE READ. The link count was checked before, so a file could be renamed
    // aside and a hardlink to it put back under the same name while the read was in flight: the fd
    // still described a singly-linked file, the final path was `nlink=2`, and the set published as
    // complete — measured. The descriptor tells us about the object; only lstat tells us what the
    // NAME points at now, and the seal is about the name.
    let post
    try { post = lstatSync(path) } catch (e) { return { kind: 'unstable', detail: `${name} disappeared while it was being read (${e.code ?? 'EUNKNOWN'})` } }
    if (post.isSymbolicLink()) return { kind: 'symlink' }
    if (!post.isFile()) return { kind: 'irregular' }
    if (post.nlink > 1) return { kind: 'hardlink', nlink: post.nlink }
    if (post.ino !== before.ino || post.dev !== before.dev) {
      return { kind: 'unstable', detail: `${name} was repointed at a different file while it was being read` }
    }
    return { kind: 'file', bytes }
  } catch (e) {
    return { kind: 'unreadable', code: e.code ?? 'EUNKNOWN' }
  } finally {
    try { closeSync(fd) } catch { /* already gone */ }
  }
}

export function readRawSources (materialDir, { trustedRoot, hooks } = {}) {
  const opened = openMaterialRoot(materialDir, trustedRoot)
  if (!opened.ok) return fail(opened.state, materialDir, opened.code, opened.detail)

  const listing = () => {
    try { return readdirSync(materialDir).filter(n => RAW_SOURCE_NAME.test(n)).sort(bytewise) } catch { return null }
  }
  const first = listing()
  if (first === null) return fail('unreadable', materialDir, 'RAW-SOURCE-UNREADABLE', `${materialDir} cannot be listed`)

  const entries = []
  const rejected = []
  const diagnostics = []
  const bytesByName = new Map()
  let unstable = null

  for (const name of first) {
    const info = readEntry(materialDir, name, hooks)
    if (info.kind === 'file') {
      bytesByName.set(name, info.bytes)
      // `size` comes from the SAME buffer that was hashed, never from a stat taken elsewhere: two
      // fields of one entry describing two different instants is the defect, not the fix.
      entries.push({ name, size: info.bytes.length, digest: sha256(info.bytes) })
      continue
    }
    if (info.kind === 'unstable') { unstable = info.detail; break }
    rejected.push({ name, reason: info.kind, detail: info.code ?? info.nlink ?? null })
    diagnostics.push({
      code: info.kind === 'symlink'
        ? 'RAW-SOURCE-SYMLINK'
        : info.kind === 'hardlink'
          ? 'RAW-SOURCE-HARDLINK'
          : info.kind === 'unreadable' ? 'RAW-SOURCE-UNREADABLE' : 'RAW-SOURCE-IRREGULAR',
      name,
      detail: `${name} is a ${info.kind} where a regular, singly-linked file is required — a source that is a second name for something else is not evidence`
    })
  }

  // THE DIRECTORY IS RE-LISTED. A file created or removed while the loop ran would otherwise be
  // published as a complete snapshot of a set that never existed at any instant.
  if (hooks?.afterEntries) hooks.afterEntries()
  const second = listing()
  if (unstable === null && (second === null || second.join('\0') !== first.join('\0'))) {
    unstable = `${materialDir} changed while it was being read`
  }
  // Names matching is not the same as the directory being the same directory.
  if (unstable === null && !rootUnchanged(materialDir, trustedRoot, opened)) {
    unstable = `${materialDir} was replaced while its sources were being read`
  }
  if (unstable !== null) return fail('unstable', materialDir, 'RAW-SOURCE-UNSTABLE', unstable, { realRoot: opened.real })

  // ANY rejection makes the set unknown rather than partial. A tree digest over the files that
  // happened to be regular is a complete-looking answer about an incomplete set, and every consumer
  // reads a digest as "these are the source bytes".
  const state = rejected.length > 0
    ? (rejected.every(r => r.reason === 'unreadable') ? 'unreadable' : 'invalid')
    : (entries.length === 0 ? 'empty' : 'complete')
  const sealed = state === 'complete' || state === 'empty'
  const manifest = sealed ? manifestBytes(entries) : null
  return {
    state,
    ok: sealed,
    root: materialDir,
    realRoot: opened.real,
    entries,
    rejected,
    manifest,
    treeDigest: manifest === null ? null : sha256(manifest),
    diagnostics,
    // A COPY. Handing out the stored buffer would let one consumer mutate the snapshot every other
    // consumer is about to hash, which is the same "two answers" failure by a shorter route.
    bytesOf: name => {
      const b = bytesByName.get(name)
      return b === undefined ? null : Buffer.from(b)
    }
  }
}

// `name NUL sha256 LF` per entry, sorted — the spelling `verify.mjs` already uses for a directory
// artifact, so "how a tree hashes" has one shape in this runtime. NUL is the separator precisely
// because it cannot occur in a path, so no name can forge a row boundary.
export function manifestBytes (entries) {
  return Buffer.concat(entries.slice().sort((a, b) => bytewise(a.name, b.name)).map(e => Buffer.concat([
    Buffer.from(e.name, 'utf8'), Buffer.from([0]), Buffer.from(e.digest, 'latin1'), Buffer.from('\n', 'latin1')
  ])))
}

// Resolving a marker's `file=` address. Only a `complete` model answers: an address resolved out of
// a set that is missing, aliased or mid-write is an attribution to bytes nobody sealed.
export function resolveRawSource (model, address = null) {
  if (model?.state !== 'complete') {
    const code = model?.state === 'empty' ? 'RAW-SOURCE-ABSENT' : model?.diagnostics?.[0]?.code ?? 'RAW-SOURCE-UNREADABLE'
    return { ok: false, code, entry: null, detail: `the material's source set is '${model?.state ?? 'unknown'}', so no address can be resolved from it` }
  }
  if (address === null || address === '') {
    // No address is legal only when there is exactly one source: with several, silently choosing
    // one would attribute a quote to a file the writer never named.
    if (model.entries.length === 1) return { ok: true, code: null, entry: model.entries[0] }
    return { ok: false, code: 'RAW-SOURCE-AMBIGUOUS', entry: null, detail: `${model.entries.length} raw sources under ${model.root}; an address is required unless there is exactly one` }
  }
  // PATH ESCAPE, checked on the WRITTEN address rather than on a resolved one. Normalising first
  // and comparing after is how an escape becomes a prefix match on a sibling directory name.
  if (/^[/\\]/.test(address) || /^[A-Za-z]:/.test(address) || address.split(/[/\\]/).includes('..')) {
    return { ok: false, code: 'RAW-SOURCE-ESCAPE', entry: null, detail: `'${address}' leaves the material root` }
  }
  if (address.includes('/') || address.includes('\\')) {
    return { ok: false, code: 'RAW-SOURCE-NOT-FOUND', entry: null, detail: `'${address}' names a nested path; raw sources are regular files directly under the material root` }
  }
  const entry = model.entries.find(e => e.name === address)
  if (entry === undefined) return { ok: false, code: 'RAW-SOURCE-NOT-FOUND', entry: null, detail: `'${address}' is not a raw source under ${model.root}` }
  return { ok: true, code: null, entry }
}
