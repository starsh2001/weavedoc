// WeaveDoc foundations — the verification substrate: ledger rows and digests.
//
// Everything here is BYTE work. A digest is the spelling of "which bytes were verified", and every
// verification verdict downstream rides on the number, so these read files as buffers and never as
// decoded text: decoding and re-encoding would silently rewrite any byte that is not valid UTF-8.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { canonId, isFence } from './core.mjs'

const sha256 = buf => createHash('sha256').update(buf).digest('hex')
const readBytes = p => { try { return readFileSync(p) } catch { return null } }

// ---- ledger -------------------------------------------------------------------------------
// ONE structural row filter for the verification sidecar. The same six-column format validate
// enforces decides what EVERY reader consumes — scope once read any >=3-column row while validate
// demanded six, so a truncated attest row counted digest-bound in one command and blocked the mine
// in the other. Verdict WORDS are deliberately NOT judged here; structure is. scope quarantines
// unknown verdicts visibly, and that is a different job from this one.
function realDate (s) {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return false
  const y = +s.slice(0, 4); const m = +s.slice(5, 7); const dd = +s.slice(8, 10)
  if (m < 1 || m > 12 || dd < 1) return false
  let ml = +'312831303130313130313031'.substr((m - 1) * 2, 2)
  if (m === 2 && (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) ml = 29
  return dd <= ml
}

// A field may not carry a control byte. TAB cannot reach here (it is the separator) but CR and LF
// can — a `standard` column holding one splits or corrupts the row for the next reader, which is
// how the same fact ended up spelled two ways on two surfaces before. Not a display concern: this
// is the structure test, so it fails the row.
const CTL = /[\x00-\x08\x0a-\x1f\x7f]/  // eslint-disable-line no-control-regex

export function rowOk (f) {
  return f.length === 6 &&
    (f[1] === '-' || /^[0-9a-f]{64}$/.test(f[1])) &&
    (f[3] === '-' || /^[0-9]+$/.test(f[3])) &&
    f[4] !== '' && realDate(f[5]) &&
    !f.some(x => CTL.test(x))
}

// THE ledger reader — one for every consumer (§11 decision 2026-08-05). Before this there were
// three, and they disagreed about the same bytes: `scope` stripped a trailing CR and `validate`
// kept it (so a git-autocrlf checkout read as *nothing unverified* to one and LEDGER-MALFORMED to
// the other), and `scope` READ a final line with no newline while `validate` discarded it — which
// is exactly the shape an interrupted `attest` leaves behind.
//
// Rules, all decided rather than inherited:
//   - a trailing CRLF is a line ending like any other; autocrlf is the normal state of a Windows
//     working tree, so refusing it would block mines nobody broke
//   - a NON-EMPTY final line with no terminator is MALFORMED, never skipped: dropping it silently
//     is how a half-written verification row disappears instead of raising an alarm
// -> [{raw, terminated}] in file order, or null if the file cannot be read.
export function ledgerLines (file) {
  const b = readBytes(file)
  if (b === null) return null
  const parts = b.toString('latin1').split('\n')
  const dangling = parts[parts.length - 1] !== ''
  if (!dangling) parts.pop()
  return parts.map((x, i) => ({
    raw: x.endsWith('\r') ? x.slice(0, -1) : x,
    terminated: !(dangling && i === parts.length - 1)
  }))
}

const isSkippable = raw => raw.startsWith('#') || /^[ \t]*$/.test(raw)

// THE evidence index. `LAST row per id wins` is the published contract (FORMATS.md), and this is
// the whole of it — including what happens when that last row is unreadable.
//
//   last row of an id is well-formed  -> it wins, whatever came before it
//   last row of an id is MALFORMED    -> the id is QUARANTINED: no evidence at all, not even the
//                                        earlier valid row, and not the v1 frontmatter fallback
//   a malformed row with a later valid one -> the valid row wins (the row is still reported)
//
// The quarantine rule is the point. Reading "last VALID row wins" instead means a verification that
// broke WHILE BEING WRITTEN resurrects the previous `verified`, and scope then describes a state
// the mine is not in. Unreadable evidence is not old evidence; it is no evidence — the same ruling
// already applied to unreadable VERDICTS (2026-08-04), extended to unreadable STRUCTURE.
// -> {win: Map<id,fields>, quarantined: Set<id>, malformed: Set<id>, headless: number}
export function ledgerIndex (file) {
  const lines = ledgerLines(file)
  const win = new Map(); const quarantined = new Set(); const malformed = new Set()
  let headless = 0
  if (lines === null) return { win, quarantined, malformed, headless }
  for (const { raw, terminated } of lines) {
    if (isSkippable(raw)) continue
    const f = raw.split('\t')
    const id = f[0]
    if (rowOk(f) && terminated) {
      win.set(id, f)
      quarantined.delete(id)          // a later good row rehabilitates the id
      continue
    }
    if (id === '') { headless++; continue }   // no id to attribute the damage to — file-level
    malformed.add(id)
    win.delete(id)
    quarantined.add(id)
  }
  return { win, quarantined, malformed, headless }
}

// -> "id\tdigest\tverdict\tstandard" per unit, sorted. Quarantined ids are ABSENT by construction.
export function ledgerRows (file) {
  return [...ledgerIndex(file).win.values()]
    .map(f => `${f[0]}\t${f[1]}\t${f[2]}\t${f[4]}`)
    .sort()
}

// -> ids holding any row the strict filter rejects. SHOWN by scope, never absorbed: a row that
// vanished silently would look identical to a ledger that never held it.
export function ledgerRowsBadstruct (file) {
  return [...ledgerIndex(file).malformed].sort()
}

// -> ids whose LAST row is unreadable, so they carry no evidence and open no fallback.
export function ledgerQuarantined (file) {
  return ledgerIndex(file).quarantined
}

// ---- digests ------------------------------------------------------------------------------
// THE spelling of "what was verified": the truth file's raw bytes, untouched.
export function truthDigest (file) {
  const b = readBytes(file)
  return b === null ? null : sha256(b)
}

// The material's bytes MINUS its frontmatter `status:` line. `status` is the lifecycle axis —
// refine rewrites it at consecration, and a verification that died on a lifecycle stamp would
// re-fuse the two axes WD-COR-001 split. Only that ONE frontmatter line is excluded; a body line
// spelling `status:` is content and stays hashed.
//
// Line handling matches core.mjs splitLines (a trailing CR is not part of the line) and the filtered
// text is re-joined with \n, which is what the bash pipeline hands to sha256sum on Windows. See
// REWRITE_PLAN §4: bash's own answer here is platform-dependent, and this is the side that is not.
export function matDigest (file) {
  const b = readBytes(file)
  if (b === null) return null
  const lines = b.toString('latin1').split('\n')
  if (lines.length && lines[lines.length - 1] === '') lines.pop()
  const out = []
  let infm = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].endsWith('\r') ? lines[i].slice(0, -1) : lines[i]
    if (i === 0 && isFence(line)) { infm = true; out.push(line); continue }
    if (infm && isFence(line)) { infm = false; out.push(line); continue }
    if (infm && /^status[ \t]*:/.test(line)) continue
    out.push(line)
  }
  const text = out.length ? out.join('\n') + '\n' : ''
  return sha256(Buffer.from(text, 'latin1'))
}

// A file OR a directory. Directory: a `relpath\0sha256\n` manifest, relpaths sorted bytewise and
// the manifest re-hashed — so adding, removing, renaming or editing any file under final/ changes
// the one digest.
export function artifactDigest (path) {
  let st
  try { st = statSync(path) } catch { return null }
  if (st.isFile()) return truthDigest(path)
  if (!st.isDirectory()) return null
  const rel = []
  const walk = (d, pre) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      const r = pre ? `${pre}/${e.name}` : e.name
      if (e.isDirectory()) walk(p, r)
      else if (e.isFile()) rel.push([r, p])
    }
  }
  walk(path, '')
  rel.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const parts = rel.map(([r, p]) => Buffer.concat([
    Buffer.from(r, 'latin1'), Buffer.from([0]), Buffer.from(sha256(readBytes(p)), 'latin1'), Buffer.from('\n', 'latin1')
  ]))
  return sha256(Buffer.concat(parts))
}
