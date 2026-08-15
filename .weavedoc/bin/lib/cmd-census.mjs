// weavedoc census — the authoritative mine statistics. Skills MUST report THESE numbers, never
// eye-counts, which is why every count here is cross-checked against a second source rather than
// simply printed.
import { readFileSync, existsSync } from 'node:fs'
import { basename } from 'node:path'
import { canonId, splitLines } from './core.mjs'
import { readCoverage } from './coverage-model.mjs'
import { fm, join, materialIds, truthFiles } from './mine.mjs'
import { classifyIntake, intakeIndex, intakeLedgerPath } from './intake-ledger.mjs'

const readOr = p => { try { return readFileSync(p, 'utf8') } catch { return '' } }

// The intake lane's census line, built for BOTH exits below. A mine mid-gather — materials in,
// truths not yet extracted — takes the no-truths early return, and that is exactly the window in
// which "how did these arrive" is the live question; a line printed only on the other branch would
// be absent precisely when it matters. Row presence only: census never re-reads a source file, so
// it never says "digest-bound" — that comparison is `scope`'s, and it says which.
function intakeLines (m) {
  const idx = intakeIndex(intakeLedgerPath(m))
  const cls = classifyIntake(m, idx)
  const live = cls.population
  if (live === 0) return []
  const rel = `${m.materials.replace(`${m.root}/`, '')}/${m.intakeFile()}`
  const lines = [`  intake  ${cls.declared.length} declared · ${cls.noSource.length} no-source · ${cls.legacy.length} legacy-unbound · ${cls.undeclared.length} undeclared  of ${live} live material(s)  (row presence only — 'weavedoc scope' compares the digests)`]
  if (cls.undeclared.length > 0) {
    lines.push(`    → undeclared: ${cls.undeclared.join(' ')} — no record of how they arrived; declare with 'weavedoc intake', or fill a pre-ledger mine's rows once with 'weavedoc upgrade --apply'`)
  }
  if (idx.state === 'unreadable') {
    lines.push(`  ⚠ ${rel} exists but cannot be read (${idx.code}) — declarations are unknown, not absent; validate names this [MAT-INTAKE-LEDGER]`)
  } else if (idx.headless > 0) {
    lines.push(`  ⚠ ${rel} holds ${idx.headless} row(s) with no id — an unattributable row could be any material's declaration, so none counts [MAT-INTAKE-LEDGER]`)
  } else if (cls.malformed.length > 0 || cls.unknown.length > 0) {
    lines.push(`  ⚠ ${rel} holds row(s) the reader cannot use (${[...cls.malformed, ...cls.unknown].join(' ')}) — those materials read as undeclared [MAT-INTAKE-LEDGER]`)
  }
  return lines
}

// (fmStatusLines, the per-status tally and the numbering-hole ledger left with schema v3: every
// existing card is canonical, and holes are the allocator's normal trace, not census's question.)
// `- t<digits>:` entry lines in index.md, as lines and as a distinct set. Counting LINES while
// comparing sorted SETS once printed "index entries 2" for one duplicated line with no ✗ to explain
// the disagreement, so both numbers are kept and compared.
function indexEntries (indexPath) {
  const ids = []
  for (const l of splitLines(readOr(indexPath))) {
    const m = /^- (t[0-9]+):/.exec(l)
    if (m) ids.push(m[1])
  }
  return { lines: ids.length, set: [...new Set(ids)].sort() }
}

