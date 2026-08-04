#!/usr/bin/env node
// WeaveDoc runtime — Node.js port (REWRITE_PLAN.md). Stage 1: dispatch + version/lang/locale.
//
// CONTRACT: this file must be byte-identical to bin/weavedoc on stdout, and identical in exit
// code, for every command it claims. The 342 regression cases are the specification; run them
// against this file with:
//     WD_BIN="node .weavedoc/bin/weavedoc.mjs" bash tests/regress.sh
//
// Commands not yet ported REFUSE loudly (exit 3). A port in progress must never look like a pass:
// a case that reaches an unported command has to fail, and say which command it wanted.
//
// No npm dependencies, ever — node:fs, node:path, node:crypto are enough. Node 18+.
import { existsSync, statSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))

// ---- find project ROOT: walk up from CWD for a .weavedoc/ dir; fallback to the script's repo ----
// Mirrors find_root(): the FIRST ancestor holding .weavedoc wins, so a command run from deep
// inside a project still addresses that project and not the runtime's own repo.
function findRoot () {
  let d = process.cwd()
  for (;;) {
    try {
      if (statSync(join(d, '.weavedoc')).isDirectory()) return d
    } catch { /* not a directory here — keep walking */ }
    const up = dirname(d)
    if (up === d) break            // filesystem root: dirname stops changing ('/' or 'D:\')
    d = up
  }
  return join(SCRIPT_DIR, '..', '..')
}

const ROOT = findRoot()
const CONFIG = join(ROOT, '.weavedoc', 'config.yaml')
// Schema beside the mine, else beside the script — the same two-step the bash runtime uses, so a
// runtime invoked against a foreign directory still reads a schema rather than silently reading none.
let SCHEMA = join(ROOT, '.weavedoc', 'schema')
if (!existsSync(SCHEMA)) SCHEMA = join(SCRIPT_DIR, '..', 'schema')

function readOr (p, fallback = '') {
  try { return readFileSync(p, 'utf8') } catch { return fallback }
}

// ---- schema ----
// sch_load's rules, kept exactly: skip blanks and comments, require a colon, the key is everything
// before the FIRST colon and must be [a-zA-Z0-9._], the value is the remainder with leading
// whitespace stripped (trailing is NOT stripped — the bash version does not either), first
// spelling of a key wins.
const SCH = new Map()
for (const raw of readOr(SCHEMA).split('\n')) {
  const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
  if (line === '' || line.startsWith('#')) continue
  const i = line.indexOf(':')
  if (i < 0) continue
  const k = line.slice(0, i)
  if (k === '' || /[^a-zA-Z0-9._]/.test(k)) continue
  if (!SCH.has(k)) SCH.set(k, line.slice(i + 1).replace(/^[ \t]+/, ''))
}
// Same degrade rule as the bash runtime: an older project schema must fall back to the shipped
// version, never to nothing.
const schemaVer = () => SCH.get('schema.version') || '2'

// ---- output helpers ----
const out = s => process.stdout.write(s)
const outln = s => process.stdout.write(s + '\n')
const errln = s => process.stderr.write(s + '\n')
// json_esc: backslash, quote, newline, tab escaped; carriage return DROPPED (not escaped).
const jsonEsc = s => s
  .replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  .replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '')

// ---- commands ----
function cmdVersion (json) {
  // The date label alone cannot identify a bundle — two installs can share it while their runtime
  // differs. The fingerprint is content, so comparing installs is real. It covers THIS runtime
  // file plus the schema, which is why a bash install and a Node install of the same bundle date
  // report different fingerprints: they are different runtimes, and the label cannot say so.
  let vf = join(ROOT, '.weavedoc', 'VERSION')
  if (!existsSync(vf)) vf = join(SCRIPT_DIR, '..', 'VERSION')
  if (!existsSync(vf)) { outln('(no VERSION file)'); return 1 }
  const body = readFileSync(vf, 'utf8')
  let fp = ''
  try {
    fp = createHash('sha1')
      .update(readFileSync(join(SCRIPT_DIR, 'weavedoc.mjs')))
      .update(readFileSync(SCHEMA))
      .digest('hex')
  } catch { /* a runtime that cannot read itself still reports its label */ }
  if (json) {
    // `bundle` goes through command substitution in the bash version, which strips trailing
    // newlines — so the JSON value is the trimmed label while the human view keeps the file's own
    // newline below. Two different renderings of one fact, and both are contract.
    outln(`{"output_schema_version":1,"command":"version","bundle":"${jsonEsc(body.replace(/\n+$/, ''))}",` +
          `"fingerprint":"${jsonEsc(fp.slice(0, 12))}","schema_version":${schemaVer()}}`)
    return 0
  }
  out(body)
  if (fp) outln(`fingerprint: ${fp.slice(0, 12)}  (bin+schema — compare this, not just the date)`)
  outln(`schema: ${schemaVer()} (this runtime reads ≤${schemaVer()}; a v1 mine migrates via 'upgrade')`)
  return 0
}

