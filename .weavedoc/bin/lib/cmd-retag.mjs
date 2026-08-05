// weavedoc retag <old> <new> [--dry] — rename or merge a tag across the mine.
//
// Rewrites a tag everywhere the FORMAT GUARANTEES a parseable list: a truth's `tags:`, project.md's
// `required_tags:`, a plan's `scope_tags:`. Merging is the same operation (old -> an existing new
// dedupes). Free-text mentions are listed, never rewritten.
//
// Write mode is a TRANSACTION. Targets are guarded, every file is snapshotted before its first edit,
// and the whole rename answers to a post-write FULL VALIDATION — fail and every byte is restored and
// the generated views are re-synced. A tag rename must not be able to half-happen.
import { readFileSync, readdirSync, mkdtempSync, rmSync, existsSync, statSync, appendFileSync, copyFileSync } from 'node:fs'
import { splitLines, isFence, U } from './core.mjs'
import { join, docIds } from './mine.mjs'
import { clearFileCaches } from './read.mjs'
import { requireInsideRoot, writeAtomicX } from './write.mjs'

// The two operations a fault can land on, injectable the way consecrate's are (and for the same
// reason: node:fs cannot be reached by a PATH shim, so the fault-injection driver is the only
// caller that ever passes anything else — no runtime switch, no environment channel).
export const realOps = {
  write: (f, buf) => writeAtomicX(f, buf),
  restore: (from, to) => copyFileSync(from, to)
}

// BYTES throughout, for the same reason validate works in bytes: retag prints the paths it touched
// and rewrites tag lists that are Korean in every real mine. A UTF-8 decode would fold an invalid
// byte to U+FFFD and then WRITE that back, which turns a rename into silent corruption of the very
// line it was asked to edit.
const readB = p => { try { return readFileSync(p).toString('latin1') } catch { return '' } }
const isFileAt = p => { try { return statSync(p).isFile() } catch { return false } }
const W = '[ \\t\\v\\f\\r]'

// THE GLOB the bash side hands awk: 't', one digit, ANYTHING, '.md' — so `t01x.md` is rewritten
// too. Sorted bytewise, which is what the glob's LC_ALL=C order means.
const truthGlob = m => {
  try {
    return readdirSync(m.truths).filter(n => /^t[0-9].*\.md$/.test(n))
      .sort((a, b) => Buffer.compare(Buffer.from(a, 'latin1'), Buffer.from(b, 'latin1')))
  } catch { return [] }
}

// The list rewriter, one file at a time. Returns { hit, lines } — `hit` is whether the tag was found
// in a parseable list, `lines` the rewritten file.
//
// FRONTMATTER ONLY. Matching over the whole file rewrote a BODY that quotes a list-shaped line
// (`tags: [위약, 대금]`, which FORMATS encourages when the wording IS the fact) and broke the seal on
// the tool's own edit. The body is sealed; the only writer here must not touch it.
function rewrite (text, key, oldTag, newTag) {
  const lines = splitLines(text)
  const out = []
  let hit = false
  let infm = lines.length > 0 && isFence(lines[0])
  const keyRe = new RegExp(`^${key}${W}*:${W}*\\[`)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (i === 0) { out.push(line); continue }
    if (infm && isFence(line)) { infm = false; out.push(line); continue }
    if (!infm || !keyRe.test(line)) { out.push(line); continue }
    let inner = line.replace(/^[^[]*\[/, '').replace(/\].*$/, '')
    // Everything after the closing `]` rides along unchanged — a trailing YAML comment is not part
    // of the value. Whether the substitution MATCHED is what decides: with no closing `]` it strips
    // nothing, and appending the tail would corrupt the line, so an unclosed list is left EXACTLY
    // as it is. validate names the unclosed bracket; this command does not try to repair it.
    const tailM = /^[^\]]*\]/.exec(line)
    if (tailM === null) { out.push(line); continue }
    const tail = line.slice(tailM[0].length)
    const strip = s => s.replace(new RegExp(`^${W}+|${W}+$`, 'g'), '').replace(/^"|"$/g, '')
    const seen = new Set()
    const els = []
    let lineHit = false
    for (const raw of inner.split(',')) {
      let e = strip(raw)
      if (e === '') continue
      if (e === oldTag) { e = newTag; lineHit = true }
      if (seen.has(e)) continue
      seen.add(e); els.push(e)
    }
    if (!lineHit) { out.push(line); continue }
    hit = true
    out.push(`${key}: [${els.join(', ')}]${tail}`)
  }
  return { hit, text: out.length ? out.join('\n') + '\n' : '' }
}

