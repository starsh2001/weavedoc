# WeaveDoc — Artifact Formats (parser contract)

Single source of truth for WeaveDoc's file formats. **Field names, section headers, and enum values are fixed English** — skills and tooling parse them. **Prose** (titles, summaries, role names, document text) is written in the project's language (`config.language`). Don't restate these formats elsewhere; point here.

> **Machine source of truth:** the checkable lists (frontmatter fields · enums · sections) live in `.weavedoc/schema` and are enforced by `.weavedoc/bin/weavedoc validate`. This doc is the human-readable contract; if the two ever differ, `schema` (what `validate` reads) wins — edit it first.

> **Trust boundary (v0.3.2):** WeaveDoc trusts the repository author and the runtime. Digests provide **change binding** — they catch mistakes, drift, and tool-mediated laundering — not authorship authentication and not protection against a deliberate forger, who can compute a valid sha256 or hand-type a marker as easily as any tool can. What the machine warrants is therefore two-sided: it never certifies what it did not check, and **no support command may create an automatic downgrade path** (a migration, repair, or convenience flow that turns enforced state back into exempt state — the v0.3.1 seal-laundering was exactly this class). A user deliberately lying in their own repository is outside the warranty; a tool that launders for them is a defect.

Conventions:
- Frontmatter is YAML at the top of a markdown file.
- **Fill every placeholder.** The shipped templates write required values as `{a description in braces}`. A required field left holding one of those — a value that is *entirely* one brace group — is **rejected by `validate`**: it is an instruction, not a value, and consumers read it as one (a plan left with its placeholder `tone` had that sentence taken as the document's tone). Deliberately narrow: a value that merely *contains* braces is real content, and a list of placeholders (`tags: [{tag1}, {tag2}]`) opens with `[`, so neither is touched. If a value genuinely belongs in braces, put any character outside them. (Schema key: `fm.placeholder`.) The same principle applies to review entries — see the `Fidelity violations` section below.
- IDs are short, stable, and never encode anything that can change.
- A material's `converted.md` is the source of truth for that material; `catalog.md` is generated from all of them.

## project.md
Frontmatter:
- `version` — int.
- `language` — prose language for this project (e.g. `ko`, `en`); mirrors `config.language`.
- `roles` — list of this project's material roles (project-defined; values in the project language, e.g. `[근거, 참고, 내부]`). **AI assigns silently at gather** (appending new roles as it uses them); the user edits anytime. Roles earn a user question only at consumption — see `authority`.
- `tone` — optional; one line describing the writing tone (project language). May stay empty — each document's `plan` sets its own tone; fill only if the project has a standing tone.
- `authority` — optional list of `roles` ranked highest-first, for **mechanical** conflict resolution (e.g. `[법령, 계약서, 회의록]`). When two conflicting materials have ranked roles, the higher wins without asking. Omit/empty = no automatic role precedence. **Created lazily**: when `map` hits a conflict machine rules can't resolve and the two sources have different roles, it offers a standing precedence; the user's answer writes this field. (May also be set manually anytime.)
- `required_tags` — optional list of tags that **must** have at least one truth. A required tag with zero truths is a `missing-required` fidelity violation. (e.g. `[범위, 일정, 대금, 품질]`). AI proposes from materials; user edits.

Body: free description of the project's character and intent (project language).

## materials/&lt;id&gt;/converted.md
Frontmatter:
- `id` — `m<NNN>`, stable, equals the folder name. Never encodes role/topic. **Zero-padded to at least three digits** (`m001`, `m042`, `m1000`): one number has exactly one spelling, because `m5` and `m005` resolve to the same id and a mine holding both makes every reference to it ambiguous. `validate` rejects any other spelling.
- `title` — human-readable name (project language); shown in citations.
- `origin` — enum: `file` | `user-answer` | `prior-doc` | `conversation` | `research`. Mechanical provenance — **where the material came from**, the acquisition-level counterpart to a truth's `provenance` (who authored the value).
  - `research` — **the machine went and got it** (web search, a fetched table, an external dataset). No human stood between the world and the record, so the material must stay re-reachable: `url` and `retrieved_at` are **required** (`validate` enforces), `source.md` holds the fetched values *as fetched* — raw units and timezone, before any conversion — and every derived figure in the body traces to one of them. A real run filed searched astronomical data as `user-answer` because no other origin fit; the whole age table then rested on values a cold reviewer could only re-check by searching again. Verified at `full`, always.
- `url` — required when `origin: research`. Where the value was fetched from. Several sources → the primary one, the rest in `source.md`.
- `retrieved_at` — required when `origin: research`. Date `YYYY-MM-DD`. External sources change; a value with no retrieval date cannot be re-checked, only re-fetched.
- `corrects` — optional list of `m<id>` references, each optionally naming a section (`[m011 §4]`). **This material displaces named parts of earlier ones.** Two things follow, both hand-done and both dropped in a real run: `map` attaches the resolution `scope` from these references instead of inferring it, and the mirror is *known* to be a correction rather than a new setting — a consumer reading only the body could otherwise not tell (it reached the Human queue as an open item). `validate` checks each id resolves and that nothing corrects itself.
- `role` — one value from `project.md` `roles` (project language).
- `topics` — list of free topic tags (project language).
- `format` — original format (e.g. `pdf`, `docx`, `xlsx`, `image`, `md`).
- `source_path` — where the original came from, **as of before intake**. For `file`: the path the item was dropped at, recorded **pre-move** (intake MOVES inbox files, so this field is the only surviving record of where it arrived — and it is the value gather's duplicate check compares; the post-move location is always `materials/<id>/source.<ext>` and never goes here). For an outside source: the external path it was copied from. For origins with no filesystem original (`conversation` / `user-answer` / `prior-doc`): the non-path handle instead — session date, the question it answered, or the source document id. For `research`: the primary `url` already carries this; repeat it here.
- `added` — date `YYYY-MM-DD`. **When it entered the mine**, not when the source was written. Batch intake gives every material the same `added`, so it can never order two sources — do not use it for `supersedes`.
- `dated` — optional date `YYYY-MM-DD`: **the source's own date** (the contract's signing date, the minutes' meeting date, the spec's revision date), taken from the source itself. This is the ONE field a `supersedes` resolution may order materials by. Absent = the mine does not know when this source was written, and `map` must therefore **not** resolve mechanically by date — it asks (see the resolution cascade). A real risk this closes: with only `added` available, one reader asked the user and another read dates out of the bodies and auto-resolved, and the two produced **opposite winners** on the same mine.
- `status` — enum: `collected` | `converted` | `verified` | `used` | `retracted`. `verified` = passed cold verification (conversion fidelity confirmed). `used` = a consecrated document cited it (stamped by `refine`) — lifecycle, **not** a verification verdict: the stamp overwrites `verified`, so `scope` counts a used-but-unverified material as still owed. `retracted` = withdrawn by the user (set by `gather`'s retraction flow) — the material grounds nothing from then on: its live truths go `unsupported`, resolutions it won re-open (map propagates; `validate` enforces both), but the folder and files stay as audit trail — **never deleted**.
- `summary` — 2–3 line AI summary (project language).
- `stage` — optional enum: `plan` | `applied`. Set when the source is clearly a plan/proposal (계획서·기획 문서·프롬프트 초안) vs a record of what was actually applied/executed. Truths extracted from a `plan` material carry an implicit "실행 확인 안 됨" caveat — a plan entry is never evidence something was used (a real run mislabeled never-used plan content as a "구버전", implying prior use).

Body: the material converted to readable markdown (project language). **The body is a mirror of the source — nothing added.** No derived tables/aggregates, no sort-order/superlative statements, no cross-material commentary, no invented rationale. Two marked exception line types (both excluded from mirror/M3 checks, both barred from stating new facts):
- `> [note] …` — handling guidance genuinely needed but not in the source (e.g. "값은 SUNO에 요청한 값이며 실측 아님").
- `> [machine-note] …` — machine framing recorded inside a conversation/user-answer material (an anchor, a normalization). Never promoted into a truth claim.

## catalog.md (generated)
A table indexing all materials, columns: `id`, `title`, `role`, `origin`, `status`. Regenerated from material frontmatter; not hand-edited.

## truths/&lt;id&gt;.md
Each truth is an atomic, citable fact extracted from a material. One file per truth, flat in `truths/`. The `map` skill creates these; the AI re-derives inter-truth relationships (supports, contradicts, supersedes) on the fly by reading relevant truths — no persistent edge store.

Frontmatter:
- `id` — `t<NNN>`, stable, auto-incremented. Equals the filename (without `.md`). **Zero-padded to at least three digits** (`t001`, `t042`, `t1000`) — one number, one spelling. Two spellings of one number (`t5.md` and `t005.md`) collapse into a single entry in the reciprocity, winner and retracted tables, so a check reads one file while reporting the other; `validate` rejects a non-canonical filename. References *to* an id stay lenient — `conflict_with: [t5]` resolves to `t005.md` — precisely because the filename rule leaves only one file it can mean.
- `claim` — one-sentence statement of the fact (project language).
- `source` — material id this truth was extracted from (e.g. `m001`).
- `location` — where in the source (e.g. `§4, 1문단`). Project language.
- `tags` — list of topic tags (project language). N:N — a truth can have multiple tags. Tags are the primary lookup mechanism: AI greps by tag to find related truths.
- `status` — enum: `ok` | `conflict` | `unsupported` | `discarded` | `retracted`. **The validity axis — "can this value be used right now":** `ok` = usable (it may carry a `resolution` as *history*: it won a conflict, or both sides were attribute-authorized). `conflict` = unusable — contradicts another truth, unresolved (blocking; set by `map` conflict detection or `review` A0 re-hunt). `unsupported` = unusable — grounding gone (source removed/retracted). `discarded` = unusable — **lost a conflict resolution and is no longer a truth of this mine**; the file stays on disk as audit trail (same shape as a retracted material: present for audit, ontologically out), and its `resolution` records the decision and the successor. Conflict *history* lives in `resolution`, never in `status`.
  - `retracted` = **this was never a valid extraction** — the quote is in no material at all, or a machine note was promoted into a claim. Distinct from `discarded`, which lost a fair fight: a retracted truth had no standing to begin with, so it carries **no `resolution`** (there was no conflict) and the withdrawal reason goes in `changelog.md` as a `removed:` line, which **`validate` requires** — otherwise this would be the one unusable status with no obligation attached and no quote seal, i.e. a cheaper way to make an inconvenient truth vanish than resolving it. For the same reason `validate` blocks retracting one side of an open `conflict` while the other side still points at it: that would strand the survivor as permanently unusable with no decision on record. **Not for a misdesignated source** — if the quote is verbatim and the fact real but `source` names the wrong material, repoint the field (`map`); retracting it would tell consumers through `READ.md` that the fact isn't in the mine, which is false. **The file stays** — deleting it outright is what a real run did to `t241`, and `census` then asked "t083 t211 t241 — confirm which" on every run forever, with no way to answer. Quote-existence is not re-asserted on a tombstone (that check is what condemned it). Excluded from `live` and reported separately by `census`, so re-extracting the fact correctly never produces a duplicate finding no one can close.
- `provenance` — optional enum (default `stated`): **who authored the value.**
  - `stated` — the fact is in the material as the user/source stated it.
  - `adopted` — the value originated as a **machine proposal the user adopted**, or was **machine-fetched from an `origin: research` material and accepted**; the adoption exchange must be visible in the source material. (A real run recorded a machine-proposed 158cm in the exact same shape as user-supplied values — this field is what keeps "기계는 조용히 고르지 않는다" true at the *record* level, not just in chat.) **A truth whose source is `origin: research` may not be `stated`** — nobody stated a value the machine went and got, and since `stated` is the default, silence would land there and undo at the truth level exactly what `origin: research` stops at the material level. `validate` enforces it.
  - `derived` — the machine computed/interpreted it from other facts. Requires `derived_from`; `validate` enforces this.
  `adopted` + `derived` form the **priority re-verify set** and are highlighted in the human-confirmation delta.
- `derived_from` — required when `provenance: derived`. List of truth/material ids the derivation used.
- `assumptions` — list of premises the derivation rests on that appear in **no material** (e.g. `[세는나이 고1=17]`). Every unstated anchor goes here — an empty list means the derivation uses stated facts only.
- `as_of` — the phase/date at which a **time-varying** claim (나이·학년·소속·상태) is true (e.g. `First Light (Phase 1)`). In a phase-structured project a time-varying claim without `as_of` is an extraction error — the "데뷔 시점 18/18/16/19" incident was two phases collapsed under one label, impossible to write with `as_of` present.
- `corroborated_by` — optional list of material ids that independently confirm this truth (recorded by `map`'s duplicate check instead of creating a duplicate truth; chat-only corroboration is lost when the session ends). **Citing the agreement**: there is no separate marker for corroboration — the citable handle is the truth id itself. A document that wants to say "two sources agree" cites the truth (`<!-- t:<id> -->`) and names the corroborating materials in its visible citation (e.g. `(출처: 계약서 초안 · 킥오프 회의록)`); the truth's `corroborated_by` is the record that backs that sentence, and the gate accepts it because the claim is the cited truth's claim. Writing "m003도 동의한다" as a *separate uncited assertion* is what the gate correctly rejects as unsupported.
- `resolution` — the decision record of a settled conflict, present on **every party**: the loser (`status: discarded`, winner elsewhere), the winner (`status: ok`, winner: its own id), and both sides of an authorized attribution (`status: ok`, `type: attribute`). Object with:
  - `type` — enum: `supersedes` | `authority` | `pick` | `value` | `attribute`. `supersedes`/`authority` = machine-resolved (`authority` is `decided_by: user` on the one conflict that *established* the ranking). `pick`/`value`/`attribute` = user-resolved.
  - `winner` — id of the winning truth (for `supersedes`/`authority`/`pick`), or id of a new material (for `value`). **May be a list** when different fields were superseded by different sources.
  - `decided_by` — enum: `machine` | `user`.
  - `decision_kind` — optional enum, refines `decided_by: user`: `supplied` (the user provided the value) | `ratified` (the user accepted a machine-originated proposal). `ratified` resolutions join the priority re-verify set. **Standing precedence (lazy `authority`) is `ratified`** (ruled 2026-08-01): there the machine originates the *mechanism* (it offers the role ranking) and the user originates the *ranking*, while the winning value itself is neither supplied nor proposed by anyone — so `supplied` is false, and the choice is not decoration: `ratified` puts the resolution in the priority re-verify set, which is right, because a rule the user set once now decides conflicts they never see.
  - `scope` — optional list naming **exactly which fields** were displaced (partial supersede of a record truth, e.g. `[키, 나이]`). The index shows the `[discarded]` marker; the scope detail lives in the truth file, telling readers which fields of the record remain valid. Prefer avoiding the need entirely: extract attribute tables **row by row** so one wrong cell never buries five valid ones.
  - `reason` — free text explanation (project language).
- `superseded` — on a **winner**: the list of truth ids it has beaten (`[t003, t005]`). `resolution` is a single object holding one decision, so a truth that wins twice had nowhere to record the second — the mine would say one truth lost and nobody won, and the only workaround was burying the id in free-text `reason`. Maintained by hand alongside the loser's `resolution`; `validate` checks that every id listed here resolves.
- `conflict_with` — present only when `status` is `conflict`. List of truth ids this truth conflicts with.

Complete `resolution` examples (copy the shape, don't re-derive it):

```yaml
# user picked between two sources
resolution: {type: pick, winner: t184, decided_by: user, decision_kind: supplied, reason: 실제 발매 순서는 스크린샷(m005) 기준}
# a correction material superseded specific fields of a record truth
resolution: {type: value, winner: [m011, m013], decided_by: user, decision_kind: supplied, scope: [키, 나이], reason: 키 165→171(t197)·나이→페이즈별 병기(t204). 본명·포지션·컬러·이니셜은 유효}
```

Body: verbatim quote from the source material pinning the exact claim — **copy-pasted, never paraphrased** (`validate` substring-checks it against the source). For **full-text artifact truths** (가사 전문, 계약 조항, 코드 스니펫 — content whose exact wording is itself the fact), the body is the complete artifact text and the claim states what it is.

## truths/tree.md (generated)
A tag-grouped view of all truths for dashboard consumption. Format: one `## <tag>` heading per tag, listing truth ids + claims + status underneath — each entry carries the same **consumer labels** as `pull` after a ` ··` separator (see index.md below). **Regenerated only by `weavedoc reindex`** — never hand-edited (hand edits in a real run consumed ~45% of the tool calls and corrupted an entry). Run `reindex` whenever truths change.

## truths/index.md (generated)
A flat one-line-per-truth index for quick AI scanning. Format: `- <id>: <claim> [<source>] — [<tag1>, <tag2>] [<status>] ··<labels>` (status marker only when ≠ `ok`; the ` ··<labels>` tail only when labels apply). The labels are **the same set `pull` prints** — `(as_of: …)`, `[DERIVED — …]`, `[ADOPTED — …]`, `[PLAN-STAGE SOURCE — never evidence of use]`, `[RETRACTED SOURCE]` — produced by one shared function, because a truth whose fact depends on the entry path a consumer took is the defect this closed (field report D1: a plan-stage album spec read as a release fact via tree.md). ` ··` is the label separator: `pull` strips the tail before term-matching, so label prose is output, never search text (and `reindex` rewrites a literal `··` inside a claim as `· ·`). **Regenerated only by `weavedoc reindex`**; `validate` fails when it drifts from the truth files. AI reads this file first to identify relevant truths by tag before opening individual files. Mines indexed by an older bundle simply lack the label tail — one `reindex` adds it.

## truths/coverage.md (extraction coverage manifest)
Written by `map` alongside extraction — hand-written judgment content, **not** `reindex`-generated. One `## m<id>` section per mapped material (the id may be followed by the title): every fact-bearing element of that material's converted.md, at section/table/paragraph granularity, mapped to the truths extracted from it — or explicitly skipped with a reason. This is **T2's audit surface**: extraction completeness stops being an open "빠짐없이 뽑았나?" and becomes a checkable ledger (the same show-the-mapping rule M1 applies to conversion).

```
## m001 EClYpSE 프로젝트 인계 문서
- §1 개요 → t001, t002
- §2 멤버 표 → t003, t004, t005, t006, t007 (행별 추출)
- §3 연혁 → t008, t009
- skipped: §4 감사의 말 — 인사말, fact 없음
```

Rules: truth ids are listed **explicitly, never as a range** (`t003–t007` fails the mechanical check — only t003/t007 are textually present). A `skipped:` line without a reason is an omission. `validate` cross-checks mechanically: every `## m<id>` resolves to a material, every mentioned truth id exists, and **every truth extracted from a sectioned material appears in that section** (adding a truth without updating coverage fails). Materials without a section are legal (legacy — coverage arrives on their next map); T2 treats a missing section as PARTIAL, never PASS.

`## legacy` (`coverage.section.optional`) — the exemption section. **Optional**, unlike every `*.sections` key in the schema, which lists *required* sections — hence the different key name: a coverage.md with no exemptions is perfectly normal, and a required-section check applied here would fail every clean project. Materials mapped before coverage existed will never gain a section on their own (nothing re-maps a settled material), so without an exemption the ratio is permanently short and a metric that can't reach its target stops being read. Entry format — the leading id is the machine-read part, and the ruling must be **attributable**:
```
- m001 — coverage 도입 이전에 map된 자료. — ruled: 2026-07-29 "m001은 그냥 면제로 두자"
```
`validate` requires `ruled: <YYYY-MM-DD>` plus a quoted utterance on every entry, the same bar `questions.md` sets for `answered`. Without it one line of machine-written prose both shrinks the coverage denominator *and* trips T2's legacy escape — an unattributed line switching off a metric and a cold lens at once. Ids mentioned inside the prose are ignored on purpose, so the reason can be written naturally. `census` subtracts the listed ids from the denominator and **always shows the raw total too**: `coverage records 16/16 of 26 material(s) (10 legacy-exempt)`. **`coverage records` is a ledger count, not a completeness warranty** (ruled 2026-07-31): it counts materials holding at least one line in this file, so one recorded element out of fifty still counts the material. Whether extraction is *complete* is a separate axis — `weavedoc-gaps` (enumeration/symmetry) and the truths verify lane own it. Reading this ratio as "63% of the sources are extracted" is the misreading the `records` label exists to prevent. Without the `of 26`, a reader comparing an old report's `16/26` to a new `16/16` sees progress that never happened. The ruling is the user's, never the machine's — the same legacy escape T2 already allows, made visible in the number instead of buried in an adjudication.

## truths/changelog.md (append-only run log)
Appended by `map`, and by `verify` when it edits truths — one block per run. **This is the surface the human-confirmation step renders**: without it, "이번에 뭐가 어떻게 바뀌었나" cannot be reviewed and the only possible question degrades to the banned "추출된 진실이 정확합니까?".

```
## 2026-07-24 map
- added: t190 [stated] 은지의 본명은 권은지다
- added: t217 [derived] 학년↔나이 환산은 세는나이 고1=17 앵커 (가정: 자료에 없음)
- superseded: t027 → m011+m013 (scope: 키·나이)
- edited: t133 (resolution.reason — "유일 기록" 표현을 계획본 표기로 정정)
- confirmed: 2026-07-24 (blanket)
```

Line kinds (`changelog.line.kinds`): `added:` (id + `[provenance]` + one-line claim), `superseded:` (old id → winner, scope), `edited:` (id + what changed), `removed:` (id + why it was withdrawn — the deletion record; `census` reads these to tell a settled numbering hole from an unexplained one, so a withdrawal recorded here stops being re-flagged forever), `confirmed:` (appended after the human reviews the delta — `blanket` = 일괄 통과, `itemized` = 항목별 확인; **a dated marker only** — `confirmed: (대기)` is a placeholder, and what is still awaiting confirmation is every block after the last *dated* one).

The confirmation step renders every block since the last `confirmed:` marker, so the `## YYYY-MM-DD <skill>` header is load-bearing, not decoration: it is what bounds "what changed since you last looked".

## truths/verify.md (verify state)
Written by `weavedoc-verify` (truths mode). Records the verification state of the truth set.

Frontmatter:
- `status` — enum: `passed` | `failed` | `escalated` | `stale` | `in-progress`. `passed` is written **only** when `consecutive_passes` reached `config.verify.repeat` — a clean round that leaves the count short is `in-progress`, not `passed`, because one clean round is evidence about that round and not about the target. `failed` = the last round found blocking findings. `escalated` = `max_rounds` exhausted with the count still short. `stale` = new truths added since the last pass; re-run needed.
- `round` — int, last round number.
- `consecutive_passes` — int, optional (absent = 0). Clean rounds **in a row** so far. +1 on a clean round; back to **0** on any failing round *and* on a moved baseline (the step-0 pin). Written after every round so a cold session resumes the loop instead of restarting it.
- `verified_at` — date `YYYY-MM-DD`.

Body:
- the T# verdict table (T1–T5, each **PASS / PARTIAL / FAIL / `— (level)`** with evidence). `PARTIAL` = the round owed this check and didn't show it (blocks like a should-fix); **`— (level)` = the level never ran that lens** (`light` runs T1–T2, `standard` T1–T3, `full` T1–T5) and is not a defect — without that distinction `light` and `standard` could never pass. The material axis uses the same convention over M1–M4, plus `— (n/a)` for M4 on a non-`research` material. T5 reads the mine the way `READ.md` tells a consumer to and no other way (READ.md + `weavedoc pull` + the truth files pull points at + the consumer entry points READ.md rule 5 names (`truths/index.md`, `truths/tree.md`, `census`) + `project.md` `required_tags` (it is what tells you which topics to pull). NOT materials, NOT `source.*`, NOT coverage, NOT conversion history), so it is the one lens whose absence never surfaces as a contradiction;
- `## Verified units` — per material / truth-cluster: last verified round + date + the standard it met (`passes 2/2`). Recording the standard matters when `repeat` is raised later — units that cleared the older, lower bar stay visible instead of silently inheriting the new one. **Anything created or changed after a pass is `stale` for that unit** — a global `passed` never covers units born after it (a real run let an unverified correction ride into a "passed" mine). Summaries always show the unverified count ("자료 16 중 verified 15 · 미검증 1").

  **Layout is free; the verdict is not.** Write the section as a table or as bullets — both are read. What every entry must do is **end with the verdict word** `schema: verify.units.verified` (`verified`), because that is the only thing a machine can read across both shapes: `- m001 · t001 — R1 2026-07-30 · passes 2/2 · verified`, or a table row whose last cell is `verified`. `weavedoc scope` reads exactly this **plus the digest sidecar below** (a digest-less markdown entry reads as `legacy-unbound`), and it counts an entry ending in anything else — a failed unit (`**미통과**`), an unrun axis (`R3 미실행`), or a legacy note with no verdict at all — as **covering nothing**, then names that entry so a missing word is visible instead of looking like a ledger that just hadn't got there yet. A plain substring test would be wrong in the other direction: `unverified` contains `verified`.
- `truths/verify-ledger.tsv` — **machine-owned verification sidecar** (WD-COR-003), written only by `weavedoc attest <verified|failed> <round> <standard> <id...>`, never by hand. Append-only TSV (`id · sha256 · verdict · round · standard · date`; `#` lines are comments); the **LAST row per id wins**, so re-verification is an append and the round history stays. The digest pins the exact bytes verified: a truth's digest covers its **whole file, raw bytes**; a material's digest covers `converted.md` **minus its frontmatter `status:` line** — `status` is the lifecycle axis (`refine` stamps `used` at consecration), and a lifecycle stamp must not invalidate a verification. Every reader consumes the ledger through **one strict structural parser** (v0.3.3): exactly six columns, digest 64-hex or `-`, round integer or `-`, non-empty standard, real-calendar date — a row that fails it covers nothing in `scope` (named, never absorbed) and blocks in `validate`, never one without the other. `weavedoc scope` reads this ledger first: digest match = **verified (digest-bound)** · mismatch = **stale** · `failed` verdict = **failed**, each per unit, mechanically — a manual edit, an agent slip, and a normal re-map all look identical to the digest. A v1 record with **no** sidecar row — a material's own `status: verified`, or a markdown `## Verified units` row — is **`legacy-unbound`**: preserved verification history that binds no bytes, never deleted and never counted digest-bound. Migration-minted legacy rows carry an **origin token** in the standard column (v0.3.2): `v1-truths-ledger` for t-ids materialized from `## Verified units`, `v1-material-frontmatter` for materials materialized from their own `status: verified` — an m-id mention in `## Verified units` is extraction scope, not a conversion verdict (WD-COR-001), and mints nothing. The reader rule is deliberately asymmetric: an m-id legacy row counts as material evidence **only** with the material origin token (an origin-less m row is a pre-0.3.2 cross-lane mint — `scope` names it, ignores it, and the material falls back to its own frontmatter), while t-id rows accept `-` too, because the truths lane was always the right lane and every 0.3.1 t row is correct history. Tombstones (`retracted`/`discarded`) are outside the verification population: `attest` refuses them and `scope` does not owe them. `attest` also mirrors a readable line into `## Verified units` (verified verdicts only), so the markdown stays the human view while the sidecar is the machine's source of truth.
- `## Human queue` — reviewer findings the machine wanted to dismiss on **semantic** grounds ("원문에서 함의됨" / "파생이라 무해" / "다른 파일에 기록됨"). Semantic dismissal is the user's call, not the machine's: an entry leaves this queue only by user ruling (→ then it may become do-not-raise). A real run self-dismissed the same reviewer finding twice; it was the one error the user later corrected.

  **Does an open entry block consecration? No — but the machine may not pass it silently** (ruled 2026-08-01; before this, no document said either way and two users decided differently whether the document ships at all). The fidelity gate is the *only* blocking membrane, and this queue is on the advisory side, so an open entry does not fail `validate` and does not stop `final.md`. What it does stop is the machine deciding alone: **`refine` must list every open entry to the user at the consecration step and get an explicit go-ahead** — consecrating over an unread queue is precisely the semantic judgement the queue exists to intercept, just made one level up. Machine offers, human decides. The go-ahead is **recorded**: an HTML comment under `# Human queue` holding the date, the entries covered and the user’s words — a later cold auditor must be able to see the interception happened.

  Entry format — **two fixed English tags, then prose in the project language**:
  `- [<state>] [<ownership>] <where> — <what the machine wanted to dismiss + its reason> — <what breaks if the dismissal is wrong>`
  - `state` (`humanqueue.enum.state`) — `open` | `ruled`. A `ruled` entry records the user's utterance with it, like `questions.md`.
  - `ownership` (`humanqueue.enum.ownership`) — **whose decision this actually is**, assigned by the **cold defender** when the entry is written (not by the producer, and not when the user asks). The test is *what the answer requires*, not whether a recommendation is possible — the machine can nearly always produce some recommendation, so "추천이 가능한가"로 가르면 `user-only`이 구조적으로 비고 이 축이 정확히 드러내려던 항목이 사라진다:
    - `user-only` — answering needs information **no material holds**: a fact, an intent, or a preference only the user has (은지의 자퇴 시점). A recommendation about *form* doesn't move it out of this bucket.
    - `recommended` — the machine can derive a defensible answer from the mine; the user is confirming taste or accepting a cost.
    - `machine` — record hygiene with nothing to weigh; the user says "해줘" and it's done.
    Items needing **work rather than a decision** — a `fact` finding, or something no one can judge without material access — do not enter this queue at all: facts route to `map`, unjudgeable checks are a verify PARTIAL. Forcing them into a bucket mislabels them.
    **The producer may not tag `machine`.** A finding reaches this queue only because the machine wanted to dismiss it and wasn't allowed to; letting that same machine mark it "nothing to weigh" revives the dismissal one level up, where the confirmation step renders it as a compact "just say go" list the user skims. Retagging an entry that arrived untagged defaults to `user-only` — the direction that surfaces rather than buries.

  The tags exist because a flat queue hands the triage back to the human. A real run accumulated eleven entries and reported them as one list; the user had to ask *"내가 결정해야하는걸 구체적으로 말해줘"* to get the split — and the split was **1 `user-only` / 3 `recommended` / 7 `machine`**, all of which the machine already knew when it wrote each entry. `validate` enforces the ownership tag on every `[open]` entry (a `ruled` entry is closed and nothing reads its ownership) (untagged legacy entries are reported by `weavedoc status` instead of hard-failing an already-verified mine); `weavedoc status` prints the open queue split so a completeness line can never read "열린 갭 0 · 열린 질문 0" while eleven decisions sit waiting.
- `## Adjudications` — do-not-raise categories for future rounds. Only user-ruled entries land here.

## documents/&lt;doc-id&gt;/
- `plan.md` — frontmatter: `doc_id`, `doc_type` (project language), `tone`, `status` (enum: `planned` | `drafting` | `reviewing` | `done` | `stale`), `continues` (list of prior `doc-id`s, for series), `cited_truths` (list of truth ids cited in the draft/final — generated by `write`/`refine`, used for change propagation), `scope_tags` (list of tags this document covers — collected by `plan` from the section notes' `tags` fields; used to detect staleness from NEW truths added to the mine). Body: the outline — one heading per section, each with a note `<!-- purpose / tags: truth tags the section draws on / required|optional -->`. The note's `tags` use the **truth-tag vocabulary** (`truths/*.md` `tags:`), not material role·topics — `scope_tags` is harvested from these notes and staleness compares it against new truths' tags, so a note written in the material vocabulary silently disables the trigger.
- **Single-file output:** `draft.md` — the working draft, improved in place across review rounds. `final.md` — the finished document.
- **Multi-file output:** `draft/` directory containing individual page files (e.g. `draft/index.md`, `draft/yuna.md`, `draft/phase-1.md`). `final/` directory with the same structure. The plan's page list determines which files exist; `write` creates them; `review` checks each; `refine` updates them. File naming follows the plan's naming convention (typically kebab-case).
- **Citation markers (both modes):** Claims carry **inline truth citations** using the marker `<!-- t:<id> -->` immediately after the sentence (e.g. `세하는 17세이다.<!-- t:t006 -->`). The marker is invisible in rendered markdown but machine-parseable. Each citation also shows a source label for human readers: `(출처: <label>)` or footnote-style `[^m001]` with matching definitions — the inline `<!-- t:... -->` marker is the machine-readable part; the visible citation is the human-readable part. **The two halves are independent, and only the marker is the gate's input.** The label defaults to the material's `title`, which is right for an internal document; for an external audience it may be a **publication label** instead (ruled 2026-08-01), because material titles are internal names — a customer-facing memo citing "Support Runbook (excerpt)" or literally "user answer" leaks the mine's shape, and before this ruling the format left no legal way out: dropping the visible half broke the documented human-readable requirement, keeping it shipped internal names. `plan` already elicits the **audience** (`plan:37`); when it is external, `plan.md` records the label each cited material carries in this document, and `write`/`refine` use those. Relabelling never touches `<!-- t:<id> -->`, so fidelity checking, `cited_truths` and propagation are unaffected — what changes is only what a reader sees. A label may not misattribute: it names the same source in publishable words, never a different one. `write` and `refine` update `plan.md`'s `cited_truths` from these markers after each pass (scanning all draft files in multi-file mode).
- `review.md` — optional frontmatter `round` + `consecutive_passes` (the advisory loop's state; absent = 0 — `refine` reads these to resume the loop instead of restarting it), plus the **seal fields** `reviewed_kind` + `reviewed_digest` + `review_context_digest`, written by `weavedoc seal-review <doc-id> [draft|final]` and never by hand: they pin **which bytes** the round reviewed (single file = raw-bytes sha256; `draft/`·`final/` tree = sorted-relpath `path\0sha256\n` manifest, re-hashed) and **the ground** the verdict rests on (cited truths · their source materials via the status-excluded material digest, so the later `used` stamp cannot stale the review it consecrated under · config · schema). `validate` hard-fails a final whose bytes or context differ from its sealed review; a digest-less review next to a final reads as **legacy-unbound** — counted and shown (`review seals:` line), non-blocking until schema v2. A migrated v1 review carries `review_legacy: <date>` instead of seals — upgrade writes it, and it is what lets a v2 mine distinguish v1 history (legacy-unbound, non-blocking) from a tampered review whose seals were stripped (`GATE-UNSEALED`, blocking). The seal is an **all-or-none tuple**: any strict subset — a missing `reviewed_kind`, a stripped context digest, a stray seal field without the digest — blocks as `GATE-UNSEALED` on a schema-2 mine, because each missing member disables exactly one check while the others keep the green light credible. And the marker's lifetime ends at the next seal: `seal-review` **removes** `review_legacy` when it seals (a freshly sealed review is not v1 history), so a marker sitting next to a seal is a parked demotion path and blocks as `GATE-SEAL-MARKER`. These **structural** invariants (tuple completeness, kind enum, marker coexistence) hold for any review — draft stage included (v0.3.3); byte and context *enforcement* applies next to a consecrated output, where the verdict ships, so editing a draft under an old seal between rounds stays the normal refine loop. `upgrade` writes the marker only while a version-1 record is still present — it refuses a schema-2 mine outright, which is what closed the laundering path (strip the seals, run `--apply`, read as history) — and a v0.1 review with no frontmatter at all gets a fresh block prepended so such a mine stays migratable. `weavedoc consecrate <doc-id>` is the mechanized write path to final: gate emptiness re-checked with the same reader, seal + draft + context verified, candidate staged on the same filesystem, **one** full validation with the candidate in place (the exemption for the doc's own in-flight artifacts is a **function argument** — never a variable, which the environment can inject), atomic promote — a validation failure or an interrupt (INT/TERM) restores the original final. A hard kill can run no restore, so consecrate writes a durable `.consecrate.inflight` marker **before its first final mutation** (creation is exclusive — concurrent runs cannot both hold the transaction) and removes it **last, and only behind a verified postcondition**: if a restore comes up incomplete the marker stays. While the marker or the `.final.bak` backup exists, both `validate` (`CONSEC-INTERRUPTED`) and `consecrate` refuse until a human resolves the leftover — recovery is **compare-first** (byte-compare final against the reviewed draft: identical → staged candidate, safe to remove; different → your original, keep it; absent with a backup present → restore it), because a crash before the swap leaves the *original* at final. The marker is written first but not fsynced — power-loss protection is only as good as the filesystem's write ordering; process-level kills are fully covered. Then four level-1 sections. **`Fidelity violations`** (the mandatory gate): `- [<kind>] <where> — <what>`, `kind` enum: `contradiction` | `unsupported` | `missing-required`. NOT editable, NOT triaged-down, NOT adjudicated away; any open entry blocks `final.md`/`final/` and consecration. **The zone rule (ruled 2026-08-01): a kind in brackets lives ONLY inside this section.** Anywhere else in review.md — other sections, prose, any heading, any line shape — a bracketed kind is blocked by `validate`, because the bracket is the signature of a gate-actionable entry and outside the gate's zone that signature is either a parked violation or a mislabelled record. Records and mentions ABOUT violations (adjudications, findings prose, Human-queue entries) write the kind **without brackets**: `- fixed: contradiction — …`. Archived history goes in an HTML comment with its closing `-->` on its own line. The rule is shape-free on purpose — no way of dressing the line (bullet, number, quote, emphasis, checkbox, table) changes the verdict, which is what ended three rounds of shape-by-shape bypasses. **The comparison is normalised**: bracket interiors are folded to lowercase alphanumerics before matching, so `[Missing-Required]`, `[missing required]`, `[missing_required]` and a token split by an invisible character are all one token — spelling variants cannot become new bypasses. **And the vocabulary is closed**: kinds are these three fixed English tokens, period. A bracketed word outside them (`[모순]`, an ad-hoc label) is prose wearing brackets — the machine does not chase human wording (the same ruling that left claim-vs-body checking to humans), and inside the gate's own section such lines still fail closed (any non-placeholder bracketed line there is an entry). A review entry whose kind slot still holds the template placeholder but whose remainder is written out is treated as a real entry, not an untouched template — the remainder decides. **`Findings`** (advisory persona pass): `- [<severity>] <where> — <what + why>`, `severity` enum: `critical` | `should-fix` | `nice-to-have`. Plus an `adjudications` block recording fixed/dropped/accepted *advisory* findings (`- fixed|dropped|accepted: <finding> — <reason>` — `fixed` is history, the other two are suppressions) so re-reviews don't re-raise them, and a **`Human queue`** section with the same entry format and ownership rules as `truths/verify.md`'s — the advisory triage can dismiss a finding on semantic grounds too, and a dismissal the machine isn't allowed to make needs a legal place to sit on this side of the pipeline as well.
- `final.md` (single-file) or `final/` (multi-file) — the finished document. Written only when the fidelity gate is clean (zero open fidelity violations). Re-enters as an `origin: prior-doc` material for later documents — the gate is the membrane that keeps the growing material set free of contradictions.

## Truth → document propagation (change tracking)

When the data mine changes, documents drawn from it may become inconsistent. Two propagation triggers:

### Trigger A — truth changed (claim/status edit)

A truth's `claim` is edited, its `status` changes to `conflict`, or a settled resolution is re-opened (the `ok` winner set back to `conflict`).

1. **Detection.** `weavedoc-map` (step 6) detects truth changes. For each changed truth id, it greps `documents/*/plan.md` frontmatter for `cited_truths` entries matching that id.
2. **Staleness.** Any document whose `cited_truths` includes the changed truth gets its `plan.md` `status` set to `stale`.
3. **Recovery.** Re-run `weavedoc-review` on the draft (re-checks cited truths), then `refine` if needed, then re-consecrate. Note a documented cost: fixing a `contradiction` violation routes through `map` (the resolution lives in the truth), which changes a cited truth and stales the very document being refined — one extra review round per conflict fixed. That is the bias-to-stale working as designed (the value DID change); it is priced here so nobody reads it as a malfunction.

### Trigger B — new truth added to the mine

A new truth is extracted from a new or updated material. Existing documents don't cite it (it didn't exist), but it may affect their completeness or contradict their content.

1. **Detection.** `weavedoc-map` (step 6), after extracting new truths, checks each new truth's `tags` against `documents/*/plan.md` frontmatter `scope_tags`. A tag overlap means the new truth falls within a document's declared scope.
2. **Staleness.** Any document whose `scope_tags` overlap with the new truth's tags gets its `plan.md` `status` set to `stale` — the document may be incomplete or need revision.
   - **Exemption — the asking document (ruled 2026-08-01).** A truth from an `origin: user-answer` material created by document D's own ask loop does not stale D. The answer is by construction inside D's scope (D asked because D needed it) and is written into D's draft in the same pass — it is not drift arriving from outside. Without this, **every question a document asks makes that document stale**, forcing one cold round per question. All *other* overlapping documents still go stale, and D still goes stale if that answer later changes (trigger A). The link is traced through `questions.md`, which records which document asked; no link, no exemption.
3. **Recovery.** Same as trigger A — re-review, refine if needed, re-consecrate.

### Common rules

- A `stale` document's `final.md` (if it exists) is no longer current — it must be re-reviewed before being re-consecrated.
- `stale` is a flag, not a gate — the document isn't deleted, just marked for re-verification.
- Tag changes or metadata-only truth edits do not trigger propagation (they don't change what the document says).
- Under-counting (missing a stale document) is exactly the silent drift WeaveDoc exists to stop — **bias to marking stale.**

### Cost model

- **Mine maintenance (map conflict detection)** scales with tag cluster size — this is correct and necessary; exhaustive conflict detection IS the product. Not a cost to optimize away.
- **Document generation/review** scales with document size + cited truths — bounded by the document, not the mine. The mine can grow without making each document more expensive to produce.
- **Propagation** scales with changed/added truth count × document count — typically cheap (few documents, grep on frontmatter).

## questions.md
The open-questions queue (necessary facts to ask the user). One entry each:
`- [<status>] <where> — <what's missing> — why necessary` ; `status` enum: `open` | `proposed` | `answered`.

- `open` → `proposed` when candidates are on the table but nothing is confirmed.
- `proposed` → `answered` **only on a quotable confirming user utterance, recorded with the entry** (`(사용자: "라온이 좋아보여")`). Silence is not confirmation: a machine default that survived without objection stays `proposed` and its value is marked 제안값 — locking an item `answered` without an explicit confirmation caused a same-turn reopen in a real run.
- An item that was **asked but not answered** stays `open` — it never silently disappears into a material-side "미제공" note while the report claims "열린 갭 0".
- An answered question's content is saved as a `user-answer` material and cited.

## gaps.md
The **mine completeness register** written by `weavedoc-gaps` (project root). Surfaces structural gaps in an *already-closed* pattern so each is consciously **filled or accepted** — the incompleteness counterpart to conflict handling. **Non-blocking by default** (fill-or-accept). With `fidelity.completeness: required`, `validate` blocks a consecrated output while `# Open` holds entries — or while no gaps.md exists at all (a warranty nobody ran is not a warranty); `# Accepted` entries are decisions and never block. Under `required` the register grammar is **fail-closed and state-based** (v0.3.3): exactly one `# Open` and one `# Accepted` heading (both must exist), comments must balance (an unclosed `<!--` blanks everything after it and blocks), entries are `- ` bullets, and an indented line is a continuation **only under a bullet** — indented prose with no open entry above it blocks, because "a continuation of nothing" is a gap no counter sees. The placeholder filter judges the **remainder** (the same ruling review entries follow): a real gap that kept placeholder brackets in its kind slot (`- [<reference>] …` + filled prose) **counts as an open gap**; only a line that is placeholders throughout stays template noise. Anything else blocks as `COMP-MALFORMED`. Two sections (`gaps.sections`):

- **`# Open`** — `- [<kind>] <where> — <what's missing> — <evidence/pattern>` (+ optional ` — conf: high|med|low`; `low` entries are weak signals, collapsed out of headline counts). `kind` enum (`gaps.enum.kind`): `declared` (a material/truth says 미정/미완성/TBD — the mechanical floor, from `weavedoc gaps`), `reference` (a truth names a load-bearing entity no truth defines), `enumeration` (a stated count exceeds coverage — counted over **live** truths, i.e. neither `discarded` nor `retracted`; mine statistics come from `weavedoc census`, never hand-counted), `symmetry` (peers of one class share an attribute one lacks — raise at peer coverage ≥ 3/4, below that it's a `conf: low` weak signal).
- **`# Accepted`** — `- [<kind>] <where> — <why intentionally left> — scope: <tags> — recheck: <condition> — as-of: <ids>`. A gap the user chose to leave open (do-not-resurface). It **re-surfaces** when its `scope` tags gain a new/changed truth (same staleness trigger as document propagation, Trigger B), or closes when filled.

A **filled** gap does not live here — the value enters via `questions.md` → `user-answer` material → `map` → truth, and the gap closes on the next scan. **Read-existing-first:** many "already done / displaced" cases are encoded by truth `status`/`resolution` (a live truth = covered; a `discarded` or `retracted` one is NOT — a tombstone marks an extraction that never had standing, so treating it as coverage hides a real gap) — check that before raising. `weavedoc gaps` (bin) provides only the mechanical `declared` scan over `converted.md` + `truths/`; the semantic kinds are the skill's job.

## .weavedoc/config.yaml
- `version` — int.
- `language` — prose language, set once at init.
- `paths` — locations of `inbox`, `materials`, `truths`, `documents` (only locations are changeable; structure is fixed).
- `fidelity` — the **mandatory gate** (weavedoc's warranty). Contradiction + grounding (every claim traces to a material; nothing contradicts the source) is **always enforced; no switch**. `completeness` (`off` | `required`) — when `required`, a missing *required* element is a violation (normative docs: contracts, SOWs). Fidelity violations block `final.md`/consecration regardless of `review`.
- `conflicts` — source-vs-source conflict handling (detection is review's #1 priority, **never off**). `detection` (`standard` | `deep`) — how hard to hunt conflicts between materials. `attribution` (`ask` | `allow`) — 병기 (keeping both sides) needs user authorization: `ask` = per-conflict, `allow` = standing project-level. The machine never auto-attributes.
- `verify` — per-transformation fidelity check (upstream of the document-level review gate). `strength` (1 = block on critical, 2 = + should-fix, 3 = + nice-to-have — default 2), `max_rounds`, `repeat` (**clean rounds in a row** required to pass, keyed by scale — `full` defaults to 2; one clean round is not a pass), `scale` (`skip` | `light` | `standard` | `full` — project default; material format overrides per the format-risk table in `weavedoc-verify`).
- `review` — the **advisory** quality pass (never blocks consecration): `strength` (1 = block on critical, 2 = + should-fix, 3 = + nice-to-have — advisory findings only), `max_rounds` (exceeded → escalate to the user, never auto-pass), `repeat` (**clean rounds in a row** required, keyed by scale — `full` defaults to 2), `scale` (`skip` | `light` | `standard` | `full` — reviewer count/effort).
- `gaps` — the **mine completeness register** knobs (`weavedoc-gaps`; non-blocking). `markers` — a `|`-separated grep alternation of project-language incompleteness markers scanned by `weavedoc gaps` (e.g. `미정|미완성|TBD|추후 보강`); optional, a Korean-leaning default applies if unset.

## Diagnostic codes (the machine contract)

Every problem and warning the checker emits carries a **stable code**. The code is the contract — automation matches on it; the English message is presentation and may be reworded at any time. Human output prints `[CODE] message`; `--json` carries `{"code":…,"message":…}`. `meta_diag_code_table` fails the suite if the binary emits a code missing here, or if this table names a code the binary cannot emit.

| code | what it means |
|---|---|
| `CAT-GHOST-ROW` | catalog row names a material folder that does not exist |
| `CAT-MISSING` | materials exist but `catalog.md` does not |
| `CAT-NO-ROW` | material has no catalog row |
| `CFG-ENUM` | config value outside its enum |
| `CFG-PATH-MISSING` | a configured `paths:` entry does not exist |
| `CFG-PATH-REDIRECT` | a configured path redirects away from the default that also exists |
| `CFG-RANGE` | config number outside its allowed range |
| `CFG-UNKNOWN-KEY` | *(warning)* unknown top-level config key |
| `COMP-MALFORMED` | completeness required but gaps.md has no readable Open section |
| `COMP-NO-REGISTER` | completeness `required` but no `gaps.md` — the warranty never ran |
| `COMP-OPEN-GAPS` | completeness `required` and open gaps sit next to a consecrated output |
| `CONSEC-INTERRUPTED` | an in-flight consecration artifact (`.consecrate.inflight` / `.final.bak`) exists |
| `CONFLICT-BOTH-RETRACTED` | both sides of an open conflict were retracted |
| `CONFLICT-RECIPROCITY` | `conflict_with` is not mutual |
| `CONFLICT-STALE` | still `conflict` though the counterpart is resolved/gone |
| `COVERAGE-DANGLING` | coverage manifest mentions an id that no longer exists |
| `COVERAGE-LEGACY` | `## legacy` exemption section is malformed |
| `COVERAGE-SECTION` | coverage section missing or misnamed for a material |
| `DATE-INVALID` | a date field is not a real zero-padded `YYYY-MM-DD` |
| `DISCARDED-RULE` | `discarded` truth violates its resolution rules |
| `DISCARDED-SELF-WIN` | `discarded` but its own resolution names it the winner |
| `FM-DUPLICATE-KEY` | the same frontmatter key appears twice |
| `FM-MISSING` | a required frontmatter field is absent |
| `FM-PLACEHOLDER` | a field still holds the untouched template placeholder |
| `GATE-CONTEXT-CHANGED` | cited truth / source / config / schema moved after the review seal |
| `GATE-DUAL-FINAL` | both final.md and final/ exist — only one was digest-checked |
| `GATE-FINAL-DIGEST` | the final is not the bytes the clean review reviewed |
| `GATE-UNSEALED` | a schema-2 mine holds a final next to an unsealed (or half-sealed) review |
| `GATE-NO-HEADING` | consecrated output with no readable `Fidelity violations` heading |
| `GATE-NO-REVIEW` | consecrated output with no `review.md` at all |
| `GATE-OPEN` | consecrated through a non-empty `Fidelity violations` section |
| `GATE-SEAL-MARKER` | a seal and the `review_legacy` marker coexist on one review |
| `HQ-UNTAGGED` | Human-queue entry without a valid ownership tag |
| `LEDGER-MALFORMED` | a verify-ledger row the reader cannot parse (columns, id, digest, round, standard or date) |
| `LEDGER-VERDICT` | a verify-ledger row carries a verdict outside verified|failed|legacy-unbound |
| `IDX-MISSING` | `truths/index.md` or `tree.md` absent (run `reindex`) |
| `IDX-SYNC` | index and truth files disagree (run `reindex`) |
| `MAT-CORRECTS-DANGLING` | `corrects` names a material that does not exist |
| `MAT-CORRECTS-SELF` | a material corrects itself |
| `MAT-ENUM` | material `origin`/`status`/`stage` outside its enum |
| `MAT-FM-UNCLOSED` | material frontmatter is never closed — the body is empty to every reader |
| `MAT-ID-MISMATCH` | `id:` disagrees with the folder name |
| `MAT-ID-NONCANON` | folder name is not the canonical zero-padded id |
| `MAT-NO-CONVERTED` | material folder without `converted.md` |
| `MAT-RESEARCH-FIELDS` | `origin: research` without `url` / `retrieved_at` |
| `MAT-ROLE` | material role is not declared in `project.md` |
| `OK-BUT-LOST` | `status: ok` while its resolution says it lost |
| `PLAN-AUDIENCE` | plan `audience` outside its enum |
| `PLAN-CITED-DANGLING` | `cited_truths` names a truth that does not exist |
| `PLAN-CITED-NOT-ID` | `cited_truths` entry is not a truth id |
| `PLAN-CONTINUES-DANGLING` | `continues` names a document that does not exist |
| `PLAN-DOCID` | `doc_id` disagrees with the folder name |
| `PLAN-ENUM` | plan `status` outside its enum |
| `PLAN-LABELS` | `audience: external` without `publication_labels` |
| `PLAN-MISSING` | document folder without `plan.md` |
| `PROJ-AUTHORITY` | `authority` names a role `project.md` does not declare |
| `PROJ-MISSING` | `project.md` absent (run `weavedoc init`) |
| `PROV-DERIVED-REFS` | `provenance: derived` without `derived_from` |
| `PROV-ENUM` | truth `provenance` outside its enum |
| `REQTAG-EMPTY` | a `required_tags` tag has no live truths |
| `RESOLUTION-ENUM` | resolution `type`/`decision_kind`/`decided_by` outside its enum |
| `RESOLUTION-NO-DECIDER` | a user-resolved resolution with no `decided_by` |
| `REVIEW-COMMENT-SWALLOWS` | a comment hides violation-shaped entries from the gate |
| `REVIEW-DUP-HEADING` | more than one `Fidelity violations` heading — only the first is read |
| `REVIEW-KIND-OUTSIDE` | a bracketed violation kind sits outside the gate's zone |
| `REVIEW-KIND-SHAPE` | a gate entry the reader cannot act on (leading `#` or `-->`) |
| `REVIEW-KIND-UNKNOWN` | bracketed slot inside the gate is not an exact violation kind |
| `REVIEW-LOST-SECTION` | a declared section vanishes once comments are stripped |
| `REVIEW-UNTERMINATED-COMMENT` | `review.md` ends inside an open `<!--` |
| `SCHEMA-ROSTER` | the declared schema key roster is truncated |
| `SCHEMA-UNREADABLE` | `.weavedoc/schema` is missing or unreadable — no verdict is issued |
| `SEAL-QUOTE-MISSING` | a truth's verbatim body is not found in its source (laundering risk) |
| `SEAL-RETRACTED` | seal check hit a retracted source |
| `SEAL-SPLIT-BLOCK` | body lines are each verbatim but not one contiguous block |
| `TRUTH-BODY-EMPTY` | truth body is empty — there is no verbatim quote to seal |
| `TRUTH-BODY-FRAGMENT` | truth body is a single too-short fragment |
| `TRUTH-DIR` | a directory wearing a truth filename |
| `TRUTH-ENUM` | truth `status` outside its enum |
| `TRUTH-FM-UNCLOSED` | truth frontmatter is never closed |
| `TRUTH-ID-MISMATCH` | `id:` disagrees with the filename |
| `TRUTH-ID-NONCANON` | filename is not the canonical zero-padded id |
| `TRUTH-NO-FM` | file in `truths/` has no frontmatter — not read as a truth at all |
| `TRUTH-REF-DANGLING` | a truth reference field names an id that does not exist |
| `TRUTH-RETRACTED-RULE` | a retracted truth violates its retraction rules |
| `TRUTH-SOURCE-DANGLING` | `source` names a material that does not exist |
| `TRUTH-STATUS-LEGACY` | pre-rename legacy `status` value |
| `VER-DISAGREE` | `project.md` and `config.yaml` schema versions disagree |
| `VER-FUTURE` | the project declares a schema newer than this runtime supports |
| `VER-NOT-INT` | a schema version field is not an integer |
| `VERIFY-ENUM` | `truths/verify.md` `status` outside its enum |
| `VERIFY-SECTION` | a required `verify.md` section is missing |
| `WINNER-RETRACTED` | a resolution winner is retracted |
