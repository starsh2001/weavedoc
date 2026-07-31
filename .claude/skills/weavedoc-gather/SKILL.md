---
name: weavedoc-gather
description: Collect, classify, and convert materials into WeaveDoc's material model. Use when the user says "gather", "수집", "분류해", "convert materials", "process the inbox", "자료 변환", "이 대화를 자료로", "start from this conversation", or after dropping files into inbox/. Also distills a user-declared conversation into a material (origin: conversation). Produces materials/<id>/ folders and catalog.md.
---

# weavedoc-gather

The data mine's intake channel — turn whatever is in `inbox/` into clean, classified, converted materials. Called repeatedly as new materials arrive; the mine grows with each call.

> **Language: read it first.** Read `language:` from `.weavedoc/config.yaml` and write **every** reply in that language. These skill files are English; your output is not.

> **Decisions: recommend + leave a way out.** When you ask the user to decide: **mark your recommended option `(추천)`** with a one-line why, and **always allow a free-form answer.** Don't force a closed pick.

> **Thin context.** Don't read all existing materials into context. Read only `catalog.md` (the index) for duplicate checking and id assignment. The truth is on disk; re-read when you need it.

> **Write-scope.** This skill writes only to `materials/` and `catalog.md`. It does **not** touch `truths/`, `documents/`, or `project.md` (except to add a new role to `project.md.roles`).

> **Grounding discipline.** (1) When the user questions where a recorded claim came from ("어디에 있어?", "그런 게 있어?"), **re-read the file before answering** — never answer from conversation memory — and show `source`/`location` + the verbatim line; withdraw anything you can't re-find. (2) Never attach a temporal/status modifier the material doesn't support (구버전·이전·최신·실제 적용·현행): if the label itself has no verbatim basis, use neutral wording ("m001에 기록된"). (3) Match confidence to evidence — a guess with no material basis is presented as a guess, never as "가능성이 높다"/"정확히".

## Prerequisite gate
`.weavedoc/config.yaml` must exist. If not → tell the user to run `weavedoc init` first. **Stop.**

## Steps

1. **Duplicate check.** Before intake, read `catalog.md`. For each incoming item, check if a material with the same title or source_path already exists. If yes, warn the user and ask: update the existing one, or add as a new material? (Since intake **moves** inbox files out, a hit here means the same file was *dropped again later* — a deliberate re-drop, worth the question — not a leftover from the last run.)
2. **Intake.** For each item in `inbox/` (and any other sources the user points to): assign a stable id `m<NNN>` (next available), create `materials/<id>/`, and bring the original in as `source.<ext>`:
   - An **inbox item is MOVED** into the folder — not copied, not deleted. Nothing is lost (the byte-identical original now lives beside its `converted.md`, which is exactly the audit copy the retraction flow preserves), and the inbox stays a **queue**: what's in it is what's pending, an empty inbox means nothing awaits intake, and a processed file can never be re-detected as incoming. Ruled 2026-07-31 — before this, originals stayed behind and every later gather re-saw them as new arrivals.
   - A source **outside the project** (a path the user points to) is **COPIED** — never relocate files on the user's filesystem outside the mine.
   - **Ensure the search shield exists.** The moved original must land under the root `.ignore`'s shield (`inbox/` + `materials/*/source.*` — see init §3), so content searches from sessions that never invoke a skill cannot surface raw source text. If the mine predates the shield and has no `.ignore`, create it per init §3 before finishing the batch.