// Line endings follow the file's FIRST LINE: the rewriter emits LF, so without this a one-tag
// rename rewrote every line of a CRLF file — a whole-file diff for one word. Stated precisely
// (v0.5.1 cold review measured the mixed case): a uniformly-CRLF file comes back uniformly CRLF
// and a uniformly-LF file uniformly LF, byte-preserving in both; a file that arrives MIXED is
// NORMALISED to its first line's ending, which is a repair, not preservation — one bare LF inside
// a CRLF file gains its CR (cr 8→9 measured), and CRLF strays inside an LF file lose theirs.
// The write itself goes through the injected op — stage+rename with false PROMOTED (§11 2026-08-05):
// the direct writeFileSync this replaces threw EACCES out of the whole command on a read-only
// target, leaving the rename half-applied with the backup dir still sitting there (measured, the
// v0.4.0 external review's P0). bash never had that failure shape to match — its sed/mv writes
// replace the file instead of opening it.
function writePreservingEol (file, text, original, write) {
  const first = original.split('\n')[0] ?? ''
  if (first.endsWith('\r')) {
    // BLANK lines carry the CR too (v0.5.1, external review P1-5). The old `l === ''` skip meant a
    // CRLF file with an interior blank line came back MIXED — one bare LF in a CRLF file, measured
    // as 11 CRs in and 10 out — and post-validate called it clean because content-wise it is. Only
    // the final empty element (the split artifact after the last newline) stays bare; giving it a
    // CR would append a phantom \r-only line to the file.
    const parts = text.split('\n')
    text = parts.map((l, i) => (i === parts.length - 1 && l === '' ? l : l.replace(/\r*$/, '\r'))).join('\n')
  }
  write(file, Buffer.from(text, 'latin1'))
}

