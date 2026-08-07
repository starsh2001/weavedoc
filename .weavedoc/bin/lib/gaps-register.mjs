// weavedoc — THE register reader for gaps.md's two sections.
//
// WHY IT LIVES HERE. It was scanRegister(), private inside cmd-validate, and v0.5.5 gave the mine a
// second consumer (`status --open`) that reimplemented "what counts as an entry" from the LOOSER
// rule `weavedoc gaps` uses for its accepted tally — the PREFIX rule validate abandoned in v0.5.4
// review #9. The result was one gaps.md with two answers: validate blocked on an open gap that
// the listing reported as "nothing is waiting" (external review, measured on
// `- [<kind>] album — six-vs-five`). Extracting it is the repair, and it is a MOVE — the state
// machine below is the reviewed one, character for character, with one addition: it now returns
// the entry LINES it counted, because the second consumer needs to print what the first counts.
//
// BYTE DOMAIN. Callers pass latin1 text. `strip()`'s bracket class is a class of BYTES (see below),
// so the same input decoded as UTF-8 would judge stubs differently — the reader and its callers
// must share one domain, and validate's is bytes.
import { splitLines, TAG_SEP, TAG_LEAD as LEAD } from './core.mjs'
import { sectionAll } from './sections.mjs'

// The bracket class is spelled in BYTES, and it is a class of BYTES rather than of characters —
// which is what `sed -E 's/[…—:·,.-]+//g'` means under LC_ALL=C, where every byte of a multibyte
// member joins the class on its own. Written with the characters it matched nothing at all
// (validate is byte-domain), and a template stub stopped reading as a stub: two pass_completeness_*
// cases went red the moment the domain changed.
const strip = s => s.replace(/\{[^{}]*\}/g, '').replace(/<[^<>]*>/g, '').replace(/[[\](){}<>\xe2\x80\x94\xc2\xb7:,.-]+/g, '').replace(/[ \t]+/g, '')

// "Is this bullet an untouched template line?" — the register's rule, exported because questions.md
// needs the SAME answer and the only other implementation available (review.mjs's isNoise) carries
// a known limit that inverts in a listing: prose holding a `<…>` token reads as a placeholder
// there, which is safe for the gate and a silent drop for a report. A bullet is a stub only when
// its bracket slot is a placeholder AND what follows it is empty once template tokens are removed.
// "Does this entry's own line carry no content?" — the one condition under which an indented line
// below it is FOLDED INTO it rather than dropped as detail. Narrow on purpose (v0.5.7): folding
// every continuation made `- [enumeration] 앨범` + `  - 근거: …` render as one line wearing two
// entry tokens, and the Human queue deliberately drops an entry's sub-bullets as detail
// (acct_openlist_subbullets_stay_detail). The defect being repaired is only the other shape — an
// entry whose content lives ENTIRELY on its continuations, listed as a bare `- [declared]` that
// tells the reader nothing. `tag` is the ledger's own prefix pattern (kind slot, state slot,
// state+ownership tags): what remains after it is the entry's content.
// gaps.md's entry prefix: the bullet plus its `[kind]` slot. Exported spellings for the twin
// ledgers live with their readers, because each ledger's tag is its own grammar.
export const ENTRY_TAG = /^- \[[^\]]*\]/

// "Is there anything here once template tokens are removed?" — the question a CONTINUATION must
// answer before it may realize a held stub. The register has always asked it (`strip(grest) !== ''`
// at the realization branch); the twin ledgers realized on any non-blank line, so the shipped
// template's own second line (`  <where> — <what>`) turned a template into a reported waiting item
// (external review, v0.5.11).
export const hasContent = text => strip(text) !== ''

// THE LEADING STRIP IS TAG_SEP HERE TOO (v0.5.13). v0.5.11 widened the entry TESTS to the shared
// class and left these two at `[ \t]`, so a control-indented `- [open] [user-only]` was counted by
// status and accepted by validate and then listed WITHOUT its body — this function did not see a
// "tags only" line, so nothing folded. Same class, one layer under the one that was fixed.
// Imported as core's TAG_LEAD since v0.5.17: cmd-status.mjs needs the same lead to measure a
// bullet's indentation, and building it there from TAG_SEP would have been a second spelling of a
// constant that already had to be unified once.

