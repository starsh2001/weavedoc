// weavedoc upgrade — the v2→v3 migrator (slice 2 of the approved plan, §2.4).
//
// backup → transform → verify, and nothing cleverer. The BACKUP is a clean git worktree: the
// machine CHECKS cleanliness (read-only `git status`) and never runs a restore itself — recovery
// is `git restore .` printed as words, because a migrator that operates git is a migrator that
// can destroy the one copy of the past. No transaction manifest, no recovery state machine (the
// plan discarded that class): a crash mid-apply is repaired by git, which is why apply refuses
// to start without it.
//
// The TRANSFORM is total over the v2 status enum, with two deliberate stops BEFORE the first
// write (§2.4 step 0 — resolve in v2 form with the AI's help, re-run; no decision store):
//   `status: unsupported`      cards would silently become canonical (v3 has no unsupported
//                              marker to inherit), so they block: re-ground or delete in v2.
//   `resolution.type: attribute` pairs are USER-authorized 병기; stripping the record would leave
//                              two bare cards indistinguishable from a missed contradiction.
//                              "Both are right" always names a hidden axis (time, viewpoint,
//                              definition, scope — source attribution as the last resort): write
//                              that axis into the claims in v2, then re-run.
// Everything else has exactly one disposition:
//   discarded | retracted  → the card is deleted (git keeps the past), its ledger rows go with it
//   conflict               → the card becomes a LOSSLESS candidate in conflicts.json; the `ok`
//                            partner (if any survives) is the entry's target — migration MOVES an
//                            undecided disagreement, it never resolves one, so the entry is open
//                            and validate is expectedly red until the human rules
//   ok (everything left)   → the four v2 lines are removed from the frontmatter, byte-exactly —
//                            no reserialization, nothing else in the file moves
// `superseded` is a FIELD on winners, never a card class: it is stripped, and deleting its card
// would delete the current fact (the plan's own first cold-review finding).
//
// The VERIFY is one conservation equation and one exact expectation:
//   v2 cards = kept + deleted + moved-to-candidates, with zero loss and zero duplication
//   post-apply validate emits EXACTLY the CONFLICT-OPEN line the moved entries predict — anything
//   else fails the migration with the restore words (REQTAG-EMPTY from a deleted last bearer is
//   predicted in preflight so the failure never surprises)
// `decided_by: machine` resolutions are REPORTED, never blocked: whether to re-litigate a v2
// machine pick is the user's call, made after migration with the cards in hand.
import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, materialIds, truthFiles } from './mine.mjs'
import { fmLoad } from './read.mjs'
import { isFence } from './core.mjs'
import { CONFLICTS_FILE, addConflict, emptyConflicts, serializeConflicts } from './conflict-store.mjs'
import { ID_SEQUENCES_FILE, allocate, serializeIdSequences } from './id-sequences.mjs'

const W = '[ \\t\\v\\f\\r]'
const keyRe = k => new RegExp(`^${k}${W}*:`)
const DEAD_KEYS = ['status', 'conflict_with', 'resolution', 'superseded']

// The value rule the truths pass uses (unquote, strip trailing comment) — spelled here for the
// migrator's own reading; the strip below never touches values, only whole lines.
const val = line => {
  let s = line.replace(new RegExp(`^[^:]*:${W}*`), '')
  if (!s.startsWith('"')) {
    s = s.replace(new RegExp(`${W}+#.*$`), '')
    if (s.startsWith('#')) s = ''
  }
  return s.replace(new RegExp(`${W}*$`), '').replace(/^"/, '').replace(/"$/, '')
}
const normT = s => { const r = s.replace(/^t0*/, 't'); return r === 't' ? s : r }

