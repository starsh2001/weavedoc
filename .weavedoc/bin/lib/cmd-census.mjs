// weavedoc census — the authoritative mine statistics. Skills MUST report THESE numbers, never
// eye-counts, which is why every count here is cross-checked against a second source rather than
// simply printed.
import { readFileSync, existsSync } from 'node:fs'
import { basename } from 'node:path'
import { canonId, splitLines } from './core.mjs'
import { nocomment, sectionAll } from './sections.mjs'
import { fm, join, materialIds, truthFiles } from './mine.mjs'
import { fmLoad } from './read.mjs'

const readOr = p => { try { return readFileSync(p, 'utf8') } catch { return '' } }

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
    return 0
  }

  const nFiles = files.length
  const idx = indexEntries(idxPath)

  // Status tally, read through the SHARED frontmatter value rule — this was once a third private
  // copy of it, and a private copy is only ever one edit away from disagreeing with the other two.
  let nOk = 0; let nRes = 0; let nConf = 0; let nUnsup = 0; let nRetr = 0
  for (const f of files) {
    const st = fmLoad(f).get('status')
    if (st === 'ok') nOk++
    else if (st === 'discarded' || st === 'resolved') nRes++
    else if (st === 'conflict') nConf++
    else if (st === 'unsupported') nUnsup++
    else if (st === 'retracted') nRetr++
  }
  const nLive = nOk + nConf + nUnsup

  // Holes BELOW the smallest surviving id too: ids allocate from t001 up, so a lowest file of t011
  // means t001-t010 are gone — yet only gaps BETWEEN surviving ids used to be reported.
  const nums = files.map(f => parseInt(/^t0*([0-9]+)\.md$/.exec(basename(f))[1], 10)).sort((a, b) => a - b)
  const holes = []
  let prev = 0
  for (const n of nums) { for (let i = prev + 1; i < n; i++) holes.push(i); prev = n }

  // A hole the changelog explains (a `removed:` line) is settled — a permanent nag teaches readers
  // to skip the line the mine's honesty rests on. Zero-padding is normalised on both sides.
  const removed = new Set()
  for (const l of splitLines(readOr(join(m.truths, 'changelog.md')))) {
    if (!/^[ \t]*-[ \t]*removed:/.test(l)) continue
    for (const t of l.match(/t[0-9]+/g) ?? []) removed.add(String(parseInt(t.slice(1), 10)))
  }
  const explained = holes.filter(h => removed.has(String(h))).map(h => `t${String(h).padStart(3, '0')}`)
  const unexplained = holes.filter(h => !removed.has(String(h))).map(h => `t${String(h).padStart(3, '0')}`)

  // ---- coverage ----
  // ONE POPULATION on both sides of the ratio: numerator and denominator both skip retracted
  // materials and both require a real material on disk, or the ratio goes above 1 (validate green,
  // cause false) or reads N/N while a live material holds no record. A section counts only when it
  // HOLDS a record — a bare `## m002` heading is not a record.
  const covPath = join(m.truths, 'coverage.md')
  const mstatus = id => { const f = join(m.materials, id, 'converted.md'); return existsSync(f) ? fm(f, 'status') : '' }
  let nCov = 0; let nLegacy = 0; let nLegparsed = 0
  if (existsSync(covPath)) {
    const stripped = nocomment(readOr(covPath))
    const withRecord = []
    let sec = ''; let has = false
    for (const l of splitLines(stripped)) {
      let mm = /^##[ \t]+(m[0-9]+)([ \t]|$)/.exec(l)
      if (mm) { if (sec !== '' && has) withRecord.push(sec); sec = mm[1]; has = false; continue }
      if (/^##[ \t]/.test(l)) { if (sec !== '' && has) withRecord.push(sec); sec = ''; continue }
      if (sec !== '' && l.trim() !== '') has = true
    }
    if (sec !== '' && has) withRecord.push(sec)
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
    const legIds = [...new Set(splitLines(sectionAll(stripped, 'legacy'))
      .map(l => (/^[ \t]*-[ \t]*(m[0-9]+)\b/.exec(l) ?? [])[1])
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
  const retline = nRetr > 0 ? ` · retracted ${nRetr}` : ''
  out(`census: truth files ${nFiles} · index entries ${idx.set.length} · live ${nLive} (ok ${nOk} · conflict ${nConf} · unsupported ${nUnsup}) · discarded ${nRes}${retline} · ${covline}`)
  if (unexplained.length) out(`  numbering holes (ids never assigned or files lost — confirm which): ${unexplained.join(' ')}`)
  if (explained.length) out(`  numbering holes, explained by changelog 'removed:': ${explained.join(' ')}`)
  if (nCov > nDenom) out(`  ✗ coverage numerator exceeds denominator (${nCov}/${nDenom}) — a '## legacy' entry names a material that also has its own '## m<id>' section, so it is subtracted from the denominator while still counted in the numerator; drop the legacy exemption (it is covered, not exempt)`)
  // Complain only when bullets were present and NONE parsed — nLegparsed, not nLegacy, which is
  // also 0 when every bullet parsed and then named a retracted material.
  if (existsSync(covPath) && nLegparsed === 0 &&
      splitLines(readOr(covPath)).some(l => /^##[ \t]+legacy/i.test(l)) &&
      countLines(sectionAll(nocomment(readOr(covPath)), 'legacy'), /^[ \t]*- /) > 0) {
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

  // The status tallies must sum to the file count — a duplicate `status:` line tallies one file
  // twice. validate names the key; this makes the arithmetic refuse.
  if (nLive + nRes + nRetr !== nFiles) {
    out(`  ✗ status tallies sum to ${nLive + nRes + nRetr} but there are ${nFiles} truth file(s) — a file carries a status outside the enum (the commonest cause: none of these buckets counts it), a duplicate 'status:' line, or none at all; run 'weavedoc validate'`)
  }
  return 0
}
