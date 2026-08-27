#!/usr/bin/env node
// weavedoc write gate — PreToolUse on Write|Edit.
//
// A gated mine path is writable only under a lease naming one of its owning skills. The DENY
// REASON is the product: it names which skill owns the path and how to get there, because the deny
// is the moment that skill's rules load into the session. The gate defends FORGETTING.
//
// WHAT IT CANNOT DO, stated plainly so nobody reads more into it:
//   - It sees "a mine file is being written with no owning skill loaded". It cannot see WHICH skill
//     the work belongs to — that judgment stays with the nine skills' own rules.
//   - A write routed through Bash bypasses it entirely. So does any tool outside the matcher
//     (MultiEdit, NotebookEdit) — the matcher is `Write|Edit` and widening it is a template edit.
//   - A lease is forgeable. The thing being defended is memory, not malice; the intake ledger
//     states the same limit about itself for the same reason.
//
// FAIL-OPEN. Any internal error allows the write and says so on stderr. A crashed gate that bricked
// every mine write would be switched off within a day — the same end-state as not shipping it,
// minus the trust — so `deny` is reserved for the one decision this gate exists to make.
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve, relative, isAbsolute } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
// The runtime's ONE reader for `paths:` values — see CFG_DIRS below. Importing it rather than
// re-scanning the config here is what keeps the gate and validate from resolving one mine's
// materials folder to two different places.
import { cfgPath } from '../lib/read.mjs'

const TTL_MS = 24 * 60 * 60 * 1000

// ONE SPELLING OF ONE DIRECTORY — the note in lease.mjs carries the measurement. Both sides of the
// containment test must be canonicalised through the SAME call, or the gate compares a short-name
// root against a long-name target and silently allows everything.
const canonPath = p => {
  try { return realpathSync.native(p) } catch { /* older runtimes, or a path that vanished */ }
  return realpathSync(p)
}

// Derived exactly as lease.mjs derives it — see the livelock note there.
function mineRoot (metaUrl) {
  return canonPath(dirname(dirname(dirname(dirname(fileURLToPath(metaUrl))))))
}

// The TARGET usually does not exist yet — Write creates it — so canonicalise the nearest ancestor
// that does and re-attach the rest. Canonicalising nothing (and comparing raw) is what produced the
// measured silent-allow; canonicalising only the root would produce it in the other direction.
function canonTarget (p) {
  let cur = resolve(p)
  const tail = []
  for (;;) {
    try { return join(canonPath(cur), ...[...tail].reverse()) } catch { /* not created yet */ }
    const parent = dirname(cur)
    if (parent === cur) return resolve(p)   // nothing along this path exists; compare as given
    tail.push(basename(cur))
    cur = parent
  }
}
function leasePath (root) {
  const dir = process.env.WEAVEDOC_LEASE_DIR || tmpdir()
  return join(dir, `weavedoc-lease-${createHash('sha256').update(root).digest('hex').slice(0, 8)}.json`)
}
async function readStdin () {
  const chunks = []
  for await (const c of process.stdin) chunks.push(c)
  return Buffer.concat(chunks).toString('utf8')
}

// THE RECONCILED OWNERSHIP TABLE. Its source is the nine skills' own `Write-scope` blockquotes —
// this is those declarations with their three contradictions resolved (gather writing questions.md
// and the shield, refine refreshing catalog.md, verify writing coverage.md and changelog.md).
// ORDER MATTERS: the first match wins, so every carve-out precedes the parent it carves out of.
// Field-level exceptions (map's `status: stale` stamp on a plan.md, refine's `used` stamp on a
// material) are represented as PATH-level access: a gate that tried to police fields would reject
// legal writes, and a check that rejects legal work is one nobody keeps.
const RULES = [
  ['.weavedoc-state/', null],            // machine-owned: the CLI owns these invariants
  ['.weavedoc/config.yaml', ['weavedoc-init']],
  ['.weavedoc/', null],                  // bundle bytes: replaced wholesale, never edited in place
  ['catalog.md', ['weavedoc-gather', 'weavedoc-refine']],
  ['gaps.md', ['weavedoc-gaps']],
  ['questions.md', ['weavedoc-gather', 'weavedoc-map', 'weavedoc-gaps', 'weavedoc-plan', 'weavedoc-write', 'weavedoc-refine']],
  ['project.md', ['weavedoc-init', 'weavedoc-gather', 'weavedoc-gaps']],
  ['CLAUDE.md', ['weavedoc-init']],
  ['.ignore', ['weavedoc-init']],
  ['.claude/settings.json', ['weavedoc-init']]
]

