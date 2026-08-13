// The temporary conflict store (schema v3, slice 1): open conflicts only, resolution is deletion.
//
// The 2026-08-12 rescope fixed the division of labour this file lives under: detecting a conflict
// is the AI's judgment (map), deciding it is the human's, and the machine's whole share is the
// ledger — keep the file well-formed, keep every reference typed, and block shipping while any
// entry is open. Accordingly there is no archive, no accepted section, no winner field, and no
// suppression list here, and the parser REFUSES those keys rather than ignoring them: history
// growing back as an "extra" key is how discarded machinery returns.
//
// An entry is one undecided disagreement. `targets` are the canonical cards it covers (empty is
// legal — §2.2 ①: nobody has decided yet, which blocks shipping and is not "resolved to nothing").
// A candidate is the LOSSLESS envelope of a claim whose card was never created: claim + typed
// source + whatever grounding it carried. A silently dropped candidate field is a claim the user
// can no longer adopt, so the key vocabulary is closed at every level (the quote-marker model's
// lesson: everything unrecognised is an ERROR, never an ignored extra).
//
// ID SPELLINGS ARE EXACT: `^[cmt][0-9]{3,}$`, one spelling per number. The m1↔m001 incident made a
// material its own second provider by canonicalising two spellings together; this store refuses
// the second spelling at the door instead.
//
// READ-ONLY AND UNWIRED (bundle A). No production consumer imports this yet; the properties file
// is the only thing executing it until bundle B2 wires validate, consecrate and the CLI.
export const CONFLICTS_FILE = '.weavedoc-state/conflicts.json'

const C_ID = /^c[0-9]{3,}$/
const T_ID = /^t[0-9]{3,}$/
const M_ID = /^m[0-9]{3,}$/
const CREATED = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/ // form only — the machine does not judge calendars
const ENTRY_KEYS = new Set(['id', 'targets', 'candidates', 'created', 'note'])
const CANDIDATE_KEYS = new Set(['claim', 'source', 'location', 'quote', 'tags', 'note'])

const diag = (code, detail) => ({ code, detail })
const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const nonemptyString = v => typeof v === 'string' && v.length > 0
const stringIfPresent = v => v === undefined || typeof v === 'string'

export const emptyConflicts = () => ({ version: 1, open: [] })

const validateCandidate = (cand, where, out) => {
  if (!isPlainObject(cand)) { out.push(diag('CONF-CANDIDATE', `${where}: a candidate must be an object`)); return }
  for (const k of Object.keys(cand)) {
    if (!CANDIDATE_KEYS.has(k)) out.push(diag('CONF-KEY-UNKNOWN', `${where}: unknown candidate key '${k}' — the vocabulary is closed so a typo cannot silently drop a field`))
  }
  if (!nonemptyString(cand.claim)) out.push(diag('CONF-CANDIDATE', `${where}: claim must be a nonempty string (got ${JSON.stringify(cand.claim)})`))
  if (typeof cand.source !== 'string' || !M_ID.test(cand.source)) out.push(diag('CONF-CANDIDATE', `${where}: source must be a material id mNNN (got ${JSON.stringify(cand.source)})`))
  if (!stringIfPresent(cand.location)) out.push(diag('CONF-CANDIDATE', `${where}: location must be a string when present`))
  if (!stringIfPresent(cand.quote)) out.push(diag('CONF-CANDIDATE', `${where}: quote must be a string when present`))
  if (!stringIfPresent(cand.note)) out.push(diag('CONF-CANDIDATE', `${where}: note must be a string when present`))
  if (cand.tags !== undefined) {
    if (!Array.isArray(cand.tags) || cand.tags.some(t => !nonemptyString(t))) {
      out.push(diag('CONF-CANDIDATE', `${where}: tags must be an array of nonempty strings`))
    }
  }
}

const validateEntry = (entry, index, out) => {
  const where = `open[${index}]`
  if (!isPlainObject(entry)) { out.push(diag('CONF-SHAPE', `${where}: an entry must be an object`)); return }
  if (typeof entry.id !== 'string' || !C_ID.test(entry.id)) {
    out.push(diag('CONF-ID', `${where}: id must be cNNN, zero-padded to at least three digits, one spelling per number (got ${JSON.stringify(entry.id)})`))
  }
  const label = typeof entry.id === 'string' ? entry.id : where
  for (const k of Object.keys(entry)) {
    if (!ENTRY_KEYS.has(k)) out.push(diag('CONF-KEY-UNKNOWN', `${label}: unknown entry key '${k}'`))
  }
  if (!Array.isArray(entry.targets)) {
    out.push(diag('CONF-TARGET', `${label}: targets must be an array of truth ids (empty = undecided, which is legal and blocks shipping)`))
  } else {
    const seen = new Set()
    for (const t of entry.targets) {
      if (typeof t !== 'string' || !T_ID.test(t)) out.push(diag('CONF-TARGET', `${label}: a target must be a truth id tNNN (got ${JSON.stringify(t)})`))
      else if (seen.has(t)) out.push(diag('CONF-TARGET', `${label}: duplicate target ${t}`))
      else seen.add(t)
    }
  }
  if (!Array.isArray(entry.candidates) || entry.candidates.length === 0) {
    out.push(diag('CONF-CANDIDATE', `${label}: candidates must be a nonempty array — zero candidates is not a conflict`))
  } else {
    entry.candidates.forEach((c, i) => validateCandidate(c, `${label}.candidates[${i}]`, out))
  }
  if (typeof entry.created !== 'string' || !CREATED.test(entry.created)) {
    out.push(diag('CONF-CREATED', `${label}: created must be YYYY-MM-DD (got ${JSON.stringify(entry.created)})`))
  }
  if (!stringIfPresent(entry.note)) out.push(diag('CONF-NOTE', `${label}: note must be a string when present`))
}

