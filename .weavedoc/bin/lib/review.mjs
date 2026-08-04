// weavedoc — the fidelity gate's readers.
//
// These three decide whether a document may ship, so they are kept together and kept narrow. The
// history behind that narrowness is in the bash comments and is not decoration: the gate's
// "recognise an entry-shaped line" census died after bullets, blockquotes, NBSP and checkboxes each
// slipped it in three consecutive rounds, and was replaced by the ZONE RULE — a bracketed violation
// kind may live in exactly one place, and shape stops mattering.
import { readFileSync } from 'node:fs'
import { nocomment } from './sections.mjs'

const readOr = p => { try { return readFileSync(p, 'utf8') } catch { return '' } }

// The comment-stripped file as fid_mark sees it. `file_stripped` puts nocomment's output through a
// command substitution, which eats EVERY trailing newline, and the here-string that feeds awk then
// adds exactly one back. So a file whose stripped form is empty is ONE empty line, not zero lines —
// which is why this cannot be splitLines(): that would return no lines at all and the walk below
// would emit nothing where the original emits `O`.
const strippedLines = file => nocomment(readOr(file)).replace(/\n+$/, '').split('\n')

// EVERY line marked I (inside the violations section) or O (outside), from ONE walk — so "inside"
// and "outside" are complements of a single judge and cannot drift into a third state. The heading
// that OPENS the section is itself O; the heading that ENDS it, and everything after, is O too.
//
// Which heading ends the section is the whole difficulty, and it is answered from review.sections
// rather than by a level rule. Both obvious level rules are wrong in opposite directions: ending at
// the same level runs a `#`-sectioned violations block to EOF in a file whose other sections are
// `##`, and ending at any heading lets a sub-heading close it early and the gate reads empty.
export function fidMark (file, sections) {
  const sib = sections.filter(s => s !== 'Fidelity violations')
  const L = strippedLines(file)
  const hlev = s => { const m = /^#+/.exec(s); return m ? m[0].length : 0 }
  const htext = s => s.replace(/^#+[ \t\n\v\f\r]+/, '').replace(/[ \t\n\v\f\r]+$/, '')
  const isSib = s => sib.length > 0 && sib.includes(htext(s))
  // The TIER: the shallowest level at which this file names one of the sibling sections.
  let tier = 0
  for (const l of L) {
    if (!/^#{1,6}[ \t]/.test(l)) continue
    if (!isSib(l)) continue
    if (tier === 0 || hlev(l) < tier) tier = hlev(l)
  }
  const out = []
  let on = false; let done = false; let lvl = 0
  for (const l of L) {
    if (!on) {
      if (/^#{1,6}[ \t]+Fidelity violations[ \t]*$/.test(l) && !done) { on = true; lvl = hlev(l) }
      out.push(['O', l])
      continue
    }
    if (/^#{1,6}[ \t]/.test(l)) {
      if (hlev(l) <= lvl) { on = false; done = true; out.push(['O', l]); continue }
      if (isSib(l) && hlev(l) <= tier) { on = false; done = true; out.push(['O', l]); continue }
      out.push(['I', l]); continue
    }
    out.push(['I', l])
  }
  return out
}

// The violations body: fid_mark's I lines minus the section's own sub-headings. A thin wrapper, on
// purpose — "which heading ends the section" lives in ONE place.
export const fidBody = (file, sections) =>
  fidMark(file, sections).filter(([t, l]) => t === 'I' && !/^#{1,6}[ \t]/.test(l)).map(([, l]) => l)

// THE SOLE JUDGE of what the consecration gate counts as an entry. Three rules in order, and both
// template dialects covered throughout (gaps.md uses {braces}, review.md uses <angles>).
export function isNoise (line, kinds) {
  if (line === '' || line.startsWith('#') || line.startsWith('<!--') || line.startsWith('-->')) return true
  const s = line.replace(/^[ \t\n\v\f\r]*/, '')
  if (s === '') return true
  // An entry always carries its `[kind]`; a line with no bracket is prose (e.g. "(없음)"). Anything
  // WITH a bracket still counts, even unbulleted, so a malformed entry cannot hide as prose.
  if (!s.includes('[')) return true
  // An untouched template holds the placeholder NAME in its KIND slot — the one thing separating the
  // two shapes. The gate acts on the kind, so a line without a real one is not an entry it can act on.
  for (const bk of kinds) {
    if (s.startsWith(`- [${bk}]`) || s.startsWith(`- [<${bk}>]`) || s.startsWith(`- [{${bk}}]`)) return false
  }
  // `- [` followed by one of `[`, `{`, `<` — the placeholder shapes.
  if (!/^- \[[[{<]/.test(s)) return false
  const m = /^[^[\]]*\[([^\]]*)\]/.exec(s)
  const slot = (m ? m[1] : '').toLowerCase()
  // NARROW: only a slot with no trace of a kind. A near-miss (`<Contradiction>`) belongs to the
  // near-miss guidance, whose message is better; swallowing it here would take that jurisdiction.
  for (const bk of kinds) if (slot.includes(bk)) return true
  // A placeholder KIND slot is not enough — the REST decides (ruled 2026-08-01). A filled entry that
  // missed only the `{kind}` slot is a real violation, not a stub.
  let rest = s.includes(']') ? s.slice(s.indexOf(']') + 1) : null
  if (rest === null) {
    // No `]` at all: cutting at `]` would leave the slot's own `}`/`>` in the remainder, reading as
    // "still a template". Cut at the placeholder's own closer instead.
    if (s.includes('}')) rest = s.slice(s.indexOf('}') + 1)
    else if (s.includes('>')) rest = s.slice(s.indexOf('>') + 1)
    else rest = ''
  }
  if (!/[^ \t\n\v\f\r]/.test(rest)) return true
  // KNOWN LIMIT: prose that itself contains a `<…>` or `{…}` token (`값이 <10%>다`) reads as a
  // placeholder and falls back to the old behaviour — never toward a new false block.
  if (/\{[\s\S]*\}/.test(rest) || /<[\s\S]*>/.test(rest)) return true
  return false
}

// The zone rule's detection target: the three kind TOKENS, folded. Each bracket interior on the line
// is folded to lowercase alphanumerics, so every spelling variant converges on one rule rather than
// on a list. VOCABULARY BOUNDARY (ruled): a bracketed word outside that vocabulary (`[모순]`) is
// prose wearing brackets — the machine does not chase human wording.
export const foldKinds = kinds => kinds.map(k => k.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(x => x !== '')

export function bearsKind (line, folded) {
  let s = line
  for (;;) {
    const i = s.indexOf('[')
    if (i < 0) return false
    const r = s.slice(i + 1)
    const j = r.indexOf(']')
    const f = (j >= 0 ? r.slice(0, j) : r).toLowerCase().replace(/[^a-z0-9]/g, '')
    for (const k of folded) if (f.includes(k)) return true
    s = j >= 0 ? r.slice(j + 1) : ''
  }
}

// A comment that swallows kind-bearing entries and is closed by a MID-LINE arrow. The accident:
// someone opens `<!--`, forgets to close it, and a prose arrow (`초안 --> 검토`) closes it — no
// heading swallowed, the file ends outside a comment, and regular entries vanish. The tell is the
// CLOSER's shape: a deliberate archive ends its line with `-->`, an accidental one has prose after.
// Emits I<line> for swallowed interior and C<suffix> at each closer, over the RAW file.
export function commentSpans (file) {
  const out = []
  let inc = false
  const lines = readOr(file).split('\n')
  if (lines.length && lines[lines.length - 1] === '') lines.pop()
  for (let line of lines) {
    for (;;) {
      if (inc) {
        const i = line.indexOf('-->')
        if (i < 0) { out.push(['I', line]); line = ''; break }
        // The closing line is interior UP TO its arrow, or an entry on the closer line itself
        // (`- [contradiction] … --> 산문`) is swallowed with the count still at zero.
        if (i > 0) out.push(['I', line.slice(0, i)])
        const sfx = line.slice(i + 3).replace(/^[ \t\n\v\f\r]+/, '').replace(/[ \t\n\v\f\r]+$/, '')
        out.push(['C', sfx])
        inc = false
        line = line.slice(i + 3)
        continue
      }
      const i = line.indexOf('<!--')
      if (i < 0) break
      const rest = line.slice(i + 4)
      const j = rest.indexOf('-->')
      if (j < 0) { out.push(['I', rest]); inc = true; break }
      line = line.slice(0, i) + rest.slice(j + 3)
    }
  }
  return out
}
