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

export function rowOk (f) {
  return f.length === 6 &&
    (f[1] === '-' || /^[0-9a-f]{64}$/.test(f[1])) &&
    (f[3] === '-' || /^[0-9]+$/.test(f[3])) &&
    f[4] !== '' && realDate(f[5])
}

// Line splitting for the ledger is done on raw bytes decoded as latin1, so a row holding invalid
// UTF-8 in its free-form `standard` column still splits on the same tabs the bash reader sees.
// (v0.3.6: that column is exactly where CP949 bytes arrive from a Korean console.)
function ledgerLines (file) {
  const b = readBytes(file)
  if (b === null) return null
  const l = b.toString('latin1').split('\n')
  if (l.length && l[l.length - 1] === '') l.pop()
  return l.map(x => (x.endsWith('\r') ? x.slice(0, -1) : x))
}

// -> [{id, digest, verdict, standard}] — LAST VALID row per id wins, sorted by the emitted line.
export function ledgerRows (file) {
  const lines = ledgerLines(file)
  if (lines === null) return []
  const d = new Map()
  for (const line of lines) {
    if (line.startsWith('#')) continue
    const f = line.split('\t')
    if (!rowOk(f)) continue
    d.set(f[0], { id: f[0], digest: f[1], verdict: f[2], standard: f[4] })
  }
  return [...d.values()]
    .map(r => `${r.id}\t${r.digest}\t${r.verdict}\t${r.standard}`)
    .sort()
}

// -> ids of rows the strict filter rejects. SHOWN by scope, never absorbed: a row that vanished
// silently would look identical to a ledger that never held it.
export function ledgerRowsBadstruct (file) {
  const lines = ledgerLines(file)
  if (lines === null) return []
  const out = new Set()
  for (const line of lines) {
    if (line.startsWith('#')) continue
    if (/^[ \t]*$/.test(line)) continue
    const f = line.split('\t')
    if (!rowOk(f)) out.add(f[0])
  }
  return [...out].sort()
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
