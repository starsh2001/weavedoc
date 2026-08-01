---
name: weavedoc-map
description: Extract truths from materials, tag and classify them, hunt contradictions, and correct existing truths on demand. Use when the user says "map", "build the graph", "그래프", "관계 정리", "진실 추출", "truths", or after gather — also when the user says a stored fact/truth is wrong and wants it fixed ("정정", "틀렸어", "고쳐줘", "이 truth 수정", "correct a truth", "fix a truth"). Creates or updates truths/.
---

# weavedoc-map

The data mine's core engine — extract atomic truths from materials, tag them for AI searchability, and catch contradictions. Called repeatedly as new materials enter the mine; the truth set grows with each call. It is **also where existing truths are corrected** on demand — when a stored fact turns out wrong (see **On-demand correction** below). That path works from a fresh session too: the whole mine is on disk, so read it and act — no prior conversation needed.

> **Language: read it first.** Read `language:` from `.weavedoc/config.yaml` and write **every** reply in that language. These skill files are English; your output is not.

> **Decisions: recommend + leave a way out.** When you ask the user to decide (conflict resolution, tag choices…): **mark your recommended option `(추천)`** with a one-line why, and **always allow a free-form answer.** Don't force a closed pick.

> **Thin context.** Don't read all materials or all truths into context. Read `catalog.md` and `truths/index.md` as indexes; load individual files only when needed for extraction or conflict checking. The truth is on disk; re-read when you need it.

> **Write-scope.** This skill writes only to `truths/` and `questions.md`. It does **not** touch `materials/`, `documents/`, or `project.md` (except the staleness stamp: propagation sets `status: stale` on `documents/*/plan.md` — step 6. That is the only field it may write there, and only to that one value).

> **Grounding discipline.** (1) When the user questions where a recorded claim came from ("어디에 있어?", "그런 게 있어?"), **re-read the truth/material file before answering** — never answer from conversation memory — and show `source`/`location` + the verbatim line; withdraw anything you can't re-find. (A real run answered such a challenge from 2,300-line-old context memory and never showed the `location` field that would have resolved it instantly.) (2) Never attach a temporal/status modifier the material doesn't support (구버전·이전·최신·실제 적용·현행): a label with no verbatim basis of its own gets neutral wording ("m001에 기록된") — "구버전" once implied a usage history that never existed. (3) Match confidence to evidence — a scenario no material supports is a guess, never "가능성이 높다"; world knowledge outside the materials is `[미확인]` and never overrides material readings.

## Prerequisite gate
- `.weavedoc/config.yaml` must exist. If not → `weavedoc init`.
- At least one material with `status: converted` (or `verified`) must exist. If not → `weavedoc gather`.
- **Stop** if prerequisites aren't met.

## Steps

1. **Read.** Read `catalog.md` for the material list. Identify materials that haven't been mapped yet (no truths with that `source` id in `truths/index.md`). Read each material's `converted.md` (summaries first; bodies where extraction needs precision).

2. **Duplicate check.** Before creating a new truth, search existing truths by tags (see AI lookup pattern below). If a truth with the same claim already exists from a different source, don't create a duplicate — record `corroborated_by: [mNNN]` on the existing truth's frontmatter (chat-only corroboration notes are lost when the session ends), or flag a conflict if the details differ.

