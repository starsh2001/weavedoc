---
name: weavedoc-map
description: Extract truths from materials, tag and classify them, hunt contradictions, and correct existing truths on demand. Use when the user says "map", "build the graph", "그래프", "관계 정리", "진실 추출", "truths", or after gather — also when the user says a stored fact/truth is wrong and wants it fixed ("정정", "틀렸어", "고쳐줘", "이 truth 수정", "correct a truth", "fix a truth"). Creates or updates truths/.
---

# weavedoc-map

The data mine's core engine — extract atomic truths from materials, tag them for AI searchability, and catch contradictions. Called repeatedly as new materials enter the mine; the truth set grows with each call. It is **also where existing truths are corrected** on demand — when a stored fact turns out wrong (see **On-demand correction** below). That path works from a fresh session too: the whole mine is on disk, so read it and act — no prior conversation needed.

> **Language: read it first.** Read `language:` from `.weavedoc/config.yaml` and write **every** reply in that language. These skill files are English; your output is not.

> **Running weavedoc: pick the shell by platform.** Commands below are written `node .weavedoc/bin/weavedoc.mjs …` and read the same in every shell. **On Windows run them through PowerShell; everywhere else through bash** — Git Bash pays ~290ms per process to emulate Unix (measured: 373ms vs 80ms for one invocation), and a mine-wide command spends most of its time there. Never create a `.ps1` wrapper: PowerShell's execution policy applies to `.ps1` files and a downloaded one is blocked under `RemoteSigned`, while `node script.mjs` is not subject to it at all.

> **One writer per mine.** WeaveDoc is single-writer: one mutating session, and one mutating command, against a mine at a time (FORMATS.md). The CLI refuses a second mutating command; it cannot see YOU editing mine files directly, so never run this skill against a mine another session is writing to. A lost seal or verification row is evidence, not a cache — re-running the command is not the repair.

> **Surface, don't point.** A run that ends with anything waiting on the user — an unresolved conflict, an open question, a Human-queue entry, a fidelity violation, an open gap — must state each item **in the closing message itself**: what it is (id where one exists) · the issue in one line (a conflict names both sides and their sources; a Human-queue entry keeps its ownership tag) · what the user must decide or supply. Every item gets its line — with many items, compress the detail, never the list. The file path comes *after* the substance, as the reference — never instead of it. "questions.md를 확인하세요" with the content only on disk is the handoff twin of the banned blanket "정확합니까?" (verify): no reviewable surface in the message, so the user must open files just to learn what is wrong. Ruled 2026-08-06 — real runs ended exactly that way ("파일을 안 열어봐도 어떤 부분이 문제인지 메시지로 명시"). Its mechanical source: `node .weavedoc/bin/weavedoc.mjs status --open` prints every open item across all five categories, one line each — take the list from that output and render it in the reply language, never re-compose it from memory (the census discipline, applied to the handoff).

> **Decisions: recommend + leave a way out.** When you ask the user to decide (conflict resolution, tag choices…): **mark your recommended option `(추천)`** with a one-line why, and **always allow a free-form answer.** Don't force a closed pick.

> **Thin context.** Don't read all materials or all truths into context. Read `catalog.md` and `truths/index.md` as indexes; load individual files only when needed for extraction or conflict checking. The truth is on disk; re-read when you need it.

> **Write-scope.** This skill writes to `truths/` and `questions.md` — and to the machine state **through the CLI only**: `conflict add|remove` for `.weavedoc-state/conflicts.json`, `alloc truth` for ids. Never edit a state file by hand; the CLI is what keeps the ledger well-formed. It does **not** touch `materials/`, `documents/`, or `project.md` (except the staleness stamp: propagation sets `status: stale` on `documents/*/plan.md` — step 6. That is the only field it may write there, and only to that one value).

> **Grounding discipline.** (1) When the user questions where a recorded claim came from ("어디에 있어?", "그런 게 있어?"), **re-read the truth/material file before answering** — never answer from conversation memory — and show `source`/`location` + the verbatim line; withdraw anything you can't re-find. (A real run answered such a challenge from 2,300-line-old context memory and never showed the `location` field that would have resolved it instantly.) (2) Never attach a temporal/status modifier the material doesn't support (구버전·이전·최신·실제 적용·현행): a label with no verbatim basis of its own gets neutral wording ("m001에 기록된") — "구버전" once implied a usage history that never existed. (3) Match confidence to evidence — a scenario no material supports is a guess, never "가능성이 높다"; world knowledge outside the materials is `[미확인]` and never overrides material readings.

