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
// rmdir is the price of never destroying a live neighbour's committed write. With no reclaim
// there is nothing to steal, so ownership tokens are unnecessary (the only process that can
// release a lock is the one whose mkdir created it), and the first cut's recorded stat→rmdir
// TOCTOU boundary is gone with the branch that carried it.
//
// The lock is a DIRECTORY beside the ledger: mkdir is atomic on every platform this runs on, and
// a directory cannot be half-created. EVERY writer that touches the ledger file — attest, and
// upgrade --apply's migration transaction — acquires THIS lock through THIS module; a second
// spelling of the protocol would be the two-writers drift class in its locking clothes.
import { mkdirSync, rmdirSync } from 'node:fs'

const WAIT_MS = 5_000
const sleep = ms => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) } catch { const t = Date.now(); while (Date.now() - t < ms) { /* spin */ } } }

// -> '' on success, or the sentence explaining the refusal (the caller prefixes its own name).
// EVERY loop iteration passes through the bound check and the sleep — no branch skips them; the
// branch that did (the reclaim's `continue`) is how the first cut spun hot and unbounded on an
// undeletable lock object. A FILE wearing the lock's name is just a held lock here: mkdir says
// EEXIST for it on every platform (measured), so it rides the bounded wait into the refusal that
// tells a human to look.
export function acquireLedgerLock (lockPath, rel) {
  const start = Date.now()
  for (;;) {
    try { mkdirSync(lockPath); return '' } catch (e) {
      if (e.code !== 'EEXIST') {
        return `the ledger lock cannot be created at ${rel} (${e.code}) — fix the path (permissions, or a missing truths/ directory)`
      }
      if (Date.now() - start > WAIT_MS) {
        return `the ledger lock at ${rel} is held and was not released within ${WAIT_MS / 1000}s — another ledger writer (attest, upgrade --apply) may be running; if none is, the lock is a leftover from a crash (or a stray file wearing its name) and will NEVER be reclaimed automatically: check for a running writer, then remove the lock yourself and re-run`
      }
      sleep(50)
    }
  }
}

export const releaseLedgerLock = lockPath => { try { rmdirSync(lockPath) } catch { /* acquire failed and nothing is held, or a human removed it mid-run */ } }
