// weavedoc attest <verified|failed> <round> <standard> <id...> — THE verification write path.
//
// The digest is computed HERE and never by hand, so "which bytes were verified" has one spelling.
// All-or-nothing: every id resolves, exists and is not a retracted material BEFORE one byte is
// written — a partially applied attest would record coverage for units nobody checked. (Every v3
// truth card that exists is attestable; the material lifecycle is the one surviving status axis.)
import { statSync } from 'node:fs'

// The append, injectable (the consecrate/retag/upgrade precedent): node:fs cannot be reached by a
// PATH shim, so the fault-injection driver is the only caller that ever passes anything else.
export const realOps = realAppendOps

// THE LEDGER LOCK lives in lock.mjs since review #6: upgrade --apply writes this ledger too, and a
// protocol only attest spoke was measured being walked straight through by upgrade. The WHY of the
// lock — one critical section around create → tail-check → append → rollback → mirror, because a
// compensating rollback without mutual exclusion erases a neighbour's rc-0 row — and why a lock is
// NEVER auto-reclaimed both live there.
import { acquireLedgerLock, releaseLedgerLock } from './lock.mjs'
import { canonId, inList } from './core.mjs'
import { clearFileCaches } from './read.mjs'
import { join, fm, tfileFor, unitDigest } from './mine.mjs'
import { today, writeAtomic, textBuf, U, appendLedgerRows, realAppendOps } from './write.mjs'
import { insertMirrorRow, readVerifiedUnits, verifiedUnitsContract } from './verified-units.mjs'

// `-f` and `-d`, not "exists". The distinction is not pedantry here: readFileSync on a directory
// THROWS, so an `existsSync` gate would turn a mine where `verify.md` is a folder from bash's quiet
// skip into an uncaught stack trace. Every test below is the one the original spells.
const isFile = p => { try { return statSync(p).isFile() } catch { return false } }
const isDir = p => { try { return statSync(p).isDirectory() } catch { return false } }
const exists = p => { try { statSync(p); return true } catch { return false } }

const LEDGER_HEADER =
  '# machine-owned verification ledger — append-only; LAST row per id wins. Written by `weavedoc attest`.\n' +
  '# id\tsha256\tverdict\tround\tstandard\tdate\n'