const normalizeCandidate = c => {
  const out = { claim: c.claim, source: c.source }
  if (c.location !== undefined) out.location = c.location
  if (c.quote !== undefined) out.quote = c.quote
  if (c.tags !== undefined) out.tags = [...c.tags]
  if (c.note !== undefined) out.note = c.note
  return out
}
const normalizeEntry = e => {
  const out = { id: e.id, targets: [...e.targets], candidates: e.candidates.map(normalizeCandidate), created: e.created }
  if (e.note !== undefined) out.note = e.note
  return out
}

export const parseConflicts = text => {
  const refuse = diagnostics => ({ ok: false, open: null, diagnostics })
  let root
  try { root = JSON.parse(text) } catch (e) { return refuse([diag('CONF-JSON', `not JSON: ${e.message}`)]) }
  if (!isPlainObject(root)) return refuse([diag('CONF-SHAPE', 'the root must be an object')])
  if (root.version !== 1) return refuse([diag('CONF-SHAPE', `version must be 1 (got ${JSON.stringify(root.version)})`)])
  if (!Array.isArray(root.open)) return refuse([diag('CONF-SHAPE', 'open must be an array — a store that cannot list its entries must not read as "no conflicts"')])
  const out = []
  for (const k of Object.keys(root)) {
    if (k !== 'version' && k !== 'open') {
      out.push(diag('CONF-KEY-UNKNOWN', `unknown root key '${k}' — this store holds open entries only; an archive/accepted section is the history it refuses to grow`))
    }
  }
  root.open.forEach((e, i) => validateEntry(e, i, out))
  const ids = root.open.filter(e => isPlainObject(e) && typeof e.id === 'string').map(e => e.id)
  const seen = new Set()
  for (const id of ids) {
    if (seen.has(id)) out.push(diag('CONF-DUP', `duplicate conflict id ${id} — a cNNN names exactly one disagreement`))
    seen.add(id)
  }
  if (out.length > 0) return refuse(out)
  return { ok: true, open: root.open.map(normalizeEntry), diagnostics: [] }
}

// One byte spelling per store state: entries sorted by numeric id, keys in contract order, absent
// optionals omitted (a serialized `null` would be a second spelling of absence), single LF end.
export const serializeConflicts = store => {
  const open = [...(store.open ?? [])].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))
  return JSON.stringify({ version: 1, open: open.map(normalizeEntry) }, null, 2) + '\n'
}

export const addConflict = (store, entry) => {
  const out = []
  validateEntry(entry, store.open.length, out)
  if (out.length === 0 && store.open.some(e => e.id === entry.id)) {
    out.push(diag('CONF-DUP', `conflict id ${entry.id} already exists — a cNNN is never reused, even for a related disagreement`))
  }
  if (out.length > 0) return { ok: false, store, diagnostics: out }
  return { ok: true, store: { version: 1, open: [...store.open.map(normalizeEntry), normalizeEntry(entry)] }, diagnostics: [] }
}

// Resolution IS deletion — and deleting nothing is an error, not a no-op: a resolve that "removed"
// an absent id would report success over an entry that still blocks shipping.
export const removeConflict = (store, id) => {
  const idx = store.open.findIndex(e => e.id === id)
  if (idx === -1) return { ok: false, store, diagnostics: [diag('CONF-MISSING', `no open conflict ${String(id)} — nothing was removed`)] }
  return { ok: true, store: { version: 1, open: store.open.filter((_, i) => i !== idx).map(normalizeEntry) }, diagnostics: [] }
}

export const maxConflictId = store => (store.open ?? []).reduce((m, e) => Math.max(m, Number(e.id.slice(1))), 0)

// Hygiene against the mine the CALLER read: dangling references are diagnostics, not repairs. The
// model never walks a directory — one reader, one answer (the raw-source model's contract).
export const checkAgainstMine = (open, truthIds, materialIds) => {
  const out = []
  for (const e of open ?? []) {
    for (const t of e.targets) {
      if (!truthIds.has(t)) out.push(diag('CONF-TARGET-DANGLING', `${e.id}: target ${t} resolves to no truth card — the entry refers to something the mine no longer holds`))
    }
    e.candidates.forEach((c, i) => {
      if (!materialIds.has(c.source)) out.push(diag('CONF-SOURCE-DANGLING', `${e.id}.candidates[${i}]: source ${c.source} resolves to no material`))
    })
  }
  return out
}
