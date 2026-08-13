// One place that turns a schema into ROLES, for every artifact and every supported version.
//
// PARSER-MODEL.md section 5 records the limit this closes: the schema decided which words a reader
// RECOGNISES while what each word MEANT stayed hardcoded in the consumers. `open` waits, `ruled` is
// closed, the queue is the literal `Human queue` heading — five consumers each knowing that
// separately is five chances to disagree about one token. Here a role names its token once and
// every consumer selects from the returned object.
//
// READ-ONLY AND UNWIRED ON PURPOSE (Phase 1). No production consumer reads this yet; the v2 suite
// must stay green against the old spellings, and switching consumers is Phase 2's completion
// condition. What this file has to earn now is that its v2 answer is the SAME answer production
// already gives, so the switch is a deletion rather than a behaviour change.
import { pipes } from './core.mjs'

// The runtime's own supported range — deliberately NOT `schema.version` from the mine's schema.
// Conflating "what this runtime can read" with "what this mine declares" is how a mine's own file
// gets to certify itself; the plan names them as two values and this is where they stay apart.
export const ARTIFACT_FLOOR = 3
export const ARTIFACT_MAX = 3
export const SUPPORTED_ARTIFACT_VERSIONS = [3]

// The one v1 runtime a below-floor mine is sent to. Pinned as a commit, not a moving branch: a
// bridge whose bytes drift is not a bridge.
export const V1_BRIDGE = { tag: 'v0.5.21', commit: '0257167' }

// EXPLICIT TABLES, never `version === ARTIFACT_FLOOR`. Deriving "is this v2" from the floor means
// the day the floor rises to 3, v3 mines quietly start being read by the v2 adapter — the format
// equivalent of a positional shift. A version that is not in the table is not readable, full stop.
// The v2 row left with the v2 reader (schema v3, slice 1): `.weavedoc/schema` declares version 3
// now, and no artifact version reads it as a ROLE contract — the positional keys it still holds
// are the LIVE production vocabulary, owned by the production builders until the consumer flip
// the approved plan discarded. One version, one file, still a table and never a comparison.
export const CONTRACT_FILE = { 3: 'v3' }
// Exported so a property can pin the TABLE itself. At today's floor of 2 the table and the old
// `version === ARTIFACT_FLOOR` test are behaviourally identical, so no fixture can tell them apart
// — the failure it guards against is the day the floor rises, which is exactly when nobody is
// looking. What a test CAN hold is that the mapping exists and covers every supported version, so
// simplifying it back into a comparison against the floor goes red.
export const ADAPTER = { 3: 'v3' }

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
    // the floor are themselves different events: a v2 mine takes THIS runtime's v2→v3 migrator,
    // a v1 mine takes the pinned bridge runtime to v2 first.
    const detail = v === 2
      ? `this mine declares artifact version 2; this runtime reads only ${ARTIFACT_MAX}. Run this runtime's 'weavedoc upgrade' (the v2→v3 migrator) first`
      : `this mine declares artifact version ${v}; this runtime reads only ${ARTIFACT_MAX}. Migrate it to 2 first with the pinned bridge runtime ${V1_BRIDGE.tag} (${V1_BRIDGE.commit}), then run 'weavedoc upgrade' here`
    return { ok: false, code: 'VERSION-BELOW-FLOOR', reason: 'below-floor', detail, version: null }
  }
  if (v > ARTIFACT_MAX) {
    return fail('future', `this mine declares artifact version ${v}, newer than this runtime supports (<=${ARTIFACT_MAX}) — upgrade the runtime bundle rather than guessing at a future format`)
  }
  return { ok: true, code: null, reason: null, detail: null, version: v }
}

// Which bundled contract file a version reads. v2 is the runtime's existing `.weavedoc/schema` —
// there is exactly one copy of the v2 contract and this is it, because a second copy is a second
// answer waiting to drift. v3 gets its own file beside it.
// The first spelling here stripped the trailing component with `replace(/\/[^/]*$/, '')`, which
// finds no `/` in `D:\mine\.weavedoc\schema` and glued `schemas/v3` onto the whole path — every
// Windows install would have read the wrong file the moment a consumer was wired to this. Output is
// forward-slash, the one separator every other path in this runtime is compared against.
const fwd = p => p.replace(/\\/g, '/')

// OWN PROPERTIES ONLY, and an integer. A plain object inherits `toString`, `constructor` and the
// rest, so `CONTRACT_FILE[version]` answered for `'toString'` and produced a path ending in the
// function's source text. No dispatcher passes that today; the point is that a lookup table used as
// a membership test has to be asked the membership question, or "total" is a claim and not a fact.
const supported = version => Number.isInteger(version) && Object.hasOwn(CONTRACT_FILE, version)

