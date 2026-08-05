#!/usr/bin/env node
// Fault injection for upgrade --apply's transaction boundary (§11 2026-08-05), for the NODE runner.
//
// Same shape as consecrate-faultinject and retag-faultinject: the operation seam is the only
// injection channel, and this harness is the only caller that ever passes anything but the default.
//
//   node tests/upgrade-faultinject.mjs <write-fail-suffix> [restore-fail-suffix]
//
// The write op fails ONLY for targets ending in <write-fail-suffix>; every earlier phase lands, so
// the boundary is entered with real half-migrated state to roll back. With [restore-fail-suffix]
// the ROLLBACK's restore also fails for that path — the branch that must preserve the backup and
// refuse to claim "byte-identical". Exits with upgrade's own exit code.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openMine } from '../.weavedoc/bin/lib/mine.mjs'
import { cmdUpgrade, realOps } from '../.weavedoc/bin/lib/cmd-upgrade.mjs'
import { cmdReindex } from '../.weavedoc/bin/lib/cmd-reindex.mjs'
import { cmdValidate } from '../.weavedoc/bin/lib/cmd-validate.mjs'

const SCRIPT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.weavedoc', 'bin')
const [wfail, rfail] = process.argv.slice(2)
if (!wfail) {
  process.stderr.write('usage: upgrade-faultinject.mjs <write-fail-suffix> [restore-fail-suffix]\n')
  process.exit(2)
}

const mine = openMine(SCRIPT_DIR)
const outln = s => process.stdout.write(Buffer.isBuffer(s) ? Buffer.concat([s, Buffer.from('\n')]) : s + '\n')

const ops = {
  write: (f, buf) => { if (String(f).endsWith(wfail)) throw new Error(`injected: write refused: ${f}`); realOps.write(f, buf) },
  restore: (from, to) => { if (rfail && String(to).endsWith(rfail)) throw new Error(`injected: restore refused: ${to}`); realOps.restore(from, to) }
}
process.exit(cmdUpgrade(mine, outln, ['--apply'],
  () => cmdReindex(mine, () => {}, () => {}, []),
  () => cmdValidate(mine, outln, false),
  ops))
