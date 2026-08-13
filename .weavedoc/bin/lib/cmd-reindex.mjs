// weavedoc reindex [--check] — regenerate truths/index.md and truths/tree.md from the truth files.
//
// These two files are GENERATED VIEWS: the truth files are the source, and anything hand-edited here
// is lost on the next run. `--check` is the read-only form that reports drift and writes nothing.
import { statSync, readdirSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs'
import { isFence, splitLines, truthLabels } from './core.mjs'
import { join } from './mine.mjs'
import { fmv } from './read.mjs'
import { requireInsideRoot, rename, readText, textBuf, U } from './write.mjs'
import { diffNormal, diffLines } from './diff.mjs'

// Two predicates, and the difference is load-bearing. `exists` is the truth-file population (bash
// counts that with `ls`, which lists a directory too); `isFile` is a material's converted.md, where
// a directory of that name really is not a material.
const exists = p => { try { statSync(p); return true } catch { return false } }
const isFile = p => { try { return statSync(p).isFile() } catch { return false } }
const lsOr = d => { try { return readdirSync(d) } catch { return [] } }

// EVERYTHING below works in the byte domain (one char per byte), because the claims and tags that
// end up in these generated views are copied verbatim out of the truth files and the bash awk that
// does it runs under LC_ALL=C. So the literals that go into the same strings are converted once,
// here, rather than being decoded UTF-8 mixed into byte-domain text.
const H_INDEX = U('# truths/index.md — 진실 색인 (generated, 수정 금지)')
const H_TREE = U('# truths/tree.md — 태그별 진실 (generated, 수정 금지)')
const SEP = U('··')          // opens the label tail
const SEP_SPLIT = U('· ·')   // what a claim's own `··` is broken into
const DASH = U(' — ')

// THE GLOB, not the strict id shape. bash hands awk the shell pattern `t[0-9]*.md`, which is 't',
// one digit, ANYTHING, '.md' — so `t01x.md` is indexed. mine.mjs's truthFiles() is deliberately
// stricter (validate uses it to name files that spell their id wrongly), and reusing it here would
// silently drop a file the original indexes.
const TRUTH_GLOB = /^t[0-9].*\.md$/

// reindex reads frontmatter with its OWN rule and it is NOT fmLoad's. Two differences, both
// measured against the original rather than read off it:
//   - LAST spelling of a key wins here; fmLoad keeps the FIRST
//   - a literal \x01 in a value becomes a space, because \x01 is the field separator the bash
//     version packs these records with and "the separator cannot occur in the text" is only true
//     if something removes it
function recVal (line) {
  let s = line.replace(/^[^:]*:[ \t]*/, '')
  if (!s.startsWith('"')) {
    s = s.replace(/[ \t]+#.*$/, '')
    if (s.startsWith('#')) s = ''
  }
  return s.replace(/[ \t]*$/, '').replace(/^"/, '').replace(/"$/, '').replace(/\u0001/g, ' ')
}

const FENCE = { test: isFence }   // the ONE fence spelling — core.mjs
const FIELDS = [
  ['id', /^id[ \t]*:/], ['claim', /^claim[ \t]*:/], ['source', /^source[ \t]*:/],
  ['tags', /^tags[ \t]*:/], ['as_of', /^as_of[ \t]*:/],
  ['provenance', /^provenance[ \t]*:/], ['assumptions', /^assumptions[ \t]*:/]
]

// One record per truth file, or none. A file whose line 1 is not the fence emits nothing, and so
// does a file whose frontmatter never closes — the record is written AT the closing fence.
function records (truthsDir, files) {
  const out = []
  for (const f of files) {
    const lines = splitLines(readText(join(truthsDir, f)))
    if (!FENCE.test(lines[0] ?? '')) continue
    const r = { id: '', claim: '', source: '', tags: '', as_of: '', provenance: '', assumptions: '' }
    let closed = false
    for (let i = 1; i < lines.length; i++) {
      if (FENCE.test(lines[i])) { closed = true; break }
      for (const [k, re] of FIELDS) if (re.test(lines[i])) { r[k] = recVal(lines[i]) }
    }
    if (!closed) continue
    r.tags = r.tags.replace(/[[\]"]/g, '')
    out.push(r)
  }
  return out
}

// LC_ALL=C ordering. The strings compared here are already one char per byte, so latin1 encoding
// reproduces the exact bytes the shell's sort sees — which UTF-16 code-unit order does not, above
// the BMP (a tag holding an emoji would sort into a different section).
const bytewise = (a, b) => Buffer.compare(Buffer.from(a, 'latin1'), Buffer.from(b, 'latin1'))

export function cmdReindex (m, out, errln, argv) {
  // A typo used to be silently ignored — `reindex --chek` meant "read-only check" to the user and
  // "rewrite both index files" to the tool. A write command must not guess.
  const a1 = argv[0] ?? ''
  if (a1 !== '' && a1 !== '--check') { errln('usage: weavedoc reindex [--check]'); return 2 }
  if ((argv[1] ?? '') !== '') { errln('usage: weavedoc reindex [--check]'); return 2 }
  const check = a1 === '--check'

  // EVERY glob match on disk, including a DIRECTORY wearing a truth filename (fixed 2026-08-04,
  // caught by the corpus scale, since retired with the bash runtime it compared against). The bash side counted with `ls "$TRUTHS"/t[0-9]*.md`, the same
  // expression census uses, and a directory is in that list — so bash refuses with
  //   "N truth file(s) but only M produced a record"  (rc 1)
  // while an isFile() filter here dropped it from the population, made the counts agree, and
  // returned 0. That is fail-OPEN on exactly the shape the count exists to catch: a name in the
  // truth population that no index entry can ever represent. `records()` skips it either way (a
  // directory reads as no lines, so its line 1 is not the fence), which is what makes the counts
  // disagree and the refusal fire.
  const files = lsOr(m.truths).filter(n => TRUTH_GLOB.test(n) && exists(join(m.truths, n))).sort(bytewise)
  if (files.length === 0) { out('no truths to index'); return 0 }
  const recs = records(m.truths, files)

  // Material stage/status come from the ORDINARY frontmatter cache (first key wins) — the asymmetry
  // with the truth reader above is real and is reproduced, not harmonised.
  const mstage = new Map(); const mstat = new Map()
  for (const d of lsOr(m.materials)) {
    const f = join(m.materials, d, 'converted.md')
    if (!isFile(f)) continue
    mstage.set(d, fmv(f, 'stage'))
    mstat.set(d, fmv(f, 'status'))
  }

  const idx = [H_INDEX, '']
  const pairs = []
  const tcnt = new Map()
  for (const r of recs) {
    if (r.id === '') continue
    // ` ·· ` opens the label tail, and pull strips it before matching — so a claim that happens to
    // contain the separator must not be able to truncate its own searchable text.
    const claim = r.claim.replaceAll(SEP, SEP_SPLIT)
    const tags = r.tags.replaceAll(SEP, SEP_SPLIT)
    const ms = r.source !== '' ? (mstage.get(r.source) ?? '') : ''
    const mss = r.source !== '' ? (mstat.get(r.source) ?? '') : ''
    // U encodes the label's own LITERALS only. `as_of` and `assumptions` are byte-domain values
    // copied out of the truth file and must pass through untouched — a Korean `as_of` (eclypse has
    // them: "유나 캐스팅 시점") is free text, not a date, and re-encoding it produced mojibake.
    const lab = truthLabels(r.as_of, r.provenance, r.assumptions, ms, mss, U)
    // No status suffix in v3: a card in the index is canonical by existence, so `[discarded]` and
    // its siblings have nothing to mark. The label tail (as_of/provenance/material axis) survives.
    let line = `- ${r.id}: ${claim} [${r.source}]${DASH}[${tags}]`
    let sfx = ''
    if (lab !== '') { line += ` ${SEP}${lab}`; sfx += ` ${SEP}${lab}` }
    idx.push(line)
    for (let t of tags.split(',')) {
      t = t.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '')
      if (t === '') continue
      const n = (tcnt.get(t) ?? 0) + 1
      tcnt.set(t, n)
      pairs.push([t, String(n).padStart(6, '0'), `- ${r.id}: ${claim}${sfx}`])
    }
  }

  // Tag sections in bytewise order (ASCII first, then Korean — the standing convention); within a
  // section, truths keep id order via the counter. The comparison is on BYTES because the bash side
  // sorts under LC_ALL=C, and a tag holding an emoji sorts differently under UTF-16 code units.
  pairs.sort((x, y) => bytewise(x[0], y[0]) || (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0))
  const tree = [H_TREE, '']
  let prev = null
  for (const [tag, , body] of pairs) {
    if (tag !== prev) { if (prev !== null) tree.push(''); tree.push(`## ${tag}`); prev = tag }
    tree.push(body)
  }

  const text = ls => ls.map(l => `${l}\n`).join('')
  if (check) {
    let rc = 0
    // A truth file with no frontmatter emits no record, so it is missing from BOTH the regenerated
    // index and the file on disk — and the diff called that "in sync" while census and validate both
    // reported drift. The check that exists to catch index drift went green on it.
    if (files.length !== recs.length) {
      out(`reindex: ${files.length} truth file(s) but only ${recs.length} produced a record — the rest have no readable frontmatter (line 1 must be '---'); index/tree cannot represent them`)
      rc = 1
    }
    for (const [name, want] of [['index.md', idx], ['tree.md', tree]]) {
      // `tr -d '\r'` — every CR, not just a trailing one, and a missing file compares as empty.
      const disk = readText(join(m.truths, name)).replace(/\r/g, '')
      const w = text(want)
      if (disk === w) { out(`${name}: in sync`); continue }
      out(`${name}: DIFFERS from regenerated content:`)
      // `diff <on-disk> <regenerated>` — that argument order is the original's, and it decides
      // which side is `<` and which is `>`. It is also the OPPOSITE of the order used for the
      // in-sync test above, which is why the two are written out separately rather than shared.
      const d = diffLines(disk); const g = diffLines(w)
      // Emitted as BYTES: these lines are the mine's own content quoted back, and the bash runtime
      // prints exactly the bytes it read. Handing them out as a decoded string would re-encode them.
      for (const l of diffNormal(d.lines, g.lines, d.noEol, g.noEol).slice(0, 20)) out(textBuf(l))
      rc = 1
    }
    return rc
  }

  // Same-filesystem staging + atomic rename (WD-IO-001): a bare copy can die mid-write and leave a
  // half index behind. Failures propagate, they do not vanish.
  if (!requireInsideRoot(m.root, m.truths, 'reindex', errln)) return 1
  // BOTH views are staged before EITHER is renamed. Writing one and then discovering the other
  // cannot be written would leave index.md describing a tree.md that was never regenerated — two
  // generated views that disagree is worse than neither being updated.
  //
  // STAGING BOTH IS NOT ENOUGH, and the gap was measured (2026-08-05): with tree.md unreplaceable,
  // the FIRST rename still landed, so index.md was regenerated next to an untouched tree.md — the
  // exact split this comment claims to prevent — and the command then printed "the staged copies
  // were discarded", which was FALSE about the one that had not been. A message that misreports the
  // state is worse than the state. So the first rename is now UNDOABLE: the old index bytes are
  // held in memory until the second rename lands.
  const sti = join(m.truths, `.index.md.tmp.${process.pid}`)
  const stt = join(m.truths, `.tree.md.tmp.${process.pid}`)
  const idxPath = join(m.truths, 'index.md')
  // ABSENT and UNREADABLE are different states here too (v0.5.1, external review P1-1). Folding a
  // read failure into "no index yet" gave the undo path the WRONG null: after the first rename
  // landed and the second failed, "restore the old bytes" became "delete the file", and the command
  // reported "index.md was rolled back" over an index it had just destroyed. An existing index this
  // command cannot read is an index it cannot promise to put back — so it refuses BEFORE touching
  // anything, while both views are still exactly as they were.
  let oldIdx = null
  try { oldIdx = readFileSync(idxPath) } catch (e) {
    if (e.code !== 'ENOENT') {
      errln(`reindex: the existing truths/index.md cannot be read (${e.code}) — refusing: if the tree.md write then failed, the old index could not be put back. Fix the file first (permissions, or a directory wearing its name); nothing was touched`)
      return 1
    }
  }
  let landed = 0
  let err = null
  try {
    writeFileSync(sti, textBuf(text(idx)))
    writeFileSync(stt, textBuf(text(tree)))
    rename(sti, idxPath); landed = 1
    rename(stt, join(m.truths, 'tree.md')); landed = 2
  } catch (e) { err = e }
  if (landed !== 2) {
    for (const p of [sti, stt]) { try { unlinkSync(p) } catch { /* never staged, or already renamed */ } }
    if (landed === 1) {
      // index.md was replaced and tree.md was not. Put the old index back, and VERIFY it went back —
      // a rollback nobody checked is the same class of claim as the message this replaced.
      let restored = false
      try {
        if (oldIdx === null) { unlinkSync(idxPath); restored = true } else {
          const und = join(m.truths, `.index.md.undo.${process.pid}`)
          writeFileSync(und, oldIdx)
          rename(und, idxPath)
          restored = readFileSync(idxPath).equals(oldIdx)
        }
      } catch { restored = false }
      if (!restored) {
        errln(`reindex: tree.md could not be replaced (${err?.code ?? 'unknown'}) AND index.md could not be put back — the two generated views now disagree. Fix the tree.md target, then re-run reindex; do not trust index.md until you do`)
        return 1
      }
      errln(`reindex: tree.md could not be replaced (${err?.code ?? 'unknown'}) — index.md was rolled back, so both views are as they were. Neither is updated`)
      return 1
    }
    errln(`reindex: write failed (${err?.code ?? 'unknown'}) — the staged copies were discarded, both views are as they were`)
    return 1
  }
  out(`regenerated truths/index.md + truths/tree.md (${recs.length} truths)`)
  return 0
}