// ---- one card, read in the byte domain (latin1 in, latin1 out = the file's own bytes) ----------
function readCard (file) {
  const raw = readFileSync(file).toString('latin1')
  const lines = raw.split('\n')
  const card = {
    file,
    id: file.slice(file.lastIndexOf('/') + 1).replace(/\.md$/, ''),
    raw,
    status: '',
    cw: [],
    resolution: '',
    hasSuperseded: false,
    claim: '',
    source: '',
    location: '',
    tags: [],
    bodyStart: -1
  }
  if (!isFence(lines[0] ?? '')) return card // validate owns naming this; the migrator just carries it
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].endsWith('\r') ? lines[i].slice(0, -1) : lines[i]
    if (isFence(line)) { card.bodyStart = i + 1; break }
    if (keyRe('status').test(line)) card.status = val(line)
    else if (keyRe('conflict_with').test(line)) {
      for (const t of line.split(/[[\], ]+/)) if (/^t[0-9]+$/.test(t)) card.cw.push(normT(t))
    } else if (keyRe('resolution').test(line)) card.resolution = val(line)
    else if (keyRe('superseded').test(line)) card.hasSuperseded = true
    else if (keyRe('claim').test(line)) card.claim = val(line)
    else if (keyRe('source').test(line)) card.source = val(line)
    else if (keyRe('location').test(line)) card.location = val(line)
    else if (keyRe('tags').test(line)) {
      for (const t of val(line).replace(/[[\]]/g, '').split(',')) {
        const s = t.replace(new RegExp(`^${W}+`), '').replace(new RegExp(`${W}+$`), '')
        if (s !== '') card.tags.push(s)
      }
    }
  }
  return card
}

// Remove the four dead lines from the FRONTMATTER only, byte-exactly: split on \n, drop whole
// lines between the fences, rejoin. Body lines spelling `status:` are content and stay.
function stripDeadLines (raw) {
  const lines = raw.split('\n')
  if (!isFence(lines[0] ?? '')) return raw
  const out = [lines[0]]
  let infm = true
  for (let i = 1; i < lines.length; i++) {
    const bare = lines[i].endsWith('\r') ? lines[i].slice(0, -1) : lines[i]
    if (infm && isFence(bare)) { infm = false; out.push(lines[i]); continue }
    if (infm && DEAD_KEYS.some(k => keyRe(k).test(bare))) continue
    out.push(lines[i])
  }
  return out.join('\n')
}

// The high-water scan, BEFORE anything is deleted (§2.3): every mine-owned surface that can carry
// an id token, as numeric evidence only. Over-broad is safe — a higher next never collides; the
// runtime bundle's own docs are excluded (they carry example ids that are nobody's cards).
function highWater (m) {
  let tmax = 0; let mmax = 0
  const feed = text => {
    for (const t of text.match(/(^|[^0-9A-Za-z])t0*([0-9]{1,15})(?![0-9])/g) ?? []) {
      const n = parseInt(/([0-9]{1,15})(?![0-9])/.exec(t)[1], 10)
      if (n > tmax) tmax = n
    }
    for (const t of text.match(/(^|[^0-9A-Za-z])m0*([0-9]{1,15})(?![0-9])/g) ?? []) {
      const n = parseInt(/([0-9]{1,15})(?![0-9])/.exec(t)[1], 10)
      if (n > mmax) mmax = n
    }
  }
  const readOr = p => { try { return readFileSync(p).toString('latin1') } catch { return '' } }
  for (const f of truthFiles(m)) feed(f.slice(f.lastIndexOf('/') + 1) + '\n' + readOr(f))
  for (const id of materialIds(m)) { feed(id); feed(readOr(join(m.materials, id, 'converted.md'))) }
  for (const n of ['index.md', 'tree.md', 'coverage.md', 'changelog.md', 'verify.md', 'verify-ledger.tsv']) feed(readOr(join(m.truths, n)))
  feed(readOr(m.catalog))
  for (const f of docFiles(m)) feed(readOr(f.path))
  return { tmax, mmax }
}

