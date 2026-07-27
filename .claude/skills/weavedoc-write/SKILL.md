---
name: weavedoc-write
description: Write the document draft from the plan, grounded in materials and cited. Use when the user says "write", "write it", "draft", "작성", "초안 써", or after plan. Produces documents/<doc-id>/draft.md.
---

# weavedoc-write

Draw a document from the data mine — write the draft from the plan, grounded strictly in the mine's truths and cited. Ask only for necessary missing facts.

> **Language: read it first.** Read `language:` from `.weavedoc/config.yaml` and write **every** reply in that language. These skill files are English; your output is not.

> **Thin context.** Don't read all truths upfront. For each section, grep the relevant tags from `truths/index.md`, then read only those truth files. The truth is on disk; re-read when you need it.

> **Write-scope.** This skill writes only to `documents/<doc-id>/` and `questions.md`. It does **not** touch `materials/` or `truths/` (except to set conflict status when a conflict is discovered during writing).

## Prerequisite gate
- `documents/<doc-id>/plan.md` must exist with `status: planned`. If not → `weavedoc plan`.
- If `plan.md` `status` is `stale` → **warn** the user that the underlying truths have changed since the plan was made. Recommend re-running `weavedoc plan` or at least `weavedoc review` after writing. Don't stop, but make the risk visible.
- **Stop** if no plan exists.

## Steps

1. Set `status: drafting`. **Single-file plan** → create `draft.md`. **Multi-file plan** (wiki, spec set) → create `draft/` directory and one file per page listed in the plan (e.g. `draft/index.md`, `draft/yuna.md`). Write each page in the order the plan specifies, inserting cross-page links per the plan's link convention.
2. **Write section by section (or page by page)** per the plan, in the project tone. For each section/page, find relevant truths by grepping tags in `truths/*.md` frontmatter, then read those truth files for the grounded claims. **Every claim must trace to a truth → material chain.** Use **inline truth citation markers**: `<!-- t:<id> -->` immediately after each grounded sentence (e.g. `세하는 17세이다.<!-- t:t006 -->`). Also show a human-readable citation — either inline `(출처: <material title>)` or as a footnote reference `[^m001]` with matching definitions at the bottom of the section/file (e.g. `[^m001]: EClYpSE 프로젝트 인계 문서`). Whichever style, **write both the machine marker AND the human citation.** No invented facts.
3. **Check before you cite (conflict guard).** Before grounding a claim in a truth, check the truth's `status`:
   - **`ok`** → safe to cite. If it carries a `resolution` with `type: attribute`, write **both** sides attributed ("per A… / per B…").
   - **`discarded`** → do not cite — it lost its conflict and is no longer a truth of the mine; follow `resolution.winner` to the current value.
   - **`conflict`** → do **not** pick a side. Leave a flagged placeholder and send it back to map's resolve step (it should have been resolved there).
   - **`unsupported`** → do not cite. Flag it.
   - **no truth on record but the fact is contestable** (a number/date/amount from a single material while other same-tag truths exist) → actively verify the siblings agree before committing. If they disagree, set both truths' `status: conflict` and `conflict_with` — never silently pick.
4. **Gap → placeholder + question.** When a section needs a necessary fact the truths don't contain and you cannot responsibly infer, mark an inline placeholder and queue the question in `questions.md` (what · where · why necessary). Keep drafting everything else.
5. **Detail-gap ask (checkpoint 2).** After a full draft pass, ask the queued items (missing facts + open conflicts) in one batch. Each answer → save as a `user-answer` material (run gather on it: `materials/<id>/`, `origin: user-answer`), extract its truths (run map), cite the new truth, fill the placeholder; a conflict answer updates the truth files' `status` and `resolution`.
6. Repeat step 5 until no necessary placeholders or open conflicts remain. If a fact is genuinely unobtainable even by asking, leave a clearly flagged blank (last resort) — never invent.
7. **Update `cited_truths`.** Scan all draft files (`draft.md` or `draft/*.md`) for `<!-- t:<id> -->` markers and write the collected truth ids to `plan.md` frontmatter `cited_truths`. This enables change propagation — when a cited truth changes, this document gets marked `stale`.

## Next
Still in the **document-writing phase**. **review** is available next — the fidelity gate (mandatory for consecration) + the cold advisory pass. Offer it as the path forward; note only that final output requires a clean gate.

> **Recommend a new session for review.** The agent that wrote the draft shouldn't orchestrate its cold review — start fresh for clean bounded context.
