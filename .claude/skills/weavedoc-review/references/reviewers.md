# reviewers — the cold-review engine (shared by verify + review)

> `weavedoc-verify` (material/truths) and `weavedoc-review` (document fidelity + advisory) both load this to run a cold round. The SKILLs hold the *rules* (levels, pass conditions); this holds the *mechanics + the bar + the lenses*, so every review comes out the same shape.
> Reviewers write findings in the project's language (`config.language`).

## THE BAR — sufficient fidelity, not perfection

You review for a **competent writer** who will check truths, cite sources, follow the plan, and ask only when *truly* stuck. So:

- A finding is a real flaw **only if that writer would produce a factually wrong claim, miss a fact that changes the document, or cite something the original doesn't say.**
- Yes, go in adversarially ("find flaws; assume there's a problem") — **but a kept finding must name *what is wrong, where, and what consequence it would have*.** "Seems incomplete" is not a finding.
- You are checking for **sufficient** fidelity, not exhaustive perfection. "Enough to write a document that doesn't misrepresent the sources" is the target.

## SCOPE — what a reviewer may and may not raise

### verify (material / truths)
- **In scope:** factual loss, factual distortion, hallucinated content, broken quote-to-claim link, missing load-bearing fact, mistagged truth that hides from conflict detection.
- **Out of scope:** formatting preferences, meaning-preserving reformulation, line-break differences, heading-level choices, list style (unless information is lost).

### review — fidelity gate
- **In scope:** claim cites a conflicted truth, claim has no truth backing, missing required element, silent side-picking in a conflict, unauthorized attribution.
- **Out of scope:** prose quality, persuasiveness, tone, document structure choices (those belong to the advisory panel, not the gate).

