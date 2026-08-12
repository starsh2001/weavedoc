// One lexical reading of the Markdown structures WeaveDoc treats as control syntax.
//
// This is deliberately smaller than CommonMark.  It owns only the structures the runtime uses to
// decide what is live ledger text: the initial frontmatter block, HTML comments, fenced code blocks
// and ATX headings.  The important part is not feature count but precedence: a byte belongs to one
// context, so a comment marker inside a fence is literal and a fence marker inside a comment is
// literal.  No caller may erase one construct and feed the joined remainder back into another
// parser; doing that manufactured headings/fences that were not present in the source.
import { isFence } from './core.mjs'

const blank = s => ' '.repeat(s.length)

function physicalLines (text) {
  const out = []
  let start = 0
  let number = 1
  while (start < text.length) {
    const nl = text.indexOf('\n', start)
    const stop = nl < 0 ? text.length : nl
    const stored = text.slice(start, stop)
    // splitLines historically treats a final CR as a terminator too. Record ownership explicitly:
    // no source byte may fall between `raw` and `eol`, because writers splice at these offsets.
    const hasCR = stored.endsWith('\r')
    const raw = hasCR ? stored.slice(0, -1) : stored
    out.push({
      id: `L${number}`,
      number,
      start,
      end: start + raw.length,
      raw,
      eol: nl < 0 ? (hasCR ? '\r' : '') : (hasCR ? '\r\n' : '\n')
    })
    number++
    if (nl < 0) break
    start = nl + 1
  }
  // splitLines() -- the historical runtime contract -- does not expose the empty element after a
  // final newline.  Keep the same physical-line population here.
  return out
}

function fenceOpener (line) {
  const bt = /^ {0,3}(`{3,})([^`]*)$/.exec(line)
  if (bt) return { ch: '`', length: bt[1].length }
  const tl = /^ {0,3}(~{3,})(.*)$/.exec(line)
  if (tl) return { ch: '~', length: tl[1].length }
  return null
}

function fenceCloser (line, fence) {
  const m = new RegExp(`^ {0,3}(${fence.ch === '`' ? '`' : '~'}{3,})[ \\t]*$`).exec(line)
  return m !== null && m[1].length >= fence.length
}

function hiddenAt (line, offset) {
  return line.hidden.some(span => offset >= span.start && offset < span.end)
}