export function cmdAttest (m, out, argv, ops = realOps) {
  if (argv.length < 4) { out('usage: weavedoc attest <verified|failed> <round> <standard> <id...>'); return 2 }
  const verdict = argv[0]
  const round = argv[1]
  const standard = argv[2]
  const ids = argv.slice(3)

  const vds = m.sch.get('verify.ledger.verdicts') || 'verified|failed'
  if (!inList(verdict, vds)) { out(`attest: verdict '${verdict}' must be one of: ${vds}`); return 2 }
  // The bash rule is a case pattern — reject empty, reject exactly "0", reject any non-digit. Note
  // what it does NOT reject: "00" and "007" are accepted (measured against the original, not read
  // off it). A port that "tidied" that to a numeric test would refuse a round the tool accepts.
  if (round === '' || round === '0' || /[^0-9]/.test(round)) {
    out(`attest: round '${round}' must be a positive integer`); return 2
  }
  // `standard` is the one free-text column, and a control byte in it CORRUPTS THE ROW: a TAB adds
  // a column, a newline splits the row in two. Both were writable before — the row then covered
  // nothing, and `validate` reported a malformed ledger the user had not knowingly created. The
  // writer refuses at the door instead, so the ledger cannot be broken through its own front door.
  // (Rejected here rather than escaped: escaping would put a spelling in the file that no reader
  // un-escapes, which is a second format nobody declared.)
  if (/[\x00-\x1f\x7f]/.test(standard)) { // eslint-disable-line no-control-regex
    out("attest: the standard column may not contain a tab, newline or other control character — it is one TSV field, and a control byte there splits or widens the row (write it as plain text; a Windows path is fine, an embedded newline is not)"); return 2
  }

  const lf = join(m.truths, m.ledgerFile())
  // Checked before the lock ON PURPOSE, and it is not a judgment about mine CONTENT: the lock
  // lives inside truths/, so without the directory there is nothing to lock and this is the one
  // true sentence for that state.
  if (!isDir(m.truths)) { out('attest: no truths/ directory'); return 2 }

  // Everything from here to the mirror runs under the ledger lock — see lock.mjs for why a
  // compensating rollback without mutual exclusion erases a neighbour's committed row.
  const lockPath = `${lf}.lock`
  const lockRel = lockPath.startsWith(`${m.root}/`) ? lockPath.slice(m.root.length + 1) : lockPath
  const lockWhy = acquireLedgerLock(lockPath, lockRel)
  if (lockWhy) { out(`attest: ${lockWhy}. Nothing written`); return 1 }
  try {
    return attestLocked()
  } finally {
    releaseLedgerLock(lockPath)
  }

  function attestLocked () {
  // THE UNITS ARE RESOLVED AND DIGESTED UNDER THE LOCK (v0.5.4, review #8 P1-2). This loop used to
  // run BEFORE the acquire, so a bounded wait of up to 5s sat between "what these bytes are" and
  // "this row says they were verified" — measured: a truth changed by the lock holder during that
  // wait was recorded as verified against bytes that no longer existed, attest rc 0, and `scope`
  // called the unit stale the moment the row landed. A digest is a claim about bytes AT A POINT IN
  // TIME; taking it outside the section that protects it is the same class as planning a migration
  // outside the lock. Only the ARGUMENT grammar (verdict, round, standard) is judged above — that
  // is about the command line, not the mine, and it cannot go stale.
  // The caches go with it: whatever this process read before the wait is not evidence about now.
  clearFileCaches()
  const day = today()
  const rows = []
  const names = []
  for (const id of ids) {
    const cid = canonId(id)
    if (cid === null) { out(`attest: '${id}' is not a material/truth id — nothing written`); return 2 }
    if (cid.startsWith('m')) {
      const f = join(m.materials, cid, 'converted.md')
      if (!isFile(f)) { out(`attest: no converted.md for '${id}' (${cid}) — nothing written`); return 2 }
      // The MATERIAL lifecycle survives v3, and a retracted material stays outside the population.
      if (fm(f, 'status') === 'retracted') {
        out(`attest: ${cid} is retracted — a withdrawn material is outside the verification population; nothing written`); return 2
      }
    } else {
      const tf = tfileFor(m, cid)
      if (tf === null) { out(`attest: no truth file for '${id}' (${cid}) — nothing written`); return 2 }
      // No truth-side refusal in v3: a card that exists is canonical and owes verification.
    }
    const dg = unitDigest(m, cid)
    if (dg === null) { out(`attest: cannot digest '${id}' (${cid}) — nothing written`); return 2 }
    rows.push(`${cid}\t${dg}\t${verdict}\t${round}\t${standard}\t${day}\n`)
    names.push(cid)
  }

  // THE LEDGER IS APPENDED TO, NOT REWRITTEN (§11 2026-08-05), through the ONE append transaction
  // both machine-owned ledgers share (write.mjs — atomic create, torn-row refusal, verified
  // rollback, and the created-here case where "as before" means ABSENT). The rules live there
  // because `intake` writes a ledger under the same four; the SENTENCES live here, because
  // "nothing counts as attested" is this command's claim and no other's.
  const ap = appendLedgerRows(lf, LEDGER_HEADER, rows, ops)
  if (!ap.ok) {
    const say = {
      create: `attest: cannot create the ledger (${ap.code}) — nothing written`,
      notfile: 'attest: the ledger path exists but is not a regular file (a directory wearing its name) — fix the path first; nothing written',
      torn: "attest: the ledger's last row has no line terminator — appending would fuse it with the new row. That torn row is what an interrupted attest leaves behind; run validate, repair or delete it, then re-run. Nothing written",
      tailread: `attest: cannot read the ledger's end (${ap.code}) — refusing to append blind; nothing written`,
      'created-removed': `attest: ledger write failed (${ap.code}) — the ledger this run created was removed again; there was none before and there is none now`,
      'created-stuck': `attest: ledger write failed (${ap.code}) AND the just-created ledger could not be removed — it holds a header and possibly a torn row; run validate, then delete the file by hand`,
      'rolled-back': `attest: ledger write failed (${ap.code}) — the partial append was rolled back, the ledger is as before; nothing counts as attested`,
      'rollback-failed': `attest: ledger write failed (${ap.code}) AND the partial bytes could not be removed — run validate: it will name the torn row; delete it by hand before re-running`
    }[ap.kind]
    // A kind with no sentence here would print `undefined` and return 1 — a real refusal wearing a
    // word that names nothing, which is this repo's own worst class (a check that reports without
    // saying anything). The table is total today (both consumers cover all eight); this is what
    // happens the day write.mjs grows a ninth and only one consumer is taught it.
    out(say ?? `attest: the ledger write failed in a way this command has no sentence for (kind '${ap.kind}'${ap.code ? `, ${ap.code}` : ''}) — treat it as a failed write: run validate before re-running, and report this message`)
    return 1
  }

  // Human mirror into `## Verified units` — the markdown stays the readable view while the sidecar
  // stays scope's source of truth, so a missing section costs readability and never coverage.
  // Failed verdicts stay sidecar-only: a markdown row ending in a verdict would be read as covering
  // the units it names, and a failed round covers nothing.
  const vmd = join(m.truths, 'verify.md')
  if (verdict === 'verified' && exists(vmd)) {
    // The same source-position model scope reads chooses the live heading. A commented/fenced fake
    // heading cannot receive a mirror row, and splicing one offset preserves every unrelated byte.
    const model = readVerifiedUnits(vmd, verifiedUnitsContract(m.sch))
    const mline = U(`- ${names.join(' · ')} — R${round} ${day} · ${standard} · verified`)
    const mirrored = model.readable ? insertMirrorRow(model, mline) : null
    if (mirrored !== null) {
      // The ledger row is already committed, so a mirror failure does not fail the command — but it
      // is NAMED now (v0.5.1): the mirror is the same fact on a second surface, and two surfaces
      // silently disagreeing about one fact is the exact split the -v/ENVIRON episode taught.
      if (!writeAtomic(vmd, textBuf(mirrored))) {
        out(`attest: warning — the ledger row is recorded, but the human mirror in truths/verify.md could not be written; the two surfaces now disagree until you add the line by hand or re-run a mirrorable attest`)
      }
    } else {
      const why = !model.readable
        ? 'it could not be read'
        : model.headings.length === 0
          ? 'it has no live level-1/2 Verified units heading (commented or fenced lookalikes do not count)'
          : 'the runtime could not prove that inserting after its heading would produce a live row (for example, the heading opens a multi-line comment)'
      out(`attest: warning — the ledger row is recorded, but the human mirror in truths/verify.md was not written because ${why}; the two surfaces now disagree until you restore that section and re-run a mirrorable attest`)
    }
  }

  out(`attest: ${verdict} — R${round} · ${standard} · ${day} — ${names.join(' ')}`)
  return 0
  }
}