// THE THREE DIRECTORIES A PROJECT MAY MOVE. `materials`, `truths` and `documents` are config
// `paths:` values, so naming them by literal above would have guarded three names a relocated mine
// does not use while the real tree went unwatched — this file's own measured-nothing class, in the
// one direction it cannot see (allow is silent). Resolution goes through `cfgPath`, the runtime's
// single reader for these values, so the gate and validate cannot disagree about where a mine keeps
// its materials; an unreadable config falls back to the defaults, which is what cfgPath already
// does. Matched by ABSOLUTE containment rather than a root-relative prefix, because a `paths:` value
// is allowed to point outside the mine root and a rel-string test cannot express that.
const CFG_DIRS = [
  ['materials', ['weavedoc-gather', 'weavedoc-verify', 'weavedoc-refine']],
  ['truths', ['weavedoc-map', 'weavedoc-verify']],
  ['documents', ['weavedoc-plan', 'weavedoc-write', 'weavedoc-review', 'weavedoc-refine', 'weavedoc-map']]
]

// No output at all is "no opinion" — the permission system proceeds as if this hook were absent.
const allow = () => process.exit(0)
const deny = reason => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason
    }
  }) + '\n')
  process.exit(0)
}

try {
  const payload = JSON.parse(await readStdin())
  // Write carries {file_path, content}; Edit carries {file_path, old_string, new_string}. Only the
  // path is read, so both shapes work and neither content is inspected.
  const fp = payload?.tool_input?.file_path
  if (typeof fp !== 'string' || fp === '') allow()

  const root = mineRoot(import.meta.url)
  const cfgFile = join(root, '.weavedoc', 'config.yaml')
  // A bundle sitting outside a mine (a fresh copy, a template checkout) defends nothing.
  try { statSync(cfgFile) } catch { allow() }

  // Classification is TARGET-vs-ROOT, never cwd-vs-root: a session working elsewhere that writes
  // into this mine is still gated, and a write into a DIFFERENT mine is allowed here because that
  // mine's own planted gate is what defends it.
  const target = canonTarget(isAbsolute(fp) ? fp : resolve(payload?.cwd ?? process.cwd(), fp))
  const rel = relative(root, target).split('\\').join('/')
  const inRoot = rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)

  // The literal rules first, so a mine that redirects a folder INTO `.weavedoc/` still meets the
  // bundle refusal rather than a write permit. Then the configurable three, which are matched by
  // containment and therefore work whether or not they sit under the root.
  let hit = inRoot
    ? RULES.find(([prefix]) => (prefix.endsWith('/') ? rel.startsWith(prefix) : rel === prefix))
    : undefined
  if (hit === undefined) {
    hit = CFG_DIRS
      .map(([key, owners]) => [canonTarget(cfgPath(cfgFile, key, key, root)), owners])
      .find(([dir]) => {
        const r = relative(dir, target)
        return r !== '' && !r.startsWith('..') && !isAbsolute(r)
      })
  }
  // inbox/, output/, docs/, anything else — and anything outside this mine: not ours to police.
  if (hit === undefined) allow()

  const [prefix, owners] = hit
  if (owners === null) {
    deny(prefix === '.weavedoc-state/'
      ? `${rel} is machine-owned mine state and no skill writes it by hand — the CLI is what keeps these ledgers well-formed. Use 'node .weavedoc/bin/weavedoc.mjs conflict add|remove …' or 'alloc …' instead.`
      : `${rel} is a runtime-bundle file. The bundle is replaced wholesale by an upgrade or a re-copy, so an in-place edit is silently reverted on the next one — and until then this mine runs a runtime that matches no release. Project settings live in .weavedoc/config.yaml (weavedoc-init writes it).`)
  }

  const lf = leasePath(root)
  let entry = null
  try {
    entry = JSON.parse(readFileSync(lf, 'utf8'))?.sessions?.[payload?.session_id ?? ''] ?? null
  } catch { entry = null }
  if (entry && typeof entry.ts === 'number' && Date.now() - entry.ts <= TTL_MS && owners.includes(entry.skill)) allow()

  deny(`${rel} is written by ${owners.join(' / ')}, and this session holds no lease from ${owners.length > 1 ? 'any of them' : 'it'}${entry ? ` (its current lease is ${entry.skill})` : ''}. Invoke the owning skill first — Skill(${owners[0]}) — and then retry: that skill carries the write rules for this path, and the lease it leaves behind is what this gate reads.`)
} catch (e) {
  process.stderr.write(`weavedoc gate: internal error (${e?.message ?? e}) — allowing the write; this gate fails open by design\n`)
  process.exit(0)
}