// Every file of every document, BOTH modes: the single-file artifacts AND every page under the
// multi-file trees (`draft/`, `final/` — FORMATS declares them; a scan that reads only the
// single-file spellings has not counted the inputs its declaration covers). ONE enumerator feeds
// both the high-water scan and the cited-leaving stop, so a mode added later cannot be counted by
// one consumer and missed by the other. Found by an external probe: `t250` sitting in
// `documents/d1/draft/01.md` seeded the allocator at 2 — the reissue class, live.
function docFiles (m) {
  const out = []
  let dirs = []
  try { dirs = readdirSync(m.documents) } catch { dirs = [] }
  for (const d of dirs) {
    for (const n of ['plan.md', 'draft.md', 'review.md', 'final.md']) {
      out.push({ doc: d, rel: n, path: join(m.documents, d, n) })
    }
    for (const tree of ['draft', 'final']) {
      const walk = (dir, prefix) => {
        let names = []
        try { names = readdirSync(dir) } catch { return }
        for (const nm of names) {
          const p = join(dir, nm)
          let st = null
          try { st = statSync(p) } catch { continue }
          if (st.isDirectory()) walk(p, `${prefix}${nm}/`)
          else out.push({ doc: d, rel: `${prefix}${nm}`, path: p })
        }
      }
      walk(join(m.documents, d, tree), `${tree}/`)
    }
  }
  return out
}