### review — advisory panel
- **In scope:** logic gaps, weak arguments, unclear prose, missing context for the reader, structural issues, redundancy.
- **Out of scope:** fidelity violations (those are the gate's job and are never advisory), personal stylistic preferences without a reader-impact argument.

**An out-of-scope finding is not a finding — drop it before triage.** Don't raise it and rely on triage to catch it; that wastes a round.

## Findings format — name the consequence

One finding per line:
```
- [critical|should-fix|nice-to-have] <where: §section / M#·T# / file:location> — <what is wrong + what consequence it would have>
```

- `critical` — the document/truth would **state something factually wrong** or **miss a fact that changes the document's meaning**. If you can't name the wrong claim and its consequence, it is not critical.
- `should-fix` — fidelity is maintained, but **ambiguity or imprecision** would make two writers produce materially different documents from the same truths.
- `nice-to-have` — wording, clarity, minor precision loss that doesn't change meaning.

A finding with no named consequence ("this seems unclear", "what about edge X?") is a **non-finding** — drop it. If a lens finds nothing, it returns `none` with a one-line note on what it checked.

### The verdict line is the contract (ruled 2026-07-31)

When a check that was supposed to run **did not run**, and the tool still prints its clean verdict (`✓`, exit 0), that is **`critical`** — regardless of how honest the accounting beside it was. Two cold rounds graded the same shape differently (one `high` because the accounting line said `← N NOT checked`, one `critical` because a purpose-built alarm had been switched off), so the rule is fixed here rather than re-argued each round:

- **What a consumer acts on is the verdict line and the exit code.** Scripts read the exit code; a tired human reads the tick. An accounting line is *information*, not a warranty — it does not downgrade a green verdict over a membrane that never ran.
- A silently-skipped **membrane** (the quote seal, the fidelity gate) is the strict case: green verdict + membrane not run = `critical`, full stop.
- The honest accounting still matters — it is what makes the defect *findable*. It just doesn't change the grade.

This cuts both ways: a check that ran and reported accurately is not critical merely because its message was unclear (that is `should-fix`).

### Examples

#### verify (material)
- ✅ `- [critical] M1 §3 — 원본 테이블의 4행(은지, 18세, 리드 보컬)이 converted.md에서 누락됨 → write가 은지 정보 없이 문서를 작성하게 됨`
- ✅ `- [critical] M2 §5 — 원본에 "162 BPM"인데 converted.md에 "126 BPM"으로 변환됨 → truth에 잘못된 BPM이 기록됨`
- ✅ `- [should-fix] M3 §2 — 원본에 없는 "서정적 발라드 스타일"이라는 설명이 converted.md에 추가됨 → truth에 근거 없는 장르 정보가 들어감`
- ❌ `- [should-fix] 문단 순서가 원본과 다름` *(정보 손실 없으면 out of scope)*
- ❌ `- [nice-to-have] 좀 더 자세히 쓰면 좋겠음` *(consequence 없음)*

#### verify (truths)
- ✅ `- [critical] T1 t045 — claim "17세 때 봉사활동에서 발탁"인데 quote는 "16세 때 봉사 콘서트에서 MC를 맡다가" → 나이가 1살 다르고, 활동 종류도 다름`
- ✅ `- [should-fix] T2 m003 — material에 "음악 제작 시스템은 강소은 디렉팅 + 외부 프로듀서 협업"이라는 핵심 사실이 있지만 truth로 추출되지 않음 → 이 사실이 문서에 반영 안 됨`
- ✅ `- [should-fix] T4 t077 — 야시장 SUNO 프롬프트 성공 사례인데 tags가 [SUNO, 음악제작]뿐이고 [야시장] 태그 없음 → 야시장 관련 충돌 탐지에서 이 truth가 빠짐`
- ❌ `- [nice-to-have] t006의 claim을 좀 더 자연스럽게 쓰면 좋겠음` *(정보 손실 없으면 out of scope)*

#### review (fidelity gate)
- ✅ `- [contradiction] §2.1 — "세하는 17세"라고 썼으나 t006과 t046이 conflict 상태(미해결) → 해결 없이 한쪽을 택함`
- ✅ `- [unsupported] §5.3 — "유나는 팬들에게 가장 인기 있는 멤버"라는 claim이 어떤 truth에도 근거 없음`
- ❌ `- [contradiction] 유나 나이가 17세인데 고2면 맞나?` *(truth 간 충돌이 아님 — 추론에 대한 의문)*

#### review (advisory panel)
- ✅ `- [should-fix] §4 — Phase 1 스토리를 시간순으로 서술했는데 클라이맥스(Stargazer 무대)가 중간에 묻힘 → 독자가 서사의 정점을 놓침`
- ✅ `- [nice-to-have] §2.2 — 멤버 테이블 직후에 멤버별 상세가 나오는데, 케미 섹션이 중간에 끼어 흐름이 끊김`
- ❌ `- [critical] §3 — Knock:One 정보가 부족함` *(fidelity 문제면 gate에서 잡아야 하고, 아니면 consequence를 구체적으로)*

## Common preamble (prepend to every cold reviewer's prompt)

```
You are a *cold* reviewer in a WeaveDoc project. You did NOT see how this was produced —
only the target + criteria. Review for a COMPETENT writer (checks truths, cites sources,
follows the plan, asks when stuck): a flaw is real only if such a writer would produce
a FACTUALLY WRONG claim, MISS a meaning-changing fact, or CITE something the source
doesn't say — name what is wrong and what consequence it would have.

Target: {target}
  material: source.<ext> + converted.md (conversion fidelity)
  truths: truths/*.md vs their source materials (extraction fidelity) + truths/coverage.md (the extraction ledger T2 audits)
  document-fidelity: draft.md vs cited truths (citation/grounding)
  document-advisory: draft.md + plan.md (quality/persuasiveness)
Criteria: {the checklist items for this lens — M1-M4 / T1-T5 / fidelity gate / advisory persona}
You may read: {the files listed for this target, PLUS any material the target's converted.md
  explicitly cross-references (a value labeled "(m012 대조)" needs m012 to check), PLUS
  existence-checks on gaps.md/questions.md (a decision recorded there is not a missing fact)
  — never the full mine}
  {T5 ONLY — the read-scope is DIFFERENT, not merely narrower: everything READ.md points a
   consumer at, and only that — `weavedoc pull <term>`, the truth files it points at (rule 2),
   `truths/index.md` / `truths/tree.md` / `census` (rule 5), and `project.md` required_tags so
   you know which topics to pull. NO materials, NO source.*, NO coverage, NO conversion history
   — reading those destroys the lens, whose whole value is seeing exactly what a consumer sees.
   Questions needing material access are named and left, never answered.}
Do NOT raise: explicitly labeled derivations/cross-references ("(m012 대조)", "> [note]",
  "> [machine-note]" lines) as hallucination; {the do-not-raise categories from adjudications}
Write findings in {config.language}.

<then the findings format, then the role lens>
```

## Spawning

- Spawn reviewers as **parallel subagents** (Claude Code's Agent tool), one per lens — count from `config.yaml` (`verify.scale` / `review.scale`). Each starts from an **empty context** (that's what makes them cold). One batch, concurrent.
- **The count is exact — floor and ceiling at once.** That many reviewers, plus the defender when triage requires one, and nothing else. **Not fewer:** folding two lenses into one reviewer produces a verdict table with rows nobody separately ran, which is a PARTIAL wearing a PASS. **Not more, and never one per unit:** the count is per *round*; a single reviewer holds its lens's whole scope, because the judgement is about the set. Current model tiers err in both directions — one under-reaches for subagents, the next over-reaches — so the number is obeyed, not interpreted.
- For `skip`: spawn none; the caller self-checks.
- Each reviewer's prompt = **common preamble** + its **role lens** + the **findings format**. Never give them how the target was produced, or a prior round's discussion.
- **Model**: each reviewer inherits the session model by default. If `config` specifies per-lens models, use those.

## Aggregate

Merge findings from all reviewers; dedupe by (where + what). On a severity clash, take the higher. On a **kind** clash (two lenses judged the same defect e.g. `contradiction` vs `unsupported`), keep the kind whose diagnosis carries **more evidence** — `contradiction` (names the conflicting truth) over `unsupported` (names only absence) over `missing-required` — and note the displaced kind in the entry's prose; `refine` routes the repair by kind, so the merged entry must say which repair path won and that the other reading existed.

## Over-strictness triage (`full`; optional `standard`)

One more cold reviewer (the *defender*) rules each finding KEEP / DOWNGRADE / DROP. **The defender is a separate cold subagent — the orchestrating session must never self-triage**, and the defender is mandatory (whatever the level) whenever the orchestrating session also produced the conversions under review: the producer defending its own work is how a twice-raised finding got dismissed twice in a real run — and it was the one the user later corrected.

- **Drop:** anything out of scope (per the SCOPE rule above); anything failing the "name the consequence" test; anything in the do-not-raise categories; duplicates.
- **Keep:** only findings with a named consequence at the stated severity.
- **Semantic dismissals go to the human.** **The defender tags ownership, not the producer.** Every entry it routes to `## Human queue` is written `- [open] [<ownership>] …`, and the defender — already cold, already the one role allowed to judge these — assigns it: `user-only` (answering needs information **no material holds**, only the user), `recommended` (the machine can derive a defensible answer and the user is confirming taste or cost), `machine` (record hygiene with nothing to weigh). Two rules keep the tag honest, because the producer would otherwise be grading its own dismissal one level up — tagging a finding `machine` buries it in the "just say go" list as surely as dropping it:
- **`machine` is the defender's to give, never the producer's.** If no defender ran, the producer writes `[open] [user-only]` — **not** a bare `[open]` (`validate` demands an ownership tag on every `[open]` entry) and **not** an untagged line (it disappears from every count). Only a user ruling moves an entry down.
- **Retagging an existing untagged legacy entry also defaults to `user-only`.** That is the direction that surfaces rather than buries.

A drop **or downgrade** whose reason is semantic — "원문에서 직접 함의됨", "파생이라 무해", "다른 파일에 기록돼 있음" — is not the defender's to finalize: it goes to the state file's `## Human queue`, and only the user's ruling converts it to a do-not-raise. The verdict set is KEEP / DOWNGRADE / DROP, and at `strength: 1` a `critical`→`should-fix` downgrade removes the finding from the run as surely as a drop — routing only drops to the queue let the same semantic judgement escape through the other verdict.
- Returns the confirmed list + new do-not-raise additions + the human-queue entries.

**Never touch fidelity violations** (contradiction/unsupported/missing-required) — those are facts, not opinions. Triage applies only to verify findings and advisory findings.

## Round hand-off

Write the round's verdict to the state file:
- **verify (material):** material frontmatter update (`status: verified` on pass).
- **verify (truths):** `truths/verify.md` — T# verdict table + adjudications.
- **review:** `documents/<doc-id>/review.md` — fidelity violations + advisory findings + adjudications.

**This hand-off is a gate, not a suggestion:** the next round may not start until every finding of this round is classified `fixed` / `do-not-raise` (user-ruled where semantic) / `human-queue` and written to the state file. Append the triage's drops to `adjudications` and **condense them into do-not-raise categories** for the next round (so fresh reviewers don't re-find them — skipping this cost a real run four re-discovered findings in round 2). On approve/done, surviving adjudications stay in the state file for future re-reviews.

