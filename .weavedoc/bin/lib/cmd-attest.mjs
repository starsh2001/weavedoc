// weavedoc attest <verified|failed> <round> <standard> <id...> — THE verification write path.
//
// The digest is computed HERE and never by hand, so "which bytes were verified" has one spelling.
// All-or-nothing: every id resolves, exists and is not a tombstone BEFORE one byte is written —
// a partially applied attest would record coverage for units nobody checked.
import { statSync, readFileSync, writeFileSync, appendFileSync, openSync, readSync, closeSync, truncateSync, unlinkSync, mkdirSync, rmdirSync } from 'node:fs'

// The append, injectable (the consecrate/retag/upgrade precedent): node:fs cannot be reached by a
// PATH shim, so the fault-injection driver is the only caller that ever passes anything else.
export const realOps = {
  append: (f, buf) => appendFileSync(f, buf)
}

// THE LEDGER LOCK (§11 2026-08-05, v0.5.2). The v0.5.1 truncate-back closed one hole and opened a
// narrower one: rollback is a COMPENSATING write, and a compensating write without mutual exclusion
// can erase a neighbour's success — measured deterministically through the seam: attest A appended
// its row (rc 0) inside attest B's stat-to-truncate window, and B's rollback chopped it; on a
// fresh ledger B's unlink took the whole file, A's committed row included. So the whole
// create → tail-check → size → append → rollback → mirror sequence is ONE critical section.
//
// The lock is a DIRECTORY beside the ledger: mkdir is atomic on every platform this runs on, and a
// directory cannot be half-created. Stale locks (a crashed attest) are reclaimed by age — attest is
// a sub-second command, so a lock older than STALE_MS belongs to a corpse. The wait is bounded: a
// tool that can hang on a lock nobody will release is worse than one that refuses loudly.
const STALE_MS = 10_000
const WAIT_MS = 5_000
const sleep = ms => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) } catch { const t = Date.now(); while (Date.now() - t < ms) { /* spin */ } } }
// -> '' on success, or the sentence explaining the refusal. EVERY loop iteration passes through the
// bound check and the sleep — the first draft's stale-reclaim branch `continue`d past both, so an
// UNDELETABLE stale lock (a file wearing the lock's name → ENOTDIR; a directory with something
// inside → ENOTEMPTY) spun this loop hot and unbounded, falsifying its own "the wait is bounded"
// comment (cold review, measured on both platforms with a timeout). And a non-EEXIST mkdir failure
// returned plain false, which the caller narrated as "another attest holds the lock" — a story
// about a lock that did not exist. Refusals carry their own true sentence now.
function acquireLock (lockPath, rel) {
  const start = Date.now()
  for (;;) {
    try { mkdirSync(lockPath); return '' } catch (e) {
      if (e.code !== 'EEXIST') {
        return `the ledger lock cannot be created at ${rel} (${e.code}) — fix the path (permissions, or something wearing the lock's name)`
      }
      let stale = false
      try { stale = Date.now() - statSync(lockPath).mtimeMs > STALE_MS } catch { /* vanished — fall through to the bounded retry */ }
      if (stale) {
        try { rmdirSync(lockPath) } catch (e2) {
          // ENOENT: another waiter reclaimed it first — retry below. Anything else means the lock
          // object cannot be removed by rmdir, and no amount of waiting will change that.
          if (e2.code !== 'ENOENT') return `a stale ledger lock at ${rel} cannot be removed (${e2.code} — a file wearing the lock's name, or a non-empty directory); delete it by hand, then re-run`
        }
        // NO `continue` here even on success — a `continue` that skips the bound is exactly the
        // unbounded-spin bug this rewrite removes, and it would come back the moment an OS lies
        // about rmdir (ENOENT for a still-present object). The retry happens via the loop, and
        // EVERY iteration, without exception, passes through the bound check and the sleep.
      }
      if (Date.now() - start > WAIT_MS) {
        return `another attest holds the ledger lock (${rel}) and did not release it within ${WAIT_MS / 1000}s — if no attest is running, the lock is a leftover from a crash; remove the directory and re-run`
      }
      sleep(50)
    }
  }
}
const releaseLock = lockPath => { try { rmdirSync(lockPath) } catch { /* reclaimed as stale, or never held */ } }
import { canonId, inList, splitLines } from './core.mjs'
import { join, fm, tfileFor, unitDigest } from './mine.mjs'
import { today, writeAtomic, readText, textBuf, U } from './write.mjs'

