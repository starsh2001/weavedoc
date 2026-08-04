#!/usr/bin/env node
// TEMPORARY grading entry point for the validate port — delete when `validate` leaves NOT_PORTED.
//
// WHY IT EXISTS. The shipped CLI must keep refusing `validate` with exit 3 while the port is
// partial, or a half-ported command reads as a working one — that refusal is the thing keeping the
// port honest. But a port with no scale until its last unit lands is a port graded once, at the end,
// which is exactly the shape that makes a failure impossible to localise. This gives the scale
// something to run without letting the product claim anything.
//
//   WD_NODE_BIN=tests/validate-node.mjs bash tests/parity-corpus.sh <corpus> validate
//
// It resolves the mine exactly as weavedoc.mjs does (walk up from CWD for a .weavedoc/), so a mine
// passed by `cd`-ing into it is the mine that gets validated.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openMine } from '../.weavedoc/bin/lib/mine.mjs'
import { cmdValidate } from '../.weavedoc/bin/lib/cmd-validate.mjs'

const SCRIPT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.weavedoc', 'bin')
const argv = process.argv.slice(2)
if (argv[0] !== 'validate') { process.stderr.write("usage: validate-node.mjs validate [--json]\n"); process.exit(2) }
const json = argv[1] === '--json'
const out = s => process.stdout.write(s + '\n')
process.exit(cmdValidate(openMine(SCRIPT_DIR), out, json))
