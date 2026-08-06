// weavedoc status — where each document stands, and what is waiting on the user.
// weavedoc status --open — the waiting items THEMSELVES, one line each: the mechanical source for
// the skills' "Surface, don't point" rule (a run's closing message must carry every item waiting
// on the user — the listing is pasted/rendered, never re-composed from memory).
import { existsSync, statSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { splitLines } from './core.mjs'
import { nocomment, sectionAll, defence, commentBalanced } from './sections.mjs'
import { fm, join, docIds, materialIds, truthFiles, basename } from './mine.mjs'
import { fidBody, isNoise } from './review.mjs'

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
// sectionAll caps heading depth at six (v0.5.4), so this reader and validate's own Human-queue
// walker answer alike about a `####### Human queue`: not a heading, therefore not a section.
export const hqBody = file => sectionAll(nocomment(readOr(file)), 'Human queue')

// ---- the open-item collectors (v0.5.5) -------------------------------------------------------
// ONE walk per ledger, shared between the `status` counters and the `--open` listing — a count the
// listing disagrees with is the two-readers drift class (the whole v0.5.4 theme), so the counters
// below derive from the same collected entries the listing prints. The line rules are the
// counters' own, kept exactly: a placeholder bullet is template noise; an open entry matches
// `- [open]` with the counter's indentation tolerance; an untagged ENTRY starts at column 0 (an
// indented `- ` is a sub-bullet OF an entry), and `- (없음)` / `- (none)` is the documented
// empty-queue idiom, not an entry.
export function hqOpenEntries (m) {
  const rel = p => (p.startsWith(`${m.root}/`) ? p.slice(m.root.length + 1) : p)
  const out = []
  for (const f of hqFiles(m)) {
    for (const l of splitLines(hqBody(f))) {
      if (/^[ \t]*- [[][{<]/.test(l)) continue
      if (/^[ \t]*- \[open\]/.test(l)) out.push({ file: rel(f), line: l })
    }
  }
  return out
}
export function hqUntaggedEntries (m) {
  const rel = p => (p.startsWith(`${m.root}/`) ? p.slice(m.root.length + 1) : p)
  const out = []
  for (const f of hqFiles(m)) {
    for (const l of splitLines(hqBody(f))) {
      if (/^- \[[<{]/.test(l)) continue
      if (!/^- /.test(l)) continue
      if (/^- \((없음|none)\)/.test(l)) continue
      if (/^- \[(open|ruled)\]/.test(l)) continue
      out.push({ file: rel(f), line: l })
    }
  }
  return out
}

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
  // The counts come from the SAME collectors `--open` lists from, so the two modes cannot disagree.
  const files = hqFiles(m)
  if (files.length > 0) {
    const open = hqOpenEntries(m)
    const hqOpen = open.length
    const hqUntag = hqUntaggedEntries(m).length
    if (hqOpen > 0) {
      // The three buckets must SUM to the total. A `- [open]` with no ownership tag lands in the
      // total but in no bucket, so the remainder is shown rather than hidden until validate rejects it.
      const u = open.filter(e => /^[ \t]*- \[open\][ \t]*\[user-only\]/.test(e.line)).length
      const r = open.filter(e => /^[ \t]*- \[open\][ \t]*\[recommended\]/.test(e.line)).length
      const mm = open.filter(e => /^[ \t]*- \[open\][ \t]*\[machine\]/.test(e.line)).length
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

// ---- weavedoc status --open ------------------------------------------------------------------
// Lists, in the skill rule's category order, every item a run can end waiting on: conflicts ·
// open questions · Human-queue entries · fidelity violations · open gaps. Read-only, exit 0 —
// a report, not a gate (validate blocks; this shows).
//
// Each category rides an EXISTING reader, never a parser of its own: conflicts through fm (fmVal's
// quote peeling included — `status: "conflict"` is a conflict), the Human queue through the
// collectors above, violations through the gate's own fidBody + isNoise (so the listing and the
// gate cannot answer differently about one file), questions.md and gaps.md through the
// nocomment + defence pass the gaps CLI reader uses. What a reader cannot see is NAMED: an
// unterminated '<!--' or code fence gets a warning line instead of a silently shorter list, and
// the nothing-waiting line is withheld while any such warning stands (a claim the reader cannot
// honestly make). review.md keeps the gate's own stance — nocomment, no fence pass — because a
// listing stricter than the gate would be a second judgment about the gate's file.
export function cmdStatusOpen (m, out) {
  const rel = p => (p.startsWith(`${m.root}/`) ? p.slice(m.root.length + 1) : p)
  const warns = []
  const seen = new Set()
  const warnComment = (label, file) => {
    if (seen.has(file)) return
    seen.add(file)
    if (existsSync(file) && !commentBalanced(file)) {
      warns.push(`warning: ${label} ends inside an unterminated '<!--' — entries behind it are invisible to this listing`)
    }
  }
  const warnFence = label => {
    warns.push(`warning: ${label} ends inside an unterminated code fence — entries behind it are invisible to this listing`)
  }

  // conflicts — every truth whose status is `conflict`, both sides of each pair by construction
  // (map stamps both files). truthFiles is bytewise-sorted, so the order is stable.
  const conflicts = []
  for (const f of truthFiles(m)) {
    if (fm(f, 'status') !== 'conflict') continue
    conflicts.push({ id: basename(f).replace(/\.md$/, ''), claim: fm(f, 'claim'), cw: fm(f, 'conflict_with') })
  }

  // open questions — `open` and `proposed` are waiting (proposed = candidates on the table,
  // nothing confirmed); a recognized closed state (`answered`) stays out. The state vocabulary
  // comes from the SCHEMA (`questions.enum.status`) — it was declared all along, and hardcoding it
  // here would be the declared-but-unread class again. Entries open at column 0 (FORMATS).
  // questions.md is the one ledger no validator reads, so a state outside the enum (`[Open]`,
  // `[ ]`) has no check to fail — silently dropping it would let the nothing-waiting line stand
  // over a visibly open question, so an unrecognized state is LISTED as such instead (the
  // untagged-entry rule, applied to this ledger).
  const qPath = join(m.root, 'questions.md')
  const qEnum = m.sch.get('questions.enum.status') || 'open|proposed|answered'
  const qStates = qEnum.split('|').filter(Boolean)
  const qWaiting = ['open', 'proposed'].filter(s => qStates.includes(s))
  let questions = []
  let qUnknown = []
  if (existsSync(qPath)) {
    warnComment('questions.md', qPath)
    const df = defence(nocomment(readOr(qPath)))
    if (df.open) warnFence('questions.md')
    for (const l of splitLines(df.text)) {
      if (!/^- \[/.test(l)) continue
      if (/^- \[[<{]/.test(l)) continue
      const mm = /^- \[([^\]]*)\]/.exec(l)
      const st = mm ? mm[1] : null
      if (st !== null && qWaiting.includes(st)) questions.push(l)
      else if (st === null || !qStates.includes(st)) qUnknown.push(l)
    }
  }

  // Human queue — the same collectors the `status` counters derive from (one walk, two renderings).
  const hqO = hqOpenEntries(m)
  const hqU = hqUntaggedEntries(m)
  for (const f of hqFiles(m)) warnComment(rel(f), f)

  // fidelity violations — the gate's entries through the gate's sole readers. The sections/kinds
  // derivation is CONSECRATE'S spelling, character for character — this reader sits on the utf8
  // side of the pre-existing domain split (validate re-reads the schema in latin1; CLI readers are
  // utf8 — known issue since v0.5.4), and a third spelling would be a third answer. No warnComment
  // here: every existing review.md is already in hqFiles, so the Human-queue pass above warned it.
  const sections = (m.sch.get('review.sections') ?? '').split('|')
  const kinds = (m.sch.get('review.enum.kind') ?? '').split('|').filter(Boolean)
  const viol = []
  for (const d of docIds(m)) {
    const rev = join(m.documents, d, 'review.md')
    if (!existsSync(rev)) continue
    for (const line of fidBody(rev, sections)) {
      if (isNoise(line, kinds)) continue
      viol.push({ doc: d, rev, line })
    }
  }

  // open gaps — the gaps CLI reader's exact rules: defence over nocomment, the section name from
  // the schema, entries at column 0, a placeholder bullet is noise.
  const gPath = join(m.root, 'gaps.md')
  let gaps = []
  if (existsSync(gPath)) {
    warnComment('gaps.md', gPath)
    const df = defence(nocomment(readOr(gPath)))
    if (df.open) warnFence('gaps.md')
    const secOpen = (m.sch.get('gaps.sections') || 'Open|Accepted').split('|')[0] || 'Open'
    gaps = splitLines(sectionAll(df.text, secOpen))
      .filter(l => !/^[ \t]*- [[][{<]/.test(l))
      .filter(l => /^- /.test(l))
  }

  for (const w of warns) out(w)
  const total = conflicts.length + questions.length + qUnknown.length + hqO.length + hqU.length + viol.length + gaps.length
  if (total === 0) {
    if (warns.length === 0) out('nothing is waiting on you — no open conflicts, open questions, human-queue entries, fidelity violations, or open gaps.')
    return 0
  }
  if (conflicts.length > 0) {
    out(`conflicts (${conflicts.length}):`)
    // An empty conflict_with is a mine validate rejects — named here rather than a dangling arrow.
    for (const c of conflicts) out(`  ${c.id} ⇄ ${c.cw === '' ? '(unrecorded)' : c.cw} — ${c.claim}`)
  }
  if (questions.length > 0 || qUnknown.length > 0) {
    out(qUnknown.length > 0 ? `questions (${questions.length} waiting, ${qUnknown.length} unrecognized state):` : `questions (${questions.length}):`)
    for (const l of questions) out(`  ${l}`)
    for (const l of qUnknown) out(`  (unrecognized state — the enum is ${qEnum}): ${l}`)
  }
  if (hqO.length > 0 || hqU.length > 0) {
    out(hqU.length > 0 ? `human queue (${hqO.length} open, ${hqU.length} untagged):` : `human queue (${hqO.length}):`)
    for (const e of hqO) out(`  ${e.file}: ${e.line}`)
    for (const e of hqU) out(`  ${e.file} (untagged): ${e.line}`)
  }
  if (viol.length > 0) {
    out(`fidelity violations (${viol.length}):`)
    // fidBody's lines are byte-domain (latin1) — concatenated as BYTES so the mine's own bytes
    // reach stdout, exactly as validate prints them; the label is the file's REAL path (rel), the
    // same label the Human-queue lines carry — one file, one spelling, even on a redirected mine.
    for (const v of viol) out(Buffer.concat([Buffer.from(`  ${rel(v.rev)}: `, 'utf8'), Buffer.from(v.line, 'latin1')]))
  }
  if (gaps.length > 0) {
    out(`gaps (${gaps.length}):`)
    for (const l of gaps) out(`  ${l}`)
  }
  return 0
}
