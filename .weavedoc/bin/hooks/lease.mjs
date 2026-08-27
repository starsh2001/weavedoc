#!/usr/bin/env node
// weavedoc lease hook — PostToolUse on the Skill tool.
//
// It records one fact: "this session is operating under skill K". `gate.mjs` reads that fact to
// answer a mine write. Nothing else here judges anything.
//
// EXIT 0, ALWAYS. This hook observes a Skill call it must never break: a lease writer that failed
// the call it is watching would be switched off within a day, which is the same end-state as not
// shipping it, minus the trust. The worst a failure here can do is leave the gate strict, and the
// gate's deny message names the repair (invoke the skill again).
//
// The lease lives in the OS temp directory, keyed by a hash of the mine root — NOT in the mine.
// `.weavedoc-state/` is a git-tracked directory in a real mine, and a file that changes every
// session would be permanent commit noise there; the temp directory needs no ignore rule and the
// OS reclaims it. WEAVEDOC_LEASE_DIR overrides it, which is how the suite stays hermetic.
import { readFileSync, writeFileSync, renameSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

// A session older than a day re-arms by invoking its skill again. The pruning is here rather than
// in the gate because the writer is the only side that may rewrite the file.
const TTL_MS = 24 * 60 * 60 * 1000

// ONE SPELLING OF ONE DIRECTORY. Windows hands the same path out under two names — the 8.3 short
// form (`C:\Users\SHC7D6~1.CHO\…`) and the long one (`C:\Users\sh.choi\…`) — and which one a
// process sees depends on who launched it. Plain `realpathSync` PRESERVES whichever it was given;
// only `.native` canonicalises. Measured while building this: the hook reached by its short-name
// path derived one root while the payload named the target by its long one, so the gate's
// containment test came out false and it allowed every mine write while exiting 0 — a check that
// reports success having measured nothing, the class this repo names everywhere else.
export const canonPath = p => {
  try { return realpathSync.native(p) } catch { /* older runtimes, or a path that vanished */ }
  return realpathSync(p)
}

// THE ROOT IS DERIVED FROM THIS FILE, never from cwd — and gate.mjs derives it the same way, byte
// for byte. If the two ever disagreed, a session could invoke the owning skill forever while the
// gate read a key the lease writer never wrote: a livelock whose only symptom is a deny message
// that keeps being right. hooks -> bin -> .weavedoc -> root.
export function mineRoot (metaUrl) {
  return canonPath(dirname(dirname(dirname(dirname(fileURLToPath(metaUrl))))))
}

export function leasePath (root) {
  const dir = process.env.WEAVEDOC_LEASE_DIR || tmpdir()
  return join(dir, `weavedoc-lease-${createHash('sha256').update(root).digest('hex').slice(0, 8)}.json`)
}

export async function readStdin () {
  const chunks = []
  for await (const c of process.stdin) chunks.push(c)
  return Buffer.concat(chunks).toString('utf8')
}

try {
  const payload = JSON.parse(await readStdin())
  const skill = payload?.tool_input?.skill ?? ''
  const sid = payload?.session_id ?? ''
  // Only weavedoc skills, and only when the session can be named. A lease with no session id
  // belongs to nobody and would be readable by everybody.
  if (sid !== '' && /^weavedoc-/.test(skill)) {
    const lf = leasePath(mineRoot(import.meta.url))
    let state = { sessions: {} }
    // An unreadable or corrupt lease starts fresh rather than aborting: this file is a
    // convenience, never a record, and nothing in the mine depends on its history.
    try {
      const parsed = JSON.parse(readFileSync(lf, 'utf8'))
      if (parsed && typeof parsed.sessions === 'object' && parsed.sessions !== null) state = parsed
    } catch { /* absent or corrupt — see above */ }
    const now = Date.now()
    for (const [k, v] of Object.entries(state.sessions)) {
      if (!v || typeof v.ts !== 'number' || now - v.ts > TTL_MS) delete state.sessions[k]
    }
    // ONE SKILL PER SESSION, on purpose. Invoking a second weavedoc skill SWITCHES the lease, so a
    // session that moved on is gated by where it moved to — and the deny message is the moment the
    // new skill's rules load, which is the whole point of the gate.
    state.sessions[sid] = { skill, ts: now }
    const tmp = `${lf}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(state))
    renameSync(tmp, lf)
  }
} catch { /* exit 0 regardless — see the header */ }
process.exit(0)
