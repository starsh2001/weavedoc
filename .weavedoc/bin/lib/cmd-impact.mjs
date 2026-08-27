// weavedoc impact <material-id> — the blast radius of a material.
//
// Every id here is a REFERENCE, resolved leniently (`m1` names folder m001). Judging by raw string
// made impact report an EMPTY blast radius exactly where a retraction needs it, which is the one
// moment the command exists for.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import { canonId, correctsRefs, listField } from './core.mjs'
import { fm, materialIds, mtitle, truthFiles, walkFiles, join } from './mine.mjs'

const readOr = p => { try { return readFileSync(p, 'utf8') } catch { return '' } }
const rxEscape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function cmdImpact (m, out, id) {
  if (!id) { out('usage: weavedoc impact <material-id>'); return 2 }
  let isDir = false
  try { isDir = statSync(join(m.materials, id)).isDirectory() } catch { /* not there */ }
  if (!isDir) { out(`no such material: ${id}`); return 2 }

  const title = mtitle(m, id)
  out(`impact of material ${id} (${title}):`)
  const ncanon = canonId(id) || id

  // ---- the one REVERSE edge, and it comes first --------------------------------------------------
  // Everything below this block runs forward: material -> truths -> documents. `corrects:` is
  // declared on the CORRECTING material, and the only reader it ever had is validate's existence
  // check (MAT-CORRECTS-DANGLING). So a material amended by six later ones printed exactly the same
  // radius as one nobody ever touched, and the reader most in need of the warning — someone opening
  // the superseded material — was the one person who could not see it. It prints BEFORE the extracted
  // truths because it is a caveat on everything underneath: some of those claims may already be
  // displaced.
  //
  // Scanned from the materials on every run, never stored. A persisted back-link is a second copy of
  // a fact the frontmatter already holds, and the truths layer deleted exactly that shape (graph.md
  // edges) rather than keep two records that can drift apart.
  //
  // `(none)` is printed rather than skipped: silence here cannot be told apart from a version that
  // does not look, and this listing is only worth anything if its emptiness is a claim.
  out('  -- materials that correct it --')
  let ncorr = 0
  for (const other of materialIds(m)) {
    const cf = join(m.materials, other, 'converted.md')
    if (!existsSync(cf)) continue
    // Self-correction is validate's to reject (MAT-CORRECTS-SELF); listing it here as an amendment
    // of itself would dress a defect up as a finding.
    if ((canonId(other) || other) === ncanon) continue
    for (const { entry, id: target } of correctsRefs(fm(cf, 'corrects'))) {
      if ((canonId(target) || target) !== ncanon) continue
      const ct = mtitle(m, other)
      // A retracted corrector grounds nothing from its retraction on, so its amendment no longer
      // stands. Shown WITH that fact rather than filtered out — dropping the row would leave the
      // reader believing the passage was never contested.
      const withdrawn = fm(cf, 'status') === 'retracted' ? ' [retracted — this correction no longer stands]' : ''
      out(`  ${other}${ct === '' ? '' : ` (${ct})`}: ${entry}${withdrawn}`)
      ncorr++
    }
  }
  if (ncorr === 0) out('  (none)')

  out('  -- truths extracted from it --')

  const sourced = []
  for (const f of truthFiles(m)) {
    const raw = fm(f, 'source')
    const fsrc = canonId(raw) || raw
    if (fsrc !== ncanon) continue
    sourced.push(f)
    out(`  ${fm(f, 'id')}: ${fm(f, 'claim')}`)
  }

  // PROJECT-RELATIVE, the same rule every diagnostic follows. These three lists were the last
  // absolute paths either runtime printed, and they cannot be byte-compared while they name the
  // root: MSYS spells one file /d/repo/x and this runtime spells it D:/repo/x.
  const rel = p => (p.startsWith(`${m.root}/`) ? p.slice(m.root.length + 1) : p)

  // `grep -rl` — files under documents/ holding the id as a whole word, in traversal order.
  out('  -- documents citing it (by id) --')
  const idRx = new RegExp(`\\b${rxEscape(id)}\\b`)
  for (const f of walkFiles(m.documents)) if (idRx.test(readOr(f))) out(`  ${rel(f)}`)

  if (title !== '') {
    out('  -- documents mentioning its title --')
    for (const f of walkFiles(m.documents)) if (readOr(f).includes(title)) out(`  ${rel(f)}`)
  }

  // Through the truths. An external-audience document carries neither the material id nor its
  // title, so both greps above come back empty exactly when a retraction needs the radius. The
  // id -> truth -> document chain always exists, and plan.md's cited_truths is the propagation key.
  out('  -- documents citing its truths (via plan.md cited_truths) --')
  const hit = []
  for (const f of sourced) {
    const tid = canonId(basename(f, '.md')) || basename(f, '.md')
    for (const df of walkFiles(m.documents).filter(p => basename(p) === 'plan.md').sort()) {
      if (hit.includes(df)) continue
      // cited_truths is lenient too: canonicalise each listed id before comparing, or `t1` in a
      // plan silently drops the document from the radius.
      for (const cid of listField(fm(df, 'cited_truths'))) {
        if (canonId(cid) !== tid) continue
        hit.push(df); out(`  ${rel(df)}`); break
      }
    }
  }
  if (hit.length === 0) out('  (none)')
  return 0
}

export { existsSync }
