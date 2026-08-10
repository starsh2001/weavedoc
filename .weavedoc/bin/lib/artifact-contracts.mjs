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
export const ARTIFACT_FLOOR = 2
export const ARTIFACT_MAX = 3
export const SUPPORTED_ARTIFACT_VERSIONS = [2, 3]

// The one v1 runtime a below-floor mine is sent to. Pinned as a commit, not a moving branch: a
// bridge whose bytes drift is not a bridge.
export const V1_BRIDGE = { tag: 'v0.5.21', commit: '0257167' }

// EXPLICIT TABLES, never `version === ARTIFACT_FLOOR`. Deriving "is this v2" from the floor means
// the day the floor rises to 3, v3 mines quietly start being read by the v2 adapter — the format
// equivalent of a positional shift. A version that is not in the table is not readable, full stop.
// `null` means "the single shipped .weavedoc/schema": there is exactly one copy of the v2 contract.
export const CONTRACT_FILE = { 2: null, 3: 'v3' }
// Exported so a property can pin the TABLE itself. At today's floor of 2 the table and the old
// `version === ARTIFACT_FLOOR` test are behaviourally identical, so no fixture can tell them apart
// — the failure it guards against is the day the floor rises, which is exactly when nobody is
// looking. What a test CAN hold is that the mapping exists and covers every supported version, so
// simplifying it back into a comparison against the floor goes red.
export const ADAPTER = { 2: 'v2', 3: 'v3' }

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
    // user to upgrade the runtime when what they need is to migrate the mine with an older one.
    return {
      ok: false,
      code: 'VERSION-BELOW-FLOOR',
      reason: 'below-floor',
      detail: `this mine declares artifact version ${v}; this runtime reads ${ARTIFACT_FLOOR}..${ARTIFACT_MAX}. Migrate it to 2 first with the pinned bridge runtime ${V1_BRIDGE.tag} (${V1_BRIDGE.commit}), then return`,
      version: null
    }
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

