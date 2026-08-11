// The one reading of a material's raw sources: what they are, what they hash to, and what is not
// allowed to be one.
//
// Everything downstream that has to say "the source bytes changed" — conflict envelopes, support
// projections, confirmation projections, the source→converted seal — reads this and does not walk
// the directory again. A second walk is a second answer about which bytes were verified, and that
// answer is the whole warranty.
//
// READ-ONLY AND UNWIRED (Phase 1). No production consumer imports this yet.
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync } from 'node:fs'

// `source.<something>`, directly in the material directory. NOT a `source/` directory, not a nested
// tree: today's layout is flat (`materials/mNNN/source.md`) and inventing a nesting rule here would
// be a contract nobody asked for. `source.` with nothing after it is not a source either.
const RAW_SOURCE_NAME = /^source\.[^.\\/]/

const sha256 = buf => createHash('sha256').update(buf).digest('hex')
// BYTE ORDER, not JS string order. They agree across the whole BMP and disagree above it, where a
// `.sort()` compares UTF-16 surrogate pairs — so a material with an astral character in a filename
// would manifest in a different order depending on nothing the user can see. `mine.mjs` pinned this
// for enumeration; the same rule decides the manifest, because the manifest IS the order.
// (`verify.mjs`'s artifactDigest still sorts the other way for draft/final trees. Different
// population, never compared with this one — noted here so the difference is deliberate, not a
// second convention someone copies by accident.)
const bytewise = (a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))

// Why lstat and never stat: a symlink is rejected, and `stat` would report the TARGET's type, so a
// link pointing at a regular file would pass as one. The distinction is the point — a source that
// can be re-aimed without changing any byte inside the mine is not evidence.
function classify (dir, name) {
  let st
  try { st = lstatSync(`${dir}/${name}`) } catch (e) { return { kind: 'unreadable', code: e.code ?? 'EUNKNOWN' } }
  if (st.isSymbolicLink()) return { kind: 'symlink' }
  if (st.isDirectory()) return { kind: 'directory' }
  if (!st.isFile()) return { kind: 'irregular' }
  return { kind: 'file', size: st.size }
}

export function readRawSources (materialDir) {
  const entries = []
  const rejected = []
  const diagnostics = []
  let names
  try {
    names = readdirSync(materialDir)
  } catch (e) {
    // UNREADABLE IS NOT EMPTY (plan section 5.3). A material whose directory cannot be listed has an
    // unknown source set, and returning a clean empty manifest would let a seal be computed over
    // "no sources" and reported as verified.
    return {
      readable: false,
      root: materialDir,
      entries: [],
      rejected: [],
      manifest: null,
      treeDigest: null,
      diagnostics: [{ code: 'RAW-SOURCE-UNREADABLE', detail: `${materialDir} cannot be listed (${e.code ?? 'EUNKNOWN'})` }]
    }
  }

  for (const name of names.slice().sort(bytewise)) {
    if (!RAW_SOURCE_NAME.test(name)) continue
    const info = classify(materialDir, name)
    if (info.kind === 'file') {
      let bytes
      try {
        bytes = readFileSync(`${materialDir}/${name}`)
      } catch (e) {
        rejected.push({ name, reason: 'unreadable', detail: e.code ?? 'EUNKNOWN' })
        diagnostics.push({ code: 'RAW-SOURCE-UNREADABLE', name, detail: `${name} matched the source name but could not be read (${e.code ?? 'EUNKNOWN'})` })
        continue
      }
      entries.push({ name, size: info.size, digest: sha256(bytes) })
      continue
    }
    rejected.push({ name, reason: info.kind, detail: info.code ?? null })
    diagnostics.push({
      code: info.kind === 'symlink' ? 'RAW-SOURCE-SYMLINK' : info.kind === 'unreadable' ? 'RAW-SOURCE-UNREADABLE' : 'RAW-SOURCE-IRREGULAR',
      name,
      detail: `${name} is a ${info.kind} where a regular file is required — a source that is not bytes in this mine is not evidence`
    })
  }

  // ANY rejection makes the manifest unknown rather than partial. A tree digest computed over the
  // files that happened to be regular would be a complete-looking answer about an incomplete set,
  // and every consumer of this model treats a digest as "these are the source bytes".
  const complete = rejected.length === 0
  const manifest = complete ? manifestBytes(entries) : null
  return {
    readable: true,
    root: materialDir,
    entries,
    rejected,
    manifest,
    treeDigest: manifest === null ? null : sha256(manifest),
    diagnostics
  }
}

// `path\0sha256\n` per entry, sorted — the spelling `verify.mjs` already uses for a directory
// artifact, so "how a tree hashes" has one shape in this runtime. NUL is the separator precisely
// because it cannot occur in a path, so no name can forge a row boundary.
export function manifestBytes (entries) {
  return Buffer.concat(entries.slice().sort((a, b) => bytewise(a.name, b.name)).map(e => Buffer.concat([
    Buffer.from(e.name, 'utf8'), Buffer.from([0]), Buffer.from(e.digest, 'latin1'), Buffer.from('\n', 'latin1')
  ])))
}

// Resolving a marker's `file=` address. Separate from enumeration because the failure modes are
// different: enumeration asks what IS there, this asks whether a WRITTEN address is allowed to name
// it. An address that escapes the material root, names a non-source, or lands on anything the walk
// already rejected has no answer here — it does not fall back to "the only source".
export function resolveRawSource (model, address = null) {
  if (!model.readable) return { ok: false, code: 'RAW-SOURCE-UNREADABLE', entry: null }
  if (address === null || address === '') {
    // No address is legal only when there is exactly one source: with several, silently choosing
    // one would attribute a quote to a file the writer never named.
    if (model.entries.length === 1) return { ok: true, code: null, entry: model.entries[0] }
    return {
      ok: false,
      code: model.entries.length === 0 ? 'RAW-SOURCE-ABSENT' : 'RAW-SOURCE-AMBIGUOUS',
      entry: null,
      detail: `${model.entries.length} raw sources under ${model.root}; an address is required unless there is exactly one`
    }
  }
  // PATH ESCAPE, checked on the WRITTEN address rather than on a resolved one. `..` and absolute or
  // drive-qualified forms are refused outright instead of being normalised — normalising first and
  // comparing after is how an escape becomes a prefix match on a sibling directory name.
  if (/^[/\\]/.test(address) || /^[A-Za-z]:/.test(address) || address.split(/[/\\]/).includes('..')) {
    return { ok: false, code: 'RAW-SOURCE-ESCAPE', entry: null, detail: `'${address}' leaves the material root` }
  }
  if (address.includes('/') || address.includes('\\')) {
    return { ok: false, code: 'RAW-SOURCE-NOT-FOUND', entry: null, detail: `'${address}' names a nested path; raw sources are regular files directly under the material root` }
  }
  const rejectedHit = model.rejected.find(r => r.name === address)
  if (rejectedHit !== undefined) {
    return { ok: false, code: rejectedHit.reason === 'symlink' ? 'RAW-SOURCE-SYMLINK' : 'RAW-SOURCE-IRREGULAR', entry: null, detail: `'${address}' is a ${rejectedHit.reason}` }
  }
  const entry = model.entries.find(e => e.name === address)
  if (entry === undefined) return { ok: false, code: 'RAW-SOURCE-NOT-FOUND', entry: null, detail: `'${address}' is not a raw source under ${model.root}` }
  return { ok: true, code: null, entry }
}
