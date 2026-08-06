# WeaveDoc

**A document workflow that guarantees fidelity to the materials you vouch for — no detected contradiction ships silently, no unsupported claims, no silently passed gaps (and with the completeness warranty on, no unaccepted ones). You declare the truth; WeaveDoc guards it.**

WeaveDoc is a set of [Claude Code](https://claude.com/claude-code) skills + templates. You drop your materials in; it classifies and converts them, maps how they relate, drafts the document grounded strictly in those materials, and runs a **fidelity gate** — blocking any contradiction, unsupported claim, or (when configured) missing required element before the document can ship. It never invents facts: where a needed fact is missing, it asks you, and your answer becomes another cited source. A finished document re-enters as a material, so the truth-source grows — and the gate keeps that growth free of contradictions.

> **Scope:** WeaveDoc writes *documents* from materials. It does not write code; integration with other tools is left to you.

## The problem it targets

- **Hallucination** — document tools invent facts that aren't in the sources.
- **Blank gaps** — or they leave holes, or paper over broken logic.
- **No warranty** — generated once, never checked against the source, so contradictions ship unnoticed.

WeaveDoc's answer: ground every claim in a material and cite it; for a genuinely missing, *necessary* fact, **ask** — the answer becomes a source — never invent, never silently blank; and **block** any fidelity violation before the document can become final. The fidelity gate is the product; multi-persona quality review runs on top, but it's advisory — it polishes, it doesn't block.

## How it works

```
init (once)
  → gather → map → plan → write → review ⇄ refine → done
  → a finished document becomes a material for the next one

on-demand lanes: verify (cold-checks each upstream hop) · gaps (is the world covered?)
```

- **Materials first.** Everything is built from materials you provide — files, or a conversation you declare as the source. AI handles most of it autonomously; you are asked only for a necessary fact the materials don't contain.
- **A graph, not a tree.** Materials relate many-to-many (supports, contradicts, supersedes…); the graph captures that, and the writing draws on it.
- **Fidelity gate.** Before a document can ship, a mandatory check blocks contradictions — **including where your own sources disagree with each other** — unsupported claims, and (for normative docs like contracts) missing required elements. Catching source-to-source conflict is its #1 job. This gate cannot be skipped or edited away — it is the warranty.
- **Advisory review.** On top of the gate, cold multi-persona reviewers hunt quality flaws (logic, clarity, persuasiveness). Helpful, but never blocking — the gate is the product, review is polish.
- **Growing truth-source.** A finished document re-enters as a material, so a later document can build on it and cite it. The fidelity gate is the membrane: nothing enters the material set with an open contradiction.

## The skills

| Skill | What it does |
|---|---|
| `weavedoc-init` | First-time setup. Creates the workspace, `project.md` (the project's character · roles · tone), and `.weavedoc/config.yaml`. |
| `weavedoc-gather` | Collect materials from `inbox/`, classify each (role + topics), convert to readable markdown. → `materials/`, `catalog.md`. |
| `weavedoc-map` | Extract atomic truths from materials, tag and classify them, hunt contradictions; correct existing truths on demand. → `truths/*.md`, `truths/changelog.md`, indexes via `reindex`. |
| `weavedoc-verify` | Cold verification of the two upstream hops — material (원본↔converted.md) and truths (converted.md↔truths) — by empty-context subagents; baseline pinned, human confirms the run **delta**. → material `status: verified`, `truths/verify.md`. |
| `weavedoc-gaps` | Mine completeness register — declared markers, dangling references, count mismatches, peer asymmetry; every gap consciously **filled or accepted**. → `gaps.md`. |
| `weavedoc-plan` | Propose a document structure (template) + tone + outline, mapping each section to its materials; ask about structural gaps. → `documents/<id>/plan.md`. |
| `weavedoc-write` | Write the draft from the plan, grounded in materials and cited; queue genuinely-missing necessary facts and ask them. → `draft.md`. |
| `weavedoc-review` | **Fidelity gate** (mandatory: contradiction / unsupported / missing-required) + cold advisory multi-persona review. → `review.md`. |
| `weavedoc-refine` | Resolve every fidelity violation (all of them) + advisory findings per the gate; loop until clean. Only a clean gate produces `final.md`. |

## Artifacts

```
project.md              the project: character · roles · tone
inbox/                  drop raw materials here — a queue: gather MOVES each file
                        into its material folder on intake, so an empty inbox = nothing pending
materials/<id>/
  source.<ext>          the original, moved in — the AUDIT layer. A root `.ignore` shields it
                        (and inbox/) from content searches, so a casual grep can never hand you
                        raw, superseded text; open it deliberately by path when auditing
  converted.md          readable markdown + metadata (role · topics · summary)
catalog.md              index of all materials (generated)
truths/
  t<NNN>.md            atomic facts extracted from materials (tagged, with status + provenance; ids zero-padded to 3+ digits: t001, t042, t1000)
  index.md             flat one-line-per-truth index (generated by reindex only)
  tree.md              tag-grouped view for dashboard (generated by reindex only)
  coverage.md          extraction coverage manifest (element → truth ids — T2's audit surface)
  changelog.md         append-only run log — the delta the human confirms
  verify.md            truths-verification state (verdict table · verified units · human queue)
documents/<doc-id>/
  plan.md               template · tone · outline · section→material map
  draft.md              the draft, improved in place
  review.md             fidelity violations (mandatory gate) + advisory findings
  final.md              the finished document (only through a clean fidelity gate)
questions.md            the open-questions queue (open | proposed | answered)
gaps.md                 the mine completeness register (# Open / # Accepted)
.weavedoc/config.yaml   language · paths · fidelity · review settings
.weavedoc/schema         the format contract (machine SoT; FORMATS.md mirrors it)
.weavedoc/READ.md        the read protocol — how ANY consumer safely reads the mine
.weavedoc/bin/weavedoc.mjs  deterministic checks — validate · pull · impact · status · scope ·
                         attest · seal-review · consecrate · upgrade · gaps · census · reindex ·
                         retag · version · lang · locale
.weavedoc/bin/lib/       the runtime's modules (the behavior lives here, not in the entrypoint)
.weavedoc/VERSION        runtime bundle label (date) — identity is `version`'s fingerprint, not the date
```

**Field names and section headers are fixed English — the parser contract. Content is written in your project's language** (`config.language`, set once at init). Plain language, no coined terms. Full spec: [.weavedoc/FORMATS.md](.weavedoc/FORMATS.md).

## Using it

WeaveDoc is a set of Claude Code skills. To use it in a project:

1. Copy `.claude/skills/weavedoc-*` and `.weavedoc/` into your repo.
2. Ask Claude: **"weavedoc init"** — it creates the workspace and `.weavedoc/config.yaml`.
3. Drop materials into `inbox/`, then: **"gather"** → **"map"** (with **"verify"** after each to cold-check the hop, and **"gaps"** to check completeness) → **"plan the report"** → **"write it"** → **"review it"** (→ **"refine"** until clean).

**One writer per mine.** WeaveDoc is a single-writer tool: run one mutating session (and one mutating command) against a mine at a time. Two writers can lose committed work silently — and a lost review seal or verification row is *evidence*, so re-running the command is not the repair (FORMATS.md states the contract and the recovery). The CLI refuses a second mutating command at the door; it cannot see an agent editing mine files directly, so don't point two working sessions at one mine.

**Keeping installs in sync.** `node .weavedoc/bin/weavedoc.mjs version` prints three lines: the bundle date label, the **fingerprint** (bin+schema content hash — compare THIS, two installs can share a date while their bin differs), and the **schema version** this runtime reads. Releases add a SemVer tag whose bundle manifest covers every behavior-deciding file. If you evolve the skills/runtime *inside* a project (the testbed pattern), backport here and bump `VERSION` — the runtime once grew two weeks ahead inside a testbed while this repo went stale.

## Deterministic checks

`.weavedoc/bin/weavedoc.mjs` ships a dependency-free checker — **the mechanical floor under the AI fidelity gate.** It needs **Node 18+** and nothing else: `node:fs`, `node:path` and `node:crypto` only, no `package.json`, no `npm install`. Deployment is unchanged — copy the folder.

> **One runtime now.** The original Bash implementation at `.weavedoc/bin/weavedoc` was the parity reference this one was graded against; it shipped alongside for exactly one release and was removed in bundle `2026-08-05.3`. The two agreed on the whole regression suite, on 350 broken mines command by command, and on the resulting bytes on disk for every write command — that last comparison is pinned in `tests/baseline/parity-final-2026-08-05.md`, so "were they really the same" has an answer that does not depend on anyone's memory.
>
> On Windows, invoke through **PowerShell** rather than Git Bash: Git Bash pays ~290ms per process to emulate Unix (373ms vs 80ms for one invocation). Never wrap it in a `.ps1` — the execution policy applies to `.ps1` files and a downloaded one is blocked under `RemoteSigned`, while `node script.mjs` is not subject to it at all.
>
> Linux, Windows and macOS all gate the release.

- `validate` — format + truth coherence: frontmatter/enums/ids, catalog ↔ materials orphans both ways, every truth `source` resolves to a material, `conflict` truths carry `conflict_with`, `discarded` truths carry a `resolution` (and the winner/loser stamps match the record — a winner stamped `discarded` or a loser stamped `ok` fails), `provenance` enum valid and `derived` truths show their `derived_from` chain, **each truth's body appears verbatim in its source** (the anti-laundering seal), every `required_tags` tag has at least one truth, `index.md` ↔ truth files in sync both ways, a `retracted` material grounds nothing (its truths `unsupported`/`discarded`, no resolution winner references it), `truths/coverage.md` cross-checks (sections resolve, ids exist, sectioned materials complete), `origin: research` materials carry `url`+`retrieved_at` and their truths are not `provenance: stated`, `corrects` references resolve, `retracted` truths have a `removed:` line and never strand the other side of an open conflict, every `[open]` Human queue entry carries an ownership tag, no `final.md` ships with a non-empty `# Fidelity violations`. Exits non-zero with the list.
- `census` — the mine's authoritative statistics: truth files vs index entries, id numbering holes (split into *unexplained* and *explained by a changelog `removed:` line*), live/status tallies with `retracted` counted separately, and `coverage records N/M of TOTAL (K legacy-exempt)` — the raw total is always shown, because `16/26` and `16/16 (+10 exempt)` describe the same mine and a reader comparing two reports would otherwise see progress that never happened. **`coverage records` counts materials that hold at least one line in `truths/coverage.md`; it is a ledger count, not a completeness warranty** — one recorded element out of fifty still counts the material. "Is everything that should be extracted here?" is a different axis, owned by `weavedoc-gaps` and the truths verify lane. Skills report these numbers, never eye-counts.
- `reindex [--check]` — regenerates `truths/index.md` + `tree.md` from truth frontmatter; the **only** writer of those files (`--check` diffs without writing).
- `retag <old> <new> [--dry]` — renames/merges a tag across truths `tags` / `required_tags` / `scope_tags`, then reindexes; free-text mentions are listed for review, not rewritten.
- `pull <term>` — protocol-correct mine lookup for consumers *outside* the pipeline (creative sessions, other tools): searches claims+tags (body fallback) and mechanically applies the read protocol — superseded values point to their winner, unresolved conflicts / unsupported truths are flagged unusable, `as_of` / derived / plan-stage labels attached. See `.weavedoc/READ.md`; `init` plants a CLAUDE.md pointer so every session hits the protocol.
- `gaps` — the mechanical declared-marker scan (미정/TBD/unchecked checkboxes) that floors the `weavedoc-gaps` skill.
- `impact <material-id>` — which truths were extracted from a material and which documents cite it (the blast radius when a source is superseded or re-opened).
- `scope` — what a verify round still owes, split by evidence class: **verified (digest-bound)** — a `truths/verify-ledger.tsv` row whose sha256 matches the unit's current bytes · **legacy-unbound** — a digest-less v1 record (a material's own `status: verified`, or a markdown `## Verified units` row) that is preserved history but binds no bytes · **stale** — digest mismatch, the unit changed after verification · **failed** · **unverified**. A round owes `unverified + stale + failed`; legacy-unbound is re-verified by risk priority, not wholesale. The verify skill reads its round scope from here rather than deciding it — asked which truths a round owed, a real run answered "all of them" and put five cold reviewers across 264 truths, three rounds deep, when the answer was 40.
- `attest <verified|failed> <round> <standard> <id...>` — the verification write path: computes each unit's digest (the one spelling of the hash rule — truth = whole file; material = `converted.md` minus its lifecycle `status:` line), appends sidecar rows (append-only, last row per id wins), and mirrors a readable line into `## Verified units`. All-or-nothing on an unresolvable id; tombstones are refused.
- `seal-review <doc-id> [draft|final]` — pins a finished review round to the exact bytes it reviewed (`reviewed_digest`) and the ground its verdict rests on (`review_context_digest`: cited truths, their sources, config, schema). `validate` hard-fails a final whose bytes or context differ from its sealed review; a digest-less (v1) review reads as legacy-unbound — shown, non-blocking.
- `consecrate <doc-id>` — the only write path to final: re-checks the gate with validate's own reader, verifies seal + draft + context, stages a candidate on the same filesystem, runs **one** full validation with the candidate in place, and atomically promotes — any failure preserves the original final byte-for-byte.
- `upgrade [--check|--dry-run|--apply]` — v1 mine → schema 2. Check and apply are separate; apply is staged with a backup + manifest, ends in a full validation, and rolls back byte-identically on failure. History is preserved as `legacy-unbound`, never back-stamped with a digest. See [UPGRADING.md](UPGRADING.md).
- `status` — each document's stage and its next step, plus the open Human-queue split (you decide / recommendation ready / machine can just do). `status --open` lists the waiting items themselves — every open conflict · question · Human-queue entry · fidelity violation · gap, one line each, from the same collectors the counters use — so a closing report can paste the list instead of re-composing it. `version` — bundle date · fingerprint · schema version.
- `lang` — the project's prose language from config (skills read every reply's language from this). `locale` — the OS language probe init uses for its default (a short code + exit 0, or empty + exit 1 meaning "init should ask").

