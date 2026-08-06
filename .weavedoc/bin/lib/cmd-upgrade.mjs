// weavedoc upgrade [--check|--dry-run|--apply] [--from 0.1] — a v1 mine to schema 2.
//
// THREE MODES, ONE SCAN. --check, --dry-run and --apply all read the same scanUpgrade(), so they
// can never disagree about what the migration IS. --apply is a staged transaction: every touched
// path is snapshotted once before its first edit, every created path recorded, and the whole thing
// answers to the same full validation everything else answers to — fail and the mine is
// byte-identical to before.
import { existsSync, statSync, readFileSync, appendFileSync, mkdirSync, mkdtempSync, rmSync, cpSync, readdirSync } from 'node:fs'
import { splitLines, canonId, isFence, U, M } from './core.mjs'
import { nocomment, sectionAll } from './sections.mjs'
import { join, materialIds, docIds, fm } from './mine.mjs'
import { fmvB, clearFileCaches, loadConfig } from './read.mjs'
import { ledgerRows, ledgerIndex } from './verify.mjs'
import { scanVerifiedUnits } from './cmd-scope.mjs'
import { writeAtomic, writeAtomicX } from './write.mjs'
import { acquireLedgerLock, releaseLedgerLock } from './lock.mjs'

// The two operations a fault can land on, injectable exactly the way consecrate's and retag's are.
// `write` is stage+rename with false PROMOTED to a throw (§11 2026-08-05): the direct writeFileSync
// this replaces threw EACCES out of the whole command mid-migration and left the mine MIXED —
// review_legacy markers inserted, version still 1, the backup dir abandoned (measured, the v0.4.0
// external review's P0). bash never had that failure shape: its writes replace files by rename.
export const realOps = {
  write: (p, buf) => writeAtomicX(p, buf),
  restore: (from, to) => cpSync(from, to, { recursive: true }),
  // The rename phase's two primitives, injectable since v0.5.1: a copy that dies partway and a
  // removal that fails are the faults that distinguish "intent registered before the first byte"
  // from "registered after" — and only a seam can produce them on demand.
  copy: (from, to) => cpSync(from, to, { recursive: true }),
  rm: p => rmSync(p, { recursive: true, force: true })
}

const readB = p => { try { return readFileSync(p).toString('latin1') } catch { return '' } }
const isFileAt = p => { try { return statSync(p).isFile() } catch { return false } }
const isDirAt = p => { try { return statSync(p).isDirectory() } catch { return false } }
const exists = p => { try { statSync(p); return true } catch { return false } }
const bytewise = (a, b) => Buffer.compare(Buffer.from(a, 'latin1'), Buffer.from(b, 'latin1'))
const uniqSort = xs => [...new Set(xs)].filter(x => x !== '').sort(bytewise)
const truthGlob = m => {
  try { return readdirSync(m.truths).filter(n => /^t[0-9].*\.md$/.test(n)).sort(bytewise) } catch { return [] }
}

// ---- the Verified units row reader, shared by the scan and the apply -------------------------
// Success evidence means COMPLETE evidence: `passes 1/2` is a run that stopped short, and stamping
// it verified would erase unfinished work from the debt (v0.3.1). Anything that names units without
// complete success is handed to a human — the machine never certifies what the ledger did not say.
function verdictRows (m) {
  const vd = (m.sch.get('verify.units.verified') || 'verified')
  const body = sectionAll(nocomment(readB(join(m.truths, 'verify.md'))), 'Verified units')
  const rows = []
  for (const raw of splitLines(body)) {
    const line = raw.split('Â·').join(' ').split('·').join(' ')
    if (!/^[ \t\v\f\r]*[|-]/.test(line)) continue
    if (/^[ \t\v\f\r]*\|[ \t\v\f\r|:-]*$/.test(line)) continue
    if (!/[mt][0-9]/.test(line)) continue
    const v = line.replace(/[ \t\v\f\r|*.-]+$/, '')
    if (new RegExp(`(^|[^a-z_])${vd}$`).test(v.toLowerCase())) continue
    let ok2 = false
    const pm = /passes[ \t\v\f\r]*([0-9]+)\/([0-9]+)/.exec(line)
    if (pm && +pm[1] === +pm[2] && +pm[2] > 0) ok2 = true
    rows.push({ ok2, raw, line })
  }
  return rows
}

// Materials whose OWN v1 record says verified. The material lane's v1 evidence is the material's
// `status: verified` — an m-id mentioned in the truths-lane markdown ledger is extraction scope,
// not a conversion verdict (WD-COR-001), and minting m rows from that mention demoted mandatory
// debt into non-blocking legacy backlog (v0.3.2).
const v1VerifiedMaterials = m => materialIds(m)
  .filter(id => isFileAt(join(m.materials, id, 'converted.md')) && fmvB(join(m.materials, id, 'converted.md'), 'status') === 'verified')