## Verify lenses — fixed order, first *N* per level

### Material (M1–M4)
1. **completeness-scanner** (M1) — every section, paragraph, table, data point in the original appears in converted.md. **Show the mapping**: original element → converted location. Missing content = FAIL.
2. **accuracy-checker** (M2) — every value (number, date, name, amount) matches exactly. Cross-check ALL structured data. Show the comparison. Misread value = FAIL.
3. **hallucination-hunter** (M3) — nothing in converted.md that isn't in the original. Trace each element back. Untraceable element = FAIL.
4. **reachability-auditor** (M4) — **only for `origin: research` materials** (skip otherwise; not a PARTIAL, mark `— (n/a)`). The machine chose the query and read the result, so nothing human stood between the world and the record: can a later reviewer reach the same source and get the same value? Check `url` + `retrieved_at` are present and specific; `source.md` holds the fetched values **as fetched** — raw units, raw timezone, before any conversion; every derived figure in converted.md traces to one of them (a UT→KST conversion must show both sides). A value that can only be re-*searched*, not re-*checked*, = FAIL. Without this lens the `origin: research` rule is a promise the round never keeps.

### Truths (T1–T5)
1. **claim-vs-quote** (T1) — the truth's claim accurately represents its verbatim quote. Claim drifts from its own quote = FAIL.
2. **extraction-auditor** (T2) — every load-bearing fact in converted.md became a truth, **including full-text artifacts** (lyrics, clauses, code/specs — metadata-only extraction of an artifact is an omission). Audit the material's `## m<id>` section in `truths/coverage.md` (element → truth ids, `skipped:` + reason) against converted.md: manifest completeness + skip legitimacy + mapping accuracy. No coverage section = PARTIAL, never PASS. Important omission or illegitimate skip = FAIL.
3. **atomicity-checker** (T3) — each truth is one fact (not two bundled). Bundled or distorted = FAIL.
4. **tag-auditor** (T4) — tags correct and sufficient for conflict detection. A mistagged truth hides from cross-checks = should-fix.
5. **consumer-reader** (T5) — **read the mine exactly as `.weavedoc/READ.md` tells a consumer to, and no other way.** Read-scope = everything READ.md points a consumer at, and only that: `bash .weavedoc/bin/weavedoc pull <tag>`, **the truth files pull points at** (rule 2), and **`truths/index.md` / `truths/tree.md` / `census`** (rule 5 — the entry points for finding things by tag), plus `project.md` `required_tags` so you know which topics a writer would pull. A reviewer barred from these would be *weaker* than a real consumer, and would judge a mine nobody actually reads. **Out of scope: materials, `source.*`, coverage, conversion history, how anything was produced.**

   Method — this is the PASS condition, so do it and show it: pick **the topics a writer would actually pull** (each `required_tag`, plus every entity named in a project-language tag), run `pull` on each, and for each one write *what a consumer would now believe*. A round of T5 with the pulls and the belief statements shown is a PASS even when it finds nothing; without them it is PARTIAL. There is no "compare against the truth" here — the finding is always **a gap between what the mine holds and what a protocol-following reader ends up with**:
   - a **guard that doesn't surface** — an "아직 정해지지 않았다" truth whose tags exclude the entities it guards, so `pull <entity>` returns two fixed values with the undecided span between them invisible and the reader interpolates (a real run: `pull 초아` gave 16세 and 17세 with no sign that the gap was undecided);
   - a **claim narrower than its own body** — `pull` lists claims, so a fact reachable only by opening the file is a fact most consumers never see;
   - a **superlative or ordering with no live basis** — the truths it rests on are `discarded`, but the sorted statement is still `ok`;
   - an **`as_of` window a consumer can't resolve** — a phase label no live truth defines, so the reader cannot tell when the value holds;
   - a **`discarded` truth whose winner pointer lands nowhere useful** — the successor exists but its claim doesn't carry the displaced value, so following the protocol still leaves the reader without it.

   Explicitly NOT T5's business (they need material access, and other lenses own them): whether a `> [machine-note]` points into superseded prose (M3/mirror), whether a claim matches its quote (T1), whether extraction was complete (T2). Naming one is fine; raising it as a T5 finding is not. A consumer who would state something false = FAIL; one who would merely be under-informed = should-fix.

