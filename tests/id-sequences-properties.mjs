// Combinatorial checks for the typed monotonic ID allocator (schema v3, slice 1, bundle A).
//
// The load-bearing property is NO REUSE: a deleted card's number must never come back, because an
// old document's `<!-- t:t042 -->` citation would silently point at a different fact. The allocator
// is the only thing standing between "max+1 scanning" (which reuses the highest deleted number)
// and that corruption, so these checks attack the counter file itself: its parse is fail-closed,
// its counters refuse the range where JS Numbers round (patch-discipline #11 — `parseInt` above
// 2^53 canonicalised m9007199254740993 to a DIFFERENT material, measured), and its serialization
// is byte-stable so three OSes and two write paths cannot produce two spellings of one state.
//
// READ-ONLY AND UNWIRED (bundle A). No production consumer imports the model yet; this file is the
// only thing executing it, which is why the wrapper case pins the exact totals.
import assert from 'node:assert/strict'
import {
  ID_SEQUENCES_FILE,
  NAMESPACES,
  allocate,
  checkAgainstObserved,
  formatId,
  parseIdSequences,
  serializeIdSequences
} from '../.weavedoc/bin/lib/id-sequences.mjs'

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
  check(r.next === null, 'a refused parse must not expose a usable counter object', input)
}
const VALID = '{\n  "version": 1,\n  "next": {\n    "conflict": 1,\n    "material": 33,\n    "truth": 275\n  }\n}\n'

// group 1 — a valid file parses, exposes every namespace, and round-trips to the same bytes.
{
  groups++
  const r = parseIdSequences(VALID)
  check(r.ok === true, 'the canonical valid file must parse', VALID)
  check(r.diagnostics.length === 0, 'a valid parse carries no diagnostics', r.diagnostics)
  check(r.next.truth === 275 && r.next.material === 33 && r.next.conflict === 1, 'parsed counters differ from the file', r.next)
  check(serializeIdSequences(r.next) === VALID, 'serialize(parse(x)) must be byte-identical for canonical input', serializeIdSequences(r.next))
  check(ID_SEQUENCES_FILE === '.weavedoc-state/id-sequences.json', 'the file path constant moved', ID_SEQUENCES_FILE)
  check(NAMESPACES.join(',') === 'conflict,material,truth', 'the namespace set is the contract — sorted, exactly three', NAMESPACES)
}

// group 2 — formatId: zero-padded to at least 3 digits (the template contract), longer ids keep
// every digit, and invalid input returns null instead of a plausible-looking id.
{
  groups++
  const grid = [['truth', 1, 't001'], ['truth', 42, 't042'], ['truth', 999, 't999'], ['truth', 1000, 't1000'], ['material', 7, 'm007'], ['conflict', 12, 'c012']]
  for (const [ns, n, want] of grid) check(formatId(ns, n) === want, `formatId(${ns},${n}) !== ${want}`, formatId(ns, n))
  for (const [ns, n] of [['truth', 0], ['truth', -3], ['truth', 1.5], ['truth, ', 1], ['locus', 1], ['truth', Number.MAX_SAFE_INTEGER + 2]]) {
    check(formatId(ns, n) === null, 'formatId must refuse invalid namespace/counter with null, never a plausible id', [ns, n])
  }
}

// group 3 — root shape refusals, each with a named code. A malformed counter file must never read
// as "empty, start from 1": that is precisely the reuse the file exists to prevent.
{
  groups++
  refused(parseIdSequences('not json'), 'IDSEQ-JSON', 'not json')
  refused(parseIdSequences('[]'), 'IDSEQ-SHAPE', '[]')
  refused(parseIdSequences('null'), 'IDSEQ-SHAPE', 'null')
  refused(parseIdSequences('{"next":{"conflict":1,"material":1,"truth":1}}'), 'IDSEQ-SHAPE', 'version missing')
  refused(parseIdSequences('{"version":2,"next":{"conflict":1,"material":1,"truth":1}}'), 'IDSEQ-SHAPE', 'version 2')
  refused(parseIdSequences('{"version":1}'), 'IDSEQ-SHAPE', 'next missing')
  refused(parseIdSequences('{"version":1,"next":[]}'), 'IDSEQ-SHAPE', 'next is an array')
  refused(parseIdSequences('{"version":1,"next":{"conflict":1,"material":1,"truth":1},"extra":0}'), 'IDSEQ-SHAPE', 'unknown root key')
}

// group 4 — namespace refusals: one missing, one unknown, and the two together. The namespace set
// is closed; "locus" was discarded by the 2026-08-12 rescope and must not be creatable by typo.
{
  groups++
  refused(parseIdSequences('{"version":1,"next":{"material":1,"truth":1}}'), 'IDSEQ-NAMESPACE', 'conflict missing')
  refused(parseIdSequences('{"version":1,"next":{"conflict":1,"material":1}}'), 'IDSEQ-NAMESPACE', 'truth missing')
  refused(parseIdSequences('{"version":1,"next":{"conflict":1,"material":1,"truth":1,"locus":1}}'), 'IDSEQ-NAMESPACE', 'locus is not a namespace')
  refused(parseIdSequences('{"version":1,"next":{"conflict":1,"truth":1,"locus":1}}'), 'IDSEQ-NAMESPACE', 'missing and unknown together')
}