export function cmdRetag (m, out, errln, argv, runReindex, runValidate, ops = realOps) {
  const oldTag = argv[0] ?? ''
  const newTag = argv[1] ?? ''
  const flag = argv[2] ?? ''
  const usage = () => { out('usage: weavedoc retag <old> <new> [--dry]'); return 2 }
  // The CONCATENATION is tested, exactly as bash does: `case "$old$new" in *--dry*`. So a tag ending
  // in `--` next to one starting with `dry` trips it too — reproduced, not tidied.
  if (`${oldTag}${newTag}`.includes('--dry')) return usage()
  if (oldTag === '' || newTag === '') return usage()
  if (oldTag === newTag) { out('retag: old and new are identical'); return 2 }
  // An unknown third flag used to be ignored — `--forcee` meant "--dry misspelled" to the user and
  // "write everything" to the tool. A write command must not guess.
  let dry = false
  if (flag === '--dry') dry = true
  else if (flag !== '') return usage()

  const O = U(oldTag); const N = U(newTag)
  let bak = null
  const baked = []
  if (!dry) {
    if (!requireInsideRoot(m.root, m.truths, 'retag', errln)) return 1
    if (!requireInsideRoot(m.root, m.documents, 'retag', errln)) return 1
    try { bak = mkdtempSync(`${m.root}/.retag-bak.`) } catch { out('retag: cannot create the backup dir'); return 1 }
  }
  const snapshot = f => {
    if (bak === null) return
    const rel = f.startsWith(`${m.root}/`) ? f.slice(m.root.length + 1) : f
    const bk = `${bak}/${rel.split('/').join('__')}`
    if (!existsSync(bk)) { copyFileSync(f, bk); appendFileSync(bak + '/.list', rel + '\n'); baked.push(rel) }
  }

  out(dry ? `retag '${oldTag}' → '${newTag}' (dry run — nothing written):`
    : `retag '${oldTag}' → '${newTag}':`)

  let total = 0; let truthhits = 0
  const relOf = f => (f.startsWith(`${m.root}/`) ? f.slice(m.root.length + 1) : f)

  // Restore every snapshot, verify the restoration, re-sync the views — ONE spelling, answered to
  // by both failure paths (post-validate red, and a write that threw mid-rename). The postcondition
  // is byte equality against the snapshot, VERIFIED rather than assumed (§11 2026-08-05): a restore
  // that failed, or restored different bytes, keeps the backup and says so — this command never
  // claims "as before" it did not check.
  const rollbackAll = (msg) => {
    const failed = []
    for (const rel of baked) {
      try { ops.restore(`${bak}/${rel.split('/').join('__')}`, `${m.root}/${rel}`) } catch { failed.push(rel) }
    }
    for (const rel of baked) {
      if (failed.includes(rel)) continue
      try {
        if (!readFileSync(`${m.root}/${rel}`).equals(readFileSync(`${bak}/${rel.split('/').join('__')}`))) failed.push(rel)
      } catch { failed.push(rel) }
    }
    clearFileCaches()
    // The re-sync's OWN failure is part of the rollback's truth (v0.5.1, external review P1-2):
    // this used to run unchecked and the message below still said "indexes re-synced" — combine it
    // with an index fault and the command claimed a sync that never happened over a view that might
    // be gone. The restored TAG FILES are byte-verified either way; the generated views are
    // regenerable, so a failed re-sync downgrades the message, not the restoration.
    let resync = true
    if (truthhits > 0 && runReindex() !== 0) resync = false
    if (failed.length) {
      const u = x => Buffer.from(x, 'latin1').toString('utf8')
      errln(`retag: rollback INCOMPLETE — could not restore: ${failed.map(u).join(' ')}. The originals are preserved in ${u(relOf(bak))}/ — restore them by hand, then run validate. Do NOT delete that directory until the mine validates clean.`)
      return 1
    }
    rmSync(bak, { recursive: true, force: true })
    if (!resync) {
      errln(`${msg.replace(', indexes re-synced', '')} BUT the index re-sync itself failed — run 'weavedoc reindex', then validate.`)
      return 1
    }
    errln(msg)
    return 1
  }

  try {
    const doFile = (f, key, label) => {
      const text = readB(f)
      const r = rewrite(text, key, O, N)
      if (!r.hit) return
      out(`  ${Buffer.from(relOf(f), 'latin1').toString('utf8')} (${label})`)
      total++
      if (key === 'tags') truthhits++
      if (dry) return
      snapshot(f)
      writePreservingEol(f, r.text, text, ops.write)
    }

    for (const n of truthGlob(m)) {
      const f = join(m.truths, n)
      if (isFileAt(f)) doFile(f, 'tags', 'tags')
    }
    if (isFileAt(m.project)) doFile(m.project, 'required_tags', 'required_tags')
    for (const d of docIds(m)) {
      const p = join(m.documents, d, 'plan.md')
      if (isFileAt(p)) doFile(p, 'scope_tags', 'scope_tags')
    }
    if (total === 0) out(`  no list-field occurrences of '${oldTag}'`)

    // Free-text mentions are LISTED, never rewritten: these files hold prose, and a rename that edited
    // prose would be editing a human's words on a machine's guess.
    const free = []
    for (const f of [`${m.root}/gaps.md`, `${m.root}/questions.md`, join(m.truths, 'verify.md')]) {
      if (isFileAt(f) && readB(f).includes(O)) free.push(relOf(f))
    }
    if (free.length) out(`  review manually (free-text mentions of '${oldTag}', not rewritten):${free.map(x => ' ' + Buffer.from(x, 'latin1').toString('utf8')).join('')}`)

    if (dry) return 0
    if (total === 0) { rmSync(bak, { recursive: true, force: true }); return 0 }

    // ---- commit path: regenerate the views, then the full validation everything answers to --------
    // THE CACHES ARE DROPPED FIRST. Content caches are per-PROCESS, and a write command that
    // re-validates in the same process would otherwise validate the bytes it CACHED before its own
    // edits — the bash runtime resets its frontmatter and file caches at the top of cmd_validate for
    // exactly this reason, and it self-caught the bug that made the rule. Without this the rename's
    // own new tags are invisible to the validation that is supposed to approve them.
    clearFileCaches()
    let vrc = 0
    if (truthhits > 0 && runReindex() !== 0) vrc = 1
    let vout = []
    if (vrc === 0) {
      clearFileCaches()
      const rc = runValidate(l => vout.push(l))
      if (rc !== 0) vrc = 1
    }
    if (vrc === 0) {
      rmSync(bak, { recursive: true, force: true })
      out(`done — ${total} file(s) rewritten · post-validate clean.`)
      return 0
    }
    for (const l of vout) out(Buffer.isBuffer(l) ? Buffer.concat([Buffer.from('  ', 'latin1'), l]) : `  ${l}`)
    return rollbackAll('retag: post-write validation FAILED — every edit rolled back, indexes re-synced; the mine is as before. The problems above predate the rename.')
  } catch (e) {
    // A write (or anything else mid-mutation) threw. Before §11 2026-08-05 this escaped the command
    // whole: stack trace, half the rename applied, the backup dir abandoned — the exact state the
    // snapshot discipline exists to prevent. Same rollback, same postcondition, its own message.
    if (bak === null) throw e
    errln(`retag: ${e.message}`)
    return rollbackAll('retag: a write FAILED mid-rename — every prior edit rolled back, indexes re-synced; the mine is as before.')
  }
}