// Ledger coverage for the MATERIAL lane is origin-aware (v0.3.3): an origin-less m legacy row (a
// pre-0.3.2 mint) is not material evidence, so it must not block the correct row on a resumed
// migration — only a real verdict, or the material origin token, covers this lane.
function materialCovered (m) {
  const tok = m.sch.get('verify.ledger.origin.material') || 'v1-material-frontmatter'
  return uniqSort(ledgerRows(join(m.truths, m.ledgerFile())).map(r => r.split('\t'))
    .filter(f => /^m/.test(f[0]) && (f[2] !== 'legacy-unbound' || f[3] === tok)).map(f => f[0]))
}

const missingTruthRows = m => {
  const scan = scanVerifiedUnits(m)
  const vids = uniqSort(scan.V.filter(x => /^t[0-9]/.test(x)))
  const scov = uniqSort(ledgerRows(join(m.truths, m.ledgerFile())).map(r => r.split('\t')[0]))
  return vids.filter(x => !scov.includes(x))
}
const missingMatRows = m => {
  const cov = materialCovered(m)
  return uniqSort(v1VerifiedMaterials(m)).filter(x => !cov.includes(x))
}

// ---- the scan ---------------------------------------------------------------------------------
export function scanUpgrade (m) {
  const items = []
  const add = (kind, display) => items.push([kind, display])
  const pv = fmvB(m.project, 'version')
  const cv = m.cfg.flat.get('version') ?? ''
  if (pv === '1') add('version', U('project.md version: 1 → 2'))
  if (cv === '1') add('version', U('config.yaml version: 1 → 2'))
  for (const b of materialIds(m)) {
    const c = canonId(b)
    if (c !== null && b !== c) add('rename', M`materials/${b} → ${c} (folder, id:, catalog, strict references)`)
  }
  for (const n of truthGlob(m)) {
    const b = n.replace(/\.md$/, '')
    const c = canonId(b)
    if (c !== null && b !== c) add('rename', M`truths/${b} → ${c} (file, id:, strict references)`)
  }
  if (isFileAt(join(m.truths, 'verify.md'))) {
    for (const r of verdictRows(m)) {
      if (r.ok2) add('verdict', M`Verified units row gains its trailing verdict word: ${r.line}`)
      else add('verdict-manual', M`row names units but shows no COMPLETE success evidence (passes N/N with N=N) — review by hand: ${r.line}`)
    }
    const stripped = nocomment(readB(join(m.truths, 'verify.md')))
    for (const b of (m.sch.get('verify.sections') ?? '').split('|')) {
      if (b === '') continue
      if (!new RegExp(`^#{1,2}[ \t]+${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \t]*$`, 'm').test(stripped)) {
        add('verify-section', M`truths/verify.md gains an empty section: ## ${b}`)
      }
    }
  }
  if (/^[ \t\v\f\r]+repeat:[ \t\v\f\r]*[0-9]/m.test(readB(m.config))) {
    add('repeat', U('config scalar repeat → per-scale map (skip 0 · light/standard keep the scalar · full is one stricter)'))
  }
  // v1 reviews are digest-less by definition; on schema 2 they need the audit marker or the
  // unsealed-review block would refuse the very mine the migration just produced. GATED ON v1 —
  // this item is the one that laundered stripped seals into "history" when it ran ungated (v0.3.2).
  if (pv === '1' || cv === '1') {
    for (const d of docIds(m)) {
      const f = join(m.documents, d, 'review.md')
      if (!isFileAt(f)) continue
      if (fmvB(f, 'reviewed_digest') !== '' || fmvB(f, 'review_legacy') !== '') continue
      add('review-legacy', M`documents/${d}/review.md → marked review_legacy (v1 history, digest-less; new rounds seal via seal-review)`)
    }
  }
  for (const d of docIds(m)) {
    const f = join(m.documents, d, 'review.md')
    if (!isFileAt(f)) continue
    const n = countHistoryBrackets(readB(f))
    if (n > 0) add('review-history', M`documents/${d}/review.md: ${n} bracketed kind record(s) outside the gate → brackets removed (record form; VERIFY none was an open violation)`)
  }
  // Ledger materialization belongs to the v1 migration ONLY: on a v2 mine a markdown row with no
  // sidecar twin is the LEGAL legacy-unbound state (preserved, re-verified by risk), not pending
  // work — otherwise "nothing to do" would be unreachable for any mine with history.
  if (pv === '1' || cv === '1') {
    const miss = missingTruthRows(m)
    if (miss.length) add('ledger', M`${miss.length} markdown-verified truth unit(s) → verify-ledger.tsv rows verdict=legacy-unbound origin=${m.sch.get('verify.ledger.origin.truths') || 'v1-truths-ledger'} (digest NOT back-stamped — §11 decision)`)
    const mmiss = missingMatRows(m)
    if (mmiss.length) add('ledger', M`${mmiss.length} material(s) with v1 status: verified → verify-ledger.tsv rows verdict=legacy-unbound origin=${m.sch.get('verify.ledger.origin.material') || 'v1-material-frontmatter'}`)
  }
  return items
}

