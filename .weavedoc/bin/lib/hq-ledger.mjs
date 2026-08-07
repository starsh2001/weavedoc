// The Human-queue ledger — ONE structural reading of it, for every command that has an opinion.
//
// WHY A MODULE (external review, v0.5.18). `status` walked these files to count and list waiting
// decisions; `validate` walked them again, with its own section detection and its own idea of what
// a line is, to enforce the ownership tag. v0.5.17 taught the first walk that a bullet nested
// strictly deeper than the entry above it is that entry's DETAIL — and the second walk never heard,
// so the two disagreed about the same line in both directions at once. Measured on v0.5.17:
//
//     - [open] [user-only] PARENT
//       - [open] CHILD-DETAIL
//
// …counted TWO open entries in `status` while FORMATS calls the second one detail, and `validate`
// failed the mine (HQ-UNTAGGED, rc 1) demanding an ownership tag on a line that is not an entry.
// Adding the tag traded a wrong rejection for a wrong report: a waiting decision that does not
// exist. The same split dropped an untagged peer at one indentation and double-counted a
// sub-bullet under an indented `[ruled]`.
//
// So the structure is decided ONCE, here, and the two commands consume the result: `status` sorts
// the entries into its buckets, `validate` checks the tags of the entries it is given. What each
// does with an entry is policy and stays theirs; WHICH LINES ARE ENTRIES is not a matter of opinion.
import { readFileSync, existsSync } from 'node:fs'
import { splitLines, U, TAG_SEP, TAG_LEAD } from './core.mjs'
import { nocomment, sectionEach } from './sections.mjs'
import { join, docIds } from './mine.mjs'
import { stubLine, emptyRemainder, hasContent } from './gaps-register.mjs'

// BYTES. These files are quoted back to the user by both consumers, and validate works in the byte
// domain so a value holding invalid UTF-8 prints as the mine holds it, not as U+FFFD.
const readOr = p => { try { return readFileSync(p).toString('latin1') } catch { return '' } }

// Each ledger's entry PREFIX, so "does this entry's line carry content?" is asked the same way in
// all of them (gaps.md's lives with the register reader). Human queue: the state slot plus an
// optional ownership slot.
const HQ_TAG = new RegExp(`^- \\[[^\\]]*\\]${TAG_SEP}*(\\[[^\\]]*\\])?`)
// The counter's indentation tolerance for an `[open]` entry — the SAME class, one position earlier
// (cold review, v0.5.11): validate strips `TAG_SEP` before testing a line, status tolerated `[ \t]`,
// so a `\v`-indented `- [open]` was an entry to the gate and invisible to both status surfaces.
const HQ_OPEN = new RegExp(`^${TAG_SEP}*- \\[open\\]`)
// Every placeholder-opening bullet at any indentation.
const PLACEHOLDER_BULLET = new RegExp(`^${TAG_SEP}*- [[][{<]`)
// A LEAD MADE ONLY OF CONTROL CHARACTERS IS NOT INDENTATION. No editor writes one, so such a bullet
// is an entry wherever it sits — the rule v0.5.13/14 established for placeholder stubs (a
// control-indented one was handled by nobody and vanished, and the run printed "nothing is waiting
// on you"), generalised in v0.5.18 to every bullet, since every bullet now asks the same question.
// The empty lead — column 0 — is the degenerate case and is likewise always an entry.
const CTRL_ONLY_LEAD = /^[\n\v\f\r]*$/
// The EMPTY-LEDGER idiom, for the Human queue and questions.md and nowhere else. gaps.md is a
// fail-closed register whose every bullet is a kind-tagged gap or an accepted decision (FORMATS),
// so `- (없음)` there is a malformed entry, not a sentinel — ruled 2026-08-07 rather than extending
// the idiom, because "every bullet is a routable record" is worth more than the convenience.
// ANCHORED: unanchored, a real entry that merely OPENS with those words was swallowed and the
// ledger read as empty (external review, v0.5.6). Spelled in BYTES because the text is bytes.
// `\r` is in the trailing class for the same reason `isFence` keeps it (core.mjs): splitLines
// removes ONE trailing CR, so this covers a stray one mid-way or a second.
export const NONE_IDIOM = new RegExp(`^- \\((${U('없음')}|none)\\)[ \t\r]*$`)

// Every file carrying a "## Human queue" section, in one order. ONE list, one definition — validate
// and status must see the same set, or one reports "human queue: 0" over decisions open in files it
// never opened.
export function hqFiles (m) {
  const out = []
  const v = join(m.truths, 'verify.md')
  if (existsSync(v)) out.push(v)
  for (const d of docIds(m)) {
    const r = join(m.documents, d, 'review.md')
    if (existsSync(r)) out.push(r)
  }
  return out
}

