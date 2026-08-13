// weavedoc conflict / alloc — the two write surfaces of the machine-owned state files (slice 1, B2).
//
// The division of labour, enforced by what these commands CAN say: detection is the AI's judgment
// and arrives here already made; the ruling is the human's and never happens here (there is no
// resolve-with-a-winner surface at all — `remove` records that a ruling was applied elsewhere, by
// deleting the entry). The machine's whole share is ledger hygiene: ids come from the allocator
// (never from a skill counting files — that is how a deleted number gets granted twice), entries
// are validated by the same parser validate trusts, and both files are written in their one
// canonical byte spelling.
//
// `conflict add` takes the candidate payload as a JSON FILE, not as flags: claims and quotes are
// project-language prose, and prose-through-argv is a per-shell quoting lottery this repo already
// refuses to play (the .ps1 rule). The file holds ONE entry object minus `id` — the id is granted
// here, from the conflict namespace, so a skill cannot pick (or reuse) a number.
//
// TWO FILES, ONE ORDER. `add` bumps the allocator FIRST, then writes the store: a crash between
// the two burns one number (harmless — monotonicity is the contract, density never was) while the
// reverse order could seat an entry whose id the allocator would grant again. Said here because
// the next editor will be tempted to "fix" the gap.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from './mine.mjs'
import {
  CONFLICTS_FILE, addConflict, parseConflicts, removeConflict, serializeConflicts
} from './conflict-store.mjs'
import {
  ID_SEQUENCES_FILE, NAMESPACES, allocate, parseIdSequences, serializeIdSequences
} from './id-sequences.mjs'

const readState = (m, rel, parse, out, what) => {
  let text = null
  try { text = readFileSync(join(m.root, rel), 'utf8') } catch { text = null }
  if (text === null) { out(`${what}: ${rel} is missing or unreadable — a v3 mine carries it from init/upgrade; run 'weavedoc validate'`); return null }
  const r = parse(text)
  if (!r.ok) { out(`${what}: ${rel} does not parse as its contract — run 'weavedoc validate' for the diagnostics; nothing written`); return null }
  return r
}

export function cmdAlloc (m, out, args) {
  if (args.length !== 1 || !NAMESPACES.includes(args[0])) {
    out(`usage: weavedoc alloc <${NAMESPACES.join('|')}>`)
    return 2
  }
  const seq = readState(m, ID_SEQUENCES_FILE, parseIdSequences, out, 'alloc')
  if (seq === null) return 2
  const a = allocate(seq.next, args[0])
  if (!a.ok) { out(`alloc: ${a.diagnostics.map(d => d.detail).join(' · ')}`); return 2 }
  writeFileSync(join(m.root, ID_SEQUENCES_FILE), serializeIdSequences(a.next), 'utf8')
  out(a.id)
  return 0
}

export function cmdConflict (m, out, args) {
  const usage = () => { out('usage: weavedoc conflict list | add <entry.json> | remove <cNNN>'); return 2 }
  const mode = args[0] ?? ''

  if (mode === 'list') {
    if (args.length !== 1) return usage()
    const conf = readState(m, CONFLICTS_FILE, parseConflicts, out, 'conflict list')
    if (conf === null) return 2
    if (conf.open.length === 0) { out('conflict list: no open conflicts'); return 0 }
    for (const e of conf.open) {
      const tgt = e.targets.length > 0 ? e.targets.join(' ') : '(no current card — undecided)'
      const cands = e.candidates.map(cd => `"${cd.claim}" [${cd.source}]`).join(' · ')
      out(`${e.id} targets ${tgt} ⇄ ${cands}${e.note !== undefined ? ` — ${e.note}` : ''}`)
    }
    out(`— ${conf.open.length} open (each blocks shipping until the human rules and the entry is removed)`)
    return 0
  }

  if (mode === 'add') {
    if (args.length !== 2) return usage()
    let payload
    try { payload = JSON.parse(readFileSync(args[1], 'utf8')) } catch (e) {
      out(`conflict add: cannot read '${args[1]}' as JSON (${e.message}) — nothing written`)
      return 2
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      out('conflict add: the payload is one entry OBJECT (targets/candidates/created/note) — nothing written')
      return 2
    }
    if (payload.id !== undefined) {
      out("conflict add: the payload must not carry 'id' — the id is granted here, from the allocator, so a caller can neither pick nor reuse a number; nothing written")
      return 2
    }
    const conf = readState(m, CONFLICTS_FILE, parseConflicts, out, 'conflict add')
    if (conf === null) return 2
    const seq = readState(m, ID_SEQUENCES_FILE, parseIdSequences, out, 'conflict add')
    if (seq === null) return 2
    const granted = allocate(seq.next, 'conflict')
    if (!granted.ok) { out(`conflict add: ${granted.diagnostics.map(d => d.detail).join(' · ')}`); return 2 }
    const added = addConflict({ version: 1, open: conf.open }, { ...payload, id: granted.id })
    if (!added.ok) {
      out('conflict add: the entry does not satisfy the store contract — nothing written:')
      for (const d of added.diagnostics) out(`  ${d.code} — ${d.detail}`)
      return 2
    }
    // Allocator first (see the header): a burned number is harmless, a reusable one is not.
    mkdirSync(join(m.root, '.weavedoc-state'), { recursive: true })
    writeFileSync(join(m.root, ID_SEQUENCES_FILE), serializeIdSequences(granted.next), 'utf8')
    writeFileSync(join(m.root, CONFLICTS_FILE), serializeConflicts(added.store), 'utf8')
    out(`conflict add: ${granted.id} recorded (${added.store.open.length} open) — shipping is blocked until the human rules; resolution is removal`)
    return 0
  }

  if (mode === 'remove') {
    if (args.length !== 2) return usage()
    const conf = readState(m, CONFLICTS_FILE, parseConflicts, out, 'conflict remove')
    if (conf === null) return 2
    const removed = removeConflict({ version: 1, open: conf.open }, args[1])
    if (!removed.ok) {
      out(`conflict remove: ${removed.diagnostics.map(d => d.detail).join(' · ')}`)
      return 2
    }
    writeFileSync(join(m.root, CONFLICTS_FILE), serializeConflicts(removed.store), 'utf8')
    out(`conflict remove: ${args[1]} deleted (${removed.store.open.length} open) — the ruling lives in the cards it produced and in Git, never in an archive here`)
    return 0
  }

  return usage()
}
