// WeaveDoc foundations — the write substrate.
//
// Everything the write commands learned the hard way lives here, in one spelling: stage beside the
// target and rename (never write the target in place), refuse a write target outside the project or
// reached through a symlink, and take the date from one clock.
//
// The staging rule is not politeness. `> "$target"` truncates before it writes, so a process that
// dies mid-write leaves a half file where a whole one used to be — for `truths/index.md` that is a
// mine that no longer describes itself. Staging beside the target keeps the rename atomic on the
// same filesystem, which is why the temp is never put in /tmp.
import { writeFileSync, renameSync, unlinkSync, realpathSync, lstatSync, statSync, readFileSync, chmodSync, appendFileSync, openSync, readSync, closeSync, truncateSync } from 'node:fs'

// ---- byte-transparent text -----------------------------------------------------------------
// A mine can hold bytes that are not valid UTF-8 — a Korean console pastes CP949 into a free-text
// field, and the bash runtime carries those bytes through awk untouched. Decoding such a file as
// UTF-8 and writing it back replaces every offending byte with U+FFFD, so a command that only meant
// to insert ONE line silently rewrites lines it never looked at. That is data loss, not a display
// problem, and it is why the write paths read and write through latin1: one char per byte, exact
// round trip. Every regex and split below is ASCII-anchored, so they behave identically either way.
export const readText = p => { try { return readFileSync(p).toString('latin1') } catch { return '' } }
// A source literal (a Korean heading, an em dash) belongs to the SAME byte domain once it is going
// into one of those strings — otherwise latin1 encoding would write U+2014 as the single byte 0x14.
export const U = s => Buffer.from(s, 'utf8').toString('latin1')
export const textBuf = s => Buffer.from(s, 'latin1')

