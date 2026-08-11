// The v3 quote marker: what a verbatim claim looks like, and whether it is true.
//
// This is the hop the mine did not have. The truth seal already proves a truth's body is in its
// material's `converted.md`; this proves the marked spans of `converted.md` are in the RAW source.
// Between them a claim has no unchecked stretch — which is the whole point, because a conversion is
// exactly where a sentence can quietly become a better sentence.
//
// Three boundaries, all fail-closed. The resolver ends at a REGULAR raw source and never follows a
// second marker; the comparison is bytes; and anything the machine cannot decide is named rather
// than passed. A quote that reads as sealed while nothing checked it is worse than no seal.
//
// READ-ONLY AND UNWIRED (Phase 1). No production consumer imports this, and it is not connected to
// the v2 gate.
import { readFileSync } from 'node:fs'
import { scanMarkdown } from './markdown-scan.mjs'
import { readRawSources, resolveRawSource } from './raw-source-model.mjs'

const MARKER_OPEN = 'wd:quote'
const MODES = new Set(['verbatim', 'not-checkable'])
const MATERIAL_ID = /^m[0-9]+$/
const TRUTH_ID = /^t[0-9]+$/
const ATTRS = new Set(['source', 'file', 'location', 'mode'])

// The existing truth seal's spelling, deliberately reused rather than re-derived: `[[:space:]]` in
// the C locale, collapsed to one space, ends trimmed. A re-wrapped quote is the same quote; a
// skipped line is not. Two spellings of "same text" would be two answers about one seal.
const wsnorm = s => s.replace(/[ \t\n\v\f\r]+/g, ' ').replace(/^ /, '').replace(/ $/, '')

// Bytes, never a decoded string. Decoding maps every invalid byte to U+FFFD, so two DIFFERENT byte
// strings compare equal and the seal passes on a forgery — measured on a CP949 material when the
// truth seal was ported, and the same rule has to hold one hop earlier.
const asBytes = buf => Buffer.from(buf).toString('latin1')

// Binary is decided by CONTENT. Naming it by extension would let a rename change a verdict, and the
// plan says so outright. A NUL is the classic tell and is what a text file cannot contain.
export function looksBinary (buf) {
  const bytes = Buffer.from(buf)
  for (let i = 0; i < bytes.length; i++) if (bytes[i] === 0) return true
  return false
}

// ---- grammar -----------------------------------------------------------------------------------
// `<!-- wd:quote source=self mode=verbatim location="§4" -->`. Values are bare (no whitespace) or
// double-quoted. Everything unrecognised is an ERROR, never an ignored extra: a typo'd attribute
// that is silently dropped leaves the writer believing they constrained a claim that nothing did.
function parseAttrs (body) {
  const attrs = {}
  const errors = []
  const seen = new Set()
  const rx = /([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(?:"([^"]*)"|([^\s"]*))/g
  let match
  while ((match = rx.exec(body)) !== null) {
    const [, key, quoted, bare] = match
    const value = quoted !== undefined ? quoted : bare
    if (!ATTRS.has(key)) { errors.push({ code: 'QUOTE-ATTR-UNKNOWN', detail: `'${key}' is not a marker attribute` }); continue }
    if (seen.has(key)) { errors.push({ code: 'QUOTE-ATTR-DUPLICATE', detail: `'${key}' given more than once` }); continue }
    seen.add(key)
    if (value === '') { errors.push({ code: 'QUOTE-ATTR-EMPTY', detail: `'${key}' has no value; an empty attribute is not a value` }); continue }
    attrs[key] = value
  }
  // Anything left over that is not a recognised `k=v` pair is unparsed text inside a marker, which
  // means the writer expressed something this grammar did not read.
  const residue = body.replace(rx, '').replace(/\s+/g, '')
  if (residue !== '') errors.push({ code: 'QUOTE-ATTR-UNKNOWN', detail: `unparsed text in marker: '${residue}'` })
  return { attrs, errors }
}

