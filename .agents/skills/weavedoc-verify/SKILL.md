---
name: weavedoc-verify
description: Cold verification of gather/map transformations — material (원본↔converted.md) and truths (converted.md↔truths). Spawns cold subagents that didn't see the conversion. Use when the user says "verify", "검증", "변환 검증", "원본 대조", "truth 검증", "추출 검증", or after gather/map.
---

# weavedoc-verify

Per-transformation fidelity check — the data mine's quality gate. WeaveDoc's three hops each need a gate:

> **This is the SECOND pass, not the first (ruled 2026-08-16).** Every lens below is also a write-time rule: `gather` step 7 runs M1–M3 on the conversion it just wrote, and `map` step 7 runs T1–T3 on the cards it just wrote. **This lane exists for what those missed** — it is the cold, independent re-read, not the place the rules live. Two consequences. (1) A finding here is *also* evidence that a write-side self-audit did not run or did not catch it; when a round finds something the writer's own step should have, say so in the round record, because the repeating defect is the skipped procedure, not the missed check. (2) Never treat "verify will catch it" as licence to write loosely — a mine that leans on this lane pays a cold panel per material forever, and a real one accumulated 50 unpassed cards exactly that way.

| hop | gate | checks |
|-----|------|--------|
| 원본 → converted.md | **this skill (material)** | conversion fidelity |
| converted.md → truths | **this skill (truths)** | extraction fidelity |
| truths → document | review fidelity gate | citation / grounding |

The agent that produced the conversion must NOT grade its own work. Verify spawns **cold subagents** (empty context) that see only the input and output. (Folding verify into gather/map was rejected for this reason — self-check = rubber stamp.)

