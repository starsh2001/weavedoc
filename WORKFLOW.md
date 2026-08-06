# WeaveDoc workflow and skills

> This document defines how WeaveDoc actually runs — the steps, their order, what each produces, and how the skills are divided.
> The *why* lives in [METHODOLOGY.md](METHODOLOGY.md); the artifact formats live in [.weavedoc/FORMATS.md](.weavedoc/FORMATS.md) (the parser contract).

---

## 1. The big picture

WeaveDoc's goal is a document that is **faithful to a declared source** — nothing invented, nothing contradicting, nothing required omitted — built from materials you vouch for and gated before it ships.

```
init (once)
  → gather → map → plan → write → review ⇄ refine → done
  → a finished document re-enters as a material for the next one
```

Two loops close the line into a cycle:
- **Ask loop** — when a document needs a necessary fact the materials lack, WeaveDoc asks; your answer becomes a cited `user-answer` material.
- **Growth loop** — a finished `final.md` re-enters as an `origin: prior-doc` material, so the declared source grows (kept contradiction-free by the gate — the membrane).

Materials enter through several channels — a dropped file (`inbox/`), a **declared conversation** that gather distills (`origin: conversation`), an ask-loop answer (`user-answer`), or a finished document (`prior-doc`) — all converted, classified, and cited the same way. Whatever the channel, the user must *declare* the source; WeaveDoc never absorbs one unasked.

Each step is its own skill, invoked by natural language. State lives on disk (`status` frontmatter); you advance by doing the next thing, and the human gates still pause you (structure approval, the ask batch, the final confirm).

---

## 2. The nine skills

One per step of the flow, plus two on-demand lanes (verify · gaps) that guard the mine between steps.

