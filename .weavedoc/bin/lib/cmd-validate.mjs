// weavedoc validate — format + truth coherence. The floor under the AI fidelity gate.
//
// PORTING NOTE, and it is the method rather than a remark. Every rule below was settled by RUNNING
// the bash original against a mine and reading what came back, not by reading its source. The
// difference is not academic: `in_list` looks like a membership test and is a delimiter-bounded
// SUBSTRING test; the truths reader takes the LAST spelling of a duplicated key while fm() takes
// the first; a zero-byte file is invisible to an awk and present to a directory listing. Each of
// those was found by measurement after being got wrong by reading.
//
// The scale is tests/parity-corpus.sh over the mines the 345 regression cases build — whole-output
// comparison, because a substring suite cannot grade a rewrite whose contract is bytes.
import { statSync, realpathSync, readFileSync } from 'node:fs'
import { canonId, isDate, isFence, isPlaceholder, inList, listField, pipes, splitLines } from './core.mjs'
import { join, materialIds, mdirFor } from './mine.mjs'
import { fmv } from './read.mjs'

const readOr = p => { try { return readFileSync(p, 'utf8') } catch { return '' } }
const isDirAt = p => { try { return statSync(p).isDirectory() } catch { return false } }
const isFileAt = p => { try { return statSync(p).isFile() } catch { return false } }

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
verify.ledger.file verify.ledger.origin.material verify.ledger.origin.truths verify.ledger.verdicts verify.sections verify.units.verified`

// Bash word splitting on unquoted `$var` with the default IFS: split on ANY run of space, tab or
// newline, and drop the empty fields. Several loops below depend on this being the splitting rule
// and not "split on commas" or "split on newlines" — `for a in $REPLY` after listfield re-splits an
// item that contains a space into two, and the port has to make the same two.
const words = s => s.split(/[ \t\n]+/).filter(x => x !== '')

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

export function cmdValidate (m, out, json = false) {
  let problems = 0
  const diags = []
  const warns = []

  // EVERY path in a diagnostic is PROJECT-RELATIVE, and this is the one place it is spelled — the
  // same rule, in the same position, as the bash runtime's `relmsg`. Doing it on the finished
  // message rather than at the ~30 construction sites is what keeps a diagnostic added later
  // relative without its author having to know; see the bash comment for the trap that shaped this
  // (a path that is BOTH the message and the key of a frontmatter census) and for the known limit.
  const rel = s => s.split(`${m.root}/`).join('')
  const prob = (code, msg) => {
    problems++
    const t = rel(msg)
    if (json) diags.push([code, t]); else out(`  [${code}] ${t}`)
  }
  const warn = (code, msg) => {
    const t = rel(msg)
    if (json) warns.push([code, t]); else out(`  warning: [${code}] ${t}`)
  }

  // req_value: present AND not an untouched placeholder. One rule, read from the schema.
  const reqValue = (file, key) => {
    const v = fmv(file, key)
    if (v === '') { prob('FM-MISSING', `${file}  frontmatter '${key}' missing`); return false }
    if (isPlaceholder(v)) {
      prob('FM-PLACEHOLDER', `${file}  frontmatter '${key}' still holds the template placeholder ${v} — that is an instruction, not a value, and every consumer reads it as one (write took a placeholder tone as the document's tone). Replace it with the real value; if the value genuinely belongs in braces, put any character outside them`)
      return false
    }
    return true
  }

  const sch = k => m.sch.get(k) ?? ''

  // A configured path that is not there, or mine content sitting outside it, is the same leak as an
  // unreadable schema: the loops run zero times and the tick looks earned. FORMATS explicitly allows
  // moving these, so a typo while moving folders silently switches both membranes off.
  for (const k of ['materials', 'truths', 'documents']) {
    const v = m[k]
    if (!isDirAt(v)) prob('CFG-PATH-MISSING', `config paths.${k} → '${v}' does not exist. Every check that walks it runs zero times, which is indistinguishable from passing`)
    if (rp(v) !== rp(`${m.root}/${k}`) && isDirAt(`${m.root}/${k}`)) {
      prob('CFG-PATH-REDIRECT', `config paths.${k} points at '${v}' but '${m.root}/${k}' also exists on disk — whatever is in it is NOT being checked`)
    }
  }

  // The checks below READ the schema instead of paraphrasing it, which is right — but it means an
  // unreadable schema turns them OFF rather than making them fail, and silence looks exactly like a
  // pass. So the SoT is checked first: no schema, no verdict.
  const schkeys = words(SCH_KEYS)
  if (schkeys.length < 10) {
    prob('SCHEMA-ROSTER', `SCH_KEYS holds only ${schkeys.length} entries — the declared schema roster is truncated, so a schema missing any other key will NOT be reported`)
  }
  for (const k of schkeys) {
    if (sch(k) !== '') continue
    prob('SCHEMA-UNREADABLE', `${m.schemaPath}  cannot read '${k}' — the format SoT is missing or unreadable, so the checks that read it would silently pass. Restore .weavedoc/schema before trusting any verdict`)
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
        prob('PROJ-AUTHORITY', `${m.project}  authority '${a}' is not a declared role`)
      }
    }
  } else {
    prob('PROJ-MISSING', `${m.project}  missing (run 'weavedoc init')`)
  }
  const isRole = v => `\n${roles}`.includes(`\n${v}\n`) || `\n${roles}`.endsWith(`\n${v}`)

  // --- each material ---
  let nMat = 0
  const mids = materialIds(m)
  const matfm = matFmState(m.materials, mids)
  for (const id of mids) {
    const f = join(m.materials, id, 'converted.md')
    if (!isFileAt(f)) { prob('MAT-NO-CONVERTED', `${m.materials}/${id}/  no converted.md`); continue }
    // Counted HERE, in the loop that checks them. It used to come from the truths awk as a
    // by-product, and that awk is skipped entirely when the mine has no t*.md yet — so every project
    // reported "materials 0" for the whole window between gather and map while the materials were in
    // fact being fully checked.
    nMat++
    for (const k of pipes(sch('material.fm.required'))) {
      if (!reqValue(f, k)) continue
      const v = fmv(f, k)
      if (k === 'added' && !isDate(v)) prob('DATE-INVALID', `${f}  added '${v}' is not a date (YYYY-MM-DD, zero-padded, real month and day) — a field the format calls a date and nobody reads as one is a field that can say anything`)
    }
    // `dated` is optional, but when present it is the ONE field a supersedes resolution orders
    // materials by — an unparseable value there decides a conflict the wrong way round, silently.
    const dated = fmv(f, 'dated')
    if (dated !== '' && !isDate(dated)) prob('DATE-INVALID', `${f}  dated '${dated}' is not a date (YYYY-MM-DD, zero-padded, real month and day) — this is the field a 'supersedes' resolution orders materials by, so a value nobody can read as a date decides conflicts by accident`)
    // Only the UNCLOSED case. With no frontmatter at all the required-key checks above already say
    // so ten times over, whereas an unclosed one satisfies every one of them (the reader runs to
    // EOF) — and then every truth sourced from it is reported as a quote missing from its source
    // while the actual cause is named nowhere.
    if (matfm.get(id) === 'unclosed') {
      prob('MAT-FM-UNCLOSED', `${f}  frontmatter is never closed (a second '---' is missing) — the parser stays inside it to EOF, so this material has no body at all and every truth sourced from it is reported as a quote missing from its source`)
    }
    // One number, one spelling. `m5` and `m005` normalise to the same id, so a mine holding both
    // makes every reference to it ambiguous.
    const idc = canonId(id)
    if (idc !== null && id !== idc) {
      prob('MAT-ID-NONCANON', `${m.materials}/${id}/  folder name is not the canonical id spelling — rename it to '${idc}' (ids are zero-padded to at least three digits). Two spellings of one number resolve to the same id, so any reference to it becomes ambiguous`)
    }
    if (fmv(f, 'id') !== id) prob('MAT-ID-MISMATCH', `${f}  id '${fmv(f, 'id')}' != folder '${id}'`)
    const morig = fmv(f, 'origin')
    if (!inList(morig, sch('material.fm.enum.origin'))) prob('MAT-ENUM', `${f}  origin '${morig}' invalid → use ${sch('material.fm.enum.origin')}`)
    const mstat = fmv(f, 'status')
    if (!inList(mstat, sch('material.fm.enum.status'))) prob('MAT-ENUM', `${f}  status '${mstat}' invalid → use ${sch('material.fm.enum.status')}`)
    if (!isRole(fmv(f, 'role'))) prob('MAT-ROLE', `${f}  role '${fmv(f, 'role')}' not in project.md roles`)
    const stage = fmv(f, 'stage')
    if (stage !== '' && !inList(stage, sch('material.fm.enum.stage'))) prob('MAT-ENUM', `${f}  stage '${stage}' invalid → use ${sch('material.fm.enum.stage')}`)
    // origin: research — the machine gathered this, so the record must let a cold reviewer re-reach
    // the source. Without url+retrieved_at a fetched value is indistinguishable from something the
    // user said, and a real run filed searched astronomical data as 'user-answer'.
    if (morig === 'research') {
      for (const k of pipes(sch('material.fm.required_when.research'))) {
        const v = fmv(f, k)
        if (v === '') { prob('MAT-RESEARCH-FIELDS', `${f}  origin 'research' requires frontmatter '${k}' (a fetched value must stay re-checkable)`); continue }
        if (k === 'retrieved_at' && !isDate(v)) prob('DATE-INVALID', `${f}  retrieved_at '${v}' is not a date (YYYY-MM-DD, zero-padded, real month and day) — a field the format calls a date and nobody reads as one is a field that can say anything`)
      }
    }
    // corrects: this material displaces named parts of earlier materials.
    for (const ref of words(listField(fmv(f, 'corrects')).join('\n'))) {
      if (!/^m[0-9]/.test(ref)) continue
      const mm = /^(m[0-9]+)/.exec(ref)
      if (!mm) continue
      const mid = mm[1]
      if (mdirFor(m, mid) === null) prob('MAT-CORRECTS-DANGLING', `${f}  corrects '${ref}' → no such material`)
      if (mid === id) prob('MAT-CORRECTS-SELF', `${f}  corrects itself`)
    }
  }

  // --- catalog <-> materials (orphans both ways) ---
  // Absence is REPORTED, not treated as "nothing to check": a missing catalog.md would switch the
  // orphan cross-check off in both directions under a clean tick. Only once materials exist.
  if (!isFileAt(m.catalog) && mids.length > 0) {
    prob('CAT-MISSING', `${m.catalog}  missing — materials exist but the catalog does not, so the orphan cross-check (material with no row, row with no folder) runs zero times in both directions. Run gather, which writes it`)
  }
  if (isFileAt(m.catalog)) {
    const catids = catalogIds(m.catalog)
    for (const id of mids) {
      if (!catids.includes(id)) prob('CAT-NO-ROW', `${m.catalog}  material '${id}' has no catalog row`)
    }
    // `done <<< "$catids_"` — a here-string over an EMPTY value still yields one empty line, so the
    // loop runs once with an empty id and asks whether `$MATERIALS/` is a directory. On a mine whose
    // materials folder is missing that answers no and the row check fires for a row that does not
    // exist. Reproduced rather than tidied: it is reachable, and tidying it would be a silent
    // behaviour change in the direction of reporting less.
    for (const id of (catids.length === 0 ? [''] : catids)) {
      if (!isDirAt(join(m.materials, id))) prob('CAT-GHOST-ROW', `${m.catalog}  row '${id}' has no material folder`)
    }
  }

  // UNIT BOUNDARY (stage 5a-1). The truths pass, the ledger and index cross-checks, the document
  // loop, the completeness warranty and the `examined:` accounting all land in the units after this
  // one; until then this function prints the shell-side diagnostics and nothing else, and the CLI
  // still refuses `validate` outright. tests/validate-node.mjs is what the scale runs meanwhile.
  void nMat; void warns; void diags; void warn
  return problems > 0 ? 1 : 0
}
