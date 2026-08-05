// weavedoc validate — the truths pass.
//
// ONE walk over every converted.md (read FIRST, to fill the material bodies) and then every truth
// file. On the bash side this is a single awk, and the shape matters: the material bodies must be in
// memory before any truth is sealed against them, which is why the file ORDER below is not an
// implementation detail.
//
// PORTED BY MEASUREMENT. Two rules here read one way and behave another, and both were settled by
// running the original:
//   - the reference index is keyed with a literal \001, not with the empty string it renders as.
//     Read as text, `reflist[tid "" fn "" rid]` and `split(k, kp, "")` say "concatenate, then split
//     into characters", which would make every TRUTH-REF-DANGLING message read `truths/t.md 0
//     references '0'`. It does not, because those quotes hold a SOH. tests/ctlscan.mjs is what found
//     that, and it found nothing else in the file.
//   - the frontmatter key census takes the LAST spelling of a duplicated key, while fm() takes the
//     first and census counts both. Three readers, three answers — which is precisely what
//     FM-DUPLICATE-KEY exists to say out loud.
//
// LC_ALL=C is pinned on the original, deliberately (v0.3.4: gawk 5.0 misread some emoji-bearing
// claim lines under a UTF-8 locale and reported five valid truths as FM-MISSING). Every pattern in
// it is ASCII and Korean content only ever flows through byte equality, so the character classes
// below are spelled as the C locale defines them rather than as a JS `\s`, which would additionally
// swallow NBSP and the Unicode spaces.
import { readFileSync } from 'node:fs'
import { splitLines, isFence } from './core.mjs'
import { join } from './mine.mjs'

const readOr = p => { try { return readFileSync(p, 'utf8') } catch { return '' } }

// TWO VIEWS OF ONE FILE, and the seal is why.
//
// The quote seal is a BYTE comparison — it is the mine's anti-laundering check, the thing that says
// this truth's body really is in that material. Decoding as UTF-8 first replaces every invalid byte
// with U+FFFD, so two DIFFERENT byte strings compare EQUAL, and the seal passes on a quote the
// material does not contain. Measured on a CP949 material (the ordinary legacy Korean encoding) with
// one word changed in the truth: bash reported SEAL-QUOTE-MISSING and `0 sealed · 1 seal FAILED`,
// the port reported `1 sealed` and did not raise it. A warranty that answers yes to a forgery is
// worse than no warranty, so the comparison runs on bytes.
//
// The MESSAGES still need the decoded text, or every Korean diagnostic renders as mojibake. So both
// views are kept: index i is the same line in each, because decoding never changes how many \n
// bytes there are. Bytes decide; text is printed.
const readViews = p => {
  let b
  try { b = readFileSync(p) } catch { return { B: [], U: [] } }
  return { B: splitLines(b.toString('latin1')), U: splitLines(b.toString('utf8')) }
}

// `[[:space:]]` in the C locale. A LINE never contains a newline, so the within-line class omits it;
// SP is the class as it applies to text that spans lines (a material body, a quoted block).
const W = '[ \\t\\v\\f\\r]'
const SP = /[ \t\n\v\f\r]+/g
const keyRe = k => new RegExp(`^${k}${W}*:`)

// The truths pass's own `val()`. It is the same rule as core.mjs's fmVal for every input that can
// reach it — the guard upstream is `^[a-z_]+<space>*:`, so there is always a colon — but it is
// spelled from the original rather than delegated, because the two differ on a line with NO colon
// (this one keeps the whole line, fmVal yields empty) and a shared helper would quietly pick one.
function tval (line) {
  let s = line.replace(new RegExp(`^[^:]*:${W}*`), '')
  if (!s.startsWith('"')) {
    s = s.replace(new RegExp(`${W}+#.*$`), '')
    if (s.startsWith('#')) s = ''
  }
  return s.replace(new RegExp(`${W}*$`), '').replace(/^"/, '').replace(/"$/, '')
}

// Whitespace-collapsed, so a seal does not fail on spacing. The class covers the newline here: this
// is the text as markdown renders it, where an extra blank line is the same quote and a skipped line
// is not.
const wsnorm = s => s.replace(SP, ' ').replace(/^ /, '').replace(/ $/, '')