function validateMarker (attrs) {
  const errors = []
  const source = attrs.source
  if (source === undefined) {
    errors.push({ code: 'QUOTE-SOURCE-MISSING', detail: 'a marker must name its source (self or mNNN)' })
  } else if (TRUTH_ID.test(source)) {
    // A truth proving a material that proves the truth is circular laundering. Named on its own so
    // the writer is told what is wrong rather than "unknown source".
    errors.push({ code: 'QUOTE-SOURCE-TRUTH', detail: `source '${source}' is a truth; quote the material's raw source directly, or the evidence proves itself` })
  } else if (source !== 'self' && !MATERIAL_ID.test(source)) {
    errors.push({ code: 'QUOTE-SOURCE-INVALID', detail: `source '${source}' is neither 'self' nor an mNNN material id` })
  }
  const mode = attrs.mode ?? 'verbatim'
  if (!MODES.has(mode)) errors.push({ code: 'QUOTE-MODE-INVALID', detail: `mode '${mode}' is not one of ${[...MODES].join(', ')}` })
  // The human attribution is all a cold reviewer has when the machine cannot compare.
  if (mode === 'not-checkable' && (attrs.location === undefined || attrs.location === '')) {
    errors.push({ code: 'QUOTE-LOCATION-REQUIRED', detail: 'mode=not-checkable requires a location for the human attribution it stands on' })
  }
  return { mode, errors }
}

export function parseQuoteMarkers (text) {
  const markers = []
  const rx = /<!--\s*wd:quote\b([\s\S]*?)-->/g
  let match
  while ((match = rx.exec(text)) !== null) {
    const parsed = parseAttrs(match[1])
    const checked = validateMarker(parsed.attrs)
    const errors = [...parsed.errors, ...checked.errors]
    markers.push({
      raw: match[0],
      start: match.index,
      end: match.index + match[0].length,
      attrs: { ...parsed.attrs, mode: checked.mode },
      errors,
      valid: errors.length === 0
    })
  }
  return { markers, keyword: MARKER_OPEN }
}

// ---- scanning a converted material ---------------------------------------------------------------
// Structure comes from the shared scanner, so fence and comment precedence is decided once. A fenced
// EXAMPLE of a marker is documentation; a regex over raw text would have counted it as a claim.
function blockQuoteRuns (doc) {
  const runs = []
  let current = null
  for (const line of doc.lines) {
    const live = line.context === 'live' || line.context === 'comment-mixed'
    const isQuote = live && /^\s{0,3}>/.test(line.raw)
    if (isQuote) {
      if (current === null) { current = { lines: [], startLine: line.number }; runs.push(current) }
      current.lines.push(line)
      continue
    }
    // A blank line inside a blockquote ends it for this purpose: the marker attaches to one block.
    current = null
  }
  return runs
}

const quoteText = run => run.lines.map(l => l.raw.replace(/^\s{0,3}>\s?/, '')).join('\n')

