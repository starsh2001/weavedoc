// Property checks for the v3 quote marker grammar, scanner and direct raw-source resolver.
//
// WRITTEN BEFORE THE MODULE (plan Phase 1: "red-first fixture로 고정한다"). Every assertion here
// failed with "Cannot find module" on its first run; the module was then written until they passed.
//
// The contract this pins (plan section 5.2): a machine-authored verbatim claim carries a marker, the
// marker resolves to a REGULAR raw source and stops there, and the span is compared as bytes. The
// dangerous direction is not a false alarm — it is a quote that reads as sealed while nothing
// checked it, so every "cannot tell" here has to land on fail-closed.
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseQuoteMarkers, scanQuotedMaterial } from '../.weavedoc/bin/lib/quote-marker-model.mjs'

let cases = 0
let groups = 0
const check = (condition, message, input = '') => {
  cases++
  assert.ok(condition, `${message}\nINPUT=${JSON.stringify(input)}`)
}

// GRAMMAR FIXTURES GO THROUGH THE FILE DOMAIN. converted.md is read as latin1 bytes, so a marker
// handed to the parser as a JS Unicode string never exercises the decode boundary — which is how a
// Korean `file=` could fail to resolve and a `location` could come back as three Latin-1 code
// points while every assertion passed. Encode the way the reader will see it.
const asFile = text => Buffer.from(text, 'utf8').toString('latin1')
const markersOf = text => parseQuoteMarkers(asFile(text))

const root = mkdtempSync(join(tmpdir(), 'wd-quote-'))
const mine = join(root, 'materials')
mkdirSync(mine, { recursive: true })
const material = (id, files) => {
  const d = join(mine, id)
  mkdirSync(d, { recursive: true })
  for (const [name, body] of Object.entries(files)) writeFileSync(join(d, name), body)
  return d
}
// Every scan is rooted the same way: the material being read, inside the trusted materials root.
const scan = (id) => scanQuotedMaterial(join(mine, id), { trustedRoot: mine, materialsRoot: mine })
const codes = r => r.diagnostics.map(d => d.code).sort()

