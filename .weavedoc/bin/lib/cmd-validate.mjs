// weavedoc validate — format + truth coherence. The floor under the AI fidelity gate.
//
// PORTING NOTE, and it is the method rather than a remark. Every rule below was settled by RUNNING
// the bash original against a mine and reading what came back, not by reading its source. The
// difference is not academic: `in_list` looks like a membership test and is a delimiter-bounded
// SUBSTRING test; the truths reader takes the LAST spelling of a duplicated key while fm() takes
// the first; a zero-byte file is invisible to an awk and present to a directory listing. Each of
// those was found by measurement after being got wrong by reading.
//
// The scale was a whole-output comparison against the bash runtime over every mine the regression
// cases build — a substring suite cannot grade a rewrite whose contract is bytes. Both that scale
// and its reference are gone; the last run of it is in tests/baseline/parity-final-2026-08-05.md.
import { statSync, realpathSync, readFileSync, readdirSync } from 'node:fs'
import { canonId, isDate, isFence, isPlaceholder, inList, listField, fmVal, pipes, splitLines, U, M } from './core.mjs'
import { join, materialIds, mdirFor, docIds, tfileFor, docFinalPath, contextDigest } from './mine.mjs'
import { nocomment, dupSection, commentBalanced, sectionAll } from './sections.mjs'
import { hqFiles } from './cmd-status.mjs'
import { artifactDigest, ledgerRead } from './verify.mjs'
import { fidMark, fidBody, isNoise, foldKinds, bearsKind, commentSpans } from './review.mjs'
import { fmvB as fmv, loadSchema, loadConfig } from './read.mjs'
import { validateTruths } from './validate-truths.mjs'

// BYTES, not text. Every value this command quotes back in a diagnostic comes through here, and a
// UTF-8 decode folds an invalid byte to U+FFFD — printing something the runtime being replaced never
// printed. One char per byte in, message emitted as bytes out (see prob below).
const readOr = p => { try { return readFileSync(p).toString('latin1') } catch { return '' } }
const isDirAt = p => { try { return statSync(p).isDirectory() } catch { return false } }
const isFileAt = p => { try { return statSync(p).isFile() } catch { return false } }
const existsAt = p => { try { statSync(p); return true } catch { return false } }
// `[ -e ]` — exists, whatever KIND. The consecration markers are detected by presence alone.
const exists = p => { try { statSync(p); return true } catch { return false } }

// `rp()` — the real path, EMPTY when it is not a directory. Spelled to match, because the bash form
// is `( cd "$1" && pwd -P )` and `cd` fails on a file: a `paths:` value pointing at a FILE resolves
// to the empty string on that side, and a resolver here that happily returned the file path would
// make the redirect comparison answer differently.
const rp = p => { try { return statSync(p).isDirectory() ? realpathSync(p) : '' } catch { return '' } }

// The declared schema roster, DERIVED FROM NOTHING AT RUNTIME — the same list the bash runtime
// carries, and for the same reason: validate used to grep its own source for it, which broke the
// moment the file was renamed or made read-only. Four keys once stood here while twenty-two were
// being read, so a schema missing any of the other eighteen switched those checks off under a clean
// tick. Its SIZE is asserted out loud below, because a truncated constant fails quietly.
const SCH_KEYS = `config.enum.attribution config.enum.completeness config.enum.detection config.enum.scale
config.repeat.scales config.strength.range config.toplevel fm.placeholder humanqueue.enum.ownership
humanqueue.enum.state material.fm.enum.origin material.fm.enum.stage material.fm.enum.status
material.fm.required material.fm.required_when.research plan.fm.enum.status plan.fm.required
plan.fm.enum.audience
project.fm.required review.enum.kind review.enum.reviewed_kind review.sections schema.version truth.fm.enum.provenance
truth.fm.enum.status truth.fm.required truth.fm.resolution.decided_by
truth.fm.resolution.decision_kind truth.fm.resolution.type verify.fm.enum.status verify.fm.required
verify.ledger.file verify.ledger.origin.material verify.ledger.origin.truths verify.ledger.verdicts verify.sections verify.units.verified
gaps.sections gaps.enum.kind`

// Bash word splitting on unquoted `$var` with the default IFS: split on ANY run of space, tab or
// newline, and drop the empty fields. Several loops below depend on this being the splitting rule
// and not "split on commas" or "split on newlines" — `for a in $REPLY` after listfield re-splits an
// item that contains a space into two, and the port has to make the same two.
const words = s => s.split(/[ \t\n]+/).filter(x => x !== '')

// THE GLOB the bash side hands its readers: `t[0-9]*.md` is 't', one digit, ANYTHING, '.md' — so
// `t01x.md` is in the population. mine.mjs's truthFiles() is deliberately stricter (it answers "what
// is a truth file"), and reusing it here would silently shrink the set validate is meant to police.
// Sorted, because a glob is.
const TRUTH_GLOB = /^t[0-9].*\.md$/
const lsGlob = d => { try { return readdirSync(d).filter(n => TRUTH_GLOB.test(n)).sort(bytewise) } catch { return [] } }

// catalog_ids: `| m001 | …` rows. Whitespace is stripped from the second field before the id shape
// is judged, so `|  m001  |` is a row for m001.
function catalogIds (catalog) {
  const out = []
  for (const line of splitLines(readOr(catalog))) {
    if (!/^[ \t\v\f\r]*\|/.test(line)) continue
    const f = line.split('|')
    const v = (f[1] ?? '').replace(/[ \t\v\f\r]/g, '')
    if (/^m[0-9]+$/.test(v)) out.push(v)
  }
  return out
}

// The per-material "is the frontmatter closed" answer, for every converted.md at once.
// A file that yields NO LINE is absent from the map rather than present as `nofm`: the bash side is
// one awk over the whole glob, and awk contributes nothing for a file it reads no record from, so a
// zero-byte converted.md draws no MAT-FM-UNCLOSED. Reproduced, because "unclosed" and "not looked
// at" are different states and the accounting line downstream says which.
function matFmState (materialsDir, ids) {
  const st = new Map()
  for (const id of ids) {
    const f = join(materialsDir, id, 'converted.md')
    const lines = splitLines(readOr(f))
    if (lines.length === 0) continue
    const opened = isFence(lines[0])
    let closed = false
    if (opened) for (let i = 1; i < lines.length; i++) if (isFence(lines[i])) { closed = true; break }
    st.set(id, closed ? 'closed' : (opened ? 'unclosed' : 'nofm'))
  }
  return st
}

// LC_ALL=C ordering: bytes, not UTF-16 code units. Every id that reaches these sorts is ASCII, and
// spelling it bytewise keeps that from being an assumption the next tag has to honour.
const bytewise = (a, b) => Buffer.compare(Buffer.from(a, 'latin1'), Buffer.from(b, 'latin1'))

// Lines of a file in the BYTE domain, one char per byte. The ledger's `standard` column is free text
// that a Korean console fills with CP949, and decoding it as UTF-8 first would fold invalid bytes to
// U+FFFD before the tabs are even counted.
function splitLinesBytes (p) {
  let b
  try { b = readFileSync(p) } catch { return [] }
  const l = b.toString('latin1').split('\n')
  if (l.length && l[l.length - 1] === '') l.pop()
  return l.map(x => (x.endsWith('\r') ? x.slice(0, -1) : x))
}

// The LEDGER's own reader, and it is deliberately neither of the two above.
// bash reads that file with a bare `while IFS= read -r lline_ ... done < "$lfv_"`, which means two
// things this file must copy and the general readers do not:
//   1. a trailing CR is KEPT, so a CRLF ledger has a date column of `2026-07-30\r` and every row is
//      LEDGER-MALFORMED. Measured: identical on MSYS and Linux, so there is one bash answer and the
//      port was passing a file bash blocks. `core.autocrlf=true` is the Windows default and a plain
//      `git clone` of a mine produces exactly this.
//   2. there is no `|| [ -n "$line" ]`, so a final line with NO trailing newline is never read at
//      all — bash's `read` returns non-zero on it and the loop ends.
// REPLACED by verify.mjs's ledgerLines (§11 2026-08-05): one reader for one file. What this one
// did, faithfully reproducing bash's `while IFS= read -r`, was KEEP a trailing CR (so a git
// autocrlf checkout blocked as LEDGER-MALFORMED while `scope` called the same mine fully verified)
// and DISCARD a final line with no newline (so the row a crashed `attest` leaves behind vanished
// instead of raising anything). Both were faithful to a runtime that no longer exists.

// RETIRED (v0.5.1): readTabs lived here — a faithful model of bash's `IFS=$'\t' read`, which
// collapses runs of tabs and ignores leading and trailing ones. Its reason to exist died with the
// bash runtime, but the function outlived it, and that made this file the SECOND column parser of
// the ledger: a row with an extra empty column read as six clean fields here (rc 0) while scope's
// exact split quarantined it, and a row with a LEADING tab read as a valid row here while scope
// could not attribute it to any id — so a `failed` verdict vanished from both surfaces at once
// (external review P0-1, both shapes measured). The ledger section below now splits exactly the
// way verify.mjs does: every tab delimits, every deviation is named.

