// One `truths/verify.md` Verified-units model for scope, upgrade and attest.
//
// The model owns the readable heading, section boundaries, row candidates, verdict/pass facts and
// source offsets. Readers select facts; writers splice at those offsets. A commented/fenced fake
// heading can therefore neither buy coverage nor receive a human-mirror row.
import { readFileSync } from 'node:fs'
import { pipes, U } from './core.mjs'
import { scanMarkdown, sectionNodes } from './markdown-scan.mjs'
import { sourceRef, splitLead } from './ledger-model.mjs'

const readOrNull = file => { try { return readFileSync(file).toString('latin1') } catch { return null } }
const lowerAscii = s => s.replace(/[A-Z]/g, char => char.toLowerCase())
const pad = (prefix, number) => `${prefix}${String(number).padStart(3, '0')}`
const rxEscape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const normalizeRow = line => line
  .split(U('·')).join(' ')
  .split('·').join(' ')
  .split(U('–')).join('-')
  .split(U('—')).join('-')
  .replace(/[–—]/g, '-')

function parseRow (line, marker) {
  const split = splitLead(line)
  if (split.obstructed || !/^[|-]/.test(split.rest)) return null
  const normalized = normalizeRow(line.live)
  if (/^[ \t\v\f\r]*\|[ \t\v\f\r|:-]*$/.test(normalized)) return null
  if (!/[mt][0-9]/.test(normalized)) return null

  const tail = normalized.replace(/[ \t\v\f\r|*.-]+$/, '')
  const verified = new RegExp(`(^|[^a-z_])${rxEscape(marker)}$`).test(lowerAscii(tail))
  const pass = /passes[ \t\v\f\r]*([0-9]+)\/([0-9]+)/.exec(normalized)
  const completePass = pass !== null && +pass[1] === +pass[2] && +pass[2] > 0
  const spans = [...normalized.matchAll(/[mt][0-9]+-[mt][0-9]+/g)].map(match => match[0])
  let rangesValid = true
  for (const range of spans) {
    const dash = range.indexOf('-')
    const first = range.slice(0, dash)
    const last = range.slice(dash + 1)
    if (first[0] !== last[0]) continue
    const a = parseInt(first.slice(1), 10)
    const b = parseInt(last.slice(1), 10)
    if (b < a || b - a > 9999) { rangesValid = false; break }
  }

  const ids = []
  if (rangesValid) {
    for (const range of spans) {
      const dash = range.indexOf('-')
      const first = range.slice(0, dash)
      const last = range.slice(dash + 1)
      if (first[0] !== last[0]) continue
      for (let number = parseInt(first.slice(1), 10); number <= parseInt(last.slice(1), 10); number++) {
        ids.push(pad(first[0], number))
      }
    }
    for (const token of normalized.match(/[mt][0-9]+/g) ?? []) ids.push(pad(token[0], parseInt(token.slice(1), 10)))
  }

  return {
    nodeType: 'verified-unit-row',
    source: sourceRef(line),
    lineNode: line,
    raw: line.live,
    normalized,
    verified,
    completePass,
    rangesValid,
    ids,
    covers: verified && rangesValid
  }
}

export function parseVerifiedUnits (document, contract = {}) {
  const contractValid = contract.valid !== false
  const sectionName = contractValid ? (contract.sectionName || 'Verified units') : null
  const marker = lowerAscii(contract.verifiedMarker || 'verified')
  const levels = contract.levels || [1, 2]
  const boundaries = contractValid
    ? (contract.boundaries || [sectionName, 'Human queue', 'Adjudications'])
    : []
  const sections = contractValid
    ? sectionNodes(document, sectionName, { boundaries }).filter(section => levels.includes(section.heading.level))
    : []
  const rows = []
  for (const section of sections) {
    for (const line of section.lines) {
      const row = parseRow(line, marker)
      if (row !== null) rows.push(row)
    }
  }
  const headings = contractValid
    ? document.headings.filter(heading => heading.name === sectionName && levels.includes(heading.level))
    : []
  return {
    document,
    contractValid,
    contractError: contract.error || null,
    sectionName,
    marker,
    levels,
    boundaries,
    sections,
    headings,
    rows,
    coveredIds: rows.filter(row => row.covers).flatMap(row => row.ids),
    uncoveredRows: rows.filter(row => !row.covers),
    hasHeading: (name, levels = null) => document.headings.some(heading =>
      heading.name === name && (levels === null || levels.includes(heading.level)))
  }
}

