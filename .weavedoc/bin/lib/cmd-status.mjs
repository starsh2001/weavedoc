// weavedoc status — where each document stands, and what is waiting on the user.
// weavedoc status --open — the waiting items THEMSELVES, one line each: the mechanical source for
// the skills' "Surface, don't point" rule (a run's closing message must carry every item waiting
// on the user — the listing is pasted/rendered, never re-composed from memory).
import { existsSync, statSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { splitLines, U, TAG_SEP } from './core.mjs'
import { nocomment, sectionAll, defence, commentBalanced } from './sections.mjs'
import { fmvB, loadSchema } from './read.mjs'
import { fm, join, docIds, materialIds, truthFiles, basename } from './mine.mjs'
import { fidBody, isNoise } from './review.mjs'
import { scanRegister, stubEntry, stubLine, emptyRemainder, hasContent } from './gaps-register.mjs'

// Each ledger's entry PREFIX, so "does this entry's line carry content?" is asked the same way in
// all three (gaps.md's lives with the register reader). Human queue: the state slot plus an
// optional ownership slot. questions.md: the state slot.
const HQ_TAG = new RegExp(`^- \\[[^\\]]*\\]${TAG_SEP}*(\\[[^\\]]*\\])?`)
const Q_TAG = /^- \[[^\]]*\]/
// The counter's indentation tolerance for an `[open]` entry — the SAME class, one position earlier
// (cold review, v0.5.11): validate strips `TAG_SEP` before testing a line, status tolerated `[ \t]`,
// so a `\v`-indented `- [open]` was an entry to the gate and invisible to both status surfaces.
// Only these two tests widen: the UNTAGGED rule still demands column 0, because there an indented
// bullet is a sub-bullet of the entry above (acct_openlist_subbullets_stay_detail).
const HQ_OPEN = new RegExp(`^${TAG_SEP}*- \\[open\\]`)
const HQ_STUB_OPENER = new RegExp(`^${TAG_SEP}*- [[][{<]`)

const isDir = p => { try { return statSync(p).isDirectory() } catch { return false } }

// BYTES, everywhere in the --open path. The register reader's `strip()` is a class of BYTES, so a
// UTF-8-decoded gaps.md judges stubs differently from the one validate reads (v0.5.6) — and a line
// quoted back to the user must be the bytes the mine holds, which is why validate is byte-domain
// too. `readOr` returns null on failure so a listing can tell "no entries" from "could not read":
// reporting an unreadable ledger as empty is the silence this command exists to end.
const readOrNull = p => { try { return readFileSync(p).toString('latin1') } catch { return null } }
const readOr = p => readOrNull(p) ?? ''

// A NON-ASCII LITERAL IN A PATTERN MUST BE SPELLED IN BYTES once the text it matches is bytes.
// `U()` is that spelling (utf8 → latin1), the same one validate's `M` template applies to every
// message it builds. This is not theory: v0.5.6 moved these readers to the byte domain and the
// documented empty-queue idiom `- (없음)` stopped matching — its three UTF-8 bytes are not the
// three characters in this file's source — so an empty queue reported itself as an untagged entry
// (caught by acct_status_empty_queue_idiom, which is why that case exists).
// ANCHORED, and that is the second half of the rule: this is the EMPTY-ledger idiom, so it means
// "this line is the idiom and nothing else". Unanchored, `- (none) 실제로는 질문임` — a real entry
// that merely opens with the words — was swallowed and the ledger read as empty (external review,
// v0.5.6). `\r` is in the trailing class for the same reason `isFence` keeps it (core.mjs):
// splitLines removes ONE trailing CR, so the member covers a line that carried a stray one
// mid-way or a second one — NOT "splitLines leaves CRs", which is false and was the first
// spelling of this comment (cold review, v0.5.7).
const NONE_IDIOM = new RegExp(`^- \\((${U('없음')}|none)\\)[ \t\r]*$`)

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