**The `examined:` line.** Every `validate` run prints, before its verdict, what it actually looked at:

```
  examined: materials 27 · truths 255 (255 sealed) · documents 1 (1 consecrated, 1 gate-checked)
```

It decides nothing — it exists so that *"I did not look"* stops looking like *"I looked and found nothing"*, which is what a redirected `paths`, an unreadable schema, an empty `source:` and an unclosed frontmatter all used to produce, each of them next to a tick. Read it as:

- **`N sealed`** — truths whose body was found verbatim in its source. This is the only N/N the tool produces, and it is the number the confirmation step is told to quote.
- **`N seal FAILED`** — checked and NOT found. Never folded into `sealed`.
- **`N tombstone`** — `retracted` truths, exempt: a withdrawn truth's quote is *meant* to be missing from its source (that absence is the withdrawal reason).
- **`← N NOT checked`** — the seal never ran on them. This marker means only that, and any count above zero is worth chasing: it is the shape every silent-zero leak takes.
- **`N gate-checked`** / **`← N NOT gate-checked`** — consecrated documents whose fidelity gate the reader could actually open, versus ones where it could not.

The AI gate judges *meaning*; `validate` enforces *form and truth coherence* — a miss in one is caught by the other. Format SoT: `.weavedoc/schema`.

## Design docs

