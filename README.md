# WeaveDoc

**A document workflow that guarantees fidelity to the materials you vouch for — no contradiction, no unsupported claims, no silent gaps. You declare the truth; WeaveDoc guards it.**

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

on-demand gates: verify (cold-checks each upstream hop) · gaps (mine completeness audit)
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
| `weavedoc-gaps` | Mine completeness audit — declared markers, dangling references, count mismatches, peer asymmetry; every gap consciously **filled or accepted**. → `gaps.md`. |
| `weavedoc-plan` | Propose a document structure (template) + tone + outline, mapping each section to its materials; ask about structural gaps. → `documents/<id>/plan.md`. |
| `weavedoc-write` | Write the draft from the plan, grounded in materials and cited; queue genuinely-missing necessary facts and ask them. → `draft.md`. |
| `weavedoc-review` | **Fidelity gate** (mandatory: contradiction / unsupported / missing-required) + cold advisory multi-persona review. → `review.md`. |
| `weavedoc-refine` | Resolve every fidelity violation (all of them) + advisory findings per the gate; loop until clean. Only a clean gate produces `final.md`. |

## Artifacts

```
project.md              the project: character · roles · tone
inbox/                  drop raw materials here
materials/<id>/
  source.<ext>          the original, copied in
  converted.md          readable markdown + metadata (role · topics · summary)
catalog.md              index of all materials (generated)
truths/
  t<N>.md              atomic facts extracted from materials (tagged, with status + provenance)
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
.weavedoc/bin/weavedoc   deterministic checks — validate · pull · census · reindex · retag · impact · status · gaps
.weavedoc/VERSION        runtime bundle version (date) — compare install vs this repo
```

**Field names and section headers are fixed English — the parser contract. Content is written in your project's language** (`config.language`, set once at init). Plain language, no coined terms. Full spec: [.weavedoc/FORMATS.md](.weavedoc/FORMATS.md).

## Using it

WeaveDoc is a set of Claude Code skills. To use it in a project:

1. Copy `.claude/skills/weavedoc-*` and `.weavedoc/` into your repo.
2. Ask Claude: **"weavedoc init"** — it creates the workspace and `.weavedoc/config.yaml`.
3. Drop materials into `inbox/`, then: **"gather"** → **"map"** (with **"verify"** after each to cold-check the hop, **"gaps"** to audit completeness) → **"plan the report"** → **"write it"** → **"review it"** (→ **"refine"** until clean).

**Keeping installs in sync.** `bash .weavedoc/bin/weavedoc version` prints the installed runtime's date (`.weavedoc/VERSION`); compare it against this repo's before trusting an old install. If you evolve the skills/runtime *inside* a project (the testbed pattern), backport here and bump `VERSION` — the runtime once grew two weeks ahead inside a testbed while this repo went stale.

## Deterministic checks

`.weavedoc/bin/weavedoc` ships a dependency-free checker (needs only `bash`, which `git` already provides on every OS) — **the mechanical floor under the AI fidelity gate:**

- `validate` — format + truth coherence: frontmatter/enums/ids, catalog ↔ materials orphans both ways, every truth `source` resolves to a material, `conflict` truths carry `conflict_with`, `discarded` truths carry a `resolution` (and the winner/loser stamps match the record — a winner stamped `discarded` or a loser stamped `ok` fails), `provenance` enum valid and `derived` truths show their `derived_from` chain, **each truth's body appears verbatim in its source** (the anti-laundering seal), every `required_tags` tag has at least one truth, `index.md` ↔ truth files in sync both ways, a `retracted` material grounds nothing (its truths `unsupported`/`discarded`, no resolution winner references it), `truths/coverage.md` cross-checks (sections resolve, ids exist, sectioned materials complete), no `final.md` ships with a non-empty `# Fidelity violations`. Exits non-zero with the list.
- `census` — the mine's authoritative statistics: truth files vs index entries, id numbering holes, live/status tallies, coverage-manifest count. Skills report these numbers, never eye-counts.
- `reindex [--check]` — regenerates `truths/index.md` + `tree.md` from truth frontmatter; the **only** writer of those files (`--check` diffs without writing).
- `retag <old> <new> [--dry]` — renames/merges a tag across truths `tags` / `required_tags` / `scope_tags`, then reindexes; free-text mentions are listed for review, not rewritten.
- `pull <term>` — protocol-correct mine lookup for consumers *outside* the pipeline (creative sessions, other tools): searches claims+tags (body fallback) and mechanically applies the read protocol — superseded values point to their winner, unresolved conflicts / unsupported truths are flagged unusable, `as_of` / derived / plan-stage labels attached. See `.weavedoc/READ.md`; `init` plants a CLAUDE.md pointer so every session hits the protocol.
- `gaps` — the mechanical declared-marker scan (미정/TBD/unchecked checkboxes) that floors the `weavedoc-gaps` skill.
- `impact <material-id>` — which truths were extracted from a material and which documents cite it (the blast radius when a source is superseded or re-opened).
- `status` — each document's stage and its next step. `version` — the installed runtime's date.

The AI gate judges *meaning*; `validate` enforces *form and truth coherence* — a miss in one is caught by the other. Format SoT: `.weavedoc/schema`.

## Design docs

- [METHODOLOGY.md](METHODOLOGY.md) — the *what and why*: the principles and the reasoning behind them.
- [WORKFLOW.md](WORKFLOW.md) — the *how*: the steps, and how the skills are divided.
- [.weavedoc/FORMATS.md](.weavedoc/FORMATS.md) — the artifact formats (parser contract).

## Status

Working, half-proven. The mine-building half (gather · map · verify · gaps) is battle-tested on a real project (~220-truth mine) — most rules in the skills cite an actual failure they now prevent. The document half (plan · write · review · refine) is designed and implemented but not yet exercised end-to-end. Expect rough edges there.

## License and the name

The code is licensed under [Apache-2.0](LICENSE) — use it, modify it, fork it, ship commercial things with it.

The **name** is handled separately, as Apache-2.0 grants no trademark rights (§6): "WeaveDoc" is a trademark of Sooho Choi, and [TRADEMARK.md](TRADEMARK.md) says what that means in practice. The short version: **don't brand your product or fork "WeaveDoc"** so that people mistake it for the official one — but *functional* use of the name is expressly allowed, including the `.weavedoc/` directory, the `weavedoc-*` skill names, the `weavedoc` command, and factual statements like "based on WeaveDoc" or "compatible with WeaveDoc". A fork should not have to rename its own directories, and it doesn't.

---

*You declare the truth; WeaveDoc guards it. A document that contradicts its own sources is a document no one should sign.*
