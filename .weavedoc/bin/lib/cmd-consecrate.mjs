// weavedoc consecrate <doc-id> — stage the candidate, verify the seals, ONE full validation,
// atomic promote.
//
// The §5.3 flow mechanized: the reviewed draft becomes the final BYTE FOR BYTE, or nothing changes.
// Everything below is ordered around one sentence — there is exactly one moment when an unvalidated
// candidate sits in the final slot, and a durable on-disk marker exists so that moment is never
// invisible. Traps cannot run on a hard kill; the artifact is the detector.
import { existsSync, statSync, writeFileSync, renameSync, rmSync, cpSync, copyFileSync } from 'node:fs'
import { U, M } from './core.mjs'
import { join, docDraftPath, docFinalPath, contextDigest, fm } from './mine.mjs'
import { artifactDigest } from './verify.mjs'
import { fidBody, isNoise } from './review.mjs'
import { clearFileCaches, fmvB } from './read.mjs'

const isDirAt = p => { try { return statSync(p).isDirectory() } catch { return false } }
const isFileAt = p => { try { return statSync(p).isFile() } catch { return false } }
const exists = p => { try { statSync(p); return true } catch { return false } }

// THE INJECTION SEAM, and it is here rather than in a PATH shim because a PATH shim cannot reach
// node:fs. The bash suite proves the validate-failure branch by making `rm` fail for the final slot
// alone; that branch is the one that used to drop the in-flight marker WITHOUT looking at the final
// slot, so a failed removal left rejected, unvalidated bytes wearing the final name and the one
// artifact that would have told anyone was gone. Losing that coverage to "the shim does not apply"
// is not acceptable, so the operation is a parameter with a real default and the test drives the
// MODULE. The CLI never passes anything but the default — this is not a runtime switch.
export const realOps = {
  rmrf: p => { rmSync(p, { recursive: true, force: true }) },
  mv: (a, b) => { renameSync(a, b) }
}