// The section name, its known sibling roles and the verdict marker are one schema-derived contract.
// A deeper `Human queue` is still a sibling role, not evidence text inside Verified units.
export function verifiedUnitsContract (schema) {
  const get = key => schema?.get?.(key)
  // Positions are roles. Dropping an empty first member turns Human queue into the evidence lane,
  // so preserve empties and reject the whole contract instead of guessing another section.
  // The SPLIT is core.pipes() — the runtime's one spelling of a pipe list (see gapRegisterContract):
  // interior/leading empties survive so a role can never shift, and a single trailing delimiter is
  // not a fourth role that disables verification everywhere.
  const rawSections = get('verify.sections')
  const rawMarker = get('verify.units.verified')
  const sections = pipes(rawSections).map(U)
  const unique = new Set(sections)
  const validSections = sections.length === 3 && sections.every(name => name !== '') && unique.size === sections.length
  const validMarker = typeof rawMarker === 'string' && rawMarker !== '' && !rawMarker.includes('|')
  const valid = validSections && validMarker
  const errors = []
  if (!validSections) errors.push('verify.sections must contain exactly three distinct non-empty positional roles')
  if (!validMarker) errors.push('verify.units.verified must be one non-empty scalar marker')
  return {
    valid,
    error: errors.join('; '),
    sectionName: valid ? sections[0] : null,
    boundaries: valid ? sections : [],
    verifiedMarker: valid ? U(rawMarker) : '__invalid_verified_marker__',
    levels: [1, 2]
  }
}

export function readVerifiedUnits (file, contract = {}) {
  const source = readOrNull(file)
  const document = scanMarkdown(source ?? '', { frontmatter: true })
  return { readable: source !== null, ...parseVerifiedUnits(document, contract) }
}

export function insertMirrorRow (model, row) {
  const heading = model.headings.find(item => item.level === 1 || item.level === 2)
  if (heading === undefined) return null
  const line = model.document.lines.find(item => item.number === heading.line)
  if (line === undefined) return null
  const source = model.document.source
  const eol = line.eol || (source.includes('\r\n') ? '\r\n' : '\n')
  let at
  let candidate
  if (line.eol === '') {
    at = line.end + eol.length
    candidate = source.slice(0, line.end) + eol + row + eol + source.slice(line.end)
  } else if (line.eol === '\r') {
    // A lone CR is an EOF terminator in the historical reader, but an internal lone CR is not a
    // line boundary. Complete it to CRLF before adding the row; `heading\rrow\r` preserves bytes
    // yet creates no readable row, which the postcondition below correctly rejects.
    const after = line.end + 1
    at = after + 1
    candidate = source.slice(0, after) + '\n' + row + '\r\n' + source.slice(after)
  } else {
    at = line.end + line.eol.length
    candidate = source.slice(0, at) + row + eol + source.slice(at)
  }

  // A heading may be structurally live while opening an HTML comment that closes on a later line:
  // `## Verified units <!--`.  Blindly inserting after that physical line writes the mirror inside
  // the comment.  Prove the candidate became a live row at the exact insertion offset; otherwise
  // the caller keeps the sidecar truth and reports that the human mirror was skipped.
  const reparsed = parseVerifiedUnits(scanMarkdown(candidate, { frontmatter: true }), {
    sectionName: model.sectionName,
    verifiedMarker: model.marker,
    levels: model.levels,
    boundaries: model.boundaries
  })
  return reparsed.rows.some(item => item.source.start === at && item.raw === row) ? candidate : null
}

export function appendVerdicts (model, suffix) {
  const targets = model.rows
    .filter(row => !row.verified && row.completePass)
  const edits = targets
    .map(row => {
      // If this row opens a comment that closes later, lineNode.end is inside that comment.  Put
      // the verdict before the opener, where the row is live.  Same-line closed comments need no
      // special case: the physical line end is live again.
      const spanning = model.document.comments.find(comment =>
        comment.line === row.lineNode.number &&
        (comment.endLine === null || comment.endLine > row.lineNode.number))
      let at = spanning === undefined ? row.lineNode.end : spanning.start
      // Keep the source separator on the comment side of the inserted verdict. Inserting at '<'
      // produced `passes 1/1  · verified<!--`; anchoring before its trailing horizontal blanks
      // yields the source-faithful `passes 1/1 · verified <!--`.
      if (spanning !== undefined) {
        while (at > row.lineNode.start && /[ \t]/.test(model.document.source[at - 1])) at--
      }
      return { at, text: suffix }
    })
    .sort((a, b) => b.at - a.at)
  let source = model.document.source
  for (const edit of edits) source = source.slice(0, edit.at) + edit.text + source.slice(edit.at)
  const reparsed = parseVerifiedUnits(scanMarkdown(source, { frontmatter: true }), {
    sectionName: model.sectionName,
    verifiedMarker: model.marker,
    levels: model.levels,
    boundaries: model.boundaries
  })
  const postcondition = targets.every(target => reparsed.rows.some(row =>
    row.lineNode.number === target.lineNode.number && row.verified && row.completePass))
  return { text: source, changedRows: edits.length, postcondition }
}