// A bracketed violation kind sitting OUTSIDE the gate section is a RECORD, not an open violation —
// on schema 2 it loses its brackets so the zone rule stops reading it as one. Counting and
// rewriting share this walk so the scan and the apply cannot disagree about what they found.
const KINDRX = /\[[A-Za-z_ -]+\]/
function historyWalk (text, rewriteFn) {
  let sec = ''
  const out = []
  let n = 0
  for (const line of splitLines(text)) {
    if (/^#/.test(line)) {
      sec = line.replace(/^#+[ \t\v\f\r]*/, '').replace(/[ \t\v\f\r]*$/, '')
      out.push(line); continue
    }
    if (sec !== 'Fidelity violations' && /^[ \t\v\f\r]*[-|*].*\[[A-Za-z_ -]+\]/.test(line)) {
      const mm = KINDRX.exec(line)
      const k = mm[0].slice(1, -1)
      const kn = k.replace(/[^a-zA-Z]/g, '').toLowerCase()
      if (kn === 'contradiction' || kn === 'unsupported' || kn === 'missingrequired') {
        n++
        out.push(rewriteFn ? line.replace(KINDRX, k) : line)
        continue
      }
    }
    out.push(line)
  }
  return { n, text: out.length ? out.join('\n') + '\n' : '' }
}
const countHistoryBrackets = t => historyWalk(nocomment(t), null).n

// ---- the command ------------------------------------------------------------------------------
export function cmdUpgrade (m, out, argv, runReindex, runValidate, ops = realOps) {
  let mode = '--check'
  let modeSet = false
  let from = '0.1'
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--check' || a === '--dry-run' || a === '--apply') {
      // ONE mode per invocation (review #10). Last-wins was a hidden rule that a second parser
      // could not share: the dispatcher's admission gate reads "--apply anywhere" while this loop
      // kept the LAST flag, so `upgrade --apply --check` ran read-only but was refused by the
      // mine lock. Two parsers over one argv agree only when the ambiguous spelling is an error.
      if (modeSet && mode !== a) {
        out('usage: weavedoc upgrade [--check|--dry-run|--apply] [--from 0.1] — one mode per invocation')
        return 2
      }
      mode = a
      modeSet = true
    } else if (a === '--from') { i++; from = argv[i] ?? '' } else {
      out('usage: weavedoc upgrade [--check|--dry-run|--apply] [--from 0.1]')
      return 2
    }
  }
  const sv = m.schemaVer()
  if (from !== '0.1') { out(`upgrade: only --from 0.1 is supported (v1 → schema ${sv})`); return 2 }
  const badVersionWhy = v => {
    if (v === '1' || v === sv) return ''
    if (v === '' || /[^0-9]/.test(v)) return `version record '${v === '' ? '<missing>' : v}' is not a version this migration understands — a v1 mine says 1, a current mine says ${sv}; fix the version: fields in project.md/config.yaml first`
    if (Number(v) > Number(sv)) return `this mine declares schema ${v}, newer than this runtime (schema ${sv}) — refusing to touch a format this code cannot read; use a newer runtime`
    return `version record '${v}' is not a version this migration understands — supported records are 1 and ${sv}`
  }
  // The scan and the apply both read the ledger to decide which rows the migration MINTS. On a
  // ledger that exists but cannot be read, that read comes back empty, so every markdown-verified
  // unit reads as missing its row — and the apply would mint duplicates into (or over) a file whose
  // real contents are unknown. Migrating evidence you cannot read is not a migration (v0.5.1).
  // The HEADLESS state voids the sidecar for the same reason (v0.5.1 cold review): scope and
  // validate both declare a headless ledger contributes nothing, and this command's scan was a
  // third consumer quietly computing a plan from rows the other two had ruled void.
  const ledgerVoidWhy = mm => {
    const li = ledgerIndex(join(mm.truths, mm.ledgerFile()))
    if (li.state === 'unreadable') return `truths/${mm.ledgerFile()} exists but cannot be read (${li.code}) — refusing every mode: the migration mints ledger rows from what the ledger already holds, and that is unknown. Fix the file first (permissions, or a directory wearing its name)`
    if (li.headless > 0) return `truths/${mm.ledgerFile()} holds ${li.headless} row(s) with no id — an unattributable row could be any unit's latest verdict, so the sidecar is void and there is nothing sound to migrate from. Run validate (it names the row), repair it, then re-run`
    return ''
  }

  // ONE PREFLIGHT, CALLED ONCE PER INVOCATION (v0.5.4, review #8 P1-1). Every judgment this
  // command makes about the mine lives here: the closed version matrix, the already-migrated exit,
  // the ledger-void refusals, and the scan. It used to be written out TWICE — once before the lock
  // and once inside it (v0.5.3's answer to "the plan was stale") — and the copies were not equal:
  // the schema-2 and empty-plan exits stayed OUTSIDE, so a second `--apply` reading the winner's
  // MID-TRANSACTION schema 2 answered "nothing to do" rc 0 in ZERO seconds, never waiting for the
  // lock, and the winner then rolled back — a success report over a migration that never happened
  // (measured). Two spellings of one decision is the drift class this file keeps meeting; there is
  // one spelling now, and for --apply it runs UNDER the lock.
  // -> { rc } when the command is finished, or { items } when the migration may proceed.
  const preflight = mm => {
    // The version matrix is CLOSED (v0.3.3): each record is 1 or the current schema and nothing
    // else. `version: banana` used to skip the numeric future-check and read as "already at schema
    // 2" with exit 0 — a success report over a mine this migration cannot even classify.
    const pvx = fmvB(mm.project, 'version')
    const cvx = mm.cfg.flat.get('version') ?? ''
    for (const v of [pvx, cvx]) {
      const w = badVersionWhy(v)
      if (w) { out(`upgrade: ${w}`); return { rc: 2 } }
    }
    // A mine already at schema 2 gets "nothing to do" WITHOUT scanning: the scan's items are
    // migration writes, and running them on a v2 mine was the seal-laundering path — strip the
    // seals, run --apply, and the review_legacy marker stamped tamper as history.
    if (pvx !== '1' && cvx !== '1') { out(`upgrade: nothing to do — the mine is already at schema ${sv}`); return { rc: 0 } }
    const why = ledgerVoidWhy(mm)
    if (why) { out(`upgrade: ${why}`); return { rc: 1 } }
    const items = scanUpgrade(mm)
    if (items.length === 0) { out(`upgrade: nothing to do — the mine is already at schema ${sv}`); return { rc: 0 } }
    return { items }
  }

  // The READ-ONLY modes take no lock — they write nothing, and a report that had to queue behind a
  // migration would be a worse tool. They read what is there when they run, and say so.
  if (mode !== '--apply') {
    const pf = preflight(m)
    if (pf.rc !== undefined) return pf.rc
    const n = pf.items.length
    if (mode === '--check') {
      out(`upgrade --check: ${n} migration item(s) v1 → schema ${sv}  (read-only — nothing written)`)
      for (const [k, disp] of pf.items) out(Buffer.from(`  [${k}] ${disp}`, 'latin1'))
      out('  next: weavedoc upgrade --dry-run (full plan) · weavedoc upgrade --apply (staged, rollback-safe)')
      return 1
    }
    out(`upgrade --dry-run: ${n} item(s), 0 write(s) — the plan:`)
    for (const [, disp] of pf.items) out(Buffer.from(`  would: ${disp}`, 'latin1'))
    out(`  expected after apply: project at schema ${sv} · validate clean · history preserved as legacy-unbound, never back-stamped`)
    return 1
  }

  // --apply: THE LOCK COMES FIRST, before this command has looked at the mine at all (v0.5.4).
  // It holds the ledger lock for its whole transaction (review #6 P0-2) because this command
  // plans FROM the ledger and REWRITES it whole in step 6; measured before the lock joined:
  // upgrade --apply sailed straight through a LIVE lock (rc 0, ledger written, zero mentions), and
  // a concurrent attest's created-here rollback then unlinked the file with upgrade's freshly
  // minted legacy rows inside — upgrade had already reported success, and validate stayed green.
  // One lock, one module, every writer: attest and this transaction take the same mkdir.
  // The ONE precondition checked before the lock, and it is not a judgment about mine CONTENT —
  // it is about the lock's own path (cmd-attest.mjs makes the same exception for the same reason).
  // Without it, a mine with no truths/ answered a question nobody asked: mkdir failed ENOENT and
  // the command talked about a lock the user never made, at rc 1, where every other refusal about
  // an unusable mine is rc 2 (cold review of this patch — the one shape that changed with no
  // concurrent writer anywhere).
  if (!isDirAt(m.truths)) { out('upgrade --apply: no truths/ directory — there is no ledger to migrate into and nothing to lock; fix the mine layout first'); return 2 }
  const lockPath = `${join(m.truths, m.ledgerFile())}.lock`
  const lockRel = lockPath.startsWith(`${m.root}/`) ? lockPath.slice(m.root.length + 1) : lockPath
  const lockWhy = acquireLedgerLock(lockPath, lockRel)
  if (lockWhy) { out(`upgrade --apply: ${lockWhy}. Nothing written`); return 1 }
  try {
    // Caches cleared and the CONFIG SNAPSHOT REBUILT before the preflight reads anything: m.cfg is
    // parsed at open time, so without the rebuild the judgment under the lock would read the same
    // stale bytes as one taken before it.
    clearFileCaches()
    const mf = { ...m, cfg: loadConfig(m.config) }
    const pf = preflight(mf)
    if (pf.rc !== undefined) return pf.rc
    return upgradeApply(mf, out, pf.items.length, runReindex, runValidate, ops)
  } finally {
    releaseLedgerLock(lockPath)
  }
}

