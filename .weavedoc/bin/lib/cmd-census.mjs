// weavedoc census — the authoritative mine statistics. Skills MUST report THESE numbers, never
// eye-counts, which is why every count here is cross-checked against a second source rather than
// simply printed.
import { readFileSync, existsSync } from 'node:fs'
import { basename } from 'node:path'
import { canonId, fmVal, isFence, splitLines } from './core.mjs'
import { readCoverage } from './coverage-model.mjs'
import { fm, join, materialIds, truthFiles } from './mine.mjs'

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

// EVERY `status:` line inside a file's frontmatter, in order — the census tally's substrate.
// Spelled as the bash awk spells it, and deliberately NOT as fmLoad does:
//   FNR==1 { infm=($0 ~ /^---[[:space:]]*$/); next }
//   infm && /^---[[:space:]]*$/ { infm=0; nextfile }
//   infm && /^status[[:space:]]*:/ { st[fmval($0)]++ }
// Two differences from fmLoad that both matter. Line 1 is consumed by the FNR==1 rule, so the
// opening fence can never itself match; and the key gate is `^status[[:space:]]*:` alone — there is
// no [A-Za-z_] identifier test, so `status :` counts and a bare `status:` counts as the empty value.
function fmStatusLines (file) {
  const out = []
  const lines = splitLines(readOr(file))
  if (lines.length === 0) return out
  if (!isFence(lines[0])) return out
  for (let i = 1; i < lines.length; i++) {
    if (isFence(lines[i])) break
    if (/^status[ \t]*:/.test(lines[i])) out.push(fmVal(lines[i]))
  }
  return out
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
  //
  // EVERY `status:` line in the frontmatter, not the first (fixed 2026-08-04, caught by
  // the corpus scale on `block_dup_key`, since retired with the bash runtime it compared against). fmLoad answers "what does this field say", which is
  // first-spelling-wins, and that is the WRONG question here: census exists to make a duplicated key
  // ARITHMETICALLY visible. The whole point of the tally is the reconciliation line below — tallies
  // must sum to the file count — and a file with two `status:` lines is meant to tally twice so the
  // sum exceeds the file count and says so. Reading only the first made a duplicate key silently
  // consistent, which is the one thing this counter is bought to prevent. It is also the contract
  // validate's FM-DUPLICATE-KEY message states out loud: fm reads the FIRST, validate and reindex
  // read the LAST, census counts BOTH — three commands, three answers, which is why it must be named.
  let nOk = 0; let nRes = 0; let nConf = 0; let nUnsup = 0; let nRetr = 0
  for (const f of files) {
    for (const st of fmStatusLines(f)) {
      if (st === 'ok') nOk++
      else if (st === 'discarded' || st === 'resolved') nRes++
      else if (st === 'conflict') nConf++
      else if (st === 'unsupported') nUnsup++
      else if (st === 'retracted') nRetr++
    }
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
  const retline = nRetr > 0 ? ` · retracted ${nRetr}` : ''
  out(`census: truth files ${nFiles} · index entries ${idx.set.length} · live ${nLive} (ok ${nOk} · conflict ${nConf} · unsupported ${nUnsup}) · discarded ${nRes}${retline} · ${covline}`)
  if (coverage !== null && !coverage.readable) {
    out('  ⚠ truths/coverage.md exists but cannot be read — coverage records are unknown, not zero; validate blocks this path')
  }
  if (coverage !== null && coverage.document.commentOpen) {
    out("  ⚠ truths/coverage.md ends inside an unterminated '<!--' — mappings behind it are invisible; validate blocks this file")
  }
  if (coverage !== null && coverage.document.fenceOpen) {
    out('  ⚠ truths/coverage.md ends inside an unterminated code fence — mappings behind it are invisible; validate blocks this file')
  }
  if (unexplained.length) out(`  numbering holes (ids never assigned or files lost — confirm which): ${unexplained.join(' ')}`)
  if (explained.length) out(`  numbering holes, explained by changelog 'removed:': ${explained.join(' ')}`)
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

  // The status tallies must sum to the file count — a duplicate `status:` line tallies one file
  // twice. validate names the key; this makes the arithmetic refuse.
  if (nLive + nRes + nRetr !== nFiles) {
    out(`  ✗ status tallies sum to ${nLive + nRes + nRetr} but there are ${nFiles} truth file(s) — a file carries a status outside the enum (the commonest cause: none of these buckets counts it), a duplicate 'status:' line, or none at all; run 'weavedoc validate'`)
  }
  return 0
}