try {
  // ---- 1. the marker grammar --------------------------------------------------------------------
  groups++
  {
    const ok = markersOf('<!-- wd:quote source=self mode=verbatim location="§4" -->')
    check(ok.markers.length === 1, 'a well-formed marker did not parse', ok)
    const m = ok.markers[0]
    check(m.attrs.source === 'self' && m.attrs.mode === 'verbatim' && m.attrs.location === '§4',
      'attribute values did not survive parsing', m.attrs)
    check(m.valid, 'a well-formed marker was rejected', m.errors)

    // Default mode is verbatim: an omitted mode must not mean "unchecked".
    check(markersOf('<!-- wd:quote source=self -->').markers[0].attrs.mode === 'verbatim',
      'an omitted mode did not default to verbatim')

    // A comment that is not a marker is not a marker — and must not be mistaken for a broken one.
    check(markersOf('<!-- an ordinary note -->').markers.length === 0, 'an ordinary comment parsed as a marker')
    check(markersOf('<!-- wd:quotefoo source=self -->').markers.length === 0, 'a near-miss keyword parsed as a marker')

    // FAIL-CLOSED ON ANYTHING UNRECOGNISED. A typo'd attribute silently ignored is the
    // declared-but-unread class this format keeps closing: the writer believes they constrained
    // the claim and nothing did.
    for (const bad of [
      '<!-- wd:quote -->',
      '<!-- wd:quote mode=verbatim -->',
      '<!-- wd:quote source=self sourced=self -->',
      '<!-- wd:quote source=self source=m001 -->',
      '<!-- wd:quote source=self mode=exact -->',
      '<!-- wd:quote source= -->',
      '<!-- wd:quote source=self file= -->',
      '<!-- wd:quote source=M001 -->',
      '<!-- wd:quote source=m1a -->'
    ]) {
      const r = parseQuoteMarkers(bad)
      check(r.markers.length === 1 && !r.markers[0].valid, `a malformed marker was accepted: ${bad}`, r.markers[0])
    }

    // `source=tNNN` is refused BY NAME: a truth proving a material that proves the truth is the
    // circular laundering the plan forbids, and it deserves its own diagnosis rather than
    // "unknown source".
    const t = markersOf('<!-- wd:quote source=t001 -->').markers[0]
    check(!t.valid && t.errors.some(e => e.code === 'QUOTE-SOURCE-TRUTH'),
      'a truth-sourced marker was not named as the cycle it is', t.errors)

    // Quoted values may hold spaces; bare values may not run past the marker.
    check(markersOf('<!-- wd:quote source=self location="chapter 4, line 2" -->').markers[0].attrs.location === 'chapter 4, line 2',
      'a quoted attribute value lost its spaces')
    check(markersOf('<!--wd:quote source=self-->').markers[0].valid, 'a marker without inner padding was rejected')
  }

  // ---- 2. marker, quote block, and the population that must carry one ---------------------------
  groups++
  {
    material('m001', { 'source.md': 'alpha line\nbeta line\n' })
    const doc = [
      '# converted',
      '',
      '<!-- wd:quote source=self mode=verbatim -->',
      '> alpha line',
      '',
      'ordinary prose',
      ''
    ].join('\n')
    writeFileSync(join(mine, 'm001', 'converted.md'), doc)
    const r = scan('m001')
    check(r.quotes.length === 1, 'the marked quote block was not found', r.quotes)
    check(r.quotes[0].sealed === true, 'a verbatim quote present in the source did not seal', r.quotes[0])
    check(r.diagnostics.length === 0, 'a clean material produced diagnostics', r.diagnostics)

    // AN UNMARKED BLOCKQUOTE IS THE ESCAPE HATCH, so it is the population rule: removing the marker
    // must not remove the claim from the checked set.
    writeFileSync(join(mine, 'm001', 'converted.md'), '# c\n\n> alpha line\n')
    check(codes(scan('m001')).includes('QUOTE-UNMARKED'), 'an unmarked blockquote passed unnoticed', scan('m001').diagnostics)

    // A marker with no quote after it is equally broken: it claims a seal over nothing.
    writeFileSync(join(mine, 'm001', 'converted.md'), '# c\n\n<!-- wd:quote source=self -->\n\nprose\n')
    check(codes(scan('m001')).includes('QUOTE-MARKER-ORPHAN'), 'a marker with no quote block was accepted', scan('m001').diagnostics)
  }

  // ---- 3. one Markdown reader, not a second one -------------------------------------------------
  groups++
  {
    material('m002', { 'source.md': 'real line\n' })
    // A fenced EXAMPLE of a marker and a quote is documentation, not a claim: the shared scanner
    // owns fence precedence, so this module must not re-decide it with a regex.
    writeFileSync(join(mine, 'm002', 'converted.md'), [
      '# c', '', '```md', '<!-- wd:quote source=self -->', '> not a real quote', '```', '',
      '<!-- wd:quote source=self -->', '> real line', ''
    ].join('\n'))
    const r = scan('m002')
    check(r.quotes.length === 1 && r.quotes[0].text.includes('real line'),
      'a fenced example was counted as a live quote', r.quotes.map(q => q.text))
    check(r.diagnostics.length === 0, 'the fenced example produced a diagnostic', r.diagnostics)
  }

  // ---- 4. the resolver ends at a regular raw source ---------------------------------------------
  groups++
  {
    material('m010', { 'source.md': 'from m010\n' })
    material('m011', {
      'source.a': 'first\n',
      'source.b': 'second\n',
      'converted.md': '# c\n\n<!-- wd:quote source=self -->\n> first\n'
    })
    // Several raw sources and no `file=`: the resolver must not choose.
    check(codes(scan('m011')).includes('QUOTE-SOURCE-AMBIGUOUS'), 'a quote resolved against one of several sources', scan('m011').diagnostics)
    writeFileSync(join(mine, 'm011', 'converted.md'), '# c\n\n<!-- wd:quote source=self file=source.a -->\n> first\n')
    check(scan('m011').quotes[0].sealed, 'an explicit file address did not resolve')

    // Cross-material attribution resolves at THAT material's raw root and stops there.
    material('m012', { 'converted.md': '# c\n\n<!-- wd:quote source=m010 -->\n> from m010\n' })
    check(scan('m012').quotes[0].sealed, 'a cross-material quote did not seal against the provider raw source')
    // ...and a provider that does not exist is fail-closed, never "absent so fine".
    writeFileSync(join(mine, 'm012', 'converted.md'), '# c\n\n<!-- wd:quote source=m999 -->\n> from m010\n')
    check(codes(scan('m012')).some(c => c.startsWith('QUOTE-')), 'a missing provider material produced no diagnostic', scan('m012').diagnostics)
    check(!scan('m012').quotes[0].sealed, 'a quote against a missing provider was reported sealed')

    // converted.md is never a source, even when named explicitly: that is the hop this seal exists
    // to add, and letting a quote prove itself against the file it lives in closes the loop.
    writeFileSync(join(mine, 'm010', 'converted.md'), '# c\n\n<!-- wd:quote source=self file=converted.md -->\n> from m010\n')
    check(!scan('m010').quotes[0].sealed, 'converted.md was accepted as a raw source')
  }

  // ---- 5. the comparison is bytes ---------------------------------------------------------------
  groups++
  {
    // A byte sequence that is NOT valid UTF-8. Decoding first would map both the source and the
    // quote onto U+FFFD and call two different byte strings equal — the forgery the truth seal was
    // hardened against, and the same rule has to hold one hop earlier.
    const cp949 = Buffer.from([0xb0, 0xa1, 0xb0, 0xa2, 0x0a])
    const forged = Buffer.from([0xb0, 0xa3, 0xb0, 0xa4, 0x0a])
    material('m020', {})
    writeFileSync(join(mine, 'm020', 'source.md'), cp949)
    writeFileSync(join(mine, 'm020', 'converted.md'),
      Buffer.concat([Buffer.from('# c\n\n<!-- wd:quote source=self -->\n> ', 'latin1'), forged]))
    check(!scan('m020').quotes[0].sealed, 'two different byte strings compared equal — the quote was decoded before comparison')
    writeFileSync(join(mine, 'm020', 'converted.md'),
      Buffer.concat([Buffer.from('# c\n\n<!-- wd:quote source=self -->\n> ', 'latin1'), cp949]))
    check(scan('m020').quotes[0].sealed, 'an exact byte match did not seal')

    // Whitespace is normalised the way the existing seal does: a re-wrapped quote is the same quote.
    material('m021', { 'source.md': 'one   two\tthree\n' })
    writeFileSync(join(mine, 'm021', 'converted.md'), '# c\n\n<!-- wd:quote source=self -->\n> one two\n> three\n')
    check(scan('m021').quotes[0].sealed, 'whitespace normalisation does not match the existing seal rule')
    writeFileSync(join(mine, 'm021', 'converted.md'), '# c\n\n<!-- wd:quote source=self -->\n> one two four\n')
    check(!scan('m021').quotes[0].sealed, 'a quote absent from the source was sealed')
  }

  // ---- 6. binary is named, never passed ---------------------------------------------------------
  groups++
  {
    // Binary is decided by CONTENT, not by extension: a `.md` holding NULs is binary and a `.bin`
    // holding text is not. Naming it by extension would let a rename change a verdict.
    material('m030', {})
    writeFileSync(join(mine, 'm030', 'source.md'), Buffer.from([0x00, 0x01, 0x02, 0x41, 0x42]))
    writeFileSync(join(mine, 'm030', 'converted.md'), '# c\n\n<!-- wd:quote source=self mode=verbatim -->\n> AB\n')
    const v = scan('m030')
    check(!v.quotes[0].sealed && codes(v).includes('QUOTE-BINARY-NOT-VERBATIM'),
      'a verbatim claim against a binary source was allowed', v.diagnostics)

    // A BINARY WITH NO NUL. Testing NUL alone and calling the result "binary" left `01 02 03 41 42`
    // classified as text, so a verbatim quote of `AB` sealed against it — measured.
    material('m032', {})
    writeFileSync(join(mine, 'm032', 'source.md'), Buffer.from([1, 2, 3, 0x41, 0x42]))
    writeFileSync(join(mine, 'm032', 'converted.md'), ['# c', '', '<!-- wd:quote source=self -->', '> AB', ''].join('\n'))
    const noNul = scan('m032')
    check(!noNul.quotes[0].sealed && codes(noNul).includes('QUOTE-BINARY-NOT-VERBATIM'),
      'a binary source with no NUL byte was treated as text', noNul.diagnostics)

    // not-checkable is allowed ONLY on a source the resolver judged binary, and it never reads as
    // sealed — it opens cold-verification debt instead.
    writeFileSync(join(mine, 'm030', 'converted.md'), '# c\n\n<!-- wd:quote source=self mode=not-checkable file=source.md location="p.1" -->\n> AB\n')
    const nc = scan('m030')
    check(nc.quotes[0].sealed === false && nc.quotes[0].mechanicallyCheckable === false,
      'a not-checkable quote reported as sealed', nc.quotes[0])
    check(nc.quotes[0].coldDebt === true, 'a not-checkable quote opened no cold-verification debt', nc.quotes[0])

    // ...and it may NOT be used to escape a text mismatch. This is the downgrade path the plan
    // names explicitly: a quote that simply does not match must not become "not checkable".
    material('m031', { 'source.md': 'plain text\n' })
    writeFileSync(join(mine, 'm031', 'converted.md'), '# c\n\n<!-- wd:quote source=self mode=not-checkable file=source.md location="p.1" -->\n> anything\n')
    check(codes(scan('m031')).includes('QUOTE-NOT-CHECKABLE-ON-TEXT'),
      'not-checkable was accepted on a text source, which is the laundering path', scan('m031').diagnostics)

    // ...and without an explicit file=, because an unverifiable claim is the one place a reader has
    // nothing but the address, so it may not be inferred from "there was only one source".
    writeFileSync(join(mine, 'm030', 'converted.md'),
      ['# c', '', '<!-- wd:quote source=self mode=not-checkable location="p.1" -->', '> AB', ''].join('\n'))
    check(codes(scan('m030')).includes('QUOTE-FILE-REQUIRED'), 'not-checkable was accepted with no explicit file', scan('m030').diagnostics)

    // not-checkable without a location is incomplete: the human attribution is the only thing a
    // cold reviewer has to go on.
    writeFileSync(join(mine, 'm030', 'converted.md'), '# c\n\n<!-- wd:quote source=self mode=not-checkable -->\n> AB\n')
    check(codes(scan('m030')).includes('QUOTE-LOCATION-REQUIRED'), 'not-checkable was accepted with no location', scan('m030').diagnostics)
  }

  // ---- 7. unreadable is never absent ------------------------------------------------------------
  groups++
  {
    material('m040', { 'converted.md': '# c\n\n<!-- wd:quote source=self -->\n> anything\n' })
    // No raw source at all: the claim cannot be checked, and "nothing to check" must not read as
    // "checked and clean".
    const none = scan('m040')
    check(!none.quotes[0].sealed && none.diagnostics.length > 0, 'a quote with no raw source at all was silently fine', none)
    // A material whose source set is not `complete` yields no seal either — the raw model's state
    // is the gate, and this module does not second-guess it.
    material('m041', { 'source.md': 'x\n', 'converted.md': '# c\n\n<!-- wd:quote source=self -->\n> x\n' })
    mkdirSync(join(mine, 'm041', 'source.bad'))
    const bad = scan('m041')
    check(!bad.quotes[0].sealed, 'a quote sealed against an invalid source set', bad.quotes[0])
    // THE CODE, not just the absence of a seal. The resolver refuses a non-`complete` model too, so
    // deleting this scanner's own state gate still leaves the quote unsealed — measured, the
    // mutation survived on `!sealed` alone. But the two refusals are different facts for a reader:
    // "the source set could not be read" is not "the address did not resolve", and a diagnostic
    // that quietly changes meaning is the drift this suite exists to catch.
    check(codes(bad).includes('QUOTE-SOURCE-INVALID-SET'),
      'an aliased/irregular source set was not distinguished from an unresolved address', bad.diagnostics)
    // EACH RAW STATE GETS ITS OWN CODE. Collapsing them told every case to go look at the same
    // thing, when "this material has no raw source" and "its source set is aliased" are different
    // repairs. The absent case is checked here alongside the invalid one.
    material('m042', { 'converted.md': ['# c', '', '<!-- wd:quote source=self -->', '> x', ''].join('\n') })
    check(codes(scan('m042')).includes('QUOTE-SOURCE-ABSENT'),
      'a material with no raw source at all was not named as absent', scan('m042').diagnostics)
  }

  // ---- 8. the population has no exits -----------------------------------------------------------
  groups++
  {
    // EVERY ONE OF THESE WAS A HOLE, and they were one defect: the module matched `>` against raw
    // lines and `<!-- wd:quote` against raw text instead of taking structure from the shared
    // scanner. Each escape is pinned by the shape that used it.
    const L = (...lines) => lines.join('\n') + '\n'
    material('m050', { 'source.md': 'alpha\n' })
    const at = body => { writeFileSync(join(mine, 'm050', 'converted.md'), body); return scan('m050') }

    // An unterminated fence hid everything below it: quotes=0 and NO diagnostic, so a material
    // could leave the checked population by opening a fence and never closing it.
    const fenced = at(L('# c', '```md', '<!-- wd:quote source=self -->', '> alpha'))
    check(codes(fenced).some(c => c.startsWith('QUOTE-UNTERMINATED')),
      'an unterminated fence hid the rest of the document silently', fenced.diagnostics)

    // A lazy continuation renders as ONE quote. Sealing only the first line while a reader sees two
    // is the laundering this seal exists to stop.
    const lazy = at(L('# c', '', '<!-- wd:quote source=self -->', '> alpha', 'forged continuation'))
    check(codes(lazy).includes('QUOTE-LAZY-CONTINUATION'), 'a lazy continuation was silently dropped', lazy.diagnostics)
    check(!lazy.quotes[0].sealed, 'a quote whose rendered span includes unchecked text was sealed', lazy.quotes[0])

    // A quote inside a list item was invisible to every population.
    const listed = at(L('# c', '', '- > alpha'))
    check(codes(listed).includes('QUOTE-NESTED-UNSUPPORTED'), 'a list-nested quote was invisible', listed.diagnostics)

    // A quote archived inside a comment is not a live quote — and must not be reported as unmarked.
    const archived = at(L('# c', '', '<!-- archive', '> alpha', '-->'))
    check(archived.quotes.length === 0 && !codes(archived).includes('QUOTE-UNMARKED'),
      'a commented-out quote was treated as live', archived.diagnostics)

    // A marker is only a marker when it owns its line: `prose <!-- … --> prose` declared a seal from
    // inside a sentence, and a marker nested in an outer comment was read as live.
    const inline = at(L('# c', '', 'prose <!-- wd:quote source=self --> prose', '> alpha'))
    check(inline.quotes.length === 0 && codes(inline).includes('QUOTE-UNMARKED'),
      'a marker embedded in a sentence sealed a quote', inline.diagnostics)
    // Prose BEFORE the marker with nothing after it: the previous fixture had prose on both sides,
    // so the "nothing between marker and quote" rule rejected it anyway and the standalone rule was
    // never the thing under test.
    const leading = at(L('# c', '', 'prose <!-- wd:quote source=self -->', '> alpha'))
    check(leading.quotes.length === 0 && codes(leading).includes('QUOTE-UNMARKED'),
      'a marker with prose before it on the same line sealed a quote', leading.diagnostics)
    const nested = at(L('# c', '', '<!-- outer <!-- wd:quote source=self --> -->', '> alpha'))
    // NOT `!some(sealed)` — that is vacuously true when there are no quotes at all, which is how a
    // check passes while measuring nothing. The quote must be present in the population and UNSEALED.
    check(nested.quotes.length === 0 && codes(nested).includes('QUOTE-UNMARKED'),
      'a marker nested inside another comment was treated as live', nested.diagnostics)

    // AN EMPTY SPAN SEALED AGAINST ANYTHING: `includes('')` is true of every string, so a bare `>`
    // was the strongest possible false positive and it passed in silence.
    for (const empty of ['>', '>   ', '>\n>  ']) {
      const r = at(L('# c', '', '<!-- wd:quote source=self -->', empty))
      check(!r.quotes[0].sealed && r.quotes[0].diagnostics.some(d => d.code === 'QUOTE-SPAN-EMPTY'),
        `an empty quote block sealed: ${JSON.stringify(empty)}`, r.quotes[0])
    }
  }

  // ---- 9. human text survives the byte domain ---------------------------------------------------
  groups++
  {
    // THROUGH A REAL FILE, not a JS string handed to the parser. converted.md is read as latin1, so
    // `file=` and `location=` arrive as bytes and must be decoded before they mean anything: the
    // first version could not resolve a Korean filename and returned `location` as mojibake, while
    // the grammar fixtures passed because they never crossed this boundary.
    const d = material('m060', {})
    writeFileSync(join(d, 'source.원본'), Buffer.from('한글 본문\n', 'utf8'))
    writeFileSync(join(d, 'source.md'), Buffer.from('other\n', 'utf8'))
    writeFileSync(join(d, 'converted.md'), Buffer.from(
      '# c\n\n<!-- wd:quote source=self file="source.원본" location="장4" -->\n> 한글 본문\n', 'utf8'))
    const r = scan('m060')
    check(r.quotes[0].resolved?.file === 'source.원본', 'a Korean file= did not resolve to the file it names', r.quotes[0])
    check(r.quotes[0].marker.attrs.location === '장4', 'a Korean location came back as bytes rather than text', r.quotes[0].marker.attrs)
    check(r.quotes[0].sealed, 'a Korean verbatim quote did not seal against its own source', r.diagnostics)

    // An attribute that is not valid UTF-8 is a typed error, not a best-effort string: it is about
    // to be compared against a filename.
    writeFileSync(join(d, 'converted.md'), Buffer.concat([
      Buffer.from('# c\n\n<!-- wd:quote source=self file="', 'utf8'), Buffer.from([0xff, 0xfe]),
      Buffer.from('" -->\n> 한글 본문\n', 'utf8')]))
    check(codes(scan('m060')).includes('QUOTE-ATTR-ENCODING'),
      'an attribute that is not valid UTF-8 was accepted', scan('m060').diagnostics)
  }

  // ---- 10. one snapshot per provider, and the addresses a graph will need ------------------------
  groups++
  {
    material('m070', { 'source.md': 'shared line\n' })
    material('m071', {
      'converted.md': ['# c', '', '<!-- wd:quote source=m070 -->', '> shared line', '',
        '<!-- wd:quote source=m070 -->', '> shared line', ''].join('\n')
    })
    const r = scan('m071')
    check(r.quotes.length === 2 && r.quotes.every(q => q.sealed), 'two quotes on one provider did not both seal', r.diagnostics)
    // ONE read for the whole scan: calling readRawSources per marker let two quotes naming one
    // provider be judged against two generations of its bytes inside a single result.
    check(r.providers.size === 1 && r.providers.has('m070'), 'the provider registry holds more than one entry', [...r.providers.keys()])
    // IDENTITY, not equality. Re-reading per marker still yields one registry entry and equal
    // digests, so only the object reference distinguishes one snapshot from two that agree.
    check(r.quotes[0].providerSnapshot === r.providers.get('m070') &&
      r.quotes[1].providerSnapshot === r.quotes[0].providerSnapshot,
    'two quotes on one provider were judged against different snapshot objects')
    check(r.quotes[0].resolved.providerTreeDigest === r.quotes[1].resolved.providerTreeDigest,
      'two quotes on one provider saw different tree digests')

    // The addresses the dependency graph and the confirmation projection will consume, so neither
    // has to walk or parse anything again.
    const q = r.quotes[0]
    check(/^[0-9a-f]{64}$/.test(q.resolved.entryDigest) && /^[0-9a-f]{64}$/.test(q.resolved.providerTreeDigest) &&
      /^[0-9a-f]{64}$/.test(q.convertedDigest), 'a digest in the published result is not a sha256', q.resolved)
    check(q.range.end > q.range.start && q.marker.range.end > q.marker.range.start &&
      q.marker.range.end <= q.range.start, 'the marker and quote byte ranges are not ordered source spans', { m: q.marker.range, q: q.range })
    check(q.resolved.content === 'text', 'the resolved source did not carry its content classification', q.resolved)
  }

  console.log(`quote-marker-properties: groups=${groups} cases=${cases}`)
} finally {
  rmSync(root, { recursive: true, force: true })
}
