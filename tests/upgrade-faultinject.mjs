#!/usr/bin/env node
// Fault injection for upgrade --apply's transaction boundary (§11 2026-08-05), for the NODE runner.
//
// Same shape as consecrate-faultinject and retag-faultinject: the operation seam is the only
// injection channel, and this harness is the only caller that ever passes anything but the default.
//
//   node tests/upgrade-faultinject.mjs <write-fail-suffix|-> [restore-fail-suffix|-] [copy-fail-suffix|-] [rm-fail-suffix|-]
//
// `-` skips an injection. The write op fails ONLY for targets ending in <write-fail-suffix>; every
// earlier phase lands, so the boundary is entered with real half-migrated state to roll back. With
// [restore-fail-suffix] the ROLLBACK's restore also fails for that path — the branch that must
// preserve the backup and refuse to claim "byte-identical". [copy-fail-suffix] makes the rename
// phase's copy die PARTWAY (half the file lands, then the throw — the shape a full disk gives);
// [rm-fail-suffix] makes the old path refuse to go. Those two are what distinguish "intent
// registered before the first byte" from "after" (v0.5.1 P1-4). Exits with upgrade's own code.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { openMine } from '../.weavedoc/bin/lib/mine.mjs'
import { cmdUpgrade, realOps } from '../.weavedoc/bin/lib/cmd-upgrade.mjs'
import { cmdReindex } from '../.weavedoc/bin/lib/cmd-reindex.mjs'
import { cmdValidate } from '../.weavedoc/bin/lib/cmd-validate.mjs'

const SCRIPT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.weavedoc', 'bin')
const rawArgs = process.argv.slice(2)
// v0.5.2 flags: --collide-bak pre-creates the OLD date+PID backup path with stale contents (the
// exact shape mkdtempSync exists to make impossible — pre-fix, upgrade reused it and restored the
// stale bytes); --reindex-fail makes the phase-5 regeneration return nonzero.
const collideBak = rawArgs.includes('--collide-bak')
const reindexFail = rawArgs.includes('--reindex-fail')
const pos = rawArgs.filter(a => !a.startsWith('--'))
const [wfailA = '-', rfailA = '-', cfailA = '-', mfailA = '-'] = pos
if (rawArgs.length < 1) {
  process.stderr.write('usage: upgrade-faultinject.mjs <write-fail-suffix|-> [restore-fail-suffix|-] [copy-fail-suffix|-] [rm-fail-suffix|-] [--collide-bak] [--reindex-fail]\n')
  process.exit(2)
}
const wfail = wfailA === '-' ? '' : wfailA
const rfail = rfailA === '-' ? '' : rfailA
const cfail = cfailA === '-' ? '' : cfailA
const mfail = mfailA === '-' ? '' : mfailA

const mine = openMine(SCRIPT_DIR)
const outln = s => process.stdout.write(Buffer.isBuffer(s) ? Buffer.concat([s, Buffer.from('\n')]) : s + '\n')

if (collideBak) {
  // The colliding path as the OLD naming scheme computed it, filled with a stale snapshot and a
  // .touched manifest naming it — the exact bait bkup()'s dedup used to swallow.
  const today = new Date().toISOString().slice(0, 10)
  const stale = `${mine.root}/.upgrade-backup-${today}.${process.pid}`
  mkdirSync(stale, { recursive: true })
  writeFileSync(`${stale}/project.md`, 'STALE SNAPSHOT FROM A PREVIOUS LIFE\n')
  writeFileSync(`${stale}/.touched`, 'project.md\n')
}

const ops = {
  write: (f, buf) => { if (wfail && String(f).endsWith(wfail)) throw new Error(`injected: write refused: ${f}`); realOps.write(f, buf) },
  restore: (from, to) => { if (rfail && String(to).endsWith(rfail)) throw new Error(`injected: restore refused: ${to}`); realOps.restore(from, to) },
  copy: (from, to) => {
    if (cfail && String(to).endsWith(cfail)) {
      const b = readFileSync(from)
      writeFileSync(to, b.subarray(0, Math.max(1, Math.floor(b.length / 2))))
      const e = new Error(`injected: copy died partway: ${to}`); e.code = 'ENOSPC'; throw e
    }
    realOps.copy(from, to)
  },
  rm: p => { if (mfail && String(p).endsWith(mfail)) throw new Error(`injected: removal refused: ${p}`); realOps.rm(p) }
}
process.exit(cmdUpgrade(mine, outln, ['--apply'],
  reindexFail ? () => 1 : () => cmdReindex(mine, () => {}, () => {}, []),
  () => cmdValidate(mine, outln, false),
  ops))
