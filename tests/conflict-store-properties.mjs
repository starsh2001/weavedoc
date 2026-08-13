// Combinatorial checks for the temporary conflict store (schema v3, slice 1, bundle A).
//
// The store holds OPEN conflicts only — resolution is deletion, and no archive/accepted/suppression
// section may ever grow here (the 2026-08-12 rescope: the machine keeps the ledger, the human keeps
// the decision). What the machine owes this file is hygiene, and hygiene is what these checks
// attack: fail-closed parse, a closed key vocabulary at every level (a typo'd key silently dropped
// is how a candidate loses its quote — the quote-marker model's lesson), one spelling per id (the
// m1↔m001 canonicalisation incident made a material its own second provider), and byte-stable
// canonical serialization so two OSes cannot write two spellings of one store.
//
// READ-ONLY AND UNWIRED (bundle A). No production consumer imports the model yet; this file is the
// only thing executing it, which is why the wrapper case pins the exact totals.
import assert from 'node:assert/strict'
import {
  CONFLICTS_FILE,
  addConflict,
  checkAgainstMine,
  emptyConflicts,
  maxConflictId,
  parseConflicts,
  removeConflict,
  serializeConflicts
} from '../.weavedoc/bin/lib/conflict-store.mjs'

let cases = 0
let groups = 0
const check = (condition, message, input = '') => {
  cases++
  assert.ok(condition, `${message}\nINPUT=${JSON.stringify(input)}`)
}
const codesOf = r => (r.diagnostics || []).map(d => d.code)
const refused = (r, code, input) => {
  check(r.ok === false, `expected refusal (${code}) but parse said ok`, input)
  check(codesOf(r).includes(code), `refusal is missing code ${code} (got ${codesOf(r).join(',')})`, input)
  check(r.open === null, 'a refused parse must not expose usable entries', input)
}
const entry = (over = {}, cand = {}) => ({
  id: 'c001',
  targets: ['t010'],
  candidates: [{ claim: '눈은 초록이다', source: 'm002', location: '3권 2장', quote: '그 눈은 초록빛이었다', tags: ['외모'], note: '3권 각성 이후', ...cand }],
  created: '2026-08-13',
  note: '파랑(t010) 대 초록',
  ...over
})
const storeOf = (...entries) => ({ version: 1, open: entries })
const parse = obj => parseConflicts(JSON.stringify(obj))

// group 1 — the empty store: the shape fresh init writes, parses clean, round-trips byte-stable.
{
  groups++
  const empty = emptyConflicts()
  const bytes = serializeConflicts(empty)
  const r = parseConflicts(bytes)
  check(r.ok === true && r.open.length === 0, 'the empty store must parse to zero open entries', bytes)
  check(serializeConflicts(r) === bytes, 'empty-store serialization must round-trip byte-identical', serializeConflicts(r))
  check(bytes.endsWith('\n'), 'the canonical form ends with LF', bytes)
  check(CONFLICTS_FILE === '.weavedoc-state/conflicts.json', 'the file path constant moved', CONFLICTS_FILE)
  check(maxConflictId(empty) === 0, 'an empty store has no highest id', maxConflictId(empty))
}

// group 2 — a full valid entry (every optional present) round-trips, and entries serialize sorted
// by numeric id whatever order they arrived in: one store state, one byte spelling.
{
  groups++
  const r = parse(storeOf(entry()))
  check(r.ok === true && r.diagnostics.length === 0, 'a fully-populated valid entry must parse clean', r.diagnostics)
  check(r.open[0].candidates[0].quote === '그 눈은 초록빛이었다', 'the candidate payload must survive parsing intact', r.open[0])
  const scrambled = parse(storeOf(entry({ id: 'c010' }), entry({ id: 'c002' })))
  const bytes = serializeConflicts(scrambled)
  check(bytes.indexOf('"c002"') < bytes.indexOf('"c010"'), 'serialization must sort entries by numeric id', bytes)
  check(parseConflicts(bytes).ok === true, 'the sorted form must itself parse', bytes)
  check(serializeConflicts(parseConflicts(bytes)) === bytes, 'serialize(parse(x)) must be byte-identical', '')
  const minimal = parse(storeOf({ id: 'c001', targets: [], candidates: [{ claim: '주장', source: 'm001' }], created: '2026-01-01' }))
  check(minimal.ok === true, 'optionals are optional: an entry with none of them must parse', minimal.diagnostics)
  check(serializeConflicts(minimal).includes('"targets": []'), 'an empty target set is a legal, serialized state (§2.2 ① — undecided, not resolved)', serializeConflicts(minimal))
}

