// WeaveDoc foundations — markdown structure readers.
//
// gaps, review, verify and coverage all stand on these, and the consecration gate reads its own
// jurisdiction through them. They are also the functions that got byte-pinned on 2026-08-04, so the
// port keeps their deliberate narrowness rather than "improving" it.
import { readFileSync } from 'node:fs'
import { splitLines as toLines } from './core.mjs'

// BYTES. The only callers that read a file through this module are validate's dupSection and
// commentBalanced, and validate works entirely in the byte domain so the values it quotes back are
// the bytes the mine holds. The pure functions below (nocomment, sectionBody*, sectionAll,
// countHeadings) take TEXT from their caller and are domain-agnostic — they only ever match ASCII.
const readOr = (p, fb = '') => { try { return readFileSync(p).toString('latin1') } catch { return fb } }

// ---- comments ------------------------------------------------------------------------------
// Ledger files keep closed/audit history in HTML comments; counting those as live entries is a lie.
// The state carries ACROSS lines, so an unterminated `<!--` blanks everything after it — which is
// exactly why comment_balanced exists as its own check.
export function nocomment (text) {
  const out = []
  let inc = false
  for (let line of toLines(text)) {
    for (;;) {
      if (inc) {
        const i = line.indexOf('-->')
        if (i < 0) { line = ''; break }
        line = line.slice(i + 3); inc = false
      }
      const i = line.indexOf('<!--')
      if (i < 0) break
      const rest = line.slice(i + 4)
      const j = rest.indexOf('-->')
      if (j < 0) { line = line.slice(0, i); inc = true; break }
      line = line.slice(0, i) + rest.slice(j + 3)
    }
    out.push(line)
  }
  return out.length ? out.join('\n') + '\n' : ''
}

// Does the file END inside a comment? Runs the SAME state machine rather than counting delimiters:
// counting was never a balance test — one orphan `-->` earlier offsets a later unterminated `<!--`,
// the totals match, and the check passes on exactly the file whose counts are lies.
export function commentBalanced (file) {
  let text
  try { text = readFileSync(file, 'utf8') } catch { return false }
  let inc = false
  for (let line of toLines(text)) {
    for (;;) {
      if (inc) {
        const i = line.indexOf('-->')
        if (i < 0) { line = ''; break }
        line = line.slice(i + 3); inc = false
      }
      const i = line.indexOf('<!--')
      if (i < 0) break
      const rest = line.slice(i + 4)
      const j = rest.indexOf('-->')
      if (j < 0) { inc = true; break }
      line = rest.slice(j + 3)
    }
  }
  return !inc
}

