---
name: weavedoc-plan
description: Propose a document's structure, tone, and section→material map, and ask about structural gaps. Use when the user says "plan", "plan the report", "작성 준비", "구조 잡아", "개요", "outline it", or after map. Produces documents/<doc-id>/plan.md.
---

# weavedoc-plan

Pull a document from the data mine — decide its structure, tone, and which truths feed each section. The mine already exists; this is a query against it. AI proposes; the user edits (passive surface).

> **Language: read it first.** Read `language:` from `.weavedoc/config.yaml` and write **every** reply in that language. These skill files are English; your output is not.

> **Decisions: recommend + leave a way out.** When you ask the user to decide: **mark your recommended option `(추천)`** with a one-line why, and **always allow a free-form answer.** Don't force a closed pick.

> **Thin context.** Read `truths/index.md` for the tag list and truth overview. Do NOT load all truth files — grep by tag when you need specific truths. The truth is on disk; re-read when you need it.

> **Write-scope.** This skill writes only to `documents/<doc-id>/` and `questions.md`. It does **not** touch `materials/`, `truths/`, or `project.md`.

## Prerequisite gate
- `truths/` must have truth files. If not → `weavedoc map`.
- If `truths/verify.md` exists and `status` = `stale` or `failed`, warn the user that the truth set hasn't been verified and recommend running `weavedoc verify` first.
- **Stop** if no truths exist.

## Steps

1. **Identify the document.** Determine `doc_type` and intent from the user's request + `project.md`.

2. **Elicitation loop — keep asking until the plan is fully concrete.** After the user picks `doc_type`, the structural decisions that follow depend on *which* type was chosen. Ask follow-up questions in rounds; do NOT propose the plan until every decision below is resolved. Keep going until you would be confident writing the plan with no guesswork.

   **What to resolve (ask until all answered):**

   | Decision | Why it matters |
   |----------|---------------|
   | **Output shape** — single file / multi-file set (wiki, spec) / series of docs | Determines the plan format itself. |
   | **Scope** — which truths/tags belong in this document, which don't | Truths often span creative content + production tools + meta. The document rarely needs all of them. Show the tag list, propose in/out, confirm. |
   | **Format convention** — is there an existing format to follow? (e.g. namuwiki style, RFC, legal template) | If yes, research it (web search) before proposing structure. If the user names a reference, learn it first. |
   | **Root unit** — what is the top-level organizing entity? | A wiki about a project ≠ a wiki about a single character. |
   | **Audience** — who reads this? Internal or external? | Tone, depth, jargon level all depend on this. **If external**, also settle the citation labels: material `title`s are internal names ("Support Runbook (excerpt)", literally "user answer"), and the visible half of a citation would otherwise ship them. Record it in `plan.md` frontmatter: `audience: external` plus `publication_labels: {m001: "…"}` so `write`/`refine` use it — see FORMATS, citation markers. The `<!-- t:<id> -->` marker never changes; only what the reader sees does. |

   **Multi-file specific (when output shape = multi-file):**

   | Decision | Example |
   |----------|---------|
   | Page granularity | One page per character? Per topic? Per phase? |
   | Navigation | Index page? Category grouping? |
   | Link convention | `[유나](yuna.md)` relative links? |
   | Naming | kebab-case? topic-based? |

   **How to ask:**
   - **Design the question before you ask it.** One beat every time: is this multi-select ("which apply") or single-select ("which ONE is most important")? Are the options genuinely divergent (not bland coverage)? Is the escape real (free-form always open)? Getting this wrong silently corrupts everything downstream.
   - **Multi by default for wants.** "What should the document cover" / "who reads this" / "what format" are usually *several at once* — default to multi-select + free-form. Use single-select only for "which ONE matters most." Forcing single on a want quietly drops real requirements.
   - Batch related questions (2–4 per round). Don't dump everything at once; don't trickle one at a time.
   - After each answer, check: "do I still have ambiguity that would make me guess when writing the plan?" If yes, ask the next round.
   - When proposing scope (tag in/out), show a concrete tag list from `truths/index.md` so the user can confirm visually.
   - If the user's doc_type is domain-specific (wiki, legal doc, API spec…), proactively research format conventions *before* proposing — don't wait for the user to tell you to search.

   **When the user is stuck** (doesn't know what they want): don't just wait — draw it out:
   - **Extremes** — strip or stretch to provoke: "단일 페이지에 다 넣는다면?" / "100페이지 분량이라면?" — then let them react.
   - **Analogy** — "나무위키 PLAVE 문서 같은 형식?" / "RFC처럼 정형화된 형식?" — give one, ask for the next.
   - **Walk the product** — "이 문서를 받은 사람이 첫 번째로 찾아볼 정보가 뭔가요?" — walk the reader's journey.
   - **Provoke and offer, but don't assert.** Generating options for them to react to is the job; inventing the answer and calling it theirs is not.

3. **Propose structure.** Now that all decisions are resolved: create `documents/<doc-id>/` and `plan.md` (from `.weavedoc/templates/plan.md`). Offer a section skeleton fit to `doc_type` + project + available materials + all elicitation answers. For multi-file plans, the skeleton is a page list with per-page structure rules and link conventions.

4. **Section notes.** For each section (or page, if multi-file), set the note: `<!-- purpose: … | tags: … | required|optional -->`. The `tags` field carries **truth tags** (the vocabulary of `truths/*.md` `tags:`, not material role·topics) — step 9 harvests `scope_tags` from exactly these fields, and map's staleness trigger compares that against new truths' tags, so any other vocabulary here silently disables staleness. Map sections to truths by grepping tags in `truths/index.md` or `truths/*.md` frontmatter.

5. **Semantic check.** Before presenting to the user, self-review the proposed structure: does every item sit in the right category? (e.g. a CEO doesn't go in "members"; a production tool reference doesn't go in a creative wiki.) Fix before showing.

6. **Tone.** Inherit the project tone unless the user wants a per-document override — and **write the resolved value into `plan.md`, never leave the field blank to mean "inherited".** `tone` is a required plan field (`plan.fm.required`): an empty one fails `validate`, and a cold reader of the plan cannot resolve an inheritance that was never written down. If the project has no standing tone, the tone elicited for this document goes here.

7. **Series.** If this continues prior documents, set `continues` and make sure those prior-doc materials exist (register them via gather if needed).

8. **Structural-gap ask (checkpoint).** Any *required* section with no supporting truths for its tags → queue it in `questions.md` and ask the user, batched (if the user answers on the spot, the answer still routes through the pipeline — `gather` makes the `user-answer` material, `map` extracts the truth; plan itself never creates either). Cross-check against `project.md` `required_tags` — a required tag with zero truths is a structural gap. See the ask policy — ask only for necessary, missing facts.

9. **Set `scope_tags`.** Collect all tags that appear in the section notes (step 4) into `plan.md` frontmatter `scope_tags`. This is the tag set this document covers — used by `weavedoc-map` to detect when new truths fall within this document's scope and mark it `stale`.

10. Set `status: planned`.

## Next
Now inside the **document-writing phase**. **write** is available to draft the document from this plan — offer it when the user is ready, don't command it.

> **This skill must not be run as a subagent** — it requires user interaction for the elicitation loop.