export function contractFileFor (version, schemaPath) {
  const file = CONTRACT_FILE[version]
  if (file === undefined) throw new Error(`unsupported artifact version ${version} — this runtime reads ${SUPPORTED_ARTIFACT_VERSIONS.join(', ')}`)
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
// adapter must not pretend otherwise: gaps and verify sections are POSITIONAL lists, review's
// sections are a membership set whose gate is the fixed English name every consumer matches, and
// the queue/question words are fixed vocabulary validated against the enum that declares them.
const V2_FIXED = {
  humanQueue: { waiting: 'open', closed: 'ruled', user: 'user-only', recommended: 'recommended', machine: 'machine' },
  questions: { waiting: 'open', proposed: 'proposed', closed: 'answered' },
  review: { violations: 'Fidelity violations', findings: 'Findings', adjudications: 'Adjudications', human_queue: 'Human queue' }
}

function memberOf (list, token) {
  return list.includes(token)
}

function v2Model (get, encode) {
  const errors = { humanQueue: [], questions: [], verify: [], review: [], gaps: [] }
  const fx = key => encode(key)

  // Human queue / questions: fixed words, but only if the schema that declares the vocabulary
  // actually contains them. A mine whose enum dropped `ruled` has no closed state, and answering
  // "closed is ruled" from a constant would be this module inventing the very thing it removes.
  const hqStates = pipes(get('humanqueue.enum.state')).filter(Boolean)
  const hqOwn = pipes(get('humanqueue.enum.ownership')).filter(Boolean)
  const hq = { state: {}, ownership: {} }
  for (const [role, token] of [['waiting', 'waiting'], ['closed', 'closed']]) {
    const t = fx(V2_FIXED.humanQueue[token])
    if (!memberOf(hqStates, t)) errors.humanQueue.push(`humanQueue: state role '${role}' expects the fixed v2 token '${V2_FIXED.humanQueue[token]}', absent from humanqueue.enum.state`)
    else hq.state[role] = t
  }
  for (const role of ['user', 'recommended', 'machine']) {
    const t = fx(V2_FIXED.humanQueue[role])
    if (!memberOf(hqOwn, t)) errors.humanQueue.push(`humanQueue: ownership role '${role}' expects the fixed v2 token '${V2_FIXED.humanQueue[role]}', absent from humanqueue.enum.ownership`)
    else hq.ownership[role] = t
  }

  const qStates = pipes(get('questions.enum.status')).filter(Boolean)
  const q = { state: {} }
  for (const role of ['waiting', 'proposed', 'closed']) {
    const t = fx(V2_FIXED.questions[role])
    if (!memberOf(qStates, t)) errors.questions.push(`questions: state role '${role}' expects the fixed v2 token '${V2_FIXED.questions[role]}', absent from questions.enum.status`)
    else q.state[role] = t
  }

  // verify.sections is POSITIONAL and already end-to-end positional in production
  // (verified-units.mjs). Same rule, same failure mode, one implementation.
  const verifySections = pipes(get('verify.sections'))
  const verdict = get('verify.units.verified')
  const v = { section: {}, verdict: {} }
  if (verifySections.length !== 3 || verifySections.some(n => n === '') || new Set(verifySections).size !== 3) {
    errors.verify.push('verify: verify.sections must contain exactly three distinct non-empty positional roles (units, human queue, adjudications)')
  } else {
    v.section = { units: verifySections[0], human_queue: verifySections[1], adjudications: verifySections[2] }
  }
  if (typeof verdict !== 'string' || verdict === '' || verdict.includes('|')) {
    errors.verify.push('verify: verify.units.verified must be one non-empty scalar marker')
  } else v.verdict = { covered: verdict }

  // review.sections is a membership SET in v2 and its gate is the fixed English name every
  // consumer matches. Reading it positionally here would answer differently from production for a
  // mine that lists the four in another order — a difference this adapter exists to not have.
  const reviewSections = pipes(get('review.sections')).filter(Boolean)
  const r = { section: {} }
  for (const role of ['violations', 'findings', 'adjudications', 'human_queue']) {
    const t = fx(V2_FIXED.review[role])
    if (!memberOf(reviewSections, t)) errors.review.push(`review: section role '${role}' expects the fixed v2 name '${V2_FIXED.review[role]}', absent from review.sections`)
    else r.section[role] = t
  }

  const gapsSections = pipes(get('gaps.sections'))
  const gapsKinds = pipes(get('gaps.enum.kind'))
  const g = { section: {}, kinds: new Set() }
  if (gapsSections.length !== 2 || gapsSections.some(n => n === '') || new Set(gapsSections).size !== 2) {
    errors.gaps.push('gaps: gaps.sections must contain exactly two distinct non-empty positional names (open, then accepted)')
  } else g.section = { open: gapsSections[0], accepted: gapsSections[1] }
  if (gapsKinds.length === 0 || gapsKinds.some(n => n === '') || new Set(gapsKinds).size !== gapsKinds.length) {
    errors.gaps.push('gaps: gaps.enum.kind must contain one or more distinct non-empty kind names')
  } else g.kinds = new Set(gapsKinds)

  return { humanQueue: hq, questions: q, verify: v, review: r, gaps: g, errors }
}

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
  // In the byte domain a fixed ASCII v2 token is its own encoding; keeping the hook explicit means
  // a non-ASCII fixed token added later cannot be compared across domains by accident.
  // NOT KILLABLE BY ANY FIXTURE, and said out loud so the next mutation pass does not hunt for one:
  // every fixed v2 token is ASCII, so `s => s` is behaviourally identical today. The hook guards the
  // two-encoder class that has bitten this repo repeatedly (v0.5.6, v0.5.10) and only starts paying
  // the day a fixed token is not ASCII — which is also the day nobody would think to add it.
  const encode = s => (domain === 'latin1' ? Buffer.from(s, 'utf8').toString('latin1') : s)
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
  const model = ADAPTER[version] === 'v2' ? v2Model(get, encode) : v3Model(get)
  // Extra roles are a v3 event: v3 owns the `*.state.*`/`*.section.*` namespaces, while in a v2
  // schema such a key names nothing and is an unknown key like any other, which this format has
  // always treated as a named warning rather than a failure.
  if (ADAPTER[version] === 'v3') {
    for (const name of artifacts) rejectExtraRoles(schemaMap, name, model.errors[name])
  }
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
