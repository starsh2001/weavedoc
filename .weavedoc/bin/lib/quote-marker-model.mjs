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
import { canonId, wsnorm } from './core.mjs'
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
// ASCII WHITESPACE, on this side too. `\s` is Unicode, so a marker written with a non-breaking
// space between attributes parsed as if it were an ordinary space — the same class as the quote
// prefix, which stripped 0xA0 as syntax. Markdown and this grammar are ASCII.
const MARKER_BODY = /^[ \t\r\n]*wd:quote(?![A-Za-z0-9_-])([\s\S]*)$/
const ATTR_RX = /([A-Za-z_][A-Za-z0-9_-]*)[ \t\r\n]*=[ \t\r\n]*(?:"([^"]*)"|([^ \t\r\n"]*))/g

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
  const residue = body.replace(ATTR_RX, '').replace(/[ \t\r\n]+/g, '')
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
    // A blank or control-only location is not an attribution. It is the only thing a cold reviewer
    // has when the machine cannot compare, so "present" is not the test — legible is.
    // `\s` alone is not enough: U+200B and its zero-width relatives are not Unicode whitespace, so
    // a location made only of them counted as legible while rendering as nothing at all.
    const INVISIBLE = /[­͏؜᠎​-‏‪-‮⁠-⁤﻿]/
    const legible = attrs.location === undefined
      ? ''
      : [...attrs.location].filter(ch => !/\s/.test(ch) && !INVISIBLE.test(ch) &&
          ch.codePointAt(0) > 0x1f && ch.codePointAt(0) !== 0x7f).join('')
    if (legible === '') {
      errors.push({ code: 'QUOTE-LOCATION-REQUIRED', detail: 'mode=not-checkable requires a legible location for the human attribution it stands on' })
    }
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
  // THE INPUT IS BYTES — a Buffer, or a latin1 string where one char is one byte. A JS Unicode
  // string with code points above 0xFF is neither: its Korean attribute values would be mangled by
  // the byte-domain machinery below and come back as spurious encoding errors. That ambiguity is
  // refused at the door rather than answered wrongly.
  if (typeof text === 'string' && /[Ā-￿]/.test(text)) {
    throw new Error('parseQuoteMarkers takes bytes (a Buffer or a latin1 string); encode a Unicode string with Buffer.from(s, "utf8") first')
  }
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
// ASCII, EXPLICITLY. `\s` in a JS regex is Unicode whitespace, so it eats U+00A0 — and in the byte
// domain that is the single byte 0xA0, which is CONTENT. Stripping it as if it were quote syntax
// made `>\xA0alpha` seal against a source reading `alpha`: a false positive in the one comparison
// that exists to catch forgeries. Markdown's own syntax classes are ASCII, so they are written out.
const QUOTE_PREFIX = /^>[ \t]?/
const quoteSpan = run => run.lines.map(l => l.live.replace(QUOTE_PREFIX, '')).join('\n')

// EVERY MEMBER OF THE POPULATION IS A SPAN WITH ONE TERMINAL STATE. The first version returned
// `quotes[]` for marked blocks and pushed everything else into a global diagnostic list, so a
// consumer reading `quotes[]` saw `sealed: true` on a block the scan had separately rejected as
// structurally unsupported — two answers about one span, which is what a graph would have inherited.
// Nothing here is a boolean combination a caller has to reassemble.
export const SPAN_STATES = [
  'sealed', 'mismatch', 'empty', 'unmarked', 'malformed-marker', 'unsupported-structure',
  'source-unavailable', 'unresolved', 'binary-cold-debt'
]
const SEALABLE = new Set(['sealed'])