// countlines: drops a bullet whose bracket still opens a placeholder, nothing more.
const countLines = (text, re) => splitLines(text)
  .filter(l => !/^[ \t]*- [[][{<]/.test(l))
  .filter(l => re.test(l)).length

export function cmdCensus (m, out) {
  const idxPath = join(m.truths, 'index.md')
  const files = truthFiles(m)
  const intake = intakeLines(m)

  // "No truth files" is not "nothing to report": a mine whose truths were deleted while index.md
  // still lists them must not read as a fresh empty mine.
  if (files.length === 0) {
    const e = indexEntries(idxPath)
    if (e.set.length > 0) {
      out(`census: truth files 0 · index entries ${e.set.length}`)
      out(`  ✗ index entries with no truth file: ${e.set.join(' ')} — the truth files are gone while the index still lists them; run 'weavedoc validate' for the full picture`)
    } else {
      out('census: no truths yet')
    }
    for (const l of intake) out(l)
    return 0
  }

  const nFiles = files.length
  const idx = indexEntries(idxPath)

  // No status tally and no numbering-hole accounting in v3. Every card that exists is canonical,
  // so "live" IS the file count; and a numbering hole is the NORMAL trace of canonical-current
  // (deletion removes the card, the allocator never re-grants the number) — explaining holes from
  // the changelog was the mine log acting as a judgment input, which §1.4 forbids. The allocator
  // file is the record that no hole is ever refilled; validate owns that tripwire.

  // ---- coverage ----
  // ONE POPULATION on both sides of the ratio: numerator and denominator both skip retracted
  // materials and both require a real material on disk, or the ratio goes above 1 (validate green,
  // cause false) or reads N/N while a live material holds no record. A section counts only when it
  // HOLDS a record — a bare `## m002` heading is not a record.
  const covPath = join(m.truths, 'coverage.md')
  const mstatus = id => { const f = join(m.materials, id, 'converted.md'); return existsSync(f) ? fm(f, 'status') : '' }
  let nCov = 0; let nLegacy = 0; let nLegparsed = 0; let nLegbullets = 0
  let coverage = null
  if (existsSync(covPath)) {
    coverage = readCoverage(covPath)
    const withRecord = coverage.materialSections
      .filter(section => section.lines.some(event => event.text.trim() !== ''))
      .map(section => section.materialId)
    // Section ids are references, so `## m5` and `## m005` are ONE material: canon first, then dedup.
    const seen = new Set()
    for (const cid of withRecord) {
      const c = canonId(cid) || cid
      if (seen.has(c)) continue
      seen.add(c)
      if (!existsSync(join(m.materials, c, 'converted.md'))) continue
      if (mstatus(c) === 'retracted') continue
      nCov++
    }
    // `## legacy` lists materials the user ruled exempt. ONLY the id leading each bullet counts (the
    // ruling text is free prose that may mention other ids). nLegparsed counts bullets that PARSED,
    // nLegacy the ones that still subtract — one number cannot carry both, since a
    // skipped-retracted bullet and an all-malformed section would both read 0.
    const legacyLines = coverage.legacySections.flatMap(section => section.lines.map(event => event.text))
    nLegbullets = legacyLines.filter(line => /^[ \t]*- /.test(line)).length
    const legIds = [...new Set(legacyLines
      .map(line => (/^[ \t]*-[ \t]*(m[0-9]+)\b/.exec(line) ?? [])[1])
      .filter(Boolean))].sort()
    for (const lid of legIds) {
      nLegparsed++
      const c = canonId(lid) || lid
      if (!existsSync(join(m.materials, c, 'converted.md'))) continue
      if (mstatus(c) === 'retracted') continue
      nLegacy++
    }
  }

  // Denominator = materials on DISK minus retracted. From disk, not parsed frontmatter: counting
  // only CLOSED frontmatter silently dropped an unclosed or zero-byte material. A file that cannot
  // parse stays a material — validate is loudly red about the parse itself.
  let nMats = 0
  const convs = materialIds(m).map(id => join(m.materials, id, 'converted.md')).filter(existsSync)
  if (convs.length > 0) nMats = convs.length - convs.filter(f => fm(f, 'status') === 'retracted').length
  let nDenom = nMats - nLegacy
  if (nDenom < 0) nDenom = 0

  // Always show the raw total: `16/26` and `16/16 (+10 legacy-exempt)` are the same mine, and
  // without "of N" a reader sees progress that never happened. A LEDGER COUNT, not a completeness
  // warranty — the label says `records` so the ratio is not read as one.
  let covline = `coverage records ${nCov}/${nDenom} material(s)`
  if (nLegacy > 0) covline = `coverage records ${nCov}/${nDenom} of ${nMats} material(s) (${nLegacy} legacy-exempt)`
  out(`census: truth files ${nFiles} · index entries ${idx.set.length} · ${covline}`)
  for (const l of intake) out(l)
  if (coverage !== null && !coverage.readable) {
    out('  ⚠ truths/coverage.md exists but cannot be read — coverage records are unknown, not zero; validate blocks this path')
  }
  if (coverage !== null && coverage.document.commentOpen) {
    out("  ⚠ truths/coverage.md ends inside an unterminated '<!--' — mappings behind it are invisible; validate blocks this file")
  }
  if (coverage !== null && coverage.document.fenceOpen) {
    out('  ⚠ truths/coverage.md ends inside an unterminated code fence — mappings behind it are invisible; validate blocks this file')
  }
  if (nCov > nDenom) out(`  ✗ coverage numerator exceeds denominator (${nCov}/${nDenom}) — a '## legacy' entry names a material that also has its own '## m<id>' section, so it is subtracted from the denominator while still counted in the numerator; drop the legacy exemption (it is covered, not exempt)`)
  // Complain only when bullets were present and NONE parsed — nLegparsed, not nLegacy, which is
  // also 0 when every bullet parsed and then named a retracted material.
  if (coverage !== null && nLegparsed === 0 && coverage.looseLegacyHeading && nLegbullets > 0) {
    out("  ✗ truths/coverage.md '## legacy' has bullets, but none begins with an m-id — no exemption was applied (format: '- m001 — <ruling>')")
  }

  // Sets, not counts: a count-only comparison let a missing-truth entry and a no-entry truth CANCEL
  // OUT — a swapped id read as in-sync. Name both sides.
  if (nFiles > 0 || idx.set.length > 0) {
    const onDisk = files.map(f => basename(f, '.md')).sort()
    const idxOnly = idx.set.filter(x => !onDisk.includes(x))
    const fileOnly = onDisk.filter(x => !idx.set.includes(x))
    if (idx.lines > idx.set.length) out(`  ✗ truths/index.md holds ${idx.lines} entry line(s) for ${idx.set.length} distinct id(s) — one id is listed more than once. reindex writes one line per truth file, so two files carry the same 'id:'; run 'weavedoc validate', which names the file whose id does not match its filename`)
    if (idxOnly.length) out(`  ✗ index entries with no truth file: ${idxOnly.join(' ')} — run 'weavedoc reindex'`)
    if (fileOnly.length) out(`  ✗ truth files with no index entry: ${fileOnly.join(' ')} — run 'weavedoc reindex'; if it comes back, the file is one validate rejects (e.g. no frontmatter) and reindex cannot see it — run 'weavedoc validate' for the cause`)
  }

  return 0
}
