// Artifact version negotiation, and the two bridge pins a below-floor mine is refused toward.
// This is the half of the old "artifact contracts" module production actually reads — the version
// gate (mine.mjs, validate) resolves through here. The other half, the Phase-1 role-contract
// apparatus, retired in 0.6.18; the note below records what left and why.

// The runtime's own supported range — deliberately NOT `schema.version` from the mine's schema.
// Conflating "what this runtime can read" with "what this mine declares" is how a mine's own file
// gets to certify itself; the plan names them as two values and this is where they stay apart.
export const ARTIFACT_FLOOR = 3
export const ARTIFACT_MAX = 3
export const SUPPORTED_ARTIFACT_VERSIONS = [3]

// The one v1 runtime a below-floor mine is sent to. Pinned as a commit, not a moving branch: a
// bridge whose bytes drift is not a bridge.
export const V1_BRIDGE = { tag: 'v0.5.21', commit: '0257167' }
// The v2→v3 migrator retired in 0.6.15, the same way the v1 path did before it: pinned to the last
// bundle that carried it. Two bridges, one pattern — a mine below the floor is refused toward a
// checkout, never toward a command this runtime no longer has.
export const V2_BRIDGE = { tag: 'v0.6.14', commit: '924e97e' }

// (The Phase-1 role-contract apparatus — CONTRACT_FILE/ADAPTER tables, contractFileFor, the role
// assembly, loadArtifactContracts — retired in 0.6.18 together with `.weavedoc/schemas/v3`, the
// frozen draft it loaded. Phase 2 never arrived, its only executor was its own property test, and
// the draft had drifted four axes behind the live schema — a bundled file declaring a retired
// model as "the contract" is the cite-a-file-to-prove-a-wrong-rule hazard. Same judgment as the
// migrator: no constituency, pinned in git, deleted from the live tree. What this file KEEPS is
// what production actually reads: version negotiation and the two bridge pins above.)

const isInt = s => typeof s === 'string' && s !== '' && /^[0-9]+$/.test(s)

// Version negotiation is TOTAL in both directions and picks no winner. project.md and config.yaml
// are two records of one fact; when they disagree neither is authority, because a runtime that
// silently prefers one has just chosen the mine's format for the user.
export function resolveArtifactVersion (projectVersion, configVersion) {
  const p = projectVersion ?? ''
  const c = configVersion ?? ''
  const fail = (reason, detail) => ({ ok: false, code: 'VERSION-MISMATCH', reason, detail, version: null })
  if (p === '' || c === '') {
    return fail('missing', `project.md version '${p}', config.yaml version '${c}' — both are required`)
  }
  if (!isInt(p) || !isInt(c)) {
    return fail('not-integer', `project.md version '${p}', config.yaml version '${c}' — the negotiation handle is an integer`)
  }
  if (p !== c) {
    return fail('disagree', `project.md version ${p} and config.yaml version ${c} disagree — two records of one fact must agree`)
  }
  const v = Number(p)
  if (v < ARTIFACT_FLOOR) {
    // Below the floor is NOT the same event as above the ceiling, and merging them would tell a v1
    // user to upgrade the runtime when what they need is to migrate the mine. The two hops below
    // the floor are themselves different events: a v2 mine takes the pinned v2→v3 bridge, a v1
    // mine takes the older bridge runtime to v2 first.
    const detail = v === 2
      ? `this mine declares artifact version 2; this runtime reads only ${ARTIFACT_MAX}. Migrate with the pinned bridge runtime ${V2_BRIDGE.tag} (${V2_BRIDGE.commit}) — the last bundle carrying the v2→v3 migrator`
      : `this mine declares artifact version ${v}; this runtime reads only ${ARTIFACT_MAX}. Migrate it to 2 first with the pinned bridge runtime ${V1_BRIDGE.tag} (${V1_BRIDGE.commit}), then to 3 with ${V2_BRIDGE.tag} (${V2_BRIDGE.commit})`
    return { ok: false, code: 'VERSION-BELOW-FLOOR', reason: 'below-floor', detail, version: null }
  }
  if (v > ARTIFACT_MAX) {
    return fail('future', `this mine declares artifact version ${v}, newer than this runtime supports (<=${ARTIFACT_MAX}) — upgrade the runtime bundle rather than guessing at a future format`)
  }
  return { ok: true, code: null, reason: null, detail: null, version: v }
}

