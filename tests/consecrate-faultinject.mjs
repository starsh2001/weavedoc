#!/usr/bin/env node
// Fault injection for consecrate's validate-failure branch, for the NODE runner.
//
// The bash suite proves this branch with a PATH shim that makes `rm` fail for the final slot alone.
// A PATH shim cannot reach node:fs, and REWRITE_PLAN §4 lists this as one of the three cases that
// cannot be ported as-is and must NOT be dropped silently — so the removal is an injectable
// operation with a real default, and this harness is the only caller that passes anything else.
// The CLI always passes the default; there is no runtime switch and no environment channel.
//
//   node tests/consecrate-faultinject.mjs <doc-id> <path-suffix-whose-removal-fails>
//
// Exits with consecrate's own exit code, so the case reads it exactly as it reads the CLI's.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openMine } from '../.weavedoc/bin/lib/mine.mjs'
import { cmdConsecrate, realOps } from '../.weavedoc/bin/lib/cmd-consecrate.mjs'
import { cmdValidate } from '../.weavedoc/bin/lib/cmd-validate.mjs'

const SCRIPT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.weavedoc', 'bin')
const [doc, failSuffix] = process.argv.slice(2)
if (!doc || !failSuffix) { process.stderr.write('usage: consecrate-faultinject.mjs <doc-id> <suffix>\n'); process.exit(2) }

const mine = openMine(SCRIPT_DIR)
const outln = s => process.stdout.write(Buffer.isBuffer(s) ? Buffer.concat([s, Buffer.from('\n')]) : s + '\n')
const errln = s => process.stderr.write(s + '\n')

// Fails ONLY for the named path, exactly as the bash shim does — every other removal the
// transaction needs (the candidate, the marker) still works, so the branch under test is reached
// with the rest of the machinery intact.
const ops = {
  ...realOps,
  rmrf: p => { if (String(p).endsWith(failSuffix)) throw new Error('injected: removal refused'); realOps.rmrf(p) },
  validate: d => cmdValidate(mine, outln, false, d)
}
process.exit(cmdConsecrate(mine, outln, errln, doc, ops))