## Prerequisite gate
- `.weavedoc/config.yaml` must exist. If not → `weavedoc init`.
- At least one material with `status: converted` (or `verified`) must exist. If not → `weavedoc gather`.
- **Stop** if prerequisites aren't met.

## Steps

1. **Read.** Read `catalog.md` for the material list. Identify materials that haven't been mapped yet (no truths with that `source` id in `truths/index.md`). Read each material's `converted.md` (summaries first; bodies where extraction needs precision).

2. **Duplicate check.** Before creating a new truth, search existing truths by tags (see AI lookup pattern below). If a truth with the same claim already exists from a different source, don't create a duplicate — record `corroborated_by: [mNNN]` on the existing truth's frontmatter (chat-only corroboration notes are lost when the session ends). If the details disagree, that is a conflict: record an entry (step 4), never a second card.

3. **Extract truths.** For each material, extract atomic, citable facts as individual `truths/t<NNN>.md` files — each id granted by `node .weavedoc/bin/weavedoc.mjs alloc truth` (the only minting path — never number by scanning the directory), zero-padded to at least three digits (`t001`, `t042`, `t1000`), format per `.weavedoc/FORMATS.md`. Assign topic `tags` per the **Tag discipline** below (N:N — a truth can have multiple tags). Inherit relevant tags from the material's `topics` and add finer ones where needed.

   **Copy the body out of the source file, never type it.** Read the exact line from `converted.md`
   and paste it in — that is what makes "copy-paste, never compose" mechanical instead of a promise.
   Write the frontmatter fields in schema order (`.weavedoc/FORMATS.md`), then run
   `node .weavedoc/bin/weavedoc.mjs reindex` followed by `validate`. Hand-writing frontmatter is where
   schema violations are born (~45% of a real map run's tool calls went to hand edits, and one
   corrupted an entry), so validate after **every** batch rather than at the end. IDs are stable
   once assigned — never renumber. Reuse is impossible by construction: the allocator
   (`.weavedoc-state/id-sequences.json`) never re-grants a deleted number, so numbering holes are
   normal and need no explaining.

   **Body = copy-paste, never compose.** The truth's body is a **verbatim quote** from the source — copy the exact source text; never paraphrase, summarize, or retype from memory. `weavedoc validate` substring-checks the body against the source; a paraphrased body FAILS (this failed 52/63 truths on a real run — the entire batch had to be rewritten). When writing the truth file, physically copy the line(s) from `converted.md`.

   **Full-text artifacts are truths too.** When a material contains complete content whose exact wording is itself the fact — 가사 전문, 계약 조항 원문, 코드/설정 스니펫, 사양 표 — extract it: `claim` = what it is (e.g. "야시장의 가사 전문은 다음과 같다"), body = the full verbatim text, tags as usual. Don't silently decide "this is content, not a fact" — that decision loses the artifact from the mine's search space. If genuinely unsure whether an artifact belongs, ask. Deliberate skips are **recorded in the coverage manifest** (below) and named in the completion summary, so the user can catch a wrong call.

   **Attribute tables split by row.** A profile/spec table (본명·나이·키·포지션…) becomes one truth per row or per coherent field, never one truth for the whole table — a whole-table truth means one wrong cell drags the entire record through a correction (or a conflict entry) and every still-valid fact in it churns with it; row-level cards keep each fact independently correctable and independently citable (a real run buried five valid facts behind one wrong cell for exactly this reason).

   **Claim = the fact, nothing else.** No argumentation or cross-material commentary in the claim line ("(이니셜 E와 정합)" is commentary) — index/tree replicate claims verbatim, so commentary becomes permanent search noise.

   **Provenance.** Set `provenance` on every truth: `stated` (default — the source states it), `adopted` (a machine proposal the user adopted; the adoption exchange must be visible in the source material), `derived` (machine-computed/interpreted). **A truth whose source material is `origin: research` may not be `stated`** — nobody *stated* a value the machine went and fetched; use `adopted` (the user accepted the fetched value) or `derived` (computed from it). `validate` enforces this, so a research material's truths must carry `adopted` or `derived` explicitly. This is what keeps "기계는 조용히 고르지 않는다" true at the record level — a real run stored a machine-proposed 158cm indistinguishably from user-supplied values.

   **Derived values.** A value not verbatim in any material may exist only as `provenance: derived` with `derived_from: [ids]` and `assumptions: [자료에 없는 전제 전부]` — an unstated anchor like 세는나이 고1=17 belongs in `assumptions`, never silently inside the number. Time-varying claims (나이·학년·소속·상태) also need `as_of:` (phase/date); in a phase-structured project a time-varying claim without `as_of` is an error — "데뷔 시점 18/18/16/19" was two phases collapsed under one label, unwritable with `as_of` present. **Before writing or presenting any derived value, re-read every `derived_from` id and check it doesn't contradict the derivation** — the debut-age error was refutable from truths written minutes earlier in the same run; being freshly in context is exactly when re-reading gets skipped. When shown to the user, a derived value is always labeled `(계산값 — 근거: … · 가정: …)`; it never enters a decision menu looking like a recorded fact.

   **Coverage manifest — show the extraction, don't just do it.** After extracting a material's truths, write/update its `## m<id>` section in `truths/coverage.md` (format per FORMATS.md): every fact-bearing element of converted.md (section/table/paragraph granularity) → the truth ids extracted from it, **each id listed explicitly, never as a range** (validate matches ids textually); anything deliberately not extracted → a `skipped: <what> — <why>` line (a skip without a reason is an omission). This is T2's audit surface — extraction completeness stops being an open "빠짐없이 뽑았나?" and becomes a checkable ledger, the same show-the-mapping rule M1 already applies to conversion. `validate` cross-checks it mechanically: every mentioned id exists, and **every truth extracted from a sectioned material must appear in that section** — so adding a truth later without updating coverage fails. On re-map of a material, update its section (coverage is map-written judgment content, not `reindex`-generated).

   **`## legacy` — the exemption section.** Materials mapped before coverage existed will never gain a section on their own, so the ratio would stay permanently short. When the **user** rules such a material exempt, record it as `- m001 — <the ruling> — ruled: <YYYY-MM-DD> "<the user's words>"`; `validate` requires the date and the quote (the same bar `questions.md` sets for `answered`), because an unattributed line here silently shrinks the coverage denominator *and* switches off T2's completeness check. `census` subtracts the listed ids from the denominator. Two rules: the **leading id of each bullet** is the machine-read part (ids mentioned inside the ruling prose are ignored — that is deliberate, so you can write the reason naturally), and a material that has its own `## m<id>` section may **not** also be exempt (`validate` blocks it — it is covered, not exempt). Keep `## legacy` last in the file. The ruling is the user's, never yours.