// ---- the staged, rollback-safe transaction ----------------------------------------------------
function upgradeApply (m, out, nitems, runReindex, runValidate, ops = realOps) {
  const today = new Date().toISOString().slice(0, 10)
  // The backup directory is ALWAYS FRESH (§11 2026-08-05, v0.5.2). It was date+PID, and
  // mkdirSync(recursive) accepted an existing directory of that name — at which point bkup()'s
  // "already snapshotted this run" dedup mistook the stale files inside for this run's snapshots,
  // skipped the real ones, and a rollback then RESTORED THE STALE BYTES while printing
  // "byte-identical to before" and deleting the old restore point (external review P0-2; PIDs
  // recycle in containers, so date+PID collides for real). mkdtempSync cannot return an existing
  // path, which removes the whole class rather than narrowing it.
  const bakPrefix = `${m.root}/.upgrade-backup-${today}.`
  const rel = p => (p.startsWith(`${m.root}/`) ? p.slice(m.root.length + 1) : p)
  const created = []; const touched = []
  const write = (p, s) => ops.write(p, Buffer.from(s, 'latin1'))

  // Every touched path is snapshotted ONCE before its first edit; every created path is recorded.
  // Rollback = remove created, restore touched, in that order. A path this transaction CREATED is
  // never snapshotted — that would make rollback resurrect the mid-transaction copy right after the
  // created-removal pass deleted it.
  const bkup = p => {
    if (!exists(`${m.root}/${p}`)) return
    if (exists(`${bak}/${p}`)) return
    if (created.includes(p)) return
    mkdirSync(`${bak}/${p}`.replace(/\/[^/]*$/, ''), { recursive: true })
    cpSync(`${m.root}/${p}`, `${bak}/${p}`, { recursive: true })
    touched.push(p)
    appendFileSync(`${bak}/.touched`, p + '\n')
  }
  const crtd = p => { created.push(p); appendFileSync(`${bak}/.created`, p + '\n') }

  // Byte equality between a live path and its snapshot — file or whole directory (material folders
  // are snapshotted as folders). The rollback POSTCONDITION runs on this: restored means verified
  // equal, never assumed (§11 2026-08-05).
  const samePath = (a, b) => {
    let sa, sb
    try { sa = statSync(a); sb = statSync(b) } catch { return false }
    if (sa.isFile() && sb.isFile()) {
      try { return readFileSync(a).equals(readFileSync(b)) } catch { return false }
    }
    if (sa.isDirectory() && sb.isDirectory()) {
      let na, nb
      try { na = readdirSync(a).sort(); nb = readdirSync(b).sort() } catch { return false }
      if (na.length !== nb.length || na.some((n, i) => n !== nb[i])) return false
      return na.every(n => samePath(join(a, n), join(b, n)))
    }
    return false
  }
  // Restore everything, then VERIFY: every created path gone, every touched path byte-equal to its
  // snapshot. Any miss preserves the backup and blocks loudly — this command never claims "as
  // before" it did not check. Returns the list of paths that failed the postcondition.
  const rollback = () => {
    const failed = []
    for (const p of created) {
      try { rmSync(`${m.root}/${p}`, { recursive: true, force: true }) } catch { failed.push(p) }
    }
    for (const p of touched) {
      try {
        rmSync(`${m.root}/${p}`, { recursive: true, force: true })
        ops.restore(`${bak}/${p}`, `${m.root}/${p}`)
      } catch { failed.push(p) }
    }
    for (const p of created) { if (!failed.includes(p) && exists(`${m.root}/${p}`)) failed.push(p) }
    for (const p of touched) { if (!failed.includes(p) && !samePath(`${m.root}/${p}`, `${bak}/${p}`)) failed.push(p) }
    if (failed.length === 0) rmSync(bak, { recursive: true, force: true })
    return failed
  }

  // Canonicalise STRICT reference fields and the ledgers — NEVER prose. Two passes, because a
  // boundary regex can eat a shared separator between adjacent ids.
  const canonRefs = (o, nw) => {
    const bnd = (s, oo, nn) => s.replace(new RegExp(`(^|[^0-9A-Za-z])${oo}([^0-9A-Za-z]|$)`, 'g'), `$1${nn}$2`)
    for (let pass = 0; pass < 2; pass++) {
      for (const nfile of truthGlob(m)) {
        const f = join(m.truths, nfile)
        bkup(rel(f))
        write(f, splitLines(readB(f)).map(l =>
          /^[ \t\v\f\r]*(source|conflict_with|derived_from|corroborated_by|winner|corrects)[ \t\v\f\r]*:/.test(l) ? bnd(l, o, nw) : l
        ).join('\n') + '\n')
      }
      if (isFileAt(`${m.root}/catalog.md`)) {
        bkup('catalog.md')
        write(`${m.root}/catalog.md`, readB(`${m.root}/catalog.md`)
          .replace(new RegExp(`\\|([ \t\v\f\r]*)${o}([ \t\v\f\r]*)\\|`, 'g'), `|$1${nw}$2|`))
      }
      const cov = join(m.truths, 'coverage.md')
      if (isFileAt(cov)) { bkup(rel(cov)); write(cov, bnd(readB(cov), o, nw)) }
      for (const dd of docIds(m)) {
        const p = join(m.documents, dd, 'plan.md')
        if (!isFileAt(p)) continue
        bkup(rel(p))
        write(p, splitLines(readB(p)).map(l =>
          /^[ \t\v\f\r]*cited_truths[ \t\v\f\r]*:/.test(l) ? bnd(l, o, nw) : l).join('\n') + '\n')
      }
    }
  }

  // PRECHECK: every rename target must be free BEFORE one byte moves — free on disk AND free among
  // the other renames. `t01` and `t1` both canonicalise to t001, and a sequential apply would have
  // the second silently overwrite the first (v0.3.1).
  const pairs = []
  const mt = new Set(); const tt = new Set()
  for (const b of materialIds(m)) {
    const c = canonId(b)
    if (c === null || b === c) continue
    if (exists(join(m.materials, c))) { out(`upgrade: rename collision — materials/${c} already exists next to materials/${b}; resolve by hand (nothing written)`); return 1 }
    if (mt.has(c)) { out(`upgrade: rename collision — two material folders both canonicalize to ${c}; resolve by hand (nothing written)`); return 1 }
    mt.add(c); pairs.push(['m', b, c])
  }
  for (const nfile of truthGlob(m)) {
    const b = nfile.replace(/\.md$/, '')
    const c = canonId(b)
    if (c === null || b === c) continue
    if (exists(join(m.truths, `${c}.md`))) { out(`upgrade: rename collision — truths/${c}.md already exists next to truths/${b}.md; resolve by hand (nothing written)`); return 1 }
    if (tt.has(c)) { out(`upgrade: rename collision — two truth files both canonicalize to ${c} (e.g. t01.md and t1.md); resolve by hand (nothing written)`); return 1 }
    tt.add(c); pairs.push(['t', b, c])
  }
  // verdict-manual rows block the WHOLE apply: stamping schema 2 over rows the machine cannot
  // certify would leave --check red forever while apply reports success (broken idempotence), and
  // worse, would move unfinished verification out of sight. Human first, stamp second.
  const manual = scanUpgrade(m).filter(([k]) => k === 'verdict-manual')
  if (manual.length) {
    out('upgrade: rows in ## Verified units need a human ruling before apply can stamp schema 2 (nothing written):')
    for (const [, disp] of manual) out(Buffer.from(`  - ${disp}`, 'latin1'))
    out('  fix each row (complete the verification, or mark its real verdict), then re-run')
    return 1
  }
  let bak
  try { bak = mkdtempSync(bakPrefix) } catch (e) { out(`upgrade: cannot create backup dir ${bakPrefix}* (${e.code})`); return 1 }

  // One failure spelling for both failure shapes (post-validate red, a write that threw): roll
  // back, VERIFY, and only then say "byte-identical". A rollback that cannot be verified keeps the
  // backup and blocks — the alternative was measured in the v0.4.0 external review: an EACCES
  // escaping mid-migration left review_legacy markers stamped on a mine still claiming version 1.
  const failApply = (why, cleanMsg) => {
    const failed = rollback()
    if (failed.length) {
      out(Buffer.from(M`upgrade --apply: ${why} — and the rollback is INCOMPLETE. Could not verify restored: ${failed.join(' ')}. The originals are preserved in ${rel(bak)}/ — restore them by hand, then run validate. Do NOT delete that directory until the mine validates clean.`, 'latin1'))
      return 1
    }
    out(cleanMsg)
    return 1
  }

  let vrc
  try {
  // 1. canonical renames + strict-reference rewrite. Prose and changelog history stay untouched:
  //    lenient resolution reads old spellings, and consecrated bytes are never edited.
  // `crtd` BEFORE the copy, never after (v0.5.1, external review P1-4): registration is a statement
  // of INTENT, and intent must be on the rollback list before the first byte that acts on it. In
  // the old order — copy, delete old, then register — a copy that died partway left a half-made new
  // path that rollback did not know about: the old came back from its snapshot and the partial new
  // sat beside it, which is the mixed state the whole transaction exists to prevent. Registering a
  // path that then never gets created costs nothing: rollback's removal is force-tolerant.
  for (const [kind, old, nw] of pairs) {
    if (kind === 'm') {
      bkup(rel(join(m.materials, old)))
      crtd(rel(join(m.materials, nw)))
      ops.copy(join(m.materials, old), join(m.materials, nw))
      ops.rm(join(m.materials, old))
      const cf = join(m.materials, nw, 'converted.md')
      write(cf, splitLines(readB(cf)).map(l => (l === `id: ${old}` ? `id: ${nw}` : l)).join('\n') + '\n')
    } else {
      bkup(rel(join(m.truths, `${old}.md`)))
      crtd(rel(join(m.truths, `${nw}.md`)))
      ops.copy(join(m.truths, `${old}.md`), join(m.truths, `${nw}.md`))
      ops.rm(join(m.truths, `${old}.md`))
      const tf = join(m.truths, `${nw}.md`)
      write(tf, splitLines(readB(tf)).map(l => (l === `id: ${old}` ? `id: ${nw}` : l)).join('\n') + '\n')
    }
    clearFileCaches()
    canonRefs(old, nw)
  }
  clearFileCaches()

  // 2. verify.md: success rows gain their verdict word; missing sections appended empty.
  const vmd = join(m.truths, 'verify.md')
  if (isFileAt(vmd)) {
    bkup(rel(vmd))
    const vd = (m.sch.get('verify.units.verified') || 'verified')
    const outl = []
    for (const line of splitLines(readB(vmd))) {
      const t = line.split('Â·').join(' ').split('·').join(' ')
      if (!/^[ \t\v\f\r]*[|-]/.test(t) || /^[ \t\v\f\r]*\|[ \t\v\f\r|:-]*$/.test(t) || !/[mt][0-9]/.test(t)) { outl.push(line); continue }
      const v = t.replace(/[ \t\v\f\r|*.-]+$/, '')
      if (new RegExp(`(^|[^a-z_])${vd}$`).test(v.toLowerCase())) { outl.push(line); continue }
      const pm = /passes[ \t\v\f\r]*([0-9]+)\/([0-9]+)/.exec(t)
      if (pm && +pm[1] === +pm[2] && +pm[2] > 0) outl.push(`${line} ${U('·')} ${vd}`)
      else outl.push(line)
    }
    let text = outl.length ? outl.join('\n') + '\n' : ''
    write(vmd, text)
    for (const b of (m.sch.get('verify.sections') ?? '').split('|')) {
      if (b === '') continue
      const stripped = nocomment(readB(vmd))
      if (!new RegExp(`^#{1,2}[ \t]+${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \t]*$`, 'm').test(stripped)) {
        text = readB(vmd) + `\n## ${b}\n`
        write(vmd, text)
      }
    }
  }

  // 3. review history: bracketed kinds outside the gate lose their brackets (record form).
  for (const d of docIds(m)) {
    const f = join(m.documents, d, 'review.md')
    if (!isFileAt(f)) continue
    bkup(rel(f))
    write(f, historyWalk(readB(f), true).text)
  }

  // 4. config: scalar repeat → per-scale map.
  if (/^[ \t\v\f\r]+repeat:[ \t\v\f\r]*[0-9]/m.test(readB(m.config))) {
    bkup('.weavedoc/config.yaml')
    const outl = []
    for (const line of splitLines(readB(m.config))) {
      const mm = /^  repeat:[ \t\v\f\r]*([0-9]+)/.exec(line)
      if (!mm) { outl.push(line); continue }
      const v = mm[1]
      outl.push(`  repeat:                # clean rounds IN A ROW required to pass, by scale (migrated from scalar ${v})`)
      outl.push('    skip:     0')
      outl.push(`    light:    ${v}`)
      outl.push(`    standard: ${v}`)
      outl.push(`    full:     ${Number(v) + 1}`)
    }
    write(m.config, outl.join('\n') + '\n')
  }

  // 5. regenerate the generated views under the canonical spellings.
  bkup(rel(join(m.truths, 'index.md'))); bkup(rel(join(m.truths, 'tree.md')))
  clearFileCaches()
  // The regeneration's rc is part of the transaction (v0.5.2, external review P1-1): this call ran
  // bare, so a failed reindex left the OLD views beside the renamed truths and the migration still
  // committed "validate clean" — stale index labels slip validate, which checks id presence, not
  // label content. A nonzero rc throws into the boundary and the whole migration rolls back.
  if (runReindex() !== 0) throw new Error('the index regeneration failed mid-migration (reindex returned nonzero) — the generated views would not match the migrated truths')

  // 6. materialize digest-less verified history as legacy-unbound sidecar rows — preserved, never
  //    back-stamped with a digest the verification never computed (§11 decision).
  clearFileCaches()
  const miss = missingTruthRows(m)
  const mmiss = missingMatRows(m)
  if (miss.length || mmiss.length) {
    const lf = join(m.truths, m.ledgerFile())
    if (isFileAt(lf)) bkup(rel(lf)); else crtd(rel(lf))
    const head = isFileAt(lf)
      ? readB(lf)
      // U(): this header is WRITTEN through the byte-domain writer, so its em-dash has to BE bytes.
      // Caught by the write scale comparing the resulting tree (retired with the bash runtime) — the dash was silently dropped, and a
      // ledger header is a file the next reader diffs.
      : U('# machine-owned verification ledger — append-only; LAST row per id wins. Written by `weavedoc attest`.\n# id\tsha256\tverdict\tround\tstandard\tdate\n')
    const ot = m.sch.get('verify.ledger.origin.truths') || 'v1-truths-ledger'
    const om = m.sch.get('verify.ledger.origin.material') || 'v1-material-frontmatter'
    write(lf, head +
      miss.map(x => `${x}\t-\tlegacy-unbound\t-\t${ot}\t${today}\n`).join('') +
      mmiss.map(x => `${x}\t-\tlegacy-unbound\t-\t${om}\t${today}\n`).join(''))
  }

  // 6b. digest-less reviews receive the audit marker — the record that says "v1 history", which is
  //     what lets the v2 unsealed-review block distinguish history from tamper.
  clearFileCaches()
  for (const d of docIds(m)) {
    const f = join(m.documents, d, 'review.md')
    if (!isFileAt(f)) continue
    if (fmvB(f, 'reviewed_digest') !== '' || fmvB(f, 'review_legacy') !== '') continue
    const lines = splitLines(readB(f))
    const marker = `review_legacy: ${today}   ${U('# v1 review, digest-less by definition — migrated, not tampered')}`
    bkup(rel(f))
    if (isFence(lines[0] ?? '')) {
      write(f, [lines[0], marker, ...lines.slice(1)].join('\n') + '\n')
    } else {
      // A genuine v0.1 review may have NO frontmatter block at all. The scan promised a marker this
      // branch could not insert, so post-validate hit GATE-UNSEALED and rolled the whole migration
      // back — such a mine was permanently unmigratable (v0.3.2). The marker gets a fresh block.
      write(f, `---\n${marker}\n---\n\n` + readB(f))
    }
  }

  // 7. version stamps, LAST among the edits: a crashed apply resumes as a v1 rescan.
  bkup('project.md')
  write(m.project, splitLines(readB(m.project)).map(l => (l === 'version: 1' ? 'version: 2' : l)).join('\n') + '\n')
  bkup('.weavedoc/config.yaml')
  write(m.config, splitLines(readB(m.config)).map(l => l.replace(/^version: 1/, 'version: 2')).join('\n') + '\n')

  // 8. the same full validation everything else answers to.
  clearFileCaches()
  vrc = runValidate()
  } catch (e) {
    // Everything between the backup dir and here is inside the boundary — a snapshot, a copy, a
    // promoted write. Whatever threw, the mine must not stay half-migrated.
    out(`upgrade: ${e.message}`)
    return failApply('a write FAILED mid-migration',
      'upgrade --apply: a write FAILED mid-migration — every change rolled back, the mine is byte-identical to before. Fix the write error above (permissions, disk), then re-run.')
  }
  if (vrc === 0) {
    // Written to disk through the byte-domain writer too, so its separators are byte-encoded and
    // the bundle label (read as bytes) passes through untouched. Best-effort ON PURPOSE, and
    // OUTSIDE the boundary: the migration is already valid, and a manifest write failure must not
    // roll back a mine that just validated clean — the backup line below still names the dir.
    const man = [M`upgrade applied: ${today} · bundle ${readB(`${m.root}/.weavedoc/VERSION`).replace(/\n+$/, '')} · ${nitems} item(s)`,
      'touched (originals preserved in this directory):',
      ...uniqSort(touched).map(p => `  ${p}`),
      'created:',
      ...uniqSort(created).map(p => `  ${p}`)]
    if (!writeAtomic(`${bak}/MANIFEST.txt`, Buffer.from(man.join('\n') + '\n', 'latin1'))) {
      out('upgrade: warning — the backup directory is intact but its MANIFEST.txt could not be written; the originals are still there, unlabelled')
    }
    out(`upgrade --apply: applied ${nitems} item(s) — schema ${m.schemaVer()}, validate clean.`)
    out(`  backup + manifest: ${rel(bak)}/ (originals; delete when you no longer want the restore point)`)
    return 0
  }
  return failApply('post-apply validation FAILED',
    'upgrade --apply: post-apply validation FAILED — every change rolled back, the mine is byte-identical to before. Fix the problems above (they predate the migration), then re-run.')
}
