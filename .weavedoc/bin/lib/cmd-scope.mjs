// weavedoc scope — what a verify round still owes. COMPUTED, never judged.
//
// Two ledgers, both mechanical. The rules here were fought for one at a time and each one is load
// bearing: an unknown verdict covers nothing AND does not open a weaker fallback; an origin-less
// legacy m-row is truths-lane history, not material evidence; a structurally malformed row is SHOWN
// and never absorbed. `owed` is monotone in garbage — a row nobody can read never buys a unit its
// way out of a round.
import { existsSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { splitLines } from './core.mjs'
import { nocomment, sectionAll } from './sections.mjs'
import { join, materialIds, truthFiles } from './mine.mjs'
import { fmv, fmLoad } from './read.mjs'
import { ledgerRowsOf, ledgerIndex, matDigest, truthDigest } from './verify.mjs'

const readOr = p => { try { return readFileSync(p, 'utf8') } catch { return '' } }
const lowerAscii = s => s.replace(/[A-Z]/g, c => c.toLowerCase())
const pad = (p, n) => `${p}${String(n).padStart(3, '0')}`

// Sorted canonical ids -> one line, consecutive runs collapsed to a-b.
export function compressIds (ids) {
  let out = ''
  let p = ''; let n0 = null; let n1 = null
  const flush = () => { if (n0 === null) return; out += n0 === n1 ? `${pad(p, n0)} ` : `${pad(p, n0)}-${pad(p, n1)} ` }
  for (const id of ids) {
    const cp = id[0]; const cn = parseInt(id.slice(1), 10)
    if (n0 !== null && cp === p && cn === n1 + 1) { n1 = cn; continue }
    flush(); p = cp; n0 = cn; n1 = cn
  }
  flush()
  return out
}

// Reads the ledger by VERDICT, never by line shape: the production mine writes a table and the
// shipped template writes bullets, so a shape-bound parser would read the other as "nothing
// verified" — the full-mine round this command prevents, back through the door.
export function scanVerifiedUnits (m) {
  const f = join(m.truths, 'verify.md')
  if (!existsSync(f)) return { V: [], U: [] }
  const mark = lowerAscii(m.sch.get('verify.units.verified') || 'verified')
  const V = []; const U = []
  // Normalised first so every bracket below stays pure ASCII. `·` becomes a space — it only ever
  // separates ids (`t194·t195`).
  const body = sectionAll(nocomment(readOr(f)), 'Verified units')
    .replace(/[–—]/g, '-').replace(/·/g, ' ')
  for (const line of splitLines(body)) {
    if (!/^[ \t]*[|-]/.test(line)) continue          // prose, not a ledger entry
    if (/^[ \t]*\|[ \t|:-]*$/.test(line)) continue   // table separator row
    if (!/[mt][0-9]/.test(line)) continue            // names no unit (header row, note)
    // THE VERDICT DECIDES, not the presence of ids: entries name units while reporting them failed
    // or unrun, so harvesting ids blind would certify what the ledger refused. A substring test
    // fails too (`unverified` contains `verified`), so the entry must END with the marker once
    // trailing decoration is stripped.
    const v = line.replace(/[ \t|*.-]+$/, '')
    if (!new RegExp(`(^|[^a-z_])${mark}$`).test(lowerAscii(v))) { U.push(line); continue }
    // Ranges validated BEFORE anything from this line is emitted: a reversed span expands to zero
    // (silent), an absurd one to millions (one typo minting coverage) — either way the LINE covers
    // nothing and is named with the other cover-nothing entries.
    const spans = [...line.matchAll(/[mt][0-9]+-[mt][0-9]+/g)].map(x => x[0])
    let bad = false
    for (const r of spans) {
      const i = r.indexOf('-'); const a = r.slice(0, i); const b = r.slice(i + 1)
      if (a[0] !== b[0]) continue
      const an = parseInt(a.slice(1), 10); const bn = parseInt(b.slice(1), 10)
      if (bn < an || bn - an > 9999) { bad = true; break }
    }
    if (bad) { U.push(line); continue }
    for (const r of spans) {
      const i = r.indexOf('-'); const a = r.slice(0, i); const b = r.slice(i + 1)
      if (a[0] !== b[0]) continue
      for (let k = parseInt(a.slice(1), 10); k <= parseInt(b.slice(1), 10); k++) V.push(pad(a[0], k))
    }
    // Range endpoints print twice; the dedup downstream makes that free.
    for (const tok of line.match(/[mt][0-9]+/g) ?? []) V.push(pad(tok[0], parseInt(tok.slice(1), 10)))
  }
  return { V, U }
}

const uniqSort = a => [...new Set(a)].sort()
const minus = (a, b) => { const s = new Set(b); return a.filter(x => !s.has(x)) }
const inter = (a, b) => { const s = new Set(b); return a.filter(x => s.has(x)) }

export function cmdScope (m, out, json) {
  const lf = join(m.truths, m.ledgerFile())
  // TWO STATES VOID THE WHOLE SIDECAR, not just one id (v0.5.1, external review P0-1b/P0-2):
  //   unreadable — the file exists but its bytes cannot be read: the evidence is in an UNKNOWN
  //     state, and the last rows could be failures. Folding that into "no ledger" opened the v1
  //     fallbacks over a `failed` verdict (measured: chmod-000 sidecar, owed dropped to zero).
  //   headless   — a row whose id column is empty (a leading tab, a truncated write). It cannot be
  //     attributed, which means the row that vanished could have been ANY id's physical last — so
  //     per-id last-row-wins is undecidable for everyone, and no row and no fallback may count.
  // Both are named below, validate blocks both, and the whole ledger contributes nothing until the
  // file is repaired. (v0.5.0 counted headless rows and read the counter nowhere — the review's
  // P0-1b walked a `failed` verdict straight through that hole.)
  // ONE read. Every view below derives from this single index — ledgerRows/ledgerRowsBadstruct/
  // ledgerQuarantined each re-read the file, and four reads of one ledger inside one command were
  // four chances for a concurrent append to hand this narration two generations of the same bytes
  // (review #6). Same bytes, one parse, every view.
  const lidx = ledgerIndex(lf)
  const ledgerDead = lidx.state === 'unreadable' || lidx.headless > 0
  let ledger = ledgerDead ? [] : ledgerRowsOf(lidx).map(r => r.split('\t'))
  const ledgerSbad = [...lidx.malformed].sort()

  // Unknown verdicts are quarantined BEFORE classification — they cover nothing and are named.
  // Letting them fall through to the digest compare is how a typo once counted as verified.
  const ok = v => v === 'verified' || v === 'failed' || v === 'legacy-unbound'
  const ledgerBad = ledger.filter(f => f.length >= 3 && !ok(f[2])).map(f => `${f[0]} (${f[2]})`)
  ledger = ledger.filter(f => ok(f[2]))
  // Quarantine is NOT absence: a row the machine cannot read must never REDUCE what a round owes,
  // so it does not open the weaker v1 fallbacks either (ruled 2026-08-04).
  // Two ways an id's evidence can be unreadable, ONE consequence. An unknown VERDICT word was
  // already quarantined (2026-08-04); an unreadable STRUCTURE in the id's LAST row joins it here
  // (§11 2026-08-05). Both mean: no row wins, and the weaker v1 fallback does not open either —
  // otherwise a verification that broke while being written would resurrect the previous
  // `verified`, and this command would describe a state the mine is not in.
  const LBAD = new Set([...ledgerBad.map(s => s.split(' ')[0]), ...lidx.quarantined])
  const LROW = new Map(ledger.map(f => [f[0], { dg: f[1], vd: f[2], std: f[3] ?? '' }]))

  // ---- materials: population = converted.md holders minus tombstones. Evidence precedence:
  // sidecar row > v1 `status: verified` (legacy-unbound: real history, binds no bytes) > nothing.
  const originToken = m.sch.get('verify.ledger.origin.material') || 'v1-material-frontmatter'
  const matSet = new Set(materialIds(m))
  const mghost = [...LROW.keys()].filter(k => !/^t[0-9]/.test(k) && !matSet.has(k))
  let nMconv = 0; let nMbound = 0; let nMlegacy = 0; let nMstale = 0; let nMfail = 0; let nMunver = 0; let nMused = 0
  const munver = []; const mstale = []; const mfail = []; const mlegacy = []; const mOriginless = []
  for (const id of materialIds(m)) {
    const f = join(m.materials, id, 'converted.md')
    if (!existsSync(f)) continue
    const mstat = fmv(f, 'status')
    if (mstat === 'retracted') continue
    nMconv++
    let row = LROW.get(id) ?? null
    if (row && row.vd === 'legacy-unbound' && row.std !== originToken) {
      // A pre-0.3.2 migration minted material rows from the TRUTHS-lane markdown ledger — an m-id
      // mention there is extraction scope, not a conversion verdict. Such a row is not material
      // evidence, and the ignored row is SHOWN, never absorbed.
      mOriginless.push(id)
      row = null
    }
    if (row) {
      if (row.vd === 'failed') { nMfail++; mfail.push(id) } else if (row.vd === 'legacy-unbound') { nMlegacy++; mlegacy.push(id) } else if (matDigest(f) === row.dg) nMbound++
      else { nMstale++; mstale.push(id) }
    } else if (!ledgerDead && !LBAD.has(id) && mstat === 'verified') {
      nMlegacy++; mlegacy.push(id)
    } else {
      // `used` lands here too — lifecycle, not a verdict. And so does a material whose only row was
      // QUARANTINED: unreadable evidence is no evidence, and no evidence is owed.
      nMunver++; munver.push(id)
      if (mstat === 'used') nMused++
    }
  }

  // ---- truths: live vs tombstone (retracted/discarded leave the population, the same rule
  // retracted materials follow).
  //
  // A file that yields NO LINE is not in this population (fixed 2026-08-04, caught by
  // the corpus scale on `acct_zero_byte_truth` and `block_truth_shaped_directory`, since retired with the bash runtime it compared against). The bash
  // side classifies with one awk over the glob, and awk contributes nothing for an input it never
  // reads a record from — a zero-byte file, or a DIRECTORY wearing a truth filename, which gawk
  // refuses with a stderr warning. Both therefore leave scope's live count untouched there, while a
  // directory listing sees both and Node was reporting them as live-and-unverified: two extra owed
  // units that the round has no file to verify.
  //
  // This is deliberately NOT the same rule as census, one door over, and the difference is bash's
  // own: census takes its FILE COUNT from disk precisely so a zero-byte truth cannot vanish from the
  // denominator, and validate does the same and reports it as "NOT checked". So a degenerate truth
  // file is COUNTED (it exists) and UNCLASSIFIED (it says nothing) — which is the honest pair, and
  // reproducing only half of it in either direction is what makes two commands disagree about one
  // mine.
  const tl = truthFiles(m).map(f => {
    const raw = basename(f, '.md')
    let lines
    try { lines = splitLines(readFileSync(f, 'utf8')) } catch { lines = [] }
    if (lines.length === 0) return null
    const st = fmLoad(f).get('status') ?? ''
    return { cls: (st === 'retracted' || st === 'discarded') ? 'X' : 'L', canon: pad('t', parseInt(raw.slice(1), 10)), raw, file: f }
  }).filter(Boolean)
  const ondisk = uniqSort(tl.filter(x => x.cls === 'L').map(x => x.canon))
  const tomb = uniqSort(tl.filter(x => x.cls === 'X').map(x => x.canon))

  // ---- sidecar-covered live truths
  const strows = ledger.filter(f => /^t[0-9]/.test(f[0]))
  const scov = uniqSort(strows.map(f => f[0]))
  const tclass = []
  if (strows.length) {
    const incov = new Set(inter(ondisk, scov))
    const cur = new Map()
    for (const x of tl) if (x.cls === 'L' && incov.has(x.canon)) cur.set(x.canon, truthDigest(x.file))
    for (const f of strows) {
      if (!cur.has(f[0])) continue
      if (f[2] === 'legacy-unbound') { tclass.push(['L', f[0]]); continue }
      if (f[2] === 'failed') tclass.push(['F', f[0]])
      else if (cur.get(f[0]) === f[1]) tclass.push(['B', f[0]])
      else tclass.push(['S', f[0]])
    }
  }
  const nTbound = tclass.filter(x => x[0] === 'B').length
  const nTstale = tclass.filter(x => x[0] === 'S').length
  const nTfail = tclass.filter(x => x[0] === 'F').length
  const tstale = uniqSort(tclass.filter(x => x[0] === 'S').map(x => x[1]))
  const tfail = uniqSort(tclass.filter(x => x[0] === 'F').map(x => x[1]))

  // ---- v1 markdown ledger: verified ids not covered by the sidecar are legacy-unbound.
  const scan = scanVerifiedUnits(m)
  let vids = uniqSort(scan.V.filter(x => /^t[0-9]/.test(x)))
  // A DEAD sidecar closes this fallback too: the markdown record is the weaker evidence, and the
  // sidecar that would supersede it (a later `failed`, a re-verify) is exactly what cannot be read.
  if (ledgerDead) vids = []
  // The TRUTH twin of the LBAD rule: a quarantined row must not be rescued into legacy-unbound by a
  // markdown `## Verified units` mention.
  const tbad = uniqSort([...LBAD].filter(x => /^t[0-9]/.test(x)))
  if (tbad.length) vids = minus(vids, tbad)
  const diskany = uniqSort([...ondisk, ...tomb])
  let tlegacy = minus(inter(vids, ondisk), scov)
  // sidecar rows written by migration carry the legacy verdict themselves — union both sources
  tlegacy = uniqSort([...tlegacy, ...tclass.filter(x => x[0] === 'L').map(x => x[1])])
  const tunver = minus(minus(ondisk, scov), vids)
  const tghost = minus(uniqSort([...vids, ...scov]), diskany)

  if (json) {
    const jarr = a => `[${a.map(x => `"${x}"`).join(',')}]`
    out(`{"output_schema_version":1,"command":"scope","bundle":"${readOr(join(m.root, '.weavedoc', 'VERSION')).replace(/\n+$/, '')}","schema_version":${m.schemaVer()},` +
      `"ledger_state":"${ledgerDead ? (lidx.state === 'unreadable' ? 'unreadable' : 'headless-rows') : lidx.state}",` +
      `"materials":{"converted":${nMconv},"verified_bound":${nMbound},"legacy_unbound":${nMlegacy},"stale":${nMstale},"failed":${nMfail},"unverified":${nMunver},"used_but_unverified":${nMused},"originless_rows_ignored":${jarr(mOriginless)},"owed":${jarr([...munver, ...mstale, ...mfail])}},` +
      `"truths":{"live":${ondisk.length},"verified_bound":${nTbound},"legacy_unbound":${tlegacy.length},"stale":${nTstale},"failed":${nTfail},"unverified":${tunver.length},"tombstones":${tomb.length},"owed":${jarr([...tunver, ...tstale, ...tfail])}},` +
      `"ghost_ledger_ids":${jarr(tghost)}}`)
    return 0
  }

  out('scope — what a verify round still owes (computed from disk + the ledgers, not judged)')
  if (nMconv === 0 && ondisk.length === 0 && tomb.length === 0) {
    // A dead ledger is stated even on an empty mine (v0.5.2, external review): this early return
    // used to swallow the unreadable/headless line, so a mine with no units but a broken sidecar
    // read as "nothing to verify" with no hint the sidecar needed repair.
    if (lidx.state === 'unreadable') {
      out(`  ledger: truths/${m.ledgerFile()} exists but CANNOT BE READ (${lidx.code}) — repair it before trusting this summary [LEDGER-UNREADABLE]`)
    } else if (lidx.headless > 0) {
      out(`  ledger: ${lidx.headless} row(s) carry no id — repair the sidecar before trusting this summary [LEDGER-MALFORMED]`)
    }
    out('  nothing to verify yet — no converted material, no truths')
    return 0
  }
  if (nMconv > 0) {
    out(`  materials  ${nMconv} converted · ${nMbound} verified (digest-bound) · ${nMlegacy} legacy-unbound · ${nMstale} stale · ${nMfail} failed · ${nMunver} unverified   (source: truths/${m.ledgerFile()} + material frontmatter)`)
    if (munver.length) out(`    → ${compressIds(uniqSort(munver))}`)
    if (nMused > 0) out(`    (${nMused} of them status:used — \`used\` records citation, not verification; a verify round still owes them)`)
    if (mstale.length) out(`    → stale: ${compressIds(uniqSort(mstale))}`)
    if (mfail.length) out(`    → failed: ${compressIds(uniqSort(mfail))}`)
    if (mlegacy.length) out(`    → legacy-unbound: ${compressIds(uniqSort(mlegacy))}`)
    // SHOWN, never absorbed: an ignored row that vanished silently would look identical to a ledger
    // that never held it, and nobody would know a mine migrated by <=0.3.1 needs re-verify.
    if (mOriginless.length) out(`    (${mOriginless.length} pre-0.3.2 m-id ledger row(s) ignored — origin-less legacy rows are truths-lane history, not material evidence; each material reads from its own status instead: ${compressIds(uniqSort(mOriginless))})`)
    // The t-lane always had its ghost line; the m-lane and the unclassifiable (an id that fails
    // canonicalisation and keeps its raw spelling) were absorbed in silence — against this
    // command's own SHOWN-never-absorbed discipline (v0.5.1 cold review).
    if (mghost.length) out(`    ledger names ${mghost.length} id(s) with no material on disk — they cover nothing: ${compressIds(uniqSort(mghost))}`)
  }
  if (ondisk.length > 0 || tomb.length > 0) {
    out(`  truths     ${ondisk.length} live · ${nTbound} verified (digest-bound) · ${tlegacy.length} legacy-unbound · ${nTstale} stale · ${nTfail} failed · ${tunver.length} unverified   (source: truths/${m.ledgerFile()} + ## Verified units)`)
    if (tunver.length > 0) out(`    → ${compressIds(tunver)}`)
    if (tstale.length) out(`    → stale: ${compressIds(tstale)}`)
    if (tfail.length) out(`    → failed: ${compressIds(tfail)}`)
    if (tlegacy.length > 0) out(`    → legacy-unbound: ${compressIds(tlegacy)}`)
    if (tomb.length > 0) out(`    (${tomb.length} tombstone truth(s) — retracted/discarded — out of scope)`)
    if (!existsSync(join(m.truths, 'verify.md')) && !existsSync(lf)) {
      out('    (no verification ledger — nothing has been cold-verified, so every truth is owed)')
    } else if (tghost.length) {
      // A ledger naming ids that no longer exist covers nothing; said out loud because the covered
      // count would otherwise look larger than the mine and nobody could tell why.
      out(`    ledger names ${tghost.length} id(s) with no truth file — they cover nothing: ${compressIds(tghost)}`)
    }
  }
  // SHOWN, never absorbed — the same discipline `status` applies to untagged queue entries.
  if (scan.U.length) {
    out(`  ledger: ${scan.U.length} entry(s) name units but end in no "${m.sch.get('verify.units.verified') || 'verified'}" verdict — they cover nothing; add the verdict or leave the units owed:`)
    for (const l of scan.U) out(l.replace(/^[ \t]*/, '    '))
  }
  // NO trailing space (fixed 2026-08-04, caught by the corpus scale, since retired with the bash runtime it compared against). The bash line rendered
  // `printf '%s' "$ledger_bad" | tr '\n' ' '` — a command substitution has already eaten the final
  // newline, so `tr` finds none to turn into a space and the line ends at the last ')'. The lists
  // that DO end in a space (the id runs below) come through compress_ids, which prints a separator
  // after every id and then a bare newline; two different renderings, and both are contract.
  if (lidx.state === 'unreadable') {
    out(`  ledger: truths/${m.ledgerFile()} exists but CANNOT BE READ (${lidx.code}) — the evidence is in an unknown state, so nothing counts as verified and no v1 fallback opens [LEDGER-UNREADABLE]`)
  } else if (lidx.headless > 0) {
    out(`  ledger: ${lidx.headless} line(s) carry no id (a leading tab, a truncated write, or a torn comment line) — unattributable damage could hide ANY unit's latest verdict, so the sidecar contributes nothing and no v1 fallback opens [LEDGER-MALFORMED]`)
  }
  if (ledgerBad.length) out(`  ledger: row(s) with unknown verdicts — they cover nothing [LEDGER-VERDICT]: ${ledgerBad.join(' ')}`)
  // SUPERSEDED odd verdicts too (v0.5.2, external review P1-2): a typo'd verdict with a later valid
  // row used to be invisible here — the winner was judged, the history was not — while validate
  // blocked the file on it. The winner still stands (the repaired-ledger rule); the word is named.
  {
    const winnersBad = new Set(ledgerBad.map(s => s.split(' ')[0]))
    // Only ids with a VALID winning row are "superseded history" (v0.5.2 cold review): an odd word
    // on a QUARANTINED id (typo'd last row, no later row) is that id's latest, not history — the
    // malformed line already covers it — and a HEADLESS odd row keys to '' and belongs to no id.
    const hist = [...lidx.oddVerdicts].filter(([id]) => lidx.win.has(id) && !winnersBad.has(id)).map(([id, w]) => `${id} (${w})`)
    if (hist.length) out(`  ledger: superseded row(s) carry unknown verdicts — history, not evidence, and validate blocks on them [LEDGER-VERDICT]: ${hist.join(' ')}`)
  }
  if (ledgerSbad.length) {
    // The shared strict filter dropped these before classification — shown here so a truncated or
    // hand-mangled row reads as "covers nothing" in scope AND blocks in validate, never one without
    // the other (v0.3.3: two parsers on one ledger was the drift class itself).
    out(`  ledger: structurally malformed row(s) — they cover nothing [LEDGER-MALFORMED]: ${ledgerSbad.join(' ')} `)
  }
  const owed = nMunver + nMstale + nMfail + tunver.length + nTstale + nTfail
  if (owed === 0 && nMlegacy + tlegacy.length > 0) {
    out(`  → nothing unverified — ${nMlegacy + tlegacy.length} legacy-unbound unit(s) await digest binding: re-verify by risk (final-cited · high-risk · research/adopted/derived first). History is preserved, never counted digest-bound.`)
  } else if (owed === 0) {
    out('  → nothing unverified. A round here would re-check what the ledger already covers.')
  } else {
    out('  → a round examines the sets above. Units already covered are not re-verified without a reason recorded in verify.md.')
  }
  return 0
}