export function scanQuotedMaterial (materialDir, { trustedRoot, materialsRoot } = {}) {
  const convertedPath = `${materialDir}/converted.md`
  const materialId = materialDir.replace(/[\\/]+$/, '').split(/[\\/]/).pop()
  let convertedBytes
  try {
    convertedBytes = readFileSync(convertedPath)
  } catch {
    return {
      state: 'unreadable',
      readable: false,
      materialId,
      spans: [],
      quotes: [],
      providers: new Map(),
      convertedDigest: null,
      diagnostics: [{ code: 'QUOTE-CONVERTED-UNREADABLE', detail: `${convertedPath} cannot be read` }]
    }
  }
  const source = convertedBytes.toString('latin1')
  const doc = scanMarkdown(source, { frontmatter: true })
  const convertedDigest = sha256(convertedBytes)
  const spans = []
  const structural = []

  // An unterminated fence, comment or frontmatter block does not just hide a quote — it means the
  // structure below it is unknown. Reported, never absorbed: a material could otherwise leave the
  // checked population by opening a fence and never closing it.
  for (const d of doc.diagnostics) {
    structural.push({ code: `QUOTE-${d.code.replace(/^MD_/, '')}`, line: d.line, detail: 'the document structure below this point is unknown, so its quotes cannot be judged' })
  }

  // REGIONS, not runs. One quotation is one region and carries one verdict; the previous shape let
  // `> alpha` seal while the `  > forged` beneath it became a separate refusal, so a consumer
  // reading the sealed spans got the quotation with its forged line removed.
  const { regions } = blockQuoteNodes(doc)
  const REJECT_CODE = {
    MD_QUOTE_LAZY: 'QUOTE-LAZY-CONTINUATION',
    MD_QUOTE_NESTED: 'QUOTE-NESTED-UNSUPPORTED',
    MD_QUOTE_INDENTED: 'QUOTE-INDENTED-UNSUPPORTED'
  }
  const refusalOf = region => ({
    code: REJECT_CODE[region.reason] ?? 'QUOTE-STRUCTURE-UNSUPPORTED',
    detail: 'this quotation renders as one block but part of it is outside the machine grammar, so the whole block is refused rather than half-checked'
  })
  // ONE UNSUPPORTED QUOTATION FAILS THE FILE. Region-level refusal still let the *other* quotes in
  // the same file seal, and a container form this grammar cannot segment means the population
  // itself is not trustworthy — a `- > alpha` the machine misread as two regions could equally be
  // hiding a third. Rather than growing a container model, the narrow grammar stays narrow and the
  // whole `converted.md` is structural-invalid: no quote in it seals until the shape is rewritten.
  const fileRefused = regions.some(r => !r.admitted)

  // ONE SNAPSHOT PER PROVIDER, keyed by CANONICAL material id. `self` and the material's own id name
  // one provider; keying on the marker's spelling read the same directory twice and could put two
  // generations of it in a single result.
  const providers = new Map()
  const providerOf = id => {
    if (!providers.has(id)) {
      const dir = id === materialId ? materialDir : `${materialsRoot}/${id}`
      providers.set(id, readRawSources(dir, { trustedRoot }))
    }
    return providers.get(id)
  }

  const markers = standaloneComments(doc)
    .map(c => ({ comment: c, parsed: parseMarkerComment(c.body) }))
    .filter(x => x.parsed !== null)

  const used = new Set()
  for (const { comment, parsed } of markers) {
    const run = regions.find(r => !used.has(r) && r.start > comment.end &&
      !/[^ \t\r\n]/.test(source.slice(comment.end, r.start)))
    const span = {
      kind: 'quote',
      state: null,
      range: run === undefined ? { start: comment.start, end: comment.end } : { start: run.start, end: run.end },
      line: comment.line,
      text: run === undefined ? '' : quoteSpan(run),
      marker: { attrs: parsed.attrs, valid: parsed.valid, errors: parsed.errors, range: { start: comment.start, end: comment.end } },
      attrs: parsed.attrs,
      resolved: null,
      providerSnapshot: null,
      sealed: false,
      mechanicallyCheckable: parsed.attrs.mode === 'verbatim',
      coldDebt: false,
      convertedDigest,
      diagnostics: []
    }
    spans.push(span)
    const settle = (state, d) => { span.state = state; if (d !== undefined) span.diagnostics.push(d) }
    if (run === undefined) {
      settle('malformed-marker', { code: 'QUOTE-MARKER-ORPHAN', detail: 'a marker is not followed by a quote block, so it seals nothing' })
      continue
    }
    used.add(run)
    if (!run.admitted) { settle('unsupported-structure', refusalOf(run)); continue }
    if (!parsed.valid) { settle('malformed-marker'); span.diagnostics.push(...parsed.errors); continue }
    // `self` and this material's own id are ONE provider. Accepting both spellings read the same
    // directory twice and put two snapshots of one material in a single scan.
    // CANONICAL COMPARISON. `m1` and `m001` are one material to every other reader in this runtime,
    // so comparing the marker's spelling literally let `m1` inside `m001` become a second provider —
    // one directory, two snapshots, and a self-reference that slipped past the self-by-id refusal.
    const askedId = parsed.attrs.source === 'self' ? materialId : canonId(parsed.attrs.source)
    if (askedId === null) {
      settle('malformed-marker', { code: 'QUOTE-SOURCE-INVALID', detail: `source '${parsed.attrs.source}' is not a canonical material id` })
      continue
    }
    if (parsed.attrs.source !== 'self' && askedId === canonId(materialId)) {
      settle('malformed-marker', { code: 'QUOTE-SOURCE-SELF-BY-ID', detail: `source '${parsed.attrs.source}' is this material; write source=self so one provider has one address` })
      continue
    }
    // AN EMPTY SPAN IS NOT A QUOTE. `includes('')` is true of every string, so a bare `>` sealed
    // against anything at all — the strongest possible false positive, and it passed silently.
    if (wsnorm(span.text) === '') {
      settle('empty', { code: 'QUOTE-SPAN-EMPTY', detail: 'the quote block has no content, so there is nothing to compare' })
      continue
    }
    if (fileRefused) {
      settle('unsupported-structure', { code: 'QUOTE-FILE-STRUCTURE-UNSUPPORTED', detail: 'another quotation in this file is outside the machine grammar, so no quote in it is sealed until that shape is rewritten' })
      continue
    }

    const providerId = askedId
    const raw = providerOf(providerId)
    if (raw.state !== 'complete') {
      // Distinct codes, because "this material has no raw source" and "its source set is aliased"
      // are different repairs. Collapsing them told every case to look at the same thing.
      const code = raw.state === 'empty' ? 'QUOTE-SOURCE-ABSENT' : raw.state === 'unreadable' ? 'QUOTE-SOURCE-UNREADABLE' : raw.state === 'unstable' ? 'QUOTE-SOURCE-UNSTABLE' : 'QUOTE-SOURCE-INVALID-SET'
      settle('source-unavailable', { code, detail: `the raw source set for '${providerId}' is '${raw.state}', so this quote cannot be checked` })
      continue
    }
    const resolved = resolveRawSource(raw, parsed.attrs.file ?? null)
    if (!resolved.ok) {
      settle('unresolved', {
        code: resolved.code === 'RAW-SOURCE-AMBIGUOUS' ? 'QUOTE-SOURCE-AMBIGUOUS' : 'QUOTE-SOURCE-UNRESOLVED',
        detail: resolved.detail ?? `address did not resolve (${resolved.code})`
      })
      continue
    }
    const bytes = raw.bytesOf(resolved.entry.name)
    const content = classifyContent(bytes)
    // The SNAPSHOT OBJECT, not just its digest: two quotes on one provider must hold the same
    // object, which is what proves the scan read it once. Equal digests would also be true of two
    // separate reads that happened to agree.
    span.providerSnapshot = raw
    span.resolved = {
      material: providerId,
      file: resolved.entry.name,
      entryDigest: resolved.entry.digest,
      providerTreeDigest: raw.treeDigest,
      content: content.kind
    }
    if (parsed.attrs.mode === 'not-checkable') {
      if (content.kind !== 'binary') {
        settle('mismatch', { code: 'QUOTE-NOT-CHECKABLE-ON-TEXT', detail: `${resolved.entry.name} is text, so this quote must be compared, not excused` })
        continue
      }
      span.coldDebt = true
      settle('binary-cold-debt')
      continue
    }
    if (content.kind === 'binary') {
      settle('mismatch', { code: 'QUOTE-BINARY-NOT-VERBATIM', detail: `${resolved.entry.name} is binary (${content.reason}); a verbatim claim cannot be compared against it` })
      continue
    }
    if (wsnorm(bytes.toString('latin1')).includes(wsnorm(span.text))) {
      span.sealed = true
      settle('sealed')
    } else {
      settle('mismatch', { code: 'QUOTE-SPAN-MISSING', detail: `the quoted span is not present in ${resolved.entry.name} (laundering risk)` })
    }
  }

  // THE POPULATION RULE. An unmarked blockquote is the escape hatch: delete the marker and the claim
  // leaves the checked set while still reading as a quotation. It is a span with a range like every
  // other member, so a caller never has to find it again.
  for (const run of regions) {
    if (used.has(run)) continue
    // An unmarked region that also broke the grammar is UNSUPPORTED, not unmarked: telling a writer
    // to add a marker to a block this grammar refuses would send them in a circle.
    if (!run.admitted) {
      spans.push({
        kind: 'blockquote',
        state: 'unsupported-structure',
        range: { start: run.start, end: run.end },
        line: run.lines[0].number,
        text: quoteSpan(run),
        marker: null,
        resolved: null,
        sealed: false,
        convertedDigest,
        diagnostics: [refusalOf(run)]
      })
      continue
    }
    spans.push({
      kind: 'blockquote',
      state: 'unmarked',
      range: { start: run.start, end: run.end },
      line: run.lines[0].number,
      text: quoteSpan(run),
      marker: null,
      resolved: null,
      sealed: false,
      convertedDigest,
      diagnostics: [{ code: 'QUOTE-UNMARKED', detail: 'a quote block carries no wd:quote marker, so nothing checks it' }]
    })
  }

  spans.sort((a, b) => a.range.start - b.range.start)
  // NOTHING REFUSED MAY ALSO BE SEALED. The previous shape let one block carry `sealed: true` in
  // one field and a structural rejection in another, so the invariant is enforced here rather than
  // trusted to every branch above. NOT KILLABLE BY A FIXTURE, and said so plainly: no branch sets
  // `sealed` except the one that settles `sealed`, so removing this line changes no output today.
  // It is the guard that keeps that true the next time a branch is added.
  for (const span of spans) if (!SEALABLE.has(span.state)) span.sealed = false
  return {
    state: structural.length > 0 || fileRefused ? 'invalid' : 'complete',
    readable: true,
    materialId,
    spans,
    // A VIEW of `spans`, never a separate population — the two disagreeing is the defect removed.
    quotes: spans.filter(s => s.kind === 'quote'),
    providers,
    convertedDigest,
    // Diagnostics carry the span's RANGE as well as its line, so a consumer building a
    // `quote-attribution-required` payload has converted digest plus exact offsets without going
    // back to the scanner.
    diagnostics: [...structural, ...spans.flatMap(s => s.diagnostics.map(d => ({ ...d, line: s.line, range: s.range })))],
    document: doc
  }
}
