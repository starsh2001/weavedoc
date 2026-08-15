// WeaveDoc — the INTAKE ledger: how a material entered the mine, on the machine's own surface.
//
// THE HOLE THIS CLOSES. Nothing mechanical stood between a material and the mine. `gather` wrote
// `materials/<id>/` with an ordinary file write, the CLI had no intake command at all, and every
// `MAT-*` check asked whether the folder was the right SHAPE — never where its bytes came from.
// So a material the user handed over and a material an agent invented were, to this runtime,
// indistinguishable; and because the same agent writes the material AND the cards that cite it, an
// invented source is structurally perfect: the quotes match, coverage closes, `validate` passes.
// Every check downstream then verifies the forgery more confidently than the last. "247/247 sealed"
// means the cards agree with the materials — never that the materials agree with the world.
//
// WHAT THIS IS NOT. It does not PREVENT fabrication and is not designed to: an agent can call
// `intake` and invent a `source.md` in the same breath. What it removes is fabrication's status as
// the DEFAULT and its invisibility — a silent file write becomes an explicit command, a ledger row,
// and a digest bound to bytes that had to exist on disk. The judgment stays where WeaveDoc always
// puts it: with the human.
//
// WHY IT LOOKS LIKE THE VERIFY SIDECAR. Because it is the same device, and the verification lane
// already fought for every rule in it — append-only, LAST row per id wins, a digest that pins which
// bytes, `legacy-unbound` for records that predate the ledger, counted apart and never absorbed.
// This is not a new design; it is the design that was only ever applied to one lane, applied to the
// other. The reader below is literally the verify lane's, parameterised (verify.mjs `indexLedger`).
import { isDate, canonId } from './core.mjs'
import { join, materialIds, mdirFor } from './mine.mjs'
import { fmv } from './read.mjs'
import { indexLedger, fieldHasControlByte, matDigest } from './verify.mjs'
import { readRawSources } from './raw-source-model.mjs'
import { existsSync } from 'node:fs'

export const INTAKE_LEDGER_FILE = 'intake-ledger.tsv'
export const INTAKE_HEADER =
  '# machine-owned intake ledger — append-only; LAST row per id wins. Written by `weavedoc intake`.\n' +
  '# id\tsha256\tdeclaration\tsources\tcopy\tnote\tdate\n'

// THE COPY COLUMN SITS FOURTH, not second, and the reason is the shared reader. `indexLedger` reads
// the declaration word at `f[2]` for BOTH ledgers — that is what lets the intake lane reuse the
// verify lane's parser instead of growing a second one. Putting the copy digest at index 2 would
// have bought a tidier header at the price of an index argument on a function two review rounds
// hardened. Columns 0-2 stay aligned across both files; what each lane needs beyond that goes after.
//
// WHAT THE COPY DIGEST IS FOR — the second half of the hole. The source digest catches an ORIGINAL
// being rewritten. It says nothing about `converted.md`, and a real run found that is the half that
// gets edited: an owner said "drop this from the project", and the session deleted a column out of
// the material — the mine's own copy of what a document said — rather than retracting the truths.
// A copy edited to record a DECISION falsifies the record of what the source contained, and every
// later verify round then reads a mismatch it cannot explain, which is where the fabrication
// pressure comes from. The machine cannot judge whether an edit was a conversion fix (legitimate,
// expected) or a decision (never legitimate here). It can say the bytes moved, and it does.
export const BINDS_SOURCE = new Set(['declared', 'anchored'])
export const BINDS_COPY = new Set(['declared', 'anchored', 'no-source'])

// The four words the declaration column may hold.
//   declared       — `intake` at the moment the material arrived; provenance is in the note
//   anchored       — `intake --anchor-existing`: bytes recorded for a material that PREDATES the
//                    ledger. It binds bytes exactly as `declared` does and claims nothing else —
//                    no one handed anything over at that moment and the note cannot pretend one did
//   no-source      — the ruled exception: no original exists to bind. Still binds the copy
//   legacy-unbound — minted only by `upgrade`, exactly as the verify sidecar's own legacy rows are:
//                    preserved history that binds no bytes and never counts as a declaration
//
// `anchored` IS A SEPARATE WORD ON PURPOSE. Collapsing it into `declared` would let a mine that
// anchored its whole backlog this morning report "32 declared" — every material reading as handed
// over and recorded when 24 of them were only hashed in place. Overstating the record is the one
// failure this ledger exists to prevent, so it is not permitted to commit it about itself.
export const DECLARATIONS = ['declared', 'anchored', 'no-source', 'legacy-unbound']

