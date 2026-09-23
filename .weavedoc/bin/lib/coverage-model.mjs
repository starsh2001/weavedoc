// truths/coverage.md structural model shared by validate and census, and the mapped/unmapped
// judgment (mappingState, bottom) shared by census and status.
//
// Coverage keeps its historical level-2 grammar (`## mNNN`, `## legacy`): other level-2 headings
// close the current role, while shallower/deeper headings remain prose inside that role. Comments
// and code fences are decided by markdown-scan once, so neither consumer can manufacture a section
// by deleting a comment or count a fenced example as a real mapping.
import { existsSync, readFileSync } from 'node:fs'
import { canonId, listField } from './core.mjs'
import { scanMarkdown } from './markdown-scan.mjs'
import { fm, join, materialIds, truthFiles } from './mine.mjs'

const readOrNull = file => { try { return readFileSync(file).toString('latin1') } catch { return null } }
const visibleLine = line => line.context.startsWith('fence-') ? '' : line.live

export function parseCoverage (document) {
  const materialSections = []
  const legacySections = []
  const otherSections = []
  const events = []
  let current = { role: 'other', materialId: null, lines: [] }

  for (const line of document.lines) {
    const heading = line.heading
    if (heading !== null && heading.level === 2) {
      const material = /^(m[0-9]+)(?:[ \t]|$)/.exec(heading.name)
      if (material !== null) {
        current = { role: 'material', materialId: material[1], heading, lines: [] }
        materialSections.push(current)
      } else if (heading.name === 'legacy') {
        current = { role: 'legacy', materialId: null, heading, lines: [] }
        legacySections.push(current)
      } else {
        current = { role: 'other', materialId: null, heading, lines: [] }
        otherSections.push(current)
      }
      continue
    }

    const text = visibleLine(line)
    const event = {
      source: { id: line.id, line: line.number, start: line.start, end: line.end },
      lineNode: line,
      text,
      role: current.role,
      materialId: current.materialId
    }
    current.lines.push(event)
    events.push(event)
  }

  return {
    document,
    events,
    materialSections,
    legacySections,
    otherSections,
    looseLegacyHeading: document.headings.some(heading => heading.level === 2 && heading.name.toLowerCase() === 'legacy')
  }
}

export function readCoverage (file) {
  const source = readOrNull(file)
  const document = scanMarkdown(source ?? '', { frontmatter: false })
  return { readable: source !== null, ...parseCoverage(document) }
}

// ---- what "mapped" means — ONE judge, read by census and status ----
// The test is this ledger, never card presence: a material is legitimately DONE with zero cards (its
// facts re-grounded to another material, its value rejected by a ruling, every element skipped with
// a reason), and counting cards by `source` sent map back to such materials for nothing (field
// report, eclypse 2026-09-23: census 74/74, five "unmapped" by source count, all five recorded).
// census and status each once carried their own spelling of this; two spellings are two answers
// on the same mine, so both now read this function.
const mstatus = (m, id) => { const f = join(m.materials, id, 'converted.md'); return existsSync(f) ? fm(f, 'status') : '' }

export function mappingState (m) {
  // ONE POPULATION on both sides of the ratio: numerator and denominator both skip retracted
  // materials and both require a real material on disk, or the ratio goes above 1 (validate green,
  // cause false) or reads N/N while a live material holds no record. A section counts only when it
  // HOLDS a record — a bare `## m002` heading is not a record.
  const covPath = join(m.truths, 'coverage.md')
  let nCov = 0; let nLegacy = 0; let nLegparsed = 0; let nLegbullets = 0
  let coverage = null
  const covered = new Set(); const exempt = new Set()
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
      if (mstatus(m, c) === 'retracted') continue
      nCov++
      covered.add(c)
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
      if (mstatus(m, c) === 'retracted') continue
      nLegacy++
      exempt.add(c)
    }
  }

  // The work list behind the ratio. Unknown when the ledger cannot be read to its end — unknown,
  // not empty, so neither consumer may print it as zero. Same population as the ratio's
  // denominator. Cards split the remainder: a material a card cites but the ledger does not name was
  // mapped before coverage existed, so it is a ruling (or a section written from its cards), never
  // extraction — re-mining it duplicates cards. `corroborated_by` cites too: map already read a
  // corroboration-only material, and re-running it only routes the same facts back to corroboration.
  const unknown = coverage !== null && (!coverage.readable || coverage.document.commentOpen || coverage.document.fenceOpen)
  let unmapped = []; let carded = []
  if (!unknown) {
    const pending = materialIds(m)
      .filter(id => existsSync(join(m.materials, id, 'converted.md')) && mstatus(m, id) !== 'retracted')
      .filter(id => !covered.has(id) && !exempt.has(id))
    const cited = new Set()
    if (pending.length > 0) {
      for (const f of truthFiles(m)) {
        const v = (fm(f, 'source') || '').trim()
        if (v !== '') cited.add(canonId(v) || v)
        for (const c of listField(fm(f, 'corroborated_by') || '')) cited.add(canonId(c) || c)
      }
    }
    unmapped = pending.filter(id => !cited.has(id))
    carded = pending.filter(id => cited.has(id))
  }
  return { coverage, nCov, nLegacy, nLegparsed, nLegbullets, unknown, unmapped, carded }
}
