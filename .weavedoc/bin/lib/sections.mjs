// WeaveDoc foundations — markdown structure readers.
//
// gaps, review, verify and coverage all stand on these, and the consecration gate reads its own
// jurisdiction through them. They are also the functions that got byte-pinned on 2026-08-04, so the
// port keeps their deliberate narrowness rather than "improving" it.
import { readFileSync } from 'node:fs'
import { splitLines as toLines } from './core.mjs'

const readOr = (p, fb = '') => { try { return readFileSync(p, 'utf8') } catch { return fb } }

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
export function sectionAll (text, h) {
  const out = []
  let on = false
  let lv = 0
  const lev = s => { const m = /^#+/.exec(s); return m ? m[0].length : 0 }
  for (const line of toLines(text)) {
    if (new RegExp(`^#+[ \t\n\v\f\r]+${rx(h)}[ \t\n\v\f\r]*$`).test(line)) { on = true; lv = lev(line); continue }
    if (on && /^#+[ \t\n\v\f\r]/.test(line) && lev(line) <= lv) on = false
    if (on) out.push(line)
  }
  return out.length ? out.join('\n') + '\n' : ''
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