// ---- sections ------------------------------------------------------------------------------
// The header is interpolated into a regex by the bash originals, so it is escaped here — the
// headers in use are plain words, and a port that let one become a pattern would differ only for
// the file that happened to contain a metacharacter.
const rx = h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Body under the FIRST `# Header`. Ends at the next heading of ANY level — the exit rule is checked
// before the start rule, exactly as the awk rule order does.
export function sectionBody (text, h) {
  const out = []
  let on = false
  for (const line of toLines(text)) {
    if (on && /^#+[ \t\n\v\f\r]/.test(line)) break
    if (new RegExp(`^#[ \t]+${rx(h)}[ \t\n\v\f\r]*$`).test(line)) { on = true; continue }
    if (on) out.push(line)
  }
  return out.length ? out.join('\n') + '\n' : ''
}

// Body under the FIRST `## Header`. Ends at the next `#` or `##` heading — a deeper one stays in.
export function sectionBody2 (text, h) {
  const out = []
  let on = false
  for (const line of toLines(text)) {
    if (on && (/^#[ \t]/.test(line) || /^##[ \t]/.test(line))) break
    if (new RegExp(`^##[ \t]+${rx(h)}[ \t\n\v\f\r]*$`).test(line)) { on = true; continue }
    if (on) out.push(line)
  }
  return out.length ? out.join('\n') + '\n' : ''
}

// Body of EVERY matching section, at any heading level — for ledgers that legitimately repeat their
// heading (Human queue, Adjudications: append-per-round). A section ends only at a SAME-OR-SHALLOWER
// heading, so the sub-headings a ledger groups its rounds under stay inside it.
// `Fidelity violations` must NOT use this: a second copy there is a bypass, which dupSection blocks.
// EACH matching section, kept apart. sectionAll is this function joined, so there is one walker and
// not two answers about where a section begins (v0.5.17). A reader that carries STATE across lines —
// the Human queue's "what is this line detail of" — needs the boundary: the bodies were concatenated
// with nothing between them, so a round ending in an entry and the next round beginning with an
// indented one made the second round's first item detail of the first round's last, and it vanished
// (external review). A reader that only counts lines cannot tell the difference and keeps using
// sectionAll.
export function sectionEach (text, h) {
  const parts = []
  let out = []
  let on = false
  let lv = 0
  const lev = s => { const m = /^#+/.exec(s); return m ? m[0].length : 0 }
  // SIX IS THE DEEPEST HEADING (v0.5.4, review #8). This function accepted any run of '#', while
  // countHeadings — which decides whether validate can SEE a section — stops at six, so a
  // `####### Accepted` register was malformed to validate and one accepted entry to `weavedoc
  // gaps`: same file, two answers, the drift class again. Markdown agrees with the stricter
  // reader (a seventh '#' is not a heading), so the cap moves here rather than the other way.
  const head = s => /^#+[ \t\n\v\f\r]/.test(s) && lev(s) <= 6
  const close = () => { if (out.length) parts.push(out.join('\n') + '\n'); out = [] }
  for (const line of toLines(text)) {
    if (lev(line) <= 6 && new RegExp(`^#+[ \t\n\v\f\r]+${rx(h)}[ \t\n\v\f\r]*$`).test(line)) { close(); on = true; lv = lev(line); continue }
    if (on && head(line) && lev(line) <= lv) { close(); on = false }
    if (on) out.push(line)
  }
  close()
  return parts
}

export function sectionAll (text, h) { return sectionEach(text, h).join('') }

// ---- code fences ---------------------------------------------------------------------------
// ONE fence judgment for every reader of a file (review #11): the fence rule lived in ONE of the
// four gaps readers, so a whole fake register inside a code fence passed validate — the heading
// counter and the register scanner counted the fenced lines — while a fenced EXAMPLE of the
// headings blocked a fine file as a duplicate. This pass blanks what a fence encloses (content
// and the closing line) and reports a fence nobody closed; callers block that the way they block
// an unterminated '<!--', for the same reason (everything after it is invisible).
//
// The OPENER LINE IS KEPT. That is a decision, not an accident: a fence opened inside a
// fail-closed grammar (the register's Open/Accepted sections) must go on BLOCKING as a line the
// grammar cannot read — blanking it would let an "accepted decision" hide inside a code block in
// the one file whose whole point is that nothing hides. Readers that ignore non-entry lines
// (heading counters, the stray walker) ignore the opener anyway.
//
// The rules are the part of CommonMark these readers need: a fence opens at up to three spaces of
// indent with 3+ backticks or tildes — and a BACKTICK opener's info string may not contain a
// backtick (review #11: '```foo`bar' is NOT a fence, and reading it as one hid a real entry
// inside a fence that does not exist) — and closes only on the same character, at least as many,
// with nothing but blanks after.
export function defence (text) {
  const out = []
  let ch = ''
  let len = 0
  for (const line of toLines(text)) {
    const l = line.replace(/\r$/, '')
    if (ch === '') {
      const f = /^ {0,3}(`{3,})([^`]*)$/.exec(l) || /^ {0,3}(~{3,})/.exec(l)
      if (f) { ch = f[1][0]; len = f[1].length; out.push(line); continue }
      out.push(line)
    } else {
      const f = new RegExp('^ {0,3}([' + ch + ']{3,})[ \t]*$').exec(l)
      if (f && f[1].length >= len) { ch = ''; len = 0 }
      out.push('')
    }
  }
  return { text: out.length ? out.join('\n') + '\n' : '', open: ch !== '' }
}

// ---- heading counting ----------------------------------------------------------------------
// ASCII space/tab ONLY, never a general whitespace class (v0.3.1): under a UTF-8 locale NBSP joins
// that class, so `# Fidelity violations<NBSP>` would read as the real heading on one machine and not
// on another — same bytes, different verdict. The gate's readability must not depend on the locale.
export function countHeadings (body, want, lv) {
  let n = 0
  for (let l of body.split('\n')) {
    if (l.endsWith('\r')) l = l.slice(0, -1)
    if (!l.startsWith('#')) continue
    let i = 0
    while (l[i] === '#') i++
    const hashes = i
    const after = l.slice(i)
    if (!(after.startsWith(' ') || after.startsWith('\t'))) continue
    const rest = after.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '')
    if (rest !== want) continue
    if (lv === 1) { if (hashes !== 1) continue } else if (lv === 0) { if (hashes > 6) continue } else if (hashes !== 2) continue
    n++
  }
  return n
}

// "The file has this section" vs "the reader can see it" — the raw view exists for exactly one
// caller, and both views live at one call site because two functions would drift.
export function dupSection (file, header, level = 2, raw = false) {
  const text = readOr(file)
  const body = raw ? text : nocomment(text)
  return countHeadings(body, header, level)
}