// verify.md is `##`-sectioned and review.md `#`-sectioned. The spec added the section to both
// without saying which level, so read either rather than silently finding nothing in one of them —
// and EVERY matching section, not the first: reading only the first hid every later round's entries
// from the counter and from the tag check at once. The section walker caps heading depth at six
// (v0.5.4), so a `####### Human queue` is not a heading and therefore not a section, here as
// everywhere. EACH section separately (v0.5.17): a queue is an append-per-round log, and joining
// the bodies put one round's last line above the next round's first, so the walk below read a new
// entry as detail of an old one and dropped it.
export const hqBodies = file => sectionEach(nocomment(readOr(file)), 'Human queue')

// THE WALK. Returns every ENTRY in order, each with:
//   kind — 'open' | 'ruled' | 'untagged'   (template noise is not an entry and is not returned)
//   raw  — the entry's own line, never mutated: state and ownership are judged HERE. Classifying
//          the folded display line once put an entry in status's "machine can just do" bucket while
//          validate rejected it — two surfaces disagreeing about one entry (cold review, v0.5.10).
//   line — the display, which folding extends with the entry's continuations
//   lead — the entry's own indentation, which is what makes the next line detail or a peer
//
// The structural rule, spelled out because WHICH indentation makes a bullet an entry has moved five
// times: a bullet is an entry unless it is nested STRICTLY DEEPER than the entry above it — a lead
// that starts with the parent's and is longer. Peers share a lead and are each their own entry; a
// lead that is not an extension of the parent's (a tab under two spaces) is not nesting either and
// surfaces rather than being absorbed. A control-only lead is always an entry (see CTRL_ONLY_LEAD).
export function scanHq (bodies) {
  const entries = []
  for (const body of bodies) {
    let last = null // index of the entry a continuation folds into, or null
    let held = null // { raw, lead } — a pure placeholder stub awaiting realization
    let parentLead = null
    // `''` is a legal parentLead (a column-0 entry), so the test is `!== null`, never truthiness.
    const deeper = lead => parentLead !== null && lead.length > parentLead.length && lead.startsWith(parentLead)
    const push = (kind, raw, lead, line = raw) => entries.push({ kind, raw, lead, line }) - 1
    for (const l of splitLines(body)) {
      if (!/[^ \t]/.test(l)) { last = null; held = null; parentLead = null; continue }
      const lead = TAG_LEAD.exec(l)[0]
      const rest = l.slice(lead.length)
      if (rest.startsWith('- ') && !NONE_IDIOM.test(l) && (CTRL_ONLY_LEAD.test(lead) || !deeper(lead))) {
        held = null
        last = null
        parentLead = lead
        // A placeholder-OPENING bullet: the remainder decides (FORMATS), same as everywhere else.
        // Empty remainder → a stub, HELD for a continuation to realize (dropping it immediately
        // left the continuation carrying the actual content with nothing to attach to, and the item
        // vanished — external review, v0.5.10). Real remainder → an entry whose state slot is still
        // a template, i.e. an entry with no valid state tag, surfaced rather than dropped.
        if (PLACEHOLDER_BULLET.test(l)) {
          if (stubLine(l, HQ_TAG)) { held = { raw: l, lead }; continue }
          const i = push('untagged', l, lead)
          if (emptyRemainder(l, HQ_TAG)) last = i
          continue
        }
        if (HQ_OPEN.test(l)) {
          const i = push('open', l, lead)
          if (emptyRemainder(l, HQ_TAG)) last = i
          continue
        }
        // A `ruled` entry is closed: nothing reads its ownership and status does not list it. It is
        // still an ENTRY, which is what makes its nested bullets detail rather than waiting items —
        // and since v0.5.18 that holds at any indentation, not only at column 0.
        if (/^- \[ruled\]/.test(rest)) { push('ruled', l, lead); continue }
        const i = push('untagged', l, lead)
        if (emptyRemainder(l, HQ_TAG)) last = i
        continue
      }
      // NOT an entry: detail of the one above, a continuation, the empty idiom, or prose.
      if (/^[ \t]+[^ \t]/.test(l)) {
        const cont = l.replace(/^[ \t]+/, '')
        // A held stub is realized only by a continuation that HAS content once template tokens are
        // stripped — the register's own rule (v0.5.11); a placeholder-only continuation leaves the
        // hold standing, so a real line further down still realizes it. The realized entry lives
        // where the STUB was, so its lead is the stub's: reading the continuation's lead instead put
        // the parent one level too deep and split one entry into two (v0.5.17).
        if (held !== null && hasContent(cont)) {
          last = push('untagged', held.raw, held.lead, `${held.raw} ${cont}`)
          parentLead = held.lead
          held = null
        } else if (held === null && last !== null) entries[last].line += ` ${cont}`
      } else if (!/^[ \t]/.test(l)) {
        last = null
        held = null
        parentLead = null
      }
    }
  }
  return entries
}
