// weavedoc pull <tag-or-keyword> — the consumer's entry point into the mine.
//
// What this command shows a reader IS the protocol: a discarded truth must not read as usable, a
// conflict must name both sides, and the labels a consumer needs must not depend on which entry
// path they took (field report D1). Every label comes from truthLabels — written inline nowhere.
import { existsSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { isFence, splitLines, truthLabels } from './core.mjs'
import { join, truthFiles } from './mine.mjs'
import { fmv } from './read.mjs'

const readOr = p => { try { return readFileSync(p, 'utf8') } catch { return '' } }

// ASCII-only case folding, matching awk's tolower() under LC_ALL=C. JS toLowerCase() folds the
// whole Unicode range, which would make the search match things the bash runtime does not.
const lowerAscii = s => s.replace(/[A-Z]/g, c => c.toLowerCase())

// The label rule lives in core.mjs and is imported, NOT copied. It briefly existed here and there
// at once — the exact "one rule, two spellings" drift the bash runtime spent this project's history
// paying for, and which the label text was centralised to prevent in the first place.

// The frontmatter value rule as pull's awk spells it: the shared rule plus \x01 folded to a space
// (the field separator must not survive inside a field).
function pullVal (line) {
  let s = line.replace(/^[^:]*:[ \t]*/, '')
  if (!s.startsWith('"')) {
    s = s.replace(/[ \t]+#.*$/, '')
    if (s.startsWith('#')) s = ''
  }
  return s.replace(/[ \t]*$/, '').replace(/^"/, '').replace(/"$/, '').replace(//g, ' ')
}

function extract (file) {
  const r = { id: basename(file, '.md'), st: '', cl: '', src: '', asof: '', prov: '', cw: '', res: '', asm: '', bd1: '' }
  let tbl = 0
  const lines = splitLines(readOr(file))
  let infm = lines.length > 0 && isFence(lines[0])
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i]
    if (infm && isFence(l)) { infm = false; continue }
    if (!infm) {
      // The first body line too, because the CLAIM is all pull has shown and the claim is the one
      // field nothing verifies — validate seals the BODY, not the claim. Printing them together puts
      // what the machine warranted next to what it did not.
      if (r.bd1 === '' && /[^ \t]/.test(l)) r.bd1 = l.replace(/^[ \t]+/, '').replace(//g, ' ')
      if (/^\|/.test(r.bd1) && /^[ \t]*\|/.test(l)) tbl++
      continue
    }
    if (/^status[ \t]*:/.test(l)) r.st = pullVal(l)
    else if (/^claim[ \t]*:/.test(l)) r.cl = pullVal(l)
    else if (/^source[ \t]*:/.test(l)) r.src = pullVal(l)
    else if (/^as_of[ \t]*:/.test(l)) r.asof = pullVal(l)
    else if (/^provenance[ \t]*:/.test(l)) r.prov = pullVal(l)
    else if (/^conflict_with[ \t]*:/.test(l)) r.cw = pullVal(l)
    else if (/^resolution[ \t]*:/.test(l)) r.res = pullVal(l)
    else if (/^assumptions[ \t]*:/.test(l)) r.asm = pullVal(l)
  }
  // A table-bodied truth previewed as its header row alone (field report D2): a reviewer decided
  // "the mine has no runtime lengths" while every length sat in the table body. Say it is a table
  // and how big; the trailer already points at the full file.
  if (/^\|/.test(r.bd1) && tbl > 1) r.bd1 += ` — 표 ${tbl}행, 전문은 truths/${r.id}.md`
  return r
}

export function cmdPull (m, out, term) {
  if (!term) { out('usage: weavedoc pull <tag-or-keyword>'); return 2 }
  if (truthFiles(m).length === 0) { out('pull: no truths yet'); return 0 }
  const idxPath = join(m.truths, 'index.md')
  if (!existsSync(idxPath)) { out("pull: truths/index.md missing (run 'weavedoc reindex')"); return 2 }

  const t = lowerAscii(term)
  // Labels are OUTPUT, not search text (D1 follow-through): the match runs on the line with its
  // ` ··<labels>` tail stripped, or pulling a word that occurs only in label prose ("evidence",
  // "PLAN") would hit every labeled truth in the mine.
  let ids = []
  for (const l of splitLines(readOr(idxPath))) {
    const hay = l.replace(/ ··[\s\S]*$/, '')
    if (!lowerAscii(hay).includes(t)) continue
    const mm = /^- (t[0-9]+)/.exec(l)
    if (mm) ids.push(mm[1])
  }
  if (ids.length === 0) {
    for (const f of truthFiles(m)) if (lowerAscii(readOr(f)).includes(t)) ids.push(basename(f, '.md'))
    if (ids.length > 0) out('(no claim/tag match — body-text matches below)')
  }
  if (ids.length === 0) { out(`pull '${term}': no matches (claims, tags, bodies)`); return 0 }

  const tfiles = ids.map(id => join(m.truths, `${id}.md`)).filter(existsSync)
  // index hits without files = a stale index. MUST bail rather than search nothing.
  if (tfiles.length === 0) { out(`pull '${term}': index matches have no truth files — stale index, run 'weavedoc reindex'`); return 1 }
  if (tfiles.length > 60) out(`(${tfiles.length} matches — narrow the term if this is noise)`)

  const mstat = new Map(); const mstage = new Map()
  let nLive = 0; let nRes = 0; let nConf = 0; let nUnsup = 0; let nRetr = 0

  for (const f of tfiles) {
    const r = extract(f)
    if (r.src && !mstat.has(r.src)) {
      const mf = join(m.materials, r.src, 'converted.md')
      if (existsSync(mf)) { mstat.set(r.src, fmv(mf, 'status')); mstage.set(r.src, fmv(mf, 'stage')) } else { mstat.set(r.src, ''); mstage.set(r.src, '') }
    }
    let lab = truthLabels(r.asof, r.prov, r.asm, mstage.get(r.src) ?? '', mstat.get(r.src) ?? '')

    if (r.st === 'discarded' || r.st === 'resolved') {
      // "resolved" is a pre-rename legacy value and winner-self is legacy too; both still render
      // usable so a mid-migration mine reads correctly.
      const wm = /winner[ \t]*:[ \t]*(\[[^\]]*\]|[^,}]+)/.exec(r.res)
      const w = wm ? wm[1] : ''
      // The key spelling must allow a space before the colon here too (`scope : [금액]`), or a reader
      // following READ.md is told a PARTIAL supersede was total — the opposite fact.
      const sm = /scope[ \t]*:[ \t]*(\[[^\]]*\])/.exec(r.res)
      const sc = sm ? sm[1] : ''
      if (w && new RegExp(`(^|[^0-9A-Za-z])${r.id}([^0-9]|$)`).test(w)) {
        out(`${r.id}  [WON ITS CONFLICT — usable; legacy stamp, set status: ok] ${r.cl} [${r.src}]${lab}`)
        if (r.bd1) out(`      ↳ sealed: ${r.bd1}`)
        nLive++
      } else if (sc) {
        // PARTIAL discard (field report D4): READ.md rule 2 sends the reader to the SURVIVING half
        // of this very row, which therefore needs its source and labels exactly like a live row.
        out(`${r.id}  [DISCARDED → ${w || '?'} · scope ${sc}] ${r.cl} [${r.src}]${lab}`)
        nRes++
      } else {
        // FULL discard: the protocol says follow the successor — nothing here is for use, so the
        // row stays terse and label-free on purpose.
        out(`${r.id}  [DISCARDED → ${w || '?'}] ${r.cl}`)
        nRes++
      }
    } else if (r.st === 'conflict') {
      out(`${r.id}  [!! CONFLICT vs ${r.cw || '?'} — unresolved, use NEITHER side] ${r.cl} [${r.src}]${lab}`)
      nConf++
    } else if (r.st === 'unsupported') {
      out(`${r.id}  [!! UNSUPPORTED — grounding gone, do not use] ${r.cl}${lab}`)
      nUnsup++
    } else if (r.st === 'retracted') {
      out(`${r.id}  [!! RETRACTED — was never a valid extraction; tombstone only, no successor] ${r.cl}${lab}`)
      nRetr++
    } else {
      if (r.res && /type[ \t]*:[ \t]*attribute/.test(r.res)) lab += ' [ATTRIBUTED — cite both sides, per resolution]'
      out(`${r.id}  ${r.cl} [${r.src}]${lab}`)
      // Only on the usable rows: everywhere else the protocol is telling the reader NOT to use the
      // value, and the quote would be noise under an instruction to look elsewhere.
      if (r.bd1) out(`      ↳ sealed: ${r.bd1}`)
      nLive++
    }
  }
  out(`— usable ${nLive} · discarded ${nRes} (successor in resolution) · conflict ${nConf} · unsupported ${nUnsup} · retracted ${nRetr} (no successor)`)
  out('  bodies: truths/<id>.md · protocol: .weavedoc/READ.md')
  return 0
}
