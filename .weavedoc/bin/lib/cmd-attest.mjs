// weavedoc attest <verified|failed> <round> <standard> <id...> — THE verification write path.
//
// The digest is computed HERE and never by hand, so "which bytes were verified" has one spelling.
// All-or-nothing: every id resolves, exists and is not a tombstone BEFORE one byte is written —
// a partially applied attest would record coverage for units nobody checked.
import { statSync, readFileSync } from 'node:fs'
import { canonId, inList, splitLines } from './core.mjs'
import { join, fm, tfileFor, unitDigest } from './mine.mjs'
import { today, writeAtomic, readText, textBuf, U } from './write.mjs'

// `-f` and `-d`, not "exists". The distinction is not pedantry here: readFileSync on a directory
// THROWS, so an `existsSync` gate would turn a mine where `verify.md` is a folder from bash's quiet
// skip into an uncaught stack trace. Every test below is the one the original spells.
const isFile = p => { try { return statSync(p).isFile() } catch { return false } }
const isDir = p => { try { return statSync(p).isDirectory() } catch { return false } }

const LEDGER_HEADER =
  '# machine-owned verification ledger — append-only; LAST row per id wins. Written by `weavedoc attest`.\n' +
  '# id\tsha256\tverdict\tround\tstandard\tdate\n'

export function cmdAttest (m, out, argv) {
  if (argv.length < 4) { out('usage: weavedoc attest <verified|failed> <round> <standard> <id...>'); return 2 }
  const verdict = argv[0]
  const round = argv[1]
  const standard = argv[2]
  const ids = argv.slice(3)

  const vds = m.sch.get('verify.ledger.verdicts') || 'verified|failed'
  if (!inList(verdict, vds)) { out(`attest: verdict '${verdict}' must be one of: ${vds}`); return 2 }
  // The bash rule is a case pattern — reject empty, reject exactly "0", reject any non-digit. Note
  // what it does NOT reject: "00" and "007" are accepted (measured against the original, not read
  // off it). A port that "tidied" that to a numeric test would refuse a round the tool accepts.
  if (round === '' || round === '0' || /[^0-9]/.test(round)) {
    out(`attest: round '${round}' must be a positive integer`); return 2
  }

  const day = today()
  const rows = []
  const names = []
  for (const id of ids) {
    const cid = canonId(id)
    if (cid === null) { out(`attest: '${id}' is not a material/truth id — nothing written`); return 2 }
    let st
    if (cid.startsWith('m')) {
      const f = join(m.materials, cid, 'converted.md')
      if (!isFile(f)) { out(`attest: no converted.md for '${id}' (${cid}) — nothing written`); return 2 }
      st = fm(f, 'status')
    } else {
      const tf = tfileFor(m, cid)
      if (tf === null) { out(`attest: no truth file for '${id}' (${cid}) — nothing written`); return 2 }
      st = fm(tf, 'status')
    }
    if (st === 'retracted' || st === 'discarded') {
      out(`attest: ${cid} is ${st} — a tombstone is outside the verification population; nothing written`); return 2
    }
    const dg = unitDigest(m, cid)
    if (dg === null) { out(`attest: cannot digest '${id}' (${cid}) — nothing written`); return 2 }
    rows.push(`${cid}\t${dg}\t${verdict}\t${round}\t${standard}\t${day}\n`)
    names.push(cid)
  }

  const lf = join(m.truths, m.ledgerFile())
  if (!isDir(m.truths)) { out('attest: no truths/ directory'); return 2 }
  // The existing sidecar is carried across as BYTES, never as decoded text: the `standard` column is
  // free-form and a Korean console fills it with whatever it fills it with. Re-encoding a file on
  // the way through would rewrite rows this command was only appending to.
  let prior
  try { prior = isFile(lf) ? readFileSync(lf) : Buffer.from(LEDGER_HEADER, 'utf8') } catch { prior = Buffer.from(LEDGER_HEADER, 'utf8') }
  if (!writeAtomic(lf, Buffer.concat([prior, Buffer.from(rows.join(''), 'utf8')]))) {
    out('attest: ledger write failed'); return 1
  }

  // Human mirror into `## Verified units` — the markdown stays the readable view while the sidecar
  // stays scope's source of truth, so a missing section costs readability and never coverage.
  // Failed verdicts stay sidecar-only: a markdown row ending in a verdict would be read as covering
  // the units it names, and a failed round covers nothing.
  const vmd = join(m.truths, 'verify.md')
  if (verdict === 'verified' && isFile(vmd)) {
    // Read as BYTES. The rest of this file is prose nobody asked us to touch, and some of it can be
    // CP949 — decoding it as UTF-8 to insert one line would rewrite every one of those bytes.
    const lines = splitLines(readText(vmd))
    const isHead = l => /^#+[ \t]*Verified units[ \t]*$/.test(l)
    if (lines.some(isHead)) {
      const mline = U(`- ${names.join(' · ')} — R${round} ${day} · ${standard} · verified`)
      const outl = []
      let done = false
      for (const l of lines) {
        outl.push(l)
        if (!done && isHead(l)) { outl.push(mline); done = true }
      }
      // A failure here is silent in the original and stays silent: the ledger row is already
      // committed, and the mirror is the readable copy of a fact that is now recorded either way.
      writeAtomic(vmd, textBuf(outl.map(l => `${l}\n`).join('')))
    }
  }

  out(`attest: ${verdict} — R${round} · ${standard} · ${day} — ${names.join(' ')}`)
  return 0
}
