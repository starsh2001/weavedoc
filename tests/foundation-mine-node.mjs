// Node side of the mine-level foundation differential. Dumps every config lookup and every
// frontmatter key/value the readers can see in a real mine, in a stable order, so
// foundation-mine-parity.sh can diff it against the bash originals' answers on the same mine.
import { readdirSync, existsSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { loadConfig, cfgPath, fmLoad, hasFm } from '../.weavedoc/bin/lib/read.mjs'
import { nocomment, commentBalanced, sectionBody, sectionBody2, sectionAll, dupSection } from '../.weavedoc/bin/lib/sections.mjs'

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

// ---- comment stripping and section extraction ----
// nocomment's output is compared by digest: it is one line per input line across ~300 files, and a
// digest still fails loudly while keeping the comparison readable. comment_balanced is the verdict
// that guards it, so it is compared directly.
const sha = s => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16)
for (const f of files.sort()) {
  const rel = f.slice(MINE.length).replace(/^[/\\]/, '').replace(/\\/g, '/')
  const text = (() => { try { return readFileSync(f, 'utf8') } catch { return '' } })()
  rows.push(`nocomment\t${rel}\t\t${sha(nocomment(text))}`)
  rows.push(`cbal\t${rel}\t\t${commentBalanced(f) ? 0 : 1}`)
}

// The section readers are exercised on the files that actually carry sections, with the headers the
// runtime really asks for — plus a level-2 material heading, which is coverage.md's whole shape.
const SECT_FILES = ['gaps.md', 'catalog.md', 'truths/verify.md', 'truths/coverage.md']
for (const d of dirList('documents')) for (const f of ['review.md', 'plan.md']) SECT_FILES.push(`documents/${d}/${f}`)
const HEADERS = ['Open', 'Accepted', 'Verified units', 'Adjudications', 'Human queue',
  'Fidelity violations', 'legacy', 'm001', '자료 목록']
for (const rel of SECT_FILES) {
  const f = join(MINE, rel)
  if (!existsSync(f)) continue
  const text = readFileSync(f, 'utf8')
  for (const h of HEADERS) {
    rows.push(`sect1\t${rel}\t${h}\t${sha(sectionBody(text, h))}`)
    rows.push(`sect2\t${rel}\t${h}\t${sha(sectionBody2(text, h))}`)
    rows.push(`sectall\t${rel}\t${h}\t${sha(sectionAll(text, h))}`)
    for (const lv of [0, 1, 2]) rows.push(`dup${lv}\t${rel}\t${h}\t${dupSection(f, h, lv, false)}`)
    rows.push(`dupraw\t${rel}\t${h}\t${dupSection(f, h, 2, true)}`)
  }
}

process.stdout.write(rows.join('\n') + '\n')
