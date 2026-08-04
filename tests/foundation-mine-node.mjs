// Node side of the mine-level foundation differential. Dumps every config lookup and every
// frontmatter key/value the readers can see in a real mine, in a stable order, so
// foundation-mine-parity.sh can diff it against the bash originals' answers on the same mine.
import { readdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig, cfgPath, fmLoad, hasFm } from '../.weavedoc/bin/lib/read.mjs'

const MINE = process.argv[2]
if (!MINE) { process.stderr.write('usage: node foundation-mine-node.mjs <mine-dir>\n'); process.exit(2) }
const CONFIG = join(MINE, '.weavedoc', 'config.yaml')

const esc = s => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t')
const rows = []

// ---- config: both views, plus the paths resolver ----
const { flat, sect } = loadConfig(CONFIG)
for (const k of [...flat.keys()].sort()) rows.push(`cfgval\t${k}\t\t${esc(flat.get(k))}`)
for (const k of [...sect.keys()].sort()) {
  const i = k.indexOf('.')
  rows.push(`cfg2\t${k.slice(0, i)}\t${k.slice(i + 1)}\t${esc(sect.get(k))}`)
}
for (const k of ['inbox', 'materials', 'truths', 'documents']) {
  rows.push(`cfgpath\t${k}\t\t${esc(cfgPath(CONFIG, k, k, MINE))}`)
}

// ---- frontmatter: every markdown file the mine holds ----
const files = []
const push = p => { if (existsSync(p) && statSync(p).isFile()) files.push(p) }
for (const f of ['project.md', 'catalog.md', 'gaps.md']) push(join(MINE, f))
const dirList = d => { try { return readdirSync(join(MINE, d)) } catch { return [] } }
for (const m of dirList('materials')) push(join(MINE, 'materials', m, 'converted.md'))
for (const t of dirList('truths')) if (t.endsWith('.md')) push(join(MINE, 'truths', t))
for (const d of dirList('documents')) for (const f of dirList(join('documents', d))) if (f.endsWith('.md')) push(join(MINE, 'documents', d, f))

for (const f of files.sort()) {
  const rel = f.slice(MINE.length).replace(/^[/\\]/, '').replace(/\\/g, '/')
  rows.push(`hasfm\t${rel}\t\t${hasFm(f) ? 0 : 1}`)
  const m = fmLoad(f)
  for (const k of [...m.keys()].sort()) rows.push(`fm\t${rel}\t${k}\t${esc(m.get(k))}`)
}

process.stdout.write(rows.join('\n') + '\n')
