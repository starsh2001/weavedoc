// Combinatorial checks for the versioned artifact-role contract (schema v3, Phase 1).
//
// The load-bearing property is EQUIVALENCE, not novelty: for the shipped schema the v2 adapter must
// produce the same tokens the production consumers already compute for themselves. Until that holds
// this module is a second answer, and the point of it is to be the only one.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ADAPTER,
  ARTIFACT_FLOOR,
  ARTIFACT_MAX,
  CONTRACT_FILE,
  SUPPORTED_ARTIFACT_VERSIONS,
  V1_BRIDGE,
  contractFileFor,
  loadArtifactContracts,
  resolveArtifactVersion
} from '../.weavedoc/bin/lib/artifact-contracts.mjs'
import { loadSchema } from '../.weavedoc/bin/lib/read.mjs'
import { verifiedUnitsContract } from '../.weavedoc/bin/lib/verified-units.mjs'
import { gapRegisterContract } from '../.weavedoc/bin/lib/gaps-register.mjs'

let cases = 0
let groups = 0
const check = (condition, message, input = '') => {
  cases++
  assert.ok(condition, `${message}\nINPUT=${JSON.stringify(input)}`)
}

const V2_PATH = '.weavedoc/schema'
const V3_PATH = '.weavedoc/schemas/v3'
const mapOf = (path, enc) => loadSchema(path, enc)
const edit = (path, mutate) => {
  const m = new Map(loadSchema(path, 'latin1'))
  mutate(m)
  return m
}
const ARTIFACTS = ['humanQueue', 'questions', 'verify', 'review', 'gaps']

// ---- 1. version negotiation is total and picks no winner ---------------------------------------
groups++
{
  const bad = [
    ['', '2', 'missing'], ['2', '', 'missing'], ['', '', 'missing'],
    ['x', '2', 'not-integer'], ['2', 'two', 'not-integer'], ['2.0', '2.0', 'not-integer'],
    ['2', '3', 'disagree'], ['3', '2', 'disagree'],
    ['99', '99', 'future']
  ]
  for (const [p, c, reason] of bad) {
    const r = resolveArtifactVersion(p, c)
    check(!r.ok && r.code === 'VERSION-MISMATCH' && r.reason === reason && r.version === null,
      `version negotiation misclassified project='${p}' config='${c}'`, r)
    // Neither side may be adopted as authority — a resolved version on a failure is exactly the
    // silent choice this contract exists to refuse.
    check(r.version === null, 'a failed negotiation still produced a version', r)
  }
  for (const [p, c] of [['1', '1'], ['0', '0']]) {
    const r = resolveArtifactVersion(p, c)
    check(!r.ok && r.code === 'VERSION-BELOW-FLOOR' && r.detail.includes(V1_BRIDGE.commit),
      'below-floor was merged with future, or lost the pinned bridge', r)
  }
  for (const v of SUPPORTED_ARTIFACT_VERSIONS) {
    const r = resolveArtifactVersion(String(v), String(v))
    check(r.ok && r.version === v && r.code === null, `supported version ${v} did not resolve`, r)
  }
  check(resolveArtifactVersion(String(ARTIFACT_MAX + 1), String(ARTIFACT_MAX + 1)).reason === 'future',
    'runtime max is not the ceiling it claims to be')
  check(resolveArtifactVersion(undefined, undefined).reason === 'missing',
    'absent fields were not treated as missing')
}

