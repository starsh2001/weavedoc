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

export function sectionTexts (doc, name) {
  return sectionNodes(doc, name).map(s => s.lines.length > 0 ? s.lines.map(l => l.live).join('\n') + '\n' : '')
}