// group 3 — root refusals. A malformed store must never read as "no conflicts": that silence would
// unblock shipping over the exact thing the file exists to block.
{
  groups++
  refused(parseConflicts('not json'), 'CONF-JSON', 'not json')
  refused(parseConflicts('[]'), 'CONF-SHAPE', 'root is an array')
  refused(parseConflicts('{"open":[]}'), 'CONF-SHAPE', 'version missing')
  refused(parseConflicts('{"version":2,"open":[]}'), 'CONF-SHAPE', 'version 2')
  refused(parseConflicts('{"version":1}'), 'CONF-SHAPE', 'open missing')
  refused(parseConflicts('{"version":1,"open":{}}'), 'CONF-SHAPE', 'open is not an array')
  refused(parseConflicts('{"version":1,"open":[],"archive":[]}'), 'CONF-KEY-UNKNOWN', 'an archive section is the history this store refuses to grow')
  refused(parseConflicts('{"version":1,"open":[],"accepted":[]}'), 'CONF-KEY-UNKNOWN', 'an accepted section likewise')
}

// group 4 — entry refusals: closed keys, one id spelling, unique ids, typed targets, dated created.
{
  groups++
  refused(parse(storeOf(entry({ extra: 1 }))), 'CONF-KEY-UNKNOWN', 'unknown entry key')
  refused(parse(storeOf(entry({ id: 'c1' }))), 'CONF-ID', 'unpadded id — one spelling only')
  refused(parse(storeOf(entry({ id: 'c01' }))), 'CONF-ID', 'two-digit pad')
  refused(parse(storeOf(entry({ id: '001' }))), 'CONF-ID', 'missing prefix')
  refused(parse(storeOf(entry({ id: 't001' }))), 'CONF-ID', 'wrong namespace prefix')
  check(parse(storeOf(entry({ id: 'c1000' }))).ok === true, 'four digits and up are legal (pad is a minimum)', 'c1000')
  refused(parse(storeOf(entry(), entry())), 'CONF-DUP', 'duplicate id across entries')
  refused(parse(storeOf(entry({ targets: 't010' }))), 'CONF-TARGET', 'targets must be an array')
  refused(parse(storeOf(entry({ targets: ['m001'] }))), 'CONF-TARGET', 'a target is a truth id')
  refused(parse(storeOf(entry({ targets: ['t1'] }))), 'CONF-TARGET', 'unpadded target')
  refused(parse(storeOf(entry({ targets: ['t010', 't010'] }))), 'CONF-TARGET', 'duplicate target within an entry')
  refused(parse(storeOf(entry({ created: '13-08-2026' }))), 'CONF-CREATED', 'created must be YYYY-MM-DD (form only — the machine does not judge calendars)')
  refused(parse(storeOf(entry({ created: '' }))), 'CONF-CREATED', 'created empty')
  refused(parse(storeOf(entry({ note: 7 }))), 'CONF-NOTE', 'note must be a string when present')
  refused(parse(storeOf({ targets: [], candidates: [{ claim: 'x', source: 'm001' }], created: '2026-01-01' })), 'CONF-ID', 'id missing entirely')
}

// group 5 — candidate refusals: at least one, closed keys, a nonempty claim, a typed source, typed
// optionals. A candidate is the LOSSLESS envelope of a claim whose card was never created — a
// silently dropped field here is a claim the user can no longer adopt.
{
  groups++
  refused(parse(storeOf(entry({ candidates: [] }))), 'CONF-CANDIDATE', 'zero candidates is not a conflict')
  refused(parse(storeOf(entry({ candidates: 'x' }))), 'CONF-CANDIDATE', 'candidates must be an array')
  refused(parse(storeOf(entry({}, { extra: 1 }))), 'CONF-KEY-UNKNOWN', 'unknown candidate key')
  refused(parse(storeOf(entry({ candidates: [{ source: 'm001' }] }))), 'CONF-CANDIDATE', 'claim missing')
  refused(parse(storeOf(entry({}, { claim: '' }))), 'CONF-CANDIDATE', 'claim empty')
  refused(parse(storeOf(entry({}, { claim: 42 }))), 'CONF-CANDIDATE', 'claim not a string')
  refused(parse(storeOf(entry({ candidates: [{ claim: 'x' }] }))), 'CONF-CANDIDATE', 'source missing')
  refused(parse(storeOf(entry({}, { source: 't001' }))), 'CONF-CANDIDATE', 'source is a material id')
  refused(parse(storeOf(entry({}, { source: 'm1' }))), 'CONF-CANDIDATE', 'unpadded source')
  refused(parse(storeOf(entry({}, { tags: 'a' }))), 'CONF-CANDIDATE', 'tags must be an array')
  refused(parse(storeOf(entry({}, { tags: [''] }))), 'CONF-CANDIDATE', 'an empty tag is not a tag')
  refused(parse(storeOf(entry({}, { location: 3 }))), 'CONF-CANDIDATE', 'location must be a string when present')
  refused(parse(storeOf(entry({}, { quote: 3 }))), 'CONF-CANDIDATE', 'quote must be a string when present')
  refused(parse(storeOf(entry({}, { note: 3 }))), 'CONF-CANDIDATE', 'candidate note must be a string when present')
}

