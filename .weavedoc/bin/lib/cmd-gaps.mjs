// weavedoc gaps — census, then the self-declared incompleteness markers in the mine's
// source-of-truth files (converted.md + truths/ ONLY).
//
// ALWAYS exits 0: gaps are fill-or-accept, not failures. This is the mechanical floor — semantic
// gaps (reference, enumeration, symmetry) belong to the weavedoc-gaps skill. The CLI reports raw
// lines; the skill triages, because a marker sitting in prose is not a declaration.
import { readFileSync, existsSync } from 'node:fs'
import { basename } from 'node:path'
import { splitLines } from './core.mjs'
import { nocomment, sectionAll, defence } from './sections.mjs'
import { join, materialIds, truthFiles } from './mine.mjs'
import { cmdCensus } from './cmd-census.mjs'

const readOr = p => { try { return readFileSync(p, 'utf8') } catch { return '' } }

const DEFAULT_MARKERS = '미정|미완성|미확정|미상|TBD|TODO|추후 보강|추후 작업|추후 결정|정해지지 않|미해결'

// countlines: drops a bullet whose bracket still opens a placeholder, nothing more. The
// placeholder-drop is what keeps a freshly-initialised gaps.md from reporting a gap that isn't there.
const countLines = (text, re) => splitLines(text)
  .filter(l => !/^[ \t]*- [[][{<]/.test(l))
  .filter(l => re.test(l)).length
// AN ENTRY OPENS AT COLUMN ZERO — the same rule validate's register scanner uses (v0.5.4 cold
// review): validate moved to it and this counter did not, so a sub-bullet under an accepted entry
// counted as a second accepted gap here and as a continuation there. One file, two answers, again.
const ENTRY = /^- /

// `grep -n` — every matching line with its 1-based number.
function grepN (file, re) {
  const hits = []
  const lines = splitLines(readOr(file))
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) hits.push(`${i + 1}:${lines[i]}`)
  return hits
}

export function cmdGaps (m, out, err) {
  const markers = m.cfg.flat.get('markers') || DEFAULT_MARKERS
  // Validate the pattern BEFORE scanning. A malformed alternation made every grep exit 2,
  // `2>/dev/null` swallowed the reason, and the floor reported "0 marker line(s)" while switched
  // off. That is a misconfiguration, so it exits non-zero rather than reporting a comfortable zero.
  let rx
  try { rx = new RegExp(markers) } catch {
    err(`config gaps.markers is not a valid 'grep -E' pattern: ${markers}`)
    err('  the declared-marker scan cannot run — fix gaps.markers in .weavedoc/config.yaml')
    return 2
  }

  cmdCensus(m, out)

  let n = 0
  let c = 0
  const checkbox = /^[ \t]*- \[ \]/

  out('declared-marker scan (converted.md + truths/t*.md only):')
  for (const id of materialIds(m)) {
    const f = join(m.materials, id, 'converted.md')
    if (!existsSync(f)) continue
    for (const ln of grepN(f, rx)) { out(`  ${id}:${ln}`); n++ }
  }
  for (const f of truthFiles(m)) for (const ln of grepN(f, rx)) { out(`  ${basename(f)}:${ln}`); n++ }

  out('unchecked-checkbox scan (converted.md + truths/t*.md only):')
  for (const id of materialIds(m)) {
    const f = join(m.materials, id, 'converted.md')
    if (!existsSync(f)) continue
    for (const ln of grepN(f, checkbox)) { out(`  ${id}:${ln}`); c++ }
  }
  for (const f of truthFiles(m)) for (const ln of grepN(f, checkbox)) { out(`  ${basename(f)}:${ln}`); c++ }

  // Name the accepted register beside the raw count: this scan does NOT read gaps.md, so an accepted
  // gap reprints every run, and a number that never drops stops being read.
  let nacc = 0
  const gapsPath = join(m.root, 'gaps.md')
  if (existsSync(gapsPath)) {
    // The accepted section's NAME comes from the schema (gaps.sections, second member) and the
    // reader is sectionAll — the same any-level tolerance validate's counter has. Before review #6
    // this spelled 'Accepted' by hand and read h1/h2 only, so a '### Accepted' register validate
    // had just counted printed here as "records 0 already accepted" — two readers, one file.
    const secAcc = (m.sch.get('gaps.sections') || 'Open|Accepted').split('|')[1] || 'Accepted'
    // The SAME defence pass validate's readers use (review #11): fenced content is text, not
    // register — without this, an example register inside a code fence counted here.
    const stripped = defence(nocomment(readOr(gapsPath))).text
    nacc = countLines(sectionAll(stripped, secAcc), ENTRY)
  }
  out(`— ${n} marker line(s) + ${c} unchecked checkbox(es) — RAW scan, not an open count: gaps.md records ${nacc} already accepted. Non-blocking; run the weavedoc-gaps skill to reconcile these against gaps.md and to cover reference/enumeration/symmetry + fill-or-accept.`)
  return 0
}