3. **Extract truths.** For each material, extract atomic, citable facts as individual `truths/t<NNN>.md` files — ids zero-padded to at least three digits (`t001`, `t042`, `t1000`), format per `.weavedoc/FORMATS.md`. Assign topic `tags` (N:N — a truth can have multiple tags). Inherit relevant tags from the material's `topics` and add finer ones where needed.

   **Copy the body out of the source file, never type it.** Read the exact line from `converted.md`
   and paste it in — that is what makes "copy-paste, never compose" mechanical instead of a promise.
   Write the frontmatter fields in schema order (`.weavedoc/FORMATS.md`), then run
   `bash .weavedoc/bin/weavedoc reindex` followed by `validate`. Hand-writing frontmatter is where
   schema violations are born (~45% of a real map run's tool calls went to hand edits, and one
   corrupted an entry), so validate after **every** batch rather than at the end. IDs are stable
   once assigned — never renumber, and never reuse an id that appears in a changelog `removed:` line.

   **Body = copy-paste, never compose.** The truth's body is a **verbatim quote** from the source — copy the exact source text; never paraphrase, summarize, or retype from memory. `weavedoc validate` substring-checks the body against the source; a paraphrased body FAILS (this failed 52/63 truths on a real run — the entire batch had to be rewritten). When writing the truth file, physically copy the line(s) from `converted.md`.

   **Full-text artifacts are truths too.** When a material contains complete content whose exact wording is itself the fact — 가사 전문, 계약 조항 원문, 코드/설정 스니펫, 사양 표 — extract it: `claim` = what it is (e.g. "야시장의 가사 전문은 다음과 같다"), body = the full verbatim text, tags as usual. Don't silently decide "this is content, not a fact" — that decision loses the artifact from the mine's search space. If genuinely unsure whether an artifact belongs, ask. Deliberate skips are **recorded in the coverage manifest** (below) and named in the completion summary, so the user can catch a wrong call.

   **Attribute tables split by row.** A profile/spec table (본명·나이·키·포지션…) becomes one truth per row or per coherent field, never one truth for the whole table — a whole-table truth means one wrong cell forces the entire record to `discarded` and buries five still-valid facts from every live view (a real run's live count *dropped* while adding truths for exactly this reason).

   **Claim = the fact, nothing else.** No argumentation or cross-material commentary in the claim line ("(이니셜 E와 정합)" is commentary) — index/tree replicate claims verbatim, so commentary becomes permanent search noise.

   **Provenance.** Set `provenance` on every truth: `stated` (default — the source states it), `adopted` (a machine proposal the user adopted; the adoption exchange must be visible in the source material), `derived` (machine-computed/interpreted). **A truth whose source material is `origin: research` may not be `stated`** — nobody *stated* a value the machine went and fetched; use `adopted` (the user accepted the fetched value) or `derived` (computed from it). `validate` enforces this, so a research material's truths must carry `adopted` or `derived` explicitly. This is what keeps "기계는 조용히 고르지 않는다" true at the record level — a real run stored a machine-proposed 158cm indistinguishably from user-supplied values.

   **Derived values.** A value not verbatim in any material may exist only as `provenance: derived` with `derived_from: [ids]` and `assumptions: [자료에 없는 전제 전부]` — an unstated anchor like 세는나이 고1=17 belongs in `assumptions`, never silently inside the number. Time-varying claims (나이·학년·소속·상태) also need `as_of:` (phase/date); in a phase-structured project a time-varying claim without `as_of` is an error — "데뷔 시점 18/18/16/19" was two phases collapsed under one label, unwritable with `as_of` present. **Before writing or presenting any derived value, re-read every `derived_from` id and check it doesn't contradict the derivation** — the debut-age error was refutable from truths written minutes earlier in the same run; being freshly in context is exactly when re-reading gets skipped. When shown to the user, a derived value is always labeled `(계산값 — 근거: … · 가정: …)`; it never enters a decision menu looking like a recorded fact.

   **Coverage manifest — show the extraction, don't just do it.** After extracting a material's truths, write/update its `## m<id>` section in `truths/coverage.md` (format per FORMATS.md): every fact-bearing element of converted.md (section/table/paragraph granularity) → the truth ids extracted from it, **each id listed explicitly, never as a range** (validate matches ids textually); anything deliberately not extracted → a `skipped: <what> — <why>` line (a skip without a reason is an omission). This is T2's audit surface — extraction completeness stops being an open "빠짐없이 뽑았나?" and becomes a checkable ledger, the same show-the-mapping rule M1 already applies to conversion. `validate` cross-checks it mechanically: every mentioned id exists, and **every truth extracted from a sectioned material must appear in that section** — so adding a truth later without updating coverage fails. On re-map of a material, update its section (coverage is map-written judgment content, not `reindex`-generated).

   **`## legacy` — the exemption section.** Materials mapped before coverage existed will never gain a section on their own, so the ratio would stay permanently short. When the **user** rules such a material exempt, record it as `- m001 — <the ruling> — ruled: <YYYY-MM-DD> "<the user's words>"`; `validate` requires the date and the quote (the same bar `questions.md` sets for `answered`), because an unattributed line here silently shrinks the coverage denominator *and* switches off T2's completeness check. `census` subtracts the listed ids from the denominator. Two rules: the **leading id of each bullet** is the machine-read part (ids mentioned inside the ruling prose are ignored — that is deliberate, so you can write the reason naturally), and a material that has its own `## m<id>` section may **not** also be exempt (`validate` blocks it — it is covered, not exempt). Keep `## legacy` last in the file. The ruling is the user's, never yours.

4. **Conflict detection — the priority pass.** Actively hunt contradictions *between* truths; don't wait to stumble on them (depth per `config.conflicts.detection`). For each tag cluster, read all truths sharing that tag and cross-check **every structured fact** — numbers, dates, amounts, names, statuses, obligations — exhaustively; for prose, look for opposing claims on the same point. **Also cross-check facts in different units about the same quantity** (절대값 "17세" vs 상대값 "1살 차") — they never collide textually, but changing one invalidates the other's frame (a real run passed two truths as "no conflict" that both had to be superseded later). Each conflict → set `status: conflict` and `conflict_with: [<ids>]` on **both** conflicting truth files.

   **Norm vs instance is not a conflict.** A mismatch between a guideline and an actual case (지침 "Exclude 12개 이내" vs 실제 프롬프트) is not `status: conflict` — it's an open question (지침 갱신? 예외 단서?): queue it in `questions.md` and never count it in the conflict tally.

5. **Resolve — mechanically first, else ask.** For each conflict pair:
   - **Machine-resolvable** (set `decided_by: machine`):
     - `supersedes` — the source materials have a temporal relation (newer replaces older). **Order by `dated` only** — the material's own date, per FORMATS. If either material lacks `dated`, this rule does **not** apply: `added` is intake order (a batch makes them all equal) and a date read out of a body is not a declared field. Fall through to `authority`, then to asking. Never infer the order from prose.
     - `authority` — `project.md` `authority` ranks the two source roles, higher wins.
   - **User-resolvable** (queue in `questions.md`, set `decided_by: user`):
     - `pick` — user chooses A or B as the correct value.
     - `value` — user supplies the real value (neither A nor B was right); saved as a `user-answer` material.
     - `attribute` — user authorizes keeping both sides (병기). Requires explicit authorization: user chooses it per-conflict (`config.conflicts.attribution: ask`) or standing project-level permission (`config.conflicts.attribution: allow`).
     - Record `decision_kind` alongside: `supplied` (user provided the value) vs `ratified` (user accepted a machine-originated proposal). `ratified` items join the priority re-verify set — a wrong machine derivation that a user waves through must stay traceable as machine-originated, not launder into "사용자 결정".
   - **Partial supersede.** When only some fields of a record truth are superseded, add `scope: [키, 나이]` naming exactly the superseded fields (and `winner` may be a list when fields fall to different sources) — prose-only "나머지는 유효" in `reason` disappears from index views and hides valid facts. Prefer the row-split rule (step 3) so this rarely arises. **When the winning material declares `corrects: [m011 §4]`, that is the scope** — read it off the frontmatter rather than inferring which fields moved. See FORMATS.md for complete resolution examples — copy the shape.
   - **Write BOTH sides in the same edit.** The loser gets `status: discarded` + `resolution`; every winner gets its own `resolution` (and appends the loser to its `superseded` list). Reciprocity by hand is what fails: a real mine had `t040` recording that it lost to `t194` while `t194` recorded nothing, so the mine said someone lost and nobody won. The same run also hand-attached a resolution to a truth that had no conflict at all — `validate` catches that one, but only after the fact.
   - **Standing precedence (lazy authority).** When asking, if the two truths come from materials with **different roles**, also offer: *"한쪽 자료 유형(role)을 프로젝트 전체에서 우선할까요?"* If the user picks a standing precedence, write it to `project.md` `authority` (highest-first) and resolve this conflict as `type: authority, decided_by: user, decision_kind: ratified` (the machine offered the mechanism, the user set the ranking — `ratified`, which also puts it in the priority re-verify set; a rule set once decides later conflicts the user never sees). Later conflicts between the same roles then auto-resolve (`decided_by: machine`). This is how `authority` comes into existence — at the first conflict that needs it, never as an up-front interview.
   - The machine **must not pick, merge, or attribute on its own logic.** `config.attribution: allow` is the *user's* standing authorization, not the machine deciding — the machine still only executes, never originates the choice.
   - **Status outcomes — status is the validity axis; history lives in `resolution`.** Loser → `status: discarded` + the resolution record (no longer a truth of the mine; the file stays as audit trail). Winner → **stays `ok`**, carrying the resolution as history (`winner:` its own id). `attribute` → **both** sides stay `ok` with `type: attribute` (citing them means writing both sides, attributed). Never leave a winner stamped anything but `ok` — a real run's winner-stamped-`resolved` truths vanished from every live count.

6. **Re-check as the source grows + propagate to documents.** On a later run (new materials added), extract new truths, then re-run conflict detection over all tag clusters that the new truths touch. **Re-open** any settled truth that a new truth now contradicts — an `ok` truth carrying a `resolution` goes back to `conflict` like any other live truth.

   **Propagation (per FORMATS.md "Truth → document propagation"):**
   - **Trigger A (truth changed):** For each truth whose `claim` or `status` changed, grep `documents/*/plan.md` frontmatter for `cited_truths` entries matching that truth id. Set matching documents' `status` to `stale`.
   - **Trigger B (new truth added):** For each newly extracted truth, check its `tags` against `documents/*/plan.md` frontmatter `scope_tags`. A tag overlap means the new truth falls within a document's declared scope. Set matching documents' `status` to `stale`.
     - **Exemption — the asking document (ruled 2026-08-01).** A truth extracted from an `origin: user-answer` material that was created by document D's own ask loop does **not** stale D. It is by construction inside D's scope (D asked because D needed it), so without this exemption *every question a document asks makes that document stale* and forces a cold round per question — a cost nothing documented and nobody would accept. The answer is being written INTO the draft in the same pass; it is not drift arriving from outside. Every OTHER document whose `scope_tags` overlap still goes stale normally, and D still goes stale if the answer changes later. Trace the exemption through `questions.md`, which records which document asked; when that link is absent, do not exempt.
   - Bias to marking stale — under-counting is the silent drift WeaveDoc exists to stop. The one exemption above is narrow on purpose: it names a single, identifiable material, not a category.

7. **Regenerate indexes mechanically.** Run `bash .weavedoc/bin/weavedoc reindex` — it regenerates `truths/index.md` + `truths/tree.md` from frontmatter in one deterministic pass. **Never hand-edit these files** (a real run spent ~45% of its tool calls hand-patching them and corrupted an entry; `validate` now fails on index↔file drift). Mine statistics in your report (총/live/discarded 수) come from `bash .weavedoc/bin/weavedoc census` — never from your own counting (a real run reported 191/181 for a mine of 188/178).

8. **Log the run delta.** Append a block to `truths/changelog.md` (create it if absent; format per FORMATS.md): `added:` lines (id + `[provenance]` + one-line claim), `superseded:` lines (old id → winner, scope), `edited:` lines (id + what changed), `removed:` lines (id + why withdrawn). **This is the surface verify's human confirmation renders** — without it, the delta of a run can't be reviewed and confirmation degrades to an unanswerable "정확합니까?". The block's `## YYYY-MM-DD` header is also what bounds "what changed since the human last confirmed", so the date is load-bearing.

   **Withdrawing a bad extraction** — a truth pulled from a sentence that wasn't in its named source, or from a machine note that never should have been promoted — is `status: retracted` + a `removed:` line, **never `rm`**. The file stays as a tombstone. A real run deleted `t241` outright, and `census` asked "t083 t211 t241 — confirm which" on every subsequent run with no way to answer.

> **Run `weavedoc validate` immediately after writing truths — before reporting completion.** It checks truth frontmatter, source references, conflict consistency, required_tags coverage, and **quote existence** (each truth's body appears verbatim in its source material). A quote-existence failure means you paraphrased — fix by re-copying the exact source text, not by tweaking words until it matches.

## On-demand correction (fixing an existing truth)

Truths are **corrected** here, not only extracted — this is the entry point when someone says a stored fact is wrong ("야시장 가사가 틀렸어", "t132 고쳐줘"). It works in a **fresh session** as well: the mine is entirely on disk, so read it and act — no prior conversation needed.

1. **Find the truth.** Grep `truths/index.md` / `truths/tree.md` by keyword or tag (e.g. 야시장 → t132). Show its current `claim` + body and **confirm it's the right target** before changing anything.

2. **Diagnose the kind of wrongness — it decides the fix.** A truth body is a *verbatim quote from a material*; you can **never** retype it to say what you want.

   | kind | fix |
   |------|-----|
   | **claim ≠ its own body** (summary misreads the quote) | rewrite `claim` to match the body — no new material needed. |
   | **wrong quote picked** (the source *has* the right text) | re-copy the correct verbatim quote from the source `converted.md` into the body; `validate` re-seals it. |
   | **the source itself is wrong** (body is faithful, but the fact is wrong in reality — the common case for lyrics) | you **cannot** hand-edit the truth. The correct content must **enter as a material**: run `gather` on the user's correction (`origin: user-answer`, or a corrected file) **with `corrects: [m011 §4]` naming exactly what it displaces**, then supersede the old truth (both sides, as above) — or flag `conflict` and let the user pick. The truth changes because its *grounding* changed, not by retyping. `corrects` does two jobs the run otherwise does by hand and drops: it gives the resolution its `scope`, and it tells a reader of the mirror alone that this material is a correction rather than a new setting (that omission reached a real run's Human queue). The correction material's `source.md` holds the **user's words only** — any machine framing (an anchor, a normalization like "세는나이 고1=17") is a `> [machine-note]` line, never woven into the user's statement and never promoted into the new truth's claim (a real run's correction material smuggled a machine anchor into the user's words, and it rode into the claim). |
   | **the source is misdesignated** (the quote is verbatim and the fact is real — it just came from a *different* material) | repoint `source` to the material that actually holds the text, re-copy the quote from there, fix `location`, and move the id in `coverage.md` to the correct `## m<id>` section. **Do not retract it** — the fact is in the mine and only one field was wrong. Retracting would tell every consumer, through `READ.md`, that "the fact simply isn't in the mine" — false, and precisely the actively-misled case T5 exists to catch. |
   | **the extraction never had standing** (the quote is in no material at all; a `> [machine-note]` was promoted to a claim) | `status: retracted` + a `removed:` line in `changelog.md` (`validate` requires the line). **Not `discarded`** — nothing was superseded, so there is no winner and no resolution. **Not `rm`** — the file stays as a tombstone; deleting one in a real run left `census` asking "confirm which" about the hole forever. If the truth was in an open `conflict`, **resolve or re-open the other side in the same edit** — retracting one party silently strands the other as permanently unusable, and `validate` now blocks that. |
   | **a conflict map missed** | re-hunt that tag cluster, set both truths' `status: conflict` + `conflict_with`, resolve per step 5. |
   | **source retracted** (gather set the material's `status: retracted`) | set its live truths (`ok`/`conflict`) → `unsupported`; **re-open** any truth whose `resolution.winner` references the retracted material (basis gone → back to `conflict`; the user re-resolves); then propagate (step 6), reindex (step 7), changelog (step 8). `validate` enforces all of it mechanically. |

3. **Never silently pick.** A correction that pits two sources against each other is a `conflict` the **user** resolves (`decided_by: user`) — the machine executes, never originates the choice (step 5's rule).

4. **Propagate + seal.** After the change, run propagation (step 6): any document whose `cited_truths` includes the changed id — or whose `scope_tags` overlap a re-grounded truth — → `status: stale`. Regenerate `index.md`/`tree.md` (step 7) and run `weavedoc validate`.

## AI lookup pattern

When checking a new truth against existing ones, the AI does NOT read all truth files. Instead:
1. Identify the new truth's tags.
2. `grep` for those tags across `truths/*.md` frontmatter → get the list of relevant truth ids.
3. Read only those files.
4. Judge conflicts on the fly.

This keeps the work proportional to the tag cluster size, not the total truth count.

**Enumerations are grep-backed.** Before asserting "X를 가진 것은 A와 B다" — or accepting the user's count ("두 개") — grep the mine and list from results; if the actual count differs from the user's, say so explicitly. (A real run echoed "두 개" back when three tracks plus two templates matched, and the miscount propagated into a material's own summary.)

## Tag consistency rule

Tags are the lookup key for both conflict detection and document propagation (scope_tags). **Use the same tag vocabulary across truths** — don't create narrower sub-tags (e.g. `예산세부사항`) when a broader tag (`예산`) already exists, unless the distinction is meaningful for conflict detection. A truth with a novel tag hides from existing clusters and from documents whose scope_tags use the broader term. When in doubt, **use the broader tag AND the specific one** (a truth can have multiple tags). T4 in verify checks tag quality; propagation trigger B depends on it.

## Next
Still in the **mine-building phase**. **verify** (truths mode) is available to cold-check extraction fidelity (recommended guard, skippable). Once truths are verified, the mine-building phase is complete and **plan** — the document-writing phase — becomes available *when the user wants it*; the mine can also keep growing. Offer, don't direct ("이제 verify를 할 수 있습니다"), never an obligation.

> **This skill must not be run as a subagent** — it may need user interaction for conflict resolution.
