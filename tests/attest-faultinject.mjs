#!/usr/bin/env node
// Fault injection for attest's append (v0.5.1, external review P1-3), for the NODE runner.
//
// The fault under test: ONE append call lands SOME bytes and then fails — ENOSPC, a size limit —
// which under last-row-wins silently turns the complete prefix rows into real evidence while the
// command reports failure. The injected op writes exactly half the buffer through a raw fd and
// then throws, which is the shape a full disk gives you.
//
//   node tests/attest-faultinject.mjs <verdict> <round> <standard> <id...>
//
// Exits with attest's own exit code.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openSync, writeSync, closeSync } from 'node:fs'
import { openMine } from '../.weavedoc/bin/lib/mine.mjs'
import { cmdAttest } from '../.weavedoc/bin/lib/cmd-attest.mjs'

const SCRIPT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.weavedoc', 'bin')
const argv = process.argv.slice(2)
if (argv.length < 4) { process.stderr.write('usage: attest-faultinject.mjs <verdict> <round> <standard> <id...>\n'); process.exit(2) }

const mine = openMine(SCRIPT_DIR)
const outln = s => process.stdout.write(Buffer.isBuffer(s) ? Buffer.concat([s, Buffer.from('\n')]) : s + '\n')

const ops = {
  append: (f, buf) => {
    const half = Math.max(1, Math.floor(buf.length / 2))
    const fd = openSync(f, 'a')
    try { writeSync(fd, buf, 0, half) } finally { closeSync(fd) }
    const e = new Error('injected: disk full after half the buffer'); e.code = 'ENOSPC'; throw e
  }
}
process.exit(cmdAttest(mine, outln, argv, ops))