// ---- 2. the v2 adapter agrees with the production consumers ------------------------------------
groups++
{
  const schB = mapOf(V2_PATH, 'latin1')
  const schU = mapOf(V2_PATH, 'utf8')
  const c = loadArtifactContracts(ARTIFACT_FLOOR, schB, { domain: 'latin1' })
  check(c.valid, 'the shipped v2 schema does not satisfy its own role contract', c.errors)

  // verified-units.mjs takes the utf8 map and re-encodes; this loader takes the byte map and does
  // not. Different route, and the tokens must land on the same bytes or the Phase 2 switch is a
  // behaviour change wearing a refactor's clothes.
  const vu = verifiedUnitsContract(schU)
  check(vu.valid && c.verify.valid, 'verify contract validity disagrees between the two builders', { vu: vu.valid, roles: c.verify.valid })
  check(c.verify.section.units === vu.sectionName, 'verify units section disagrees with verified-units.mjs', { a: c.verify.section.units, b: vu.sectionName })
  check(c.verify.verdict.covered === vu.verifiedMarker, 'verify verdict marker disagrees with verified-units.mjs', { a: c.verify.verdict.covered, b: vu.verifiedMarker })
  check(JSON.stringify([c.verify.section.units, c.verify.section.human_queue, c.verify.section.adjudications]) === JSON.stringify(vu.boundaries),
    'verify section roles disagree with the positional boundaries production uses', { a: c.verify.section, b: vu.boundaries })

  const gr = gapRegisterContract(schB)
  check(gr.valid && c.gaps.valid, 'gaps contract validity disagrees between the two builders', { gr: gr.valid, roles: c.gaps.valid })
  check(c.gaps.section.open === gr.openName && c.gaps.section.accepted === gr.acceptedName,
    'gaps section roles disagree with gaps-register.mjs', { a: c.gaps.section, b: [gr.openName, gr.acceptedName] })
  // BOTH DIRECTIONS. Comparing sizes and one-way membership passed for a vocabulary swapped word
  // for word at the same count — measured, which is why the reverse inclusion is here too.
  check(c.gaps.kinds.size === gr.kinds.size &&
    [...c.gaps.kinds].every(k => gr.kinds.has(k)) && [...gr.kinds].every(k => c.gaps.kinds.has(k)),
  'gaps kind vocabulary disagrees with gaps-register.mjs', { a: [...c.gaps.kinds], b: [...gr.kinds] })

  // The words the consumers hardcode today, read back out of the schema that declares them.
  check(c.humanQueue.state.waiting === 'open' && c.humanQueue.state.closed === 'ruled',
    'v2 Human-queue state roles moved off the fixed vocabulary', c.humanQueue.state)
  check(c.humanQueue.ownership.user === 'user-only' && c.humanQueue.ownership.machine === 'machine',
    'v2 ownership roles moved off the fixed vocabulary', c.humanQueue.ownership)
  check(c.questions.state.waiting === 'open' && c.questions.state.closed === 'answered',
    'v2 question state roles moved off the fixed vocabulary', c.questions.state)
  check(c.review.section.violations === 'Fidelity violations' && c.review.section.human_queue === 'Human queue',
    'v2 review section roles moved off the fixed gate name', c.review.section)
  // The queue heading is owned by the artifacts that declare it — verify and review — not by a
  // third `humanqueue.section` answer that could split from them (see group 9).
  check(c.verify.section.human_queue === 'Human queue' && c.review.section.human_queue === 'Human queue',
    'v2 lost the queue-heading roles that verify and review own', { v: c.verify.section, r: c.review.section })
}

// ---- 3. v3 declares the same tokens v2 implies -------------------------------------------------
groups++
{
  const v2 = loadArtifactContracts(ARTIFACT_FLOOR, mapOf(V2_PATH, 'latin1'), { domain: 'latin1' })
  const v3 = loadArtifactContracts(ARTIFACT_MAX, mapOf(V3_PATH, 'latin1'), { domain: 'latin1' })
  check(v3.valid, 'the shipped v3 contract does not satisfy its own role contract', v3.errors)
  // v3 changes WHERE the mapping lives, not what it is. A token that differs here is a silent
  // format change riding in on a refactor.
  for (const artifact of ARTIFACTS) {
    check(JSON.stringify(v2[artifact].section ?? null) === JSON.stringify(v3[artifact].section ?? null),
      `${artifact}: v3 section roles differ from the v2 tokens they declare`, { v2: v2[artifact].section, v3: v3[artifact].section })
  }
  check(JSON.stringify(v2.humanQueue.state) === JSON.stringify(v3.humanQueue.state) &&
    JSON.stringify(v2.humanQueue.ownership) === JSON.stringify(v3.humanQueue.ownership),
  'v3 Human-queue roles differ from the v2 tokens they declare')
  check(JSON.stringify(v2.questions.state) === JSON.stringify(v3.questions.state),
    'v3 question roles differ from the v2 tokens they declare')
  check(v2.verify.verdict.covered === v3.verify.verdict.covered, 'v3 verdict marker differs from v2')
  check(v3.gaps.kinds.size === v2.gaps.kinds.size, 'v3 kind vocabulary differs from v2')
}