// The structural row filter — the intake twin of verify.mjs `rowOk`, and deliberately its shape:
// seven columns, digests that are 64-hex or `-`, a date that is a real calendar date, no control
// byte in any field (one TAB widens the row, one newline splits it in two).
//
// TWO cross-column clauses, and they are the point of the whole file. Every word that binds bytes is
// written by a command that JUST HASHED THEM — `intake` reads the source set and the copy off disk
// and records what it read. A hand-written `declared` row carrying `-` would therefore claim a
// binding to bytes nobody hashed: the exact move this ledger exists to make visible, performed on
// the ledger itself. Such a row is not "a declaration with a missing field"; it is not a
// declaration, and it fails here so every consumer reads it as damage rather than as evidence.
//
// The two clauses are separate because the two bindings are. `no-source` binds NO source — that is
// its whole content — and still binds a copy, because a material with no original still has a
// `converted.md` that can be edited, and that material is exactly the one no cold reviewer can ever
// re-check against anything else.
export function intakeRowOk (f) {
  return f.length === 7 &&
    (f[1] === '-' || /^[0-9a-f]{64}$/.test(f[1])) &&
    (f[3] === '-' || /^[0-9]+$/.test(f[3])) &&
    (f[4] === '-' || /^[0-9a-f]{64}$/.test(f[4])) &&
    f[5] !== '' && isDate(f[6]) &&
    !f.some(fieldHasControlByte) &&
    (!BINDS_SOURCE.has(f[2]) || (/^[0-9a-f]{64}$/.test(f[1]) && /^[1-9][0-9]*$/.test(f[3]))) &&
    (!BINDS_COPY.has(f[2]) || /^[0-9a-f]{64}$/.test(f[4]))
}

export const intakeIndex = file => indexLedger(file, intakeRowOk, DECLARATIONS)
export const intakeLedgerPath = m => join(m.materials, m.intakeFile())

// A material's SOURCE BYTES, through the one model that reads them (raw-source-model.mjs) — never a
// second directory walk. That model is what makes a `source.*` a symlink, a junction, a hardlink to
// `converted.md`, or a file rewritten mid-read into a REFUSAL instead of a digest: evidence has to
// be a thing in the mine, not a second name for something outside it.
//
// -> {state, digest, count, names, why}
//    state: 'complete' — bytes read, digest covers all of them
//           'empty'    — the folder holds no source.* at all (the `--no-source` case)
//           'missing'  — no such material folder
//           anything else (invalid · unreadable · unstable) carries `why` from the model itself
export function sourceState (m, id) {
  const dir = mdirFor(m, id)
  if (dir === null) return { state: 'missing', digest: null, count: 0, names: [], why: 'no such material folder' }
  const r = readRawSources(dir, { trustedRoot: m.materials })
  if (r.state === 'complete') {
    return { state: 'complete', digest: r.treeDigest, count: r.entries.length, names: r.entries.map(e => e.name), why: '' }
  }
  if (r.state === 'empty') return { state: 'empty', digest: null, count: 0, names: [], why: 'the folder holds no source.* file' }
  return { state: r.state, digest: null, count: 0, names: [], why: r.diagnostics.map(d => d.detail).join(' · ') }
}

// A material's COPY — `converted.md` — through the digest the verify lane already uses for the same
// file (`matDigest`), NOT a second hash of the same bytes. That function excludes exactly one line,
// the frontmatter `status:`, because status is the lifecycle axis: `gather` stamps `converted`,
// cold verification stamps `verified`, `refine` stamps `used`. A copy digest that moved on a
// lifecycle stamp would cry stale on every normal day and be unread by the time a real edit landed.
// Reusing the function rather than the idea is deliberate — two spellings of "the material's bytes"
// drifting apart is how the same defect starts arriving under a new name.
// -> the digest, or null when the copy is unreadable/absent (the caller decides what that means)
export function copyDigest (m, id) {
  return matDigest(join(m.materials, id, 'converted.md'))
}

// THE POPULATION, spelled once. Exactly `scope`'s material population: a folder holding a
// converted.md, minus the retracted (a withdrawn material grounds nothing, so nothing is owed for
// it). validate, scope and census all read THIS — a population that differed between them would let
// one command warn about a material another does not count, which is the split that makes a warning
// unreadable rather than merely wrong.
export function intakePopulation (m) {
  return materialIds(m).filter(id => {
    const f = join(m.materials, id, 'converted.md')
    return existsSync(f) && fmv(f, 'status') !== 'retracted'
  })
}