3. **Convert.** Produce `materials/<id>/converted.md` from `.weavedoc/templates/material.md` — the source rendered as readable markdown. Preserve structure (headings, tables, lists). Do not alter or summarize away facts. **Do not ADD — converted.md is a mirror.** Three violations that actually happened, all banned: ① re-extracting values embedded in the body into a new summary table (the BPM/Key 표 incident), ② sort-order/superlative statements the source never makes ("세하가 최장신이다"), ③ cross-material consistency commentary ("이니셜 E와 정합"). Handling guidance genuinely needed but not in the source goes in one `> [note]` line (no new facts); machine framing in conversation materials goes in `> [machine-note]` (never promoted to a truth claim). Handle each format sensibly (pdf, docx, xlsx, image → text/description, etc.).
4. **Classify (frontmatter).** Fill per `.weavedoc/FORMATS.md`: `title`, `origin` (`file` for inbox items, `conversation` for a declared session — see below; `user-answer`/`prior-doc` come from the ask and series loops; **`research` when *you* fetched it** — see below), `role` (one of `project.md` `roles`), `topics` (free tags), `format`, `source_path` (the **pre-move** path for inbox items — record it before step 2 moves the file; non-file origins take their non-path handle per FORMATS), `added`, `status: converted`, `summary` (2–3 lines), and `stage` (`plan` | `applied`) when the source is clearly a plan/proposal vs a record of what was actually applied — truths from `plan` materials carry an "실행 확인 안 됨" caveat, so this one field prevents plan content masquerading as usage history.
   - **`corrects`** — when the material's purpose is to displace part of an earlier one (a correction the user gave after seeing a truth was wrong), list what it displaces: `corrects: [m011 §4]`. `map` reads this to set the resolution `scope` instead of inferring it, and it is what tells a body-only reader that this is a correction and not a new setting.