### Pass rule
A check is **PASS only when a reviewer showed it** — pasted the mapping, quoted the comparison, traced the element. **"Looks fine" / "found nothing" is NOT a PASS** — that's exactly how a rubber-stamp waves an under-checked conversion through. An unshown check is **PARTIAL**, never PASS.

**A lens the level never ran is `— (level)`, not PARTIAL.** PARTIAL means "should have been shown and wasn't" and blocks; a lens outside the level was never owed. Without this distinction `light` (T1–T2) and `standard` (T1–T3) could never pass at all, since their tables would always carry PARTIAL rows for lenses nobody was asked to run.

## Review — fidelity gate lenses

The fidelity gate is **not** a cold persona review — it's a mechanical/exhaustive check. But for A0 (conflict re-hunt), cold reviewers add depth:

1. **conflict-hunter** (A0) — for every load-bearing claim in the draft, grep truths by matching tags and exhaustively cross-check structured facts (numbers, dates, names, obligations). This is the heaviest lens — spend the most effort here. A miss is a defect, not an accepted cost.
2. **grounding-checker** (A1) — every claim traces to a truth → material chain. Invalid or missing citation = finding.
3. **completeness-checker** (A2) — only when `config.fidelity.completeness: required`. Required elements from the plan + required_tags all present.

## Review — advisory panel lenses

Proposed by AI, edited by the user (advisory, so safe to drop any). Default set:
1. **logic** — connections hold, no leaps, argument flows.
2. **gap-finder** — thin/weak spots that aren't outright unsupported.
3. **reader-proxy** — clear and persuasive to the target reader.
4. **editor** — wording, concision, consistency.
5. **breaker** — try to break the argument; name the weakest claim.

Scale count from `config.review.scale`. `skip` skips the advisory panel entirely — **the fidelity gate still runs.**