// THE ONE CLASSIFICATION. Every consumer takes its buckets from here, so `validate`'s
// MAT-UNDECLARED set and `scope`'s undeclared count cannot disagree about a single material.
//
// `compareDigests` is the only axis that varies, and it is NAMED rather than defaulted: comparing
// means re-reading every source file on disk, which `scope` pays for because it is the command that
// reports what a round owes, and `validate`/`census` do not because they never claim a unit is
// bound. A consumer that does not compare reports `declared` without the bound/stale split — and
// says so in its own wording; it never prints "digest-bound" for a comparison it did not run.
//
// -> {dead, state, code, headless, malformed, unknown, ghost, population,
//     declared, anchored, noSource, legacy, stale, undeclared, unreadableSource,
//     staleSource, staleCopy}
//    The first seven buckets PARTITION the population; `staleSource`/`staleCopy` are details of
//    `stale` and overlap it (and each other) rather than adding to it.
export function classifyIntake (m, idx, { compareDigests = false } = {}) {
  // TWO STATES VOID THE WHOLE LEDGER, the verify lane's rule kept verbatim: an UNREADABLE file is
  // evidence in an unknown state (not absence), and a HEADLESS row could have been ANY material's
  // latest declaration. Under either, no row counts — every material reads as undeclared, which is
  // the conservative direction here exactly as "still owed" is there.
  const dead = idx.state === 'unreadable' || idx.headless > 0
  const win = dead ? new Map() : idx.win
  // An unknown declaration word covers nothing AND does not open a weaker reading — quarantined
  // before classification, the way scope quarantines an unknown verdict. Its id is named, never
  // absorbed.
  const unknown = []
  const BAD = new Set(idx.quarantined)
  for (const [id, f] of win) {
    if (!DECLARATIONS.includes(f[2])) { unknown.push(`${id} (${f[2]})`); BAD.add(id) }
  }

  const pop = intakePopulation(m)
  const inPop = new Set(pop)
  const declared = []; const anchored = []; const noSource = []; const legacy = []
  const stale = []; const staleSource = []; const staleCopy = []
  const undeclared = []; const unreadableSource = []
  // The three sound buckets keyed by their own word, so adding a word cannot silently route a
  // material into the wrong one — a bucket per word, chosen by the word, not by an if-chain that
  // has to be re-read every time the vocabulary grows.
  //
  // A word in DECLARATIONS with no bucket HERE would be `undefined.push(...)` — scope and validate
  // dying on a ledger that is perfectly well-formed. `put` is the guard: the vocabulary and this
  // table live in different places and the day they drift is the day someone adds the fifth word,
  // so an unhandled-but-recognised word lands in the surface that already exists for words this
  // classifier cannot place, and is NAMED rather than crashing or being absorbed.
  const sound = { declared, anchored, 'no-source': noSource }
  const put = (word, id) => {
    if (sound[word]) { sound[word].push(id); return }
    unknown.push(`${id} (${word} — recognised word, no bucket)`)
  }
  for (const id of pop) {
    const f = BAD.has(id) ? undefined : win.get(id)
    if (f === undefined) { undeclared.push(id); continue }
    if (f[2] === 'legacy-unbound') { legacy.push(id); continue }
    if (!compareDigests) { put(f[2], id); continue }

    let movedSource = false
    if (BINDS_SOURCE.has(f[2])) {
      const s = sourceState(m, id)
      // The declaration says bytes were bound and the bytes are no longer readable as a set — a
      // deleted original, a source turned symlink, a folder mid-write. That is not "declared" and
      // it is not "undeclared" either: it is a declaration whose subject cannot be re-reached, and
      // collapsing it into either bucket would describe a state the mine is not in. It ends the
      // row's classification HERE, before the copy axis: reporting "the copy moved" about a
      // material whose original has vanished files the larger fact under the smaller one.
      if (s.state !== 'complete') { unreadableSource.push(`${id} (${s.state})`); continue }
      movedSource = s.digest !== f[1]
    }
    const movedCopy = f[4] !== '-' && copyDigest(m, id) !== f[4]

    // BOTH detail lists, then ONE summary bucket. The two axes answer different questions and a
    // material can fail both, so the details overlap on purpose — but `stale` is what the count
    // line adds up, and a material counted twice there would make the buckets stop summing to the
    // population, which is the property that lets a reader trust the line at all.
    if (movedSource) staleSource.push(id)
    if (movedCopy) staleCopy.push(id)
    if (movedSource || movedCopy) stale.push(id)
    else put(f[2], id)
  }
  // Rows naming ids the mine does not hold cover nothing — shown, never absorbed, the same way
  // scope shows its ghost ledger ids.
  const ghost = [...win.keys()].filter(k => !inPop.has(k) && (canonId(k) === null || !inPop.has(canonId(k)))).sort()
  return {
    dead,
    state: idx.state,
    code: idx.code,
    // The population size, RETURNED rather than left for a caller to re-derive by summing buckets.
    // That sum is only correct while `compareDigests` is off (stale and unreadableSource are empty
    // then), so a consumer computing "of N materials" from it would silently start undercounting
    // the day it asked for the comparison — a denominator that depends on an unrelated option.
    population: pop.length,
    headless: idx.headless,
    malformed: [...idx.malformed].sort(),
    unknown,
    ghost,
    declared,
    anchored,
    stale,
    staleSource,
    staleCopy,
    noSource,
    legacy,
    undeclared,
    unreadableSource
  }
}

// The whole reading in one call, for consumers that want both halves.
export function readIntake (m, opts) {
  const file = intakeLedgerPath(m)
  const idx = intakeIndex(file)
  return { file, idx, ...classifyIntake(m, idx, opts) }
}