// ---- 4. an invalid role set fails as a UNIT, and never shifts -----------------------------------
groups++
{
  const drops = [
    ['humanQueue', 'humanqueue.state.closed'], ['humanQueue', 'humanqueue.ownership.machine'],
    ['humanQueue', 'humanqueue.state.waiting'], ['questions', 'questions.state.proposed'],
    ['verify', 'verify.section.human_queue'], ['verify', 'verify.verdict.covered'],
    ['review', 'review.section.findings'], ['gaps', 'gaps.section.accepted']
  ]
  for (const [artifact, key] of drops) {
    const c = loadArtifactContracts(ARTIFACT_MAX, edit(V3_PATH, m => m.delete(key)), { domain: 'latin1' })
    check(!c.valid && !c[artifact].valid, `${artifact} stayed valid without role key ${key}`)
    // Fail-closed as a unit: no surviving role may be readable, or a consumer acts on half a map.
    check(c[artifact].section === undefined && c[artifact].state === undefined,
      `${artifact} exposed a partial role map after losing ${key}`, Object.keys(c[artifact]))
    for (const other of ARTIFACTS) {
      if (other !== artifact) check(c[other].valid, `dropping ${key} invalidated unrelated artifact ${other}`)
    }
  }
  // Duplicate tokens on one axis cannot be told apart, so the axis is not a role assignment.
  const dupes = [
    ['humanQueue', 'humanqueue.state.closed', 'open'],
    ['humanQueue', 'humanqueue.ownership.recommended', 'user-only'],
    ['questions', 'questions.state.closed', 'open'],
    ['verify', 'verify.section.adjudications', 'Verified units'],
    ['review', 'review.section.findings', 'Fidelity violations'],
    ['gaps', 'gaps.section.accepted', 'Open']
  ]
  for (const [artifact, key, token] of dupes) {
    const c = loadArtifactContracts(ARTIFACT_MAX, edit(V3_PATH, m => m.set(key, token)), { domain: 'latin1' })
    check(!c.valid && !c[artifact].valid, `${artifact} accepted a duplicated role token via ${key}='${token}'`)
  }
  // Positional v2 lists: an empty leading member must not promote a later name into an earlier role.
  // BOTH SHAPES, and the second is the one that matters. With no compensating member the COUNT
  // check rejects the list anyway, so a reader that drops empties before assigning positions still
  // looks correct; add a fourth member and dropping the empty leaves three well-formed distinct
  // names in the wrong roles, silently. A mutation that filters empties survives the first input
  // and dies on the second — measured, which is why both are here.
  for (const list of ['|Human queue|Adjudications', '|Human queue|Adjudications|Extra']) {
    const shifted = loadArtifactContracts(ARTIFACT_FLOOR, edit(V2_PATH, m => m.set('verify.sections', list)), { domain: 'latin1' })
    check(!shifted.verify.valid && shifted.verify.section === undefined,
      `an empty first positional member shifted a later name into the verification lane: '${list}'`, shifted.verify)
  }
  for (const list of ['|Accepted', '|Accepted|Extra']) {
    const gapsShift = loadArtifactContracts(ARTIFACT_FLOOR, edit(V2_PATH, m => m.set('gaps.sections', list)), { domain: 'latin1' })
    check(!gapsShift.gaps.valid && gapsShift.gaps.section === undefined,
      `an empty first positional member shifted a later name into the open role: '${list}'`, gapsShift.gaps)
  }
  // The same combination on the v3 side: a role whose token is present but empty is not a role.
  for (const key of ['verify.section.units', 'gaps.section.open', 'humanqueue.state.waiting']) {
    const blank = loadArtifactContracts(ARTIFACT_MAX, edit(V3_PATH, m => m.set(key, '')), { domain: 'latin1' })
    const artifact = key.startsWith('verify') ? 'verify' : key.startsWith('gaps') ? 'gaps' : 'humanQueue'
    check(!blank[artifact].valid, `an empty token satisfied role key ${key}`)
  }
  // A single trailing delimiter adds no member anywhere else in the runtime and must not here.
  const trailing = loadArtifactContracts(ARTIFACT_FLOOR, edit(V2_PATH, m => m.set('verify.sections', 'Verified units|Human queue|Adjudications|')), { domain: 'latin1' })
  check(trailing.verify.valid && trailing.verify.section.units === 'Verified units',
    'a trailing pipe disabled the verification contract', trailing.verify)
  // A v2 mine whose enum dropped a word has no role for it — the adapter must not answer from a
  // constant, which would be this module inventing the vocabulary it claims to read.
  const noRuled = loadArtifactContracts(ARTIFACT_FLOOR, edit(V2_PATH, m => m.set('humanqueue.enum.state', 'open')), { domain: 'latin1' })
  check(!noRuled.humanQueue.valid, 'the v2 adapter answered a closed-state role the schema does not declare')
}