4. **Conflict detection — the priority pass.** Actively hunt contradictions; don't wait to stumble on them (depth per `config.conflicts.detection`). For each tag cluster, read all truths sharing that tag and cross-check **every structured fact** — numbers, dates, amounts, names, obligations — exhaustively; for prose, look for opposing claims on the same point. **Also cross-check facts in different units about the same quantity** (절대값 "17세" vs 상대값 "1살 차") — they never collide textually, but changing one invalidates the other's frame (a real run passed two truths as "no conflict" that both later had to be corrected).

   **Recording a disagreement — the machine's ledger; cards never wear it.** A detected disagreement becomes an entry in `.weavedoc-state/conflicts.json`, written **through the CLI**: put the entry JSON in a temp file and run `node .weavedoc/bin/weavedoc.mjs conflict add <file>` — the `cNNN` id is granted by the allocator, never picked. The canonical cards' bytes do not change. Three shapes, total:
   - **A new claim challenges a standing card** — `targets: [the card id(s)]`, `candidates: [the challenger]`. A challenger does **not** become a card while the disagreement is open: its whole content (claim · source `mNNN` · location · verbatim quote · tags) goes into the candidate, losslessly — a dropped field is a claim the user can no longer adopt.
   - **Two standing cards contradict each other** (a contradiction detection missed earlier) — `targets: [both ids]`, and the candidates carry **both** claims: the entry must be self-contained, because `status --open` renders candidates and the ruling menu is built from them. Both cards stay canonical until the user rules.
   - **No settled current exists** (two challengers arrive together, no standing card) — `targets: []` (*nobody has decided* — blocks shipping; not "resolved to nothing"), candidates carry every claim. Nothing is written to `truths/` for a disputed claim.

   While any entry is open, `validate` is nonzero (`CONFLICT-OPEN`) and `consecrate` refuses — the entry, not a card, is what blocks.

   **Norm vs instance is not a conflict.** A mismatch between a guideline and an actual case (지침 "Exclude 12개 이내" vs 실제 프롬프트) is not a conflict entry — it's an open question (지침 갱신? 예외 단서?): queue it in `questions.md` and never count it in the conflict tally.