> **Language: read it first.** Read `language:` from `.weavedoc/config.yaml` and write **every** reply in that language (the cold reviewers' findings too). These skill files are English; your output is not.

> **Running weavedoc: pick the shell by platform.** Commands below are written `node .weavedoc/bin/weavedoc.mjs …` and read the same in every shell. **On Windows run them through PowerShell; everywhere else through bash** — Git Bash pays ~290ms per process to emulate Unix (measured: 373ms vs 80ms for one invocation), and a mine-wide command spends most of its time there. Never create a `.ps1` wrapper: PowerShell's execution policy applies to `.ps1` files and a downloaded one is blocked under `RemoteSigned`, while `node script.mjs` is not subject to it at all.

> **Codex activation handshake.** In Codex, before this skill's first file write, run `node .weavedoc/bin/weavedoc.mjs activate weavedoc-verify`. The command itself writes nothing; the project `.codex/hooks.json` PostToolUse hook binds the current session to this skill. If Codex reports the hook as untrusted, stop and ask the user to review it with `/hooks`; never route the write through a shell to evade the gate. Claude Code needs no handshake because its `Skill` event carries the skill name directly.

> **One writer per mine.** WeaveDoc is single-writer: one mutating session, and one mutating command, against a mine at a time (FORMATS.md). The CLI refuses a second mutating command; it cannot see YOU editing mine files directly, so never run this skill against a mine another session is writing to. A lost seal or verification row is evidence, not a cache — re-running the command is not the repair.

> **Surface, don't point.** A run that ends with anything waiting on the user — an unresolved conflict, an open question, a Human-queue entry, a fidelity violation, an open gap — must state each item **in the closing message itself**: what it is **in words** (the material's subject, the claim's content — an id is a machine handle and names nothing to a reader, who would have to open the file to learn what you meant; number the items in your message if the user will need to point at one) · the issue in one line (a conflict names both sides and their sources; a Human-queue entry keeps its ownership tag) · what the user must decide or supply. Every item gets its line — with many items, compress the detail, never the list. The file path comes *after* the substance, as the reference — never instead of it. "questions.md를 확인하세요" with the content only on disk is the handoff twin of the banned blanket "정확합니까?" (§Human confirmation below): no reviewable surface in the message, so the user must open files just to learn what is wrong. Ruled 2026-08-06 — real runs ended exactly that way ("파일을 안 열어봐도 어떤 부분이 문제인지 메시지로 명시"). Its mechanical source: `node .weavedoc/bin/weavedoc.mjs status --open` prints every open item across all five categories, one line each — take the list from that output and render it in the reply language, never re-compose it from memory (the census discipline, applied to the handoff).

> **Thin context.** Don't read all materials or truths into context. Load only the specific material or truth cluster being verified. The truth is on disk; re-read when you need it.

> **Write-scope.** Material mode writes only to `materials/<id>/converted.md` (fixes) and material frontmatter. Truths mode writes only to `truths/*.md` — naming the three that glob reaches past the cards: `truths/verify.md` (round state), `truths/coverage.md` (a T2 legacy ruling lands in its `## legacy` section), and `truths/changelog.md` (edits this lane itself made, logged the way map logs its own). Neither mode touches `documents/`.

> **The work's owner is the skill, not the session.** When a run spawns work another skill owns — a ruling mid-verify that needs a material (gather), a card correction (map), a document edit (write) — invoke that skill before doing the work; never imitate its output shape from memory. Imitation carries the visible conventions and drops the invisible duties. Measured (a real run): a verify walkthrough produced 8 materials and 23 cards inline with gather/map never loaded — all seven of the round's blocking findings clustered in that unloaded work, while the loaded skill's own procedure ran clean. Rule distance, not context volume, corrodes.

> **Where it runs (the invocation contract).** Run weavedoc-verify in your **main Claude Code or Codex session** — it spawns the cold reviewers as **subagents with empty inherited conversation context**. **Never run a weavedoc skill *as* a subagent** — then it can't spawn reviewers and silently degrades to a non-cold self-check, defeating the point.

> **Grounding discipline.** (1) When the user questions where a claim came from, **re-read the file before answering** and show `source`/`location` + the verbatim line. (2) No modifiers the material doesn't support (구버전·실제 적용…). (3) Guesses are presented as guesses.

## Authority — who decides, at this mine's level

Read `authority` from `.weavedoc/config.yaml`: `strict` | `standard` | `delegated`, and **absent means `standard`** (this axis is younger than every mine that exists, so absence is the normal state, not a gap). For work that belongs to a document, that document's `plan.md` frontmatter may override the mine's level; the override governs the document's own steps and leaves mine-side work at the mine's level, because nothing has ruled yet whether a strict document reaches back over the materials it draws on. **A decision the level's text does not name goes to the user.** Same fail-safe direction the Human queue's ownership tag takes, for the same reason: a decision the machine takes unasked is invisible, while one it surfaces costs a question. And the level says who decides, never what is true — the mirror rule, the quote seal, the intake declaration, conflict blocking and the fidelity gate hold identically at all three.

**This skill's rows — two, because this skill holds two decision points.**

*The defender* (One cycle, step 2). `strict` — it closes **nothing**: every finding goes to the user's list, `[machine]` ones included, and `nice-to-have` findings are reported rather than routed away. `standard` — what a reproducible measurement closes, it closes; the recorded-elsewhere close in reviewers.md (verbatim quote + file and line + the finding command with its count) is *this level's clause*, and semantic judgements still go up. `delegated` — full triage authority including rejection, with the round summary as the user's view.

*The confirmation* (§Human confirmation). `strict` — confirm in place as below, **and** re-confirm every item individually in the delta. `standard` — **the in-place confirmation is the whole of it.** A value the user chose in a visible exchange is listed in the delta and never re-asked: what was owed was proof that their choice was transcribed faithfully, and the place to pay that is where it was applied, not a session later. Individual confirmation is for what the machine decided **alone** — a `derived` figure, a hedge it hardened into an assertion, a negative proposition it formed. `delegated` — the delta and the round summary, nothing itemised.

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
> Spawn mechanics, the common preamble, THE BAR, SCOPE, findings format (with ✅/❌ examples), and triage all live in the `weavedoc-review` skill's `references/reviewers.md` — `.claude/skills/weavedoc-review/references/reviewers.md` in Claude Code, `.agents/skills/weavedoc-review/references/reviewers.md` in Codex. **Load the active harness's copy before running a round.** The two copies are release-checked byte-identical; the lenses and pass rules below are specific to verify.

## THE BAR — sufficient fidelity, not perfection

A discrepancy is a finding only if it would cause a writer to **cite something wrong, miss a fact that changes the document, or believe something the original doesn't say.**

- Meaning-preserving reformulation = not a finding.
- Formatting difference (line breaks, heading levels, list styles) = not a finding unless it **loses information** (e.g. table → prose losing row-column structure).
- A finding must **name what was lost/changed and where.** "Seems incomplete" is not a finding.

## Level scaling

**The reviewer count is exact — floor and ceiling at once.** Spawn the level's count, plus the triage defender (One cycle, step 2) when one is required, and nothing else.

- **Not fewer.** A model that under-delegates otherwise folds two lenses into one reviewer, and the verdict table then carries rows nobody separately ran — a PARTIAL arriving disguised as a PASS.
- **Not more, and never per unit.** The count is per *round*, not per truth or per material: one reviewer holds the whole scope for its lens. Fanning out per unit multiplies cost by the scope size and buys nothing, since a lens's judgement is about the set.

Both directions are live: one model tier under-reaches for subagents and the next over-reaches, so the number is stated here rather than left to be inferred from "how thorough should I be".

### Material — by format risk

| format | level | reviewers | lenses run |
|--------|-------|-----------|-----------|
| md, txt | skip | 0 (validate only) | — |
| docx | light | 1 | M1 |
| xlsx, csv | standard | 2 | M1, M2 |
| pdf, image | full | 3 | M1–M3 |
| **any `origin: research`** | **full** | **4** | **M1–M4** |

The `lenses run` column exists because the selection rule is "fixed order, first *N* per level": M4 is fourth, so at a count of 3 it would never spawn — the rule and the reachability requirement would silently disagree. The truth axis carries the same column for the same reason.

**Precedence: `effective = max(config floor, format level)`** — a format's low level never lowers a higher config floor. When ambiguous, round up. `skip` = no cold reviewers; only `weavedoc validate` (mechanical checks) runs — for lossless formats (md→md) where conversion is a verbatim copy.

**Restatement overrides both: always `full`.** Any material whose converted.md is a *restatement* — conversation distillation, user-answer summaries, correction materials — is verified at `full` regardless of format or floor. **Risk scales with how much the agent rewrote, not with who supplied the source or the file extension**: "사용자 직접 제공이라 리스크 낮음" is backwards (a real run's only critical — a fabricated SUNO rule — came from exactly such a restatement, twice recommended for skipping).

**`origin: research` is always `full`, and adds a fourth lens — `M4 reachability-auditor` (reviewer count 4, not 3).** The machine both chose the query and read the result, so there is no human in the loop between the world and the record. M4 confirms the material is **re-reachable**: `url` + `retrieved_at` present, `source.md` holding the fetched values *as fetched* (raw units and timezone before any conversion), and every derived figure in converted.md traceable to one of them — a UT→KST conversion must show both sides. Without this a searched value is indistinguishable from a stated one, and a real run's entire age table came to rest on figures no later reviewer could re-check. On non-`research` materials M4 is `— (n/a)`, not PARTIAL.

### Truths — by volume

| truths | level | reviewers | lenses run |
|--------|-------|-----------|-----------|
| ≤20 | light | 2 | T1, T2 |
| 21–80 | standard | 3 | T1, T2, T3 |
| >80 | full | 5 | T1–T5 |

**A lens the level doesn't run is recorded `— (level)`, not PARTIAL.** PARTIAL means "this round should have shown it and didn't" and blocks like a should-fix; a lens that was never in scope isn't an unshown check, and treating it as one would make `light` and `standard` structurally unpassable. The verdict table lists every T#, marking the out-of-level rows `— (level)`; the pass condition is all-PASS **over the lenses the level ran**.

**T5 is not optional at `full`.** It's the only lens that reads the mine from outside, and the failure it catches — a guard whose tags hide it from `pull`, a claim narrower than its own body — is invisible to every reviewer holding the materials, including this one.

## Material verify — M1–M4

Target: one material (`materials/<id>/source.<ext>` + `materials/<id>/converted.md`).

Each lens marks **PASS / PARTIAL / FAIL** with evidence. An unshown check is PARTIAL, never PASS. "Looks fine" is not PASS — that waves an under-checked conversion through.

**A lens the level didn't run is `— (level)`, not PARTIAL** — the same rule as the truth axis, and for the same reason: `light` runs one reviewer and `standard` two, so marking the unrun lenses PARTIAL would make every `docx` and `xlsx` verify structurally unpassable. `M4` on a non-`research` material is `— (n/a)`. The pass condition is all-PASS **over the lenses the level ran**.

- **M1 Completeness** — on a `conversation`/`user-answer` material, START by reproducing the write-audit line (`쓰기 대조`, the final `> [machine-note]` gather step 7 leaves): re-run its counts. An absent line, or counts that do not reproduce, are findings — the line is the writer's claim, and this lens is where a claim gets checked. Then the lens itself: every section, paragraph, table, and data point in the original appears in converted.md. **Show the mapping**: original element → converted location. Missing content = FAIL.
- **M2 Accuracy** — every value (number, date, name, amount, label) in converted.md matches the original exactly. Cross-check ALL structured data: table cells, enumerated items, figures, dates, proper nouns. Show the comparison. Misread value = FAIL.
- **M3 Hallucination** — nothing in converted.md that isn't in the original. For image descriptions: no inference beyond what's visible. For xlsx: no formula interpretation stated as fact. Trace each element back. Untraceable element = FAIL.

- **M4 Reachability** — `origin: research` only. Can a later reviewer reach the same source and get the same value? `— (n/a)` on every other origin.

Lenses (fixed order, first *N* per level):
1. **completeness-scanner** (M1)
2. **accuracy-checker** (M2)
3. **hallucination-hunter** (M3)
4. **reachability-auditor** (M4) — spawned only for `origin: research`

## Truths verify — T1–T5

Target: **the truths `weavedoc scope` names unverified** (see §Scope), vs their source materials (`materials/*/converted.md`) — not the whole mine. Two lenses read past that set by their own nature, and that is not a scope violation: **T2** audits each in-scope material's entire `## m<id>` coverage section (completeness is a property of the material, not of the new truths), and **T5** reads the mine exactly as a consumer does — a consumer has no idea which truths are new. The other three examine the scope.

- **T1 Quote integrity** — the truth's `claim` accurately represents its verbatim quote (body). String existence of the quote in the source material → mechanical, routed to `weavedoc validate` (the anti-laundering seal). This lens judges *semantic*: does the claim faithfully render the quote's meaning? Claim drifts from its own quote = FAIL.
- **T2 Extraction completeness** — every load-bearing fact in each material's `converted.md` became a truth. Load-bearing includes **full-text artifacts** (가사 전문, 계약 조항, 코드/사양) whose exact wording matters — metadata-only extraction of such an artifact (the song's BPM but not its lyrics) is an omission. **Audit the ledger, don't free-recall:** check the material's `## m<id>` section in `truths/coverage.md` against converted.md — is every fact-bearing element present as extracted-or-skipped, is each `skipped:` reason legitimate, does each element's truth-id mapping hold? (`validate` already guarantees the ids exist and that every extracted truth appears in its section — the reviewer judges *meaning*.) A material with **no coverage section is PARTIAL, never PASS** — route to map to generate it; free-listing key facts from converted.md is the fallback only for that case. **Legacy escape (no deadlock):** for materials mapped before coverage existed, the user may rule the missing section accepted instead of forcing an immediate backfill — but the ruling is the user's, never the machine's. **Record it in `truths/coverage.md`'s `## legacy` section, not only in adjudications**: that is the one place `census` subtracts from the coverage denominator, so a ruling kept anywhere else leaves the ratio permanently short while T2 treats the material as exempt — the two escapes disagreeing about the same material. Important omission or an illegitimate skip = FAIL.
- **T3 Atomicity** — each truth is truly one fact (not two bundled). The claim matches the quote. Atomization didn't distort meaning. Bundled or distorted = FAIL.
- **T4 Tag coverage** — tags correct and sufficient for conflict detection (since detection is grep-by-tag, a mistagged truth hides from cross-checks). A fact about 일정 tagged only 개요 hides date conflicts from the search. Show the tag→content mapping. Mistagging = should-fix.

- **T5 Consumer readability** — read the mine exactly as `.weavedoc/READ.md` tells a consumer to — `pull`, the truth files it points at (rule 2), `index.md`/`tree.md`/`census` (rule 5), and `project.md` `required_tags` — and **nothing else**: no materials, no `source.*`, no coverage, no conversion history. Ask what a protocol-following reader would now believe. Every other lens reads *with* the mine's context; this is the one that can see a missing signpost. A guard whose tags keep it out of `pull`, a claim narrower than its own body, a superlative resting on discarded truths = the consumer is misled by a mine that is internally correct. **Its PASS is procedural** — pull the topics a writer would pull and show what each yields; a shown sweep that finds nothing is a PASS, an unshown one is PARTIAL. Without that rule the lens could never pass, because it has no reference to check against.

Lenses (fixed order, first *N* per level):
1. **claim-vs-quote** (T1)
2. **extraction-auditor** (T2)
3. **atomicity-checker** (T3)
4. **tag-auditor** (T4)
5. **consumer-reader** (T5)

## Mechanical floor (validate)

Before cold reviewers, run `weavedoc validate`. Beyond existing checks, validate now additionally checks:
- **Quote existence**: each truth's body text (the verbatim quote) appears in its source material's `converted.md` body (substring match). A mismatch = blocking. This is the mechanical seal against quote laundering — a conversion error cannot receive a "verbatim" stamp.

Non-zero validate exit = blocking finding regardless of the cold pass.

**Record floor.** `validate` proves the format; it does not prove the mine's records are true *about the mine*. Run `node .weavedoc/bin/weavedoc.mjs validate`, `scope`, `census` and `status` **before** spawning cold reviewers, and quote their counts rather than asserting your own: a ledger that reports zero while holding six, or a `passed` that never covered the units it claims, will otherwise burn reviewer budget on bookkeeping instead of meaning.

## Scope — read it from the tool, never decide it

Run `node .weavedoc/bin/weavedoc.mjs validate` first, **then** `scope`, before the baseline pin — in that order, always. A red validate blocks regardless of what scope says: validate reads the WHOLE mine (frontmatter, seals, gates, the register) while scope reads only the verification lanes, so a mine can be blocked for reasons scope never surfaces — and a scope-first flow that stops on an empty scope would end the round without the blocking finding ever being seen. Then verify what scope names. It prints the round's debt from the mechanical ledgers — the digest sidecar `truths/verify-ledger.tsv` first (**digest-bound / stale / failed**, decided by comparing each row's sha256 against current bytes), then the digest-less v1 records (a material's own `status`, markdown `## Verified units` rows) as **`legacy-unbound`** — so "what does this round owe?" is a number on screen instead of a judgement. **A round owes `unverified + stale + failed`.** `legacy-unbound` units are re-verified by risk priority (final-cited · high-risk · research/adopted/derived first), never wholesale. The markdown section's layout stays free (table or bullets); what makes an entry count is that it **ends with the verdict word `verified`**. An entry ending in anything else — a failed unit, an unrun axis, a legacy note — covers nothing, and `scope` names it rather than letting a missing word look like a ledger that hadn't got there yet.

- **Units it lists verified are not re-verified.** Re-covering one needs a reason written into `verify.md` *first*: a superseding material, a raised `repeat`, a lens the earlier level never ran. "확실하게 하려고" is not a reason.
- **Quote its numbers.** Don't restate them from memory or recount by eye — the same rule the record floor already applies to `validate`/`census`/`status`.
- **An empty scope with a green validate does not run a round.** Say so and stop. (Both conditions — an empty scope next to a red validate is a blocked mine, not a finished one.)

The level (below) is still read from the **mine's** truth volume, not the scope's — otherwise a mine that grows past 80 truths one small batch at a time would never once run T5, the only lens that reads it from outside. Scope decides *which units*; volume decides *how many lenses*.

This section is a command and not advice because scope was a judgement call and the judgement failed three rounds running: asked which truths a round owed, a real run answered "all of them" and put five cold reviewers across 264 truths, three times over, when `scope` would have said 40. The old loop's re-check grade table (since retired with it) said the same thing in prose and was never opened — which is why the rule now lives somewhere the round has to execute.

## One cycle — collect, then triage, then repair, then prove the repair

The loop used to alternate finding and fixing round by round, and the consecutive-clean gate guarded the wrong artifact under that alternation: `repeat` exists because consecutive rounds ask the same question of the same thing, but a fix between rounds **changes the thing** — step 0 pins only `source.*`, so every repair moved `converted.md` under a counter that presumed it frozen. Measured (a real mine, 4 rounds, 19 blocking findings): discovery of original defects was essentially complete after round 1, and 11 of the 19 sat in a previous round's repairs — repair is where defects are born, and it was the one step with no gate of its own. So the cycle moves the gate to the repair (owner-initiated, 2026-08-28: "일단 문제를 몇 라운드에 걸쳐서 최대한 다 긁어모으고 … 적절한 등급 산정을 하고, 그다음 수정 라운드"). Rounds recorded under the previous §One round shape remain valid history — `verify-ledger.tsv` and `verify.md` read exactly as before; the new structure applies from the next cycle, never retroactively.

0. **Pin the baseline.** Record each target material's `source.*` size + mtime (or hash). If any source file changed when the cycle ends, the cycle is **FAIL — baseline moved**: verification must never edit its own reference (a real run "resolved" hallucination findings by writing the hallucinated content *into* source.md, and the next round PASSed against the moved baseline). New information enters via a correction material (gather → supersede); machine annotations go in converted.md as `> [note]`/`> [machine-note]` lines — never into source. **Mechanical `validate` failures are the standing exception to "no fixes": repair them immediately, in any phase** — a broken seal invalidates collection itself.
1. **Collect — no fixes.** Cold rounds, all against the SAME bytes, at the level's reviewer count. Spawn as always: parallel subagents, empty context; each gets the target files + THE BAR + the checklist to fill + the do-not-raise list from prior adjudications — **NOT** how the conversion was done, not a prior round's discussion. **Read-scope:** a reviewer may also open any material the target's converted.md explicitly cross-references (a value labeled `(m012 대조)` needs m012 to check), and may existence-check the disposition ledgers (`gaps.md`, `questions.md`) — a decision recorded there is not a "missing" fact. **T5 is the one exception and it is not a widening but a swap:** whatever READ.md points a consumer at (`pull`, truth files, `index.md`/`tree.md`/`census`, `required_tags`), and **no materials at all**. Handing T5 a material destroys the lens — it exists precisely to be the reviewer who sees only what a consumer sees. Explicitly labeled derivations/cross-references are not raisable as hallucination. (Both reviewer-blindness false-positive classes from a real run.)

   Each round: aggregate into the M#/T# verdict table, dedupe by (where + what) within the round, take the higher grade on a clash, then **append the survivors to the found-list in the state file's round record — untriaged, nothing repaired.** Every later collection round receives that list as "**find what is NOT on this list**" — not as do-not-raise: a re-find through a different lens is corroboration of something real, recorded on the existing entry (measured: two lenses independently reached the same world-fact assertion, and it was real). Prior cycles' adjudications still apply as do-not-raise. **The phase ends when a round adds nothing new twice in a row** (measured: collection dries in 2–3 rounds). A round whose verdict table carries a PARTIAL does not count toward that dry pair — an unshown check is not a shown absence.
2. **Triage once, with the full set — by a separate cold defender, never yourself.** The defender is mandatory on `standard` and `full`, and **also mandatory at any level when this session produced the conversions being verified** — the producer must not self-triage (a real run's self-triage dismissed the same reviewer finding twice; it was the one error the user later corrected). It rules the whole found-list in one sitting — with the full set, defect **CLASSES** are visible that per-round triage structurally cannot see (measured: one class surfaced one member per round for four rounds and was named only in hindsight): dedupe across rounds, kill hallucinations and over-strict raises (drop: formatting-only, meaning-preserving reformulation, fails the "name what was lost" test, already-settled categories; never drop a quote-existence failure), **form classes**, then grade the survivors by entry ticket — the grades and tickets are defined **once** in the shared engine (reviewers.md, Findings format), a finding missing its ticket files one grade lower, and that formal test is the defender's DOWNGRADE call. **A semantic dismissal is not the machine's to make** — and a **downgrade** on semantic grounds is a dismissal too (at `strength: 1` a `critical`→`should-fix` downgrade removes the finding from the run as surely as a drop): if the drop-or-downgrade reason is "원문에서 함의됨" / "파생이라 무해" / "다른 파일에 기록됨", the finding goes to `## Human queue` in the state file — only the user's ruling turns it into a do-not-raise, with the one shown-evidence exception reviewers.md defines (the recorded-elsewhere close: verbatim quote + file and line + the finding command with its count). **The defender tags ownership as it writes the entry** — `[open] [user-only]` (answering needs information no material holds) / `[open] [recommended]` (a defensible answer is derivable; the user confirms taste or cost) / `[open] [machine]` (record hygiene, nothing to weigh). The tag belongs to the defender and not to you: an entry is here *because you wanted to dismiss it and couldn't*, so tagging it `machine` yourself would revive that dismissal one level up — the confirmation step renders `machine` items as a compact "just say go" list. **If no defender ran, write `[open] [user-only]`** — never a bare `[open]` (`validate` requires an ownership tag on every `[open]` entry) and never an untagged line (it would vanish from every count). `user-only` is the fail-safe direction: it surfaces the item, and only the user may move it down. For each finding that will be repaired, the defender writes a **one-line repair direction** — it becomes step 3's work order. Every found-list entry leaves this step classified — repair-bound (graded) / do-not-raise (condensed into categories) / Human queue: an unclassified entry is the gate violation that made a real run's round 2 re-discover four already-settled items.
3. **Repair once per class — critical + should-fix only.** `nice-to-have` findings are never repaired inside the cycle — route them to the Human queue / run notes (measured twice now: fixing nice-to-haves manufactured the next round's should-fixes, and the general form — 11 of 19 blocking findings born in repairs — is what this cycle exists to contain). One repair pass per defect class, under the **repair protocol**:
   - **Subtract first.** Measured: every repair that survived the cycle was a substitution or a deletion; every repair that seeded the next round's findings was an addition. A repair that adds a sentence must state why a substitution could not do it.
   - **Re-read the whole sentence or note you touch, not the flagged fragment.** A half-fixed sentence returned two rounds later as a critical.
   - **After repairing, re-run the write-audit over the whole file — prose included.** A backtick-only sweep waved a world-fact assertion, sitting in plain prose, straight through.
   - **Prefer a cold repairer — an unmeasured option, and stated as one.** A producer repairing its own work writes justification prose: it has something to defend, and that prose is where the next round's findings grew. The defender's one-line repair direction is the work order; an agent holding only the file + the finding + that line has nothing to defend. Unmeasured means unmeasured — no cycle has run with cold repairers yet, the "nothing to defend" mechanism is inference, and the counter-cost (a repairer short on context misreading the finding) is real; treat it as the default to try, never as settled doctrine.
4. **Prove the repair — `repeat` lives here.** Fresh cold rounds (step 1's spawn mechanics) at **full width: whole files, never the diff** — the class list says where to dig deeper, never where to stop reading (measured: a repair defect survived in the half-sentence *next to* the flagged spot; a diff-scoped check is built to miss exactly that). A proof round is **clean** when its verdict table is affirmatively all-PASS over the level's lenses (every check shown; an unshown check blocks like should-fix), no finding survives at the `config.verify.strength` bar (default 2 = critical + should-fix block), the baseline has not moved, and the defender made no **bar-crossing ticket-downgrade** (blocking at its claimed grade, non-blocking at the new one — the ladder in reviewers.md; that downgrade's test is the next fresh panel, so the cycle may not converge before it runs).
   - Clean round → `consecutive_passes` + 1. The repaired bytes must survive **`repeat` consecutive clean rounds** (read at this run's scale).
   - Any surviving finding → **back to step 2** (the defender triages it; repairs follow), and `consecutive_passes` goes back to **0** — always 0, never decremented: a repair moves the bytes, so the count of quiet rounds over those bytes restarts. This is the premise the counter always claimed — consecutive rounds asking the same question of the same thing — now true by construction, because nothing edits the target between proof rounds.
   - Write `consecutive_passes` into `truths/verify.md` frontmatter **after every round**, clean or not. It is the only reason a cold session can pick the cycle up mid-way instead of starting over.
   - **A cycle that collected nothing repairs nothing**, and its dry collection rounds already are clean rounds over unmoved bytes — they count toward `repeat`; keep spawning until the count is met.
5. **Budget and stop safety.** `config.verify.max_rounds` budgets the **whole cycle** — every cold round of every phase counts against it. Collection dries in 2–3 rounds measured, so the majority of the budget lands on proof rounds: verification strength goes where defects are born. Budget exhausted with the count still short → set `status: escalated`, take the open issues to the human, and report *how many* clean rounds in a row were reached (`5 rounds, 1/2 clean in a row`) — never as "passed". Do **not** approve.

`repeat` and `max_rounds` are unchanged in config — their **meaning relocated** with this section: `repeat` used to count alternating rounds whose target moved between them; it now counts proof rounds over frozen bytes (its own premise, restored). `max_rounds` used to cap the alternating loop; it now budgets the cycle.

## State & status

- **Material**: pass → set frontmatter `status: verified` **and run `node .weavedoc/bin/weavedoc.mjs attest verified <round> <level> <mID>`** — attest computes the digest and writes the sidecar row that makes the verdict digest-bound. The frontmatter flag alone is a v1 signal and reads as `legacy-unbound`. Fail/escalate → stays `converted` (record the failure with `attest failed …` so the round is on the ledger).
- **Truths**: `status: passed` is written **only when `consecutive_passes` reached `repeat`** — until then the file keeps `status: failed`/`in-progress` with the running count, even after a clean round. On pass, write/update `truths/verify.md` with the T# verdict table, `## Human queue`, and adjudications — then **attest the passed units** (`… attest verified <round> <level> <t-ids…>`): attest appends the digest rows AND mirrors the `## Verified units` line, so never hand-write that line (a hand-written row has no digest and reads as `legacy-unbound`). Recording the standard matters when `repeat` is raised later: units that cleared the old, lower bar are visible instead of silently inheriting the new one. When new truths are added (re-map), re-run verify on the affected tag clusters — `scope` flags any changed already-verified unit as `stale` from its digest automatically.
- **Per-unit honesty.** A global `passed` never covers units created or changed after the pass — those are `stale`/unverified for their unit, and every summary states the unverified count, naming what is unverified rather than its handle ("자료 16 중 verified 15 · 미검증 1 — 은지 프로필이 담긴 회의록"). A real run let a post-verify correction (m016/t218, cold-checked zero times) ride inside a "passed" mine.
- If verify itself edited truths, append the edits to `truths/changelog.md` like map does.

## Human confirmation — show this run's delta; never ask "정확합니까?"

The blanket question — "추출된 진실이 정확합니까?" over a whole mine — is **banned**. With no reviewable surface it hands the machine's job back to the human, whose only possible reply is "뭘 보고 확인해?" (a real user's verbatim reply).

What the human confirms is **the delta of this run**, rendered from `truths/changelog.md` (every block since the last `confirmed:` marker):

1. **List every truth added / edited / removed — the full delta, not a sample.** One line each: **the claim, in words** · provenance tag (`[말한 그대로]` = stated · `[제안 채택]` = adopted · `[계산]` = derived) · for edited: what changed (adoption, re-grounding, split). **The claim leads and the id does not appear** — a reader cannot tell what `t034` says without opening it, so a list keyed by id is a list of homework; if the user will need to point at a line, number the lines in the message. (Ids stay everywhere they already are: frontmatter, the changelog this delta is rendered from, coverage, the ledgers, the draft's citation comments.) Faithfully-sourced entries are listed too, **because recording can distort even direct user statements** (a real run re-based a user's stated reason onto a different biography fact) — only the user can see that their words were reflected correctly.
2. **Highlight the judgment set** on top of the list: `adopted`/`derived` truths, hedges hardened into assertions, machine-made negative propositions, guideline grade changes — labeled honestly ("리뷰어가 2회 지적, 기계는 '함의됨'으로 유보"). Each carries one line of **what breaks if it's wrong** ("만나이라면 나이표 전체가 한 살 밀림") + the truth link.
3. **Render the Human queue split by ownership — always, unprompted.** Not one list of open entries, but three groups in this order, with counts: **당신만 답할 수 있는 것** (`user-only`) → **추천은 있지만 취향인 것** (`recommended`, each with your recommendation and its one-line why) → **"해줘" 한마디면 되는 것** (`machine`, listed compactly; no per-item decision needed). The user should never have to ask "내가 결정해야 하는 게 뭔데?" to get this — in a real run they did, after eleven entries had been reported as a flat list, and the split turned out to be 1 / 3 / 7. If `user-only` is empty, say so plainly: it means nothing is actually blocked on them.
   - **The ownership tag itself is the user's to overturn — per entry and per category.** When the user answers the split with "이건 왜 나한테 오냐", that is a ruling **about the TAG, not about the entry's** content. Close the entry `[ruled]`, apply the recommendation it carried, and **record the user's words verbatim plus the fact that the machine read them as a tag ruling** — a misread must stay reversible. When the same kind repeats, harden it into a do-not-raise category. Why this path exists: only a user ruling can move a tag down (reviewers.md), and until this rule the spec had no path for the user to challenge the tag itself — so conservatively-tagged entries accumulated until each drew an item-level ruling (measured: a round escalated two entries the owner answered with exactly that question; neither held anything to decide).
4. **State the mechanical guarantee** so the human reviews meaning, not typos: "축자 인용 존재는 validate가 N/N 확인 — 가사·프롬프트 전문의 오탈자 검토는 불필요합니다."
5. **Offer graded responses** — 훑어보기 / 항목별로 나열해줘 / 넘어가기 — plus the rollback promise ("나중에 틀린 게 나와도 map 정정으로 되돌릴 수 있습니다").
6. **Record what actually happened.** A blanket pass ("이대로 가도 될 것 같아") is appended to changelog as `confirmed: <date> (blanket)` — never expanded into per-item confirmations in any file. At `strict`, blanket-confirmed judgment items stay listed at lower priority for the next delta; at `standard` and `delegated` they do **not** come back. Re-listing something the user already passed on is asking twice, and a delta that keeps returning answered items trains the reader to skim the one that finally matters.

- **Material**: "이 변환이 정확합니까?" — the human confirms an already-verified conversion, not doing the verification themselves; same delta principle (show what this conversion added/changed).
- Escalated or rejected → fix and loop back; nothing advances.

## Report
Open and close this run with the **step report** — the fixed shape in `.weavedoc/FORMATS.md` ("The step report"): the `[weavedoc-verify material]` / `[weavedoc-verify truths] starting` anchor and 2–4 sentences, then `done — …` carrying `Result` · `Open` · `Your turn` · `Next`, in that order, none omitted. `Next` is the section below. What this skill puts in the two middle slots:
- **Open** — blocking findings not yet repaired, units this round did not reach (`weavedoc scope` owes the list), and a round count still short of `repeat`.
- **Your turn** — every `Human queue` entry this round wrote, and the confirmation deltas that are the user's to accept or reject.

## Next
- After **material verify** → still in the mine-building phase; **map** is available to extract truths.
- After **truths verify** → the mine is built and verified, which **closes the mine-building phase**. Writing a document is a separate phase, enterable with **plan** when the user wants — or the mine can keep growing (gather / map more). Neither is required. Present it as available ("이제 plan을 할 수 있습니다"), never as an obligation.