function headingOf (line) {
  const text = line.live
  const m = /^(#{1,6})[ \t]+(.*?)[ \t]*$/.exec(text)
  if (!m) return null
  // The separator after the hashes must exist in the source.  A masked comment is column-preserving
  // but consists of synthetic blanks; accepting one here would turn `#<!--x--> H` into a heading.
  const separator = m[1].length
  if (!/[ \t]/.test(line.raw[separator] || '') || hiddenAt(line, separator)) return null
  return {
    id: `H${line.number}`,
    line: line.number,
    start: line.start,
    end: line.end,
    level: m[1].length,
    name: m[2],
    raw: line.raw
  }
}

// Preserve columns while hiding comments.  Replacing a span with blanks, rather than deleting it,
// is load-bearing: `<!-- x -->``` is not a column-zero fence opener and `<!-- x --># H` is not a
// heading.  Concatenating the two live sides would invent both tokens.
function maskComments (line, state, lineNode, comments) {
  let pos = 0
  let live = ''
  while (pos < line.length) {
    if (state.open) {
      const close = line.indexOf('-->', pos)
      if (close < 0) {
        lineNode.hidden.push({ start: pos, end: line.length })
        live += blank(line.slice(pos))
        return live
      }
      const end = close + 3
      lineNode.hidden.push({ start: pos, end })
      live += blank(line.slice(pos, end))
      state.open = false
      state.node.endLine = lineNode.number
      state.node.end = lineNode.start + end
      state.node.closed = true
      state.node = null
      pos = end
      continue
    }

    const open = line.indexOf('<!--', pos)
    if (open < 0) {
      live += line.slice(pos)
      break
    }
    live += line.slice(pos, open)
    const node = {
      id: `C${comments.length + 1}`,
      line: lineNode.number,
      endLine: null,
      start: lineNode.start + open,
      end: null,
      closed: false
    }
    comments.push(node)
    state.open = true
    state.node = node
    const after = open + 4
    lineNode.hidden.push({ start: open, end: after })
    live += blank(line.slice(open, after))
    pos = after
  }
  return live
}

export function scanMarkdown (text, { frontmatter: allowFrontmatter = false } = {}) {
  const source = typeof text === 'string' ? text : Buffer.from(text).toString('latin1')
  const physical = physicalLines(source)
  const lines = []
  const headings = []
  const comments = []
  const fences = []
  const diagnostics = []
  const comment = { open: false, node: null }
  let fence = null
  let frontmatter = null

  if (allowFrontmatter && physical.length > 0 && isFence(physical[0].raw)) {
    frontmatter = { state: 'open', startLine: 1, endLine: null }
  }

  for (const p of physical) {
    const node = { ...p, live: '', hidden: [], context: 'live', heading: null }

    if (frontmatter !== null && frontmatter.state === 'open') {
      node.context = 'frontmatter'
      if (p.number !== frontmatter.startLine && isFence(p.raw)) {
        frontmatter.state = 'closed'
        frontmatter.endLine = p.number
      }
      lines.push(node)
      continue
    }

    if (fence !== null) {
      if (fenceCloser(p.raw, fence)) {
        node.context = 'fence-close'
        fence.endLine = p.number
        fence.end = p.end
        fence.closed = true
        fence = null
      } else {
        node.context = 'fence-body'
      }
      lines.push(node)
      continue
    }

    // Test an opener only on the original physical line and only while outside a comment.  A token
    // exposed by removing a comment is never reconsidered as structure.
    if (!comment.open) {
      const opener = fenceOpener(p.raw)
      if (opener !== null) {
        const fn = {
          id: `F${fences.length + 1}`,
          line: p.number,
          endLine: null,
          start: p.start,
          end: null,
          ch: opener.ch,
          length: opener.length,
          closed: false
        }
        fences.push(fn)
        fence = fn
        node.context = 'fence-open'
        // Kept for policy compatibility.  Gap-register grammar treats an opener inside a live
        // section as an unreadable line; HQ/questions merely ignore the non-bullet line.
        node.live = p.raw
        lines.push(node)
        continue
      }
    }

    node.live = maskComments(p.raw, comment, node, comments)
    node.context = node.hidden.length === 0 ? 'live' : 'comment-mixed'
    node.heading = headingOf(node)
    if (node.heading !== null) headings.push(node.heading)
    lines.push(node)
  }

  if (frontmatter !== null && frontmatter.state === 'open') {
    diagnostics.push({ code: 'MD_UNTERMINATED_FRONTMATTER', line: frontmatter.startLine })
  }
  if (comment.open) {
    diagnostics.push({ code: 'MD_UNTERMINATED_COMMENT', line: comment.node.line })
  }
  if (fence !== null) {
    diagnostics.push({ code: 'MD_UNTERMINATED_FENCE', line: fence.line, ch: fence.ch, length: fence.length })
  }

  const visibleText = lines.length > 0 ? lines.map(l => l.live).join('\n') + '\n' : ''
  return {
    source,
    lines,
    headings,
    comments,
    fences,
    frontmatter: frontmatter === null ? { state: 'absent' } : frontmatter,
    commentOpen: comment.open,
    fenceOpen: fence !== null,
    diagnostics,
    visibleText
  }
}

export function headingCount (doc, name, level = 0) {
  return doc.headings.filter(h => h.name === name && (level === 0 || h.level === level)).length
}

// Every matching section is kept separate.  A section ends at a same-or-shallower heading; deeper
// headings stay in its body.  Returning line nodes (not reparsed text) preserves source identity.
export function sectionNodes (doc, name, { boundaries = [name] } = {}) {
  const boundaryNames = boundaries instanceof Set ? boundaries : new Set(boundaries)
  const out = []
  for (let i = 0; i < doc.lines.length; i++) {
    const h = doc.lines[i].heading
    if (h === null || h.name !== name) continue
    const body = []
    for (let j = i + 1; j < doc.lines.length; j++) {
      const next = doc.lines[j].heading
      // A repeated ledger heading starts a new physical round even when it is deeper.  Callers with
      // a multi-section register also name all peer roles as boundaries, so Open and Accepted can
      // never overlap merely because their heading levels differ.
      if (next !== null && (next.level <= h.level || boundaryNames.has(next.name))) break
      body.push(doc.lines[j])
    }
    out.push({ id: `S${h.line}`, heading: h, lines: body })
  }
  return out
}

// Blockquotes, as a TYPED population rather than a regex a consumer runs over `raw`.
//
// The quote seal's first implementation matched `/^\s{0,3}>/` against `line.raw` and called that
// "using the shared scanner". It was not: a quote inside an HTML comment counted, a quote behind an
// unterminated fence vanished, `- > x` was invisible, and a lazy continuation (`> a` followed by
// bare prose) silently dropped the second line from the compared span while sealing the first.
// Those are not five exceptions; they are one consumer re-deciding structure. So structure is
// decided here, once, and the grammar is deliberately NARROW — this runtime is not a CommonMark
// renderer, so the forms it will not judge are REFUSED by name instead of being half-supported.
//
//   admitted  — a run of lines whose live text begins with 0-3 spaces then `>`
//   lazy      — a non-blank, non-`>` line directly after such a run: CommonMark folds it into the
//               quote, this grammar does not, and silently keeping only the first half of a span a
//               human reads as one quote is exactly the laundering gap the seal exists to close
//   nested    — a `>` that is not at the line's own start (inside a list item, say)
//
// `live` is used throughout, so a commented-out quote is not a quote; `context` excludes fenced and
// frontmatter lines, so an example is documentation.
// THE MACHINE GRAMMAR IS NARROW ON PURPOSE, and everything a renderer would also call a blockquote
// is DETECTED and refused by name. The alternative — modelling list containers and paragraph
// interruption properly — is a CommonMark engine, which this runtime deliberately is not. So the
// admitted shape is exactly one: `>` at column zero. Anything else that renders as quoted text is
// rejected, never silently admitted and never silently dropped.
//
// Both halves are the point. An earlier version tested the current line alone, so `- item` +
// two-space `> alpha` became a TOP-LEVEL quote while the same thing at four spaces vanished with no
// rejection at all — one shape admitted wrongly, its neighbour lost entirely. And a heading or a
// list marker after a quote was called a lazy continuation, when both are ordinary block boundaries
// that simply end the quote.
// `>` at column zero, followed by ANYTHING. The space after it is optional in Markdown, so
// requiring one made `>alpha` neither a quote nor a rejection — a brand-new way out of the
// population, introduced while closing the others. What follows the `>` is content, not syntax.
const QUOTE_OPEN = /^>/
const QUOTE_INDENTED = /^[ \t]+ *>/
const LIST_NESTED_QUOTE = /^[ \t]*(?:[-+*]|[0-9]+[.)])[ \t]+ {0,3}>/
// What legitimately ENDS a quote instead of continuing it lazily: the block-level constructs that
// interrupt a paragraph. Ordinary prose does not, which is what makes it lazy.
const BOUNDARY = /^(?:#{1,6}(?:[ \t]|$)|(?:[-+*]|[0-9]+[.)])(?:[ \t]|$)|(?:\*[ \t]*){3,}$|(?:-[ \t]*){3,}$|(?:_[ \t]*){3,}$|<!--)/

// REGION FIRST, never line by line. Judging each line separately split ONE quotation into two
// answers: `> alpha` was admitted and sealed while the `  > forged` under it became a neighbouring
// rejection, so a consumer reading the admitted spans got evidence with the forged line removed.
// That is the same defect as "refused yet sealed", wearing an adjacent span instead of one field.
//
// A region is the maximal run of lines a reader sees as one quotation. It is ADMITTED only when
// every one of them is the machine shape; a single indented `>`, list-nested `>` or lazy line makes
// the WHOLE region unsupported, because a quotation is not partly checkable.
export function blockQuoteNodes (doc) {
  const regions = []
  let current = null
  const open = line => {
    current = { id: `Q${line.number}`, lines: [], start: line.start, end: line.end, admitted: true, reason: null }
    regions.push(current)
    return current
  }
  const refuse = code => { if (current !== null && current.admitted) { current.admitted = false; current.reason = code } }
  for (const line of doc.lines) {
    const structural = line.context === 'live' || line.context === 'comment-mixed'
    const live = line.live
    if (!structural) { current = null; continue }
    if (QUOTE_OPEN.test(live)) {
      if (current === null) open(line)
      current.lines.push(line); current.end = line.end
      continue
    }
    // An indented `>` is a quote to a renderer at 1-3 spaces and a code block at 4+, and inside a
    // list item it is quoted text at any depth. This grammar judges none of those — but it must not
    // lose them either, so they join the region and refuse it.
    if (QUOTE_INDENTED.test(live)) {
      if (current === null) open(line)
      current.lines.push(line); current.end = line.end
      refuse('MD_QUOTE_INDENTED')
      continue
    }
    // A list-nested quote starts its own refused region: the list marker is a block boundary, so it
    // is not a continuation of anything above it.
    if (LIST_NESTED_QUOTE.test(live)) {
      current = null
      open(line)
      current.lines.push(line); current.end = line.end
      refuse('MD_QUOTE_NESTED')
      current = null
      continue
    }
    if (current !== null && /[^ \t]/.test(live)) {
      // A heading, list marker, thematic break, fence or comment is an ordinary block boundary and
      // ends the quote cleanly. Only bare prose is lazy.
      if (BOUNDARY.test(live)) { current = null; continue }
      current.lines.push(line); current.end = line.end
      refuse('MD_QUOTE_LAZY')
      continue
    }
    current = null
  }
  // `rejected` is kept as a derived view for callers that want the refusals alone; the region is
  // the unit of truth, so it carries its own verdict.
  return {
    regions,
    nodes: regions.filter(r => r.admitted),
    rejected: regions.filter(r => !r.admitted).map(r => ({
      code: r.reason, line: r.lines[0].number, start: r.start, end: r.end, raw: r.lines.map(l => l.live).join('\n')
    }))
  }
}

// A comment that owns its lines completely — nothing live before it, nothing after. A marker is only
// a marker in this shape: `prose <!-- wd:quote … --> prose` was accepted by the first reader, which
// let a seal be declared from inside a sentence, and a marker nested in an outer comment was read as
// live. Both are decided here from the scanner's own comment spans rather than by matching text.
export function standaloneComments (doc) {
  const out = []
  for (const comment of doc.comments) {
    if (!comment.closed || comment.end === null) continue
    const first = doc.lines.find(l => l.number === comment.line)
    const last = doc.lines.find(l => l.number === comment.endLine)
    if (first === undefined || last === undefined) continue
    if (first.context.startsWith('fence-') || first.context === 'frontmatter') continue
    const before = doc.source.slice(first.start, comment.start)
    const after = doc.source.slice(comment.end, last.end)
    if (/[^ \t]/.test(before) || /[^ \t]/.test(after)) continue
    // Nested inside another comment: the outer span already covers these bytes, so this one is
    // archived text rather than a live instruction.
    if (doc.comments.some(o => o !== comment && o.closed && o.end !== null && o.start < comment.start && o.end > comment.end)) continue
    out.push({
      id: `MC${comment.line}`,
      start: comment.start,
      end: comment.end,
      line: first.number,
      endLine: last.number,
      body: doc.source.slice(comment.start + 4, comment.end - 3)
    })
  }
  return out
}

export function sectionTexts (doc, name) {
  return sectionNodes(doc, name).map(s => s.lines.length > 0 ? s.lines.map(l => l.live).join('\n') + '\n' : '')
}
