---
name: weavedoc-review
description: Fidelity gate (mandatory: contradiction/unsupported/missing-required) + cold multi-persona advisory review of the draft. Use when the user says "review", "review it", "검토", "다관점 검토", or after write/refine. Produces documents/<doc-id>/review.md.
---

# weavedoc-review

The data mine's output quality gate — did the document stay faithful to the mine? Two distinct passes:

- **A. Fidelity gate (mandatory).** weavedoc's warranty — *did the draft stay faithful to the declared materials?* Always runs; cannot be skipped or edited away. Blocking.
- **B. Advisory panel (optional).** A cold multi-persona pass for quality and persuasiveness. Improves the draft; never blocks. Nice-to-have.

The gate is the product; the panel is polish. Keep them separate.

> **Language: read it first.** Read `language:` from `.weavedoc/config.yaml` and write **every** reply in that language (the cold reviewers' findings too). These skill files are English; your output is not.

> **Running weavedoc: pick the shell by platform.** Commands below are written `node .weavedoc/bin/weavedoc.mjs …` and read the same in every shell. **On Windows run them through PowerShell; everywhere else through bash** — Git Bash pays ~290ms per process to emulate Unix (measured: 373ms vs 80ms for one invocation), and a mine-wide command spends most of its time there. Never create a `.ps1` wrapper: PowerShell's execution policy applies to `.ps1` files and a downloaded one is blocked under `RemoteSigned`, while `node script.mjs` is not subject to it at all.

> **One writer per mine.** WeaveDoc is single-writer: one mutating session, and one mutating command, against a mine at a time (FORMATS.md). The CLI refuses a second mutating command; it cannot see YOU editing mine files directly, so never run this skill against a mine another session is writing to. A lost seal or verification row is evidence, not a cache — re-running the command is not the repair.

> **Thin context.** Don't read all truths for the whole document at once. For the fidelity gate, check each section against only its cited truths (grep by truth id from the draft's citations). For the advisory panel, reviewers receive only the draft + plan — not the full truth set.