// Zero-padding normalised, with the original's exact guard: `t000` collapses to a bare `t`, and the
// callers that care fall back to the raw id while the callers that do not, do not. Reproduced per
// call site rather than unified, because the guard is NOT applied everywhere (see refNorm).
const normT = s => { const r = s.replace(/^t0*/, 't'); return r === 't' ? s : r }
const normM = s => { const r = s.replace(/^m0*/, 'm'); return r === 'm' ? s : r }
// The reference normaliser applies BOTH substitutions and guards NEITHER, so `t000` really does
// become a bare `t` here and dangles. That asymmetry with normT is in the original and is load
// bearing in the direction of reporting more, so it stays.
const refNorm = s => s.replace(/^t0*/, 't').replace(/^m0*/, 'm')

// LC_ALL=C sort order for `PROCINFO["sorted_in"]="@ind_str_asc"`. Byte order, not UTF-16 code-unit
// order — every key that reaches these loops is ASCII today, and spelling it bytewise keeps that
// from being an assumption a future tag has to honour.
const bytewise = (a, b) => Buffer.compare(Buffer.from(a, 'latin1'), Buffer.from(b, 'latin1'))
const sortedKeys = mp => [...mp.keys()].sort(bytewise)

const q = s => `'${s}'`

// The two composite-key separators, SPELLED. Both are literal control characters in the bash source
// and both render as nothing, which is how `reflist[tid "" fn "" rid]` reads as an empty-string
// concatenation and `split(k, kp, "")` as a split into characters — a model that is wrong in a way
// that produces plausible-looking garbage (`truths/t.md  0 references '0'`). Writing them as escapes
// costs nothing and makes the file say what it does.
//   SUBSEP (U+001C) — awk's own multi-subscript separator, used by the frontmatter key census.
//   SOH    (U+0001) — the reference index's field separator, chosen by the original.
const SUBSEP = '\u001c'
const SOH = '\u0001'

