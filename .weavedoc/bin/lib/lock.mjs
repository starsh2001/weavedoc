// THE LEDGER LOCK — one writer at a time, and NO automatic reclaim (§11 2026-08-06, review #6).
//
// The first cut of v0.5.2 reclaimed locks older than 10s, and that reclaim was measured STEALING
// the lock from a slow-but-alive holder (injected 13s hold, neighbour entering at 10.6s): the
// neighbour committed rc 0, the original holder's rollback then chopped the neighbour's row — on a
// fresh ledger it unlinked the whole file, rc-0 row inside, and validate stayed green. The very
// class the lock exists to close, reopened by its own convenience branch.
//
// No age threshold can tell a corpse from a suspended process, a sleeping laptop or a slow disk;
// a heartbeat could, and a single-file CLI does not carry one. So the rule is the honest one:
// A LOCK HOLDS UNTIL ITS HOLDER REMOVES IT — OR A HUMAN DOES. A crashed writer leaves its lock
// behind, and every later writer refuses loudly, naming the exact path to delete; one manual
// removal is the price of never destroying a live neighbour's committed write.
//
// The lock is a DIRECTORY beside the ledger: mkdir is atomic on every platform this runs on, and
// a directory cannot be half-created. EVERY writer that touches the ledger file — attest, and
// upgrade --apply's migration transaction — acquires THIS lock through THIS module; a second
// spelling of the protocol would be the two-writers drift class in its locking clothes.
import { mkdirSync, rmdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

const WAIT_MS = 5_000
const sleep = ms => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) } catch { const t = Date.now(); while (Date.now() - t < ms) { /* spin */ } } }

// Which locks THIS process marked, and with what nonce. `releaseLedgerLock` removes a lock only
// when the on-disk mark still matches — the one path that could otherwise break the exclusion
// without any code being wrong (review #7): a human deletes a LIVE lock against the refusal's own
// instruction, a second writer acquires, and the first holder's release then removed the SECOND
// holder's lock, reopening the overlap this module exists to prevent. The mark changes nothing on
// the honest paths, and it is NOT a reclaim channel: a leftover lock — marked, foreign-marked, or
// empty (a crash between mkdir and the mark) — refuses everyone until a human removes it.
const owned = new Map()

// -> '' on success, or the sentence explaining the refusal (the caller prefixes its own name).
// EVERY loop iteration passes through the bound check and the sleep — no branch skips them; the
// branch that did (the reclaim's `continue`) is how the first cut spun hot and unbounded on an
// undeletable lock object. A FILE wearing the lock's name is just a held lock here: mkdir says
// EEXIST for it on every platform (measured), so it rides the bounded wait into the refusal that
// tells a human to look. The clock is MONOTONIC (performance.now) — a wall clock stepping
// backwards must not stretch the bounded wait (review #7).
//
// ONE acquire, TWO locks (v0.5.4, review #9): the LEDGER lock serialises the writers that touch
// the sidecar and WAITS a bounded 5s for its neighbour, because two attests in a row is a normal
// thing to do. The MINE lock is the admission gate for every mutating command and does NOT wait —
// WeaveDoc supports one writing command per mine at a time, so a second one is refused rather than
// queued. Same mkdir, same no-reclaim rule, same ownership mark; only the wait and the sentences
// differ, and they are parameters rather than a second copy of this loop.
function acquire (lockPath, rel, waitMs, msg) {
  const start = performance.now()
  for (;;) {
    try {
      mkdirSync(lockPath)
    } catch (e) {
      if (e.code !== 'EEXIST') {
        return msg.create(rel, e.code)
      }
      if (performance.now() - start > waitMs) {
        // The recovery sentence names what actually works: a crashed writer leaves the owner
        // marker INSIDE the directory, so a plain `rmdir` fails with ENOTEMPTY (review #8 —
        // introduced when the marker did, and the instruction was never updated with it).
        return msg.held(rel)
      }
      sleep(50)
      continue
    }
    const nonce = randomUUID()
    try { writeFileSync(join(lockPath, 'owner'), nonce) } catch (e) {
      // A lock this process cannot mark is a lock it must not hold: back out of our own mkdir and
      // refuse. If even the back-out fails, the leftover refuses everyone — the no-reclaim rule
      // already covers it.
      try { rmdirSync(lockPath) } catch { /* the leftover blocks until a human removes it */ }
      return msg.unmarked(rel, e.code)
    }
    owned.set(lockPath, nonce)
    return ''
  }
}