> **Write-scope.** This skill writes only to `documents/<doc-id>/review.md` (except two stage stamps: `status: reviewing` on this document's `plan.md` — step 5, and leaving it there on escalation — and `status: conflict` on truths when a new conflict is discovered). It does **not** otherwise modify `draft.md`, `truths/`, or `materials/`.

> **Where it runs (the invocation contract).** Run weavedoc-review in your **main Claude Code session** — it spawns the cold reviewers as **subagents**. **Never run a weavedoc skill *as* a subagent** — then it can't spawn reviewers and silently degrades to a non-cold self-check, defeating the point.

## Shared review engine
> Spawn mechanics, the common preamble, THE BAR, SCOPE, findings format (with ✅/❌ examples), and triage all live in `references/reviewers.md` — **load it before running a round.**

## Prerequisite gate
- **Single-file:** `documents/<doc-id>/draft.md` must exist. **Multi-file:** `documents/<doc-id>/draft/` must exist with at least one page file. Check `plan.md` to determine which mode.
- `status` must be `drafting` or later. If not → `weavedoc write`.
- **Stop** if no draft exists.

## A. Fidelity gate — mandatory, not editable

Runs before anything else and is **never skipped** (even at `config.review.scale: skip`, which skips only the advisory panel). Write each violation to `review.md` under `# Fidelity violations` as `- [<kind>] <where> — <what>`. These are facts, not opinions: **never triage them down, never adjudicate them away.** Empty = the gate passes.

**A0. Conflict detection — the #1 job, most effort.** The top priority of the whole review. Do **not** merely trust existing truth statuses — **actively re-hunt**: for every load-bearing claim in the draft, grep truths by the same tags and re-check for disagreement, cross-checking every structured fact (number/date/amount/obligation) exhaustively (depth per `config.conflicts.detection`). **A0 always runs — it is part of the mandatory fidelity gate, never skipped regardless of scale.** At `standard` or `full` scale, spawn a **cold conflict-hunter** subagent (see `reviewers.md` fidelity gate lenses). At `light` scale, run A0 **inline** (self-check, not cold) — less independent but still executed. At `skip` scale, A0 still runs inline. Give this the heaviest effort — a miss is a defect, not an accepted cost. Violations (kind **contradiction**):
   - the draft cites a truth with `status: conflict` (unresolved), or
   - the draft **silently picks** one side of a conflict with no recorded `resolution`, or
   - an **unauthorized attribution** (both sides written, but no `resolution.type: attribute` on record), or
   - a truth-vs-truth contradiction the map missed → set both truths' `status: conflict` and flag it.

**A1. Grounding (kind unsupported).** A claim traces to no truth, or its citation is invalid (the write step's rule, re-verified).

**A2. Completeness (kind missing-required).** *Only if* `config.fidelity.completeness: required` — a required element/section is absent, or a `project.md` `required_tags` tag has zero truths. Drive off the plan's `required` notes and the normative materials.

**Deterministic floor.** `weavedoc validate` mechanically checks the invariants the gate rests on — every truth source resolves to a material, every truth with `status: conflict` has `conflict_with`, every `required_tags` tag has at least one truth, no `final.md` ships with open fidelity violations, attribution is authorized. Run it; a non-zero exit is a blocking violation regardless of the AI pass. (Form is the machine's job; meaning is the gate's.)

## B. Advisory panel — optional, editable

1. **Panel.** Propose review personas fit to this document/project; the user may edit or drop any (this panel is advisory, so that's safe). Default lenses: **logic** (connections hold, no leaps) · **gap-finder** (thin/weak spots that aren't outright unsupported) · **reader-proxy** (clear and persuasive to the target reader) · **editor** (wording, concision, consistency) · **breaker** (try to break the argument; name the weakest claim).
2. **Cold spawn.** Run each persona as a subagent with **empty context**, in parallel, told: *"find flaws; assume there is a problem."* Scale count/effort by `config.review.scale` (`skip|light|standard|full`). `skip` skips the advisory panel entirely — **the fidelity gate still runs.**
3. **Triage.** Run an over-strictness reviewer over the **advisory** findings only (KEEP / DOWNGRADE / DROP) to drop nitpicks. **Never touch fidelity violations.**
4. **Don't re-litigate.** Skip advisory findings already settled in `review.md` `adjudications`.
5. **Write findings** to `review.md` under `# Findings`: `- [severity] <where> — <what + why>`, severity `critical|should-fix|nice-to-have`. Set `status: reviewing`.

## Strength & convergence

Pass judgment by `config.review.strength` (default 1 for advisory):
- strength 1 = only `critical` advisory findings block
- strength 2 = + `should-fix` blocks
- strength 3 = + `nice-to-have` blocks

Fidelity violations **always block regardless of strength** — they are not advisory.

**Count the clean rounds — one is not convergence.** `config.review.repeat` (read at this run's scale) is how many clean advisory rounds **in a row** end the loop. `refine` step 7 already loops on this number, so this is where the count is produced:
- Round clean at the `strength` bar → `consecutive_passes` + 1.
- Round has a blocking advisory finding → back to **0**, never decremented.
- Record it in `review.md` next to the round number, after **every** round, so a cold session resumes the loop rather than restarting it.
- After **every** round, run `node .weavedoc/bin/weavedoc.mjs seal-review <doc-id> draft` — it pins the exact bytes and context this round reviewed (`reviewed_digest` + `review_context_digest`, computed by the tool, never by hand). Refine's edits will then show as a digest mismatch until the next round re-seals; that mismatch is precisely the staleness signal `consecrate` and `validate` obey.
- Count short of `repeat` → run another **fresh cold** panel (§2, new subagents, same adjudications) even though this round was clean. Reusing the panel measures reviewer fatigue, not the document.

This lane is advisory, so the count never blocks `final.md` — the fidelity gate does that, and it is a separate mechanism. What the count decides is when `refine` may stop looping.

**Stop safety**: if advisory rounds exceed `config.review.max_rounds` without converging, stop and take the open issues to the human. Do **not** auto-pass. Leave `plan.md` at `status: reviewing` — `plan.fm.enum.status` is the document's *stage* axis (`planned|drafting|reviewing|done|stale`), not a verdict axis, and `escalated` is not one of its values; writing it there makes `validate` fail. The escalation itself belongs in `review.md`'s `# Human queue`, which is what the user actually reads.

## Next
Still in the **document-writing phase**. **refine** is available next — resolve every fidelity violation (all of them — non-negotiable for the gate) and the advisory findings per the gate, then loop. Offer it as the path forward; the user chooses when to run it.
