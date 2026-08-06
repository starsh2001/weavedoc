// weavedoc gaps — census, then the self-declared incompleteness markers in the mine's
// source-of-truth files (converted.md + truths/ ONLY).
//
// ALWAYS exits 0: gaps are fill-or-accept, not failures. This is the mechanical floor — semantic
// gaps (reference, enumeration, symmetry) belong to the weavedoc-gaps skill. The CLI reports raw
// lines; the skill triages, because a marker sitting in prose is not a declaration.
import { readFileSync, existsSync } from 'node:fs'
import { basename } from 'node:path'
import { splitLines } from './core.mjs'
import { nocomment, defence } from './sections.mjs'
import { loadSchema } from './read.mjs'
import { join, materialIds, truthFiles } from './mine.mjs'
import { cmdCensus } from './cmd-census.mjs'
import { scanRegister } from './gaps-register.mjs'

const readOr = p => { try { return readFileSync(p, 'utf8') } catch { return '' } }
// gaps.md is read in the BYTE domain, and only gaps.md: the marker scan below prints lines out of
// converted.md/truths and stays decoded, while the accepted tally feeds `scanRegister`, whose
// `strip()` is a class of BYTES. Two domains in one command is fine as long as each reader and the
// text it judges agree — which is why the section name and kind enum come from a latin1 schema map
// here, the same pairing status --open needed (v0.5.6).
const readBytes = p => { try { return readFileSync(p).toString('latin1') } catch { return '' } }

const DEFAULT_MARKERS = '미정|미완성|미확정|미상|TBD|TODO|추후 보강|추후 작업|추후 결정|정해지지 않|미해결'

// The local entry counter that used to live here is GONE (v0.5.8), not fixed in place: it kept
// converging on validate's rules one review at a time — column-zero entries in v0.5.4, the fence
// pass in review #11 — and stayed behind on the placeholder rule, which is the shape that made
// this file's tally a third answer. `scanRegister` is called instead.

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
    // The SAME defence pass validate's readers use (review #11): fenced content is text, not
    // register — without this, an example register inside a code fence counted here.
    //
    // AND THE SAME SCANNER (v0.5.8). This was the last reader still running the placeholder PREFIX
    // rule validate abandoned in v0.5.4 review #9 — the retired rule whose other consumer reported
    // a blocking gap as "nothing is waiting" (v0.5.5). Here it under-counted instead: an accepted
    // decision whose kind slot kept its template but whose body is written out tallied as nothing.
    // `scanRegister` is the one judgment now; the schema is read in the TEXT'S OWN DOMAIN with it,
    // because reading a non-ASCII section name from the utf8 map against latin1 text is exactly how
    // v0.5.6 re-introduced the defect it was repairing.
    const schB = loadSchema(m.schemaPath, 'latin1')
    const secAcc = (schB.get('gaps.sections') || 'Open|Accepted').split('|')[1] || 'Accepted'
    const kindSet = new Set((schB.get('gaps.enum.kind') || 'declared|reference|enumeration|symmetry').split('|').filter(Boolean))
    // The flag beside the text is not decoration: a fence nobody closed makes everything after it
    // invisible to this tally, and a number that silently shrank reads exactly like a small one.
    // v0.5.4 recorded this as a known issue and v0.5.8 edited this very line without applying it
    // (its twin reader has warned since v0.5.6) — "what a reader cannot see is NAMED" holds here
    // too, and non-blocking is a reason to print it, not a reason to stay quiet.
    const df = defence(nocomment(readBytes(gapsPath)))
    if (df.open) out("gaps.md ends inside an unterminated code fence — entries behind it are invisible to the accepted tally below; close the fence (validate blocks on this under 'completeness: required')")
    nacc = scanRegister(df.text, secAcc, kindSet).n
  }
  out(`— ${n} marker line(s) + ${c} unchecked checkbox(es) — RAW scan, not an open count: gaps.md records ${nacc} already accepted. Non-blocking; run the weavedoc-gaps skill to reconcile these against gaps.md and to cover reference/enumeration/symmetry + fill-or-accept.`)
  return 0
}