// ONE CLASSIFIER — precisely that, and no more (v0.5.6 said "one walk", and an external review
// measured the claim: `--open` still re-reads these files for its own diagnostics, and
// commentBalanced reads them again). What is single is the JUDGMENT: both buckets come out of one
// pass over one body, so the `status` counters and the `--open` listing cannot answer differently
// about the same file. Since v0.5.10 a placeholder bullet is judged by its REMAINDER (a pure stub
// is held for a continuation to realize; real content after template tags surfaces as untagged) —
// the line rules below are otherwise the counters' own, kept exactly: a full-template bullet
// is template noise; an open entry matches `- [open]` with the counter's indentation tolerance; an
// untagged ENTRY starts at column 0 (an indented `- ` is a sub-bullet OF an entry), and
// `- (없음)` / `- (none)` is the documented empty-queue idiom, not an entry.
export function hqEntries (m) {
  const rel = p => (p.startsWith(`${m.root}/`) ? p.slice(m.root.length + 1) : p)
  const open = []
  const untagged = []
  for (const f of hqFiles(m)) {
    const label = rel(f)
    // `last` — the listed entry a continuation folds into, set only when the entry's own line is
    // nothing but its tags (emptyRemainder); an entry that HAS content keeps its sub-bullets as
    // dropped detail (acct_openlist_subbullets_stay_detail). `held` — a pure placeholder stub
    // waiting for a continuation to REALIZE it, the machine gaps.md had all along (scanRegister's
    // gnoise) and this ledger lacked: dropping the stub immediately left the continuation carrying
    // the actual content with nothing to attach to, and the item vanished (external review,
    // v0.5.10 — `- [{state}] [{ownership}]` + indented content reported "nothing is waiting").
    let last = null
    let held = null
    for (const l of splitLines(hqBody(f))) {
      if (!/[^ \t]/.test(l)) { last = null; held = null; continue }
      if (!HQ_STUB_OPENER.test(l) && HQ_OPEN.test(l)) {
        held = null
        // `raw` is the ENTRY LINE, never mutated; `line` is the display, which folding extends.
        // The bucket classifiers read raw: ownership lives on the entry line (FORMATS — two fixed
        // tags, then prose), and classifying the FOLDED line once put an entry in "machine can
        // just do" while validate rejected it — the two surfaces disagreeing about one entry, the
        // exact class this whole lane exists to end (cold review, v0.5.10 — critical).
        open.push({ file: label, line: l, raw: l })
        last = emptyRemainder(l, HQ_TAG) ? { a: open, i: open.length - 1 } : null
        continue
      }
      // A placeholder-OPENING bullet: the remainder decides (FORMATS), same as everywhere else.
      // Empty remainder → a stub, held for realization. Real remainder → an entry whose state slot
      // is a template, i.e. an entry with no valid state tag — surfaced as untagged, where the
      // v0.5.5 prefix rule used to drop it wholesale (external review, v0.5.10).
      if (/^- \[[<{]/.test(l)) {
        last = null
        if (stubLine(l, HQ_TAG)) held = l
        else { held = null; untagged.push({ file: label, line: l, raw: l }) }
        continue
      }
      if (!/^- /.test(l) || NONE_IDIOM.test(l) || /^- \[(open|ruled)\]/.test(l)) {
        // An INDENTED non-empty line realizes a held stub (its content lives here), or continues an
        // empty-remainder entry; anything else at column 0 closes both holds.
        if (/^[ \t]+[^ \t]/.test(l)) {
          const cont = l.replace(/^[ \t]+/, '')
          // A held stub is realized only by a continuation that HAS content once template tokens
          // are stripped — the register's own rule (v0.5.11). A placeholder-only continuation
          // leaves the hold standing, so a real line further down still realizes it.
          if (held !== null && hasContent(cont)) {
            untagged.push({ file: label, line: `${held} ${cont}`, raw: held })
            last = { a: untagged, i: untagged.length - 1 }
            held = null
          } else if (held === null && last !== null) last.a[last.i].line += ` ${cont}`
        } else if (!/^[ \t]/.test(l)) { last = null; held = null }
        continue
      }
      held = null
      untagged.push({ file: label, line: l, raw: l })
      last = emptyRemainder(l, HQ_TAG) ? { a: untagged, i: untagged.length - 1 } : null
    }
  }
  return { open, untagged }
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
  // The counts come from the SAME classifier `--open` lists from, so the two modes cannot disagree.
  const files = hqFiles(m)
  if (files.length > 0) {
    const { open, untagged } = hqEntries(m)
    const hqOpen = open.length
    const hqUntag = untagged.length
    if (hqOpen > 0) {
      // The three buckets must SUM to the total. A `- [open]` with no ownership tag lands in the
      // total but in no bucket, so the remainder is shown rather than hidden until validate rejects it.
      // Classified on e.raw — the entry line, never the folded display (cold review, v0.5.10) —
      // through TAG_SEP, the one class checkHqTags strips, at BOTH positions (before the bullet and
      // between the tags). Every earlier spelling of this comment named a narrower class and
      // claimed `\r` could not reach here; a mid-line `\r` can, and did (v0.5.11).
      const owned = own => new RegExp(`^${TAG_SEP}*- \\[open\\]${TAG_SEP}*\\[${own}\\]`)
      const u = open.filter(e => owned('user-only').test(e.raw)).length
      const r = open.filter(e => owned('recommended').test(e.raw)).length
      const mm = open.filter(e => owned('machine').test(e.raw)).length
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
// Each category rides an EXISTING judge, never a parser of its own — v0.5.5 got this wrong in the
// one place it mattered (the gaps register, where it copied the looser tally rule and reported a
// blocking gap as "nothing is waiting"), so the rule is now literal: gaps through `scanRegister`,
// the SAME function validate counts with; fidelity violations through the gate's own fidBody +
// isNoise with consecrate's derivation; the Human queue through the shared classifier above; question
// entries through isNoise's remainder rule, which already covers both template dialects.
//
// What a reader cannot see is NAMED — an unreadable file, an unterminated '<!--' or code fence each
// get their own warning line, and the nothing-waiting sentence is withheld while any of them
// stands (a claim the reader cannot honestly make). Reporting an unreadable ledger as empty, or as
// an unterminated comment, would be the same silence one level down.
export function cmdStatusOpen (m, out) {
  const rel = p => (p.startsWith(`${m.root}/`) ? p.slice(m.root.length + 1) : p)
  // TWO ENCODERS, and mixing them up is the whole reason they are named: `B` is a line that CAME
  // FROM the mine (latin1 in, latin1 out = the file's own bytes, unchanged), `T` is text this
  // command wrote (utf8). Passing a decorated string through `B` truncates every code point above
  // 255 — the first build of this printed `t002 (m002) ? [t001]  claim`, its own `⇄` and `—`
  // destroyed by the encoder meant for the file's bytes.
  const B = s => Buffer.from(s, 'latin1')
  const T = s => Buffer.from(s, 'utf8')
  // `prefix` is TEXT this command wrote (labels, paths — utf8), `line` is the file's own bytes.
  // Encoding a path through B truncated every code point above 255 and turned `산출물/` into bytes
  // that included a literal `<` — a printed path that was no longer a path (cold review, v0.5.6).
  const outB = (prefix, line) => out(Buffer.concat([T(prefix), B(line)]))
  // THE SCHEMA IS READ IN THE FILE'S DOMAIN for anything matched AGAINST file text. `m.sch` is
  // utf8; the ledgers here are bytes. A non-ASCII `gaps.sections` (this is a Korean-first product,
  // and v0.5.4 review #6 measured a renamed register on purpose) then matched no heading at all,
  // `scanRegister` received an empty body, and the listing said "nothing is waiting" over a gap
  // validate blocks on — the EXACT defect this release repairs, re-entering through the domain
  // door (cold review, v0.5.6). Same reason validate keeps its own latin1 schema map.
  const schB = loadSchema(m.schemaPath, 'latin1')
  const warns = []
  const seen = new Set()
  // Read + diagnose in one place: a file that cannot be READ must not be reported as one that ends
  // inside a comment (commentBalanced answers false for both, which conflated them in v0.5.5).
  const readLedger = (label, file) => {
    const text = readOrNull(file)
    if (text === null) {
      warns.push(`warning: ${label} exists but cannot be read — its entries are missing from this listing`)
      return null
    }
    if (!seen.has(file)) {
      seen.add(file)
      if (!commentBalanced(file)) warns.push(`warning: ${label} ends inside an unterminated '<!--' — entries behind it are invisible to this listing`)
    }
    return text
  }

  // conflicts — every truth whose status is `conflict`, both sides of each pair by construction
  // (map stamps both files), each with the SOURCE material behind it: the skills' rule is that a
  // conflict names both sides and where each comes from. truthFiles is bytewise-sorted, so the
  // order is stable. A truth file that cannot be read is named rather than silently skipped —
  // truthFiles answers "what is named like a truth", and a directory named t002.md is in it.
  const conflicts = []
  for (const f of truthFiles(m)) {
    if (readOrNull(f) === null) {
      warns.push(`warning: ${rel(f)} cannot be read — if it holds a conflict, it is missing from this listing`)
      continue
    }
    if (fmvB(f, 'status') !== 'conflict') continue
    conflicts.push({
      id: basename(f).replace(/\.md$/, ''),
      claim: fmvB(f, 'claim'),
      cw: fmvB(f, 'conflict_with'),
      src: fmvB(f, 'source')
    })
  }

  // open questions — `open` and `proposed` are waiting (proposed = candidates on the table, nothing
  // confirmed); a recognized closed state (`answered`) stays out. The vocabulary comes from the
  // SCHEMA (`questions.enum.status`), which was declared all along — hardcoding it here would be
  // the declared-but-unread class again (and v0.5.6 put the key in validate's roster, so a schema
  // that loses it is reported rather than silently swapped for this fallback).
  //
  // questions.md is the one ledger no validator reads, so a state outside the enum, a template
  // slot over a written-out body, or no bracket at all has NOTHING to fail — dropping any of them
  // would print "nothing is waiting" over a visibly open question (external review, v0.5.5). Only a
  // bullet that is placeholders THROUGHOUT is noise — judged by the REGISTER's `stubEntry`, not by
  // isNoise (whose known limit inverts here; see the note at the stub test below), and a stub is
  // HELD rather than dropped so a continuation carrying real content can realize it.
  const qPath = join(m.root, 'questions.md')
  const qEnum = schB.get('questions.enum.status') || 'open|proposed|answered'
  const qStates = qEnum.split('|').filter(Boolean)
  const qWaiting = ['open', 'proposed'].filter(s => qStates.includes(s))
  const questions = []
  const qUnknown = []
  if (existsSync(qPath)) {
    const raw = readLedger('questions.md', qPath)
    if (raw !== null) {
      const df = defence(nocomment(raw))
      if (df.open) warns.push("warning: questions.md ends inside an unterminated code fence — entries behind it are invisible to this listing")
      // `qlast` — the listed entry a continuation folds into, as an APPENDER rather than an index
      // (the two buckets hold different shapes). `qheld` — a pure template stub waiting for a
      // continuation to REALIZE it: dropping the stub on sight left `- [<status>]` + an indented
      // real question with nothing to attach to, and the ledger no validator reads printed
      // "nothing is waiting" over it (external review, v0.5.10 — the gaps machine, applied here).
      let qlast = null
      let qheld = null
      for (const l of splitLines(df.text)) {
        if (!/[^ \t]/.test(l)) { qlast = null; qheld = null; continue }
        if (!/^- /.test(l)) {                         // an entry opens at column 0 (FORMATS)
          // …so an indented line is a continuation: it realizes a held stub (the entry's content
          // lives here — its state slot is a template, so it surfaces as unrecognized, the same
          // bucket its inline-filled twin lands in), or continues an empty-remainder entry.
          if (/^[ \t]+[^ \t]/.test(l)) {
            const cont = l.replace(/^[ \t]+/, '')
            // Same realization rule as the Human queue and the register: template tokens are not
            // content, so the shipped template's own `<where> — <what>` line cannot turn a
            // template into a reported waiting item (v0.5.11).
            if (qheld !== null && hasContent(cont)) {
              qUnknown.push({ line: `${qheld} ${cont}`, why: 'unrecognized state' })
              const e = qUnknown[qUnknown.length - 1]
              qlast = s => { e.line += ` ${s}` }
              qheld = null
            } else if (qheld === null && qlast !== null) qlast(cont)
          } else if (!/^[ \t]/.test(l)) { qlast = null; qheld = null }
          continue
        }
        qlast = null
        qheld = null
        if (NONE_IDIOM.test(l)) continue              // the empty-ledger idiom (FORMATS)
        const mm = /^- \[([^\]]*)\]/.exec(l)
        // NO BRACKET IS JUDGED BEFORE isNoise, not after: isNoise answers "prose or entry" for a
        // ledger whose entries all carry brackets, so a bracket-less bullet reads as prose there —
        // which is exactly the shape that must NOT be dropped here (a question nobody tagged is
        // still a question waiting on the user, and no validator reads this file).
        if (!mm) {
          qUnknown.push({ line: l, why: 'no state tag' })
          // No bracket at all, so the whole line is content — nothing to fold into.
          continue
        }
        const foldable = emptyRemainder(l, Q_TAG)
        // THE STUB TEST IS THE REGISTER'S, not isNoise's. isNoise carries a documented known limit
        // — prose holding a `<…>`/`{…}` token reads as a placeholder — whose safe direction is
        // "never a new false block". In THIS consumer the same limit points the other way: a real
        // question mentioning `<미정>` would be silently dropped and the run would report "nothing
        // is waiting" (cold review, v0.5.6). `stubEntry` asks the register's question instead —
        // is the slot a placeholder AND is what follows empty once template tokens are removed —
        // which is the rule FORMATS states for both ledgers. HELD, not dropped (v0.5.10): a
        // continuation below may be carrying the entry's actual content.
        if (stubEntry(l)) { qheld = l; continue }
        if (qWaiting.includes(mm[1])) {
          questions.push(l)
          if (foldable) { const i = questions.length - 1; qlast = s => { questions[i] += ` ${s}` } }
        } else if (qStates.includes(mm[1])) continue  // a recognized closed state
        else {
          qUnknown.push({ line: l, why: 'unrecognized state' })
          if (foldable) { const e = qUnknown[qUnknown.length - 1]; qlast = s => { e.line += ` ${s}` } }
        }
      }
    }
  }

  // Human queue — the same single CLASSIFIER the `status` counters derive from (the file is read
  // again below for its own diagnostics; what is single is the judgment, not the read).
  const { open: hqO, untagged: hqU } = hqEntries(m)
  for (const f of hqFiles(m)) readLedger(rel(f), f)

  // fidelity violations — the gate's entries through the gate's sole readers. The sections/kinds
  // derivation is CONSECRATE'S spelling, character for character — this reader sits on the utf8
  // side of the pre-existing schema-domain split, and a third spelling would be a third answer.
  const sections = (m.sch.get('review.sections') ?? '').split('|')
  const kinds = (m.sch.get('review.enum.kind') ?? '').split('|').filter(Boolean)
  const viol = []
  for (const d of docIds(m)) {
    const rev = join(m.documents, d, 'review.md')
    if (!existsSync(rev)) continue
    for (const line of fidBody(rev, sections)) {
      if (isNoise(line, kinds)) continue
      viol.push({ rev, line })
    }
  }

  // open gaps — through `scanRegister`, the function validate counts with. Not a copy of its rules
  // and not the looser tally rule: the same call, so "how many gaps are open" has one answer.
  const gPath = join(m.root, 'gaps.md')
  let gaps = []
  if (existsSync(gPath)) {
    const raw = readLedger('gaps.md', gPath)
    if (raw !== null) {
      const df = defence(nocomment(raw))
      if (df.open) warns.push("warning: gaps.md ends inside an unterminated code fence — entries behind it are invisible to this listing")
      // Both from the BYTE-domain schema map: the section name is matched against byte text, and
      // the kind vocabulary is compared to bytes the register holds.
      const secOpen = (schB.get('gaps.sections') || 'Open|Accepted').split('|')[0] || 'Open'
      const kindSet = new Set((schB.get('gaps.enum.kind') || 'declared|reference|enumeration|symmetry').split('|').filter(Boolean))
      const reg = scanRegister(df.text, secOpen, kindSet)
      gaps = reg.entries
      // The scanner's own "I could not read this line" is a reader-blind spot like the others, and
      // it TRUNCATES the rest of the section — silence here would print a short list as if it were
      // the whole one (cold review, v0.5.6). validate blocks on this under `required`; the listing
      // says it at any setting, because the entries behind it are missing either way.
      // secOpen is latin1-domain — emitted as bytes, the same repair cmd-gaps' twin got (v0.5.10).
      if (reg.badline !== '') warns.push(Buffer.concat([T("warning: gaps.md '# "), B(secOpen), T("' holds a line the register grammar cannot read, so nothing after it is listed — validate names it under 'completeness: required'")]))
    }
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
    for (const c of conflicts) {
      out(Buffer.concat([
        T('  '), B(c.id), T(' ('), c.src === '' ? T('source unrecorded') : B(c.src),
        T(') ⇄ '), c.cw === '' ? T('(unrecorded)') : B(c.cw), T(' — '), B(c.claim)
      ]))
    }
  }
  if (questions.length > 0 || qUnknown.length > 0) {
    out(qUnknown.length > 0 ? `questions (${questions.length} waiting, ${qUnknown.length} unrecognized):` : `questions (${questions.length}):`)
    for (const l of questions) outB('  ', l)
    for (const q of qUnknown) out(Buffer.concat([T(`  (${q.why} — the enum is ${qEnum}): `), B(q.line)]))
  }
  if (hqO.length > 0 || hqU.length > 0) {
    out(hqU.length > 0 ? `human queue (${hqO.length} open, ${hqU.length} untagged):` : `human queue (${hqO.length}):`)
    // The PATH is text (a folder name can be Korean, and paths.* can redirect the whole tree), the
    // ENTRY is bytes — encoded separately or the path is destroyed (cold review, v0.5.6).
    for (const e of hqO) outB(`  ${e.file}: `, e.line)
    for (const e of hqU) outB(`  ${e.file} (untagged): `, e.line)
  }
  if (viol.length > 0) {
    out(`fidelity violations (${viol.length}):`)
    // The label is the file's REAL path, the same label the Human-queue lines carry — one file, one
    // spelling, even on a mine whose documents/ is redirected by config.
    for (const v of viol) outB(`  ${rel(v.rev)}: `, v.line)
  }
  if (gaps.length > 0) {
    out(`gaps (${gaps.length}):`)
    for (const l of gaps) outB('  ', l)
  }
  return 0
}
