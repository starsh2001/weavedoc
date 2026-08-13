// The typed monotonic ID allocator (schema v3, slice 1): one counter per namespace, moving in one
// direction, so a deleted card's number can never be granted again.
//
// Why this exists at all: canonical-current DELETES truth cards (a retcon removes the old value),
// and "max+1 over the directory" reuses the highest deleted number the moment it was the highest —
// after which an old document's `<!-- t:t042 -->` points at a DIFFERENT fact and every byte-level
// check still smiles. The allocator is operational state, not history: it remembers nothing about
// what the ids meant, only that a number, once granted, is spent.
//
// FAIL-CLOSED, BOTH WAYS. A malformed counter file must never read as "empty, start from 1" —
// that IS the reuse this file prevents. And a counter beyond JS's exact-integer range must be
// refused at the TEXT, not after parsing: `9007199254740993` comes out of JSON.parse as `…992`,
// and `Number.isSafeInteger` then approves the rounded value (patch-discipline #11 — the same
// rounding canonicalised a material id onto a different material, measured). So any 16+-digit run
// refuses the whole file: over-strict above 10^15 by design, and said out loud rather than hidden.
//
// READ-ONLY AND UNWIRED (bundle A). No production consumer imports this yet; the properties file
// is the only thing executing it until bundle B2 wires the validate tripwires and the CLI.
export const ID_SEQUENCES_FILE = '.weavedoc-state/id-sequences.json'
// Closed and sorted. `locus` was discarded by the 2026-08-12 rescope; a namespace this list does
// not name must be a refusal, never a lazily-created counter.
export const NAMESPACES = ['conflict', 'material', 'truth']
const PREFIX = { conflict: 'c', material: 'm', truth: 't' }

const diag = (code, detail) => ({ code, detail })
const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const usableCounter = n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 1

export const parseIdSequences = text => {
  const refuse = (...diagnostics) => ({ ok: false, next: null, diagnostics })
  if (/[0-9]{16,}/.test(String(text))) {
    return refuse(diag('IDSEQ-COUNTER', 'a numeric token runs 16+ digits — above 10^15 JSON.parse rounds silently, so the file is refused rather than read approximately'))
  }
  let root
  try { root = JSON.parse(text) } catch (e) { return refuse(diag('IDSEQ-JSON', `not JSON: ${e.message}`)) }
  if (!isPlainObject(root)) return refuse(diag('IDSEQ-SHAPE', 'the root must be an object'))
  const keys = Object.keys(root).sort().join(',')
  if (keys !== 'next,version') return refuse(diag('IDSEQ-SHAPE', `root keys must be exactly version+next (got: ${keys || 'none'})`))
  if (root.version !== 1) return refuse(diag('IDSEQ-SHAPE', `version must be 1 (got ${JSON.stringify(root.version)})`))
  if (!isPlainObject(root.next)) return refuse(diag('IDSEQ-SHAPE', 'next must be an object holding one counter per namespace'))
  const ns = Object.keys(root.next).sort().join(',')
  if (ns !== NAMESPACES.join(',')) return refuse(diag('IDSEQ-NAMESPACE', `namespaces must be exactly ${NAMESPACES.join('|')} (got: ${ns || 'none'})`))
  const diagnostics = []
  for (const name of NAMESPACES) {
    const n = root.next[name]
    if (!usableCounter(n)) diagnostics.push(diag('IDSEQ-COUNTER', `${name}: a counter is a positive exact integer (got ${JSON.stringify(n)})`))
  }
  if (diagnostics.length > 0) return { ok: false, next: null, diagnostics }
  return { ok: true, next: { conflict: root.next.conflict, material: root.next.material, truth: root.next.truth }, diagnostics: [] }
}

// Zero-padded to at least three digits — the template contract (`t001, t042, t1000`). Invalid
// input returns null, never a plausible-looking id: a wrong id that parses is worse than none.
export const formatId = (ns, n) => {
  if (PREFIX[ns] === undefined || !usableCounter(n)) return null
  return PREFIX[ns] + String(n).padStart(3, '0')
}

// Pure: the caller persists the returned state. Mutating the input would be a second write path,
// and two write paths to one counter is how a number gets granted twice.
export const allocate = (next, ns) => {
  if (PREFIX[ns] === undefined) return { ok: false, id: null, next: null, diagnostics: [diag('IDSEQ-NAMESPACE', `unknown namespace '${String(ns)}'`)] }
  const id = formatId(ns, next?.[ns])
  if (id === null) return { ok: false, id: null, next: null, diagnostics: [diag('IDSEQ-COUNTER', `${ns}: counter unusable (${JSON.stringify(next?.[ns])})`)] }
  return { ok: true, id, next: { conflict: next.conflict, material: next.material, truth: next.truth, [ns]: next[ns] + 1 }, diagnostics: [] }
}

// One byte spelling per state: fixed key order, two-space indent, single trailing LF. Input key
// order must not leak — two OSes writing two spellings of one counter file is drift the digest
// layer would then dutifully report as change.
export const serializeIdSequences = next =>
  JSON.stringify({ version: 1, next: { conflict: next.conflict, material: next.material, truth: next.truth } }, null, 2) + '\n'

// The tripwire's pure half: `next ≤ observed max` means the next grant collides with an id that
// already exists — an allocator left behind by an out-of-band write. The caller computes the
// observed maxima from the mine (cards, index, citations); this model never walks a directory.
export const checkAgainstObserved = (next, observed) => {
  const out = []
  for (const ns of NAMESPACES) {
    if (!isPlainObject(observed) || !(ns in observed)) continue
    const max = observed[ns]
    if (usableCounter(max) && next[ns] <= max) {
      out.push(diag('IDSEQ-BEHIND', `${ns}: next ${next[ns]} ≤ observed max ${max} — the next grant would collide with an existing id`))
    }
  }
  return out
}
