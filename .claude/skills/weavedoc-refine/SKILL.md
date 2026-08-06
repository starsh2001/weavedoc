---
name: weavedoc-refine
description: Apply review findings and loop to convergence. Use when the user says "refine", "보강", "apply the findings", "고쳐줘", or after review. Improves draft.md and produces final.md.
---

# weavedoc-refine

Apply review findings and re-review until the document converges. The review ⇄ refine loop.

> **Language: read it first.** Read `language:` from `.weavedoc/config.yaml` and write **every** reply in that language. These skill files are English; your output is not.

> **Running weavedoc: pick the shell by platform.** Commands below are written `node .weavedoc/bin/weavedoc.mjs …` and read the same in every shell. **On Windows run them through PowerShell; everywhere else through bash** — Git Bash pays ~290ms per process to emulate Unix (measured: 373ms vs 80ms for one invocation), and a mine-wide command spends most of its time there. Never create a `.ps1` wrapper: PowerShell's execution policy applies to `.ps1` files and a downloaded one is blocked under `RemoteSigned`, while `node script.mjs` is not subject to it at all.

> **One writer per mine.** WeaveDoc is single-writer: one mutating session, and one mutating command, against a mine at a time (FORMATS.md). The CLI refuses a second mutating command; it cannot see YOU editing mine files directly, so never run this skill against a mine another session is writing to. A lost seal or verification row is evidence, not a cache — re-running the command is not the repair.

> **Surface, don't point.** A run that ends with anything waiting on the user — an unresolved conflict, an open question, a Human-queue entry, a fidelity violation, an open gap — must state each item **in the closing message itself**: what it is (id where one exists) · the issue in one line (a conflict names both sides and their sources; a Human-queue entry keeps its ownership tag) · what the user must decide or supply. Every item gets its line — with many items, compress the detail, never the list. The file path comes *after* the substance, as the reference — never instead of it. "questions.md를 확인하세요" with the content only on disk is the handoff twin of the banned blanket "정확합니까?" (verify): no reviewable surface in the message, so the user must open files just to learn what is wrong. Ruled 2026-08-06 — real runs ended exactly that way ("파일을 안 열어봐도 어떤 부분이 문제인지 메시지로 명시"). Its mechanical source: `node .weavedoc/bin/weavedoc.mjs status --open` prints every open item across all five categories, one line each — take the list from that output and render it in the reply language, never re-compose it from memory (the census discipline, applied to the handoff).

> **Thin context.** Read only the review findings + the draft sections they point to + the cited truths. Don't reload the full truth set.

> **Write-scope.** This skill writes only to `documents/<doc-id>/draft.md`, `review.md` (adjudications), and `final.md` (except two consecration stamps, both in step 9 and both only at that moment: `status: done` on this document's `plan.md`, and `status: used` on the materials that contributed). It does **not** otherwise modify `truths/` or `materials/` — if a fidelity violation reveals a **truth extraction error** (the truth itself is wrong, not just the draft's use of it), **stop and route to `weavedoc map`** to fix the truth. Don't patch the draft to work around a bad truth.

## Prerequisite gate
- `documents/<doc-id>/review.md` must exist. If not → `weavedoc review`.
- **Stop** if no review exists.

## Steps

