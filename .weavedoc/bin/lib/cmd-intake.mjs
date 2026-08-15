// weavedoc intake <material-id> <note> — THE declaration write path.
//
// What it records is not "this material is true". It is the far smaller, far more checkable claim
// that SOMETHING WAS HANDED OVER: these bytes, under this folder, on this date, described this way.
// The digest is computed HERE and never by hand, for the same reason `attest`'s is — so "which
// bytes were declared" has one spelling — and it is a TREE digest over every `source.*` in the
// folder, so a later edit, rename, addition or deletion of an original shows up as `stale` in
// `scope` instead of passing as the thing that was declared.
//
// It cannot stop an agent from inventing a source and declaring it; nothing at this layer can, and
// pretending otherwise would be the more dangerous design. What it does is take fabrication off the
// default path: a silent file write is no longer enough, the alternative leaves a row with a
// digest, and a material with no row at all is named by `validate`.
//
// The `--no-source` form is the ONE ruled exception, and it exists because without it the whole
// check dies of a single true case: a material whose original genuinely does not exist (a value the
// user stated with nothing to compare against) would otherwise be permanently undeclared, and one
// permanent false alarm is how a warning stops being read. The exception is not free — it demands
// the ruling in the note, it is counted apart everywhere, and it never reads as digest-bound.
import { statSync } from 'node:fs'

import { acquireLedgerLock, releaseLedgerLock } from './lock.mjs'
import { canonId } from './core.mjs'
import { clearFileCaches } from './read.mjs'
import { join, mdirFor } from './mine.mjs'
import { today, appendLedgerRows, realAppendOps } from './write.mjs'
import { INTAKE_HEADER, intakeLedgerPath, sourceState, copyDigest, intakeIndex, intakePopulation } from './intake-ledger.mjs'

export const realOps = realAppendOps

const isDir = p => { try { return statSync(p).isDirectory() } catch { return false } }

const USAGE = 'usage: weavedoc intake [--no-source] <material-id> <note>   |   weavedoc intake --anchor-existing <note>'

