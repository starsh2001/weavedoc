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
import { writeFileSync, renameSync, unlinkSync, realpathSync, lstatSync, statSync, readFileSync, chmodSync } from 'node:fs'

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
