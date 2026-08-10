// Combinatorial checks for the versioned artifact-role contract (schema v3, Phase 1).
//
// The load-bearing property is EQUIVALENCE, not novelty: for the shipped schema the v2 adapter must
// produce the same tokens the production consumers already compute for themselves. Until that holds
// this module is a second answer, and the point of it is to be the only one.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ARTIFACT_FLOOR,
  ARTIFACT_MAX,
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
  check(c.gaps.kinds.size === gr.kinds.size && [...c.gaps.kinds].every(k => gr.kinds.has(k)),
    'gaps kind vocabulary disagrees with gaps-register.mjs')

  // The words the consumers hardcode today, read back out of the schema that declares them.
  check(c.humanQueue.state.waiting === 'open' && c.humanQueue.state.closed === 'ruled',
    'v2 Human-queue state roles moved off the fixed vocabulary', c.humanQueue.state)
  check(c.humanQueue.ownership.user === 'user-only' && c.humanQueue.ownership.machine === 'machine',
    'v2 ownership roles moved off the fixed vocabulary', c.humanQueue.ownership)
  check(c.questions.state.waiting === 'open' && c.questions.state.closed === 'answered',
    'v2 question state roles moved off the fixed vocabulary', c.questions.state)
  check(c.review.section.violations === 'Fidelity violations' && c.review.section.human_queue === 'Human queue',
    'v2 review section roles moved off the fixed gate name', c.review.section)
  check(c.humanQueue.section === 'Human queue', 'the Human-queue heading role lost its literal token', c.humanQueue.section)
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
    ['humanQueue', 'humanqueue.section'], ['questions', 'questions.state.proposed'],
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

console.log(`artifact-contract-properties: groups=${groups} cases=${cases}`)
