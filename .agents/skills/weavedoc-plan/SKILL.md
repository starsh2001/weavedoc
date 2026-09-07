---
name: weavedoc-plan
description: Propose a document's structure, tone, and section→material map, and ask about structural gaps. Use when the user says "plan", "plan the report", "작성 준비", "구조 잡아", "개요", "outline it", or after map. Produces documents/<doc-id>/plan.md.
---

# weavedoc-plan

Pull a document from the data mine — decide its structure, tone, and which truths feed each section. The mine already exists; this is a query against it. AI proposes; the user edits (passive surface).

> **Language: read it first.** Read `language:` from `.weavedoc/config.yaml` and write **every** reply in that language. These skill files are English; your output is not.

> **Codex activation handshake.** In Codex, before this skill's first file write, run `node .weavedoc/bin/weavedoc.mjs activate weavedoc-plan`. The command itself writes nothing; the project `.codex/hooks.json` PostToolUse hook binds the current session to this skill. If Codex reports the hook as untrusted, stop and ask the user to review it with `/hooks`; never route the write through a shell to evade the gate. Claude Code needs no handshake because its `Skill` event carries the skill name directly.

> **One writer per mine.** WeaveDoc is single-writer: one mutating session, and one mutating command, against a mine at a time (FORMATS.md). The CLI refuses a second mutating command; it cannot see YOU editing mine files directly, so never run this skill against a mine another session is writing to. A lost seal or verification row is evidence, not a cache — re-running the command is not the repair.

> **Surface, don't point.** A run that ends with anything waiting on the user — an unresolved conflict, an open question, a Human-queue entry, a fidelity violation, an open gap — must state each item **in the closing message itself**: what it is **in words** (the material's subject, the claim's content — an id is a machine handle and names nothing to a reader, who would have to open the file to learn what you meant; number the items in your message if the user will need to point at one) · the issue in one line (a conflict names both sides and their sources; a Human-queue entry keeps its ownership tag) · what the user must decide or supply. Every item gets its line — with many items, compress the detail, never the list. The file path comes *after* the substance, as the reference — never instead of it. "questions.md를 확인하세요" with the content only on disk is the handoff twin of the banned blanket "정확합니까?" (verify): no reviewable surface in the message, so the user must open files just to learn what is wrong. Ruled 2026-08-06 — real runs ended exactly that way ("파일을 안 열어봐도 어떤 부분이 문제인지 메시지로 명시"). Its mechanical source: `node .weavedoc/bin/weavedoc.mjs status --open` prints every open item across all five categories, one line each — take the list from that output and render it in the reply language, never re-compose it from memory (the census discipline, applied to the handoff).

> **Decisions: recommend + leave a way out.** When you ask the user to decide: **mark your recommended option `(추천)`** with a one-line why, and **always allow a free-form answer.** Don't force a closed pick.

> **Thin context.** Read `truths/index.md` for the tag list and truth overview. Do NOT load all truth files — grep by tag when you need specific truths. The truth is on disk; re-read when you need it.

> **Write-scope.** This skill writes only to `documents/<doc-id>/` and `questions.md`. It does **not** touch `materials/`, `truths/`, or `project.md`.

> **The work's owner is the skill, not the session.** When a run spawns work another skill owns — a ruling mid-verify that needs a material (gather), a card correction (map), a document edit (write) — invoke that skill before doing the work; never imitate its output shape from memory. Imitation carries the visible conventions and drops the invisible duties. Measured (a real run): a verify walkthrough produced 8 materials and 23 cards inline with gather/map never loaded — all seven of the round's blocking findings clustered in that unloaded work, while the loaded skill's own procedure ran clean. Rule distance, not context volume, corrodes.

## Authority — who decides, at this mine's level

Read `authority` from `.weavedoc/config.yaml`: `strict` | `standard` | `delegated`, and **absent means `standard`** (this axis is younger than every mine that exists, so absence is the normal state, not a gap). For work that belongs to a document, that document's `plan.md` frontmatter may override the mine's level; the override governs the document's own steps and leaves mine-side work at the mine's level, because nothing has ruled yet whether a strict document reaches back over the materials it draws on. **A decision the level's text does not name goes to the user.** Same fail-safe direction the Human queue's ownership tag takes, for the same reason: a decision the machine takes unasked is invisible, while one it surfaces costs a question. And the level says who decides, never what is true — the mirror rule, the quote seal, the intake declaration, conflict blocking and the fidelity gate hold identically at all three.

**This skill's row — plan is where a document's own level is set, so setting it IS the row.** Ask it in the plan interview, in the project language: **"이 문서는 토씨 하나가 얼마나 무겁습니까?"** — three levels, one line each (`strict` 계약·규격처럼 문면 자체가 값인 문서 · `standard` 값은 사용자, 표현은 기계 · `delegated` 흐름이 값인 문서), with the **mine's own level marked as the recommendation**, because inheriting is the ordinary answer and the question exists for the document that differs. Record the answer in `plan.md` frontmatter as `authority`; **omit the field when the answer is "same as the mine"** — an omitted field inherits, and writing the inherited value would make a later change to the mine's level silently skip this document. Everything else plan decides falls under the rule above: a structure or tone choice no level's text names is the user's, which is what plan's structure-approval gate already does at every level.

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
   | **Authority** — this document's own level: "이 문서는 토씨 하나가 얼마나 무겁습니까?" | Who signs what, for this document (§Authority above has the question's three options and the recording rule). The mine's level is the recommendation; **omit the frontmatter field when the answer is "same as the mine"** — a written value stops following a later change to the mine's level. Without this row the field exists only for a user who already knows it does — the ask was promised in three places and asked in none (cold review, 0.6.16). |

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

## Report
Open and close this run with the **step report** — the fixed shape in `.weavedoc/FORMATS.md` ("The step report"): the `[weavedoc-plan <doc-id>] starting` anchor and 2–4 sentences, then `done — …` carrying `Result` · `Open` · `Your turn` · `Next`, in that order, none omitted. `Next` is the section below. What this skill puts in the two middle slots:
- **Open** — structural gaps the section→material map exposed (a section with no material behind it), and required tags with no truth to carry them.
- **Your turn** — approving the structure and tone, and deciding what to do about each gap: gather more, or write the document without that section.

## Next
Now inside the **document-writing phase**. **write** is available to draft the document from this plan — offer it when the user is ready, don't command it.

> **This skill must not be run as a subagent** — it requires user interaction for the elicitation loop.