- [METHODOLOGY.md](METHODOLOGY.md) — the *what and why*: the principles and the reasoning behind them.
- [WORKFLOW.md](WORKFLOW.md) — the *how*: the steps, and how the skills are divided.
- [.weavedoc/FORMATS.md](.weavedoc/FORMATS.md) — the artifact formats (parser contract).

## Status

Working, half-proven. The mine-building half (gather · map · verify · gaps) is battle-tested on a real project mine holding hundreds of truths — most rules in the skills cite an actual failure they now prevent. The document half (plan · write · review · refine) is implemented and its mechanical spine (seal → consecrate → gate digests) is regression-covered end-to-end, but no real document has been driven through the skills yet. Expect rough edges there.

## License and the name

The code is licensed under [Apache-2.0](LICENSE) — use it, modify it, fork it, ship commercial things with it.

The **name** is handled separately, as Apache-2.0 grants no trademark rights (§6): "WeaveDoc" is a trademark of Sooho Choi, and [TRADEMARK.md](TRADEMARK.md) says what that means in practice. The short version: **don't brand your product or fork "WeaveDoc"** so that people mistake it for the official one — but *functional* use of the name is expressly allowed, including the `.weavedoc/` directory, the `weavedoc-*` skill names, the `weavedoc` command, and factual statements like "based on WeaveDoc" or "compatible with WeaveDoc". A fork should not have to rename its own directories, and it doesn't.

---

*You declare the truth; WeaveDoc guards it. A document that contradicts its own sources is a document no one should sign.*