5. **Rule and apply — the user rules; you apply; the entry dies.** For each open entry, lay the disagreement before the user: each side's claim, source, and quote, rendered from the entry and its target cards (per the Decisions callout you may mark a recommendation — but the ruling is theirs, and the machine never picks, ranks, or recommends a winner: no authority order, no date order, no recency). Five rulings, and what you do on each:
   - **현재값 유지 (keep the current value)** — nothing changes on disk but the ledger: `conflict remove <cNNN>`.
   - **새값 채택 (adopt a candidate)** — edit the target card **in place** (same `tNNN`): repoint `source`/`location`, re-copy the body verbatim from the adopted candidate's material, rewrite the claim to match; changelog `edited:`; then `conflict remove`. No field records the loser — the past is Git's job.
   - **같은 사실 (same fact)** — the "disagreement" was two records of one fact: append the candidate's material to the card's `corroborated_by`; `conflict remove`.
   - **분리·병합 (split by the hidden axis)** — "both are right" always names a hidden axis (time · viewpoint · definition · scope; **source attribution is the split of last resort**: "자료 A는 X라 한다" / "자료 B는 Y라 한다"). Write the axis **into the claims**: edit the standing card and/or create new card(s) with allocator-granted ids so the two no longer collide. Both results are canonical, and no authorization record is kept — the cards themselves are the answer (this is where v2's 병기 went). `conflict remove`.
   - **전부 기각 (reject all)** — the user ruled every side wrong: delete the falling target card(s) with `removed:` changelog lines, create nothing; `conflict remove`. Zero cards is the *normal* outcome of this ruling — distinct from an open entry's `targets: []`, which is *undecided* and blocks.

   After applying: propagate (step 6), reindex (step 7), changelog (step 8), validate. **Resolution is deletion** — no archive grows, and a claim rejected today that returns tomorrow is compared fresh; nothing is suppressed by having been rejected before. **When the ruling arrives as a correction material** (`corrects: [m011 §4]`, gather's flow), that frontmatter names exactly what to re-ground — read the scope off it rather than inferring which fields move. An entry the user hasn't ruled on stays open, and the closing message renders it (Surface, don't point): both claims, their sources, what's needed — never park a disagreement silently.

6. **Re-check as the source grows + propagate to documents.** On a later run (new materials added), extract new truths, then re-run conflict detection over all tag clusters that the new truths touch. A new truth that contradicts ANY standing card — including one whose earlier disagreement the user already ruled — becomes a **new** entry (step 4): the store keeps no memory of past rulings, so nothing is "settled" against re-detection; it is compared fresh.

   **Propagation (per FORMATS.md "Truth → document propagation"):**
   - **Trigger A (truth changed):** For each truth whose `claim` changed (an in-place edit — adoption, re-grounding, split), grep `documents/*/plan.md` frontmatter for `cited_truths` entries matching that truth id. Set matching documents' `status` to `stale`.
   - **Trigger B (new truth added):** For each newly extracted truth, check its `tags` against `documents/*/plan.md` frontmatter `scope_tags`. A tag overlap means the new truth falls within a document's declared scope. Set matching documents' `status` to `stale`.
     - **Exemption — the asking document (ruled 2026-08-01).** A truth extracted from an `origin: user-answer` material that was created by document D's own ask loop does **not** stale D. It is by construction inside D's scope (D asked because D needed it), so without this exemption *every question a document asks makes that document stale* and forces a cold round per question — a cost nothing documented and nobody would accept. The answer is being written INTO the draft in the same pass; it is not drift arriving from outside. Every OTHER document whose `scope_tags` overlap still goes stale normally, and D still goes stale if the answer changes later. Trace the exemption through `questions.md`, which records which document asked; when that link is absent, do not exempt.
   - Bias to marking stale — under-counting is the silent drift WeaveDoc exists to stop. The one exemption above is narrow on purpose: it names a single, identifiable material, not a category.

7. **Regenerate indexes mechanically.** Run `node .weavedoc/bin/weavedoc.mjs reindex` — it regenerates `truths/index.md` + `truths/tree.md` from frontmatter in one deterministic pass. **Never hand-edit these files** (a real run spent ~45% of its tool calls hand-patching them and corrupted an entry; `validate` now fails on index↔file drift). Mine statistics in your report (truth-file count · index entries · coverage records) come from `node .weavedoc/bin/weavedoc.mjs census` — never from your own counting (a real run reported 191/181 for a mine of 188/178).

8. **Log the run delta.** Append a block to `truths/changelog.md` (create it if absent; format per FORMATS.md): `added:` lines (id + `[provenance]` + one-line claim), `edited:` lines (id + what changed — every in-place update lands here: adoption, re-grounding, split), `removed:` lines (id + why the card was deleted). (`superseded:` is a v2-era spelling kept readable in migrated logs — new entries never write it.) **This is the surface verify's human confirmation renders** — without it, the delta of a run can't be reviewed and confirmation degrades to an unanswerable "정확합니까?". The block's `## YYYY-MM-DD` header is also what bounds "what changed since the human last confirmed", so the date is load-bearing.

   **Withdrawing a bad extraction** — a truth pulled from a sentence that wasn't in its named source, or from a machine note that never should have been promoted — is **deleting the card + its `removed:` line in the same pass**. The line is the human record of *why* the id went away (no command reads it back as a judgment input); the number itself never returns, because the allocator never re-grants it. A deletion without its `removed:` line is a truth that silently vanished — the changelog is what keeps the delta reviewable.

> **Run `weavedoc validate` immediately after writing truths — before reporting completion.** It checks truth frontmatter, source references, the state files (a missing or malformed store fail-closes — never "no conflicts"; open entries report `CONFLICT-OPEN`; dangling targets/sources are named), required_tags coverage, and **quote existence** (each truth's body appears verbatim in its source material). A quote-existence failure means you paraphrased — fix by re-copying the exact source text, not by tweaking words until it matches.

## On-demand correction (fixing an existing truth)

Truths are **corrected** here, not only extracted — this is the entry point when someone says a stored fact is wrong ("야시장 가사가 틀렸어", "t132 고쳐줘"). It works in a **fresh session** as well: the mine is entirely on disk, so read it and act — no prior conversation needed.

1. **Find the truth.** Grep `truths/index.md` / `truths/tree.md` by keyword or tag (e.g. 야시장 → t132). Show its current `claim` + body and **confirm it's the right target** before changing anything.

2. **Diagnose the kind of wrongness — it decides the fix.** A truth body is a *verbatim quote from a material*; you can **never** retype it to say what you want.

   | kind | fix |
   |------|-----|
   | **claim ≠ its own body** (summary misreads the quote) | rewrite `claim` to match the body — no new material needed. Changelog `edited:`. |
   | **wrong quote picked** (the source *has* the right text) | re-copy the correct verbatim quote from the source `converted.md` into the body; `validate` re-seals it. |
   | **the source itself is wrong** (body is faithful, but the fact is wrong in reality — the common case for lyrics) | you **cannot** hand-edit the body into what it should say. The correct content must **enter as a material**: run `gather` on the user's correction (`origin: user-answer`, or a corrected file) **with `corrects: [m011 §4]` naming exactly what it displaces**, then **re-ground the card in place** (same `tNNN`): repoint `source`/`location`, re-copy the verbatim body from the correction material, rewrite the claim to match — changelog `edited:`. The truth changes because its *grounding* changed, not by retyping. If instead the correction pits two sources against each other with no ruling yet, record a conflict entry (step 4) and let the user rule. `corrects` does two jobs the run otherwise does by hand and drops: it names exactly what to re-ground, and it tells a reader of the mirror alone that this material is a correction rather than a new setting (that omission reached a real run's Human queue). The correction material's `source.md` holds the **user's words only** — any machine framing (an anchor, a normalization like "세는나이 고1=17") is a `> [machine-note]` line, never woven into the user's statement and never promoted into the new truth's claim (a real run's correction material smuggled a machine anchor into the user's words, and it rode into the claim). |
   | **the source is misdesignated** (the quote is verbatim and the fact is real — it just came from a *different* material) | repoint `source` to the material that actually holds the text, re-copy the quote from there, fix `location`, and move the id in `coverage.md` to the correct `## m<id>` section. **Do not delete it** — the fact is in the mine and only one field was wrong; deleting would tell every consumer the fact simply isn't here — false, and precisely the actively-misled case T5 exists to catch. |
   | **the extraction never had standing** (the quote is in no material at all; a `> [machine-note]` was promoted to a claim) | **delete the card + its `removed:` line in `changelog.md`, in the same pass** — the line is the record, and the allocator never re-grants the number. Not a conflict resolution: nothing stood against it, so no entry is involved. If the card **is** a target of an open conflicts.json entry, fix the entry in the same pass (`conflict remove`, then re-`add` with the corrected targets if the disagreement is still live) — a deleted target left behind is `CONF-TARGET-DANGLING`. |
   | **a conflict map missed** | record the entry (step 4, the card-vs-card shape); the cards' bytes stay put until the user rules (step 5). |
   | **source retracted** (gather set the material's `status: retracted`) | for each truth grounded on it: **re-ground it on a live material** (the fact often survives elsewhere — `corroborated_by` names the candidates) or **delete the card** + `removed:` line. `validate` names every leftover as `TRUTH-SOURCE-DANGLING`. A choice this forces between two live sources is a conflict entry (step 4), not your pick. Then propagate (step 6), reindex (step 7), changelog (step 8). |

3. **Never silently pick.** A correction that pits two sources against each other is a conflict entry the **user** rules on — you record it (step 4), lay it before them (step 5), and apply their ruling; the machine executes, never originates the choice.

4. **Propagate + seal.** After the change, run propagation (step 6): any document whose `cited_truths` includes the changed id — or whose `scope_tags` overlap a re-grounded truth — → `status: stale`. Regenerate `index.md`/`tree.md` (step 7) and run `weavedoc validate`.

## AI lookup pattern

When checking a new truth against existing ones, the AI does NOT read all truth files. Instead:
1. Identify the new truth's tags.
2. `grep` for those tags across `truths/*.md` frontmatter → get the list of relevant truth ids.
3. Read only those files.
4. Judge conflicts on the fly.

This keeps the work proportional to the tag cluster size, not the total truth count.

**Enumerations are grep-backed.** Before asserting "X를 가진 것은 A와 B다" — or accepting the user's count ("두 개") — grep the mine and list from results; if the actual count differs from the user's, say so explicitly. (A real run echoed "두 개" back when three tracks plus two templates matched, and the miscount propagated into a material's own summary.)

## Tag discipline — the search net is only as good as its vocabulary

Tags are the mine's neighbourhood structure: the machine narrows every lookup by tag — conflict detection, document propagation (`scope_tags`), `pull` — and **never interprets a tag's meaning**. Judging "is this the same fact?" happens *inside* the neighbourhood, and that judgment is yours. Four rules, in force on every write:

1. **Before creating a new truth or changing one, read the existing tag list first** — `truths/tree.md` is the vocabulary in use. Grep it; don't trust memory of it.
2. **Reuse similar tags** — never mint a new tag when a near one exists. Don't create `예산세부사항` when `예산` already exists unless the distinction matters for conflict detection; a truth with a novel tag hides from every existing cluster and from documents whose `scope_tags` use the established term. When in doubt, use the broader tag AND the specific one (a truth can have multiple tags).
3. **When the tag choice is ambiguous, ask the user** — a wrong guess here misroutes conflict detection and propagation silently.
4. **When editing a card, re-check that its tags still fit** the new value — a re-grounded or split claim can drift out of its old neighbourhood.

T4 in verify checks tag quality; propagation trigger B depends on it.

## Next
Still in the **mine-building phase**. **verify** (truths mode) is available to cold-check extraction fidelity (recommended guard, skippable). Once truths are verified, the mine-building phase is complete and **plan** — the document-writing phase — becomes available *when the user wants it*; the mine can also keep growing. Offer, don't direct ("이제 verify를 할 수 있습니다"), never an obligation.

> **This skill must not be run as a subagent** — it may need user interaction for conflict resolution.
