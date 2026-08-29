// Combinatorial checks for artifact VERSION NEGOTIATION — the half of artifact-contracts.mjs
// production actually reads (the version gate resolves through it).
//
// The other half this file used to execute — the Phase-1 role-contract loader and the frozen
// `.weavedoc/schemas/v3` draft it read — retired in 0.6.18: Phase 2 never arrived, this file was
// the loader's ONLY executor, and the draft had drifted four axes behind the live schema. The
// groups that exercised it (equivalence, unit-failure, domain, file selection, closed namespace)
// left with it; what remains is what a real mine can actually hit. The wrapper still pins the
// exact totals, for the same reason it always did: deleting an axis must be a failure even when
// every remaining assertion is green.
import assert from 'node:assert/strict'
import {
  ARTIFACT_FLOOR,
  ARTIFACT_MAX,
  SUPPORTED_ARTIFACT_VERSIONS,
  V1_BRIDGE,
  V2_BRIDGE,
  resolveArtifactVersion
} from '../.weavedoc/bin/lib/artifact-contracts.mjs'

let cases = 0
let groups = 0
const check = (condition, message, input = '') => {
  cases++
  assert.ok(condition, `${message}\nINPUT=${JSON.stringify(input)}`)
}

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
  // Below the floor is not one event but two: a v2 mine takes the pinned v2→v3 bridge (0.6.15
  // retired the in-runtime migrator toward it), a v1 mine takes the older bridge FIRST. Sending a
  // v2 user to the v1 bridge (or a v1 user straight to the v2 one) is directions to the wrong
  // door, so the details are pinned apart: the v2 detail names ONLY the v2 bridge.
  const v2 = resolveArtifactVersion('2', '2')
  check(!v2.ok && v2.code === 'VERSION-BELOW-FLOOR' && v2.detail.includes(V2_BRIDGE.commit) && !v2.detail.includes(V1_BRIDGE.commit),
    'a v2 mine was not routed to the pinned v2→v3 bridge', v2)
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

// ---- 2. the supported set is the v3-only runtime the flip shipped -------------------------------
groups++
{
  check(SUPPORTED_ARTIFACT_VERSIONS.join(',') === '3' && ARTIFACT_FLOOR === 3 && ARTIFACT_MAX === 3,
    'the supported set is not the v3-only runtime the flip shipped', { SUPPORTED_ARTIFACT_VERSIONS, ARTIFACT_FLOOR, ARTIFACT_MAX })
}

console.log(`artifact-contract-properties: groups=${groups} cases=${cases}`)