1. **Fidelity first — all of them.** Every entry in `review.md` `# Fidelity violations` MUST be resolved (fix the draft, or add/cite a material that grounds the claim; a **conflict** violation resolves only through the truth file's `resolution` field — user picks A|B / supplies the real value / authorizes attribution — the writer never just picks a side). This is not subject to `strength` — a fidelity violation always blocks. Then fix advisory `# Findings` at or above the `config.review.strength` gate (1 = critical, 2 = + should-fix, 3 = + nice-to-have); lower-severity advisory fixes are applied but non-blocking.

2. **Fix only what the review found.** Don't refactor beyond the findings; that enlarges the next diff to re-review. If a finding reveals a deeper structural problem in the plan, stop and discuss with the user — don't silently restructure.

3. **If the truth is wrong, stop.** If a fidelity violation is caused by **an incorrect truth** (the extraction was wrong, not the draft's citation of it), this skill cannot fix it. Route to `weavedoc map` to correct the truth, then re-write and re-review the affected section. Don't patch the draft to say something different from the truth — that breaks the citation chain.

4. **Gaps still ask.** If a fix needs a fact the materials don't have, ask (same ask loop; the answer becomes a `user-answer` material and is cited). Never invent.

5. **Record decisions.** Write what was fixed / dropped / accepted into `review.md` `adjudications`, so the next round doesn't re-raise them.

6. **Update `cited_truths`.** After applying fixes, re-scan the draft for `<!-- t:<id> -->` markers and update `plan.md` frontmatter `cited_truths` (citations may have changed during fixes).

7. **Loop.** Re-run "review", then refine again. Continue review ⇄ refine until the fidelity gate is clean AND no advisory findings at/above the `strength` gate remain for `config.review.repeat` clean rounds in a row → ready to finish (step 9).

8. **Escalate, don't fake convergence.** If `config.review.max_rounds` is exceeded with findings still open, stop and escalate the remaining issues to the user — never auto-pass.

9. **Finish — only through a clean gate, and never over an unread queue.** "Done" requires `# Fidelity violations` to be **empty** (and advisory findings converged per the gate). **Open `# Human queue` entries do not block** — the fidelity gate is the only blocking membrane — **but you must list them to the user here and get an explicit go-ahead before writing the final output.** Those entries are exactly the judgements the machine was not allowed to make; consecrating over them unread makes that judgement anyway, one level up. Show each entry with its ownership tag, say plainly that they do not block, and ask whether to proceed or rule on them first. **Record the go-ahead** as an HTML comment under the `# Human queue` section (date + the entries covered + the user's words) — without an artifact, a compliant consecration is indistinguishable on disk from a silent one. Only then run `node .weavedoc/bin/weavedoc.mjs consecrate <doc-id>` — it verifies the seal (the clean round must have ended with `seal-review <doc-id> draft`), confirms the draft and the review context are still the reviewed bytes, stages the candidate on the same filesystem, runs the **one** full validation with the candidate in place, and atomically promotes it (single-file → `final.md`; multi-file → `final/`); on a validation failure or an interrupt the original final is restored, and a hard kill leaves a durable in-flight marker that `validate` and `consecrate` both refuse until resolved — the original is never silently replaced by an unvalidated candidate. Do **not** copy draft to final by hand, and do **not** run a separate pre-write `weavedoc validate` — the validation inside consecrate is the one run this step gets (a second one is the 2× bridge the plan forbids). Mark contributing materials `status: used`, and **set `plan.md` `status: done`**, and refresh `catalog.md`’s status column to match the materials (it is generated, and nothing else regenerates it at this step) — this step is the only writer of that value (`planned`→`drafting`→`reviewing` are set by plan/write/review; without this line `done` was an enum value nothing ever reached, and `status` showed a consecrated document as still in flight until map marked it `stale`). This gate is the membrane: a document with any open fidelity violation can never become final or a material — that would poison the materials every later document is checked against. If a fidelity violation can't be resolved (e.g. an unobtainable fact), escalate to the user — never consecrate around it.

## Next
With a clean gate and final written, the **document-writing phase closes**, moving to the **mine-update phase**. The final output *re-enters as an `origin: prior-doc` material* — but **not here and not by this skill**: registration is owned by the **next document that needs it** — its `plan` (the `continues` step) checks the prior-doc material exists and routes to `gather` if not. Refine only leaves final consecrated; consecration is what makes it *eligible* to re-enter (the gate is the membrane), and a final nobody continues from is never registered at all. From here the user can, when they want: **plan** another document (e.g. continuing the series), **gather / map** new materials, or stop. Nothing is required.

> **Recommend a new session for re-review.** The agent that applied fixes shouldn't also orchestrate the cold re-review — start fresh for bounded context.
