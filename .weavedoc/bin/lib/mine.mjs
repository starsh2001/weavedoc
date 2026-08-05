// WeaveDoc — the mine context every command opens before it can say anything.
//
// find_root walks UP from the working directory for a .weavedoc/, so a command run from deep inside
// a project still addresses that project and not the runtime's own repo. Everything else (where
// materials live, which schema applies) hangs off that one answer.
import { existsSync, statSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join as njoin, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { loadSchema, loadConfig, cfgPath, fmLoad } from './read.mjs'
import { canonId, listField } from './core.mjs'
import { matDigest, truthDigest } from './verify.mjs'

// FORWARD SLASHES, ALWAYS. node:path joins with a backslash on Windows while the bash runtime joins
// with '/', and these paths reach stdout (impact prints document paths; two diagnostics print truth
// paths). A separator that depends on the platform is a verdict that depends on the platform — the
// exact class this rewrite exists to remove. Windows accepts '/' everywhere, so this costs nothing
// and lets one spelling serve all three OSes.
export const fwd = p => p.replace(/\\/g, '/')
export const join = (...p) => fwd(njoin(...p))

export function findRoot (scriptDir, cwd = process.cwd()) {
  let d = fwd(cwd)
  for (;;) {
    try { if (statSync(join(d, '.weavedoc')).isDirectory()) return fwd(d) } catch { /* keep walking */ }
    const up = fwd(dirname(d))
    if (up === d) break
    d = up
  }
  return join(scriptDir, '..', '..')
}

export function openMine (scriptDir, cwd = process.cwd()) {
  const root = findRoot(scriptDir, cwd)
  const config = join(root, '.weavedoc', 'config.yaml')
  let schemaPath = join(root, '.weavedoc', 'schema')
  // The fallback keeps its `..` UNRESOLVED, because SCHEMA-UNREADABLE prints this path and the bash
  // spelling is a plain `$SCRIPT_DIR/../schema`. node:path's join() normalises the `..` away, so the
  // diagnostic read `.weavedoc/schema` where bash reads `.weavedoc/bin/../schema` — the same file,
  // two spellings, and the message is contract. Concatenated rather than joined for that reason.
  if (!existsSync(schemaPath)) schemaPath = `${fwd(scriptDir)}/../schema`
  const sch = loadSchema(schemaPath)
  const cfg = loadConfig(config)
  // Two spellings of one folder are one folder: string-comparing `paths` once read `./materials`
  // and an absolute path to the default folder as redirects, and validate falsely blocked the run.
  const p = k => cfgPath(config, k, k, root).replace(/\/$/, '')
  return {
    root,
    config,
    schemaPath,
    sch,
    cfg,
    inbox: p('inbox'),
    materials: p('materials'),
    truths: p('truths'),
    documents: p('documents'),
    project: `${root}/project.md`,
    catalog: `${root}/catalog.md`,
    schemaVer: () => sch.get('schema.version') || '2',
    ledgerFile: () => sch.get('verify.ledger.file') || 'verify-ledger.tsv'
  }
}

const lsOr = d => { try { return readdirSync(d) } catch { return [] } }
// `[ -f ]` and `[ -d ]`, spelled once. "Exists" is not either of them, and the difference decides
// which refusal a caller prints — and whether a readFileSync throws instead of returning.
const isDirAt = p => { try { return statSync(p).isDirectory() } catch { return false } }
const isFileAt = p => { try { return statSync(p).isFile() } catch { return false } }

// One folder name per line, in the order the filesystem gives — the bash side globs, which sorts,
// so these are sorted to match.
export function materialIds (m) {
  return lsOr(m.materials).filter(n => { try { return statSync(join(m.materials, n)).isDirectory() } catch { return false } }).sort()
}

export function docIds (m) {
  return lsOr(m.documents).filter(n => { try { return statSync(join(m.documents, n)).isDirectory() } catch { return false } }).sort()
}

// Truth files are t<digits>.md ONLY: index.md, tree.md, verify.md and changelog.md live in the same
// folder and are never truths.
export function truthFiles (m) {
  return lsOr(m.truths).filter(n => /^t[0-9]+\.md$/.test(n)).sort().map(n => join(m.truths, n))
}

// One resolver for every reference field, so `t5` cannot resolve in one place and dangle in another.
// The leniency is safe only because filenames are canonical: with one spelling per number on disk,
// `t5` names exactly one file.
// `-f`, not "exists": a DIRECTORY named t002.md is not a truth file, and treating it as one moved
// the refusal from "no truth file for t002" to "cannot digest t002" — same rejection, wrong reason.
export function tfileFor (m, id) {
  const direct = join(m.truths, `${id}.md`)
  if (isFileAt(direct)) return direct
  if (!id.startsWith('t')) return null
  const n = canonId(id)
  if (!n) return null
  const p = join(m.truths, `${n}.md`)
  return isFileAt(p) ? p : null
}

export function mdirFor (m, id) {
  const direct = join(m.materials, id)
  try { if (statSync(direct).isDirectory()) return direct } catch { /* fall through */ }
  if (!id.startsWith('m')) return null
  const n = canonId(id)
  if (!n) return null
  const p = join(m.materials, n)
  try { return statSync(p).isDirectory() ? p : null } catch { return null }
}

// A unit's digest BY KIND, so "what was verified" has one spelling per kind and callers never pick.
// null when the id names no file — attest turns that into a refusal rather than a row.
export function unitDigest (m, cid) {
  if (cid.startsWith('m')) {
    const f = join(m.materials, cid, 'converted.md')
    return isFileAt(f) ? matDigest(f) : null
  }
  if (cid.startsWith('t')) {
    const f = tfileFor(m, cid)
    return f === null ? null : truthDigest(f)
  }
  return null
}

export function fm (file, key) {
  return fmLoad(file).get(key) ?? ''
}

export function mtitle (m, id) {
  const f = join(m.materials, id, 'converted.md')
  return existsSync(f) ? fm(f, 'title') : ''
}

// A directory WINS over the single file, for both artifacts and in both resolvers — draft/ and
// final/ resolve the same way or a multi-file document seals against one shape and consecrates
// against the other. null when neither exists.
export function docDraftPath (m, id) {
  if (isDirAt(join(m.documents, id, 'draft'))) return join(m.documents, id, 'draft')
  if (isFileAt(join(m.documents, id, 'draft.md'))) return join(m.documents, id, 'draft.md')
  return null
}

export function docFinalPath (m, id) {
  if (isDirAt(join(m.documents, id, 'final'))) return join(m.documents, id, 'final')
  if (isFileAt(join(m.documents, id, 'final.md'))) return join(m.documents, id, 'final.md')
  return null
}

// sha256 over the GROUND a review's verdict rests on: every cited truth (whole file) plus the
// source material behind it (mat_digest, so the `used` stamp that lands at consecration cannot
// stale the review that consecrated it), plus config and schema.
//
// Manifest rule, kept exactly: repo-relative `path\0sha256\n` per entry, sorted bytewise, re-hashed.
// The ids come through listField and NOT a bare split, because `cited_truths: ["t001"]` is legal
// spelling and dropping the quoted ids silently excluded those truths from the manifest — a cited
// truth could then move without staling the review.
export function contextDigest (m, id) {
  const lines = []
  const seen = new Set()
  // The bash loop is `for t in $cited` — an UNQUOTED expansion, so the list is re-split on
  // whitespace after listField has already split it on commas. Reproduced, not tidied: an entry
  // holding a space becomes two ids there, and the port must resolve the same set.
  const cited = listField(fm(join(m.documents, id, 'plan.md'), 'cited_truths'))
    .join('\n').split(/[ \t\n]+/).filter(x => x !== '')
  for (const t of cited) {
    const tf = tfileFor(m, t)
    if (tf === null) continue
    lines.push(`truths/${basename(tf)}\0${truthDigest(tf)}\n`)
    const src = canonId(fm(tf, 'source'))
    if (src === null) continue
    const cm = join(m.materials, src, 'converted.md')
    if (!isFileAt(cm) || seen.has(src)) continue
    seen.add(src)
    lines.push(`materials/${src}/converted.md\0${matDigest(cm)}\n`)
  }
  const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex')
  if (isFileAt(m.config)) lines.push(`.weavedoc/config.yaml\0${sha(m.config)}\n`)
  if (isFileAt(m.schemaPath)) lines.push(`.weavedoc/schema\0${sha(m.schemaPath)}\n`)
  // LC_ALL=C sort: bytewise, over lines that contain a NUL. Compared as bytes for that reason.
  lines.sort((a, b) => Buffer.compare(Buffer.from(a, 'latin1'), Buffer.from(b, 'latin1')))
  return createHash('sha256').update(Buffer.from(lines.join(''), 'latin1')).digest('hex')
}

// Every file under a directory, recursively, in readdir order — the traversal `grep -r` performs.
export function walkFiles (dir) {
  const out = []
  const rec = d => {
    let ents
    try { ents = readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      const p = join(d, e.name)
      if (e.isDirectory()) rec(p)
      else if (e.isFile()) out.push(p)
    }
  }
  rec(dir)
  return out
}

export { basename }