export function scanQuotedMaterial (materialDir, { trustedRoot, materialsRoot } = {}) {
  const diagnostics = []
  const quotes = []
  const convertedPath = `${materialDir}/converted.md`
  let source
  try {
    source = readFileSync(convertedPath).toString('latin1')
  } catch {
    return { readable: false, quotes: [], diagnostics: [{ code: 'QUOTE-CONVERTED-UNREADABLE', detail: `${convertedPath} cannot be read` }] }
  }
  const doc = scanMarkdown(source, { frontmatter: true })
  const markers = parseQuoteMarkers(source).markers.filter(m => {
    // A marker inside a fence is an example. The shared scanner already decided which bytes are
    // fenced; this asks it rather than re-deciding.
    const line = doc.lines.find(l => m.start >= l.start && m.start <= l.end)
    return line !== undefined && !line.context.startsWith('fence-')
  })
  const runs = blockQuoteRuns(doc)

  // Each marker attaches to the first quote run that begins after it with no live prose between.
  const used = new Set()
  for (const marker of markers) {
    const markerLine = doc.lines.find(l => marker.start >= l.start && marker.start <= l.end)
    const run = runs.find(r => !used.has(r) && markerLine !== undefined && r.startLine > markerLine.number &&
      doc.lines.slice(markerLine.number, r.startLine - 1).every(l => l.raw.trim() === ''))
    if (run === undefined) {
      diagnostics.push({ code: 'QUOTE-MARKER-ORPHAN', detail: 'a marker is not followed by a quote block, so it seals nothing' })
      continue
    }
    used.add(run)
    const text = quoteText(run)
    const quote = {
      marker,
      text,
      startLine: run.startLine,
      sealed: false,
      mechanicallyCheckable: marker.attrs.mode === 'verbatim',
      coldDebt: marker.attrs.mode === 'not-checkable',
      diagnostics: []
    }
    quotes.push(quote)
    if (!marker.valid) {
      quote.diagnostics.push(...marker.errors)
      diagnostics.push(...marker.errors)
      continue
    }
    // RESOLVE, and stop at the raw source. `source=mNNN` reads that material's own raw root; it does
    // not follow that material's markers, because chasing markers is how a claim ends up proving
    // itself through a chain nobody read.
    const targetDir = marker.attrs.source === 'self' ? materialDir : `${materialsRoot}/${marker.attrs.source}`
    const raw = readRawSources(targetDir, { trustedRoot })
    if (raw.state !== 'complete') {
      const d = { code: 'QUOTE-SOURCE-UNAVAILABLE', detail: `the raw source set for '${marker.attrs.source}' is '${raw.state}', so this quote cannot be checked` }
      quote.diagnostics.push(d); diagnostics.push(d)
      continue
    }
    const resolved = resolveRawSource(raw, marker.attrs.file ?? null)
    if (!resolved.ok) {
      const d = {
        code: resolved.code === 'RAW-SOURCE-AMBIGUOUS' ? 'QUOTE-SOURCE-AMBIGUOUS' : 'QUOTE-SOURCE-UNRESOLVED',
        detail: resolved.detail ?? `address did not resolve (${resolved.code})`
      }
      quote.diagnostics.push(d); diagnostics.push(d)
      continue
    }
    const bytes = raw.bytesOf(resolved.entry.name)
    quote.resolved = { material: marker.attrs.source, file: resolved.entry.name, digest: resolved.entry.digest }
    const binary = looksBinary(bytes)
    if (marker.attrs.mode === 'not-checkable') {
      // not-checkable is for sources a machine genuinely cannot compare. Allowing it over text is
      // the downgrade path: any failing quote could be relabelled into silence.
      if (!binary) {
        const d = { code: 'QUOTE-NOT-CHECKABLE-ON-TEXT', detail: `${resolved.entry.name} is text, so this quote must be compared, not excused` }
        quote.diagnostics.push(d); diagnostics.push(d)
      }
      continue
    }
    if (binary) {
      const d = { code: 'QUOTE-BINARY-NOT-VERBATIM', detail: `${resolved.entry.name} is binary; a verbatim claim cannot be compared against it` }
      quote.diagnostics.push(d); diagnostics.push(d)
      continue
    }
    quote.sealed = wsnorm(asBytes(bytes)).includes(wsnorm(text))
    if (!quote.sealed) {
      const d = { code: 'QUOTE-SPAN-MISSING', detail: `the quoted span is not present in ${resolved.entry.name} (laundering risk)` }
      quote.diagnostics.push(d); diagnostics.push(d)
    }
  }

  // THE POPULATION RULE. An unmarked blockquote is the escape hatch: delete the marker and the claim
  // leaves the checked set while still reading as a quotation. So the absence is the diagnostic.
  for (const run of runs) {
    if (used.has(run)) continue
    diagnostics.push({ code: 'QUOTE-UNMARKED', line: run.startLine, detail: 'a quote block carries no wd:quote marker, so nothing checks it' })
  }
  return { readable: true, quotes, diagnostics, document: doc }
}