export function contractFileFor (version, schemaPath) {
  if (!supported(version)) throw new Error(`unsupported artifact version ${JSON.stringify(version)} — this runtime reads ${SUPPORTED_ARTIFACT_VERSIONS.join(', ')}`)
  const file = CONTRACT_FILE[version]
  if (file === null) return schemaPath
  // BOTH SEPARATORS, EXPLICITLY — not node:path. `path.dirname` is platform-dependent by design:
  // on POSIX a backslash is an ordinary character, so `D:\mine\.weavedoc\schema` has no directory
  // at all there. That made the answer differ by host, which a contract resolver must never do and
  // which no Windows-only test would have caught — CI's Linux and macOS legs did. Cutting at the
  // last separator of either kind and emitting the forward slashes the rest of this runtime
  // compares against gives one answer everywhere, and needs no import.
  const cut = Math.max(schemaPath.lastIndexOf('/'), schemaPath.lastIndexOf('\\'))
  const dir = cut < 0 ? '.' : schemaPath.slice(0, cut)
  return `${fwd(dir)}/schemas/${file}`
}

// ---- role assembly ---------------------------------------------------------------------------
// A model is valid as a WHOLE or not at all. Half a role set is the shape that lets a later member
// slide into an earlier role, which is the failure `gaps.sections` already had to be hardened
// against; the same rule is applied to every artifact here rather than to the one that got bitten.
function roleSet (get, specs, artifact) {
  const errors = []
  const roles = {}
  for (const [role, key] of specs) {
    const raw = get(key)
    if (typeof raw !== 'string' || raw === '') {
      errors.push(`${artifact}: role '${role}' has no token (schema key '${key}')`)
      continue
    }
    roles[role] = raw
  }
  return { roles, errors }
}

// THE ROLE NAMESPACE IS CLOSED. A key under a reserved prefix that names no role is the same event
// this whole file exists to end: a token the schema recognises that no consumer can route. Left
// open, `verify.section.notes` reads as a declared section forever and blocks nothing, which is the
// v2 known limit rebuilt one release after removing it. Non-role schema keys are untouched — only
// these prefixes are owned, and only in v3, where the role keys live.
const ROLE_ROSTER = {
  humanQueue: { 'humanqueue.state.': ['waiting', 'closed'], 'humanqueue.ownership.': ['user', 'recommended', 'machine'] },
  questions: { 'questions.state.': ['waiting', 'proposed', 'closed'] },
  verify: { 'verify.section.': ['units', 'human_queue', 'adjudications'], 'verify.verdict.': ['covered'] },
  review: { 'review.section.': ['violations', 'findings', 'adjudications', 'human_queue'] },
  gaps: { 'gaps.section.': ['open', 'accepted'] }
}

function rejectExtraRoles (schemaMap, artifact, errors) {
  const roster = ROLE_ROSTER[artifact]
  const keys = typeof schemaMap?.keys === 'function' ? [...schemaMap.keys()] : []
  for (const key of keys) {
    for (const [prefix, allowed] of Object.entries(roster)) {
      if (!key.startsWith(prefix)) continue
      const suffix = key.slice(prefix.length)
      if (!allowed.includes(suffix)) {
        errors.push(`${artifact}: '${key}' is not a role this runtime routes — the ${prefix}* namespace is exactly ${allowed.join(', ')}`)
      }
    }
  }
}

function requireDistinct (roles, groups, artifact, errors) {
  for (const [axis, members] of groups) {
    const present = members.filter(role => roles[role] !== undefined).map(role => roles[role])
    if (present.length !== members.length) continue
    if (new Set(present).size !== present.length) {
      errors.push(`${artifact}: ${axis} roles must be distinct tokens, got ${present.map(t => `'${t}'`).join(', ')}`)
    }
  }
}