const LEDGER_MSG = {
  create: (rel, code) => `the ledger lock cannot be created at ${rel} (${code}) — fix the path (permissions, or a missing truths/ directory)`,
  held: rel => `the ledger lock at ${rel} is held and was not released within ${WAIT_MS / 1000}s — another ledger writer (attest, upgrade --apply) may be running; if none is, the lock is a leftover from a crash (or a stray file wearing its name) and will NEVER be reclaimed automatically: check for a running writer, then delete that path AND ITS CONTENTS yourself (it holds an owner marker, so an empty-directory removal will not do it) and re-run`,
  unmarked: (rel, code) => `the ledger lock at ${rel} was created but could not be marked (${code}) — fix the path (permissions), then re-run`
}

// THE MINE LOCK — the admission gate for the single-writer contract (§11 2026-08-06, review #9).
// WeaveDoc supports ONE mutating command per mine at a time. That was always true in practice and
// was never written down, so nothing enforced it and nothing warned about it: two writers on one
// mine could lose a committed seal, a tag rename or a verification row, silently, because each
// command reads its own snapshot and writes it back whole. The contract is declared in the docs
// now, and this is the machine's half of it — refused at the door, not queued (a second writer is
// UNSUPPORTED, not delayed, so waiting would tell a comforting lie about what is supported).
//
// It does NOT protect a mine from an agent editing files directly, or from a second checkout of a
// shared drive; the document contract still carries those. What it does is make the supported
// shape the only one this CLI will perform.
const MINE_MSG = {
  create: (rel, code) => `the mine lock cannot be created at ${rel} (${code}) — fix the path (permissions, or a missing .weavedoc/ directory)`,
  held: rel => `another mutating weavedoc command holds the mine lock at ${rel} — WeaveDoc supports ONE writing command per mine at a time (the single-writer contract; see FORMATS.md). Wait for it to finish and re-run. If nothing is running, the lock is a leftover from a crash and will NEVER be reclaimed automatically: delete that path AND ITS CONTENTS yourself (it holds an owner marker, so an empty-directory removal will not do it), then re-run`,
  unmarked: (rel, code) => `the mine lock at ${rel} was created but could not be marked (${code}) — fix the path (permissions), then re-run`
}

export const acquireLedgerLock = (lockPath, rel) => acquire(lockPath, rel, WAIT_MS, LEDGER_MSG)
// waitMs 0: one pass, then refuse. Concurrency is unsupported here, not slow.
export const acquireMineLock = (lockPath, rel) => acquire(lockPath, rel, 0, MINE_MSG)

export const releaseLedgerLock = lockPath => {
  const nonce = owned.get(lockPath)
  if (nonce === undefined) return // never acquired by this process — nothing here is ours to remove
  owned.delete(lockPath)
  try {
    // Match before removing: if the mark is gone or different, a human broke the seal mid-run and
    // someone else may hold the path now — leave THEIR lock standing (measured red: the old
    // release removed the new holder's lock).
    if (readFileSync(join(lockPath, 'owner'), 'utf8') !== nonce) return
    unlinkSync(join(lockPath, 'owner'))
    rmdirSync(lockPath)
  } catch { /* already gone, or unreadable — either way not ours to force */ }
}
// One release for both locks — the ownership rule is the lock's, not the caller's.
export const releaseMineLock = releaseLedgerLock
