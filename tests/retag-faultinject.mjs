#!/usr/bin/env node
// Fault injection for retag's transaction boundary (§11 2026-08-05), for the NODE runner.
//
// Same shape as consecrate-faultinject: node:fs cannot be reached by a PATH shim, so the injectable
// operation seam retag exposes is the only channel, and this harness is the only caller that ever
// passes anything but the default. No runtime switch, no environment channel.
//
//   node tests/retag-faultinject.mjs <old> <new> <write-fail-suffix> [restore-fail-suffix]
//
// The write op fails ONLY for targets ending in <write-fail-suffix>; every earlier write lands, so
// the boundary is entered with real half-applied state to roll back. With [restore-fail-suffix]
// the ROLLBACK's restore also fails for that target — the branch that must preserve the backup and
// refuse to claim "as before". Exits with retag's own exit code.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openMine } from '../.weavedoc/bin/lib/mine.mjs'
import { cmdRetag, realOps } from '../.weavedoc/bin/lib/cmd-retag.mjs'
import { cmdReindex } from '../.weavedoc/bin/lib/cmd-reindex.mjs'
import { cmdValidate } from '../.weavedoc/bin/lib/cmd-validate.mjs'

const SCRIPT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.weavedoc', 'bin')
const [oldTag, newTag, wfail, rfail] = process.argv.slice(2)
if (!oldTag || !newTag || !wfail) {
  process.stderr.write('usage: retag-faultinject.mjs <old> <new> <write-fail-suffix> [restore-fail-suffix]\n')
  process.exit(2)
}

const mine = openMine(SCRIPT_DIR)
const outln = s => process.stdout.write(Buffer.isBuffer(s) ? Buffer.concat([s, Buffer.from('\n')]) : s + '\n')
const errln = s => process.stderr.write(s + '\n')

const ops = {
  write: (f, buf) => { if (String(f).endsWith(wfail)) throw new Error(`injected: write refused: ${f}`); realOps.write(f, buf) },
  restore: (from, to) => { if (rfail && String(to).endsWith(rfail)) throw new Error(`injected: restore refused: ${to}`); realOps.restore(from, to) }
}
process.exit(cmdRetag(mine, outln, errln, [oldTag, newTag],
  () => cmdReindex(mine, () => {}, () => {}, []),
  collect => cmdValidate(mine, collect, false),
  ops))
