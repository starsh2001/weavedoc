# READ — consuming the mine from outside the pipeline

Rules for **any** consumer — a creative session, another skill, an ad-hoc question — reading this project's data mine (`truths/`, `materials/`) without going through plan→write. The pipeline skills enforce these internally; outside the pipeline they are yours to follow.

Why this exists: the mine is safe only for readers who know how to read it. Statuses, `as_of`, provenance, and `stage` encode which values are current, when they hold, and who authored them — a raw grep hands you superseded heights and one side of unresolved conflicts. (Write-side safety is mechanical — validate, the fidelity gate — and does not depend on readers: a misread here cannot poison the mine; it only makes *your* output wrong.)

1. **Look up with `pull`, not raw reads.** `bash .weavedoc/bin/weavedoc pull <tag|keyword>` searches claims+tags (falling back to body text) and applies this protocol mechanically: discarded values point to their successor, unresolved conflicts and unsupported truths are flagged unusable, `as_of` / derived / plan-stage labels are attached. Quote pull output; don't eye-filter raw files for a lookup. The raw layer (`inbox/`, `materials/*/source.*`) is additionally **search-shielded** by the project's root `.ignore` — a ripgrep-family content search skips it, so a casual grep cannot hand you raw source text even by accident. If a tool that ignores `.ignore` surfaces one anyway, treat it as the audit layer: never quote it as current fact; open it only deliberately, by path, when auditing a conversion or retraction.

2. **Reading a truth file directly? Check `status` first.**
   - `ok` → usable. It may **carry a `resolution`** — that is history, not damage: it *won* a conflict, or (`type: attribute`) both sides were authorized to stand, in which case cite both sides attributed.
   - `discarded` → dead: it lost a conflict resolution and is no longer a truth of this mine (the file remains as audit trail). Follow `resolution.winner` to the current value; on a partial supersede, only the `scope:` fields are dead — the rest of the record still holds.
   - `conflict` → unresolved: **neither side is usable**. Resolution happens in `map`, not at the point of use.
   - `unsupported` → grounding gone (source removed/retracted): unusable.
   - `retracted` → the extraction never had standing (its quote wasn't in the named source, or a machine note was promoted): unusable, and unlike `discarded` there is **no successor to follow** — the fact simply isn't in the mine. The file exists only so the id is never reused.
   - (`resolved` is the pre-2026-07-27 legacy value — `validate` flags it; winners/attributed migrate to `ok`, losers to `discarded`.)

3. **Check the labels that change meaning.** Time-varying facts (나이·학년·소속·상태) carry `as_of` — a claim may not hold at the phase/date you're writing about. `provenance: derived` values rest on `assumptions` (read them before reuse); `adopted` = machine-proposed, user-accepted. A truth whose source material has `stage: plan` records *intent* — it is never evidence something was used or applied.

4. **Materials: converted.md is a mirror.** `> [note]` / `> [machine-note]` lines are handling guidance, not source facts. A material with `status: retracted` grounds nothing.

5. **Counts and entry points come from the CLI.** `census` for statistics; `truths/index.md` / `tree.md` (regenerated, never hand-edited) to find things by tag. Don't enumerate from memory.

6. **Exporting (a brief, guideline material, prompt context):** keep the truth id on each fact and carry its labels (`as_of`, derived) along; anything you add that is *not* from the mine must stay visibly separate from what is. A mine-based document produced outside the pipeline carries **no WeaveDoc warranty** — it becomes warranted only if it re-enters via `gather` and passes the gate. (If a misread does ride back in via gather, `map`'s conflict hunt is the net — a backstop, not a license.)
