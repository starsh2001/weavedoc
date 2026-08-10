// One review.md model for validate, status and consecrate.
//
// Review is not a bullet ledger: its fidelity zone is shape-free and bracketed violation kinds are
// meaningful on any line.  It therefore shares the lexical scanner (frontmatter/comment/fence/
// heading precedence) but keeps a dedicated policy adapter.  Every consumer selects from this model;
// none erases comments and reparses the joined remainder.
import { readFileSync } from 'node:fs'
import { scanMarkdown } from './markdown-scan.mjs'
import { classifySlot, hasRealContent, parseSlot } from './ledger-model.mjs'

const readOrNull = file => { try { return readFileSync(file).toString('latin1') } catch { return null } }

// Review's policy primitives live beside its typed model. They are deliberately independent of
// bullet shape: the gate acts on a bracketed kind anywhere in its zone, and comments are the only
// archive mechanism.
export function isNoise (line, kinds) {
  if (line === '' || line.startsWith('#') || line.startsWith('<!--') || line.startsWith('-->')) return true
  const s = line.replace(/^[ \t\n\v\f\r]*/, '')
  if (s === '' || !s.includes('[')) return true
  for (const kind of kinds) {
    if (s.startsWith(`- [${kind}]`) || s.startsWith(`- [<${kind}>]`) || s.startsWith(`- [{${kind}}]`)) return false
  }
  if (!/^- \[[[{<]/.test(s)) return false
  const match = /^[^[\]]*\[([^\]]*)\]/.exec(s)
  const slot = (match ? match[1] : '').toLowerCase()
  for (const kind of kinds) if (slot.includes(kind)) return true
  let rest = s.includes(']') ? s.slice(s.indexOf(']') + 1) : null
  if (rest === null) {
    if (s.includes('}')) rest = s.slice(s.indexOf('}') + 1)
    else if (s.includes('>')) rest = s.slice(s.indexOf('>') + 1)
    else rest = ''
  }
  if (!/[^ \t\n\v\f\r]/.test(rest)) return true
  if (/\{[\s\S]*\}/.test(rest) || /<[\s\S]*>/.test(rest)) return true
  return false
}

export const foldKinds = kinds => kinds
  .map(kind => kind.toLowerCase().replace(/[^a-z0-9]/g, ''))
  .filter(kind => kind !== '')

export function bearsKind (line, folded) {
  let rest = line
  for (;;) {
    const open = rest.indexOf('[')
    if (open < 0) return false
    const after = rest.slice(open + 1)
    const close = after.indexOf(']')
    const foldedSlot = (close >= 0 ? after.slice(0, close) : after).toLowerCase().replace(/[^a-z0-9]/g, '')
    if (folded.some(kind => foldedSlot.includes(kind))) return true
    rest = close >= 0 ? after.slice(close + 1) : ''
  }
}

const headingFromRaw = raw => {
  const m = /^(#{1,6})[ \t]+(.*?)[ \t]*$/.exec(raw)
  return m === null ? null : { level: m[1].length, name: m[2] }
}

// Fences are not an archive mechanism for the fidelity zone: a bracketed violation inside a code
// sample under the live gate still counts (the zone rule is deliberately shape-free).  They do,
// however, suppress Markdown headings.  Comments are the one supported archive mechanism and stay
// masked.  This projection preserves both facts without running a second lexer.
const reviewText = line => (line.context.startsWith('fence-') || line.context === 'frontmatter') ? line.raw : line.live

function commentVisibleHeading (line) {
  if (line.context.startsWith('fence-')) return headingFromRaw(line.raw)
  return line.heading
}

const tally = (lines, selector) => {
  const out = new Map()
  for (const line of lines) {
    const heading = selector(line)
    if (heading === null) continue
    out.set(heading.name, (out.get(heading.name) || 0) + 1)
  }
  return out
}

function zoneMarks (document, sections, gateName) {
  const siblings = new Set(sections.filter(name => name !== '' && name !== gateName))
  let tier = 0
  for (const heading of document.headings) {
    if (!siblings.has(heading.name)) continue
    if (tier === 0 || heading.level < tier) tier = heading.level
  }

  const marks = []
  let inside = false
  let done = false
  let gateLevel = 0
  for (const line of document.lines) {
    const heading = line.heading
    const text = reviewText(line)
    if (!inside) {
      if (!done && heading !== null && heading.name === gateName) {
        inside = true
        gateLevel = heading.level
      }
      marks.push({ zone: 'outside', fromGate: false, line, text })
      continue
    }

    if (heading !== null && (
      heading.level <= gateLevel ||
      (siblings.has(heading.name) && tier > 0 && heading.level <= tier)
    )) {
      inside = false
      done = true
      // The boundary line is outside for subsequent zone ownership, but it was encountered while
      // the gate was live. A heading such as `# [typo] OPEN` must therefore be classified as a
      // malformed gate-shaped line before it can end the zone.
      marks.push({ zone: 'outside', fromGate: true, line, text })
      continue
    }
    marks.push({ zone: 'inside', fromGate: false, line, text })
  }
  return marks
}

function gateShapeSlot (mark) {
  if (mark.zone !== 'inside' && !mark.fromGate) return null
  const text = mark.text.replace(/^[ \t\v\f\r]*/, '')
  // These are exactly the shapes isNoise may discard while a bracket is acting as the entry slot:
  // a normal bullet, a hash/numbered pseudo-entry, or a stray comment closer before the entry.
  // Later brackets in ordinary heading prose remain prose (`# round 2 [draft]`).
  const prefix = /^(?:- |#{1,6}(?:[0-9]+)?[ \t]*|-->[ \t]*(?:- )?)/.exec(text)
  if (prefix === null || text[prefix[0].length] !== '[') return null
  const parsed = parseSlot(text, prefix[0].length)
  const slot = classifySlot(parsed)
  const rawSlot = parsed.type === 'closed'
    ? parsed.value
    : text.slice(prefix[0].length + 1)
  return {
    mark,
    text,
    rawSlot,
    slotState: slot.type,
    remainder: parsed.type === 'closed' ? text.slice(parsed.end) : ''
  }
}

function commentIncidents (document, foldedKinds) {
  const incidents = []
  for (const comment of document.comments) {
    if (!comment.closed || comment.end === null) continue
    const interior = document.source.slice(comment.start + 4, comment.end - 3)
    let count = 0
    for (let line of interior.split('\n')) {
      if (line.endsWith('\r')) line = line.slice(0, -1)
      if (line.includes('[') && bearsKind(line, foldedKinds)) count++
    }
    const closeLine = document.lines.find(line => line.number === comment.endLine)
    const suffix = closeLine === undefined
      ? ''
      : document.source.slice(comment.end, closeLine.end).replace(/^[ \t\v\f\r]+/, '').replace(/[ \t\v\f\r]+$/, '')
    if (count > 0 && suffix !== '') incidents.push({ comment, count, suffix })
  }
  return incidents
}

function referenceLabels (document) {
  const labels = new Set()
  for (const line of document.lines) {
    // A reference definition is structure only outside fences/frontmatter. A line-wide
    // `comment-mixed` flag is too coarse here: a valid definition may carry `<!-- … -->` in its
    // quoted title. Judge the raw leading label, then require that exact prefix to be source-live;
    // comments later in the destination/title cannot erase the reference semantics of the label.
    if (line.context.startsWith('fence-') || line.context === 'frontmatter') continue
    const match = /^ {0,3}\[([^\]]+)\]:[ \t]*/.exec(line.raw)
    if (match === null) continue
    if (line.hidden.some(span => span.start < match[0].length && span.end > 0)) continue
    labels.add(match[1].toLowerCase().replace(/[^a-z0-9]/g, ''))
  }
  return labels
}

export function parseReview (document, contract = {}) {
  const sections = contract.sections || ['Fidelity violations', 'Findings', 'Adjudications', 'Human queue']
  const kinds = contract.kinds || ['contradiction', 'unsupported', 'missing-required']
  const gateName = contract.gateName || 'Fidelity violations'
  const foldedKinds = foldKinds(kinds)
  const references = referenceLabels(document)
  const marks = zoneMarks(document, sections, gateName)
  const gateLines = marks.filter(mark => mark.zone === 'inside' && mark.line.heading === null)
  const gateEntries = gateLines.filter(mark => !isNoise(mark.text, kinds))
  const gateShapeCandidates = marks.map(gateShapeSlot).filter(candidate => candidate !== null)
    .map(candidate => {
      const rawSlot = candidate.rawSlot.replace(/^[ \t\v\f\r]+/, '').replace(/[ \t\v\f\r]+$/, '')
      const bodyReal = hasRealContent(candidate.remainder)
      return {
        ...candidate,
        rawSlot,
        bodyReal,
        // Slot syntax and materialisation are separate axes. Only a real placeholder slot with no
        // real body is template noise; blank and unclosed slots are malformed even when empty.
        template: candidate.slotState === 'placeholder' && !bodyReal,
        exactKind: kinds.includes(rawSlot)
      }
    })
  const insideKinds = marks.filter(mark => (mark.zone === 'inside' || mark.fromGate) &&
    bearsKind(mark.text, foldedKinds))
  const blocking = new Map(gateEntries.map(mark => [mark.line.id, mark]))
  for (const mark of insideKinds) blocking.set(mark.line.id, mark)
  for (const candidate of gateShapeCandidates) {
    // A pure placeholder is inert only while it remains inside the gate. At the gate's own heading
    // tier it is also a Markdown section boundary: allowing that dual-role line to be noise would
    // close the gate and launder the first real entry after it. Fail closed on the boundary itself.
    if (!candidate.template || candidate.mark.fromGate) blocking.set(candidate.mark.line.id, candidate.mark)
  }
  // Map insertion order reflects which policy arm discovered a mark, not where the evidence sits
  // in the file.  Consumers print or select the first blocker, so the public model always exposes
  // diagnostics in source order after the independent policy sets have been unioned.
  const bySource = (a, b) => a.line.start - b.line.start
  const gateBlocking = [...blocking.values()].sort(bySource)
  // A boundary was encountered while the gate was live, so known kinds on that line belong to the
  // gate even when the slot occurs later in heading prose. Truly subsequent lines are outside.
  const outsideKinds = marks.filter(mark => mark.zone === 'outside' && !mark.fromGate &&
    bearsKind(mark.text, foldedKinds))
  const allBlocking = new Map(gateBlocking.map(mark => [mark.line.id, mark]))
  for (const mark of outsideKinds) allBlocking.set(mark.line.id, mark)
  const blockingMarks = [...allBlocking.values()].sort(bySource)
  // YAML comments in frontmatter are metadata, not headings that an HTML comment later hid.
  // Fenced headings remain in both raw projections so they are not misreported as comment loss.
  const rawHeadings = tally(document.lines, line => line.context === 'frontmatter' ? null : headingFromRaw(line.raw))
  const commentVisibleHeadings = tally(document.lines, commentVisibleHeading)
  const liveHeadings = new Map()
  for (const heading of document.headings) liveHeadings.set(heading.name, (liveHeadings.get(heading.name) || 0) + 1)
  const lostSections = sections.filter(name => name !== '' &&
    (rawHeadings.get(name) || 0) > 0 && (commentVisibleHeadings.get(name) || 0) === 0)

  return {
    document,
    sections,
    kinds,
    foldedKinds,
    referenceLabels: references,
    gateName,
    marks,
    gateLines,
    gateEntries,
    gateShapeCandidates,
    insideKinds,
    gateBlocking,
    blockingMarks,
    outsideKinds,
    rawHeadings,
    commentVisibleHeadings,
    liveHeadings,
    lostSections,
    commentIncidents: commentIncidents(document, foldedKinds),
    headingCount: name => liveHeadings.get(name) || 0
  }
}

export function readReview (file, contract = {}) {
  const source = readOrNull(file)
  const document = scanMarkdown(source ?? '', { frontmatter: true })
  return { readable: source !== null, ...parseReview(document, contract) }
}

// v1 migration turns bracketed OUTSIDE-zone history into record prose. The edits come from the
// same zone marks validate and consecrate use, and splice source offsets rather than re-rendering
// the document. A subheading inside the gate therefore cannot launder an open violation.
export function outsideKindEdits (model) {
  const edits = []
  for (const mark of model.outsideKinds) {
    // Detection authority is wider than mutation authority. Fenced examples and frontmatter are
    // outside the gate and therefore block, but removing brackets there can alter program text or
    // turn a YAML list into a scalar. Upgrade leaves those contexts for a human ruling.
    if (mark.line.context.startsWith('fence-') || mark.line.context === 'frontmatter') continue
    // Mutation authority is narrower than detection authority. A legacy record owns a kind only
    // when the bracket is its first token after the historical bullet/table marker and the token
    // is followed by whitespace or EOL. That excludes Markdown links (`[kind](url)` and
    // `[kind][ref]`), inline code and prose mentions: upgrade must never make those syntactically
    // different merely because the zone detector correctly blocks them.
    const lead = /^[ \t\v\f\r]*[-|*][ \t\v\f\r]+/.exec(mark.text)
    if (!lead) continue
    const brackets = /\[([^\]]*)\]/g
    let match
    while ((match = brackets.exec(mark.text)) !== null) {
      const folded = match[1].toLowerCase().replace(/[^a-z0-9]/g, '')
      if (!model.foldedKinds.some(kind => folded.includes(kind))) continue
      // Detection normalises punctuation so spelling tricks cannot bypass the gate. Mutation does
      // not: only the exact canonical token is owned by migration. Footnotes/citations such as
      // `[^contradiction]`/`[@contradiction]` and near-spellings require a human ruling.
      if (!model.kinds.includes(match[1])) continue
      // `[contradiction]` is a shortcut reference link when the document defines that label. Its
      // surface is byte-identical to a legacy record token, so document-wide reference state is
      // part of mutation authority.
      if (model.referenceLabels.has(folded)) continue
      const suffix = mark.text.slice(match.index + match[0].length, match.index + match[0].length + 1)
      if (match.index !== lead[0].length || (suffix !== '' && !/[ \t\v\f\r]/.test(suffix))) continue
      edits.push({
        start: mark.line.start + match.index,
        end: mark.line.start + match.index + match[0].length,
        // `mark.text` is the column-preserving comment projection.  It is safe for deciding what
        // the bracket means, but it is not source text: using match[1] here replaced an inline
        // `<!-- audit -->` with blanks.  Rewrite only the brackets and preserve every byte between
        // them from the source domain.
        text: model.document.source.slice(
          mark.line.start + match.index + 1,
          mark.line.start + match.index + match[0].length - 1
        )
      })
    }
  }
  return edits
}

export function rewriteOutsideKinds (model) {
  const edits = outsideKindEdits(model).sort((a, b) => b.start - a.start)
  let text = model.document.source
  for (const edit of edits) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end)
  const after = parseReview(scanMarkdown(text, { frontmatter: true }), {
    sections: model.sections,
    kinds: model.kinds,
    gateName: model.gateName
  })
  return { text, changed: edits.length, manual: after.outsideKinds }
}