// v2 keeps its vocabulary where it always was. The three shapes are genuinely different and the
function v3Model (get) {
  const errors = { humanQueue: [], questions: [], verify: [], review: [], gaps: [] }

  const hqState = roleSet(get, [['waiting', 'humanqueue.state.waiting'], ['closed', 'humanqueue.state.closed']], 'humanQueue')
  const hqOwn = roleSet(get, [['user', 'humanqueue.ownership.user'], ['recommended', 'humanqueue.ownership.recommended'], ['machine', 'humanqueue.ownership.machine']], 'humanQueue')
  errors.humanQueue.push(...hqState.errors, ...hqOwn.errors)
  requireDistinct(hqState.roles, [['state', ['waiting', 'closed']]], 'humanQueue', errors.humanQueue)
  requireDistinct(hqOwn.roles, [['ownership', ['user', 'recommended', 'machine']]], 'humanQueue', errors.humanQueue)

  const qState = roleSet(get, [['waiting', 'questions.state.waiting'], ['proposed', 'questions.state.proposed'], ['closed', 'questions.state.closed']], 'questions')
  errors.questions.push(...qState.errors)
  requireDistinct(qState.roles, [['state', ['waiting', 'proposed', 'closed']]], 'questions', errors.questions)

  const vSection = roleSet(get, [['units', 'verify.section.units'], ['human_queue', 'verify.section.human_queue'], ['adjudications', 'verify.section.adjudications']], 'verify')
  const vVerdict = roleSet(get, [['covered', 'verify.verdict.covered']], 'verify')
  errors.verify.push(...vSection.errors, ...vVerdict.errors)
  requireDistinct(vSection.roles, [['section', ['units', 'human_queue', 'adjudications']]], 'verify', errors.verify)
  if (vVerdict.roles.covered !== undefined && vVerdict.roles.covered.includes('|')) {
    errors.verify.push('verify: verdict role \'covered\' must be one scalar marker, not a list')
  }

  const rSection = roleSet(get, [['violations', 'review.section.violations'], ['findings', 'review.section.findings'], ['adjudications', 'review.section.adjudications'], ['human_queue', 'review.section.human_queue']], 'review')
  errors.review.push(...rSection.errors)
  requireDistinct(rSection.roles, [['section', ['violations', 'findings', 'adjudications', 'human_queue']]], 'review', errors.review)

  const gSection = roleSet(get, [['open', 'gaps.section.open'], ['accepted', 'gaps.section.accepted']], 'gaps')
  errors.gaps.push(...gSection.errors)
  requireDistinct(gSection.roles, [['section', ['open', 'accepted']]], 'gaps', errors.gaps)
  // The kind vocabulary stays a distinct membership SET in v3 — it assigns no role by position, so
  // making it positional would invent an ordering contract the format does not have.
  const gapsKinds = pipes(get('gaps.enum.kind'))
  let kinds = new Set()
  if (gapsKinds.length === 0 || gapsKinds.some(n => n === '') || new Set(gapsKinds).size !== gapsKinds.length) {
    errors.gaps.push('gaps: gaps.enum.kind must contain one or more distinct non-empty kind names')
  } else kinds = new Set(gapsKinds)

  return {
    humanQueue: { state: hqState.roles, ownership: hqOwn.roles },
    questions: { state: qState.roles },
    verify: { section: vSection.roles, verdict: vVerdict.roles },
    review: { section: rSection.roles },
    gaps: { section: gSection.roles, kinds },
    errors
  }
}

// THE SCHEMA DOMAIN IS DECLARED, NOT GUESSED. Ledger files are read as latin1 and some schema
// values are non-ASCII, so a token compared against the wrong domain matches nothing while the
// other surface enforces on the same entry. The two existing contract builders each solved this
// their own way — one takes the utf8 map and re-encodes, the other takes the latin1 map and does
// not — and having both conventions is a trap for the next edit. Here the caller states the domain
// of the map it passes, the loader transcodes nothing, and the answer carries the domain so a
// consumer can assert it matches the bytes it is about to compare.
const DOMAINS = new Set(['utf8', 'latin1'])

export function loadArtifactContracts (version, schemaMap, { domain } = {}) {
  if (!DOMAINS.has(domain)) throw new Error(`artifact contracts need an explicit schema domain (utf8|latin1), got ${JSON.stringify(domain)}`)
  if (!SUPPORTED_ARTIFACT_VERSIONS.includes(version)) {
    throw new Error(`unsupported artifact version ${version} — this runtime reads ${SUPPORTED_ARTIFACT_VERSIONS.join(', ')}`)
  }
  const get = key => schemaMap?.get?.(key)
  // THE FILE MUST BE THE VERSION IT WAS ASKED FOR. Without this, handing the v3 contract to the v2
  // adapter answered `valid: true` — a dispatcher that resolved the wrong path would have produced
  // a fully-formed contract for a file nobody asked for, and every downstream role would be right
  // about the wrong document. The declaration in the file is the only evidence of what it is.
  const declared = get('schema.version')
  const artifacts = ['humanQueue', 'questions', 'verify', 'review', 'gaps']
  const out = { version, domain, valid: true, errors: [] }
  if (declared !== String(version)) {
    const why = `artifact contract file declares schema.version '${declared ?? ''}' but version ${version} was requested — the wrong contract was loaded; no role is exposed`
    out.valid = false
    out.errors.push(why)
    out.versionMismatch = true
    for (const name of artifacts) out[name] = { valid: false, errors: [why] }
    return out
  }
  out.versionMismatch = false
  const model = v3Model(get)
  // v3 owns the `*.state.*`/`*.section.*` namespaces: a key under them that names no role is the
  // event this file exists to end, so it fails closed rather than riding as an unknown key.
  for (const name of artifacts) rejectExtraRoles(schemaMap, name, model.errors[name])
  for (const name of artifacts) {
    const errs = model.errors[name]
    const ok = errs.length === 0
    // Fail-closed as a UNIT: an invalid model exposes no roles at all rather than the subset that
    // happened to parse, so no consumer can read a half-contract and act on the half it got.
    out[name] = ok
      ? { valid: true, errors: [], ...model[name] }
      : { valid: false, errors: errs }
    if (!ok) {
      out.valid = false
      out.errors.push(...errs)
    }
  }
  return out
}