| Skill | Step | What it does | Out |
|---|---|---|---|
| `weavedoc-init` | 0 | First-time setup. Captures the project's character (roles · tone · language) and the per-project knobs (fidelity·conflicts·review) so later steps run autonomously. | `.weavedoc/config.yaml`, `project.md`, workspace folders |
| `weavedoc-gather` | 1–2 | Intake `inbox/` — or a **declared conversation** — move in (inbox is a queue; outside sources are copied) / distill, convert to readable markdown (a **mirror** — nothing added), classify (role + topics + stage). Also owns **material retraction** (mark `status: retracted`, never delete; map propagates). | `materials/<id>/`, `catalog.md` |
| `weavedoc-map` | 3 | Extract truths from materials, tag and classify them — and, above all, **hunt where they contradict each other** (§4). Every value carries its author (§5). Also the entry point for **correcting** an existing truth (by re-grounding, never retyping). | `truths/*.md`, `truths/coverage.md`, `truths/changelog.md`, indexes via `reindex` |
| `weavedoc-verify` | 1–3 gate | Cold verification of the two upstream hops — `material` (원본↔converted.md) · `truths` (converted.md↔truths) — by empty-context subagents (§3's engine); baseline pinned for the round; the human confirms the run **delta** (§5), never "정확합니까?". | material `status: verified`, `truths/verify.md` |
| `weavedoc-gaps` | coverage | Mine completeness register — declared markers, dangling references, count mismatches, peer asymmetry; every gap consciously **filled or accepted** (never a hard block). | `gaps.md` |
| `weavedoc-plan` | 4 | Propose a structure + tone + section→material map; ask about structural gaps. | `documents/<doc-id>/plan.md` |
| `weavedoc-write` | 5 | Draft section by section, every claim grounded and cited; check truth statuses before citing; queue necessary missing facts and ask. | `draft.md` |
| `weavedoc-review` | 6 | The **fidelity gate** (mandatory) + a cold **advisory** panel (§3). | `review.md` |
| `weavedoc-refine` | 7 | Resolve every fidelity violation + advisory findings per the gate; loop to a clean gate; only then `final.md`. | `final.md` |

---

## 3. Review: the fidelity gate + the advisory panel

Step 6 runs in two distinct passes — keep them separate, because one is the product and the other is polish.

### A. The fidelity gate — mandatory, not editable, never skipped

Runs first, always (even at `review.scale: skip`, which skips only the advisory panel). Its findings are **facts, not opinions**: never triaged down, never adjudicated away; any open one blocks `final.md`. In priority order:

- **A0 · Conflict detection — the #1 job.** The top priority of the whole review, with the most effort. Do **not** merely trust existing truth statuses — *actively re-hunt*: grep truths by tag, cross-check every structured fact against same-tag truths, exhaustively (depth per `config.conflicts.detection`). A violation is a claim citing a truth with `status: conflict`, a silent pick with no recorded resolution, an unauthorized attribution, or a truth-vs-truth contradiction the map missed.
- **A1 · Grounding.** A claim that traces to no material, or whose citation is invalid.
- **A2 · Completeness.** *Only if* `config.fidelity.completeness: required` — a required element/section absent.

Findings are written to `review.md` `# Fidelity violations` as `- [<kind>] <where> — <what>`, kind `contradiction | unsupported | missing-required`.

### B. The advisory panel — optional, editable

Cold, empty-context persona subagents run in parallel, each told "find flaws; assume there's a problem": **logic · gap-finder · reader-proxy · editor · breaker**. Counts/effort scale by `config.review.scale`. An over-strictness triage (KEEP / DOWNGRADE / DROP) drops nitpicks — **applied to advisory findings only, never to fidelity violations**. Written to `review.md` `# Findings` with severity `critical | should-fix | nice-to-have`; `adjudications` record dropped/accepted advisory calls so a later cold round doesn't re-litigate them.

### The deterministic floor

`weavedoc validate` mechanically confirms the invariants the gate rests on (§6). The AI gate judges *meaning*; `validate` enforces *form and graph*. A non-zero exit is a blocking violation regardless of the AI pass — a miss in one is caught by the other.

---

## 4. Conflict handling (source-vs-source)

Handled across map (detect + resolve), write (guard at citation), review (re-hunt, block), refine (resolve only through the record).

1. **Detect** (`map`): extract truths from materials and tag them. For each tag cluster, compare truths — AI reads related truths by grepping tags and judges conflicts on the fly. Each conflict → set `status: conflict` + `conflict_with` on both truth files.
2. **Resolve** (`map`): mechanically if a rule applies —
   - the conflicting truths' source materials have a `supersedes` relation — both carry `dated` (the source's own date, not `added`) and one is newer → newer wins. Missing `dated` on either side means the rule does not apply, and the machine asks instead of guessing;
   - `project.md` `authority` ranks the roles → higher wins;
   - otherwise **stop and ask** the user: A / B / real value / keep both. Record the choice in **both** truths' `resolution` fields — the loser → `status: discarded` (out of the mine, kept as audit trail), the winner **stays `ok`** carrying the resolution as history; "keep both" (attribute) → both stay `ok` — only if the user chooses it (or `conflicts.attribution: allow`). Never auto-pick, never auto-attribute.
3. **Guard** (`write`): before citing, check the truth's `status` — cite `ok` only (an attribute-resolved truth is written both-sides); a `discarded` truth points to its successor via `resolution.winner`; never cite `conflict`.
4. **Re-check** (`map`, on a later run): re-run detection over the grown source by re-reading tag clusters; **re-open** a settled resolution a new material now contradicts (the `ok` winner goes back to `conflict`).

Each truth file carries its own `status` + `resolution`, stable across the series. See [.weavedoc/FORMATS.md](.weavedoc/FORMATS.md).

---

## 5. Who authored a value — provenance and the confirmation surface

The fidelity gate keeps the record faithful to the sources. This layer guards the **other door** — machine output entering the human's record — where a testbed run showed every major failure walks in: proposed values recorded like user statements, silently-chosen conventions riding into computed "facts", interpretations hardened into negative propositions.

