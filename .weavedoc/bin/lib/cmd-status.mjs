// weavedoc status — where each document stands, and what is waiting on the user.
import { existsSync, statSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { splitLines } from './core.mjs'
import { nocomment, sectionAll } from './sections.mjs'
import { fm, join, docIds, materialIds, truthFiles } from './mine.mjs'

const readOr = p => { try { return readFileSync(p, 'utf8') } catch { return '' } }
const isDir = p => { try { return statSync(p).isDirectory() } catch { return false } }

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
// from the counter and from the tag check at once.
export const hqBody = file => sectionAll(nocomment(readOr(file)), 'Human queue')

const countLines = (text, re) => splitLines(text)
  .filter(l => !/^[ \t]*- [[][{<]/.test(l))
  .filter(l => re.test(l)).length

export function cmdStatus (m, out) {
  for (const d of docIds(m)) {
    const st = fm(join(m.documents, d, 'plan.md'), 'status') || '(no plan)'
    let next
    switch (st) {
      case 'planned': next = 'write'; break
      case 'drafting': next = 'write (finish) → review'; break
      case 'reviewing': next = 'refine'; break
      case 'stale': next = 'review (truths changed — re-verify)'; break
      case 'done': next = '—'; break
      default: next = 'plan'
    }
    // Both output forms, exactly as the gate reads them: reporting a multi-file document as still
    // "→ write" while final/ sits there sends you back to a step you already finished.
    const hasFinal = existsSync(join(m.documents, d, 'final.md')) || isDir(join(m.documents, d, 'final'))
    if (hasFinal && st !== 'stale') next = '— (final)'
    out(`${d.padEnd(18)} ${st.padEnd(11)} → ${next}`)
  }

  // The same population validate's `examined:` line counts — converted.md files from disk, not
  // folders (the two once disagreed 2 vs 1). When the folder count differs, the gap is SHOWN.
  const folders = materialIds(m)
  const nm = folders.filter(id => existsSync(join(m.materials, id, 'converted.md'))).length
  if (folders.length !== nm) out(`materials: ${nm} (${folders.length - nm} folder(s) without converted.md — validate names them)`)
  else out(`materials: ${nm}`)

  // verify.md's ABSENCE is legal — `verify` is an on-demand lane. But absence is not nothing:
  // without the file, cold-verification state and the Human-queue rule go unchecked, so it is said
  // here rather than left to silence.
  if (!existsSync(join(m.truths, 'verify.md')) && truthFiles(m).length > 0) {
    out("verification: none yet (no truths/verify.md) — truths exist but no cold verification has been recorded; run 'weavedoc verify' when you want one")
  }

  // Decisions parked on the user. Counted here because a completeness line reporting only
  // "열린 갭 0 · 열린 질문 0" reads as "nothing is waiting on you" while the queue holds eleven.
  const files = hqFiles(m)
  if (files.length > 0) {
    const hq = files.map(hqBody).join('')
    const hqOpen = countLines(hq, /^[ \t]*- \[open\]/)
    // An ENTRY starts at column 0; an indented `- ` is a sub-bullet OF an entry, and counting every
    // `- ` line reported a tagged entry's own sub-bullets as untagged. `- (없음)` / `- (none)` is the
    // documented empty-queue idiom, not an entry.
    const hqUntag = splitLines(hq)
      .filter(l => !/^- \[[<{]/.test(l))
      .filter(l => /^- /.test(l))
      .filter(l => !/^- \((없음|none)\)/.test(l))
      .filter(l => !/^- \[(open|ruled)\]/.test(l)).length
    if (hqOpen > 0) {
      // The three buckets must SUM to the total. A `- [open]` with no ownership tag lands in the
      // total but in no bucket, so the remainder is shown rather than hidden until validate rejects it.
      const u = countLines(hq, /^[ \t]*- \[open\][ \t]*\[user-only\]/)
      const r = countLines(hq, /^[ \t]*- \[open\][ \t]*\[recommended\]/)
      const mm = countLines(hq, /^[ \t]*- \[open\][ \t]*\[machine\]/)
      let rest = hqOpen - u - r - mm
      if (rest < 0) rest = 0
      let line = `human queue: open ${hqOpen} — you decide ${u} · recommendation ready ${r} · machine can just do ${mm}`
      if (rest > 0) line += ` · ${rest} missing an ownership tag (validate rejects these)`
      out(line)
    } else if (hqUntag === 0) {
      out('human queue: 0')
    }
    // Reported UNCONDITIONALLY, not only when the tagged count is zero, or one tagged entry hides
    // every untagged one.
    if (hqUntag > 0) out(`human queue: ${hqUntag} entry(s) with no '[open]'/'[ruled]' state tag, not counted above — retag them '- [open|ruled] [user-only|recommended|machine] …'`)
  }

  // The warranty's edge is disclosed, not implied: with completeness off, omissions are simply not
  // checked, and a status that never says so lets "no gaps reported" read as "no gaps exist".
  if ((m.cfg.flat.get('completeness') || '') !== 'required') {
    out("completeness: off — omissions are not checked (fidelity.completeness in .weavedoc/config.yaml; 'required' wires gaps.md into the gate)")
  }
  return 0
}
