# WeaveDoc — Artifact Formats (parser contract)

Single source of truth for WeaveDoc's file formats. **Field names, section headers, and enum values are fixed English** — skills and tooling parse them. **Prose** (titles, summaries, role names, document text) is written in the project's language (`config.language`). Don't restate these formats elsewhere; point here.

> **Machine source of truth:** the checkable lists (frontmatter fields · enums · sections) live in `.weavedoc/schema` and are enforced by `.weavedoc/bin/weavedoc validate`. This doc is the human-readable contract; if the two ever differ, `schema` (what `validate` reads) wins — edit it first.

Conventions:
- Frontmatter is YAML at the top of a markdown file.
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
- `id` — `m<N>`, stable, equals the folder name. Never encodes role/topic.
- `title` — human-readable name (project language); shown in citations.
- `origin` — enum: `file` | `user-answer` | `prior-doc` | `conversation`. Mechanical provenance.
- `role` — one value from `project.md` `roles` (project language).
- `topics` — list of free topic tags (project language).
- `format` — original format (e.g. `pdf`, `docx`, `xlsx`, `image`, `md`).
- `source_path` — where the original came from.
- `added` — date `YYYY-MM-DD`.
- `status` — enum: `collected` | `converted` | `verified` | `used` | `retracted`. `verified` = passed cold verification (conversion fidelity confirmed). `retracted` = withdrawn by the user (set by `gather`'s retraction flow) — the material grounds nothing from then on: its live truths go `unsupported`, resolutions it won re-open (map propagates; `validate` enforces both), but the folder and files stay as audit trail — **never deleted**.
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
- `id` — `t<N>`, stable, auto-incremented. Equals the filename (without `.md`).
- `claim` — one-sentence statement of the fact (project language).
- `source` — material id this truth was extracted from (e.g. `m001`).
- `location` — where in the source (e.g. `§4, 1문단`). Project language.
- `tags` — list of topic tags (project language). N:N — a truth can have multiple tags. Tags are the primary lookup mechanism: AI greps by tag to find related truths.
- `status` — enum: `ok` | `conflict` | `unsupported` | `discarded`. **The validity axis — "can this value be used right now":** `ok` = usable (it may carry a `resolution` as *history*: it won a conflict, or both sides were attribute-authorized). `conflict` = unusable — contradicts another truth, unresolved (blocking; set by `map` conflict detection or `review` A0 re-hunt). `unsupported` = unusable — grounding gone (source removed/retracted). `discarded` = unusable — **lost a conflict resolution and is no longer a truth of this mine**; the file stays on disk as audit trail (same shape as a retracted material: present for audit, ontologically out), and its `resolution` records the decision and the successor. Conflict *history* lives in `resolution`, never in `status`.
- `provenance` — optional enum (default `stated`): **who authored the value.**
  - `stated` — the fact is in the material as the user/source stated it.
  - `adopted` — the value originated as a **machine proposal the user adopted**; the adoption exchange must be visible in the source material. (A real run recorded a machine-proposed 158cm in the exact same shape as user-supplied values — this field is what keeps "기계는 조용히 고르지 않는다" true at the *record* level, not just in chat.)
  - `derived` — the machine computed/interpreted it from other facts. Requires `derived_from`; `validate` enforces this.
  `adopted` + `derived` form the **priority re-verify set** and are highlighted in the human-confirmation delta.
- `derived_from` — required when `provenance: derived`. List of truth/material ids the derivation used.
- `assumptions` — list of premises the derivation rests on that appear in **no material** (e.g. `[세는나이 고1=17]`). Every unstated anchor goes here — an empty list means the derivation uses stated facts only.
- `as_of` — the phase/date at which a **time-varying** claim (나이·학년·소속·상태) is true (e.g. `First Light (Phase 1)`). In a phase-structured project a time-varying claim without `as_of` is an extraction error — the "데뷔 시점 18/18/16/19" incident was two phases collapsed under one label, impossible to write with `as_of` present.
- `corroborated_by` — optional list of material ids that independently confirm this truth (recorded by `map`'s duplicate check instead of creating a duplicate truth; chat-only corroboration is lost when the session ends).
- `resolution` — the decision record of a settled conflict, present on **every party**: the loser (`status: discarded`, winner elsewhere), the winner (`status: ok`, winner: its own id), and both sides of an authorized attribution (`status: ok`, `type: attribute`). Object with:
  - `type` — enum: `supersedes` | `authority` | `pick` | `value` | `attribute`. `supersedes`/`authority` = machine-resolved (`authority` is `decided_by: user` on the one conflict that *established* the ranking). `pick`/`value`/`attribute` = user-resolved.
  - `winner` — id of the winning truth (for `supersedes`/`authority`/`pick`), or id of a new material (for `value`). **May be a list** when different fields were superseded by different sources.
  - `decided_by` — enum: `machine` | `user`.
  - `decision_kind` — optional enum, refines `decided_by: user`: `supplied` (the user provided the value) | `ratified` (the user accepted a machine-originated proposal). `ratified` resolutions join the priority re-verify set.
  - `scope` — optional list naming **exactly which fields** were displaced (partial supersede of a record truth, e.g. `[키, 나이]`). The index shows the `[discarded]` marker; the scope detail lives in the truth file, telling readers which fields of the record remain valid. Prefer avoiding the need entirely: extract attribute tables **row by row** so one wrong cell never buries five valid ones.
  - `reason` — free text explanation (project language).
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
A tag-grouped view of all truths for dashboard consumption. Format: one `## <tag>` heading per tag, listing truth ids + claims + status underneath. **Regenerated only by `weavedoc reindex`** — never hand-edited (hand edits in a real run consumed ~45% of the tool calls and corrupted an entry). Run `reindex` whenever truths change.

## truths/index.md (generated)
A flat one-line-per-truth index for quick AI scanning. Format: `- <id>: <claim> [<source>] — [<tag1>, <tag2>] [<status>]` (status marker only when ≠ `ok`). **Regenerated only by `weavedoc reindex`**; `validate` fails when it drifts from the truth files. AI reads this file first to identify relevant truths by tag before opening individual files.

## truths/coverage.md (extraction coverage manifest)
Written by `map` alongside extraction — hand-written judgment content, **not** `reindex`-generated. One `## m<id>` section per mapped material (the id may be followed by the title): every fact-bearing element of that material's converted.md, at section/table/paragraph granularity, mapped to the truths extracted from it — or explicitly skipped with a reason. This is **T2's audit surface**: extraction completeness stops being an open "빠짐없이 뽑았나?" and becomes a checkable ledger (the same show-the-mapping rule M1 applies to conversion).

```
## m001 EClYpSE 프로젝트 인계 문서
- §1 개요 → t001, t002
- §2 멤버 표 → t003, t004, t005, t006, t007 (행별 추출)
- §3 연혁 → t008, t009
- skipped: §4 감사의 말 — 인사말, fact 없음
```

Rules: truth ids are listed **explicitly, never as a range** (`t003–t007` fails the mechanical check — only t003/t007 are textually present). A `skipped:` line without a reason is an omission. `validate` cross-checks mechanically: every `## m<id>` resolves to a material, every mentioned truth id exists, and **every truth extracted from a sectioned material appears in that section** (adding a truth without updating coverage fails). Materials without a section are legal (legacy — coverage arrives on their next map); `census` reports the coverage count (`coverage N/M material(s)`); T2 treats a missing section as PARTIAL, never PASS.

## truths/changelog.md (append-only run log)
Appended by `map` (and by `verify` when it edits truths) — one block per run. **This is the surface the human-confirmation step renders**: without it, "이번에 뭐가 어떻게 바뀌었나" cannot be reviewed and the only possible question degrades to the banned "추출된 진실이 정확합니까?".

```
## 2026-07-24 map
- added: t190 [stated] 은지의 본명은 권은지다
- added: t217 [derived] 학년↔나이 환산은 세는나이 고1=17 앵커 (가정: 자료에 없음)
- superseded: t027 → m011+m013 (scope: 키·나이)
- edited: t133 (resolution.reason — "유일 기록" 표현을 계획본 표기로 정정)
- confirmed: 2026-07-24 (blanket)
```

Line kinds: `added:` (id + `[provenance]` + one-line claim), `superseded:` (old id → winner, scope), `edited:` (id + what changed), `confirmed:` (appended after the human reviews the delta — `blanket` = 일괄 통과, `itemized` = 항목별 확인). The confirmation step renders every block since the last `confirmed:` marker.

## truths/verify.md (verify state)
Written by `weavedoc-verify` (truths mode). Records the verification state of the truth set.

Frontmatter:
- `status` — enum: `passed` | `failed` | `escalated` | `stale`. `stale` = new truths added since last verify; re-run needed.
- `round` — int, last round number.
- `verified_at` — date `YYYY-MM-DD`.

Body:
- the T# verdict table (T1–T4, each PASS/PARTIAL/FAIL with evidence);
- `## Verified units` — per material / truth-cluster: last verified round + date. **Anything created or changed after a pass is `stale` for that unit** — a global `passed` never covers units born after it (a real run let an unverified correction ride into a "passed" mine). Summaries always show the unverified count ("자료 16 중 verified 15 · 미검증 1").
- `## Human queue` — reviewer findings the machine wanted to dismiss on **semantic** grounds ("원문에서 함의됨" / "파생이라 무해" / "다른 파일에 기록됨"). Semantic dismissal is the user's call, not the machine's: an entry leaves this queue only by user ruling (→ then it may become do-not-raise). A real run self-dismissed the same reviewer finding twice; it was the one error the user later corrected.
- `## Adjudications` — do-not-raise categories for future rounds. Only user-ruled entries land here.

## documents/&lt;doc-id&gt;/
- `plan.md` — frontmatter: `doc_id`, `doc_type` (project language), `tone`, `status` (enum: `planned` | `drafting` | `reviewing` | `done` | `stale`), `continues` (list of prior `doc-id`s, for series), `cited_truths` (list of truth ids cited in the draft/final — generated by `write`/`refine`, used for change propagation), `scope_tags` (list of tags this document covers — set by `plan` from the elicitation; used to detect staleness from NEW truths added to the mine). Body: the outline — one heading per section, each with a note `<!-- purpose / materials: role·topics / required|optional -->`.
- **Single-file output:** `draft.md` — the working draft, improved in place across review rounds. `final.md` — the finished document.
- **Multi-file output:** `draft/` directory containing individual page files (e.g. `draft/index.md`, `draft/yuna.md`, `draft/phase-1.md`). `final/` directory with the same structure. The plan's page list determines which files exist; `write` creates them; `review` checks each; `refine` updates them. File naming follows the plan's naming convention (typically kebab-case).
- **Citation markers (both modes):** Claims carry **inline truth citations** using the marker `<!-- t:<id> -->` immediately after the sentence (e.g. `세하는 17세이다.<!-- t:t006 -->`). The marker is invisible in rendered markdown but machine-parseable. Each citation also shows the material title for human readers: `(출처: <material title>)` or footnote-style `[^m001]` with matching definitions — the inline `<!-- t:... -->` marker is the machine-readable part; the visible citation is the human-readable part. `write` and `refine` update `plan.md`'s `cited_truths` from these markers after each pass (scanning all draft files in multi-file mode).
- `review.md` — two parts. **`Fidelity violations`** (the mandatory gate): `- [<kind>] <where> — <what>`, `kind` enum: `contradiction` | `unsupported` | `missing-required`. NOT editable, NOT triaged-down, NOT adjudicated away; any open entry blocks `final.md`/`final/` and consecration. **`Findings`** (advisory persona pass): `- [<severity>] <where> — <what + why>`, `severity` enum: `critical` | `should-fix` | `nice-to-have`. Plus an `adjudications` block recording dropped/accepted *advisory* findings so re-reviews don't re-raise them.
- `final.md` (single-file) or `final/` (multi-file) — the finished document. Written only when the fidelity gate is clean (zero open fidelity violations). Re-enters as an `origin: prior-doc` material for later documents — the gate is the membrane that keeps the growing material set free of contradictions.

## Truth → document propagation (change tracking)

When the data mine changes, documents drawn from it may become inconsistent. Two propagation triggers:

### Trigger A — truth changed (claim/status edit)

A truth's `claim` is edited, its `status` changes to `conflict`, or a settled resolution is re-opened (the `ok` winner set back to `conflict`).

1. **Detection.** `weavedoc-map` (step 6) detects truth changes. For each changed truth id, it greps `documents/*/plan.md` frontmatter for `cited_truths` entries matching that id.
2. **Staleness.** Any document whose `cited_truths` includes the changed truth gets its `plan.md` `status` set to `stale`.
3. **Recovery.** Re-run `weavedoc-review` on the draft (re-checks cited truths), then `refine` if needed, then re-consecrate.

### Trigger B — new truth added to the mine

A new truth is extracted from a new or updated material. Existing documents don't cite it (it didn't exist), but it may affect their completeness or contradict their content.

1. **Detection.** `weavedoc-map` (step 6), after extracting new truths, checks each new truth's `tags` against `documents/*/plan.md` frontmatter `scope_tags`. A tag overlap means the new truth falls within a document's declared scope.
2. **Staleness.** Any document whose `scope_tags` overlap with the new truth's tags gets its `plan.md` `status` set to `stale` — the document may be incomplete or need revision.
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
The **mine completeness register** written by `weavedoc-gaps` (project root). Surfaces structural gaps in an *already-closed* pattern so each is consciously **filled or accepted** — the incompleteness counterpart to conflict handling. **Non-blocking** (fill-or-accept, never a hard failure). Two sections (`gaps.sections`):

- **`# Open`** — `- [<kind>] <where> — <what's missing> — <evidence/pattern>` (+ optional ` — conf: high|med|low`; `low` entries are weak signals, collapsed out of headline counts). `kind` enum (`gaps.enum.kind`): `declared` (a material/truth says 미정/미완성/TBD — the mechanical floor, from `weavedoc gaps`), `reference` (a truth names a load-bearing entity no truth defines), `enumeration` (a stated count exceeds coverage — counted over **live** (non-`discarded`) truths; mine statistics come from `weavedoc census`, never hand-counted), `symmetry` (peers of one class share an attribute one lacks — raise at peer coverage ≥ 3/4, below that it's a `conf: low` weak signal).
- **`# Accepted`** — `- [<kind>] <where> — <why intentionally left> — scope: <tags> — recheck: <condition> — as-of: <ids>`. A gap the user chose to leave open (do-not-resurface). It **re-surfaces** when its `scope` tags gain a new/changed truth (same staleness trigger as document propagation, Trigger B), or closes when filled.

A **filled** gap does not live here — the value enters via `questions.md` → `user-answer` material → `map` → truth, and the gap closes on the next scan. **Read-existing-first:** many "already done / displaced" cases are encoded by truth `status`/`resolution` (a live non-`discarded` truth = covered) — check that before raising. `weavedoc gaps` (bin) provides only the mechanical `declared` scan over `converted.md` + `truths/`; the semantic kinds are the skill's job.

## .weavedoc/config.yaml
- `version` — int.
- `language` — prose language, set once at init.
- `paths` — locations of `inbox`, `materials`, `truths`, `documents` (only locations are changeable; structure is fixed).
- `fidelity` — the **mandatory gate** (weavedoc's warranty). Contradiction + grounding (every claim traces to a material; nothing contradicts the source) is **always enforced; no switch**. `completeness` (`off` | `required`) — when `required`, a missing *required* element is a violation (normative docs: contracts, SOWs). Fidelity violations block `final.md`/consecration regardless of `review`.
- `conflicts` — source-vs-source conflict handling (detection is review's #1 priority, **never off**). `detection` (`standard` | `deep`) — how hard to hunt conflicts between materials. `attribution` (`ask` | `allow`) — 병기 (keeping both sides) needs user authorization: `ask` = per-conflict, `allow` = standing project-level. The machine never auto-attributes.
- `verify` — per-transformation fidelity check (upstream of the document-level review gate). `strength` (1 = block on critical, 2 = + should-fix, 3 = + nice-to-have — default 2), `max_rounds`, `repeat`, `scale` (`skip` | `light` | `standard` | `full` — project default; material format overrides per the format-risk table in `weavedoc-verify`).
- `review` — the **advisory** quality pass (never blocks consecration): `strength` (1 = block on critical, 2 = + should-fix, 3 = + nice-to-have — advisory findings only), `max_rounds` (exceeded → escalate to the user, never auto-pass), `repeat` (clean rounds in a row required), `scale` (`skip` | `light` | `standard` | `full` — reviewer count/effort).
- `gaps` — the **mine completeness register** knobs (`weavedoc-gaps`; non-blocking). `markers` — a `|`-separated grep alternation of project-language incompleteness markers scanned by `weavedoc gaps` (e.g. `미정|미완성|TBD|추후 보강`); optional, a Korean-leaning default applies if unset.
