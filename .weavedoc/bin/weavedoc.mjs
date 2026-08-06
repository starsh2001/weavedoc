#!/usr/bin/env node
// WeaveDoc runtime — the deterministic checker under the AI fidelity gate.
//
//   validate          format + truth coherence (exit non-zero on any problem)
//   pull <term>       protocol-correct mine lookup for consumers outside the pipeline (see READ.md)
//   impact <mID>      which truths were extracted from a material + which documents cite it (blast radius)
//   status            each document's status + the next step
//   scope             what a verify round still owes — unverified materials + truths, computed
//   attest <verdict> <round> <standard> <id...>   record a verification: digest-bound sidecar row
//   seal-review <doc-id> [draft|final]   pin the clean review to the reviewed bytes + context
//   consecrate <doc-id>   stage candidate → verify seals → ONE full validation → atomic promote
//   upgrade [--check|--dry-run|--apply]   v1 mine → schema 2 (default --check, read-only)
//   gaps              mine census + declared-marker scan (non-blocking floor for the weavedoc-gaps skill)
//   census            mine census only (truth files vs index, numbering holes, live/status tallies)
//   reindex [--check] regenerate truths/index.md + truths/tree.md from truth frontmatter (--check: diff only)
//   retag <old> <new> rename/merge a tag across truths·required_tags·scope_tags (--dry: report only)
//   version           the installed runtime bundle version (.weavedoc/VERSION)
//   lang              the project's reply/artifact language (config.language)
//   locale            detect the OS language (for init); prints nothing if undetectable
//
// THE SPECIFICATION IS tests/regress.sh — every case is a CLI black box (build a mine, run a
// command, assert stdout and the exit code), which is what let this runtime be graded against the
// bash implementation it replaced, case for case, without touching a case. That implementation was
// deleted in bundle 2026-08-05.3; the last comparison between the two is pinned in
// tests/baseline/parity-final-2026-08-05.md.
//
// No npm dependencies, ever — node:fs, node:path, node:crypto are enough. Node 18+.
import { existsSync, statSync, readFileSync, readdirSync } from 'node:fs'
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
// A Buffer is written as BYTES. Most output is ordinary text, but some lines are echoed straight out
// of the mine — `reindex --check` prints a diff of files that can hold CP949 — and a JS string is
// encoded as UTF-8 on the way to stdout, which would re-encode those bytes into something the bash
// runtime never printed. The caller says which it means by what it passes.
const outln = s => process.stdout.write(Buffer.isBuffer(s) ? Buffer.concat([s, NL]) : s + '\n')
const errln = s => process.stderr.write(s + '\n')
const NL = Buffer.from('\n')
// json_esc: backslash, quote, newline, tab escaped; carriage return DROPPED (not escaped).
const jsonEsc = s => s
  .replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  .replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '')

