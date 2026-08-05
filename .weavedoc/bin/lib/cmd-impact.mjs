// weavedoc impact <material-id> — the blast radius of a material.
//
// Every id here is a REFERENCE, resolved leniently (`m1` names folder m001). Judging by raw string
// made impact report an EMPTY blast radius exactly where a retraction needs it, which is the one
// moment the command exists for.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import { canonId, listField } from './core.mjs'
import { fm, mtitle, truthFiles, walkFiles, join } from './mine.mjs'

const readOr = p => { try { return readFileSync(p, 'utf8') } catch { return '' } }
const rxEscape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function cmdImpact (m, out, id) {
  if (!id) { out('usage: weavedoc impact <material-id>'); return 2 }
  let isDir = false
  try { isDir = statSync(join(m.materials, id)).isDirectory() } catch { /* not there */ }
  if (!isDir) { out(`no such material: ${id}`); return 2 }

  const title = mtitle(m, id)
  out(`impact of material ${id} (${title}):`)
  out('  -- truths extracted from it --')
  const ncanon = canonId(id) || id

  const sourced = []
  for (const f of truthFiles(m)) {
    const raw = fm(f, 'source')
    const fsrc = canonId(raw) || raw
    if (fsrc !== ncanon) continue
    sourced.push(f)
    out(`  ${fm(f, 'id')}: ${fm(f, 'claim')} [${fm(f, 'status')}]`)
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