// group 5 — counter refusals. The dangerous class is the SILENT one: `9007199254740993` parses to
// `…992` and `Number.isSafeInteger` then smiles at the rounded value, so the guard is on the TEXT
// (any 16+-digit run refuses the file) — over-strict above 10^15 by design and said out loud here.
{
  groups++
  refused(parseIdSequences('{"version":1,"next":{"conflict":"1","material":1,"truth":1}}'), 'IDSEQ-COUNTER', 'string counter')
  refused(parseIdSequences('{"version":1,"next":{"conflict":1.5,"material":1,"truth":1}}'), 'IDSEQ-COUNTER', 'float counter')
  refused(parseIdSequences('{"version":1,"next":{"conflict":0,"material":1,"truth":1}}'), 'IDSEQ-COUNTER', 'zero counter')
  refused(parseIdSequences('{"version":1,"next":{"conflict":-4,"material":1,"truth":1}}'), 'IDSEQ-COUNTER', 'negative counter')
  refused(parseIdSequences('{"version":1,"next":{"conflict":null,"material":1,"truth":1}}'), 'IDSEQ-COUNTER', 'null counter')
  refused(parseIdSequences('{"version":1,"next":{"conflict":9007199254740993,"material":1,"truth":1}}'), 'IDSEQ-COUNTER', 'counter above 2^53 (rounds silently in JSON.parse)')
  refused(parseIdSequences('{"version":1,"next":{"conflict":1000000000000000,"material":1,"truth":1}}'), 'IDSEQ-COUNTER', '16-digit counter (documented over-strictness)')
  const fine = parseIdSequences('{"version":1,"next":{"conflict":1,"material":1,"truth":999999999999999}}')
  check(fine.ok === true, 'a 15-digit counter is inside the exact range and must parse', fine.diagnostics)
}

// group 6 — allocate: bumps exactly one namespace, hands out the padded id, and never mutates its
// input (the caller persists the returned state; a mutated input is a second write path).
{
  groups++
  const base = parseIdSequences(VALID).next
  const snapshot = JSON.stringify(base)
  const a = allocate(base, 'truth')
  check(a.ok === true && a.id === 't275', 'allocate(truth) must hand out the current counter as the id', a)
  check(a.next.truth === 276 && a.next.material === 33 && a.next.conflict === 1, 'allocate must bump only its own namespace', a.next)
  check(JSON.stringify(base) === snapshot, 'allocate must not mutate its input', base)
  const b = allocate(a.next, 'truth')
  check(b.id === 't276', 'two sequential allocations must be strictly increasing', b)
  const edge = allocate({ conflict: 1, material: 1, truth: 999 }, 'truth')
  check(edge.id === 't999' && edge.next.truth === 1000 && formatId('truth', edge.next.truth) === 't1000', 'the 999→1000 transition must not lose padding or a number', edge)
  const bad = allocate(base, 'locus')
  check(bad.ok === false && bad.id === null, 'allocate must refuse an unknown namespace', bad)
}

// group 7 — serialization is canonical: scrambled input key order produces the same bytes, twice.
{
  groups++
  const scrambled = { truth: 275, conflict: 1, material: 33 }
  check(serializeIdSequences(scrambled) === VALID, 'serialize must not depend on input key order', serializeIdSequences(scrambled))
  check(serializeIdSequences(scrambled) === serializeIdSequences(scrambled), 'serialize must be deterministic call to call', '')
  check(serializeIdSequences(scrambled).endsWith('}\n'), 'the canonical form ends with a single LF', '')
}

// group 8 — checkAgainstObserved: `next ≤ observed max` is the tripwire that catches an allocator
// left behind by an out-of-band write. Equal is a violation too (the next grant would collide).
{
  groups++
  const next = { conflict: 5, material: 10, truth: 100 }
  check(checkAgainstObserved(next, { truth: 99 }).length === 0, 'next strictly above the observed max is healthy', '')
  const eq = checkAgainstObserved(next, { truth: 100 })
  check(eq.length === 1 && eq[0].code === 'IDSEQ-BEHIND', 'next equal to an observed id must trip (the next grant collides)', eq)
  const behind = checkAgainstObserved(next, { truth: 250, material: 3 })
  check(behind.length === 1 && behind[0].code === 'IDSEQ-BEHIND' && behind[0].detail.includes('truth'), 'only the lagging namespace trips', behind)
  const two = checkAgainstObserved(next, { truth: 250, material: 40 })
  check(two.length === 2, 'two lagging namespaces are two diagnostics, not one summary', two)
  check(checkAgainstObserved(next, {}).length === 0, 'an empty observation checks nothing and invents nothing', '')
}

// group 9 — the sequence property end to end: parse → allocate ×N → serialize → parse gives N
// distinct, strictly increasing, never-reused ids.
{
  groups++
  let state = parseIdSequences(serializeIdSequences({ conflict: 1, material: 1, truth: 1 })).next
  const seen = new Set()
  let prev = 0
  for (let i = 0; i < 25; i++) {
    const a = allocate(state, 'conflict')
    check(!seen.has(a.id), 'an id came back — reuse is the corruption this model exists to prevent', a.id)
    seen.add(a.id)
    const n = Number(a.id.slice(1))
    check(n > prev, 'ids must be strictly increasing', a.id)
    prev = n
    state = parseIdSequences(serializeIdSequences(a.next)).next
  }
  check(seen.size === 25, 'twenty-five allocations are twenty-five distinct ids', seen.size)
}

console.log(`id-sequences-properties: groups=${groups} cases=${cases}`)