// ---- commands ----
function cmdVersion (json) {
  // The date label alone cannot identify a bundle — two installs can share it while their runtime
  // differs. The fingerprint is content, so comparing installs is real. It covers the WHOLE
  // runtime — this file, every file under lib/ (name + bytes, so a rename or a new module counts),
  // and the schema. Hashing the entrypoint alone was enough for the bash runtime, which WAS one
  // file; here the behavior lives in lib/, and the v0.4.0 external review found real commit pairs
  // that differed only in lib/ while this fingerprint stayed the same — the exact comparison the
  // field exists to make honest. A bash install and a Node install of the same bundle date still
  // report different fingerprints: different runtimes, and the label cannot say so.
  let vf = join(ROOT, '.weavedoc', 'VERSION')
  if (!existsSync(vf)) vf = join(SCRIPT_DIR, '..', 'VERSION')
  if (!existsSync(vf)) { outln('(no VERSION file)'); return 1 }
  const body = readFileSync(vf, 'utf8')
  let fp = ''
  try {
    const h = createHash('sha1')
    h.update(readFileSync(join(SCRIPT_DIR, 'weavedoc.mjs')))
    // RECURSIVE, relative-path-keyed (v0.5.1): a flat listing skipped any future lib/subdir/ — the
    // manifest globs the whole directory, so the fingerprint has to see exactly what ships.
    const walk = (dir, pre) => {
      for (const n of readdirSync(dir).sort()) {
        const p = join(dir, n)
        const r = pre === '' ? n : `${pre}/${n}`
        if (statSync(p).isDirectory()) { walk(p, r); continue }
        h.update(r)
        h.update(readFileSync(p))
      }
    }
    walk(join(SCRIPT_DIR, 'lib'), '')
    h.update(readFileSync(SCHEMA))
    fp = h.digest('hex')
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
  'consecrate <doc-id> | upgrade [--check|--dry-run|--apply] | gaps | census | ' +
  'reindex [--check] | retag <old> <new> [--dry] | version | lang | locale'

const usage2 = u => { errln(`usage: ${u}`); process.exit(2) }

// Ported in a later stage. Refusing with a distinct code keeps a partial port honest: no case can
// mistake "not written yet" for "ran and agreed".
// EMPTY: every command is ported. The refusal stays in place because it is what kept the port
// honest — a case reaching an unported command had to fail and say which one it wanted.
const NOT_PORTED = new Set([])

const argv = process.argv.slice(2)
const cmd = argv[0] ?? ''
const rest = argv.slice(1)

// THE SINGLE-WRITER ADMISSION GATE (§11 2026-08-06, review #9). WeaveDoc supports ONE mutating
// command per mine at a time. That was always the shape of its use — skills call it in sequence
// inside one session — but it was never declared and nothing enforced it, so two writers on one
// mine quietly lost committed work: a fresh seal overwritten by a migration's older buffer, a
// successful retag erased by a neighbour's rollback, a verification row landing already stale.
// Every command reads a snapshot and writes it back whole, so this is a data race the per-file
// locks inside individual commands cannot close.
//
// The gate is taken HERE — before the command exists, before openMine reads anything — which is
// why no command needed its decisions relocated for it. Internal reindex/validate calls go
// straight to their functions and never re-enter this dispatcher, so there is nothing reentrant
// to solve. Read-only commands, and the read-only MODES of writing commands, are never gated:
// a report has no reason to queue behind a migration, and `--check` promises to write nothing.
//
// It is the machine's half of the contract only. An agent editing mine files directly, or a
// second checkout of a shared drive, is outside any lock this CLI can take — FORMATS carries that.
const MUTATES = {
  attest: () => true,
  consecrate: () => true,
  'seal-review': () => true,
  upgrade: a => a.includes('--apply'),
  retag: a => !a.includes('--dry'),
  reindex: a => !a.includes('--check')
}
let mineLockPath = null
let releaseMine = () => {}
if (Object.prototype.hasOwnProperty.call(MUTATES, cmd) && MUTATES[cmd](rest)) {
  const { openMine } = await import('./lib/mine.mjs')
  const { acquireMineLock, releaseMineLock } = await import('./lib/lock.mjs')
  const root = openMine(SCRIPT_DIR).root
  mineLockPath = `${root}/.weavedoc/mine.lock`
  const why = acquireMineLock(mineLockPath, '.weavedoc/mine.lock')
  if (why) { errln(`weavedoc ${cmd}: ${why}. Nothing written`); process.exit(1) }
  releaseMine = () => releaseMineLock(mineLockPath)
  // Released on EVERY exit, including the ones that call process.exit() deep inside a command.
  process.on('exit', releaseMine)
}

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
  case 'upgrade': {
    const { openMine } = await import('./lib/mine.mjs')
    const { cmdUpgrade } = await import('./lib/cmd-upgrade.mjs')
    const { cmdReindex } = await import('./lib/cmd-reindex.mjs')
    const { cmdValidate } = await import('./lib/cmd-validate.mjs')
    const mine = openMine(SCRIPT_DIR)
    rc = cmdUpgrade(mine, outln, rest,
      () => cmdReindex(mine, () => {}, () => {}, []),
      () => cmdValidate(mine, outln, false))
    break
  }
  case 'consecrate': {
    if (rest.length !== 1) usage2('weavedoc consecrate <doc-id>')
    const { openMine } = await import('./lib/mine.mjs')
    const { cmdConsecrate, realOps } = await import('./lib/cmd-consecrate.mjs')
    const { cmdValidate } = await import('./lib/cmd-validate.mjs')
    const mine = openMine(SCRIPT_DIR)
    // validate runs IN PROCESS and prints straight through, as the bash version does. The doc id
    // rides as an ARGUMENT so this document's in-flight artifacts are exempt — never a variable,
    // which the environment could inject.
    rc = cmdConsecrate(mine, outln, errln, rest[0],
      { ...realOps, validate: doc => cmdValidate(mine, outln, false, doc) })
    break
  }
  case 'retag': {
    if (rest.length < 2 || rest.length > 3) usage2('weavedoc retag <old> <new> [--dry]')
    const { openMine } = await import('./lib/mine.mjs')
    const { cmdRetag } = await import('./lib/cmd-retag.mjs')
    const { cmdReindex } = await import('./lib/cmd-reindex.mjs')
    const { cmdValidate } = await import('./lib/cmd-validate.mjs')
    const mine = openMine(SCRIPT_DIR)
    // reindex and validate run IN PROCESS, exactly as the bash version calls its own functions —
    // that is what lets the rename answer to a full validation and roll back as one transaction.
    // Their output is swallowed (reindex) or captured (validate), never printed straight through.
    rc = cmdRetag(mine, outln, errln, rest,
      () => cmdReindex(mine, () => {}, () => {}, []),
      collect => cmdValidate(mine, collect, false))
    break
  }
  case 'validate': {
    let vjson = false
    let va = rest
    if (va[0] === '--json') { vjson = true; va = va.slice(1) }
    if (va.length !== 0) usage2('weavedoc validate [--json]')
    const { openMine } = await import('./lib/mine.mjs')
    const { cmdValidate } = await import('./lib/cmd-validate.mjs')
    rc = cmdValidate(openMine(SCRIPT_DIR), outln, vjson); break
  }
  case 'scope': {
    let sjson = false
    let sa = rest
    if (sa[0] === '--json') { sjson = true; sa = sa.slice(1) }
    if (sa.length !== 0) usage2('weavedoc scope [--json]')
    const { openMine } = await import('./lib/mine.mjs')
    const { cmdScope } = await import('./lib/cmd-scope.mjs')
    rc = cmdScope(openMine(SCRIPT_DIR), outln, sjson); break
  }
  case 'attest': {
    // No arity check HERE on purpose: the bash dispatch forwards attest's whole argv and lets the
    // command judge it, so the usage line goes to stdout with exit 2 rather than to stderr.
    const { openMine } = await import('./lib/mine.mjs')
    const { cmdAttest } = await import('./lib/cmd-attest.mjs')
    rc = cmdAttest(openMine(SCRIPT_DIR), outln, rest); break
  }
  case 'reindex': {
    // Like attest, the bash dispatch forwards reindex's whole argv — but reindex's own usage line
    // goes to STDERR, not stdout. Two write commands, two spellings; both are contract.
    const { openMine } = await import('./lib/mine.mjs')
    const { cmdReindex } = await import('./lib/cmd-reindex.mjs')
    rc = cmdReindex(openMine(SCRIPT_DIR), outln, errln, rest); break
  }
  case 'seal-review': {
    // The dispatch owns the arity here (bash does too), so a third argument is a stderr usage and
    // exit 2, while the command's own refusals go to stdout.
    if (rest.length < 1 || rest.length > 2) usage2('weavedoc seal-review <doc-id> [draft|final]')
    const { openMine } = await import('./lib/mine.mjs')
    const { cmdSealReview } = await import('./lib/cmd-seal-review.mjs')
    rc = cmdSealReview(openMine(SCRIPT_DIR), outln, rest[0], rest[1]); break
  }
  case 'pull': {
    if (rest.length !== 1) usage2('weavedoc pull <term>')
    const { openMine } = await import('./lib/mine.mjs')
    const { cmdPull } = await import('./lib/cmd-pull.mjs')
    rc = cmdPull(openMine(SCRIPT_DIR), outln, rest[0]); break
  }
  case 'status': {
    if (rest.length !== 0) usage2('weavedoc status')
    const { openMine } = await import('./lib/mine.mjs')
    const { cmdStatus } = await import('./lib/cmd-status.mjs')
    rc = cmdStatus(openMine(SCRIPT_DIR), outln); break
  }
  case 'gaps': {
    if (rest.length !== 0) usage2('weavedoc gaps')
    const { openMine } = await import('./lib/mine.mjs')
    const { cmdGaps } = await import('./lib/cmd-gaps.mjs')
    rc = cmdGaps(openMine(SCRIPT_DIR), outln, errln); break
  }
  case 'census': {
    if (rest.length !== 0) usage2('weavedoc census')
    const { openMine } = await import('./lib/mine.mjs')
    const { cmdCensus } = await import('./lib/cmd-census.mjs')
    rc = cmdCensus(openMine(SCRIPT_DIR), outln); break
  }
  case 'impact': {
    if (rest.length !== 1) usage2('weavedoc impact <material-id>')
    const { openMine } = await import('./lib/mine.mjs')
    const { cmdImpact } = await import('./lib/cmd-impact.mjs')
    rc = cmdImpact(openMine(SCRIPT_DIR), outln, rest[0]); break
  }
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
