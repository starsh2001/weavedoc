// Combinatorial checks for the versioned artifact-role contract — narrowed to v3-only when the
// runtime dropped its v2 reader (schema v3, slice 1).
//
// The load-bearing property is still EQUIVALENCE, with the v2 adapter gone from between the two
// sides: the v3 role file must declare the SAME tokens the production builders compute for
// themselves from the live schema's positional vocabulary. Until the consumer flip (which the
// approved plan discarded as a slice-1 concern), this module stays dormant and this file is the
// only thing executing it — the wrapper pins the exact totals for that reason.
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

const LIVE_SCHEMA = '.weavedoc/schema'      // the production format SoT — positional vocabulary
const V3_PATH = '.weavedoc/schemas/v3'      // the role contract this loader owns
const mapOf = (path, enc) => loadSchema(path, enc)
const edit = (path, mutate) => {
  const m = new Map(loadSchema(path, 'latin1'))
  mutate(m)
  return m
}
const ARTIFACTS = ['humanQueue', 'questions', 'verify', 'review', 'gaps']
const sameSet = (a, b) => a.size === b.size && [...a].every(x => b.has(x)) && [...b].every(x => a.has(x))

// ---- 1. version negotiation is total and picks no winner ---------------------------------------
groups++
{
  const bad = [
    ['', '3', 'missing'], ['3', '', 'missing'], ['', '', 'missing'],
    ['x', '3', 'not-integer'], ['3', 'three', 'not-integer'], ['3.0', '3.0', 'not-integer'],
    ['2', '3', 'disagree'], ['3', '2', 'disagree'],
    ['99', '99', 'future']
  ]
  for (const [p, c, reason] of bad) {
    const r = resolveArtifactVersion(p, c)
    check(!r.ok && r.code === 'VERSION-MISMATCH' && r.reason === reason && r.version === null,
      `version negotiation misclassified project='${p}' config='${c}'`, r)
    check(r.version === null, 'a failed negotiation still produced a version', r)
  }
  // Below the floor is not one event but two: a v2 mine takes THIS runtime's migrator, a v1 mine
  // takes the pinned bridge first. Sending a v2 user to the bridge (or a v1 user to the migrator)
  // is directions to the wrong door, so the details are pinned apart.
  const v2 = resolveArtifactVersion('2', '2')
  check(!v2.ok && v2.code === 'VERSION-BELOW-FLOOR' && v2.detail.includes("'weavedoc upgrade'") && !v2.detail.includes(V1_BRIDGE.commit),
    'a v2 mine was not routed to the v2→v3 migrator', v2)
  for (const [p, c] of [['1', '1'], ['0', '0']]) {
    const r = resolveArtifactVersion(p, c)
    check(!r.ok && r.code === 'VERSION-BELOW-FLOOR' && r.detail.includes(V1_BRIDGE.commit),
      'below-floor v1 was merged with v2, or lost the pinned bridge', r)
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

// ---- 2. the v3 roles declare the same tokens production computes --------------------------------
groups++
{
  const c = loadArtifactContracts(ARTIFACT_MAX, mapOf(V3_PATH, 'latin1'), { domain: 'latin1' })
  check(c.valid, 'the shipped v3 contract does not satisfy its own role contract', c.errors)

  // The production builders read the LIVE schema's positional vocabulary and stay the owners of it
  // until a consumer flip nobody scheduled. The role file is a second spelling of the same tokens,
  // and a token that differs here is a silent format change riding in on a dormant module.
  const vu = verifiedUnitsContract(mapOf(LIVE_SCHEMA, 'utf8'))
  check(vu.valid && c.verify.valid, 'verify contract validity disagrees between the two builders', { vu: vu.valid, roles: c.verify.valid })
  check(c.verify.section.units === vu.sectionName, 'verify units section disagrees with verified-units.mjs', { a: c.verify.section.units, b: vu.sectionName })
  check(c.verify.verdict.covered === vu.verifiedMarker, 'verify verdict marker disagrees with verified-units.mjs', { a: c.verify.verdict.covered, b: vu.verifiedMarker })
  check(JSON.stringify([c.verify.section.units, c.verify.section.human_queue, c.verify.section.adjudications]) === JSON.stringify(vu.boundaries),
    'verify section roles disagree with the positional boundaries production uses', { a: c.verify.section, b: vu.boundaries })

  const gr = gapRegisterContract(mapOf(LIVE_SCHEMA, 'latin1'))
  check(gr.valid && c.gaps.valid, 'gaps contract validity disagrees between the two builders', { gr: gr.valid, roles: c.gaps.valid })
  check(c.gaps.section.open === gr.openName && c.gaps.section.accepted === gr.acceptedName,
    'gaps section roles disagree with gaps-register.mjs', { a: c.gaps.section, b: [gr.openName, gr.acceptedName] })
  check(sameSet(c.gaps.kinds, gr.kinds),
    'gaps kind vocabulary disagrees with gaps-register.mjs', { a: [...c.gaps.kinds], b: [...gr.kinds] })

  // The words the consumers hardcode today, read back out of the roles that declare them.
  check(c.humanQueue.state.waiting === 'open' && c.humanQueue.state.closed === 'ruled',
    'Human-queue state roles moved off the fixed vocabulary', c.humanQueue.state)
  check(c.humanQueue.ownership.user === 'user-only' && c.humanQueue.ownership.machine === 'machine',
    'ownership roles moved off the fixed vocabulary', c.humanQueue.ownership)
  check(c.questions.state.waiting === 'open' && c.questions.state.closed === 'answered',
    'question state roles moved off the fixed vocabulary', c.questions.state)
  check(c.review.section.violations === 'Fidelity violations' && c.review.section.human_queue === 'Human queue',
    'review section roles moved off the fixed gate name', c.review.section)
  check(c.verify.section.human_queue === 'Human queue' && c.review.section.human_queue === 'Human queue',
    'the queue heading lost the two roles that own it', { v: c.verify.section, r: c.review.section })
}

// ---- 3. an invalid role set fails as a UNIT, and never shifts -----------------------------------
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
  // A role whose token is present but empty is not a role.
  for (const key of ['verify.section.units', 'gaps.section.open', 'humanqueue.state.waiting']) {
    const blank = loadArtifactContracts(ARTIFACT_MAX, edit(V3_PATH, m => m.set(key, '')), { domain: 'latin1' })
    const artifact = key.startsWith('verify') ? 'verify' : key.startsWith('gaps') ? 'gaps' : 'humanQueue'
    check(!blank[artifact].valid, `an empty token satisfied role key ${key}`)
  }
}

// ---- 4. the schema domain is declared, never guessed --------------------------------------------
groups++
{
  for (const bad of [undefined, null, '', 'utf-8', 'binary', 'ascii']) {
    let threw = false
    try { loadArtifactContracts(ARTIFACT_MAX, mapOf(V3_PATH, 'latin1'), { domain: bad }) } catch { threw = true }
    check(threw, `an undeclared or unknown schema domain ${JSON.stringify(bad)} was accepted`)
  }
  // 2 sits in this grid now: the v2 reader left with the flip, and a loader that quietly accepted
  // it would be the dual-version support the approved plan explicitly discarded.
  for (const v of [1, 2, 4, 99, 2.5]) {
    let threw = false
    try { loadArtifactContracts(v, mapOf(V3_PATH, 'latin1'), { domain: 'latin1' }) } catch { threw = true }
    check(threw, `unsupported artifact version ${v} was loaded anyway`)
  }
  // A non-ASCII token must come back in the domain the caller declared, or it is compared against
  // ledger bytes it can never equal — the split that made status and validate disagree in v0.5.6.
  const korean = '충실성 위반'
  const u = loadArtifactContracts(ARTIFACT_MAX, edit(V3_PATH, m => m.set('review.section.violations', Buffer.from(korean, 'utf8').toString('latin1'))), { domain: 'latin1' })
  check(u.review.valid && u.review.section.violations === Buffer.from(korean, 'utf8').toString('latin1'),
    'a byte-domain role token was transcoded on the way out', u.review.section)
  check(loadArtifactContracts(ARTIFACT_MAX, mapOf(V3_PATH, 'latin1'), { domain: 'latin1' }).domain === 'latin1' &&
    loadArtifactContracts(ARTIFACT_MAX, mapOf(V3_PATH, 'utf8'), { domain: 'utf8' }).domain === 'utf8',
  'the answer does not carry the domain it was built in')

  // A non-ASCII role token must produce the SAME role in both domains — the byte reader and the
  // utf8 consumer may hold different bytes for it, but they must agree it is that role.
  for (const token of ['충실성 위반', '미해결', 'Prüfung', '違反']) {
    const bytes = Buffer.from(token, 'utf8').toString('latin1')
    const b = loadArtifactContracts(ARTIFACT_MAX, edit(V3_PATH, m => m.set('review.section.violations', bytes)), { domain: 'latin1' })
    const uMap = new Map(mapOf(V3_PATH, 'utf8'))
    uMap.set('review.section.violations', token)
    const u2 = loadArtifactContracts(ARTIFACT_MAX, uMap, { domain: 'utf8' })
    check(b.review.valid && u2.review.valid, `a non-ASCII role token invalidated the model: '${token}'`, [b.errors, u2.errors])
    check(b.review.section.violations === bytes && u2.review.section.violations === token,
      `role token did not stay in its declared domain: '${token}'`, { b: b.review.section.violations, u: u2.review.section.violations })
    check(Buffer.from(u2.review.section.violations, 'utf8').toString('latin1') === b.review.section.violations,
      `the two domains disagree about which token the role names: '${token}'`)
    check(Object.keys(b.review.section).sort().join(',') === Object.keys(u2.review.section).sort().join(','),
      `the role set differs between domains for '${token}'`)
  }
}

// ---- 5. version selects the bundled contract file, on every platform ----------------------------
groups++
{
  const B = String.fromCharCode(92)
  const pathCases = [
    [['D:', 'mine', '.weavedoc', 'schema'].join(B), 'D:/mine/.weavedoc/schemas/v3'],
    ['/srv/mine/.weavedoc/schema', '/srv/mine/.weavedoc/schemas/v3'],
    [['C:', 'x', '.weavedoc', 'schema'].join(B), 'C:/x/.weavedoc/schemas/v3']
  ]
  for (const [input, expected] of pathCases) {
    check(contractFileFor(3, input) === expected, `contract path resolved wrong for '${input}'`, contractFileFor(3, input))
  }
  // Unsupported versions (2 among them now), and the INHERITED property names a plain object
  // answers for: a lookup table doubling as a membership test must be asked the membership question.
  for (const v of [1, 2, 4, 99, 2.5, '3', 'toString', 'constructor', '__proto__', 'valueOf', null, undefined, {}]) {
    let threw = false
    try { contractFileFor(v, '/x/.weavedoc/schema') } catch { threw = true }
    check(threw, `contractFileFor accepted unsupported version ${JSON.stringify(String(v))}`)
  }
  for (const v of SUPPORTED_ARTIFACT_VERSIONS) {
    let threw = false
    try { contractFileFor(v, '/x/.weavedoc/schema') } catch { threw = true }
    check(!threw, `contractFileFor rejected supported version ${v}`)
  }
  // The bundled files declare what they are — and nothing in the tree declares version 2 anymore:
  // a stray v2 declaration would be a second reader's foothold, which the flip exists to remove.
  const liveBytes = readFileSync(LIVE_SCHEMA, 'latin1')
  const v3Bytes = readFileSync(V3_PATH, 'latin1')
  check(liveBytes.includes('schema.version: 3') && v3Bytes.includes('schema.version: 3'),
    'a bundled contract does not declare version 3')
  check(!liveBytes.includes('schema.version: 2') && !v3Bytes.includes('schema.version: 2'),
    'a bundled contract still declares version 2')
}

// ---- 6. the contract file must BE the version it was asked for -----------------------------------
groups++
{
  // A dispatcher that resolves the wrong path must not produce a fully-formed contract — the
  // declaration in the file is the only evidence of what it is.
  for (const mutate of [m => m.delete('schema.version'), m => m.set('schema.version', '2')]) {
    const c = loadArtifactContracts(3, edit(V3_PATH, mutate), { domain: 'latin1' })
    check(!c.valid && c.versionMismatch === true, 'a wrong or missing declaration produced a usable contract', c.errors)
    for (const a of ARTIFACTS) {
      check(!c[a].valid && c[a].section === undefined && c[a].state === undefined,
        `${a} exposed a role from a wrong contract file`, Object.keys(c[a]))
    }
  }
  // The LIVE schema declares 3 — the right version — but holds NO role keys: right declaration,
  // no roles is invalid-by-content, not a version mismatch, and no artifact may leak a role.
  const live = loadArtifactContracts(3, mapOf(LIVE_SCHEMA, 'latin1'), { domain: 'latin1' })
  check(!live.valid && live.versionMismatch === false,
    'the roleless live schema was misread as a version mismatch (or accepted)', { valid: live.valid, vm: live.versionMismatch })
  for (const a of ARTIFACTS) check(!live[a].valid, `${a} conjured roles out of the positional live schema`)
  check(loadArtifactContracts(3, mapOf(V3_PATH, 'latin1'), { domain: 'latin1' }).versionMismatch === false,
    'version 3 rejected its own contract file')
}

// ---- 7. the role namespace is closed ------------------------------------------------------------
groups++
{
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
}

// ---- 8. one token, one answer -------------------------------------------------------------------
groups++
{
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
  check(v3map.get('gaps.enum.kind') !== undefined, 'v3 dropped the kind membership set it still needs')
}

// ---- 9. version dispatch is a table, and the table is exactly the supported set ------------------
groups++
{
  check(SUPPORTED_ARTIFACT_VERSIONS.join(',') === '3' && ARTIFACT_FLOOR === 3 && ARTIFACT_MAX === 3,
    'the supported set is not the v3-only runtime the flip shipped', { SUPPORTED_ARTIFACT_VERSIONS, ARTIFACT_FLOOR, ARTIFACT_MAX })
  check(Object.keys(ADAPTER).map(Number).sort((a, b) => a - b).join(',') === SUPPORTED_ARTIFACT_VERSIONS.join(','),
    'the adapter table does not cover exactly the supported versions', ADAPTER)
  check(Object.keys(CONTRACT_FILE).map(Number).sort((a, b) => a - b).join(',') === SUPPORTED_ARTIFACT_VERSIONS.join(','),
    'the contract-file table does not cover exactly the supported versions', CONTRACT_FILE)
  check(ADAPTER[3] === 'v3' && CONTRACT_FILE[3] === 'v3' && ADAPTER[2] === undefined && CONTRACT_FILE[2] === undefined,
    'a version is routed to an adapter or contract file the runtime no longer carries', { ADAPTER, CONTRACT_FILE })
}

console.log(`artifact-contract-properties: groups=${groups} cases=${cases}`)