// truths/coverage.md — map-written (element → truth ids, skips with reasons: T2's audit surface).
// FLOOR, not a warranty: every section resolves to a material, every mentioned id exists, and every
// truth from a *sectioned* material appears in it. Materials with no section are legal (legacy).
function validateCoverage (m, { prob }, covPath, matIds, truthPaths) {
  const q = s => `'${s}'`
  // References stay lenient (FORMATS pins the FOLDER spelling only), so every id used as a KEY is
  // normalised: `source: m5`, `## m005` and `t1` must land on the same entry as their canonical
  // forms. BOTH substitutions, and a bare `m`/`t` normalises to nothing.
  const norm = s => {
    const r = s.replace(/^m0*/, 'm').replace(/^t0*/, 't')
    return (r === 'm' || r === 't') ? '' : r
  }
  const mat = new Set()
  for (const a of matIds) { if (a === '') continue; mat.add(a); if (norm(a) !== '') mat.add(norm(a)) }
  // (id, source) pairs. Built by SPLITTING ON SPACE and then on ':' exactly as the original does, so
  // a source value holding either character truncates the same way here as there.
  const tsrc = new Map(); const tid2file = new Map()
  for (const p of truthPaths) {
    const b = p.slice(p.lastIndexOf('/') + 1).replace(/\.md$/, '')
    const s = fmv(p, 'source')
    if (s === '') continue
    for (const pair of `${b}:${s}`.split(' ')) {
      if (pair === '') continue
      const c = pair.split(':')
      tsrc.set(c[0], c[1] ?? '')
      if (norm(c[0]) !== '') tid2file.set(norm(c[0]), c[0])
    }
  }

  const hassec = new Map(); const legseen = new Set(); const mention = new Set()
  let sec = ''; let inleg = false
  for (const line of splitLines(nocomment(readOr(covPath)))) {
    const secm = /^##[ \t]+(m[0-9]+)([ \t\v\f\r]|$)/.exec(line)
    if (secm) {
      // `sec=$2` is awk's SECOND field, which for `## m001 — 제목` is the id and nothing else.
      sec = secm[1]
      if (!mat.has(sec)) prob('COVERAGE-SECTION', M`truths/coverage.md  ${q(`## ${sec}`)} → no material folder`)
      hassec.set(norm(sec), sec)
      continue
    }
    if (/^##[ \t]+legacy[ \t\v\f\r]*$/.test(line)) { sec = ''; inleg = true; continue }
    if (/^##[ \t]/.test(line)) { sec = ''; inleg = false; continue }
    if (inleg) {
      // `## legacy` holds user rulings in free prose, not mappings. Ids named in a ruling are talked
      // ABOUT (often withdrawn ones), so the existence check there would fail validate for a deletion.
      const lm = /^[ \t\v\f\r]*-[ \t\v\f\r]*(m[0-9]+)/.exec(line)
      if (lm) {
        const lid = lm[1]
        legseen.add(lid)
        // An exemption is a USER ruling: one line of machine-written prose was enough to shrink the
        // coverage denominator AND trip the T2 legacy escape at once. Shape AND value — this was the
        // only place in the tool that looked at a date at all and looked at the shape only, so
        // 2026-99-99 counted as a ruling while 2026-7-3 read as having none.
        let rdok = false
        const rm = /ruled:[ \t\v\f\r]*([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])/.exec(line)
        if (rm) {
          const mo = +rm[2]; const da = +rm[3]
          if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) rdok = true
        }
        if (!rdok || !/"[^"]+"/.test(line)) {
          prob('COVERAGE-LEGACY', M`truths/coverage.md  ${q('## legacy')} exempts ${q(lid)} without a recorded ruling → add ruled: YYYY-MM-DD plus the quoted user utterance on the same line; the machine does not exempt itself`)
        }
      }
      continue
    }
    let rest = line
    let mm
    while ((mm = /t[0-9]+/.exec(rest)) !== null) {
      const id = mm[0]
      rest = rest.slice(mm.index + mm[0].length)
      if (!tsrc.has(id) && !tid2file.has(norm(id))) prob('COVERAGE-DANGLING', M`truths/coverage.md  mentions ${q(id)} — no such truth file`)
      else if (sec !== '') mention.add(`${norm(sec)},${norm(id) !== '' ? norm(id) : id}`)
    }
  }
  // Checked here, not inline: `## legacy` may sit ABOVE the `## m<id>` sections, so hassec is only
  // complete once the whole file has been read.
  for (const l of [...legseen].sort(bytewise)) {
    if (!mat.has(l)) prob('COVERAGE-LEGACY', M`truths/coverage.md  ${q('## legacy')} exempts ${q(l)} — no such material`)
    else if (hassec.has(norm(l))) prob('COVERAGE-LEGACY', M`truths/coverage.md  ${q('## legacy')} exempts ${q(l)} but it has its own ${q(`## ${hassec.get(norm(l))}`)} section — it is covered, not exempt (that drops the denominator while the numerator stays, which can push the ratio above 1)`)
  }
  for (const t of [...tsrc.keys()].sort(bytewise)) {
    const s = norm(tsrc.get(t))
    if (hassec.has(s) && !mention.has(`${s},${norm(t)}`)) {
      prob('COVERAGE-SECTION', M`truths/coverage.md  ${q(`## ${hassec.get(s)}`)} missing ${q(t)} — extracted from ${tsrc.get(t)} but absent from its coverage section (update at map)`)
    }
  }
}

// json_esc: backslash, quote, newline and tab escaped; carriage return DROPPED, not escaped.
const jsonEsc = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '')

// Human queue ownership tags, over a file that carries a "## Human queue" section.
// Enforced ONLY where a [state] tag is already present: an untagged legacy entry is the audit
// lane's job, not a hard failure — a spec change must not break a mine verified under the old shape.
// And only `open` needs ownership: it drives the confirmation split, while a `ruled` entry is closed
// and nothing reads its ownership, so requiring one there would be enforcement with no consumer.
function checkHqTags (m, prob, file, sch) {
  const rel = U(file.startsWith(`${m.root}/`) ? file.slice(m.root.length + 1) : file)
  const states = new Set(pipes(sch('humanqueue.enum.state')).filter(Boolean))
  const owns = new Set(pipes(sch('humanqueue.enum.ownership')).filter(Boolean))
  const lev = s => { const x = /^#+/.exec(s); return x ? x[0].length : 0 }
  let on = false; let lv = 0
  // The same section rules hq_body uses — EVERY matching section, either heading level. Reading only
  // the first hid every later round's entries from the counter and from this check at once.
  for (const raw of splitLines(nocomment(readOr(file)).replace(/\n+$/, ''))) {
    if (/^#+[ \t\n\v\f\r]+Human queue[ \t\n\v\f\r]*$/.test(raw)) { on = true; lv = lev(raw); continue }
    if (on && /^#+[ \t\n\v\f\r]/.test(raw) && lev(raw) <= lv) on = false
    if (!on) continue
    const line = raw.replace(/^[ \t\n\v\f\r]+/, '')
    if (!line.startsWith('- [')) continue
    const s = line.slice(3)
    if (!s.includes(']')) continue
    const st = s.slice(0, s.indexOf(']'))
    if (!states.has(st)) continue
    if (st !== 'open') continue
    const rest = s.slice(s.indexOf(']') + 1).replace(/^[ \t\n\v\f\r]+/, '')
    let ow = ''
    if (rest.startsWith('[')) { const r2 = rest.slice(1); if (r2.includes(']')) ow = r2.slice(0, r2.indexOf(']')) }
    if (owns.has(ow)) continue
    // The em-dash is spelled as its BYTES. This module works in the byte domain, and the bash side
    // matches it inside an `LC_ALL=C awk`, where a multibyte literal in a pattern is a literal
    // SEQUENCE of bytes. A JS regex holding the CHARACTER U+2014 never matches a byte-domain string.
    const what = line.replace(/^[ \t\n\v\f\r]*- \[[^\]]*\][ \t\n\v\f\r]*/, '').replace(/[ \t\n\v\f\r]*\xe2\x80\x94[\s\S]*$/, '')
    if (what === '') continue
    prob('HQ-UNTAGGED', M`${rel}  Human queue '[open]' entry has no valid ownership tag → add [user-only|recommended|machine]: ${what}`)
  }
}

export function cmdValidate (m, out, json = false, consecOk = '') {
  let problems = 0
  const diags = []
  const warns = []

  // EVERY path in a diagnostic is PROJECT-RELATIVE, and this is the one place it is spelled — the
  // same rule, in the same position, as the bash runtime's `relmsg`. Doing it on the finished
  // message rather than at the ~30 construction sites is what keeps a diagnostic added later
  // relative without its author having to know; see the bash comment for the trap that shaped this
  // (a path that is BOTH the message and the key of a frontmatter census) and for the known limit.
  // The root is lifted into the byte domain too, or the prefix would not match a byte-domain path.
  const rootB = `${U(m.root)}/`
  const rel = s => s.split(rootB).join('')
  // Emitted as a BUFFER: the message is byte-domain, so encoding it as UTF-8 on the way to stdout
  // would re-encode every byte the mine actually holds. The code and the brackets are ASCII.
  const prob = (code, msg) => {
    problems++
    const t = rel(msg)
    if (json) diags.push([code, t]); else out(Buffer.from(`  [${code}] ${t}`, 'latin1'))
  }
  const warn = (code, msg) => {
    const t = rel(msg)
    if (json) warns.push([code, t]); else out(Buffer.from(`  warning: [${code}] ${t}`, 'latin1'))
  }

  // req_value: present AND not an untouched placeholder. One rule, read from the schema.
  const reqValue = (file, key) => {
    const v = fmv(file, key)
    if (v === '') { prob('FM-MISSING', M`${U(file)}  frontmatter '${key}' missing`); return false }
    if (isPlaceholder(v)) {
      prob('FM-PLACEHOLDER', M`${U(file)}  frontmatter '${key}' still holds the template placeholder ${v} — that is an instruction, not a value, and every consumer reads it as one (write took a placeholder tone as the document's tone). Replace it with the real value; if the value genuinely belongs in braces, put any character outside them`)
      return false
    }
    return true
  }

  // The schema and the config are re-read in the BYTE domain for this command alone. Their values
  // are quoted back in diagnostics (`origin '' invalid → use file|user-answer|…`, `config
  // fidelity.completeness 'x' invalid`), so they have to be in the same domain as everything else
  // the message holds. openMine's decoded copies stay as they are for every other command.
  const schB = loadSchema(m.schemaPath, 'latin1')
  const cfgB = loadConfig(m.config, 'latin1')
  const sch = k => schB.get(k) ?? ''

  // The v1 flag is computed FIRST, and that ordering is load-bearing: the document loop's seal
  // enforcement branches on it, and it used to be set in the config section that runs AFTER the
  // documents — so a genuine v1 mine was blocked as tampered for the length of one ordering bug
  // (v0.3.1, self-caught). Either record saying `1` makes the mine v1.
  const schemaV1 = fmv(m.project, 'version') === '1' || (cfgB.flat.get('version') ?? '') === '1'

  // A configured path that is not there, or mine content sitting outside it, is the same leak as an
  // unreadable schema: the loops run zero times and the tick looks earned. FORMATS explicitly allows
  // moving these, so a typo while moving folders silently switches both membranes off.
  for (const k of ['materials', 'truths', 'documents']) {
    const v = m[k]
    if (!isDirAt(v)) prob('CFG-PATH-MISSING', M`config paths.${k} → '${v}' does not exist. Every check that walks it runs zero times, which is indistinguishable from passing`)
    if (rp(v) !== rp(`${m.root}/${k}`) && isDirAt(`${m.root}/${k}`)) {
      prob('CFG-PATH-REDIRECT', M`config paths.${k} points at '${v}' but '${U(m.root)}/${k}' also exists on disk — whatever is in it is NOT being checked`)
    }
  }

  // The checks below READ the schema instead of paraphrasing it, which is right — but it means an
  // unreadable schema turns them OFF rather than making them fail, and silence looks exactly like a
  // pass. So the SoT is checked first: no schema, no verdict.
  const schkeys = words(SCH_KEYS)
  if (schkeys.length < 10) {
    prob('SCHEMA-ROSTER', M`SCH_KEYS holds only ${schkeys.length} entries — the declared schema roster is truncated, so a schema missing any other key will NOT be reported`)
  }
  for (const k of schkeys) {
    if (sch(k) !== '') continue
    prob('SCHEMA-UNREADABLE', M`${U(m.schemaPath)}  cannot read '${k}' — the format SoT is missing or unreadable, so the checks that read it would silently pass. Restore .weavedoc/schema before trusting any verdict`)
    // Returns HERE, and prints the plain verdict even under --json: with no readable schema there is
    // nothing to report an examined count about. Contract, reproduced as measured.
    out(`✗ validate: ${problems} problem(s)`)
    return 1
  }

  // --- project.md ---
  let roles = ''
  if (isFileAt(m.project)) {
    for (const k of pipes(sch('project.fm.required'))) reqValue(m.project, k)
    // `for a in $REPLY` — listfield has already split on commas, and then bash re-splits the
    // newline-joined result on WHITESPACE. An authority entry holding a space therefore becomes two
    // names on that side, and the port makes the same two rather than the tidier one.
    roles = listField(fmv(m.project, 'roles')).join('\n')
    for (const a of words(listField(fmv(m.project, 'authority')).join('\n'))) {
      if (!`\n${roles}`.includes(`\n${a}\n`) && !`\n${roles}`.endsWith(`\n${a}`)) {
        prob('PROJ-AUTHORITY', M`${U(m.project)}  authority '${a}' is not a declared role`)
      }
    }
  } else {
    prob('PROJ-MISSING', M`${U(m.project)}  missing (run 'weavedoc init')`)
  }
  const isRole = v => `\n${roles}`.includes(`\n${v}\n`) || `\n${roles}`.endsWith(`\n${v}`)

  // --- each material ---
  let nMat = 0
  const nofm = new Set()
  const mids = materialIds(m)
  const matfm = matFmState(m.materials, mids)
  for (const id of mids) {
    const f = join(m.materials, id, 'converted.md')
    if (!isFileAt(f)) { prob('MAT-NO-CONVERTED', M`${U(m.materials)}/${U(id)}/  no converted.md`); continue }
    // Counted HERE, in the loop that checks them. It used to come from the truths awk as a
    // by-product, and that awk is skipped entirely when the mine has no t*.md yet — so every project
    // reported "materials 0" for the whole window between gather and map while the materials were in
    // fact being fully checked.
    nMat++
    for (const k of pipes(sch('material.fm.required'))) {
      if (!reqValue(f, k)) continue
      const v = fmv(f, k)
      if (k === 'added' && !isDate(v)) prob('DATE-INVALID', M`${U(f)}  added '${v}' is not a date (YYYY-MM-DD, zero-padded, real month and day) — a field the format calls a date and nobody reads as one is a field that can say anything`)
    }
    // `dated` is optional, but when present it is the ONE field a supersedes resolution orders
    // materials by — an unparseable value there decides a conflict the wrong way round, silently.
    const dated = fmv(f, 'dated')
    if (dated !== '' && !isDate(dated)) prob('DATE-INVALID', M`${U(f)}  dated '${dated}' is not a date (YYYY-MM-DD, zero-padded, real month and day) — this is the field a 'supersedes' resolution orders materials by, so a value nobody can read as a date decides conflicts by accident`)
    // Only the UNCLOSED case. With no frontmatter at all the required-key checks above already say
    // so ten times over, whereas an unclosed one satisfies every one of them (the reader runs to
    // EOF) — and then every truth sourced from it is reported as a quote missing from its source
    // while the actual cause is named nowhere.
    if (matfm.get(id) === 'unclosed') {
      prob('MAT-FM-UNCLOSED', M`${U(f)}  frontmatter is never closed (a second '---' is missing) — the parser stays inside it to EOF, so this material has no body at all and every truth sourced from it is reported as a quote missing from its source`)
    }
    // One number, one spelling. `m5` and `m005` normalise to the same id, so a mine holding both
    // makes every reference to it ambiguous.
    const idc = canonId(id)
    if (idc !== null && id !== idc) {
      prob('MAT-ID-NONCANON', M`${U(m.materials)}/${U(id)}/  folder name is not the canonical id spelling — rename it to '${idc}' (ids are zero-padded to at least three digits). Two spellings of one number resolve to the same id, so any reference to it becomes ambiguous`)
    }
    if (fmv(f, 'id') !== id) prob('MAT-ID-MISMATCH', M`${U(f)}  id '${fmv(f, 'id')}' != folder '${U(id)}'`)
    const morig = fmv(f, 'origin')
    if (!inList(morig, sch('material.fm.enum.origin'))) prob('MAT-ENUM', M`${U(f)}  origin '${morig}' invalid → use ${sch('material.fm.enum.origin')}`)
    const mstat = fmv(f, 'status')
    if (!inList(mstat, sch('material.fm.enum.status'))) prob('MAT-ENUM', M`${U(f)}  status '${mstat}' invalid → use ${sch('material.fm.enum.status')}`)
    if (!isRole(fmv(f, 'role'))) prob('MAT-ROLE', M`${U(f)}  role '${fmv(f, 'role')}' not in project.md roles`)
    const stage = fmv(f, 'stage')
    if (stage !== '' && !inList(stage, sch('material.fm.enum.stage'))) prob('MAT-ENUM', M`${U(f)}  stage '${stage}' invalid → use ${sch('material.fm.enum.stage')}`)
    // origin: research — the machine gathered this, so the record must let a cold reviewer re-reach
    // the source. Without url+retrieved_at a fetched value is indistinguishable from something the
    // user said, and a real run filed searched astronomical data as 'user-answer'.
    if (morig === 'research') {
      for (const k of pipes(sch('material.fm.required_when.research'))) {
        const v = fmv(f, k)
        if (v === '') { prob('MAT-RESEARCH-FIELDS', M`${U(f)}  origin 'research' requires frontmatter '${k}' (a fetched value must stay re-checkable)`); continue }
        if (k === 'retrieved_at' && !isDate(v)) prob('DATE-INVALID', M`${U(f)}  retrieved_at '${v}' is not a date (YYYY-MM-DD, zero-padded, real month and day) — a field the format calls a date and nobody reads as one is a field that can say anything`)
      }
    }
    // corrects: this material displaces named parts of earlier materials.
    for (const ref of words(listField(fmv(f, 'corrects')).join('\n'))) {
      if (!/^m[0-9]/.test(ref)) continue
      const mm = /^(m[0-9]+)/.exec(ref)
      if (!mm) continue
      const mid = mm[1]
      if (mdirFor(m, mid) === null) prob('MAT-CORRECTS-DANGLING', M`${U(f)}  corrects '${ref}' → no such material`)
      if (mid === id) prob('MAT-CORRECTS-SELF', M`${U(f)}  corrects itself`)
    }
  }

  // --- catalog <-> materials (orphans both ways) ---
  // Absence is REPORTED, not treated as "nothing to check": a missing catalog.md would switch the
  // orphan cross-check off in both directions under a clean tick. Only once materials exist.
  if (!isFileAt(m.catalog) && mids.length > 0) {
    prob('CAT-MISSING', M`${U(m.catalog)}  missing — materials exist but the catalog does not, so the orphan cross-check (material with no row, row with no folder) runs zero times in both directions. Run gather, which writes it`)
  }
  if (isFileAt(m.catalog)) {
    const catids = catalogIds(m.catalog)
    for (const id of mids) {
      if (!catids.includes(id)) prob('CAT-NO-ROW', M`${U(m.catalog)}  material '${U(id)}' has no catalog row`)
    }
    // `done <<< "$catids_"` — a here-string over an EMPTY value still yields one empty line, so the
    // loop runs once with an empty id and asks whether `$MATERIALS/` is a directory. On a mine whose
    // materials folder is missing that answers no and the row check fires for a row that does not
    // exist. Reproduced rather than tidied: it is reachable, and tidying it would be a silent
    // behaviour change in the direction of reporting less.
    for (const id of (catids.length === 0 ? [''] : catids)) {
      if (!isDirAt(join(m.materials, id))) prob('CAT-GHOST-ROW', M`${U(m.catalog)}  row '${U(id)}' has no material folder`)
    }
  }

  // --- truths (single pass) ---
  // A directory wearing a truth filename is not a truth: gawk skips it with a stderr warning, so
  // every per-file check would quietly not run on it while the name sits in the population.
  const globbed = lsGlob(m.truths)
  for (const n of globbed) {
    if (isDirAt(join(m.truths, n))) prob('TRUTH-DIR', M`${U(m.truths)}/${n}  is a directory wearing a truth filename — not a truth and not counted; rename or remove it`)
  }
  // The material lists and the required-tag roster are computed OUTSIDE the truth-file guard below:
  // they describe the mine, and the checks needing them must still run when the truths are gone —
  // that state (files 0, index still naming them) is exactly what those checks exist to catch.
  const retracted = new Set(); const research = new Set()
  for (const id of mids) {
    const cf = join(m.materials, id, 'converted.md')
    if (!isFileAt(cf)) continue
    if (fmv(cf, 'status') === 'retracted') retracted.add(id)
    if (fmv(cf, 'origin') === 'research') research.add(id)
  }
  const reqtags = listField(fmv(m.project, 'required_tags'))
  // The same list read as BYTES, for the coverage comparison in the truths pass — see the note
  // there. Parsed independently rather than re-encoded, so a value the UTF-8 view has already
  // folded cannot be un-folded here.
  const reqtagsB = (() => {
    const lines = splitLinesBytes(m.project)
    if (lines.length === 0 || !isFence(lines[0])) return reqtags
    for (let i = 1; i < lines.length; i++) {
      if (isFence(lines[i])) break
      if (/^required_tags[ \t\v\f\r]*:/.test(lines[i])) return listField(fmVal(lines[i]))
    }
    return reqtags
  })()
  // All ids on the line, zero-padding normalised — the same rule census uses. Taking only the first
  // id made a truth listed second on a shared `removed:` line fail validate for having no record.
  const removedlog = new Set()
  for (const l of splitLines(readOr(join(m.truths, 'changelog.md')))) {
    if (!/^[ \t\v\f\r]*-[ \t\v\f\r]*removed:/.test(l)) continue
    for (const t of l.match(/(^|[^0-9A-Za-z])t[0-9]+([^0-9A-Za-z]|$)/g) ?? []) {
      const id = /t[0-9]+/.exec(t)[0]
      removedlog.add(id.replace(/^t0*/, 't') === 't' ? id : id.replace(/^t0*/, 't'))
    }
  }
  const truthPaths = globbed.filter(n => isFileAt(join(m.truths, n))).map(n => join(m.truths, n))
  let counts = { ntruthfile: 0, nsealed: 0, nsealfail: 0, ntomb: 0 }
  if (isDirAt(m.truths) && globbed.length > 0) {
    counts = validateTruths(m, {
      prob, sch, retracted, research, removedlog, reqtags, reqtagsB,
      // Lifted into the byte domain here, once: they are path fragments (decoded) that get
      // interpolated into byte-domain messages inside the pass.
      mroot: U(m.materials.startsWith(`${m.root}/`) ? m.materials.slice(m.root.length + 1) : m.materials),
      truthsRel: U(m.truths.startsWith(`${m.root}/`) ? m.truths.slice(m.root.length + 1) : m.truths)
    }, truthPaths, mids)

    // A truth file whose line 1 is not '---' is invisible to every check above (the parser never
    // opens), and can never gain an index entry — which made validate loop "run reindex" forever. An
    // UNCLOSED frontmatter is the same leak: the per-truth checks fire on the CLOSING '---', so
    // without one every check runs zero times. Both are named here rather than blamed on the index.
    for (const tf of truthPaths) {
      const tb = tf.slice(tf.lastIndexOf('/') + 1).replace(/\.md$/, '')
      const lines = splitLines(readOr(tf))
      if (lines.length === 0) continue      // no record on the bash side, so no state at all
      const tc = canonId(tb)
      if (tc !== null && tb !== tc) {
        prob('TRUTH-ID-NONCANON', M`${U(m.truths)}/${tb}.md  filename is not the canonical id spelling — rename it to '${tc}.md' and set 'id: ${tc}' (ids are zero-padded to at least three digits). Two spellings of one number resolve to the same id, so the reciprocity, winner and retracted tables would collapse both files into one entry`)
      }
      const opened = isFence(lines[0])
      let closed = false
      if (opened) for (let i = 1; i < lines.length; i++) if (isFence(lines[i])) { closed = true; break }
      if (closed) continue
      if (opened) {
        nofm.add(tb)
        prob('TRUTH-FM-UNCLOSED', M`${U(m.truths)}/${tb}.md  frontmatter is never closed (a second '---' is missing) — the parser stays inside it to EOF, so every check on this file runs zero times and its body is never sealed`)
      } else {
        nofm.add(tb)
        prob('TRUTH-NO-FM', M`${U(m.truths)}/${tb}.md  no frontmatter (line 1 must be '---') — this file is not read as a truth at all, so every check on it silently passes and no index entry can ever be generated for it`)
      }
    }
    // D3 (decided 2026-08-04): an unquoted resolution.reason holding a comma that opens no new key is
    // exactly where a strict YAML parser truncates the value and scatters the rest as ghost keys —
    // weavedoc's own readers never noticed, so the break surfaced only in external consumers. WARN,
    // never block: deployed mines must stay green while map quotes new writes.
    for (const tf of truthPaths) {
      const tb = tf.slice(tf.lastIndexOf('/') + 1).replace(/\.md$/, '')
      const lines = splitLines(readOr(tf))
      if (lines.length === 0) continue
      let infm = isFence(lines[0])
      for (let i = 1; i < lines.length && infm; i++) {
        const line = lines[i]
        if (isFence(line)) { infm = false; break }
        if (!/^resolution[ \t\v\f\r]*:/.test(line)) continue
        if (!/reason[ \t\v\f\r]*:/.test(line)) continue
        let r = line.replace(/^.*reason[ \t\v\f\r]*:[ \t\v\f\r]*/, '')
        if (r.startsWith('"')) continue
        r = r.replace(/[ \t\v\f\r]*\}[ \t\v\f\r]*$/, '')
        const seg = r.split(',')
        if (seg.length <= 1) continue
        for (let j = 1; j < seg.length; j++) {
          if (!/^[ \t\v\f\r]*[A-Za-z_][A-Za-z0-9_]*[ \t\v\f\r]*:/.test(seg[j])) {
            warn('RES-REASON-UNQUOTED', M`truths/${tb}.md  resolution.reason is unquoted and holds a comma that opens no new key — a strict YAML parser truncates the value there; write reason: "…" (map quotes it since v0.3.4)`)
            break
          }
        }
        break
      }
    }
  }

  // --- the verification sidecar is fail-closed: every row fully parsed, verdict from the closed
  // enum. A typo'd 'verifed' once fell through the classifier into a digest compare and counted as
  // digest-bound verified — the exact substring-trap class the markdown ledger already guards
  // against, missed one door over.
  const lfName = m.ledgerFile()
  const lfv = join(m.truths, lfName)
  // NOT `isFileAt` (v0.5.1): that guard skipped this whole section for anything that exists without
  // being a readable file — a directory wearing the ledger's name, a chmod-000 sidecar — and a mine
  // whose evidence is in an UNKNOWN state validated clean (external review P0-2, measured: last
  // verdict `failed`, chmod 000, rc 0). Absence stays legal (a never-verified mine has no sidecar);
  // existence in any unreadable shape blocks.
  if (existsAt(lfv)) {
    const lr = ledgerRead(lfv)
    if (lr.state !== 'ok') {
      prob('LEDGER-UNREADABLE', M`truths/${lfName} exists but cannot be read (${lr.code}) — the verification evidence is in an unknown state, which is not the same as absent: the last rows could be failures. Fix the file (permissions, or a directory wearing its name), and until then nothing counts as verified`)
    }
    // Every tab DELIMITS — the exact split verify.mjs uses, so scope and validate read one grammar.
    // The bash-shaped reader this replaces collapsed tab runs and ignored leading tabs, which made
    // this file the ledger's SECOND column parser: an extra empty column read as six clean fields
    // here while scope quarantined the row, and a leading tab made a `failed` row parse as valid
    // here while scope could not attribute it to any id (external review P0-1, both measured).
    for (const { raw: lline, terminated } of lr.lines) {
      // The terminator test comes BEFORE the comment skip (review #6): an unterminated final
      // '# …' line rode the skip and validate said nothing — but a torn line is a torn write
      // whatever its first byte, and '#' is exactly what a truncated header write starts with.
      // A final line with content and no newline is the shape a crashed writer leaves. It is
      // named rather than skipped — the skip was the old reader's, and it made an interrupted
      // verification write look like a ledger that had simply not got there yet.
      if (!terminated && lline !== '') {
        if (lline.startsWith('#')) {
          prob('LEDGER-MALFORMED', M`truths/${lfName}  the final comment line has no line terminator: '${lline}' — a torn line in the machine-owned ledger is the signature of a write that died mid-line; complete the line or delete it`)
        } else {
          prob('LEDGER-MALFORMED', M`truths/${lfName}  the last row has no line terminator: '${lline}' — a row written without its newline is the signature of a verification that died mid-write; re-run the attest that produced it, or delete the partial row`)
        }
        continue
      }
      if (lline === '' || lline.startsWith('#')) continue
      const f = lline.split('\t')
      const [lid = '', ldg = '', lvd = '', lrd = '', lst = '', ldt = ''] = f
      if (lid === '') {
        prob('LEDGER-MALFORMED', M`truths/${lfName}  row has an EMPTY id column (a leading tab, or a truncated write): '${lline}' — a row that cannot be attributed to a unit could be anyone's, including a failed verdict; while it stands, no fallback evidence counts anywhere`)
        continue
      }
      if (f.length < 3) {
        prob('LEDGER-MALFORMED', M`truths/${lfName}  row has fewer than three tab-separated columns: '${lline}' — id·sha256·verdict is the minimum; an unparseable row covers nothing and blocks`)
        continue
      }
      if (canonId(lid) === null) prob('LEDGER-MALFORMED', M`truths/${lfName}  row id '${lid}' is not a material/truth id`)
      if (lvd !== 'verified' && lvd !== 'failed' && lvd !== 'legacy-unbound') {
        prob('LEDGER-VERDICT', M`truths/${lfName}  row for '${lid}' carries unknown verdict '${lvd}' — the enum is verified|failed|legacy-unbound and an unknown word must never count as any of them`)
      }
      // The row FORMAT is fail-closed too: attest writes exactly six columns, so any deviation is a
      // hand edit — and a garbage digest or date wears the shape of evidence while binding nothing.
      if (f.length < 6) {
        prob('LEDGER-MALFORMED', M`truths/${lfName}  row for '${lid}' has fewer than six tab-separated columns — id·sha256·verdict·round·standard·date; attest writes all six`)
        continue
      }
      if (f.length > 6) prob('LEDGER-MALFORMED', M`truths/${lfName}  row for '${lid}' has more than six tab-separated columns (an EMPTY extra column counts — every tab delimits)`)
      // A control byte INSIDE a field (a CR that is not the line ending, a stray NUL) corrupts the
      // row for the next reader, which is how one fact ends up spelled two ways.
      if (/[\x00-\x08\x0a-\x1f\x7f]/.test(lline)) { // eslint-disable-line no-control-regex
        prob('LEDGER-MALFORMED', M`truths/${lfName}  row for '${lid}' holds a control byte inside a column — a CR or newline in free text corrupts the row for the next reader, which is how one fact ends up spelled two ways; re-run the attest that wrote it with a plain-text standard`)
      }
      if (ldg !== '-' && !/^[0-9a-f]{64}$/.test(ldg)) prob('LEDGER-MALFORMED', M`truths/${lfName}  row for '${lid}' digest column '${ldg}' is neither a 64-hex sha256 nor '-'`)
      // `-` or all digits. `0` passes the shape even though the message says "positive" — the shape
      // is what is enforced, and saying otherwise here would be a second rule.
      if (lrd !== '-' && (lrd === '' || /[^0-9]/.test(lrd))) prob('LEDGER-MALFORMED', M`truths/${lfName}  row for '${lid}' round column '${lrd}' must be a positive integer or '-'`)
      if (lst === '') prob('LEDGER-MALFORMED', M`truths/${lfName}  row for '${lid}' standard column is empty — attest records the standard met; migration records the origin token`)
      if (!isDate(ldt)) prob('LEDGER-MALFORMED', M`truths/${lfName}  row for '${lid}' date column '${ldt}' is not a date (YYYY-MM-DD, zero-padded, real month and day)`)
    }
  }

  // --- ledgers ABOUT the truths, checked whether or not any truth file exists ---
  // OUTSIDE the truth-file guard: deleting the last truth file must not switch these off while
  // index.md and coverage.md still name the deleted truth. "No truths" is the strongest thing they
  // have to say.
  if (isDirAt(m.truths)) {
    // With zero truth files a declared required_tag is unmet by definition. The truths pass has its
    // own version of this check, and it cannot run when that pass does not.
    if (globbed.length === 0) {
      for (const rq of reqtags) {
        if (rq !== '') prob('REQTAG-EMPTY', M`required_tag '${rq}' has no live truths — the mine holds no truth files at all; extract it from a material, queue the question (the ask loop turns the answer into a user-answer material), or remove the tag from project.md required_tags — removing it switches the completeness warranty off for that topic`)
      }
    }
    const idxPath = join(m.truths, 'index.md')
    if (!isFileAt(idxPath)) prob('IDX-MISSING', U("truths/index.md missing (run 'weavedoc reindex')"))
    if (!isFileAt(join(m.truths, 'tree.md'))) prob('IDX-MISSING', U("truths/tree.md missing (run 'weavedoc reindex')"))
    if (isFileAt(idxPath)) {
      const fseen = new Set(truthPaths.map(p => p.slice(p.lastIndexOf('/') + 1).replace(/\.md$/, '')))
      const idxseen = new Set()
      for (const iline of splitLines(readOr(idxPath))) {
        if (!iline.startsWith('- t')) continue
        // `${sid%%[!t0-9]*}` — the leading run of characters drawn from {t, 0-9}, which is why
        // `- t001: …` yields t001 and `- t0x1` yields t0. The class is exactly that, not \w.
        const sid = /^[t0-9]*/.exec(iline.slice(2))[0]
        if (/^t[0-9]/.test(sid)) idxseen.add(sid)
      }
      for (const sid of [...fseen].sort(bytewise)) {
        if (idxseen.has(sid)) continue
        // Not an index problem when the file has no frontmatter — reindex cannot fix that, and
        // telling the user to run it again is the loop itself.
        if (nofm.has(sid)) continue
        prob('IDX-SYNC', M`truths/index.md  no entry for ${sid} (run 'weavedoc reindex')`)
      }
      for (const sid of [...idxseen].sort(bytewise)) {
        if (!fseen.has(sid)) prob('IDX-SYNC', M`truths/index.md  entry '${sid}' has no truth file (run 'weavedoc reindex')`)
      }
    }

    // --- coverage manifest (soft: only materials WITH a '## m<id>' section are cross-checked) ---
    const covPath = join(m.truths, 'coverage.md')
    if (isFileAt(covPath)) validateCoverage(m, { prob }, covPath, mids, truthPaths)
  }

  // --- each document ---
  const sections = pipes(sch('review.sections'))
  const kinds = pipes(sch('review.enum.kind'))
  const folded = foldKinds(kinds)
  let nDoc = 0; let nGated = 0; let nConsec = 0; let nRseal = 0; let nRlegacy = 0
  for (const d of docIds(m)) {
    const p = join(m.documents, d, 'plan.md')
    if (isFileAt(p)) {
      for (const k of pipes(sch('plan.fm.required'))) reqValue(p, k)
      const pst = fmv(p, 'status')
      if (!inList(pst, sch('plan.fm.enum.status'))) prob('PLAN-ENUM', M`${U(p)}  status '${pst}' invalid`)
      const did = fmv(p, 'doc_id')
      if (did !== d) prob('PLAN-DOCID', M`${U(p)}  doc_id '${did}' != folder '${U(d)}'`)
      for (const c of words(listField(fmv(p, 'continues')).join('\n'))) {
        if (!isDirAt(join(m.documents, c))) prob('PLAN-CONTINUES-DANGLING', M`${U(p)}  continues '${c}' → no such document`)
      }
      // cited_truths is the lookup key for Trigger A propagation: when a truth changes, this list is
      // what says which documents must go stale. A dangling id there is silent in the worst way —
      // the document is simply never matched, so it stays green forever while its ground moved.
      for (const c of words(listField(fmv(p, 'cited_truths')).join('\n'))) {
        if (/^t[0-9]/.test(c)) {
          if (tfileFor(m, c) === null) prob('PLAN-CITED-DANGLING', M`${U(p)}  cited_truths '${c}' → no such truth. Trigger A matches documents by this list, so a dangling id exempts this document from staleness detection`)
        } else {
          prob('PLAN-CITED-NOT-ID', M`${U(p)}  cited_truths '${c}' is not a truth id (expected tNNN)`)
        }
      }
      // audience: external requires publication labels — an external document ships with its labels
      // or not at all.
      const aud = fmv(p, 'audience')
      if (aud !== '') {
        if (!inList(aud, sch('plan.fm.enum.audience'))) prob('PLAN-AUDIENCE', M`${U(p)}  audience '${aud}' invalid → ${sch('plan.fm.enum.audience')}`)
        if (aud === 'external') {
          const lab = fmv(p, 'publication_labels')
          if (!(lab !== '' && !isPlaceholder(lab))) prob('PLAN-LABELS', M`${U(p)}  audience 'external' but publication_labels is missing or an untouched placeholder — an external document ships with its labels or not at all`)
        }
      }
    } else {
      prob('PLAN-MISSING', M`${U(m.documents)}/${U(d)}/  no plan.md`)
    }

    // Three ways to BLIND the gate's reader, checked here because this decides whether a doc ships:
    //   1. a second copy of the heading — only the FIRST section is read;
    //   2. an unterminated `<!--` — the stripper blanks it to EOF, deleting every violation below;
    //   3. a prose `-->` closing a forgotten `<!--` — the file still ends outside a comment, so the
    //      balance check stays silent while the section between them vanished.
    const rev = join(m.documents, d, 'review.md')
    if (isFileAt(rev)) {
      // Counted at ANY heading level: the spec never fixed the level for this section, so a copy one
      // level down is a second copy just the same, and only the first is ever read.
      if (dupSection(rev, 'Fidelity violations', 0) > 1) {
        prob('REVIEW-DUP-HEADING', M`${U(d)} review.md has more than one 'Fidelity violations' heading (at any level) — only the first is read, so violations under the others would ship unseen. Merge them`)
      }
      if (!commentBalanced(rev)) {
        prob('REVIEW-UNTERMINATED-COMMENT', M`${U(d)} review.md ends inside an unterminated '<!--' — everything after it is blanked out before any check reads it, so open violations below would ship unseen. Close the comment`)
      }
      // Archiving a closed round in a comment stays legal, so the test is whether a section the file
      // ITSELF declares survives the strip — present raw but gone afterwards = a lost section.
      for (const r of sections) {
        if (r === '') continue
        if (dupSection(rev, r, 0, true) === 0) continue
        if (dupSection(rev, r, 0) === 0) {
          prob('REVIEW-LOST-SECTION', M`${U(d)} review.md has a '${r}' heading that is gone once comments are stripped — a '-->' in ordinary prose closes an earlier '<!--', and everything between them (headings and open violations alike) is blanked before any check reads it. Close the comment where it was meant to end`)
        }
      }
      if (folded.length > 0) {
        const marked = fidMark(rev, sections)
        // THE ZONE RULE (ruled 2026-08-01, replacing the shape census). A violation kind in brackets
        // may live in exactly one place — inside the 'Fidelity violations' section; anywhere else,
        // whatever the line looks like, it is named and blocked. The census died because recognising
        // "entry-shaped lines" chases markdown's unbounded surface forms; this inverts the burden.
        for (const [tag, line] of marked) {
          if (tag !== 'O' || !bearsKind(line, folded)) continue
          prob('REVIEW-KIND-OUTSIDE', M`${U(d)} review.md: a violation kind in brackets sits outside the 'Fidelity violations' section: '${line}' — the gate acts only inside that section, so however this line renders, the gate cannot act on it. An open violation belongs under the 'Fidelity violations' heading; a record or mention ABOUT a violation writes its kind without brackets (e.g. 'fixed: contradiction — …'); archived history belongs in an HTML comment with its closing '-->' on its own line`)
        }
        // A line that TRIED to be a violation entry but failed is told to fix itself, not binned as
        // prose. is_noise is still the sole judge of what an entry IS; this looks only at lines it
        // calls noise and asks whether the bracket slot holds a real kind.
        for (const [tag, vline] of marked) {
          if (tag !== 'I' || !vline.includes('[')) continue
          if (!isNoise(vline, kinds)) continue   // a real entry is the gate's jurisdiction, not this check's
          const sm = /^[^[]*\[([^\]]*)\]/.exec(vline)
          let vslot = sm ? sm[1] : vline
          vslot = vslot.replace(/^[<{]/, '').replace(/[>}]$/, '').replace(/^[ \t\v\f\r]+/, '').replace(/[ \t\v\f\r]+$/, '')
          if (vslot === '') continue
          const vfold = vslot.toLowerCase()
          if (!kinds.some(k => vfold.includes(k))) continue
          if (vline.startsWith('#')) {
            prob('REVIEW-KIND-SHAPE', M`${U(d)} review.md: '${vline}' starts with '#', so the gate reads it as a heading and drops it — a numbered entry is invisible to the check even though markdown renders it as body text. Start the entry with '- ' instead`)
          } else if (vline.startsWith('-->')) {
            // A `-->`-opened line lands here with an EXACT kind — the problem is the arrow, not the
            // kind: the gate reads it as a comment closer, so the entry after it is invisible.
            prob('REVIEW-KIND-SHAPE', M`${U(d)} review.md: '${vline}' starts with '-->', so the gate reads it as a comment closer and drops the whole line — the entry after the arrow is invisible however correct its kind is. Remove the stray arrow, or if it closes a real comment above, put it on its own line and start the entry on the next`)
          } else {
            prob('REVIEW-KIND-UNKNOWN', M`${U(d)} review.md: '[${vslot}]' is not an exact violation kind — the gate acts only on an exact one of ${sch('review.enum.kind')} (lowercase, no extra spaces, ONE kind per entry). Written like this the line reads as an untouched template and is silently ignored; fix the kind`)
          }
        }
        // JURISDICTION (ruled 2026-07-31): bounded to swallowed content that BEARS A KIND — a comment
        // swallowing only prose stays silent (a lost memo breaks no warranty), and the same
        // kind-in-brackets test feeds both this tripwire and the zone rule so they cannot drift.
        // KNOWN LIMIT: a prose line that happens to END with `-->` still swallows silently.
        let vcnt = 0
        for (const [vtag, vrest] of commentSpans(rev)) {
          if (vtag === 'I') {
            if (vrest.includes('[') && bearsKind(vrest, folded)) vcnt++
          } else if (vtag === 'C') {
            if (vrest !== '' && vcnt > 0) {
              prob('REVIEW-COMMENT-SWALLOWS', M`${U(d)} review.md: a comment swallows ${vcnt} violation-shaped entr(ies) and its closing '-->' is followed by '${vrest}' on the same line — if that arrow is prose that accidentally closed a forgotten '<!--', close the comment where it was meant to end; if the archive is deliberate, put the closing '-->' on its own line`)
            }
            vcnt = 0
          }
        }
      }
    }

    // gate-clean invariant: a consecrated output implies review.md's 'Fidelity violations' is empty.
    nDoc++
    let consecrated = ''
    if (isFileAt(join(m.documents, d, 'final.md'))) consecrated = 'final.md'
    if (isDirAt(join(m.documents, d, 'final'))) consecrated = 'final/'
    if (isFileAt(join(m.documents, d, 'final.md')) && isDirAt(join(m.documents, d, 'final'))) {
      // Two finals, one digest check: whichever the resolver skipped could carry unreviewed bytes.
      // Ambiguity is not a shape the gate reads around — it blocks.
      prob('GATE-DUAL-FINAL', M`${U(d)} has both final.md and final/ — only one can be the consecrated output and only one was digest-checked; remove the one that is not the reviewed artifact`)
    }
    // In-flight consecration artifacts are mine-level red flags: the marker means the final slot may
    // hold an unvalidated candidate, the backup means the only original sits aside. Traps cannot run
    // on a hard kill — the on-disk artifact is the detector. The one legal exemption is consecrate's
    // own in-process validate for exactly this doc, passed as an ARGUMENT (a variable channel was
    // environment-injectable — v0.3.3).
    if (consecOk !== d) {
      if (exists(join(m.documents, d, '.consecrate.inflight'))) prob('CONSEC-INTERRUPTED', M`${U(d)} has .consecrate.inflight — a consecration is running or died here (a hard kill leaves no other trace); if nothing is running, byte-compare final against the reviewed draft BEFORE deciding: identical → it is the staged candidate (safe to remove); different → it is your original (keep it; the crash came before the swap); absent with .final.bak present → restore the backup. Then delete the marker and re-run consecrate`)
      if (exists(join(m.documents, d, '.final.bak'))) prob('CONSEC-INTERRUPTED', M`${U(d)} has .final.bak — an interrupted consecration left the only original here; restore it over final (or remove it if the current final is known good), then re-run consecrate`)
    }
    if (consecrated !== '') {
      nConsec++
      if (!isFileAt(rev)) {
        prob('GATE-NO-REVIEW', M`${U(d)} has ${consecrated} but no review.md — the fidelity gate has no record of ever running on it. Run review before consecrating`)
      } else if (dupSection(rev, 'Fidelity violations', 0) === 0) {
        // A heading the reader cannot find returns nothing both when the section is EMPTY (good) and
        // when the title does not match — the gate read the second as the first. A suffix, trailing
        // colon, numbering prefix, NBSP or indent each did it. Absence of a readable heading is now
        // the same failure as absence of the file: silence, not a pass.
        prob('GATE-NO-HEADING', M`${U(d)} has ${consecrated} but no 'Fidelity violations' heading the gate can read in review.md — the section title must match exactly (any heading level, no suffix, no numbering, no trailing space). A title the reader cannot find is silence, not a pass`)
      } else {
        nGated++
        // The FIRST counted entry is named, or a line the writer did not think of as an entry blocks
        // the document with no thread back to the line that did it.
        for (const line of fidBody(rev, sections)) {
          if (isNoise(line, kinds)) continue
          prob('GATE-OPEN', M`${U(d)} has ${consecrated} but review.md 'Fidelity violations' is non-empty → consecrated through an open gate. First entry the gate sees: '${line}'. Repair each violation by its kind (refine), re-run review until the section is empty — or remove ${consecrated} until the gate is clean; a violation is never edited away in review.md itself`)
          break
        }
      }
    }
    // Hoisted OUT of the consecrated guard (v0.3.3): structural seal invariants hold for ANY review —
    // a draft-stage partial tuple or a marker next to a seal is the same tamper shape one
    // consecration earlier. Byte/context ENFORCEMENT and the seal counts stay next to a consecrated
    // output, where the gate's verdict actually ships.
    if (isFileAt(rev)) {
      const rk = fmv(rev, 'reviewed_kind')
      const rdg = fmv(rev, 'reviewed_digest').replace(/^sha256:/, '')
      const rcx = fmv(rev, 'review_context_digest').replace(/^sha256:/, '')
      const mkr = fmv(rev, 'review_legacy')
      if (rdg !== '') {
        if (consecrated !== '') {
          nRseal++
          if (artifactDigest(docFinalPath(m, d)) !== rdg) {
            prob('GATE-FINAL-DIGEST', M`${U(d)} ${consecrated} is not the bytes the clean review reviewed (reviewed_digest mismatch) — something changed after the seal; re-review, then re-consecrate. Nobody reviewed the bytes that are about to ship`)
          }
        }
        if (rcx === '') {
          if (!schemaV1) prob('GATE-UNSEALED', M`${U(d)} review carries reviewed_digest but no review_context_digest — a partial seal on a schema-2 mine reads as tampering, not history; re-run seal-review after a clean round`)
        } else if (consecrated !== '' && contextDigest(m, d) !== rcx) {
          prob('GATE-CONTEXT-CHANGED', M`${U(d)} review context changed after the seal (a cited truth, its source material, config or schema moved) — the clean review no longer describes this mine; re-review`)
        }
        if (rk === '') {
          if (!schemaV1) prob('GATE-UNSEALED', M`${U(d)} review carries reviewed_digest but no reviewed_kind — the seal is a tuple (kind + digest + context, all or none) and a missing member reads as tampering on a schema-2 mine; re-run seal-review after a clean round`)
        } else if (!inList(rk, sch('review.enum.reviewed_kind'))) {
          if (!schemaV1) prob('GATE-UNSEALED', M`${U(d)} review reviewed_kind '${rk}' is not draft|final — a seal validate cannot interpret certifies nothing; re-run seal-review after a clean round`)
        }
        if (mkr !== '') prob('GATE-SEAL-MARKER', M`${U(d)} review carries BOTH a seal and the migration marker review_legacy — the marker means 'v1 history, digest-less by definition' and a sealed review is neither; seal-review removes the marker when a real round seals, so coexistence is a hand-added marker parked to demote this review to legacy once the seal is stripped. Remove review_legacy (the seal is the binding record)`)
      } else if (rk !== '' || rcx !== '') {
        // Seal fields WITHOUT the digest: the other half of the partial-tuple hole. On v1 the
        // dual-reader tolerance holds (counted legacy); on v2 stray members block — and the marker
        // does not rescue them, or a partial seal plus a marker would demote to legacy.
        if (schemaV1) { if (consecrated !== '') nRlegacy++ } else {
          prob('GATE-UNSEALED', M`${U(d)} review carries seal field(s) without reviewed_digest — a partial seal on a schema-2 mine reads as tampering, not history; re-run seal-review after a clean round (the seal is a tuple: kind + digest + context, all or none)`)
        }
      } else if (consecrated === '') {
        // No seal fields, no final: an unsealed draft-stage review is the normal mid-flow state.
      } else if (schemaV1 || mkr !== '') {
        // Two legitimate digest-less states: a v1 mine (dual-reader), and a v2 mine whose review
        // carries the migration's audit marker. Tamper strips seals but leaves no marker.
        nRlegacy++
      } else {
        // THE review-seal bypass (v0.3.1): on a v2 mine an unsealed review next to a final is not
        // legacy — v1 is the only legacy there is, and this mine declares version: 2.
        prob('GATE-UNSEALED', M`${U(d)} ${consecrated} stands next to an UNSEALED review on a schema-2 mine — run seal-review after the clean round; deleting the seal fields must never reopen the gate (a genuine v1 mine reads as legacy-unbound instead)`)
      }
    }
  }

  // --- completeness warranty wiring (WD-COR-004) ---
  // `fidelity.completeness: required` turns the OPEN gap register into a gate input. The default
  // (off) keeps fill-or-accept non-blocking. required + a consecrated output + (no register at all |
  // open entries) = fail — a warranty nobody ran is not a warranty, the same rule as the gate's own
  // record. Accepted entries are decisions and never block.
  const gapsPath = `${m.root}/gaps.md`
  // The register's SECTION NAMES come from the schema (`gaps.sections`), which declared them all
  // along while this block spelled 'Open'/'Accepted' by hand — the declared-but-unread class, one
  // level up from the kind enum that had it (review #6, measured: a schema saying Pending|Waived
  // still PASSED a '# Open'/'# Accepted' file and BLOCKED a '# Pending'/'# Waived' one — the exact
  // inversion of what the declaration promises). Order is contract: open first, accepted second.
  const secNames = pipes(sch('gaps.sections') || 'Open|Accepted')
  const [secOpen = '', secAcc = ''] = secNames
  if (nConsec > 0 && (cfgB.flat.get('completeness') ?? '') === 'required') {
    if (!isFileAt(gapsPath)) {
      prob('COMP-NO-REGISTER', U("completeness is 'required' and a consecrated output exists, but there is no gaps.md — the completeness register never ran. Run the weavedoc-gaps skill (fill-or-accept) before consecrating, or set fidelity.completeness: off to drop the warranty"))
    } else if (!commentBalanced(gapsPath)) {
      // The same rule review.md has: an unclosed '<!--' blanks everything after it BEFORE any reader
      // sees a line, so gaps hidden behind it would vanish into a clean register.
      prob('COMP-MALFORMED', U("completeness is 'required' but gaps.md ends inside an unterminated '<!--' — everything after it is invisible to the counter, so gaps behind it would read as zero; close the comment"))
    } else if (secNames.length !== 2 || secOpen === '' || secAcc === '' || secOpen === secAcc) {
      // A roster value that cannot name the two sections cannot judge a register against them —
      // and two IDENTICAL members (cold review) cannot tell the open section from the accepted
      // one, so a one-section file would count as a complete register.
      prob('SCHEMA-UNREADABLE', M`schema 'gaps.sections' must name exactly two DISTINCT register sections as 'open|accepted' — it says '${sch('gaps.sections')}', and a register cannot be judged against section names the roster does not provide`)
    } else {
      // Both counts are taken BEFORE any of them is tested — the bash form is a compound `elif`
      // whose first two commands are assignments and whose third is the condition, so `gacc_` is
      // always set by the time the second branch reads it.
      const gopen = dupSection(gapsPath, secOpen, 0)
      const gacc = dupSection(gapsPath, secAcc, 0)
      if (gopen === 0) {
        // A register with no readable open section is a register that never ran, wearing a filename.
        prob('COMP-MALFORMED', M`completeness is 'required' but gaps.md has no readable '# ${secOpen}' section — the register format is '# ${secOpen}' / '# ${secAcc}' (schema gaps.sections; weavedoc-gaps writes it); a file without them proves nothing and blocks like a missing one`)
      } else if (gacc === 0) {
        prob('COMP-MALFORMED', M`completeness is 'required' but gaps.md has no readable '# ${secAcc}' section — the register format is '# ${secOpen}' / '# ${secAcc}' (schema gaps.sections; weavedoc-gaps writes both); a one-section file blocks like a malformed register`)
      } else if (gopen > 1 || gacc > 1) {
        // A duplicated register section splits the ledger: a single-section counter reads only the
        // first copy, so an empty first section next to a populated second one read as "zero open gaps".
        prob('COMP-MALFORMED', M`completeness is 'required' but gaps.md repeats a register section heading — exactly one '# ${secOpen}' and one '# ${secAcc}'; entries under a duplicated section are invisible to a single-section reader, so the copy blocks like a missing register`)
      } else {
        // STATE-BASED entry scan: a continuation is legal only AFTER a bullet — an indented line with
        // no open entry above is prose the counter cannot see, not a continuation of nothing.
        //
        // ONE SCANNER, BOTH SECTIONS (§11 2026-08-05). It ran over '# Open' only, so `# Accepted`
        // accepted anything — bare prose under it passed while FORMATS says the register grammar is
        // fail-closed and "anything else blocks". A second, looser reader for the twin section is
        // the two-parsers drift class itself, so there is one function and it is called twice.
        // BOUNDARY, deliberate: this enforces the register GRAMMAR (bullets, continuations only
        // under a bullet, no bare prose) — which is what the fail-closed sentence enumerates. It
        // does NOT require an Accepted entry's `scope:`/`recheck:`/`as-of:` fields; that is the
        // entry FORMAT, documented but never machine-enforced, and turning it into a gate could
        // block mines written before the rule without a decision to do so.
        // The placeholder filter judges the REMAINDER, the same ruling review entries follow.
        // The bracket class is spelled in BYTES, and it is a class of BYTES rather than of
        // characters — which is what `sed -E 's/[…—:·,.-]+//g'` means under LC_ALL=C, where every
        // byte of a multibyte member joins the class on its own. Written with the characters it
        // matched nothing at all here (this module is byte-domain), and a template stub stopped
        // reading as a stub: two pass_completeness_* cases went red the moment the domain changed.
        const strip = s => s.replace(/\{[^{}]*\}/g, '').replace(/<[^<>]*>/g, '').replace(/[[\](){}<>\xe2\x80\x94\xc2\xb7:,.-]+/g, '').replace(/[ \t]+/g, '')
        // The kind vocabulary comes from the SCHEMA (`gaps.enum.kind`), which declared it all along
        // while nothing read it — the declared-but-unread class the schema's own header warns
        // about, found by the v0.5.0 external review with a typo'd `[declraed]` that passed. An
        // entry whose bracket slot holds a word outside the enum is malformed in EITHER section:
        // under Open a typo still counted as debt (safe direction), but under Accepted it silently
        // became a decision nobody made about a kind that does not exist.
        // STRICT, in three ways the v0.5.1 review measured through (external review P1-3):
        //   - the kind match is EXACT against the enum's members. `inList` is the pipe-substring
        //     trick, under which '[declared|reference]' — a substring of the enum string — passed.
        //   - the no-error sentinel is null, not ''. With '' the empty-bracket kind `- []` set the
        //     sentinel to the very value that means "no error" and slipped through.
        //   - the bracket is REQUIRED: a bare `- no-kind` bullet under Accepted was an accepted
        //     decision with no kind at all, which FORMATS' entry format does not allow.
        const kindEnum = sch('gaps.enum.kind') || 'declared|reference|enumeration|symmetry'
        const kindSet = new Set(pipes(kindEnum))
        const scanRegister = (section) => {
          let n = 0; let badline = ''; let badkind = null; let dblkind = null; let unclosed = ''; let inb = false; let gnoise = false; let gnoiseKind = ''
          for (let gl of splitLines(sectionAll(nocomment(readOr(gapsPath)), section))) {
            gl = gl.replace(/\r$/, '')
            if (!/[^ \t]/.test(gl)) { inb = false; continue }
            const grest = gl.replace(/^[ \t]*/, '')
            if (grest.startsWith('- ')) {
              inb = true
              gnoise = false
              // THE BRACKET MUST CLOSE, and that is tested BEFORE anything classifies the bullet
              // (v0.5.4, review #8 P1-3). `- [{kind}` and `- [<kind>` reached the placeholder
              // branch, where strip() erased the unclosed opener along with the template word and
              // left '' — so an entry with a broken kind slot read as noise and validate said
              // nothing (measured rc 0 under required + a consecrated output). An opener with no
              // ']' is not a kind, not a placeholder and not prose: it is a malformed entry.
              if (grest.startsWith('- [') && !grest.includes(']')) {
                if (unclosed === '') unclosed = gl
              } else if (grest.startsWith('- [<') || grest.startsWith('- [{')) {
                // The bracket word rides along with the noise flag (review #7 P1-1): a bullet held
                // as noise can be REALIZED by a continuation below, and realization must carry the
                // placeholder kind into the vocabulary judgment — before this, the continuation
                // branch counted the entry and judged nothing.
                if (strip(grest.includes(']') ? grest.slice(grest.indexOf(']') + 1) : grest) === '') {
                  gnoise = true
                  gnoiseKind = grest.includes(']') ? grest.slice(3, grest.indexOf(']')) : ''
                }
                // A placeholder kind over a REAL body is an ENTRY whose kind is not in the
                // vocabulary (cold review of this patch: this branch ran before the kind branch,
                // so '- [<kind>] [declared] x — r' drew no diagnostic at all — an Accepted
                // decision wearing template noise as its kind, with a routable kind word riding
                // unjudged in the second bracket). A PURE stub stays what it was: noise — not an
                // entry, not an error — which is what keeps a freshly-initialised gaps.md green.
                else if (badkind === null) badkind = grest.includes(']') ? grest.slice(3, grest.indexOf(']')) : ''
              } else if (grest.startsWith('- [') && grest.includes(']')) {
                const kw = grest.slice(3, grest.indexOf(']'))
                if (badkind === null && !kindSet.has(kw)) badkind = kw
                // ONE kind per entry (review #6): only the first bracket was judged, so
                // '- [declared] [reference] …' rode through wearing TWO routable kinds. Blocked
                // only when the second bracket IS a kind word — a bracketed citation right after
                // the kind ('- [declared] [계약서 §3] …') is body, not a second kind.
                const after = grest.slice(grest.indexOf(']') + 1)
                const m2 = /^[ \t]*\[([^\]]*)\]/.exec(after)
                if (dblkind === null && m2 && kindSet.has(m2[1])) dblkind = `[${kw}] [${m2[1]}]`
              } else if (badkind === null) {
                badkind = ''   // no bracket at all — reported as a missing kind slot below
              }
              if (!gnoise) n++
            } else {
              if (grest === gl || !inb) { badline = gl; break }
              // A continuation with real content REALIZES the held-back bullet — it becomes an
              // entry, and its kind slot is the placeholder it was holding, judged by the same
              // vocabulary rule as any other kind (review #7 P1-1: this line counted the entry
              // and set nothing, so '- [{kind}] …' over a real continuation was an Accepted
              // decision with template noise for a kind — validate rc 0, measured).
              if (gnoise && strip(grest) !== '') { n++; gnoise = false; if (badkind === null) badkind = gnoiseKind }
            }
          }
          return { n, badline, badkind, dblkind, unclosed }
        }
        const { n: nopen, badline, badkind: openKind, dblkind: openDbl, unclosed: openUnc } = scanRegister(secOpen)
        const accepted = scanRegister(secAcc)
        for (const [sec, u] of [[secOpen, openUnc], [secAcc, accepted.unclosed]]) {
          if (u !== '') prob('COMP-MALFORMED', M`completeness is 'required' but gaps.md '# ${sec}' holds an entry whose kind bracket never closes: '${u}' — an entry opens with '[<kind>]' and the ']' is part of it; an unclosed opener names no kind at all`)
        }
        for (const [sec, kw] of [[secOpen, openKind], [secAcc, accepted.badkind]]) {
          if (kw === null) continue
          if (kw === '') prob('COMP-MALFORMED', M`completeness is 'required' but gaps.md '# ${sec}' holds an entry with no '[<kind>]' slot at all — entries open with exactly one kind from ${kindEnum} (schema gaps.enum.kind); a gap without a kind cannot be routed, and an ACCEPTED one is a decision about nothing nameable`)
          else prob('COMP-MALFORMED', M`completeness is 'required' but gaps.md '# ${sec}' holds an entry whose kind '[${kw}]' is not in the vocabulary — the enum is ${kindEnum}, matched exactly and one at a time (schema gaps.enum.kind); a kind outside it is usually a typo, and a typo'd ACCEPTED entry is a decision nobody made`)
        }
        for (const [sec, dk] of [[secOpen, openDbl], [secAcc, accepted.dblkind]]) {
          if (dk !== null) prob('COMP-MALFORMED', M`completeness is 'required' but gaps.md '# ${sec}' holds an entry carrying TWO kind brackets ${dk} — one '[<kind>]' per entry; an entry with two routable kinds cannot be routed (a second bracket that is not a kind word is ordinary body text)`)
        }
        if (accepted.badline !== '') {
          prob('COMP-MALFORMED', M`completeness is 'required' but gaps.md '# ${secAcc}' holds a line the register grammar cannot read: '${accepted.badline}' — the same grammar as '# ${secOpen}': entries are '- ' bullets and an indented line is a continuation ONLY under one. An accepted gap is a DECISION, so prose the counter cannot attribute to an entry is a decision nobody can point at`)
        }
        if (badline !== '') {
          prob('COMP-MALFORMED', M`completeness is 'required' but gaps.md '# ${secOpen}' holds a line the register grammar cannot read: '${badline}' — entries are '- [<kind>] …' bullets; an indented line is a continuation ONLY under a bullet, and prose anywhere is a gap no counter sees, so it blocks like a malformed register`)
        } else if (nopen > 0) {
          prob('COMP-OPEN-GAPS', M`completeness is 'required' but gaps.md holds ${nopen} open gap(s) next to a consecrated output — fill each (question → user-answer material → map) or move it to Accepted with a reason; under 'required' an open gap is a violation, not a note`)
        }
      }
    }
  }

  // --- truths/verify.md frontmatter + sections ---
  // ABSENCE is not blocked, unlike catalog.md: `verify` is on-demand, so a never-verified mine has
  // no verify.md legitimately. `status` reports the absence instead.
  const vmd = join(m.truths, 'verify.md')
  // The same absent-vs-unreadable split as the sidecar, found by sweeping the class rather than
  // waiting for the next review (v0.5.1): verify.md's ABSENCE is legal, so a directory wearing its
  // name used to fold into "never verified" and validate stayed green over a file it could not
  // read. (A chmod-unreadable verify.md already blocks — the empty read fails FM-MISSING — so the
  // directory spelling was the one silent shape.)
  if (existsAt(vmd) && !isFileAt(vmd)) {
    prob('VERIFY-SECTION', U('truths/verify.md exists but is not a readable file (a directory wearing its name) — its records are in an unknown state, which is not the same as never-verified; fix the path first'))
  }
  if (isFileAt(vmd)) {
    for (const k of pipes(sch('verify.fm.required'))) {
      const v = fmv(vmd, k)
      if (v === '') { prob('FM-MISSING', M`truths/verify.md  frontmatter '${k}' missing`); continue }
      if (k === 'verified_at' && !isDate(v)) prob('DATE-INVALID', M`truths/verify.md  verified_at '${v}' is not a date (YYYY-MM-DD, zero-padded, real month and day) — a field the format calls a date and nobody reads as one is a field that can say anything`)
    }
    const vst = fmv(vmd, 'status')
    if (vst !== '' && !inList(vst, sch('verify.fm.enum.status'))) prob('VERIFY-ENUM', M`truths/verify.md  status '${vst}' invalid → use ${sch('verify.fm.enum.status')}`)
    // Either heading level, read through the comment stripper — a section living only in a comment
    // satisfies a raw grep but is unreadable. Emission keeps the DECLARED section order.
    const want = new Set(pipes(sch('verify.sections')).filter(x => x !== ''))
    for (const l of splitLines(nocomment(readOr(vmd)).replace(/\n+$/, ''))) {
      if (!/^##?[ \t]/.test(l)) continue
      want.delete(l.replace(/^##?[ \t]+/, '').replace(/[ \t\r]*$/, ''))
    }
    for (const k of pipes(sch('verify.sections'))) {
      if (k !== '' && want.has(k)) prob('VERIFY-SECTION', M`truths/verify.md  required section '${k}' missing (verify.sections)`)
    }
  }

  // --- Human queue ownership tags (truths/verify.md AND documents/*/review.md) ---
  // Both carry a Human queue; checking only verify.md let a semantic dismissal parked on the
  // document side vanish from validate, status and audit alike.
  for (const hqf of hqFiles(m)) checkHqTags(m, prob, hqf, sch)

  // --- config enums ---
  const cfl = k => cfgB.flat.get(k) ?? ''
  const cse = k => cfgB.sect.get(k) ?? ''
  for (const [k, sk, label] of [['completeness', 'config.enum.completeness', 'fidelity.completeness'],
    ['detection', 'config.enum.detection', 'conflicts.detection'],
    ['attribution', 'config.enum.attribution', 'conflicts.attribution']]) {
    const v = cfl(k)
    if (v !== '' && !inList(v, sch(sk))) prob('CFG-ENUM', M`config ${label} '${v}' invalid`)
  }

  // --- schema version negotiation (WD-MIG-002) + full config contract (WD-CFG-001) ---
  const sv = sch('schema.version') || '2'
  const pv = fmv(m.project, 'version'); const cv = cfl('version')
  if (pv === '' || /[^0-9]/.test(pv)) prob('VER-NOT-INT', M`project.md version '${pv}' is not an integer — the schema version field is the negotiation handle`)
  else if (Number(pv) > Number(sv)) prob('VER-FUTURE', M`project.md declares schema version ${pv}, newer than this runtime supports (≤${sv}) — upgrade the runtime bundle, never guess at a future format`)
  if (cv === '' || /[^0-9]/.test(cv)) prob('VER-NOT-INT', M`config version '${cv}' is not an integer`)
  if (pv !== '' && cv !== '' && pv !== cv) {
    prob('VER-DISAGREE', M`project.md version (${pv}) and config.yaml version (${cv}) disagree — two records of one fact must agree; upgrade stamps both`)
  }
  for (const sect of ['verify', 'review']) {
    let v = cse(`${sect}.strength`)
    if (v !== '' && !inList(v, sch('config.strength.range'))) prob('CFG-RANGE', M`config ${sect}.strength '${v}' invalid → one of ${sch('config.strength.range')}`)
    v = cse(`${sect}.max_rounds`)
    // `0` is rejected here and only here: "exceeded → escalate" needs a ceiling that can be exceeded.
    if (v !== '' && (v === '0' || /[^0-9]/.test(v))) prob('CFG-RANGE', M`config ${sect}.max_rounds '${v}' must be a positive integer — 'exceeded → escalate' needs a ceiling that can be exceeded`)
    v = cse(`${sect}.scale`)
    if (v !== '' && !inList(v, sch('config.enum.scale'))) prob('CFG-ENUM', M`config ${sect}.scale '${v}' invalid → ${sch('config.enum.scale')}`)
    for (const ck of pipes(sch('config.repeat.scales'))) {
      v = cse(`${sect}.${ck}`)
      if (v !== '' && /[^0-9]/.test(v)) prob('CFG-RANGE', M`config ${sect}.repeat.${ck} '${v}' must be a non-negative integer (clean rounds in a row)`)
    }
  }
  // Unknown top-level keys: a NAMED warning, never a failure — extension vs typo is not
  // machine-decidable, but silence would let a typo'd knob read as configured. Over the RAW config,
  // not the parsed one: a key the parser rejects is exactly the sort that needs naming.
  for (const l of splitLines(readOr(m.config))) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*:/.test(l)) continue
    const ck = l.replace(/:[\s\S]*$/, '')
    if (!inList(ck, sch('config.toplevel'))) warn('CFG-UNKNOWN-KEY', M`unknown config key '${ck}' in .weavedoc/config.yaml — known top-level keys: ${sch('config.toplevel')}`)
  }

  // --- accounting, printed on both outcomes and BEFORE the verdict, so the verdict is never read
  // --- without it.
  // The truth FILE count comes from disk, not from the truths pass: that pass never opens a file it
  // reads no record from, so a zero-byte truth would vanish from the denominator instead of showing
  // up as unchecked. Same expression census uses, so the two commands cannot disagree.
  const nTruth = globbed.length
  // "NOT checked" fires on never-checked only, not on anything short of the file count — a
  // legitimate tombstone stub must not raise it on a clean mine.
  let nUnchk = nTruth - counts.ntomb - counts.nsealed - counts.nsealfail
  if (nUnchk < 0) nUnchk = 0
  let sealpart = `${counts.nsealed} sealed`
  if (counts.nsealfail > 0) sealpart += ` · ${counts.nsealfail} seal FAILED`
  if (counts.ntomb > 0) sealpart += ` · ${counts.ntomb} tombstone`
  if (nUnchk > 0) sealpart += ` ← ${nUnchk} NOT checked`
  const gatenote = nGated < nConsec ? ` ← ${nConsec - nGated} NOT gate-checked` : ''
  if (json) {
    // The machine contract (WD-CLI-002): stdout carries ONLY the JSON object; codes are the stable
    // surface, messages are presentation; exit-code semantics unchanged (0 pass · 1 fail).
    const bundle = readOr(`${m.root}/.weavedoc/VERSION`).replace(/\n+$/, '')
    const arr = rs => `[${rs.map(([c, msg]) => `{"code":"${jsonEsc(c)}","message":"${jsonEsc(msg)}"}`).join(',')}]`
    out(Buffer.from(`{"output_schema_version":1,"command":"validate","bundle":"${jsonEsc(bundle)}","schema_version":${m.schemaVer()},"result":"${problems > 0 ? 'fail' : 'pass'}","problems":${problems},` +
        `"examined":{"materials":${nMat},"truths":${nTruth},"sealed":${counts.nsealed},"seal_failed":${counts.nsealfail},"tombstones":${counts.ntomb},"not_checked":${nUnchk},"documents":${nDoc},"consecrated":${nConsec},"gate_checked":${nGated},"review_seals_bound":${nRseal},"review_seals_legacy":${nRlegacy}},` +
        `"schema_v1_mine":${schemaV1 ? 'true' : 'false'},"diagnostics":${arr(diags)},"warnings":${arr(warns)}}`, 'latin1'))
    return problems > 0 ? 1 : 0
  }
  out(`  examined: materials ${nMat} · truths ${nTruth} (${sealpart}) · documents ${nDoc} (${nConsec} consecrated, ${nGated} gate-checked${gatenote})`)
  // Review seals are counted out loud whenever anything is consecrated: a legacy (digest-less)
  // review next to a final is real history that binds no bytes — visible, never silently equal to a
  // sealed one.
  if (nConsec > 0) out(`  review seals: ${nRseal} digest-bound · ${nRlegacy} legacy-unbound`)
  // The invocation NAMED here is the Node one, from stage 6 on. Shell-neutral on purpose: `node
  // <path> …` reads the same in bash and in PowerShell, and the plan forbids a `.ps1` wrapper.
  // Changed in the same commit as the bash side, because this is output contract.
  if (schemaV1) out(`  schema: v1 mine — readable (dual-reader), current format is v${m.schemaVer()}; run 'node .weavedoc/bin/weavedoc.mjs upgrade --check' to see the migration`)
  if (problems === 0) { out('✓ validate: all checks passed'); return 0 }
  out(`✗ validate: ${problems} problem(s)`)
  return 1
}
