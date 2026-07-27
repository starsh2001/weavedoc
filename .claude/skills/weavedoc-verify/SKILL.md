---
name: weavedoc-verify
description: Cold verification of gather/map transformations — material (원본↔converted.md) and truths (converted.md↔truths). Spawns cold subagents that didn't see the conversion. Use when the user says "verify", "검증", "변환 검증", "원본 대조", "truth 검증", "추출 검증", or after gather/map.
---

# weavedoc-verify

Per-transformation fidelity check — the data mine's quality gate. WeaveDoc's three hops each need a gate:

| hop | gate | checks |
|-----|------|--------|
| 원본 → converted.md | **this skill (material)** | conversion fidelity |
| converted.md → truths | **this skill (truths)** | extraction fidelity |
| truths → document | review fidelity gate | citation / grounding |

The agent that produced the conversion must NOT grade its own work. Verify spawns **cold subagents** (empty context) that see only the input and output. (Folding verify into gather/map was rejected for this reason — self-check = rubber stamp.)

> **Language: read it first.** Read `language:` from `.weavedoc/config.yaml` and write **every** reply in that language (the cold reviewers' findings too). These skill files are English; your output is not.

> **Thin context.** Don't read all materials or truths into context. Load only the specific material or truth cluster being verified. The truth is on disk; re-read when you need it.

> **Write-scope.** Material mode writes only to `materials/<id>/converted.md` (fixes) and material frontmatter. Truths mode writes only to `truths/*.md` and `truths/verify.md`. Neither mode touches `documents/`.

> **Where it runs (the invocation contract).** Run weavedoc-verify in your **main Claude Code session** — it spawns the cold reviewers as **subagents**. **Never run a weavedoc skill *as* a subagent** — then it can't spawn reviewers and silently degrades to a non-cold self-check, defeating the point.

> **Grounding discipline.** (1) When the user questions where a claim came from, **re-read the file before answering** and show `source`/`location` + the verbatim line. (2) No modifiers the material doesn't support (구버전·실제 적용…). (3) Guesses are presented as guesses.

## Prerequisite gate
- Material mode: at least one material with `status: converted` must exist. If not → `weavedoc gather`.
- Truths mode: `truths/` must have truth files. If not → `weavedoc map`.
- **Stop** if prerequisites aren't met.

## Auto-routing

Without an explicit target:
1. Any material with `status: converted`? → **material** mode, pick lowest id.
2. Otherwise truths exist but `truths/verify.md` absent or `status ≠ passed`? → **truths** mode.
3. Both clean → nothing to verify.

Explicit: `verify m001` → material. `verify truths` → truths.

## Shared review engine
> Spawn mechanics, the common preamble, THE BAR, SCOPE, findings format (with ✅/❌ examples), and triage all live in `.claude/skills/weavedoc-review/references/reviewers.md` — **load it before running a round.** The lenses and pass rules below are specific to verify.

## THE BAR — sufficient fidelity, not perfection

A discrepancy is a finding only if it would cause a writer to **cite something wrong, miss a fact that changes the document, or believe something the original doesn't say.**

- Meaning-preserving reformulation = not a finding.
- Formatting difference (line breaks, heading levels, list styles) = not a finding unless it **loses information** (e.g. table → prose losing row-column structure).
- A finding must **name what was lost/changed and where.** "Seems incomplete" is not a finding.

## Level scaling

### Material — by format risk

| format | level | reviewers |
|--------|-------|-----------|
| md, txt | skip | 0 (validate only) |
| docx | light | 1 |
| xlsx, csv | standard | 2 |
| pdf, image | full | 3 |

**Precedence: `effective = max(config floor, format level)`** — a format's low level never lowers a higher config floor. When ambiguous, round up. `skip` = no cold reviewers; only `weavedoc validate` (mechanical checks) runs — for lossless formats (md→md) where conversion is a verbatim copy.

**Restatement overrides both: always `full`.** Any material whose converted.md is a *restatement* — conversation distillation, user-answer summaries, correction materials — is verified at `full` regardless of format or floor. **Risk scales with how much the agent rewrote, not with who supplied the source or the file extension**: "사용자 직접 제공이라 리스크 낮음" is backwards (a real run's only critical — a fabricated SUNO rule — came from exactly such a restatement, twice recommended for skipping).

### Truths — by volume

| truths | level | reviewers |
|--------|-------|-----------|
| ≤20 | light | 2 |
| 21–80 | standard | 3 |
| >80 | full | 4 |

## Material verify — M1–M3

Target: one material (`materials/<id>/source.<ext>` + `materials/<id>/converted.md`).

Each lens marks **PASS / PARTIAL / FAIL** with evidence. An unshown check is PARTIAL, never PASS. "Looks fine" is not PASS — that waves an under-checked conversion through.

- **M1 Completeness** — every section, paragraph, table, and data point in the original appears in converted.md. **Show the mapping**: original element → converted location. Missing content = FAIL.
- **M2 Accuracy** — every value (number, date, name, amount, label) in converted.md matches the original exactly. Cross-check ALL structured data: table cells, enumerated items, figures, dates, proper nouns. Show the comparison. Misread value = FAIL.
- **M3 Hallucination** — nothing in converted.md that isn't in the original. For image descriptions: no inference beyond what's visible. For xlsx: no formula interpretation stated as fact. Trace each element back. Untraceable element = FAIL.

Lenses (fixed order, first *N* per level):
1. **completeness-scanner** (M1)
2. **accuracy-checker** (M2)
3. **hallucination-hunter** (M3)

## Truths verify — T1–T4

Target: all truths (`truths/*.md`) vs their source materials (`materials/*/converted.md`).

- **T1 Quote integrity** — the truth's `claim` accurately represents its verbatim quote (body). String existence of the quote in the source material → mechanical, routed to `weavedoc validate` (the anti-laundering seal). This lens judges *semantic*: does the claim faithfully render the quote's meaning? Claim drifts from its own quote = FAIL.
- **T2 Extraction completeness** — every load-bearing fact in each material's `converted.md` became a truth. Load-bearing includes **full-text artifacts** (가사 전문, 계약 조항, 코드/사양) whose exact wording matters — metadata-only extraction of such an artifact (the song's BPM but not its lyrics) is an omission. **Audit the ledger, don't free-recall:** check the material's `## m<id>` section in `truths/coverage.md` against converted.md — is every fact-bearing element present as extracted-or-skipped, is each `skipped:` reason legitimate, does each element's truth-id mapping hold? (`validate` already guarantees the ids exist and that every extracted truth appears in its section — the reviewer judges *meaning*.) A material with **no coverage section is PARTIAL, never PASS** — route to map to generate it; free-listing key facts from converted.md is the fallback only for that case. **Legacy escape (no deadlock):** for materials mapped before coverage existed, the user may rule the missing section accepted (→ adjudications/do-not-raise, like any other finding) instead of forcing an immediate backfill — but the ruling is the user's, never the machine's. Important omission or an illegitimate skip = FAIL.
- **T3 Atomicity** — each truth is truly one fact (not two bundled). The claim matches the quote. Atomization didn't distort meaning. Bundled or distorted = FAIL.
- **T4 Tag coverage** — tags correct and sufficient for conflict detection (since detection is grep-by-tag, a mistagged truth hides from cross-checks). A fact about 일정 tagged only 개요 hides date conflicts from the search. Show the tag→content mapping. Mistagging = should-fix.

Lenses (fixed order, first *N* per level):
1. **claim-vs-quote** (T1)
2. **extraction-auditor** (T2)
3. **atomicity-checker** (T3)
4. **tag-auditor** (T4)

## Mechanical floor (validate)

Before cold reviewers, run `weavedoc validate`. Beyond existing checks, validate now additionally checks:
- **Quote existence**: each truth's body text (the verbatim quote) appears in its source material's `converted.md` body (substring match). A mismatch = blocking. This is the mechanical seal against quote laundering — a conversion error cannot receive a "verbatim" stamp.

Non-zero validate exit = blocking finding regardless of the cold pass.

## One round

0. **Pin the baseline.** Record each target material's `source.*` size + mtime (or hash). If any source file changed when the round ends, the round is **FAIL — baseline moved**: verification must never edit its own reference (a real run "resolved" hallucination findings by writing the hallucinated content *into* source.md, and the next round PASSed against the moved baseline). New information enters via a correction material (gather → supersede); machine annotations go in converted.md as `> [note]`/`> [machine-note]` lines — never into source.
1. **Validate.** Fix any mechanical failures before proceeding.
2. **Spawn cold reviewers** in parallel (subagents, empty context), count from the level. Each gets: the target files + THE BAR + the checklist to fill + the do-not-raise list from prior adjudications. **NOT** how the conversion was done, not a prior round's discussion. **Read-scope:** a reviewer may also open any material the target's converted.md explicitly cross-references (a value labeled `(m012 대조)` needs m012 to check), and may existence-check the disposition ledgers (`gaps.md`, `questions.md`) — a decision recorded there is not a "missing" fact. Explicitly labeled derivations/cross-references are not raisable as hallucination. (Both reviewer-blindness false-positive classes from a real run.)
3. **Aggregate** into the M#/T# verdict table. Dedupe by (where + what). On a severity clash, take the higher. A check is PASS only when a reviewer **showed** it.
4. **Over-strictness triage — by a separate cold defender, never yourself.** The defender is mandatory on `full`, and **also mandatory at any level when this session produced the conversions being verified** — the producer must not self-triage (a real run's self-triage dismissed the same reviewer finding twice; it was the one error the user later corrected). Drop: formatting-only, meaning-preserving reformulation, fails the "name what was lost" test, already-settled categories. Never drop a quote-existence failure. **A semantic dismissal is not the machine's to make**: if the drop reason is "원문에서 함의됨" / "파생이라 무해" / "다른 파일에 기록됨", the finding goes to `## Human queue` in the state file — only the user's ruling turns it into a do-not-raise.
5. **Severity**: `critical` = document would cite something factually wrong. `should-fix` = omission or distortion that could mislead. `nice-to-have` = minor precision loss that doesn't change meaning.
6. **Pass judgment** by `config.verify.strength` (default 2 = critical + should-fix block). A round passes only when the verdict table is **affirmatively all-PASS** (every check shown, none PARTIAL/FAIL) AND no blocking findings remain. An unshown check blocks like should-fix.
7. **Fix critical + should-fix only.** `nice-to-have` findings are **not fixed inside rounds** — route them to the Human queue / run notes (in a real run, fixing nice-to-haves manufactured the next round's should-fixes; every round-3 finding was a round-2 edit). Then re-spawn a fresh cold round (new reviewers, same adjudications) — give the new round the **diff of what you just edited** so it checks whether the fixes made new problems.
8. **Stop safety**: `round > config.verify.max_rounds` → set `status: escalated`, take open issues to the human. Do **not** approve. If you apply reviewer-prescribed fixes after the final round, run one **diff-only mini-round** — a single cold reviewer given only the edited hunks — so the last edits don't ship unreviewed.
9. **Round handoff gate.** Before the next round may start, every finding of this round is classified `fixed` / `do-not-raise` (user-ruled) / `human-queue` and written to the state file, with triage drops condensed into do-not-raise categories. Skipping this made round 2 re-discover four already-settled items in a real run.

## State & status

- **Material**: pass → set frontmatter `status: verified`. Fail/escalate → stays `converted`.
- **Truths**: pass → write/update `truths/verify.md` with `status: passed`, the T# verdict table, `## Verified units` (per material/cluster: round + date), `## Human queue`, and adjudications. When new truths are added (re-map), re-run verify on the affected tag clusters (set `status: stale` in verify.md until re-verified).
- **Per-unit honesty.** A global `passed` never covers units created or changed after the pass — those are `stale`/unverified for their unit, and every summary states the unverified count ("자료 16 중 verified 15 · 미검증 1 (m016)"). A real run let a post-verify correction (m016/t218, cold-checked zero times) ride inside a "passed" mine.
- If verify itself edited truths, append the edits to `truths/changelog.md` like map does.

## Human confirmation — show this run's delta; never ask "정확합니까?"

The blanket question — "추출된 진실이 정확합니까?" over a whole mine — is **banned**. With no reviewable surface it hands the machine's job back to the human, whose only possible reply is "뭘 보고 확인해?" (a real user's verbatim reply).

What the human confirms is **the delta of this run**, rendered from `truths/changelog.md` (every block since the last `confirmed:` marker):

1. **List every truth added / superseded / changed — the full delta, not a sample.** One line each: id · provenance tag (`[말한 그대로]` = stated · `[제안 채택]` = adopted · `[계산]` = derived) · the claim · for superseded: old → new pointer. Faithfully-sourced entries are listed too, **because recording can distort even direct user statements** (a real run re-based a user's stated reason onto a different biography fact) — only the user can see that their words were reflected correctly.
2. **Highlight the judgment set** on top of the list: `adopted`/`derived` truths, hedges hardened into assertions, machine-made negative propositions, guideline grade changes, and every `## Human queue` entry — labeled honestly ("리뷰어가 2회 지적, 기계는 '함의됨'으로 유보"). Each carries one line of **what breaks if it's wrong** ("만나이라면 나이표 전체가 한 살 밀림") + the truth link.
3. **State the mechanical guarantee** so the human reviews meaning, not typos: "축자 인용 존재는 validate가 N/N 확인 — 가사·프롬프트 전문의 오탈자 검토는 불필요합니다."
4. **Offer graded responses** — 훑어보기 / 항목별로 나열해줘 / 넘어가기 — plus the rollback promise ("나중에 틀린 게 나와도 map 정정으로 되돌릴 수 있습니다").
5. **Record what actually happened.** A blanket pass ("이대로 가도 될 것 같아") is appended to changelog as `confirmed: <date> (blanket)` — never expanded into per-item confirmations in any file. Blanket-confirmed judgment items stay listed at lower priority for the next delta.

- **Material**: "이 변환이 정확합니까?" — the human confirms an already-verified conversion, not doing the verification themselves; same delta principle (show what this conversion added/changed).
- Escalated or rejected → fix and loop back; nothing advances.

## Next
- After **material verify** → still in the mine-building phase; **map** is available to extract truths.
- After **truths verify** → the mine is built and verified, which **closes the mine-building phase**. Writing a document is a separate phase, enterable with **plan** when the user wants — or the mine can keep growing (gather / map more). Neither is required. Present it as available ("이제 plan을 할 수 있습니다"), never as an obligation.