function cmdLang () {
  // First `language:` line anywhere in config, trailing comment and surrounding space removed.
  for (const raw of readOr(CONFIG).split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    const m = /^[ \t]*language:(.*)$/.exec(line)
    if (!m) continue
    const v = m[1].replace(/^[ \t]*/, '').replace(/[ \t]*#.*$/, '').replace(/[ \t]*$/, '')
    if (v !== '') { outln(v); return 0 }
  }
  outln('(no config.language yet — run weavedoc init)')
  return 0
}

async function cmdLocale () {
  // TWO documented outcomes and no third: a short code with exit 0, or nothing with exit 1 (init
  // then asks). Never a usage error, never a crash — that is what the smoke case pins.
  let l = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || ''
  l = l.split('.')[0].split('@')[0]
  if (l === 'C' || l === 'POSIX') l = ''
  if (l === '') {
    // Windows keeps the display language in the registry rather than the environment. This is an
    // OS query, not text processing, so shelling out here is the same thing the bash runtime does.
    try {
      const { execFileSync } = await import('node:child_process')
      for (const reg of ['C:\\Windows\\System32\\reg.exe']) {
        if (!existsSync(reg)) continue
        const o = execFileSync(reg, ['query', 'HKCU\\Control Panel\\International', '/v', 'LocaleName'],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
        const m = /LocaleName\s+\S+\s+(\S+)/.exec(o.replace(/\r/g, ''))
        if (m) { l = m[1]; break }
      }
    } catch { /* no registry, no locale — the documented empty outcome */ }
  }
  if (l === '') return 1
  outln(l.split(/[-_]/)[0].toLowerCase())
  return 0
}

// ---- dispatch ----
// Every command validates its FULL argument list (WD-CLI-001): an extra argument or an unknown flag
// is a typo'd intention, and a tool that ignores it does something other than what was asked.
const USAGE = 'weavedoc — validate | pull <term> | impact <material-id> | status | scope | ' +
  'attest <verdict> <round> <standard> <id...> | seal-review <doc-id> [draft|final] | ' +
  'consecrate <doc-id> | gaps | census | reindex [--check] | retag <old> <new> [--dry] | ' +
  'version | lang | locale'

const usage2 = u => { errln(`usage: ${u}`); process.exit(2) }

// Ported in a later stage. Refusing with a distinct code keeps a partial port honest: no case can
// mistake "not written yet" for "ran and agreed".
const NOT_PORTED = new Set(['validate', 'pull', 'impact', 'status', 'scope', 'attest',
  'seal-review', 'consecrate', 'gaps', 'census', 'reindex', 'retag', 'upgrade'])

const argv = process.argv.slice(2)
const cmd = argv[0] ?? ''
const rest = argv.slice(1)

let rc
switch (cmd) {
  case 'lang':
    if (rest.length !== 0) usage2('weavedoc lang')
    rc = cmdLang(); break
  case 'locale':
    if (rest.length !== 0) usage2('weavedoc locale')
    // Top-level await (ESM): keeps node:child_process off the startup path — it is loaded only on
    // the Windows-registry fallback, which most runs never reach.
    rc = await cmdLocale(); break
  case 'version': {
    let json = false
    let a = rest
    if (a[0] === '--json') { json = true; a = a.slice(1) }
    if (a.length !== 0) usage2('weavedoc version [--json]')
    rc = cmdVersion(json); break
  }
  default:
    if (NOT_PORTED.has(cmd)) {
      errln(`weavedoc: '${cmd}' is not ported to the Node runtime yet — run it with the bash bundle`)
      process.exit(3)
    }
    outln(USAGE)
    process.exit(2)
}
process.exit(rc)
