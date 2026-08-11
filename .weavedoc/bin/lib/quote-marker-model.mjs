// The v3 quote marker: what a verbatim claim looks like, and whether it is true.
//
// This is the hop the mine did not have. The truth seal proves a truth's body is in its material's
// `converted.md`; this proves the marked spans of `converted.md` are in the RAW source. Between them
// a claim has no unchecked stretch — and a conversion is exactly where a sentence can quietly become
// a better sentence.
//
// STRUCTURE IS NOT DECIDED HERE. The first version claimed to use the shared scanner and then
// matched `/^\s{0,3}>/` against raw lines and `<!-- wd:quote` against raw text. That is a consumer
// re-interpreting Markdown, and it leaked in every direction: quotes inside comments counted, quotes
// behind an unterminated fence vanished, `- > x` was invisible, a lazy continuation sealed half a
// span, and `prose <!-- wd:quote … --> prose` declared a seal from inside a sentence. Blockquote and
// standalone-comment populations now come from `markdown-scan` as typed nodes.
//
// TWO VIEWS OF ONE FILE, the split `validate-truths` already uses. Bytes decide the comparison —
// decoding first maps invalid bytes onto U+FFFD, so two different byte strings compare equal and the
// seal passes on a forgery. But `file=` and `location=` are SEMANTIC values a human wrote, so they
// are decoded strictly from their byte slice; the first version returned `location="장4"` as three
// Latin-1 code points and could not resolve a Korean filename at all.
//
// READ-ONLY AND UNWIRED (Phase 1). No production consumer imports this; it is not connected to the
// v2 gate.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { wsnorm } from './core.mjs'
import { blockQuoteNodes, scanMarkdown, standaloneComments } from './markdown-scan.mjs'
import { readRawSources, resolveRawSource } from './raw-source-model.mjs'

const MODES = new Set(['verbatim', 'not-checkable'])
const MATERIAL_ID = /^m[0-9]+$/
const TRUTH_ID = /^t[0-9]+$/
const ATTRS = new Set(['source', 'file', 'location', 'mode'])
const sha256 = buf => createHash('sha256').update(buf).digest('hex')

// TEXT vs BINARY, by content and with a stated rule rather than a vibe. A NUL is the classic tell,
// and so is any other C0 control that text does not use: the first version tested NUL alone and
// called the result "binary", so `01 02 03 41 42` was text and a verbatim quote of `AB` sealed
// against it. Bytes at or above 0x80 are NOT a tell — a CP949 material is ordinary legacy text, and
// treating undecodable-as-UTF-8 as binary would have made the whole byte-domain seal moot.
const TEXT_CONTROLS = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d])
export function classifyContent (buf) {
  const bytes = Buffer.from(buf)
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    if (b === 0) return { kind: 'binary', reason: 'NUL byte' }
    if (b < 0x20 && !TEXT_CONTROLS.has(b)) return { kind: 'binary', reason: `C0 control 0x${b.toString(16).padStart(2, '0')}` }
    if (b === 0x7f) return { kind: 'binary', reason: 'DEL byte' }
  }
  return { kind: 'text', reason: null }
}

// A byte slice back to the text a human wrote. STRICT: an attribute that is not valid UTF-8 is a
// typed error, not a best-effort string, because it is about to be compared against a filename.
function decodeStrict (latin1Value) {
  const bytes = Buffer.from(latin1Value, 'latin1')
  const text = bytes.toString('utf8')
  return Buffer.from(text, 'utf8').equals(bytes) ? { ok: true, text } : { ok: false, text: null }
}

// ---- grammar -----------------------------------------------------------------------------------
// `<!-- wd:quote source=self mode=verbatim location="§4" -->`, occupying its own line(s) entirely.
// Everything unrecognised is an ERROR, never an ignored extra: a typo'd attribute silently dropped
// leaves the writer believing they constrained a claim that nothing did.
const MARKER_BODY = /^\s*wd:quote\b([\s\S]*)$/
const ATTR_RX = /([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(?:"([^"]*)"|([^\s"]*))/g