// `-f` and `-d`, not "exists". The distinction is not pedantry here: readFileSync on a directory
// THROWS, so an `existsSync` gate would turn a mine where `verify.md` is a folder from bash's quiet
// skip into an uncaught stack trace. Every test below is the one the original spells.
const isFile = p => { try { return statSync(p).isFile() } catch { return false } }
const isDir = p => { try { return statSync(p).isDirectory() } catch { return false } }

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

  const day = today()
  const rows = []
  const names = []
  for (const id of ids) {
    const cid = canonId(id)
    if (cid === null) { out(`attest: '${id}' is not a material/truth id — nothing written`); return 2 }
    let st
    if (cid.startsWith('m')) {
      const f = join(m.materials, cid, 'converted.md')
      if (!isFile(f)) { out(`attest: no converted.md for '${id}' (${cid}) — nothing written`); return 2 }
      st = fm(f, 'status')
    } else {
      const tf = tfileFor(m, cid)
      if (tf === null) { out(`attest: no truth file for '${id}' (${cid}) — nothing written`); return 2 }
      st = fm(tf, 'status')
    }
    if (st === 'retracted' || st === 'discarded') {
      out(`attest: ${cid} is ${st} — a tombstone is outside the verification population; nothing written`); return 2
    }
    const dg = unitDigest(m, cid)
    if (dg === null) { out(`attest: cannot digest '${id}' (${cid}) — nothing written`); return 2 }
    rows.push(`${cid}\t${dg}\t${verdict}\t${round}\t${standard}\t${day}\n`)
    names.push(cid)
  }

  const lf = join(m.truths, m.ledgerFile())
  if (!isDir(m.truths)) { out('attest: no truths/ directory'); return 2 }

  // Everything from here to the mirror runs under the ledger lock — see acquireLock above for why
  // a compensating rollback without mutual exclusion erases a neighbour's committed row.
  const lockPath = `${lf}.lock`
  const lockRel = lockPath.startsWith(`${m.root}/`) ? lockPath.slice(m.root.length + 1) : lockPath
  const lockWhy = acquireLock(lockPath, lockRel)
  if (lockWhy) { out(`attest: ${lockWhy}. Nothing written`); return 1 }
  try {
    return attestLocked()
  } finally {
    releaseLock(lockPath)
  }

  function attestLocked () {
  // THE LEDGER IS APPENDED TO, NOT REWRITTEN (§11 2026-08-05). It used to be read whole, joined
  // with the new rows and renamed into place, which had two consequences the external review named:
  //   1. a read that FAILED on an existing file fell back to a fresh header — so an unreadable
  //      ledger was REPLACED and its verification history deleted, reporting success. The fix is
  //      not a better error path: this command no longer reads the ledger to write it, so there is
  //      nothing to fail to read and nothing to accidentally replace.
  //   2. read-then-rewrite is a lost-update window — two attests both read, both rewrite, and the
  //      later one drops the earlier's rows. An append is one operation; concurrent appends
  //      interleave by row and cannot overwrite each other — and since v0.5.2 the whole sequence
  //      sits under the lock anyway, because the truncate-back rollback is a rewrite in disguise.
  // The file is created with its header via 'wx' — atomic create-if-absent.
  let createdHere = false
  try {
    writeFileSync(lf, LEDGER_HEADER, { flag: 'wx' })
    createdHere = true
  } catch (e) {
    if (e.code !== 'EEXIST') { out(`attest: cannot create the ledger (${e.code}) — nothing written`); return 1 }
  }
  // An append onto a file whose last row was never terminated would FUSE the two rows into one.
  // validate already blocks such a ledger (that torn row is the signature of an attest that died
  // mid-write), and this refuses to make it worse. Reading one byte is also the only read left
  // here, and a failure to do it is fatal on purpose — the case above is what silent fallback costs.
  try {
    const st = statSync(lf)
    // NOT A REGULAR FILE — a directory wearing the ledger's name. Checked HERE, before the
    // tail-byte guard, because the two OSes disagree about what happens next (v0.5.1 cold review):
    // on Windows a directory stats as size 0, the guard never ran, the append failed EISDIR, and
    // the failure branch told the user to hand-delete a torn row that never existed. One refusal,
    // one true sentence, both platforms.
    if (!st.isFile()) {
      out('attest: the ledger path exists but is not a regular file (a directory wearing its name) — fix the path first; nothing written'); return 1
    }
    if (st.size > 0) {
      const fd = openSync(lf, 'r')
      const tail = Buffer.alloc(1)
      try { readSync(fd, tail, 0, 1, st.size - 1) } finally { closeSync(fd) }
      if (tail[0] !== 0x0a) {
        out('attest: the ledger\'s last row has no line terminator — appending would fuse it with the new row. That torn row is what an interrupted attest leaves behind; run validate, repair or delete it, then re-run. Nothing written'); return 1
      }
    }
  } catch (e) {
    out(`attest: cannot read the ledger's end (${e.code}) — refusing to append blind; nothing written`); return 1
  }
  // All-or-nothing SURVIVES a partial append (v0.5.1, external review P1-3): one append call can
  // land some bytes and then fail (ENOSPC, a size limit), and whatever COMPLETE rows landed become
  // real evidence under last-row-wins while the command reports failure — the first id verified,
  // the second not, under one rc 1. The size is recorded before the append and the file is put back
  // on failure; the truncation is then VERIFIED, because "restored" is a claim like any other.
  const sizeBefore = (() => { try { return statSync(lf).size } catch { return null } })()
  try {
    ops.append(lf, Buffer.from(rows.join(''), 'utf8'))
  } catch (e) {
    // If THIS run created the file, "as before" means ABSENT — truncating to the header would leave
    // a ledger where none existed and a sentence claiming otherwise (v0.5.1 cold review).
    if (createdHere) {
      let gone = false
      try { unlinkSync(lf); gone = !isFile(lf) } catch { gone = false }
      if (gone) { out(`attest: ledger write failed (${e.code}) — the ledger this run created was removed again; there was none before and there is none now`); return 1 }
      out(`attest: ledger write failed (${e.code}) AND the just-created ledger could not be removed — it holds a header and possibly a torn row; run validate, then delete the file by hand`); return 1
    }
    let restored = false
    if (sizeBefore !== null) {
      try {
        truncateSync(lf, sizeBefore)
        restored = statSync(lf).size === sizeBefore
      } catch { restored = false }
    }
    if (restored) { out(`attest: ledger write failed (${e.code}) — the partial append was rolled back, the ledger is as before; nothing counts as attested`); return 1 }
    out(`attest: ledger write failed (${e.code}) AND the partial bytes could not be removed — run validate: it will name the torn row; delete it by hand before re-running`); return 1
  }

  // Human mirror into `## Verified units` — the markdown stays the readable view while the sidecar
  // stays scope's source of truth, so a missing section costs readability and never coverage.
  // Failed verdicts stay sidecar-only: a markdown row ending in a verdict would be read as covering
  // the units it names, and a failed round covers nothing.
  const vmd = join(m.truths, 'verify.md')
  if (verdict === 'verified' && isFile(vmd)) {
    // Read as BYTES. The rest of this file is prose nobody asked us to touch, and some of it can be
    // CP949 — decoding it as UTF-8 to insert one line would rewrite every one of those bytes.
    const lines = splitLines(readText(vmd))
    const isHead = l => /^#+[ \t]*Verified units[ \t]*$/.test(l)
    if (lines.some(isHead)) {
      const mline = U(`- ${names.join(' · ')} — R${round} ${day} · ${standard} · verified`)
      const outl = []
      let done = false
      for (const l of lines) {
        outl.push(l)
        if (!done && isHead(l)) { outl.push(mline); done = true }
      }
      // The ledger row is already committed, so a mirror failure does not fail the command — but it
      // is NAMED now (v0.5.1): the mirror is the same fact on a second surface, and two surfaces
      // silently disagreeing about one fact is the exact split the -v/ENVIRON episode taught.
      if (!writeAtomic(vmd, textBuf(outl.map(l => `${l}\n`).join('')))) {
        out(`attest: warning — the ledger row is recorded, but the human mirror in truths/verify.md could not be written; the two surfaces now disagree until you add the line by hand or re-run a mirrorable attest`)
      }
    }
  }

  out(`attest: ${verdict} — R${round} · ${standard} · ${day} — ${names.join(' ')}`)
  return 0
  }
}