// ---- 5. the schema domain is declared, never guessed --------------------------------------------
groups++
{
  for (const bad of [undefined, null, '', 'utf-8', 'binary', 'ascii']) {
    let threw = false
    try { loadArtifactContracts(ARTIFACT_FLOOR, mapOf(V2_PATH, 'latin1'), { domain: bad }) } catch { threw = true }
    check(threw, `an undeclared or unknown schema domain ${JSON.stringify(bad)} was accepted`)
  }
  for (const v of [1, 4, 99, 2.5]) {
    let threw = false
    try { loadArtifactContracts(v, mapOf(V2_PATH, 'latin1'), { domain: 'latin1' }) } catch { threw = true }
    check(threw, `unsupported artifact version ${v} was loaded anyway`)
  }
  // A non-ASCII token must come back in the domain the caller declared, or it is compared against
  // ledger bytes it can never equal — the split that made status and validate disagree in v0.5.6.
  const korean = '충실성 위반'
  const u = loadArtifactContracts(ARTIFACT_MAX, edit(V3_PATH, m => m.set('review.section.violations', Buffer.from(korean, 'utf8').toString('latin1'))), { domain: 'latin1' })
  check(u.review.valid && u.review.section.violations === Buffer.from(korean, 'utf8').toString('latin1'),
    'a byte-domain role token was transcoded on the way out', u.review.section)
  check(loadArtifactContracts(ARTIFACT_FLOOR, mapOf(V2_PATH, 'latin1'), { domain: 'latin1' }).domain === 'latin1' &&
    loadArtifactContracts(ARTIFACT_FLOOR, mapOf(V2_PATH, 'utf8'), { domain: 'utf8' }).domain === 'utf8',
  'the answer does not carry the domain it was built in')

  // PLAN 12.7 #4: a non-ASCII role token must produce the SAME role in both domains — the byte
  // reader and the utf8 consumer may hold different bytes for it, but they must agree it is that
  // role, and each must hold the encoding its own artifact is read in. v0.5.6 is the measured
  // counter-example: a renamed non-ASCII state matched nothing on one surface while the other
  // enforced on the same entry.
  for (const token of ['충실성 위반', '미해결', 'Prüfung', '違反']) {
    const bytes = Buffer.from(token, 'utf8').toString('latin1')
    const b = loadArtifactContracts(ARTIFACT_MAX, edit(V3_PATH, m => m.set('review.section.violations', bytes)), { domain: 'latin1' })
    // The utf8 map holds the decoded token; build it the way loadSchema would for a utf8 read.
    const uMap = new Map(mapOf(V3_PATH, 'utf8'))
    uMap.set('review.section.violations', token)
    const u = loadArtifactContracts(ARTIFACT_MAX, uMap, { domain: 'utf8' })
    check(b.review.valid && u.review.valid, `a non-ASCII role token invalidated the model: '${token}'`, [b.errors, u.errors])
    check(b.review.section.violations === bytes && u.review.section.violations === token,
      `role token did not stay in its declared domain: '${token}'`, { b: b.review.section.violations, u: u.review.section.violations })
    // Same role, one identity: re-encoding either answer into the other domain lands on the other.
    check(Buffer.from(u.review.section.violations, 'utf8').toString('latin1') === b.review.section.violations,
      `the two domains disagree about which token the role names: '${token}'`)
    // And the role KEY is the same one on both sides — the point of a role is that its name does
    // not depend on the encoding of its value.
    check(Object.keys(b.review.section).sort().join(',') === Object.keys(u.review.section).sort().join(','),
      `the role set differs between domains for '${token}'`)
  }
}