function parseAttrs (body) {
  const attrs = {}
  const errors = []
  const seen = new Set()
  ATTR_RX.lastIndex = 0
  let match
  while ((match = ATTR_RX.exec(body)) !== null) {
    const [, key, quoted, bare] = match
    const raw = quoted !== undefined ? quoted : bare
    if (!ATTRS.has(key)) { errors.push({ code: 'QUOTE-ATTR-UNKNOWN', detail: `'${key}' is not a marker attribute` }); continue }
    if (seen.has(key)) { errors.push({ code: 'QUOTE-ATTR-DUPLICATE', detail: `'${key}' given more than once` }); continue }
    seen.add(key)
    if (raw === '') { errors.push({ code: 'QUOTE-ATTR-EMPTY', detail: `'${key}' has no value; an empty attribute is not a value` }); continue }
    // `source` and `mode` are ASCII vocabulary; `file` and `location` are human text.
    if (key === 'file' || key === 'location') {
      const decoded = decodeStrict(raw)
      if (!decoded.ok) { errors.push({ code: 'QUOTE-ATTR-ENCODING', detail: `'${key}' is not valid UTF-8` }); continue }
      attrs[key] = decoded.text
      continue
    }
    attrs[key] = raw
  }
  const residue = body.replace(ATTR_RX, '').replace(/\s+/g, '')
  if (residue !== '') errors.push({ code: 'QUOTE-ATTR-UNKNOWN', detail: `unparsed text in marker: '${residue}'` })
  return { attrs, errors }
}

function validateMarker (attrs) {
  const errors = []
  const source = attrs.source
  if (source === undefined) {
    errors.push({ code: 'QUOTE-SOURCE-MISSING', detail: 'a marker must name its source (self or mNNN)' })
  } else if (TRUTH_ID.test(source)) {
    errors.push({ code: 'QUOTE-SOURCE-TRUTH', detail: `source '${source}' is a truth; quote the material's raw source directly, or the evidence proves itself` })
  } else if (source !== 'self' && !MATERIAL_ID.test(source)) {
    errors.push({ code: 'QUOTE-SOURCE-INVALID', detail: `source '${source}' is neither 'self' nor an mNNN material id` })
  }
  const mode = attrs.mode ?? 'verbatim'
  if (!MODES.has(mode)) errors.push({ code: 'QUOTE-MODE-INVALID', detail: `mode '${mode}' is not one of ${[...MODES].join(', ')}` })
  if (mode === 'not-checkable') {
    // EXACT source AND file, per the plan: an unverifiable claim is the one place where a reader has
    // nothing but the address, so the address may not be inferred from "there was only one".
    if (attrs.location === undefined) errors.push({ code: 'QUOTE-LOCATION-REQUIRED', detail: 'mode=not-checkable requires a location for the human attribution it stands on' })
    if (attrs.file === undefined) errors.push({ code: 'QUOTE-FILE-REQUIRED', detail: 'mode=not-checkable requires an explicit file= so the unverifiable claim names exactly what it rests on' })
  }
  return { mode, errors }
}

// Parses a STANDALONE comment body. Callers hand it the comment's own bytes; nothing here searches
// text for markers, because "is this a marker" is a structural question answered by the scanner.
export function parseMarkerComment (bodyLatin1) {
  const m = MARKER_BODY.exec(bodyLatin1)
  if (m === null) return null
  const parsed = parseAttrs(m[1])
  const checked = validateMarker(parsed.attrs)
  const errors = [...parsed.errors, ...checked.errors]
  return { attrs: { ...parsed.attrs, mode: checked.mode }, errors, valid: errors.length === 0 }
}