export function cmdIntake (m, out, argv, ops = realOps) {
  let noSource = false
  let anchorExisting = false
  const args = []
  for (const a of argv) {
    if (a === '--no-source') { noSource = true; continue }
    if (a === '--anchor-existing') { anchorExisting = true; continue }
    if (a.startsWith('--')) { out(`intake: unknown flag '${a}' — ${USAGE}`); return 2 }
    args.push(a)
  }
  // The two forms take different arguments and mean different things; combining the flags would
  // ask for a ruling ("no original exists") across a set the caller never enumerated.
  if (anchorExisting && noSource) { out(`intake: --anchor-existing and --no-source cannot be combined — --no-source is a ruling about ONE material and has to name it. ${USAGE}`); return 2 }

  let rawId = ''
  let cid = null
  let note
  if (anchorExisting) {
    if (args.length !== 1) { out(USAGE); return 2 }
    note = args[0]
  } else {
    if (args.length !== 2) { out(USAGE); return 2 }
    rawId = args[0]
    cid = canonId(rawId)
    if (cid === null || !cid.startsWith('m')) { out(`intake: '${rawId}' is not a material id — nothing written`); return 2 }
    note = args[1]
  }
  // The note is the one free-text column, and a control byte in it CORRUPTS THE ROW exactly as it
  // does in attest's `standard`: a TAB adds a column, a newline splits the row in two. Refused at
  // the door rather than escaped — an escape puts a spelling in the file that no reader un-escapes.
  if (note === '') { out('intake: the note may not be empty — it is the record of HOW this material arrived (who handed it over, from where, the ruling behind --no-source, or what an --anchor-existing run was vouching for), and a blank one declares nothing; nothing written'); return 2 }
  if (/[\x00-\x1f\x7f]/.test(note)) { // eslint-disable-line no-control-regex
    out('intake: the note may not contain a tab, newline or other control character — it is one TSV field, and a control byte there splits or widens the row (write it as plain text; a Windows path is fine, an embedded newline is not)'); return 2
  }

  if (!isDir(m.materials)) { out('intake: no materials/ directory'); return 2 }

  // The lock lives beside the ledger, and the protocol is lock.mjs's — one critical section around
  // create → tail-check → append → rollback, because a compensating rollback without mutual
  // exclusion erases a neighbour's committed row. BOTH forms take it: --anchor-existing appends a
  // batch, and a batch is the write that can least afford to interleave with a single declaration.
  const lf = intakeLedgerPath(m)
  const lockPath = `${lf}.lock`
  const lockRel = lockPath.startsWith(`${m.root}/`) ? lockPath.slice(m.root.length + 1) : lockPath
  const lockWhy = acquireLedgerLock(lockPath, lockRel)
  if (lockWhy) { out(`intake: ${lockWhy}. Nothing written`); return 1 }
  try {
    return anchorExisting ? anchorLocked() : intakeLocked()
  } finally {
    releaseLedgerLock(lockPath)
  }

  function intakeLocked () {
    // The bytes are read UNDER the lock, for attest's reason: a digest is a claim about bytes AT A
    // POINT IN TIME, and taking it outside the section that protects it records a binding to bytes
    // that no longer exist. Caches go with it — whatever this process read before the wait is not
    // evidence about now.
    clearFileCaches()
    const day = today()
    if (mdirFor(m, cid) === null) { out(`intake: no material folder for '${rawId}' (${cid}) — create it first (gather does); nothing written`); return 2 }

    // The COPY is bound for every word this command writes, `--no-source` included: a material with
    // no original is the one whose `converted.md` no later reviewer can re-derive from anything, so
    // it is the one where an unrecorded edit is least recoverable, not most excusable.
    const copy = copyDigest(m, cid)
    if (copy === null) { out(`intake: ${cid} has no readable converted.md — a declaration binds the mine's copy as well as the original, and there is nothing here to bind; nothing written`); return 2 }

    let digest = '-'
    let count = '-'
    if (!noSource) {
      const s = sourceState(m, cid)
      if (s.state === 'empty') {
        out(`intake: ${cid} holds no source.* file — a declaration binds to the ORIGINAL, and there is nothing here to bind to. If the original was never moved in, put it at ${m.materials.replace(`${m.root}/`, '')}/${cid}/source.<ext> and re-run. If this material genuinely has no original (a value stated with nothing to compare against), that is a ruling and it is recorded as one: 'weavedoc intake --no-source ${cid} "<the ruling, in the user's words>"'. Nothing written`)
        return 2
      }
      if (s.state !== 'complete') {
        out(`intake: ${cid}'s source set cannot be sealed (${s.state}) — ${s.why}. A declaration records which bytes arrived, so it is refused rather than written over an unknown set; nothing written`)
        return 2
      }
      digest = s.digest
      count = String(s.count)
    }

    const decl = noSource ? 'no-source' : 'declared'
    const row = `${cid}\t${digest}\t${decl}\t${count}\t${copy}\t${note}\t${day}\n`
    const ap = appendLedgerRows(lf, INTAKE_HEADER, [row], ops)
    if (!ap.ok) return sayAppendFailure(ap)

    if (noSource) {
      out(`intake: ${cid} — no-source · copy ${copy.slice(0, 12)} · ${day} · ${note}`)
      out('  recorded as a RULING about the ORIGINAL, not a binding to one: nothing of the source was hashed, so no later check can compare this material against it. The mine\'s copy IS bound — an edit to converted.md still shows. Counted apart from declared material everywhere it is counted.')
    } else {
      out(`intake: ${cid} — declared · ${count} source file(s) · ${digest.slice(0, 12)} · copy ${copy.slice(0, 12)} · ${day} · ${note}`)
    }
    return 0
  }

  // --anchor-existing — THE MIGRATION ANSWER, and the reason it is a command instead of something
  // `upgrade` does on its way past.
  //
  // A mine that predates this ledger carries a backlog of materials bound to nothing: editable, in
  // either direction, with no trace. `upgrade` mints them `legacy-unbound` because that is the only
  // honest thing it can say — nobody witnessed those bytes — and then the backlog just sits there.
  // The way out cannot be for `upgrade` to hash them itself: a digest minted by a migration would
  // read as evidence and would in fact record whatever happened to be on disk at the moment a tool
  // ran, INCLUDING an edit made ten minutes earlier. That is how a falsified copy becomes canon.
  //
  // So the bytes are bound by a separate act, by a person, who is vouching that the tree is the one
  // they mean. The word it writes is `anchored` and not `declared`, because nothing was handed over
  // here and the record may not imply it was. From that row onward an edit to either side shows.
  function anchorLocked () {
    clearFileCaches()
    const day = today()
    const idx = intakeIndex(lf)
    // A dead ledger is not an empty one — the rule the backfill already runs under. Minting rows
    // into a file that cannot be read appends duplicates beside declarations that may exist.
    if (idx.state === 'unreadable') { out(`intake: the intake ledger exists but cannot be read (${idx.code}) — an anchor batch would append beside declarations nobody can see; repair it first (validate names the damage). Nothing written`); return 1 }
    if (idx.headless > 0) { out(`intake: the intake ledger holds ${idx.headless} row(s) with no id — an unattributable row could be any material's latest declaration, so nothing can be safely appended beside it; repair it first. Nothing written`); return 1 }

    // ONLY the unbound: no row at all, or a `legacy-unbound` one. A material already carrying a
    // binding is LEFT ALONE, and that is the anti-laundering rule of this command — re-anchoring a
    // stale material would silently adopt whatever it was edited into, turning the one command that
    // exists to expose an edit into the one that buries it. Re-binding after a deliberate change is
    // still possible and still available; it just has to name the material: `intake <id> <note>`.
    const pop = intakePopulation(m)
    const targets = []; const held = []
    for (const id of pop) {
      const f = idx.win.get(id)
      if (f === undefined || f[2] === 'legacy-unbound') { targets.push(id); continue }
      held.push(id)
    }
    if (targets.length === 0) {
      out(`intake --anchor-existing: every material already carries a binding (${held.length} of ${pop.length}) — nothing to anchor, nothing written`)
      return 0
    }

    // ALL-OR-NOTHING, attest's rule: every target resolves to readable bytes BEFORE one row is
    // built. A batch that anchored the first nine and refused the tenth would leave a mine whose
    // ledger says more than one run ever established.
    const rows = []; const skipped = []
    for (const id of targets) {
      const copy = copyDigest(m, id)
      if (copy === null) { out(`intake --anchor-existing: ${id} has no readable converted.md — an anchor binds the mine's copy, and this one cannot be read. Fix or retract it, then re-run; nothing written`); return 2 }
      const s = sourceState(m, id)
      if (s.state === 'complete') { rows.push(`${id}\t${s.digest}\t${'anchored'}\t${String(s.count)}\t${copy}\t${note}\t${day}\n`); continue }
      // A material with no original, or one whose sources cannot be read as a set, needs a RULING —
      // and a ruling is the user's, never a batch's. Named and skipped, so the count on screen is
      // the count in the file.
      skipped.push(`${id} (${s.state})`)
    }
    if (rows.length === 0) {
      out(`intake --anchor-existing: none of the ${targets.length} unbound material(s) could be anchored — ${skipped.join(' · ')}. Each needs a ruling of its own: 'weavedoc intake --no-source <id> "<the ruling>"' where there is genuinely no original. Nothing written`)
      return 2
    }

    const ap = appendLedgerRows(lf, INTAKE_HEADER, rows, ops)
    if (!ap.ok) return sayAppendFailure(ap)

    out(`intake --anchor-existing: ${rows.length} material(s) anchored · ${day} · ${note}`)
    out('  ANCHORED IS NOT VERIFIED. It records the bytes as they stood today and nothing else — no one read this material, and no claim is made that it says what its original says. What it buys is that from here on, an edit to either the original or the copy shows up as stale instead of passing unseen.')
    if (held.length) out(`  left alone (already bound): ${held.length} — re-binding after a deliberate change names the material: weavedoc intake <id> <note>`)
    if (skipped.length) out(`  NOT anchored, each needs its own ruling: ${skipped.join(' · ')}`)
    return 0
  }

  // The append transaction's eight outcomes, spelled once for both forms. Extracted rather than
  // copied: two hand-kept copies of an error table is how one consumer ends up taught a rule the
  // other never hears.
  function sayAppendFailure (ap) {
    const say = {
      create: `intake: cannot create the intake ledger (${ap.code}) — nothing written`,
      notfile: 'intake: the intake ledger path exists but is not a regular file (a directory wearing its name) — fix the path first; nothing written',
      torn: "intake: the intake ledger's last row has no line terminator — appending would fuse it with the new row. That torn row is what an interrupted intake leaves behind; run validate, repair or delete it, then re-run. Nothing written",
      tailread: `intake: cannot read the intake ledger's end (${ap.code}) — refusing to append blind; nothing written`,
      'created-removed': `intake: ledger write failed (${ap.code}) — the ledger this run created was removed again; there was none before and there is none now`,
      'created-stuck': `intake: ledger write failed (${ap.code}) AND the just-created ledger could not be removed — it holds a header and possibly a torn row; run validate, then delete the file by hand`,
      'rolled-back': `intake: ledger write failed (${ap.code}) — the partial append was rolled back, the ledger is as before; nothing counts as declared`,
      'rollback-failed': `intake: ledger write failed (${ap.code}) AND the partial bytes could not be removed — run validate: it will name the torn row; delete it by hand before re-running`
    }[ap.kind]
    // Same guard as attest's, for the same reason: an unhandled kind must fail with a sentence
    // that names what happened, never with `undefined`.
    out(say ?? `intake: the ledger write failed in a way this command has no sentence for (kind '${ap.kind}'${ap.code ? `, ${ap.code}` : ''}) — treat it as a failed write: run validate before re-running, and report this message`)
    return 1
  }
}