// ---- 6. version selects the bundled contract file, and v2 has exactly one copy -------------------
groups++
{
  check(contractFileFor(ARTIFACT_FLOOR, '/x/.weavedoc/schema') === '/x/.weavedoc/schema',
    'v2 resolved to something other than the single shipped schema')
  check(contractFileFor(3, '/x/.weavedoc/schema') === '/x/.weavedoc/schemas/v3',
    'v3 did not resolve beside the schema it versions')
  // There is one v2 contract file. A second copy would be a second answer waiting to drift, which
  // is why the v3 file is added beside `schema` rather than `schema` being duplicated into v2.
  const v2Bytes = readFileSync(V2_PATH, 'latin1')
  const v3Bytes = readFileSync(V3_PATH, 'latin1')
  check(v2Bytes.includes('schema.version: 2') && v3Bytes.includes('schema.version: 3'),
    'the bundled contracts do not declare the versions they are')
  check(!v3Bytes.includes('schema.version: 2'), 'the v3 contract still declares version 2')
}

// ---- 7. the contract file must BE the version it was asked for -----------------------------------
groups++
{
  // A dispatcher that resolves the wrong path must not produce a fully-formed contract. Before this
  // check, handing the v3 file to the v2 adapter answered valid:true and every role was right about
  // the wrong document — the declaration in the file is the only evidence of what it is.
  const v2map = mapOf(V2_PATH, 'latin1')
  const v3map = mapOf(V3_PATH, 'latin1')
  for (const [asked, map, label] of [[2, v3map, 'v3 file as v2'], [3, v2map, 'v2 file as v3']]) {
    const c = loadArtifactContracts(asked, map, { domain: 'latin1' })
    check(!c.valid && c.versionMismatch === true, `${label} produced a usable contract`, c.errors)
    for (const a of ARTIFACTS) {
      check(!c[a].valid && c[a].section === undefined && c[a].state === undefined,
        `${label}: ${a} exposed a role from the wrong contract file`, Object.keys(c[a]))
    }
  }
  for (const v of SUPPORTED_ARTIFACT_VERSIONS) {
    const path = v === 2 ? V2_PATH : V3_PATH
    check(loadArtifactContracts(v, mapOf(path, 'latin1'), { domain: 'latin1' }).versionMismatch === false,
      `version ${v} rejected its own contract file`)
  }
  // A file with no declaration at all is not "probably right".
  const undeclared = loadArtifactContracts(3, edit(V3_PATH, m => m.delete('schema.version')), { domain: 'latin1' })
  check(!undeclared.valid && undeclared.versionMismatch === true, 'an undeclared contract file was accepted')
}

// ---- 8. the role namespace is closed ------------------------------------------------------------
groups++
{
  // An unroutable role is the v2 known limit rebuilt: recognised by the schema, meaningless to
  // every consumer. Plan section 12.7 #5 requires extra roles to fail closed like missing ones.
  const extras = [
    ['humanQueue', 'humanqueue.state.paused'], ['humanQueue', 'humanqueue.ownership.team'],
    ['questions', 'questions.state.deferred'], ['verify', 'verify.section.notes'],
    ['verify', 'verify.verdict.partial'], ['review', 'review.section.notes'],
    ['gaps', 'gaps.section.deferred']
  ]
  for (const [artifact, key] of extras) {
    const c = loadArtifactContracts(ARTIFACT_MAX, edit(V3_PATH, m => m.set(key, 'Something')), { domain: 'latin1' })
    check(!c.valid && !c[artifact].valid, `an unroutable role '${key}' was accepted`)
    for (const other of ARTIFACTS) {
      if (other !== artifact) check(c[other].valid, `'${key}' invalidated unrelated artifact ${other}`)
    }
  }
  // Non-role schema keys are none of this roster's business — unknown keys have always been a
  // named warning in this format, not a failure, and narrowing that would reject working mines.
  const unrelated = loadArtifactContracts(ARTIFACT_MAX, edit(V3_PATH, m => { m.set('project.fm.optional', 'x'); m.set('humanqueue.enum.state', 'open|ruled') }), { domain: 'latin1' })
  check(unrelated.valid, 'a non-role schema key was treated as an unroutable role', unrelated.errors)
  // v2 does not own the v3 role namespace: the same stray key in a v2 schema is just unknown.
  const v2Stray = loadArtifactContracts(ARTIFACT_FLOOR, edit(V2_PATH, m => m.set('verify.section.notes', 'Notes')), { domain: 'latin1' })
  check(v2Stray.valid, 'a v3-shaped key made a valid v2 schema fail', v2Stray.errors)
}