// Convenience for grammar fixtures: find markers in a text without a material on disk. It still goes
// through the shared scanner, so it agrees with a real scan about what a marker is.
export function parseQuoteMarkers (text) {
  const doc = scanMarkdown(typeof text === 'string' ? text : Buffer.from(text).toString('latin1'), { frontmatter: true })
  const markers = []
  for (const comment of standaloneComments(doc)) {
    const parsed = parseMarkerComment(comment.body)
    if (parsed === null) continue
    markers.push({ ...parsed, start: comment.start, end: comment.end, line: comment.line, endLine: comment.endLine })
  }
  return { markers, document: doc }
}

// ---- scanning a converted material ---------------------------------------------------------------
const quoteSpan = run => run.lines.map(l => l.live.replace(/^ {0,3}>\s?/, '')).join('\n')

export function scanQuotedMaterial (materialDir, { trustedRoot, materialsRoot } = {}) {
  const diagnostics = []
  const quotes = []
  const convertedPath = `${materialDir}/converted.md`
  let convertedBytes
  try {
    convertedBytes = readFileSync(convertedPath)
  } catch {
    return { readable: false, quotes: [], providers: new Map(), diagnostics: [{ code: 'QUOTE-CONVERTED-UNREADABLE', detail: `${convertedPath} cannot be read` }] }
  }
  const source = convertedBytes.toString('latin1')
  const doc = scanMarkdown(source, { frontmatter: true })
  const convertedDigest = sha256(convertedBytes)

  // An unterminated fence, comment or frontmatter block does not just hide a quote — it means the
  // structure below it is unknown. Reported, never absorbed: the first version returned an empty
  // quote list and no diagnostic, so a material could escape the checked population by opening a
  // fence and never closing it.
  for (const d of doc.diagnostics) {
    diagnostics.push({ code: `QUOTE-${d.code.replace(/^MD_/, '')}`, line: d.line, detail: 'the document structure below this point is unknown, so its quotes cannot be judged' })
  }

  const { nodes: runs, rejected } = blockQuoteNodes(doc)
  for (const r of rejected) {
    diagnostics.push({
      code: r.code === 'MD_QUOTE_LAZY' ? 'QUOTE-LAZY-CONTINUATION' : 'QUOTE-NESTED-UNSUPPORTED',
      line: r.line,
      detail: r.code === 'MD_QUOTE_LAZY'
        ? 'a bare line continues this quote in rendered Markdown; write it with its own > so the compared span is the span a reader sees'
        : 'a quote inside a list item is outside this grammar; move it to its own block so it can be checked'
    })
  }

  // ONE SNAPSHOT PER PROVIDER, for the whole scan. The first version called readRawSources() per
  // marker, so two quotes naming one provider could be judged against two different generations of
  // its bytes inside a single result — the second answer the raw model exists to prevent,
  // reintroduced by its first consumer.
  const providers = new Map()
  const providerOf = id => {
    if (!providers.has(id)) {
      const dir = id === 'self' ? materialDir : `${materialsRoot}/${id}`
      providers.set(id, readRawSources(dir, { trustedRoot }))
    }
    return providers.get(id)
  }

  const markers = standaloneComments(doc)
    .map(c => ({ comment: c, parsed: parseMarkerComment(c.body) }))
    .filter(x => x.parsed !== null)

  const used = new Set()
  for (const { comment, parsed } of markers) {
    const run = runs.find(r => !used.has(r) && r.start > comment.end &&
      !/[^ \t\r\n]/.test(source.slice(comment.end, r.start)))
    if (run === undefined) {
      diagnostics.push({ code: 'QUOTE-MARKER-ORPHAN', line: comment.line, detail: 'a marker is not followed by a quote block, so it seals nothing' })
      continue
    }
    used.add(run)
    const text = quoteSpan(run)
    const quote = {
      marker: { attrs: parsed.attrs, valid: parsed.valid, errors: parsed.errors, range: { start: comment.start, end: comment.end } },
      attrs: parsed.attrs,
      text,
      range: { start: run.start, end: run.end },
      convertedDigest,
      sealed: false,
      mechanicallyCheckable: parsed.attrs.mode === 'verbatim',
      coldDebt: parsed.attrs.mode === 'not-checkable',
      resolved: null,
      diagnostics: []
    }
    quotes.push(quote)
    const note = d => { quote.diagnostics.push(d); diagnostics.push({ ...d, line: comment.line }) }
    if (!parsed.valid) { for (const e of parsed.errors) note(e); continue }

    // AN EMPTY SPAN IS NOT A QUOTE. `includes('')` is true of every string, so a bare `>` sealed
    // against anything at all — the strongest possible false positive, and it passed silently.
    if (wsnorm(text) === '') { note({ code: 'QUOTE-SPAN-EMPTY', detail: 'the quote block has no content, so there is nothing to compare' }); continue }

    const raw = providerOf(parsed.attrs.source)
    if (raw.state !== 'complete') {
      // Distinct codes, because "this material has no raw source" and "its source set is aliased"
      // are different repairs. Collapsing them told every case to go look at the same thing.
      const code = raw.state === 'empty' ? 'QUOTE-SOURCE-ABSENT' : raw.state === 'unreadable' ? 'QUOTE-SOURCE-UNREADABLE' : raw.state === 'unstable' ? 'QUOTE-SOURCE-UNSTABLE' : 'QUOTE-SOURCE-INVALID-SET'
      note({ code, detail: `the raw source set for '${parsed.attrs.source}' is '${raw.state}', so this quote cannot be checked` })
      continue
    }
    const resolved = resolveRawSource(raw, parsed.attrs.file ?? null)
    if (!resolved.ok) {
      note({
        code: resolved.code === 'RAW-SOURCE-AMBIGUOUS' ? 'QUOTE-SOURCE-AMBIGUOUS' : 'QUOTE-SOURCE-UNRESOLVED',
        detail: resolved.detail ?? `address did not resolve (${resolved.code})`
      })
      continue
    }
    const bytes = raw.bytesOf(resolved.entry.name)
    const content = classifyContent(bytes)
    // The SNAPSHOT OBJECT, not just its digest. Two quotes on one provider must hold the same
    // object, which is what proves the scan read it once; equal digests would also be true of two
    // separate reads that happened to agree, so the digest alone cannot tell those apart.
    quote.providerSnapshot = raw
    quote.resolved = {
      material: parsed.attrs.source,
      file: resolved.entry.name,
      entryDigest: resolved.entry.digest,
      providerTreeDigest: raw.treeDigest,
      content: content.kind
    }
    if (parsed.attrs.mode === 'not-checkable') {
      if (content.kind !== 'binary') {
        note({ code: 'QUOTE-NOT-CHECKABLE-ON-TEXT', detail: `${resolved.entry.name} is text, so this quote must be compared, not excused` })
      }
      continue
    }
    if (content.kind === 'binary') {
      note({ code: 'QUOTE-BINARY-NOT-VERBATIM', detail: `${resolved.entry.name} is binary (${content.reason}); a verbatim claim cannot be compared against it` })
      continue
    }
    quote.sealed = wsnorm(bytes.toString('latin1')).includes(wsnorm(text))
    if (!quote.sealed) note({ code: 'QUOTE-SPAN-MISSING', detail: `the quoted span is not present in ${resolved.entry.name} (laundering risk)` })
  }

  // THE POPULATION RULE. An unmarked blockquote is the escape hatch: delete the marker and the claim
  // leaves the checked set while still reading as a quotation. So the absence is the diagnostic.
  for (const run of runs) {
    if (used.has(run)) continue
    diagnostics.push({ code: 'QUOTE-UNMARKED', line: run.lines[0].number, detail: 'a quote block carries no wd:quote marker, so nothing checks it' })
  }
  return { readable: true, quotes, providers, convertedDigest, diagnostics, document: doc }
}