// group 6 — addConflict validates like the parser, appends, refuses duplicates, mutates nothing.
{
  groups++
  const base = emptyConflicts()
  const snapshot = JSON.stringify(base)
  const a = addConflict(base, entry())
  check(a.ok === true && a.store.open.length === 1, 'a valid entry must be addable to an empty store', a)
  check(JSON.stringify(base) === snapshot, 'addConflict must not mutate its input', base)
  const dup = addConflict(a.store, entry())
  check(dup.ok === false && codesOf(dup).includes('CONF-DUP'), 'adding an existing id must refuse — a cNNN is never reused', dup)
  const bad = addConflict(a.store, entry({ id: 'c2' }))
  check(bad.ok === false && codesOf(bad).includes('CONF-ID'), 'addConflict must run the same validator as parse', bad)
  check(a.store.open.length === 1, 'a refused add must leave the store untouched', a.store)
}

// group 7 — removeConflict: resolution IS deletion; removing a missing id is an error, not a no-op
// (a resolve that "removed" nothing would report success over an entry that still blocks shipping).
{
  groups++
  const s = addConflict(addConflict(emptyConflicts(), entry()).store, entry({ id: 'c002' })).store
  const snapshot = JSON.stringify(s)
  const r = removeConflict(s, 'c001')
  check(r.ok === true && r.store.open.length === 1 && r.store.open[0].id === 'c002', 'remove must delete exactly the named entry', r.store)
  check(JSON.stringify(s) === snapshot, 'removeConflict must not mutate its input', s)
  const miss = removeConflict(r.store, 'c001')
  check(miss.ok === false && codesOf(miss).includes('CONF-MISSING'), 'removing an absent id must refuse loudly', miss)
  check(maxConflictId(s) === 2 && maxConflictId(r.store) === 2, 'the highest id is computed over the store, for the allocator cross-check', [maxConflictId(s), maxConflictId(r.store)])
}

// group 8 — checkAgainstMine: dangling references are hygiene diagnostics, computed against the id
// sets the CALLER read from the mine (the model never walks a directory — one reader, one answer).
{
  groups++
  const s = storeOf(entry(), entry({ id: 'c002', targets: [], candidates: [{ claim: 'x', source: 'm009' }], created: '2026-01-01', note: undefined }))
  delete s.open[1].note
  const truths = new Set(['t010'])
  const materials = new Set(['m002'])
  const d = checkAgainstMine(parse(s).open, truths, materials)
  check(d.length === 1 && d[0].code === 'CONF-SOURCE-DANGLING' && d[0].detail.includes('m009'), 'only the dangling source trips', d)
  const d2 = checkAgainstMine(parse(s).open, new Set(), materials)
  check(d2.some(x => x.code === 'CONF-TARGET-DANGLING' && x.detail.includes('t010')), 'a target no card holds is dangling', d2)
  check(d2.some(x => x.code === 'CONF-SOURCE-DANGLING'), 'both kinds surface in one pass', d2)
  const clean = checkAgainstMine(parse(storeOf(entry({ targets: [] }))).open, new Set(), new Set(['m002']))
  check(clean.length === 0, 'targets=[] dangles nothing — undecided is a legal state, not a broken reference', clean)
}

// group 9 — canonical serialization: scrambled key order in, canonical key order out; absent
// optionals are omitted, not serialized as null (a null is a second spelling of absence).
{
  groups++
  const scrambledEntry = { note: 'n', created: '2026-08-13', candidates: [{ tags: ['a'], source: 'm002', claim: 'c', quote: 'q' }], targets: ['t010'], id: 'c001' }
  const bytes = serializeConflicts(parse(storeOf(scrambledEntry)))
  const canonical = serializeConflicts(parse(storeOf({ id: 'c001', targets: ['t010'], candidates: [{ claim: 'c', source: 'm002', quote: 'q', tags: ['a'] }], created: '2026-08-13', note: 'n' })))
  check(bytes === canonical, 'input key order must not leak into the bytes', bytes)
  check(bytes.indexOf('"id"') < bytes.indexOf('"targets"') && bytes.indexOf('"targets"') < bytes.indexOf('"candidates"'), 'entry keys serialize in the contract order', bytes)
  check(!bytes.includes('null'), 'absent optionals are omitted, never null', bytes)
  const noLoc = parse(storeOf(entry()))
  check(serializeConflicts(noLoc) === serializeConflicts(parseConflicts(serializeConflicts(noLoc))), 'serialize∘parse must be a fixed point', '')
}

console.log(`conflict-store-properties: groups=${groups} cases=${cases}`)
