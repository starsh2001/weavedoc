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
  return s.replace(/[ \t]*$/, '').replace(/^"/, '').replace(/"$/, '').replace(/\u0001/g, ' ')
}

function extract (file) {
  const r = { id: basename(file, '.md'), cl: '', src: '', asof: '', prov: '', asm: '', bd1: '' }
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
      if (r.bd1 === '' && /[^ \t]/.test(l)) r.bd1 = l.replace(/^[ \t]+/, '').replace(/\u0001/g, ' ')
      if (/^\|/.test(r.bd1) && /^[ \t]*\|/.test(l)) tbl++
      continue
    }
    if (/^claim[ \t]*:/.test(l)) r.cl = pullVal(l)
    else if (/^source[ \t]*:/.test(l)) r.src = pullVal(l)
    else if (/^as_of[ \t]*:/.test(l)) r.asof = pullVal(l)
    else if (/^provenance[ \t]*:/.test(l)) r.prov = pullVal(l)
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
  const idxIds = []
  for (const l of splitLines(readOr(idxPath))) {
    const hay = l.replace(/ ··[\s\S]*$/, '')
    if (!lowerAscii(hay).includes(t)) continue
    const mm = /^- (t[0-9]+)/.exec(l)
    if (mm) idxIds.push(mm[1])
  }
  // Body text is searched ALWAYS, never as a fallback (field report 2026-09-22). `pull "With Your
  // Smile"` returned the 7 cards naming it in a claim or tag and dropped t087, whose body carries
  // the principle connecting the two songs the term spans — the card a consumer asking about that
  // song most needs. An index hit is not evidence that the index holds every relevant card; under
  // the fallback it only ENDED the search, and the miss was silent. Index hits keep their position
  // at the top and body-only hits are labelled, so the stronger match still reads as the stronger
  // match. Fixing the SHAPE of the search rather than the data is deliberate: the old behaviour
  // matched its own spec, so the miss was invisible from the output and no amount of per-term tag
  // curation would have surfaced it — the same lesson an earlier verification round recorded when
  // a scout, a song title and a table preview each hid a fact that was sitting in a body.
  const seen = new Set(idxIds)
  const bodyIds = []
  for (const f of truthFiles(m)) {
    const id = basename(f, '.md')
    if (seen.has(id)) continue
    if (lowerAscii(readOr(f)).includes(t)) bodyIds.push(id)
  }
  if (idxIds.length === 0 && bodyIds.length === 0) { out(`pull '${term}': no matches (claims, tags, bodies)`); return 0 }

  const idxFiles = idxIds.map(id => join(m.truths, `${id}.md`)).filter(existsSync)
  // index hits without files = a stale index. MUST bail rather than search nothing. Tested on
  // idxIds alone: body hits come from truthFiles() and always exist, so a merged emptiness check
  // would let a body match mask the stale index this guard exists to catch.
  if (idxIds.length > 0 && idxFiles.length === 0) { out(`pull '${term}': index matches have no truth files — stale index, run 'weavedoc reindex'`); return 1 }
  const tfiles = idxFiles.concat(bodyIds.map(id => join(m.truths, `${id}.md`)))
  // The row the body-only group starts at, held as the PATH and not as a count: a later `continue`
  // in the print loop would silently move a counted position, and the marker would then label the
  // wrong card as the first body match.
  const firstBody = bodyIds.length > 0 ? tfiles[idxFiles.length] : null
  if (tfiles.length > 60) out(`(${tfiles.length} matches — narrow the term if this is noise)`)

  const mstat = new Map(); const mstage = new Map()
  let nLive = 0

  // Every v3 card is canonical — the v2 status branches (discarded successors, conflict warnings,
  // unsupported, tombstones) left with the fields they read. What still varies per row is the
  // LABEL set: as_of/provenance/assumptions and the source material's own lifecycle, which is the
  // material axis and survives. An open disagreement no longer wears a card: it lives in
  // .weavedoc-state/conflicts.json, blocks shipping via validate, and is surfaced by status --open.
  for (const f of tfiles) {
    if (f === firstBody) {
      out(idxFiles.length === 0
        ? '(no claim/tag match — body-text matches below)'
        : `(+${bodyIds.length} below: the term is in the card BODY, not its claim or tags)`)
    }
    const r = extract(f)
    if (r.src && !mstat.has(r.src)) {
      const mf = join(m.materials, r.src, 'converted.md')
      if (existsSync(mf)) { mstat.set(r.src, fmv(mf, 'status')); mstage.set(r.src, fmv(mf, 'stage')) } else { mstat.set(r.src, ''); mstage.set(r.src, '') }
    }
    const lab = truthLabels(r.asof, r.prov, r.asm, mstage.get(r.src) ?? '', mstat.get(r.src) ?? '')
    out(`${r.id}  ${r.cl} [${r.src}]${lab}`)
    if (r.bd1) out(`      ↳ sealed: ${r.bd1}`)
    nLive++
  }
  out(`— ${nLive} truth(s)`)
  out('  bodies: truths/<id>.md · protocol: .weavedoc/READ.md')
  return 0
}