export function cmdConsecrate (m, out, errln, docId, ops = realOps) {
  const d = docId ?? ''
  const say = s => out(Buffer.from(s, 'latin1'))
  if (d === '') { out('usage: weavedoc consecrate <doc-id>'); return 2 }
  // A doc id is a plain folder name. A path fragment is refused BEFORE any filesystem access, or
  // '../x' resolves relative to the tree (v0.3.3).
  if (/[/\\]/.test(d) || d === '.' || d === '..') {
    out(`consecrate: '${d}' is not a document id (ids are plain folder names under documents/)`)
    return 2
  }
  const dir = join(m.documents, d)
  const rev = join(dir, 'review.md')
  if (!isFileAt(rev)) { out(`consecrate: no review.md for '${d}' — run review first`); return 2 }

  const bak = join(dir, '.final.bak')
  const mark = join(dir, '.consecrate.inflight')
  // A leftover backup means an earlier consecration died mid-validate: the final slot may hold an
  // UNVALIDATED candidate and .final.bak is the only original. This run must not delete that backup
  // (the old code did) — a human decides.
  if (exists(bak)) {
    say(M`consecrate: interrupted consecration detected — ${U(bak)} exists, so the current final may be an unvalidated candidate. Restore the backup over final (or remove it if the current final is known good), then re-run. Nothing was touched.`)
    return 1
  }
  if (exists(mark)) {
    // The guidance says COMPARE FIRST (v0.3.3): a crash BEFORE the swap leaves the ORIGINAL at
    // final, so "remove final" as a blanket instruction deletes the wrong file.
    say(M`consecrate: interrupted consecration detected — ${U(mark)} exists, so a consecration is running or died here. If nothing is running, byte-compare final against the reviewed draft BEFORE deciding: identical → it is the staged candidate (safe to remove); different → it is your original (keep it; the crash came before the swap); absent with .final.bak present → restore the backup. Then delete the marker and re-run. Nothing was touched.`)
    return 1
  }
  // Two finals at once: the resolver picks the directory, so proceeding would back up ONLY final/
  // and then overwrite final.md with the candidate — no backup — and the post-swap validation would
  // see a mine where the dual state had vanished. Both prior artifacts were destroyed on the success
  // path (v0.3.2). Refused before the first write, the same reading validate blocks as GATE-DUAL-FINAL.
  if (isFileAt(join(dir, 'final.md')) && isDirAt(join(dir, 'final'))) {
    say(M`consecrate: ${U(d)} has both final.md and final/ — only one can be the consecrated output and consecrate cannot know which to preserve; remove the one that is not the reviewed artifact, then re-run. Nothing was touched.`)
    return 1
  }

  // 1. The gate must be empty — read through the SAME judge validate uses, or the two could disagree.
  const sections = (m.sch.get('review.sections') ?? '').split('|')
  const kinds = (m.sch.get('review.enum.kind') ?? '').split('|').filter(Boolean)
  for (const line of fidBody(rev, sections)) {
    if (isNoise(line, kinds)) continue
    say(M`consecrate: open gate — review.md 'Fidelity violations' is non-empty ('${line}'). Refine until the gate is clean`)
    return 2
  }
  // 2. Sealed, and sealed over the DRAFT — consecrate promotes a reviewed draft.
  const rdg = fmvB(rev, 'reviewed_digest').replace(/^sha256:/, '')
  if (rdg === '') { out(`consecrate: unsealed review (no reviewed_digest) — after the clean round run: weavedoc seal-review ${d} draft`); return 2 }
  const rkind = fmvB(rev, 'reviewed_kind')
  if (rkind !== 'draft') { say(M`consecrate: reviewed_kind is '${rkind}' — consecrate promotes a reviewed DRAFT; re-seal with kind draft`); return 2 }
  // 3. The draft on disk must BE the reviewed bytes.
  const art = docDraftPath(m, d)
  if (art === null) { out(`consecrate: no draft for '${d}'`); return 2 }
  if (artifactDigest(art) !== rdg) { out('consecrate: draft changed after the clean review (digest mismatch) — re-review, then consecrate'); return 2 }
  // 4. The ground must not have shifted under the review.
  const rcx = fmvB(rev, 'review_context_digest').replace(/^sha256:/, '')
  if (rcx !== '' && contextDigest(m, d) !== rcx) {
    out('consecrate: review context changed (cited truth, source material, config or schema) — the clean review no longer describes this mine; re-review')
    return 2
  }

  // 5. Stage on the same filesystem, verify the copy, mark, swap, validate ONCE.
  const isdir = isDirAt(art)
  const cand = isdir ? join(dir, '.candidate.final') : join(dir, '.candidate.final.md')
  try {
    ops.rmrf(cand)
    if (isdir) cpSync(art, cand, { recursive: true }); else copyFileSync(art, cand)
  } catch {
    ops.rmrf(cand)
    out('consecrate: cannot stage the candidate copy — nothing promoted')
    return 1
  }
  if (artifactDigest(cand) !== rdg) {
    ops.rmrf(cand)
    out('consecrate: candidate copy does not match the reviewed digest — copy failed; nothing promoted')
    return 1
  }
  const oldfin = docFinalPath(m, d) ?? ''
  const fin = isdir ? join(dir, 'final') : join(dir, 'final.md')

  // The durable marker precedes the FIRST final mutation and is removed LAST — and only behind a
  // VERIFIED postcondition (v0.3.3): a first-ever consecration has no .final.bak, so a hard kill
  // used to leave an unvalidated candidate at final with NO trace. Creation is EXCLUSIVE ('wx'):
  // two concurrent consecrations cannot both hold the transaction.
  try {
    const today = new Date().toISOString().slice(0, 10)
    writeFileSync(mark, `started: ${today}\ndoc: ${d}\n`, { flag: 'wx' })
  } catch {
    ops.rmrf(cand)
    out('consecrate: cannot create the in-flight marker (it appeared concurrently, or the directory is unwritable) — another consecration may be running; nothing promoted')
    return 1
  }

  // `stage` guards the abort and is promoted BEFORE each mutation it names (v0.3.3): assignment is
  // not atomic with the move, and a signal landing between the swap and a late promotion left the
  // candidate in place while the abort skipped its removal. For a single-file document oldfin and
  // fin are the SAME path, so an abort before the aside-move must not remove the original.
  let stage = 'staged'
  // The postcondition all three failure branches verify, spelled ONCE. The marker leaves only when
  // this holds; restore-incomplete means it stays and validate blocks until a human resolves it.
  // Fail-closed beats tidy.
  const restored = () => (oldfin !== '' ? (exists(oldfin) && !exists(bak)) : !exists(fin))
  const abort = () => {
    if (stage === 'placed') { try { ops.rmrf(fin) } catch { /* postcondition decides */ } }
    if (oldfin !== '' && exists(bak)) { try { ops.mv(bak, oldfin) } catch { /* ditto */ } }
    try { ops.rmrf(cand) } catch { /* ditto */ }
    let cleared = false
    if (restored()) { try { ops.rmrf(mark); cleared = true } catch { cleared = false } }
    if (cleared) errln('consecrate: interrupted — candidate removed, original final restored')
    else errln('consecrate: interrupted — RESTORE INCOMPLETE; the in-flight marker stays and validate blocks until resolved (byte-compare final against the reviewed draft before deciding what to keep)')
    process.exit(130)
  }
  process.on('SIGINT', abort); process.on('SIGTERM', abort)
  const untrap = () => { process.off('SIGINT', abort); process.off('SIGTERM', abort) }

  if (oldfin !== '') {
    try { ops.mv(oldfin, bak) } catch {
      untrap()
      try { ops.rmrf(cand) } catch { /* reported through the marker below */ }
      if (exists(oldfin) && !exists(bak)) { try { ops.rmrf(mark) } catch { /* ditto */ } }
      out(`consecrate: cannot move the current final aside — nothing promoted${exists(mark) ? ' (marker kept: state unclear, validate blocks until resolved)' : ''}`)
      return 1
    }
  }
  stage = 'placed'
  try { ops.mv(cand, fin) } catch {
    untrap()
    if (oldfin !== '' && exists(bak)) { try { ops.mv(bak, oldfin) } catch { /* postcondition decides */ } }
    try { ops.rmrf(cand) } catch { /* ditto */ }
    if (restored()) { try { ops.rmrf(mark) } catch { /* ditto */ } }
    out(`consecrate: cannot place the candidate at final — original restored where possible; nothing promoted${exists(mark) ? ' (marker kept: state unclear, validate blocks until resolved)' : ''}`)
    return 1
  }

  // THE VALIDATION WINDOW: the one moment an unvalidated candidate sits in the final slot. The
  // in-process validate skips THIS document's in-flight artifacts via a FUNCTION ARGUMENT — never a
  // variable, which the environment can inject (v0.3.3, `WD_CONSEC_DOC=d1 weavedoc validate`).
  // The caches are dropped first: they were filled before this command's own writes.
  clearFileCaches()
  // A validator that THROWS is a validator that did not pass (v0.5.1, external review P2): the
  // exception used to escape this command whole, skipping the restore below — the candidate stayed
  // at final with the marker and backup beside it. Fail-closed even so (the next validate blocks on
  // the marker), but "crashed mid-promotion" is not the automatic-restore contract. A throw is a
  // failed validation now, and the ordinary rollback branch handles it.
  let vrc
  try { vrc = ops.validate(d) } catch { vrc = 1 }
  untrap()
  if (vrc === 0) {
    if (oldfin !== '') {
      try { ops.rmrf(bak) } catch {
        out(`consecrate: warning — could not remove ${bak.startsWith(`${m.root}/`) ? bak.slice(m.root.length + 1) : bak}; validate blocks while it remains, remove it by hand`)
      }
    }
    // A marker that survives the promotion makes the NEXT validate fail CONSEC-INTERRUPTED, so
    // swallowing this left the user with a green consecrate and a red mine and no line connecting
    // them (measured 2026-08-05: rc 0, marker present, next validate rc 1). Named, in the same
    // spelling the backup-removal failure two lines up already uses. The exit code stays 0 because
    // the promotion is REAL — the final is the reviewed draft — and saying otherwise would send the
    // user to re-do work that is done; what is left is one file to remove.
    let markerGone = true
    try { ops.rmrf(mark) } catch { markerGone = false }
    out(`consecrate: ${d} consecrated — full validation: 1 run, clean. The reviewed draft IS the final, byte for byte.`)
    if (!markerGone) {
      out(`  warning — the promotion is done but the in-flight marker could not be removed: ${mark.startsWith(`${m.root}/`) ? mark.slice(m.root.length + 1) : mark}. validate blocks with CONSEC-INTERRUPTED while it remains; delete that file by hand`)
    }
    if ((m.cfg.flat.get('completeness') ?? '') !== 'required') {
      out('  note: completeness is off — undetected omissions are outside this document\'s warranty (fidelity.completeness)')
    }
    return 0
  }
  try { ops.rmrf(fin) } catch { /* the postcondition below is what decides, not this call */ }
  if (oldfin !== '') { try { ops.mv(bak, oldfin) } catch { /* ditto */ } }
  // THE SAME POSTCONDITION the abort and move-failure branches verify (v0.3.6). This branch used to
  // trust its removal and, with no original to restore, dropped the marker without ever looking at
  // the final slot — so a removal that failed left the REJECTED, UNVALIDATED candidate sitting at
  // final with no trace, which is exactly the state the marker exists to make visible. Three failure
  // branches, one rule.
  const rel = p => (p.startsWith(`${m.root}/`) ? p.slice(m.root.length + 1) : p)
  if (restored()) {
    try { ops.rmrf(mark) } catch { /* if even this fails the mine stays blocked, which is correct */ }
    out('consecrate: full validation FAILED after staging — candidate rejected, original final preserved untouched. Fix the problems above and re-run.')
  } else if (oldfin !== '' && exists(bak)) {
    out(`consecrate: full validation FAILED and the backup could NOT be restored over final — the original is still in ${rel(bak)}; restore it by hand. The in-flight marker stays (validate blocks until resolved).`)
  } else {
    out(`consecrate: full validation FAILED and the rejected candidate could NOT be removed from the final slot — ${rel(fin)} holds UNVALIDATED bytes that no clean validation ever covered; remove it by hand (byte-compare against the reviewed draft first). The in-flight marker stays (validate blocks until resolved).`)
  }
  return 1
}