// `date +%F` — LOCAL date, not UTC. The ledger row and the verify.md mirror line both carry it, and
// they must carry the same one, so there is one function and every caller reads it once per run.
export function today () {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Stage beside the target, then rename. Returns false on any failure with the stage removed — the
// caller reports it; a failed write must never look like a skipped one.
export function writeAtomic (target, data) {
  const tmp = `${target}.tmp.${process.pid}`
  try {
    writeFileSync(tmp, data)
    rename(tmp, target)
    return true
  } catch {
    try { unlinkSync(tmp) } catch { /* nothing staged, or already gone */ }
    return false
  }
}

// The same write, PROMOTED: false becomes a throw naming the file. For callers inside a
// transaction boundary (retag, upgrade — §11 2026-08-05) — there, a false someone forgets to test
// IS the half-applied state the boundary exists to prevent, so the type system of "you must
// handle this" is an exception, not a return value.
export function writeAtomicX (target, data) {
  if (!writeAtomic(target, data)) throw new Error(`write failed: ${target}`)
}

// POSIX rename REPLACES the destination — permission to do so belongs to the directory, not to the
// file being replaced. Windows disagrees: renameSync onto a file carrying the read-only attribute
// throws EPERM, while the MSYS `mv` this replaces succeeds. Left alone that is a silent split —
// attest's mirror write is allowed to fail quietly, so bash would update verify.md and Node would
// not while both printed the same success line. Clearing the attribute and retrying is what MSYS
// does underneath, and it is confined to the retry so an ordinary failure still fails.
export function rename (from, to) {
  try {
    renameSync(from, to)
  } catch (e) {
    if (e.code !== 'EPERM' && e.code !== 'EACCES') throw e
    chmodSync(to, 0o666)
    renameSync(from, to)
  }
}

// ---- the append-only ledger transaction ------------------------------------------------------
// ONE spelling for BOTH machine-owned ledgers — the verification sidecar `attest` writes and the
// intake ledger `intake` writes. Every rule below was fought for on the attest path (v0.5.1
// external review P1-3, then the cold review after it), and a second hand-copy of them on the
// intake path would be the same four rules drifting apart file by file: the two-readers class this
// runtime keeps a name for, in its writing clothes.
//
//   1. create-if-absent is ATOMIC ('wx') and carries the header. NEVER read-then-write: that loses
//      a concurrent append, and on a READ failure it REPLACES a ledger whose bytes it could not
//      read — history deleted, success reported.
//   2. a final row with no terminator BLOCKS the append, because appending would FUSE two rows into
//      one. That torn row is the signature of a writer that died mid-write.
//   3. one append call can land SOME bytes and then fail (ENOSPC, a size limit); under last-row-wins
//      the complete prefix rows become real evidence while the command reports failure. The
//      pre-append size is rolled back — and the truncation is VERIFIED, because "restored" is a
//      claim like any other.
//   4. if THIS call created the file, "as before" means ABSENT: truncating to the header would leave
//      a ledger where none existed, under a sentence claiming nothing was written.
//
// The RULES are shared; the SENTENCES are not. Each caller phrases its own outcome (`attest` says
// "nothing counts as attested", `intake` "nothing counts as declared"), because a templated message
// is how a precise refusal turns into a generic one.
//
// -> {ok: true, created} | {ok: false, kind, code, created}
//    kind: 'create' · 'notfile' · 'torn' · 'tailread' · 'rolled-back' · 'rollback-failed'
//          · 'created-removed' · 'created-stuck'
export const realAppendOps = { append: (f, buf) => appendFileSync(f, buf) }

export function appendLedgerRows (file, header, rows, ops = realAppendOps) {
  const isFile = p => { try { return statSync(p).isFile() } catch { return false } }
  let created = false
  try {
    writeFileSync(file, header, { flag: 'wx' })
    created = true
  } catch (e) {
    if (e.code !== 'EEXIST') return { ok: false, kind: 'create', code: e.code, created }
  }
  try {
    const st = statSync(file)
    // NOT A REGULAR FILE — a directory wearing the ledger's name. Checked HERE, before the tail-byte
    // guard, because the two OSes disagree about what happens next (v0.5.1 cold review): on Windows
    // a directory stats as size 0, the guard never ran, the append failed EISDIR, and the failure
    // branch told the user to hand-delete a torn row that never existed.
    if (!st.isFile()) return { ok: false, kind: 'notfile', code: 'EISDIR', created }
    if (st.size > 0) {
      const fd = openSync(file, 'r')
      const tail = Buffer.alloc(1)
      try { readSync(fd, tail, 0, 1, st.size - 1) } finally { closeSync(fd) }
      if (tail[0] !== 0x0a) return { ok: false, kind: 'torn', code: '', created }
    }
  } catch (e) {
    return { ok: false, kind: 'tailread', code: e.code, created }
  }
  const sizeBefore = (() => { try { return statSync(file).size } catch { return null } })()
  try {
    ops.append(file, Buffer.from(rows.join(''), 'utf8'))
  } catch (e) {
    if (created) {
      let gone = false
      try { unlinkSync(file); gone = !isFile(file) } catch { gone = false }
      return { ok: false, kind: gone ? 'created-removed' : 'created-stuck', code: e.code, created }
    }
    let restored = false
    if (sizeBefore !== null) {
      try {
        truncateSync(file, sizeBefore)
        restored = statSync(file).size === sizeBefore
      } catch { restored = false }
    }
    return { ok: false, kind: restored ? 'rolled-back' : 'rollback-failed', code: e.code, created }
  }
  return { ok: true, created }
}

// A WRITE target outside the project, or reached through a symlink, is refused (WD-IO-001). Reads
// may follow a redirected path wherever the user pointed it; writing there is another matter.
// Mirrors require_inside_root, including its two-step: the symlink check is on the path AS GIVEN
// (lstat, not stat), and the containment check is on the RESOLVED path — a symlink that resolves
// inside the root is still refused, because the guard is about which name was written through.
export function requireInsideRoot (root, dir, cmd, errln) {
  const p = dir.replace(/\/$/, '')
  try {
    if (lstatSync(p).isSymbolicLink()) { errln(`${cmd}: refusing to write through a symlink: ${p}`); return false }
  } catch { /* not there at all — the existence check below is the one that reports it */ }
  // rp() is `cd "$1" && pwd -P`: it answers for DIRECTORIES only and is empty for anything else.
  const rp = q => {
    try { return statSync(q).isDirectory() ? realpathSync(q).replace(/\\/g, '/') : '' } catch { return '' }
  }
  const rr = rp(root)
  const pr = rp(p)
  if (pr === '') { errln(`${cmd}: write target does not exist: ${p}`); return false }
  if (`${pr}/`.startsWith(`${rr}/`)) return true
  errln(`${cmd}: refusing to write outside the project root: ${p} (resolves to ${pr}; root is ${rr})`)
  return false
}