- **Provenance on every truth** — `stated` (the source says it) / `adopted` (machine proposed, user adopted — the adoption exchange preserved in the source material) / `derived` (machine computed — must carry `derived_from` + `assumptions` for every premise no material states, and time-varying claims an `as_of` phase/date anchor). "The machine never silently picks" must hold **in the files**, not just in chat.
- **A run log** — `truths/changelog.md`: map · verify each append their run's delta (added / superseded / edited / removed, each with its provenance tag).
- **The confirmation surface is the delta, never the mine.** verify's human step must not ask "추출된 진실이 정확합니까?" over the whole truth set — unanswerable, and it hands the machine's job back. It renders the changelog since the last confirmation: **the full list** of added/superseded/changed truths — including faithfully-sourced ones, because recording can distort even direct user statements and only the user can see their words were reflected right — with the **machine-judgment set highlighted** (adopted/derived values, hardened hedges, machine-made negative propositions, and each reviewer finding the machine wanted to dismiss on semantic grounds, which waits in a Human queue for the user's ruling). Mechanical guarantees are stated ("축자 인용 존재는 validate가 N/N 확인") so the human reviews meaning, not typos; a blanket pass is recorded as a blanket, never as per-item approvals.
- **The closing report carries the open items themselves.** Whatever a run leaves waiting on the human — conflicts, questions, Human-queue entries, fidelity violations, gaps — is stated in the closing message: what it is · the issue in one line · what's needed, the file path as reference after the substance, never instead of it. "questions.md를 확인하세요" alone is the same no-reviewable-surface failure moved to the handoff (ruled 2026-08-06; every skill carries the rule as "Surface, don't point"). `weavedoc status --open` prints the full list mechanically — the closing report renders that output, never a from-memory recount.
- **Verification never moves its own baseline** — source files are pinned (size/mtime) for the round; new information enters as a correction material, machine annotations only as marked `> [note]` / `> [machine-note]` lines in converted.md.
- **Adjacent record guards, same door.** `resolution.decision_kind` (`supplied` | `ratified`) keeps a machine-originated value the user waved through traceable as machine-originated — `ratified` items join the priority re-verify set. Material `stage` (`plan` | `applied`) stops plan/proposal content masquerading as usage history. `questions.md` runs `open → proposed → answered`, and `answered` requires a quotable user utterance recorded with the entry — silence is never confirmation.

---

## 6. Deterministic checks (`.weavedoc/bin/weavedoc.mjs`)

A dependency-free checker — the mechanical floor under the AI gate. Requirement: **Node 18+**, and nothing else (`node:fs`, `node:path`, `node:crypto` only — no `package.json`, no `npm install`). The bash 4 + GNU awk/sed floor belonged to the runtime this replaced, deleted in bundle `2026-08-05.3`. Linux, Windows and macOS all gate the release. Format source of truth is `.weavedoc/schema` (which `FORMATS.md` mirrors).

- **`validate`** — format + truth coherence, exits non-zero with the list:
  - required frontmatter · enums · `id` matches filename · role ∈ project roles;
  - catalog ↔ materials (orphans both ways);
  - every truth `source` resolves to an existing material;
  - **every truth with `status: conflict` has a matching `conflict_with` entry**;
  - **every `required_tags` tag has at least one truth**;
  - **no `final.md` with a non-empty `# Fidelity violations`** (the membrane, mechanically);
  - **`provenance` enum valid; `derived` truths carry `derived_from`** (a derivation must show its chain);
  - **each truth's body appears verbatim in its source** (the anti-laundering seal — a paraphrase fails);
  - **`index.md` ↔ truth files in sync** (ids both ways — hand-edit drift fails validate);
  - **a `retracted` material grounds nothing** — its truths must be `unsupported`/`discarded`, and no `resolution.winner` may reference it (basis gone → re-open);
  - **`truths/coverage.md` cross-checks** — sections resolve to materials, mentioned ids exist, every truth from a sectioned material appears in its section;
  - **`origin: research` materials carry `url` + `retrieved_at`**, and their truths are never `provenance: stated` (nobody *stated* a fetched value — the laundering `origin: research` blocks at the material level would otherwise resume one level down);
  - **`corrects` references resolve** and nothing corrects itself;
  - **a `retracted` truth has a `removed:` line in the changelog**, and one side of an open conflict is never retracted alone (otherwise the survivor stays permanently unusable with no decision on record);
  - **`truths/verify.md` frontmatter/enums valid**;
  - **every `[open]` Human queue entry carries an ownership tag**;
  - config enums valid.
- **`reindex [--check]`** — regenerates `truths/index.md` + `tree.md` from truth frontmatter, the **only** writer of those files (hand-editing them consumed ~45% of a real map run's tool calls and corrupted an entry). `--check` diffs without writing.
- **`census`** — the mine's authoritative statistics: truth files vs index entries, id numbering holes, live/status tallies, coverage-manifest count. Skills report **these** numbers, never eye-counts (a real run misreported the mine by 3 and missed a hole). `retracted` truths are tallied separately (they are not `live`). Two numbers were made *answerable* rather than merely honest: a hole the changelog explains as `removed:` is reported as settled instead of re-asking forever, and the coverage denominator subtracts user-ruled `## legacy` exemptions so the ratio can actually reach N/N (a real mine sat at 16/26 with no path to closing it, and a metric that can't be closed stops being read).
- **`retag <old> <new> [--dry]`** — renames/merges a tag across every guaranteed-format site (truths `tags`, project `required_tags`, plan `scope_tags`), then reindexes. Free-text mentions (gaps.md, questions.md, verify.md) are listed for review, never rewritten blind.
- **`pull <term>`** — the read-side counterpart of census: a protocol-correct lookup for consumers **outside** the pipeline (creative sessions, other tools, ad-hoc questions). Searches claims+tags (body-text fallback) and applies `.weavedoc/READ.md` mechanically — superseded → winner pointer, conflict/unsupported → flagged unusable, `as_of`/derived/plan-stage labels attached. `init` plants an idempotent CLAUDE.md pointer block so any session in the repo hits the protocol before reading the mine raw.
- **`gaps`** — census + the mechanical declared-marker scan (markers + unchecked checkboxes) that floors the `weavedoc-gaps` skill.
- **`scope`** — the unverified set: materials whose own `status` is not yet `verified`, and truths no `## Verified units` entry covers. `weavedoc-verify` reads its round scope from this instead of deciding it, and re-covering a listed unit needs a reason written into `verify.md` first. The command exists because scope was a judgement call that failed three rounds running — "which truths does this round owe?" was answered "all of them", five cold reviewers across 264 truths, three times, when the number was 40. The section's layout is free (table or bullets); what an entry must do is **end with the verdict word `verified`**, and an entry ending in anything else (`**미통과**`, `R3 미실행`, a legacy note) covers nothing and is named rather than silently ignored.
- **`impact <material-id>`** — which truths were extracted from this material, which documents cite them (the blast radius when a source is superseded or re-opened).
- **`status`** — each document's stage + next step, **plus the open Human-queue split** (`user-only` / `recommended` / `machine`), so a completeness line can never read "열린 갭 0 · 열린 질문 0" while decisions sit waiting on the user. **`status --open`** lists the waiting items *themselves* — every open conflict · question · Human-queue entry · fidelity violation · gap, one line each, from the same collectors the counters use — the mechanical source the skills' closing reports render ("Surface, don't point"). **`lang` / `locale`** — project language, and OS-language detection for init.

It's a bonus enforcement floor (CI-friendly); the core loop runs on the skills + the gate without it, but `refine` runs `validate` before writing `final.md`, so consecration can't slip a graph-level violation.

---

## 7. Sessions and how the skills are divided

- **The gate and the advisory panel spawn cold reviewers as subagents** (empty context = independence). Run the skills from the main session; never run a weavedoc skill *as* a subagent (it then can't spawn reviewers and degrades to a warm self-check).
- **One writing session per mine, at a time** (the single-writer contract — FORMATS.md). Cold reviewers read; they never write. Two sessions writing to one mine can lose committed work silently, and re-running the command is *not* the repair for a lost seal or verification row. The CLI refuses a second mutating command, but it cannot see an agent editing mine files directly — so don't point two working sessions at the same mine.
- **One step per skill** keeps any single session bounded — no session carries the whole build. Each skill reads only what it needs from disk at the time.
- **The split is by *step*, not by role.** Each step ends and hands to the next explicitly. WeaveDoc fixes only the order of steps, the gate, and the conflict rules — it leaves *what to write* within each step open. The methodology is built into the skills; this document is the map.

---

*The why: [METHODOLOGY.md](METHODOLOGY.md). The formats: [.weavedoc/FORMATS.md](.weavedoc/FORMATS.md).*
