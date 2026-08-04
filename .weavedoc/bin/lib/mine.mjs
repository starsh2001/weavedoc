// WeaveDoc — the mine context every command opens before it can say anything.
//
// find_root walks UP from the working directory for a .weavedoc/, so a command run from deep inside
// a project still addresses that project and not the runtime's own repo. Everything else (where
// materials live, which schema applies) hangs off that one answer.
import { existsSync, statSync, readdirSync } from 'node:fs'
import { dirname, join as njoin, basename } from 'node:path'
import { loadSchema, loadConfig, cfgPath, fmLoad } from './read.mjs'
import { canonId } from './core.mjs'

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
  if (!existsSync(schemaPath)) schemaPath = join(scriptDir, '..', 'schema')
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
export function tfileFor (m, id) {
  const direct = join(m.truths, `${id}.md`)
  if (existsSync(direct)) return direct
  if (!id.startsWith('t')) return null
  const n = canonId(id)
  if (!n) return null
  const p = join(m.truths, `${n}.md`)
  return existsSync(p) ? p : null
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

export function fm (file, key) {
  return fmLoad(file).get(key) ?? ''
}

export function mtitle (m, id) {
  const f = join(m.materials, id, 'converted.md')
  return existsSync(f) ? fm(f, 'title') : ''
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