const gitState = root => {
  const run = args => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  try {
    if (run(['rev-parse', '--is-inside-work-tree']).trim() !== 'true') return 'no-repo'
    // The dispatcher's own admission lock (`.weavedoc/mine.lock`) is created BEFORE this command
    // runs under --apply, so it always shows as untracked here — it is the runtime's artifact of
    // THIS invocation, not user state, and counting it as dirt would make --apply refuse itself.
    // Nothing else is filtered: one path, exactly, and only the untracked spelling of it.
    const lines = run(['status', '--porcelain']).split('\n').filter(l => l.trim() !== '')
      .filter(l => !/^\?\? \.weavedoc\/mine\.lock\/?$/.test(l.trim()) && !/^\?\? "?\.weavedoc\/mine\.lock/.test(l.trim()))
    return lines.length === 0 ? 'clean' : 'dirty'
  } catch { return 'no-repo' }
}

export function cmdUpgrade (m, out, args, reindex, validateCollect) {
  const known = new Set(['--check', '--dry-run', '--apply'])
  for (const a of args) {
    if (!known.has(a)) { out(`upgrade: unknown argument '${a}' — usage: weavedoc upgrade [--check|--dry-run|--apply]`); return 2 }
  }
  const apply = args.includes('--apply')

  const pv = (fmLoad(m.project).get('version') ?? '').trim()
  const cv = (m.cfg.flat.get('version') ?? '').trim()
  if (pv === '3' && cv === '3') { out('upgrade: this mine is already schema v3 — nothing to migrate.'); return 0 }
  if (pv === '1' || cv === '1') {
    out('upgrade: this mine is schema v1, and this runtime carries no v1 reader.')
    out("  migrate with the pinned bridge runtime v0.5.21 (commit 0257167): run ITS 'weavedoc upgrade' to reach v2,")
    out('  then re-run this command to reach v3.')
    return 2
  }
  if (pv !== '2' || cv !== '2') {
    out(`upgrade: cannot read a consistent v2 declaration (project.md '${pv}' · config.yaml '${cv}') — run 'weavedoc validate' with the v2 runtime first; nothing written`)
    return 2
  }

  // ---- preflight: read every card, classify totally, scan the high water ----------------------
  const files = truthFiles(m)
  const cards = files.map(readCard)
  const noFm = cards.filter(c => c.bodyStart < 0)
  if (noFm.length > 0) {
    out(`upgrade: ${noFm.length} truth file(s) have no closed frontmatter (${noFm.map(c => c.id).join(' ')}) — present-but-unreadable input refuses migration (the v2 rule, kept); repair them in v2, then re-run. Nothing written`)
    return 2
  }
  const unsupported = cards.filter(c => c.status === 'unsupported')
  const attribute = cards.filter(c => /type[ \t]*:[ \t]*attribute/.test(c.resolution))
  const deleted = cards.filter(c => c.status === 'discarded' || c.status === 'retracted')
  const conflicts = cards.filter(c => c.status === 'conflict')
  const machinePicked = cards.filter(c => /decided_by[ \t]*:[ \t]*machine/.test(c.resolution))
  const kept = cards.filter(c => c.status !== 'discarded' && c.status !== 'retracted' && c.status !== 'conflict')
  const hw = highWater(m)
  const git = gitState(m.root)

  // Citations of cards about to leave the canonical population, predicted here for the same
  // reason (a document citing a to-be-deleted/moved card would fail post-apply as
  // PLAN-CITED-DANGLING — silently dangling citations are exactly what the id discipline exists
  // to prevent). Mechanical scan: plan.md `cited_truths` plus the `<!-- t:id -->` markers in
  // every document file; the repair is the document's, in v2, before re-running.
  const leavingDisp = new Map([...deleted, ...conflicts].map(c => [normT(c.id), c.id]))
  const leaving = new Set(leavingDisp.keys())
  const citedLeaving = []
  {
    for (const f of docFiles(m)) {
      let text = ''
      try { text = readFileSync(f.path).toString('latin1') } catch { continue }
      const hits = new Set()
      for (const t of text.match(/<!--[ \t]*t:(t[0-9]+)[ \t]*-->/g) ?? []) hits.add(normT(/t:(t[0-9]+)/.exec(t)[1]))
      const ct = /cited_truths[ \t]*:[ \t]*\[([^\]]*)\]/.exec(text)
      if (ct) for (const t of ct[1].match(/t[0-9]+/g) ?? []) hits.add(normT(t))
      const bad = [...hits].filter(h => leaving.has(h)).sort().map(h => leavingDisp.get(h))
      if (bad.length > 0) citedLeaving.push(`${f.doc}/${f.rel}: ${bad.join(' ')}`)
    }
  }

  // Required-tag survival, predicted here so the exact-validate verify never surprises: a tag
  // whose last bearer is about to be deleted or moved would fail post-apply as REQTAG-EMPTY.
  // ONE domain for the comparison: cards were read latin1 (byte fidelity for the strip), the
  // project frontmatter utf8 — comparing across them silently mismatches every Korean tag (the
  // two-encoder class, caught by this migrator's own first smoke run).
  const reqtags = (fmLoad(m.project).get('required_tags') ?? '').replace(/[[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean)
  const keptTags = new Set(kept.flatMap(c => c.tags.map(t => Buffer.from(t, 'latin1').toString('utf8'))))
  const orphanedTags = reqtags.filter(t => !keptTags.has(t))

  out(`upgrade: v2 mine — ${cards.length} card(s): keep ${kept.length} · delete ${deleted.length} (discarded/retracted) · move ${conflicts.length} (conflict → conflicts.json)`)
  if (deleted.length > 0) out(`  delete: ${deleted.map(c => `${c.id}[${c.status}]`).join(' ')}`)
  if (conflicts.length > 0) out(`  move:   ${conflicts.map(c => c.id).join(' ')} — migration MOVES an undecided disagreement, it never resolves one; validate stays red until the human rules`)
  if (machinePicked.length > 0) out(`  report: ${machinePicked.length} card(s) carry a decided_by: machine resolution (${machinePicked.map(c => c.id).join(' ')}) — a v2 machine pick survives as the standing card; re-litigating it is the user's call, after migration`)
  out(`  allocator high water: truth ${hw.tmax} · material ${hw.mmax} (next = max+1; a deleted number is never granted again)`)

  let blocked = false
  if (unsupported.length > 0) {
    blocked = true
    out(`  ✗ BLOCKED — ${unsupported.length} card(s) are status: unsupported (${unsupported.map(c => c.id).join(' ')}): in v3 a card that exists IS canonical, so migrating one would silently promote broken grounding. Re-ground or delete each in v2 (the AI can help), then re-run. Nothing written`)
  }
  if (attribute.length > 0) {
    blocked = true
    out(`  ✗ BLOCKED — ${attribute.length} card(s) carry a resolution.type: attribute (${attribute.map(c => c.id).join(' ')}): the user authorized 병기, and stripping that record leaves two bare cards indistinguishable from a missed contradiction. "Both are right" always names a hidden axis (time · viewpoint · definition · scope; source attribution as the last resort) — write that axis into the claims in v2, then re-run. Nothing written`)
  }
  if (citedLeaving.length > 0) {
    blocked = true
    out(`  ✗ BLOCKED — document(s) cite card(s) this migration would delete or move: ${citedLeaving.join(' · ')}. A citation left dangling is the exact corruption the id discipline exists to prevent — repoint or remove those citations in v2 (the AI can help), then re-run. Nothing written`)
  }
  if (orphanedTags.length > 0) {
    out(`  ⚠ after migration required_tags [${orphanedTags.join(', ')}] would have no live bearer (their cards are deleted or moved) — apply would fail its exact-validate verify; extract the topic from a material or drop the tag in v2 first`)
  }
  if (git !== 'clean') {
    out(git === 'dirty'
      ? "  ⚠ the mine's git worktree is DIRTY — the clean worktree IS the backup, so --apply refuses; commit or stash first"
      : '  ⚠ this mine is not inside a git repository — there is no backup to restore from, so --apply refuses; put the mine under git first')
  }

  if (!apply) {
    out(blocked ? 'upgrade: blocked — resolve the items above in v2 form, then re-run.' : "upgrade: ready — run 'weavedoc upgrade --apply' (requires a clean git worktree; recovery is 'git restore .' plus deleting the two new .weavedoc-state files).")
    return blocked ? 2 : 0
  }
  if (blocked) { out('upgrade: refusing --apply — resolve the blocked items above in v2 form, then re-run. Nothing written'); return 2 }
  if (git !== 'clean') { out('upgrade: refusing --apply — the clean git worktree is the backup (see above). Nothing written'); return 2 }
  if (orphanedTags.length > 0) { out('upgrade: refusing --apply — the required_tags above would be orphaned and the exact-validate verify would fail; fix in v2 first. Nothing written'); return 2 }

  // ---- transform (the mine lock is already held by the dispatcher's admission gate) -----------
  // 1. the allocator, from the pre-deletion high water.
  let seq = { conflict: 1, material: hw.mmax + 1, truth: hw.tmax + 1 }

  // 2. deleted cards go, and their MACHINE-ledger rows go with them (other rows byte-identical).
  // Two ledgers owe this hygiene, for the same reason: a row for a card that no longer exists is
  // a dangling reference validate rightly rejects, and both ledgers are machine-maintained (the
  // verify sidecar by attest, coverage by map) — so the migrator that deletes the card cleans the
  // rows, exactly as it would not dare touch the HUMAN ledgers (questions/verify.md prose/gaps).
  // Measured on the real mine's rehearsal: 26 discarded cards left 12 dangling coverage mentions,
  // and the exact-validate verify failed the migration until this existed.
  const deletedIds = new Set(deleted.map(c => c.id))
  for (const c of deleted) unlinkSync(c.file)
  const ledgerPath = join(m.truths, m.ledgerFile())
  if (existsSync(ledgerPath)) {
    const rows = readFileSync(ledgerPath).toString('latin1').split('\n')
    const keptRows = rows.filter(r => {
      const id = r.split('\t')[0] ?? ''
      return !(deletedIds.has(id) || deletedIds.has(normT(id)))
    })
    writeFileSync(ledgerPath, keptRows.join('\n'), 'latin1')
  }
  // coverage.md: remove the deleted ids from mapping lines; a bullet whose EVERY truth id was
  // deleted is dropped whole (its extraction left the mine — an id-less mapping row would read as
  // a malformed entry, not as history). Lines without a deleted id stay byte-identical.
  let covDropped = 0; let covTrimmed = 0
  const covPath = join(m.truths, 'coverage.md')
  if (existsSync(covPath)) {
    const deletedNorm = new Set([...deletedIds].map(normT))
    const lines = readFileSync(covPath).toString('latin1').split('\n')
    const outLines = []
    for (const line of lines) {
      const ids = line.match(/t[0-9]+/g) ?? []
      const hit = ids.some(t => deletedNorm.has(normT(t)))
      if (!hit) { outLines.push(line); continue }
      const survivors = ids.filter(t => !deletedNorm.has(normT(t)))
      if (survivors.length === 0) { covDropped++; continue }
      let next = line
      for (const t of ids) {
        if (deletedNorm.has(normT(t))) {
          next = next.replace(new RegExp(`${t}[ \\t]*,[ \\t]*`), '').replace(new RegExp(`[ \\t]*,[ \\t]*${t}(?![0-9])`), '').replace(new RegExp(`${t}(?![0-9])`), '')
        }
      }
      covTrimmed++
      outLines.push(next)
    }
    writeFileSync(covPath, outLines.join('\n'), 'latin1')
  }

  // 3. conflict cards become entries: connected components over conflict_with, the surviving-ok
  // partners as targets (a reference to a just-deleted card is moot and simply absent), every
  // conflict card as a lossless candidate. All-conflict components get targets=[] — §2.2 ①,
  // undecided, which is a legal open state and not "resolved to nothing".
  const keptIds = new Set(kept.map(c => c.id))
  const conflictIds = new Set(conflicts.map(c => c.id))
  const parent = new Map()
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x) } return x }
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra, rb) }
  const seen = new Set()
  for (const c of conflicts) { parent.set(c.id, c.id); seen.add(c.id) }
  for (const c of conflicts) {
    for (const ref of c.cw) {
      const rid = [...keptIds, ...conflictIds].find(x => normT(x) === ref) ?? null
      if (rid === null) continue
      if (!parent.has(rid)) { parent.set(rid, rid); seen.add(rid) }
      union(c.id, rid)
    }
  }
  const comps = new Map()
  for (const x of seen) {
    const r = find(x)
    if (!comps.has(r)) comps.set(r, [])
    comps.get(r).push(x)
  }
  let store = emptyConflicts()
  const today = new Date().toISOString().slice(0, 10)
  const compKeys = [...comps.keys()].sort()
  for (const k of compKeys) {
    const members = comps.get(k).sort()
    const targets = members.filter(id => keptIds.has(id)).sort()
    const cands = members.filter(id => conflictIds.has(id)).sort()
      .map(id => conflicts.find(c => c.id === id))
      .map(c => {
        const cand = { claim: Buffer.from(c.claim, 'latin1').toString('utf8'), source: c.source }
        if (c.location !== '') cand.location = Buffer.from(c.location, 'latin1').toString('utf8')
        const body = c.raw.split('\n').slice(c.bodyStart).join('\n').replace(/^\n+/, '').replace(/\n+$/, '')
        if (body !== '') cand.quote = Buffer.from(body, 'latin1').toString('utf8')
        if (c.tags.length > 0) cand.tags = c.tags.map(t => Buffer.from(t, 'latin1').toString('utf8'))
        cand.note = `v2 card ${c.id}, moved by migration`
        return cand
      })
    if (cands.length === 0) continue
    const granted = allocate(seq, 'conflict')
    seq = granted.next
    const added = addConflict(store, { id: granted.id, targets, candidates: cands, created: today })
    if (!added.ok) {
      out(`upgrade: internal — a moved conflict entry failed the store contract (${added.diagnostics.map(d => d.code).join(',')}); state is partially written, restore with: git restore . && rm -rf .weavedoc-state`)
      return 1
    }
    store = added.store
  }
  for (const c of conflicts) unlinkSync(c.file)

  // 4. surviving cards lose exactly the four lines, nothing else moves.
  let stripped = 0
  for (const c of kept) {
    const next = stripDeadLines(c.raw)
    if (next !== c.raw) { writeFileSync(c.file, next, 'latin1'); stripped++ }
  }

  // 5. the two state files, then both version fields (project.md AND config.yaml — they are two
  // records of one fact and the gate checks agreement).
  mkdirSync(join(m.root, '.weavedoc-state'), { recursive: true })
  writeFileSync(join(m.root, ID_SEQUENCES_FILE), serializeIdSequences(seq), 'utf8')
  writeFileSync(join(m.root, CONFLICTS_FILE), serializeConflicts(store), 'utf8')
  const flip = file => {
    const raw = readFileSync(file).toString('latin1')
    writeFileSync(file, raw.replace(/^version:[ \t]*2[ \t]*$/m, 'version: 3'), 'latin1')
  }
  flip(m.project)
  flip(m.config)

  // 6. regenerated views, one best-effort log line (a human record — its failure changes nothing).
  reindex()
  try {
    const line = deleted.length > 0
      ? `- removed: ${deleted.map(c => c.id).join(' ')} (v2→v3 migration — discarded/retracted cards deleted; ${conflicts.length} conflict card(s) moved to conflicts.json) (${today})\n`
      : `- edited: v2→v3 migration — ${kept.length} card(s) kept, ${conflicts.length} moved to conflicts.json (${today})\n`
    const cl = join(m.truths, 'changelog.md')
    writeFileSync(cl, readFileSync(cl).toString('latin1') + line, 'latin1')
  } catch { out('  (mine-log line could not be appended — a human record only; nothing else is affected)') }

  // ---- verify: the conservation equation, then the exact validate expectation ------------------
  const after = truthFiles(m).length
  if (after !== kept.length || kept.length + deleted.length + conflicts.length !== cards.length) {
    out(`upgrade: ✗ conservation failed — v2 ${cards.length} = kept ${kept.length} + deleted ${deleted.length} + moved ${conflicts.length}, but ${after} file(s) remain. Restore with: git restore . && rm -rf .weavedoc-state`)
    return 1
  }
  const collected = []
  const vrc = validateCollect(s => collected.push(typeof s === 'string' ? s : s.toString('utf8')))
  const expectOpen = store.open.length > 0
  const problems = collected.filter(l => /^\s*\[[A-Z0-9-]+\]/.test(l))
  const unexpected = problems.filter(l => !l.includes('[CONFLICT-OPEN]'))
  const openOk = expectOpen ? problems.some(l => l.includes('[CONFLICT-OPEN]')) : problems.length === 0
  if (unexpected.length > 0 || !openOk || (expectOpen ? vrc === 0 : vrc !== 0)) {
    out('upgrade: ✗ the migrated mine does not validate to the EXACT expected state:')
    for (const l of (unexpected.length > 0 ? unexpected : problems)) out(`  ${l.trim()}`)
    out('  expected: ' + (expectOpen ? `only [CONFLICT-OPEN] with ${store.open.length} open entr(ies)` : 'a clean validate'))
    out('  restore with: git restore . && rm -rf .weavedoc-state')
    return 1
  }
  const covNote = (covDropped + covTrimmed) > 0 ? ` · coverage rows scrubbed (${covDropped} dropped, ${covTrimmed} trimmed)` : ''
  out(`upgrade: ✓ migrated — kept ${kept.length} (${stripped} stripped) · deleted ${deleted.length} · moved ${conflicts.length} into ${store.open.length} open entr(ies) · allocator next t${seq.truth}/m${seq.material}/c${seq.conflict}${covNote}`)
  if (expectOpen) out(`  validate is red by design (${store.open.length} open conflict(s)) until the human rules — resolution is deletion of the entry`)
  out("  the past is in git; this migration's inverse is 'git restore . && rm -rf .weavedoc-state'")
  return 0
}
