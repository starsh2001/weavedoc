// weavedoc upgrade — the migration surface, between migrators (schema v3, slice 1).
//
// The approved plan splits this command's life in two: the v1→v2 migrator RETIRED with the v3
// flip (this runtime carries no v1 reader — the pinned bridge runtime v0.5.21, commit 0257167,
// owns that hop), and the v2→v3 migrator LANDS in slice 2 (backup → transform → verify, plan
// §2.4). Between the two, this command refuses with the exact map of what to run instead —
// refusing is the contract: a migrator that guesses is the corruption the plan exists to prevent.
//
// What slice 2 replaces this stub with, so the shape is on record where the next session looks:
//   0. preflight refuses unless the mine's git worktree is clean (that IS the backup; recovery is
//      git, and the machine never runs git itself — it prints the restore command).
//   0b. blocking scan BEFORE any write: `status: unsupported` cards and `resolution.type:
//       attribute` pairs abort with the full list (resolve in v2 form, re-run — no decision store).
//   1. high-water scan of every reference surface, THEN id-sequences.json.
//   2. discarded/retracted cards deleted (list reported), their ledger rows dropped.
//   3. status:conflict cards move to conflicts.json (ok partner = target; all-conflict = targets[]).
//   4. surviving cards lose exactly the four v2 lines (status/conflict_with/resolution/superseded).
//   5. conflicts.json written, config.yaml + project.md flip to version: 3.
//   6. index/tree regenerated, one best-effort mine-log line.
//   verify: the conservation equation (v2 cards = kept + deleted + moved), exact validate match,
//   byte-identical unrelated files.
import { fmLoad } from './read.mjs'

export function cmdUpgrade (m, out, args) {
  const known = new Set(['--check', '--dry-run', '--apply'])
  for (const a of args) {
    if (!known.has(a)) { out(`upgrade: unknown argument '${a}' — usage: weavedoc upgrade [--check|--dry-run|--apply]`); return 2 }
  }
  const pv = (fmLoad(m.project).get('version') ?? '').trim()
  const cv = (m.cfg.flat.get('version') ?? '').trim()
  if (pv === '3' && cv === '3') {
    out('upgrade: this mine is already schema v3 — nothing to migrate.')
    return 0
  }
  if (pv === '1' || cv === '1') {
    out('upgrade: this mine is schema v1, and this runtime carries no v1 reader.')
    out("  migrate with the pinned bridge runtime v0.5.21 (commit 0257167): run ITS 'weavedoc upgrade' to reach v2,")
    out("  then re-run this command to reach v3 (available from slice 2 of the v3 plan).")
    return 2
  }
  if (pv === '2' || cv === '2') {
    out('upgrade: this mine is schema v2. The v2→v3 migrator is slice 2 of the approved plan and is not in this build —')
    out('  refusing rather than guessing at a migration. Nothing was read beyond the version fields, nothing was written.')
    return 2
  }
  out(`upgrade: cannot read a supported schema version from this mine (project.md '${pv}' · config.yaml '${cv}') — run 'weavedoc validate' for the full diagnostic.`)
  return 2
}