5. **Roles — silent metadata, no interview.** Assign each material a `role` yourself (a short descriptive label in the project language, e.g. 기획/참고/기준). If the role isn't in `project.md` `roles` yet, append it there silently. **Do NOT ask the user to design or confirm a role vocabulary** — a role earns user attention only when it's consumed: `map` asks about material precedence when a conflict actually needs it (that answer becomes `project.md` `authority`). The user can edit roles in `project.md` anytime; just don't block intake on taxonomy questions.
6. **Index.** Regenerate `catalog.md` from all material frontmatter (actually regenerate — don't append rows and call it regeneration).
7. **Self-audit, then report.** Before declaring the batch done: for each converted.md, walk every heading / table / bracketed annotation and point to its source.md location. **List everything you cannot point to; the list must be empty** (delete the item or demote it to a `> [note]`) before you report. A converted.md with more sections or tables than its source is an automatic flag. In the report, name any `> [note]`/`> [machine-note]` lines you added. (The BPM-table incident was caught only because the user happened to read the completion report — this step removes the luck.) If a mirror violation is found later, it is **not a user choice**: remove it immediately, report "제거했습니다 + 이유", and re-audit the whole batch — the same slip rarely happens once (5 sibling violations survived unnoticed in a real run because the caught one was treated as isolated).

> **Asked-but-unanswered stays open.** If something was requested from the user and they didn't answer (e.g. a value requested right before "gather 하자"), a material-side "미제공" note is not enough — keep it as an `open` entry in `questions.md`. Reporting "열린 갭 0" while an asked item is unanswered is false.

## The machine fetched it — `origin: research`

When a value comes from **you** going and getting it (a web search, a fetched table, an external dataset), it is not a user answer and must not be filed as one. There is no human between the world and the record, so the material carries the whole burden of being re-checkable.

- `origin: research`, plus **`url`** and **`retrieved_at`** — `validate` blocks without them.
- **`source.md` holds the values as fetched** — raw units, raw timezone, before any conversion — with every source URL. If you converted (UT → KST, USD → KRW), *both* forms go in: the fetched one is the evidence, the converted one is your work. A reviewer who can't see the raw value can only re-search, not re-check.
- Cross-check a second source when the value is load-bearing, and record both.
- The question that prompted the search, and the user's acceptance of the result, belong in `source.md` too — the value is `adopted`, not `stated`, and that only shows if the exchange is there.

Verified at `full`, always. A real run searched solstice dates, filed them `user-answer` because nothing else fit, and the project's entire age table came to rest on figures no later reviewer could re-reach.

## Conversation as a source

When the user declares this session (or a stretch of it) as a source — "이 대화를 자료로", "start from what we discussed" — treat it as intake, not a file:

1. **Distill.** Read the declared conversation and pull the load-bearing *facts* it established, not the chatter. Set aside anything that's a **direction about the document** ("2페이지로", "리스크 앵글로") — that's not a material; pass it to `plan`, don't record it as a fact.
2. **Snapshot + convert.** Create `materials/<id>/`; write the raw relevant slice to `source.md` (copy-in, so it stays auditable) and the distilled facts to `converted.md`. Set `origin: conversation` (a gaps/ask answer batch is `user-answer` — same rules below apply). Two hard rules for the excerpt:
   - **Preserve the settling exchange.** When a fact was settled by the user confirming or choosing a machine proposal, keep the proposal AND the confirming utterance together, attributed: `제안(기계): 라온고·윤슬고·서연고 / 채택(사용자): "라온이 좋아보여"`. Stripping the machine side turns source.md into a user-monologue that can't ground what converted.md asserts — and it hides which values were machine-originated (those become `provenance: adopted` truths at map).
   - **No question→declarative promotion.** A user utterance that is question-form ("~하면 어때?") may appear as a settled declarative in converted.md **only if** the exchange that settled it is preserved in source.md. If nothing settled it, it goes to `questions.md`, not into the material as fact. (A real run hardened "현관 열면 바로 사무실…어때?" into "대표실이 따로 있는 구조가 아니다" — a machine-made negative proposition the user later corrected.)
   Machine framing that must be recorded (an anchor like 세는나이 기준, a normalization) is a `> [machine-note]` line — **never woven into the user's words** in source.md or converted.md.
3. **One glance, then commit.** Show the distilled facts once before finalizing — this checks *extraction fidelity* (did it capture what was actually said), not consent to the facts (declaring the source is the consent; don't re-litigate each claim). If the user says just take it, skip the glance.
4. Classify, roles, and index as in steps 4–7 above.

Provenance is not a trust axis — a `conversation` material is grounded and cited like any other, whoever authored the words. The one hard rule: the user must **declare** it; never silently absorb prior chat as a source.

## Retracting a material

When the user withdraws a source ("m005 빼줘", "이 자료는 잘못됐어") — first check which case it is. **Replacement is the norm; retraction is rare.** If a corrected version exists (or the user can supply one), use the replacement flow: gather the correction, let map supersede — the truth changes because its grounding changed. Retract only when the material should stop grounding anything, with nothing in its place.

1. **Show the blast radius first.** Run `bash .weavedoc/bin/weavedoc impact <id>` and show what falls: which truths were extracted from it, which documents cite them. Confirm with the user before touching anything.
2. **Mark, never delete.** Set the material's frontmatter `status: retracted`. The folder, `source.*`, and `converted.md` all stay — the mine keeps its audit trail; a retracted material grounds nothing but still shows what was once declared.
3. **Regenerate `catalog.md`** (the status column shows it).
4. **Route to map for propagation** — truths are map's write-scope, not gather's: its live truths → `unsupported`, resolutions it won re-open, citing documents → `stale` (see map's correction table). `weavedoc validate` enforces the truth-side invariants mechanically — a retracted source with a live `ok` truth fails validate, so nothing rides on memory.

## Next
Still in the **mine-building phase**. Present these as available, not required:
- **verify** (material mode) — cold-check conversion fidelity.
- **map** — extract truths from the materials.

**Never recommend skipping verify with "사용자 직접 제공이라 리스크가 낮다" — that heuristic is backwards.** Risk scales with *how much you rewrote*, not with who supplied the source: a verbatim paste (prompt dumps, file copies) is low-risk, but a **conversation restatement** (distilled answers, corrections) is the highest-risk class — that's where invented rules and promoted questions actually happen. For restatement materials, recommend verify; for verbatim pastes, saying it's skippable is fine.

Offer, don't direct: say what the user *can* do now ("이제 verify / map을 할 수 있습니다"), not what they must.

> **This skill must not be run as a subagent** — it may need user interaction for duplicate resolution and role classification.