export function emptyRemainder (line, tag) {
  const s = line.replace(LEAD, '')
  const m = tag.exec(s)
  if (m === null) return false
  return strip(s.slice(m[0].length)) === ''
}

// The general spelling, because each ledger's tag prefix is its own grammar (v0.5.10): a Human
// queue entry carries a state slot plus an optional ownership slot, and asking "is the remainder
// empty?" after only the FIRST bracket would call `- [{state}] [{ownership}]` a real entry whose
// content is "[{ownership}]". The tag regex names what to skip; the remainder decides after that.
export function stubLine (line, tag) {
  const s = line.replace(LEAD, '')
  if (!s.startsWith('- [') || !s.includes(']')) return false
  const kw = s.slice(3, s.indexOf(']'))
  if (!/^[<{]/.test(kw) || strip(kw) !== '') return false
  const m = tag.exec(s)
  if (m === null) return false
  return strip(s.slice(m[0].length)) === ''
}

export function stubEntry (line) {
  return stubLine(line, /^- \[[^\]]*\]/)
}

// STATE-BASED entry scan: a continuation is legal only AFTER a bullet — an indented line with no
// open entry above is prose the counter cannot see, not a continuation of nothing.
//
// ONE SCANNER, BOTH SECTIONS (§11 2026-08-05). It ran over '# Open' only, so '# Accepted' accepted
// anything — bare prose under it passed while FORMATS says the register grammar is fail-closed and
// "anything else blocks". A second, looser reader for the twin section is the two-parsers drift
// class itself, so there is one function and it is called twice.
// BOUNDARY, deliberate: this enforces the register GRAMMAR (bullets, continuations only under a
// bullet, no bare prose) — which is what the fail-closed sentence enumerates. It does NOT require
// an Accepted entry's `scope:`/`recheck:`/`as-of:` fields; that is the entry FORMAT, documented but
// never machine-enforced, and turning it into a gate could block mines written before the rule
// without a decision to do so.
//
// Returns: n (entries counted) · entries (the lines counted, in file order) · badline · badkind ·
// dblkind · unclosed. The diagnostics are validate's; `entries` is the listing's; `n` is both, and
// `n === entries.length` is the invariant that keeps them one answer (asserted by the suite).
export function scanRegister (gapsText, section, kindSet) {
  let n = 0; let badline = ''; let badkind = null; let dblkind = null; let unclosed = ''
  let inb = false; let gnoise = false; let gnoiseKind = ''; let gnoiseLine = ''
  const entries = []
  // Which entry a continuation line extends, or -1 — set ONLY for an entry whose own line carries
  // no content (emptyRemainder). A gap's content can live entirely on its continuations
  // (`- [declared]` / `  penalty cap의 근거가 필요함`), and the first build appended them only in
  // the placeholder-REALIZED branch, so such an entry was listed as a bare bullet and the reader
  // had to open the file after all (external review, v0.5.6). Counting was never wrong; only what
  // the reader was shown. Folding EVERY continuation was the first fix and it was too wide — see
  // emptyRemainder.
  let last = -1
  for (let gl of splitLines(sectionAll(gapsText, section))) {
    gl = gl.replace(/\r$/, '')
    if (!/[^ \t]/.test(gl)) { inb = false; last = -1; continue }
    const grest = gl.replace(/^[ \t]*/, '')
    // AN ENTRY OPENS AT COLUMN ZERO (v0.5.4, review #9). The indentation used to be stripped before
    // the bullet test, so every indented bullet opened an entry: an orphan `  - [declared] …` under
    // no parent counted as an accepted decision (rc 0), and a legitimate sub-bullet under a real
    // entry was read as a second entry and blocked for having no kind. Indented bullets are
    // CONTINUATIONS — they fall to the branch below, which already knows an entry must be open.
    if (gl.startsWith('- ')) {
      inb = true
      gnoise = false
      // THE BRACKET MUST CLOSE, and that is tested BEFORE anything classifies the bullet (v0.5.4,
      // review #8 P1-3). `- [{kind}` and `- [<kind>` reached the placeholder branch, where strip()
      // erased the unclosed opener along with the template word and left '' — so an entry with a
      // broken kind slot read as noise and validate said nothing (measured rc 0 under required +
      // a consecrated output). An opener with no ']' is not a kind, not a placeholder and not
      // prose: it is a malformed entry.
      if (grest.startsWith('- [') && !grest.includes(']')) {
        if (unclosed === '') unclosed = gl
      } else if (grest.startsWith('- [')) {
        const kw = grest.slice(3, grest.indexOf(']'))
        const after = grest.slice(grest.indexOf(']') + 1)
        // THE KIND SLOT IS A PLACEHOLDER ONLY IF THE WHOLE SLOT IS ONE (v0.5.4, review #9). This
        // was a PREFIX test — `- [` followed by `<` or `{` — so real words sharing the bracket with
        // a template token (`- [{kind} real-content]`, `- [<kind>real]`) rode through as noise and
        // drew no diagnostic. The slot is stripped now: what survives is real content, and real
        // content in the kind slot makes it a kind — judged by the vocabulary like any other.
        const kwStub = /^[<{]/.test(kw) && strip(kw) === ''
        if (kwStub) {
          // The bracket word rides along with the noise flag (review #7 P1-1): a bullet held as
          // noise can be REALIZED by a continuation below, and realization must carry the
          // placeholder kind into the vocabulary judgment — before that, the continuation branch
          // counted the entry and judged nothing.
          if (strip(after) === '') { gnoise = true; gnoiseKind = kw; gnoiseLine = gl }
          // A placeholder kind over a REAL body is an ENTRY whose kind is not in the vocabulary
          // (v0.5.4 cold review). A PURE stub stays what it was: noise — not an entry, not an
          // error — which keeps a freshly-initialised gaps.md green.
          else if (badkind === null) badkind = kw
        } else {
          if (badkind === null && !kindSet.has(kw)) badkind = kw
          // ONE kind per entry (review #6): only the first bracket was judged, so
          // '- [declared] [reference] …' rode through wearing TWO routable kinds. Blocked only when
          // the second bracket IS a kind word — a bracketed citation right after the kind
          // ('- [declared] [계약서 §3] …') is body, not a second kind.
          const m2 = /^[ \t]*\[([^\]]*)\]/.exec(after)
          if (dblkind === null && m2 && kindSet.has(m2[1])) dblkind = `[${kw}] [${m2[1]}]`
        }
      } else if (badkind === null) {
        badkind = ''   // no bracket at all — reported as a missing kind slot by the caller
      }
      // A held-back stub gets `last = -1`: its continuation REALIZES it below rather than extending
      // it, and the two must not both fire on one line.
      if (!gnoise) {
        n++
        entries.push(gl)
        last = emptyRemainder(gl, ENTRY_TAG) ? entries.length - 1 : -1
      } else last = -1
    } else {
      if (grest === gl || !inb) { badline = gl; break }
      // A continuation with real content REALIZES the held-back bullet — it becomes an entry, and
      // its kind slot is the placeholder it was holding, judged by the same vocabulary rule as any
      // other kind (review #7 P1-1: this line counted the entry and set nothing, so '- [{kind}] …'
      // over a real continuation was an Accepted decision with template noise for a kind —
      // validate rc 0, measured). The ENTRY LINE recorded for a realization is the bullet plus the
      // continuation that realized it: the bullet alone is a placeholder, and a listing that
      // printed only `- [{kind}]` would show the reader nothing they could act on.
      if (gnoise && strip(grest) !== '') {
        n++
        entries.push(`${gnoiseLine} ${grest}`)
        last = entries.length - 1
        gnoise = false
        if (badkind === null) badkind = gnoiseKind
      } else if (last >= 0) {
        // ONE LINE PER ITEM is the listing's whole shape, so an entry's continuations fold into the
        // line the entry already has rather than becoming lines of their own.
        entries[last] += ` ${grest}`
      }
    }
  }
  return { n, entries, badline, badkind, dblkind, unclosed }
}