// ---- 9. one token, one answer -------------------------------------------------------------------
groups++
{
  // The Human-queue heading had three independent answers (`humanqueue.section` plus the verify and
  // review roles); changing one left them split while the contract still reported valid. The
  // artifact that owns the section is the one that declares it, and there is no fourth opinion.
  const v3map = mapOf(V3_PATH, 'latin1')
  check(v3map.get('humanqueue.section') === undefined,
    'the v3 contract still carries a queue-heading role no artifact owns')
  const c = loadArtifactContracts(ARTIFACT_MAX, v3map, { domain: 'latin1' })
  check(c.humanQueue.section === undefined, 'the humanQueue model still exposes a section of its own', c.humanQueue)
  check(c.verify.section.human_queue !== undefined && c.review.section.human_queue !== undefined,
    'the queue heading lost the two roles that do own it')
  // v3 declares each role exactly once: no v2 recognition key survives to give a second answer.
  for (const dup of ['humanqueue.enum.state', 'humanqueue.enum.ownership', 'questions.enum.status',
    'verify.sections', 'verify.units.verified', 'review.sections', 'gaps.sections']) {
    check(v3map.get(dup) === undefined, `v3 still declares '${dup}' alongside the role that replaces it`)
  }
  // ...except the kind vocabulary, which assigns no role by position and stays a membership set.
  check(v3map.get('gaps.enum.kind') !== undefined, 'v3 dropped the kind membership set it still needs')
}

// ---- 10. contract paths resolve on both platforms -----------------------------------------------
groups++
{
  const B = String.fromCharCode(92)
  const cases = [
    [['D:', 'mine', '.weavedoc', 'schema'].join(B), 'D:/mine/.weavedoc/schemas/v3'],
    ['/srv/mine/.weavedoc/schema', '/srv/mine/.weavedoc/schemas/v3'],
    [['C:', 'x', '.weavedoc', 'schema'].join(B), 'C:/x/.weavedoc/schemas/v3']
  ]
  for (const [input, expected] of cases) {
    // The old spelling stripped a trailing `/…` with a regex, found none in a backslash path, and
    // glued `schemas/v3` onto the whole thing. Output is forward-slash so it can still be compared
    // against the root-derived prefixes every other path in this runtime uses.
    check(contractFileFor(3, input) === expected, `contract path resolved wrong for '${input}'`, contractFileFor(3, input))
  }
  for (const input of [['D:', 'm', '.weavedoc', 'schema'].join(B), '/srv/m/.weavedoc/schema']) {
    check(contractFileFor(2, input) === input, 'v2 resolved to something other than the schema it was given')
  }
  for (const v of [1, 4, 99]) {
    let threw = false
    try { contractFileFor(v, '/x/.weavedoc/schema') } catch { threw = true }
    check(threw, `contractFileFor accepted unsupported version ${v}`)
  }
  // VERSION DISPATCH IS A TABLE, and this is the honest limit of what a fixture can hold. At the
  // current floor of 2, `version === ARTIFACT_FLOOR` and `ADAPTER[version] === 'v2'` are the same
  // behaviour, so no input distinguishes them — the bug they differ on only appears the day the
  // floor rises and v3 mines start flowing through the v2 adapter. So the tables themselves are
  // pinned: every supported version has exactly one adapter and one contract file, and collapsing
  // the mapping back into a floor comparison deletes something this asserts.
  check(Object.keys(ADAPTER).map(Number).sort((a, b) => a - b).join(',') === SUPPORTED_ARTIFACT_VERSIONS.join(','),
    'the adapter table does not cover exactly the supported versions', ADAPTER)
  check(Object.keys(CONTRACT_FILE).map(Number).sort((a, b) => a - b).join(',') === SUPPORTED_ARTIFACT_VERSIONS.join(','),
    'the contract-file table does not cover exactly the supported versions', CONTRACT_FILE)
  check(ADAPTER[2] === 'v2' && ADAPTER[3] === 'v3' && CONTRACT_FILE[2] === null && CONTRACT_FILE[3] === 'v3',
    'a supported version is routed to the wrong adapter or contract file', { ADAPTER, CONTRACT_FILE })
}

console.log(`artifact-contract-properties: groups=${groups} cases=${cases}`)