export function validateTruths (m, ctx, truthPaths, matIds) {
  const { prob, sch, mroot } = ctx

  // ---- inputs the pass is handed, all computed OUTSIDE it -----------------------------------
  // These describe the MINE, and the checks needing them must still run when the truths are gone —
  // "files 0, index still naming them" is exactly the state they exist to catch.
  const reqkey = new Set(sch('truth.fm.required').split('|').filter(Boolean))
  const okstatus = new Set(sch('truth.fm.enum.status').split('|').filter(Boolean))
  const okprov = new Set(sch('truth.fm.enum.provenance').split('|').filter(Boolean))
  const oktype = new Set(sch('truth.fm.resolution.type').split('|').filter(Boolean))
  const okkind = new Set(sch('truth.fm.resolution.decision_kind').split('|').filter(Boolean))
  const okby = new Set(sch('truth.fm.resolution.decided_by').split('|').filter(Boolean))
  const ph = sch('fm.placeholder')
  const phRe = ph === '' ? null : new RegExp(ph)
  const tstenum = sch('truth.fm.enum.status').split('|').join(' ')
  const tprenum = sch('truth.fm.enum.provenance').split('|').join(' ')
  const rtypes = sch('truth.fm.resolution.type').split('|').join(' ')
  const rkinds = sch('truth.fm.resolution.decision_kind').split('|').join(' ')
  const rby = sch('truth.fm.resolution.decided_by').split('|').join(' ')

  const mat = new Set(matIds)
  const existsn = new Set(matIds)
  const matn = new Map()
  for (const a of matIds) {
    const n = normM(a)
    if (n !== 'm') { existsn.add(n); matn.set(n, a) }
  }
  const ret = ctx.retracted        // materials with status: retracted
  const research = ctx.research    // materials with origin: research
  const removedlog = ctx.removedlog
  const reqtags = ctx.reqtags      // one required tag per line, already list-parsed

  // ---- state the walk fills -----------------------------------------------------------------
  const body = new Map(); const mfmok = new Set()
  const kcount = new Map(); const kval = new Map()
  const allfile = new Map(); const allstat = new Map()
  const statusof = new Map(); const retractedT = new Set(); const norm2raw = new Map()
  const cwof = new Map(); const winnerof = new Map(); const reflist = new Map()
  const nbody = new Map(); const ntok = new Map(); const bfirst = new Map(); const bblk = new Map()
  const sealsrc = new Map(); const sealfile = new Map(); const sealstat = new Map()
  const sealbroken = new Set(); const stillthere = new Set(); const unsealed = new Set()
  const seentag = new Set()
  let ntruthfile = 0

  // ---- the materials, first: the bodies a truth is sealed against ---------------------------
  for (const id of matIds) {
    const f = join(m.materials, id, 'converted.md')
    // The BYTE view: this body is only ever compared against, never printed.
    const lines = readViews(join(m.materials, id, 'converted.md')).B
    void f
    // A file yielding NO LINE never opens on the bash side (awk reads no record from it), so it
    // registers neither a body nor a closed frontmatter. `body` is still created — the original
    // does `if(!(mid in body)) body[mid]=""` at FNR==1 — so the distinction that matters downstream
    // is mfmok, which stays unset and drops every truth sourced from it to NOT-checked.
    if (lines.length === 0) continue
    body.set(id, '')
    let infm = isFence(lines[0])
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (infm && isFence(line)) { infm = false; mfmok.add(id); continue }
      if (infm) continue
      body.set(id, body.get(id) + line + '\n')
    }
  }

  // ---- the truths ---------------------------------------------------------------------------
  for (const f of truthPaths) {
    // TEXT for the frontmatter (its values are printed), BYTES for the body (it is compared).
    const V = readViews(f)
    const lines = V.U
    const linesB = V.B
    if (lines.length === 0) continue      // invisible to an awk; invisible here
    ntruthfile++
    const base = f.slice(f.lastIndexOf('/') + 1)
    const tid = base.replace(/\.md$/, '')
    const relf = `${ctx.truthsRel}/${base}`

    let tidfield = ''; let tsrc = ''; let ttags = ''; let ttagsB = ''; let tstatus = ''
    let tconflict = ''; let tresolution = ''; let tprov = ''
    let tsuperseded = ''; let tderivedfrom = ''; let tcorrob = ''
    let hassource = false; let hasderivedfrom = false
    let closed = false

    let infm = isFence(lines[0])
    let i = 1
    for (; i < lines.length; i++) {
      const line = lines[i]
      if (infm && isFence(line)) { infm = false; closed = true; i++; break }
      if (!infm) break
      // A list value whose bracket never closes reads as empty or as the rest of the line depending
      // on the reader, and retag cannot rewrite it. Named here so the user has a repair path.
      if (new RegExp(`^[a-z_]+${W}*:${W}*\\[`).test(line) && !line.includes(']')) {
        // The `[` and `retag` are UNQUOTED, and that is not a style choice: the awk program is
        // written inside a single-quoted shell string, so the `'['` and `'retag'` in its source are
        // quote-stripped by the shell before awk ever sees them. The message on the wire has no
        // quotes there. Caught by the corpus, which compares the whole line.
        prob('FM-DUPLICATE-KEY', `${relf}  frontmatter ${q(line.slice(0, line.indexOf(':')))} opens a list with [ that never closes on this line — readers disagree about where the value ends, and retag cannot rewrite it. Close the bracket`)
      }
      // Count EVERY frontmatter key, both file kinds. A key written twice is read three ways — fm()
      // takes the first, this pass and reindex the last, census counts both — so the field yields
      // three answers and nothing says a word.
      if (new RegExp(`^[a-z_]+${W}*:`).test(line)) {
        const kk = line.replace(new RegExp(`${W}*:.*$`), '')
        const ck = `${relf}${SUBSEP}${kk}`
        kcount.set(ck, (kcount.get(ck) ?? 0) + 1)
        kval.set(ck, tval(line))          // LAST spelling wins, deliberately
      }
      // Every pattern is `^key<space>*:` — the SAME shape as the census one line up, and as fm().
      // They used to read `^key:<space>`, which demands no space BEFORE the colon and one AFTER, so
      // two spellings YAML calls legal matched the census and fm() while missing every reader here.
      // On `source` that was silent and total: the seal is guarded by `tsrc!=""`, so it ran zero
      // times and a fabricated body went in as `status: ok`.
      if (keyRe('id').test(line)) { tidfield = tval(line) } else if (keyRe('claim').test(line)) {
        /* presence only */
      } else if (keyRe('source').test(line)) {
        tsrc = tval(line); hassource = true
        // A source spelled leniently (`m5` for folder `m005`) resolves to the folder it names.
        if (tsrc !== '' && !mat.has(tsrc)) { const sn = normM(tsrc); if (matn.has(sn)) tsrc = matn.get(sn) }
      } else if (keyRe('tags').test(line)) { ttags = tval(line); ttagsB = tval(linesB[i]) } else if (keyRe('status').test(line)) {
        tstatus = tval(line)
      } else if (keyRe('conflict_with').test(line)) { tconflict = tval(line) } else if (keyRe('resolution').test(line)) {
        tresolution = tval(line)
      } else if (keyRe('provenance').test(line)) { tprov = tval(line) } else if (keyRe('derived_from').test(line)) {
        hasderivedfrom = true; tderivedfrom = tval(line)
      } else if (keyRe('superseded').test(line)) { tsuperseded = tval(line) } else if (keyRe('corroborated_by').test(line)) {
        tcorrob = tval(line)
      }
    }

    // tf_done() fires on the CLOSING fence. Without one, every check below runs zero times — which is
    // what TRUTH-FM-UNCLOSED exists to name, one check over.
    if (closed) {
      tfDone({
        tid, relf, tidfield, tsrc, ttags, tstatus, tconflict, tresolution, tprov,
        tsuperseded, tderivedfrom, tcorrob, hassource, hasderivedfrom, ttagsB
      })
    }

    // ---- the body ---------------------------------------------------------------------------
    // Two rules run over the same lines, and neither is `next`-ed on the bash side: the BLOCK
    // accumulates blank lines once it has started, while the per-line checks only see non-blank
    // ones. Sealing per line is not enough — two lines that are each verbatim but sit far apart in
    // the source render as one soft-wrapped sentence the source never contained.
    let started = false
    for (; i < lines.length; i++) {
      const line = lines[i]       // decoded — only ever printed
      const lineB = linesB[i]     // bytes — everything the seal decides
      const nonblank = /[^ \t\v\f\r]/.test(line)
      if (started || nonblank) { started = true; bblk.set(tid, (bblk.get(tid) ?? '') + lineB + '\n') }
      if (!nonblank) continue
      nbody.set(tid, (nbody.get(tid) ?? 0) + 1)
      const bl = line.replace(new RegExp(`^${W}+`), '').replace(new RegExp(`${W}+$`), '')
      // A TOKEN count, not a length: awk's length() counts characters under UTF-8 and bytes under C,
      // so one mine got two verdicts. Runs of non-space are locale-invariant.
      ntok.set(tid, (ntok.get(tid) ?? 0) + (bl === '' ? 0 : bl.split(/[ \t\v\f\r]+/).length))
      if (!bfirst.has(tid)) bfirst.set(tid, bl)
      // `tsrc in mfmok` — the source material actually PARSED. An unclosed converted.md yields an
      // empty body, which would flag every truth from it as a broken seal when the material was just
      // unread; those fall to NOT checked instead.
      if (tsrc !== '' && body.has(tsrc) && mfmok.has(tsrc)) {
        sealsrc.set(tid, tsrc); sealfile.set(tid, relf); sealstat.set(tid, tstatus)
        if (!body.get(tsrc).includes(lineB)) {
          sealbroken.add(tid)
          if (tstatus !== 'retracted' && !unsealed.has(tid)) {
            unsealed.add(tid)
            prob('SEAL-QUOTE-MISSING', `${relf}  quote not found in ${mroot}/${tsrc}/converted.md (laundering risk)`)
          }
        } else stillthere.add(tid)
      }
    }
  }

  function tfDone (t) {
    const { tid, relf } = t
    allfile.set(tid, relf); allstat.set(tid, t.tstatus)
    if (t.tidfield !== tid) prob('TRUTH-ID-MISMATCH', `${relf}  id ${q(t.tidfield)} != filename ${q(tid)}`)
    // Driven by truth.fm.required (the key census this pass collects), not hardcoded. Present AND
    // non-empty: checking only that the KEY exists is how a bare `source:` passed.
    for (const rk of [...reqkey].sort(bytewise)) {
      const ck = `${relf}${SUBSEP}${rk}`
      if (!kcount.has(ck)) prob('FM-MISSING', `${relf}  frontmatter ${q(rk)} missing`)
      else if (kval.get(ck) === '') prob('FM-MISSING', `${relf}  frontmatter ${q(rk)} is empty — a key with no value is not a value, and for ${q('source')} it silently switches the quote seal off`)
      else if (phRe !== null && phRe.test(kval.get(ck))) prob('FM-MISSING', `${relf}  frontmatter ${q(rk)} still holds the template placeholder ${kval.get(ck)} — that is an instruction, not a value. Replace it with the real value; if the value genuinely belongs in braces, put any character outside them`)
    }
    if (t.hassource && t.tsrc !== '' && !mat.has(t.tsrc)) prob('TRUTH-SOURCE-DANGLING', `${relf}  source ${q(t.tsrc)} → no material folder`)
    const v = t.tstatus
    if (v === 'resolved') prob('TRUTH-STATUS-LEGACY', `${relf}  status ${q('resolved')} is the pre-rename legacy value → winner-self/attribute: ${q('ok')}, loser: ${q('discarded')}`)
    else if (!okstatus.has(v)) prob('TRUTH-ENUM', `${relf}  status ${q(v)} invalid → use ${tstenum} (truth.fm.enum.status)`)
    // The resolution enums. Hand-editing frontmatter is allowed, so a hand-written decision record
    // must be validated too. A space BEFORE the colon is legal YAML and the keys inside this flow
    // object must allow it, or `{type : pick, …}` blinds all four readers at once.
    if (t.tresolution !== '') {
      const rv = t.tresolution
      const grab = k => {
        const mm = new RegExp(`${k}${W}*:${W}*[^,}]+`).exec(rv)
        if (!mm) return null
        return mm[0].replace(new RegExp(`^${k}${W}*:${W}*`), '').replace(new RegExp(`${W}+$`), '')
      }
      const rt2 = grab('type')
      if (rt2 !== null && !oktype.has(rt2)) prob('RESOLUTION-ENUM', `${relf}  resolution type ${q(rt2)} invalid → use ${rtypes} (truth.fm.resolution.type)`)
      const rk2 = grab('decision_kind')
      if (rk2 !== null && !okkind.has(rk2)) prob('RESOLUTION-ENUM', `${relf}  resolution decision_kind ${q(rk2)} invalid → use ${rkinds} (truth.fm.resolution.decision_kind)`)
      const rb2 = grab('decided_by')
      if (rb2 !== null) {
        if (!okby.has(rb2)) prob('RESOLUTION-ENUM', `${relf}  resolution decided_by ${q(rb2)} invalid → use ${rby} (truth.fm.resolution.decided_by)`)
      } else {
        prob('RESOLUTION-NO-DECIDER', `${relf}  resolution has no ${q('decided_by')} → the provenance of a DECISION is the second membrane; without it the mine cannot say whether a human ruled or the machine picked`)
      }
    }
    if (v === 'retracted' && t.tresolution !== '') prob('TRUTH-RETRACTED-RULE', `${relf}  status ${q('retracted')} must not carry a resolution — it lost no conflict; record the withdrawal in truths/changelog.md as ${q('removed:')}`)
    if (v === 'retracted') {
      retractedT.add(tid)
      const tidz = tid.replace(/^t0*/, 't')
      if (tidz !== 't') retractedT.add(tidz)
      // Without this, `retracted` would be the one unusable status with no mechanical obligation — a
      // cheap way to disappear an inconvenient truth. The `removed:` line keeps it answerable.
      if (!removedlog.has(normT(tid))) prob('TRUTH-RETRACTED-RULE', `${relf}  status ${q('retracted')} but truths/changelog.md has no ${q(`removed: ${tid}`)} line → a withdrawal with no recorded reason is indistinguishable from a quiet deletion`)
    }
    // Normalise zero-padding and remember the status, or `conflict_with: [t5]` never matches
    // retracted `t005` and a resolved truth is told to re-open a conflict it does not have.
    statusof.set(tid, v)
    const tidn3 = normT(tid)
    existsn.add(tidn3); existsn.add(tid)
    norm2raw.set(tidn3, tid)
    if (t.tconflict !== '') {
      for (const item of t.tconflict.split(/[[\], ]+/)) {
        if (item === '') continue
        cwof.set(tid, (cwof.get(tid) ?? '') + ' ' + normT(item))
      }
    }
    if (v === 'conflict' && t.tconflict === '') prob('CONFLICT-RECIPROCITY', `${relf}  status is ${q('conflict')} but no conflict_with field`)
    if (v === 'discarded' && t.tresolution === '') prob('DISCARDED-RULE', `${relf}  status is ${q('discarded')} but no resolution field (a discard must record its decision)`)
    // status = validity axis, resolution = history. Guard the two mismatches.
    let w2 = ''
    if (t.tresolution !== '') {
      let ty = ''
      const wm = new RegExp(`winner${W}*:${W}*(\\[[^\\]]*\\]|[^,}]+)`).exec(t.tresolution)
      if (wm) w2 = wm[0]
      const tm = new RegExp(`type${W}*:${W}*[a-z]+`).exec(t.tresolution)
      if (tm) ty = tm[0].replace(new RegExp(`type${W}*:${W}*`), '')
      // Match the padded id AND the unpadded one, or `winner: [t5]` in t005.md reads as "somebody
      // else won" and validate tells the user to discard the WINNER — which takes their chosen value
      // out of the mine.
      const selfwin = w2 !== '' && (new RegExp(`(^|[^0-9A-Za-z])${tid}([^0-9]|$)`).test(w2) ||
                                    new RegExp(`(^|[^0-9A-Za-z])${tidn3}([^0-9]|$)`).test(w2))
      if (v === 'discarded' && selfwin) prob('DISCARDED-SELF-WIN', `${relf}  discarded but resolution.winner is itself → it WON its conflict; set status ${q('ok')}`)
      if (v === 'ok' && w2 !== '' && !selfwin && ty !== 'attribute') prob('OK-BUT-LOST', `${relf}  ok but its resolution says it lost (winner elsewhere) → set status ${q('discarded')}`)
    }
    if (t.tprov !== '' && !okprov.has(t.tprov)) prob('PROV-ENUM', `${relf}  provenance ${q(t.tprov)} invalid → use ${tprenum} (truth.fm.enum.provenance)`)
    if (t.tprov === 'derived' && !t.hasderivedfrom) prob('PROV-DERIVED-REFS', `${relf}  provenance is ${q('derived')} but no derived_from field (derivations must show their chain)`)
    // `origin: research` stops laundering at the material; without this it resumes one level down.
    // Nobody stated a value the machine fetched, and `stated` is the default — so silence lands there.
    if (t.hassource && research.has(t.tsrc) && (t.tprov === '' || t.tprov === 'stated')) {
      prob('TRUTH-SOURCE-DANGLING', `${relf}  source ${q(t.tsrc)} is ${q('origin: research')} (machine-fetched) but provenance is ${q('stated')} → nobody stated it; use ${q('adopted')} (user accepted the fetched value) or ${q('derived')} (computed from it)`)
    }
    if (t.hassource && ret.has(t.tsrc) && (v === 'ok' || v === 'conflict')) {
      prob('TRUTH-SOURCE-DANGLING', `${relf}  source ${q(t.tsrc)} is retracted but status is ${q(v)} → set unsupported (map retraction propagation)`)
    }
    if (t.tresolution !== '' && w2 !== '') {
      let wv = w2
      let mm
      while ((mm = /m[0-9]+/.exec(wv)) !== null) {
        wv = wv.slice(mm.index + mm[0].length)
        if (ret.has(mm[0])) prob('WINNER-RETRACTED', `${relf}  resolution winner references retracted ${mm[0]} → basis gone; re-open the conflict (map)`)
      }
      // A loser pointing at a retracted winner sends every consumer following the successor straight
      // to a tombstone — the second escape route (resolve, then retract the winner).
      let w3 = w2
      while ((mm = /t[0-9]+/.exec(w3)) !== null) {
        w3 = w3.slice(mm.index + mm[0].length)
        const wmn = normT(mm[0])
        if (wmn !== tidn3) winnerof.set(wmn, (winnerof.get(wmn) ?? '') + ' ' + tid)
      }
    }
    // Dangling-reference check for every id-bearing list field. resolution.winner rides along as the
    // fifth: `pull` sends every reader of a discarded truth to the winner, so a typo there pointed
    // the protocol at a nonexistent truth silently. Only the winner CLAUSE is scanned — `reason:` is
    // free prose that may name ids it only talks about.
    const fields = [
      [t.tconflict, 'conflict_with'], [t.tsuperseded, 'superseded'], [t.tderivedfrom, 'derived_from'],
      [t.tcorrob, 'corroborated_by'], [w2, 'resolution.winner']
    ]
    for (const [fv, fn] of fields) {
      if (fv === '') continue
      let fw = fv
      let mm
      while ((mm = /[tm][0-9]+/.exec(fw)) !== null) {
        const rid = mm[0]
        fw = fw.slice(mm.index + mm[0].length)
        reflist.set(`${tid}${SOH}${fn}${SOH}${rid}`, refNorm(rid))
      }
    }
    // Only LIVE truths cover a required tag: a tombstone never had standing, and the value of a
    // discarded loser lives on in its winner. Otherwise retracting the last real extraction of a
    // mandatory topic would keep the mine green about it.
    if (v !== 'retracted' && v !== 'discarded') {
      // The BYTE spelling: required_tags is matched byte for byte on the bash side (every reader
      // there is LC_ALL=C), and folding two different tags onto one U+FFFD would answer "this
      // required topic is covered" about a tag the mine does not hold.
      for (const tg of t.ttagsB.replace(/[[\]"]/g, '').split(',')) {
        const s = tg.replace(new RegExp(`^${W}+`), '').replace(new RegExp(`${W}+$`), '')
        if (s !== '') seentag.add(s)
      }
    }
  }

  // ---- END ----------------------------------------------------------------------------------
  // Compared in BYTES, printed as TEXT. The two arrays are one list read two ways, so index i is
  // the same tag in each — a comma is a comma in both views, so the split lands identically.
  for (let ri = 0; ri < reqtags.length; ri++) {
    const rt = reqtags[ri]
    const rtB = ctx.reqtagsB[ri] ?? rt
    if (rt !== '' && !seentag.has(rtB)) prob('REQTAG-EMPTY', `required_tag ${q(rt)} has no live truths — retracted and discarded truths do not cover a topic (a tombstone is an extraction that never had standing); extract it from a material, queue the question (the ask loop turns the answer into a user-answer material), or remove the tag from project.md required_tags — removing it switches the completeness warranty off for that topic`)
  }
  for (const kx of sortedKeys(kcount)) {
    if (kcount.get(kx) <= 1) continue
    const [f, k] = kx.split(SUBSEP)
    prob('FM-DUPLICATE-KEY', `${f}  frontmatter key ${q(k)} appears ${kcount.get(kx)} times → fm reads the FIRST, validate and reindex read the LAST, and census counts BOTH, so three commands report three different values for the same field. Keep one`)
  }
  // The tombstone withdrawal reason, judged after the WHOLE body is read (deciding on the first
  // matching line made the verdict depend on line order). One absent line supports "never had
  // standing"; the file fails only when EVERY line is still verbatim there.
  for (const t of sortedKeys(sealstat)) {
    if (sealstat.get(t) === 'retracted' && stillthere.has(t) && !sealbroken.has(t)) {
      prob('SEAL-RETRACTED', `${sealfile.get(t)}  status ${q('retracted')} but its quote IS still verbatim in ${mroot}/${sealsrc.get(t)}/converted.md → the withdrawal reason (never had standing) is unsupported. If the fact is real and only ${q('source')} was wrong, repoint it (map); if it lost a conflict, use ${q('discarded')} with a resolution`)
    }
  }
  for (const k of sortedKeys(reflist)) {
    const kp = k.split(SOH)
    if (!existsn.has(reflist.get(k))) {
      prob('TRUTH-REF-DANGLING', `truths/${kp[0]}.md  ${kp[1]} references ${q(kp[2])} — no such truth or material. A dangling id here is silent: the checks that depend on it (retracted counterpart, reciprocity, derivation chain) simply never fire`)
    }
  }
  for (const w4 of sortedKeys(winnerof)) {
    if (retractedT.has(w4) || (norm2raw.has(w4) && retractedT.has(norm2raw.get(w4)))) {
      prob('WINNER-RETRACTED', `truths/${w4}.md  is retracted but is named the WINNER by${winnerof.get(w4)} → those losers point their successor at a tombstone, and a consumer following the protocol is told the fact is not in the mine. Re-open the conflict or make the surviving value a live truth`)
    }
  }
  // Compare NORMALISED against NORMALISED, report the RAW file id — a mixed comparison fired the
  // once-per-pair guard both ways below 100 and named a nonexistent file. Built first in its own
  // pass, so reciprocity reads a complete table rather than a half-built one.
  const cwofn = new Map(); const rawof = new Map()
  for (const x of sortedKeys(cwof)) { const xz = normT(x); cwofn.set(xz, cwof.get(x)); rawof.set(xz, x) }
  for (const x of sortedKeys(cwof)) {
    const xn = normT(x)
    for (const cw of cwof.get(x).split(' ')) {
      if (cw === '') continue
      const disp = norm2raw.has(cw) ? norm2raw.get(cw) : cw
      // RECIPROCITY of an open conflict: one-sided `conflict_with` leaves `pull` handing the silent
      // side out as usable, since READ.md rule 2 cannot apply. Skipped when the other side is a
      // tombstone (the retracted-counterpart check above owns that).
      if (statusof.get(x) === 'conflict' && !retractedT.has(cw) && existsn.has(cw)) {
        if (!cwofn.has(cw) || !` ${cwofn.get(cw)} `.includes(` ${xn} `)) {
          prob('CONFLICT-RECIPROCITY', `truths/${x}.md  names ${disp} in conflict_with but ${disp} does not name ${x} back → a one-sided conflict cannot be applied by READ.md rule 2, so pull reports the silent side as usable. Fix BOTH files in one edit: set conflict_with on each naming the other, AND set both status ${q('conflict')} — doing only the first produces the next error one step later`)
        } else if (rawof.has(cw) && statusof.get(rawof.get(cw)) !== 'conflict' && (statusof.get(rawof.get(cw)) ?? '') !== '') {
          prob('CONFLICT-RECIPROCITY', `truths/${disp}.md  is in an open conflict with ${x} but its own status is ${q(statusof.get(rawof.get(cw)))} → both parties to an unresolved conflict must be ${q('conflict')}, or the conflict must be resolved on both`)
        }
      }
      if (retractedT.has(cw) && !retractedT.has(x) && statusof.get(x) === 'conflict') {
        prob('CONFLICT-STALE', `truths/${x}.md  is still ${q('conflict')} against ${disp}, which was retracted → the other side was withdrawn without resolving the conflict; re-open or resolve ${x}`)
      } else if (retractedT.has(cw) && retractedT.has(x) && bytewise(xn, cw) < 0) {
        // Retracting BOTH sides was the loophole: an open conflict vanished for two changelog lines
        // with no user ruling. The machine never disposes of a conflict on its own.
        prob('CONFLICT-BOTH-RETRACTED', `truths/${x}.md and ${disp} were BOTH retracted while in open conflict → a conflict may not be disposed of by withdrawing both sides; the machine never resolves a conflict on its own. Record the user ruling (resolution / adjudication) or re-open one side`)
      }
    }
  }
  // Accounting, not a check: reporting sealed-vs-present makes the "silent zero" leaks (empty
  // source, no checkable body line, unclosed frontmatter — all a tick) visible. A body with no
  // non-blank line is unchecked, not clean. Tombstones are exempt (a retracted truth may be a stub).
  for (const bt of sortedKeys(allstat)) {
    if (allstat.get(bt) !== 'retracted' && (nbody.get(bt) ?? 0) === 0) {
      prob('TRUTH-BODY-EMPTY', `${allfile.get(bt)}  body is empty — the verbatim quote is what the seal checks, so a truth with no body line is unchecked rather than checked-and-clean`)
    }
  }
  // Each line verbatim but the BLOCK not: two lines pulled from opposite ends of a source render as
  // one passage it never had. Only for truths whose every line already passed the per-line seal.
  const bodyws = new Map()
  for (const sp of sortedKeys(sealsrc)) {
    if (allstat.get(sp) === 'retracted' || sealbroken.has(sp) || (nbody.get(sp) ?? 0) < 2) continue
    const blk = wsnorm(bblk.get(sp) ?? '')
    if (blk === '') continue
    const src = sealsrc.get(sp)
    if (!bodyws.has(src)) bodyws.set(src, wsnorm(body.get(src)))
    if (!bodyws.get(src).includes(blk)) {
      prob('SEAL-SPLIT-BLOCK', `${sealfile.get(sp)}  every body line is verbatim in ${mroot}/${src}/converted.md but they are NOT adjacent in it — quoting lines that sit apart splices them into one passage the source never had (markdown renders the block as a single paragraph). Quote one continuous passage, or split this into one truth per passage`)
    }
  }
  // One token is not a quote: a substring that short is in almost any material, so the seal passes
  // on nothing while the count reads "sealed". KNOWN LIMIT: a two-token fragment still gets through
  // — the floor is the lowest that means anything, not a full guard.
  for (const fr of sortedKeys(allstat)) {
    if (allstat.get(fr) !== 'retracted' && (nbody.get(fr) ?? 0) > 0 && (ntok.get(fr) ?? 0) < 2) {
      prob('TRUTH-BODY-FRAGMENT', `${allfile.get(fr)}  body is a single fragment (${q(bfirst.get(fr))}) — the seal is a substring test, and a fragment that short is in almost any material, so finding it verbatim proves nothing about the claim. Quote the whole line (or table row) the fact sits in`)
    }
  }
  // `sealed` must mean the seal PASSED, not that it ran (sealsrc is set before the substring test
  // decides), or a quote confirmed ABSENT counts as sealed — and the confirmation screen reads this
  // number as "N/N verbatim confirmed". Four outcomes: passed · FAILED · tombstone · never checked.
  let nsealed = 0; let nsealfail = 0; let ntomb = 0
  for (const tb of allstat.keys()) if (allstat.get(tb) === 'retracted') ntomb++
  for (const st of sealsrc.keys()) {
    if (allstat.get(st) === 'retracted') continue
    if (sealbroken.has(st)) nsealfail++; else nsealed++
  }
  return { ntruthfile, nsealed, nsealfail, ntomb }
}
