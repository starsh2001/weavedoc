# WeaveDoc — Artifact Formats (parser contract)

Single source of truth for WeaveDoc's file formats. **Field names, section headers, and enum values are fixed English** — skills and tooling parse them. **Prose** (titles, summaries, role names, document text) is written in the project's language (`config.language`). Don't restate these formats elsewhere; point here.

> **Machine source of truth:** the checkable lists (frontmatter fields · enums · sections) live in `.weavedoc/schema` and are enforced by `.weavedoc/bin/weavedoc.mjs validate`. This doc is the human-readable contract; if the two ever differ, `schema` (what `validate` reads) wins — edit it first.

> **Parser/state architecture:** [`PARSER-MODEL.md`](PARSER-MODEL.md) defines how every reader derives one answer from these bytes: one lexical context per byte, typed ledger states, source-offset mutation authority, and writer postconditions. This file remains the user-facing artifact grammar.

> **Trust boundary (v0.3.2):** WeaveDoc trusts the repository author and the runtime. Digests provide **change binding** — they catch mistakes, drift, and tool-mediated laundering — not authorship authentication and not protection against a deliberate forger, who can compute a valid sha256 or hand-type a marker as easily as any tool can. What the machine warrants is therefore two-sided: it never certifies what it did not check, and **no support command may create an automatic downgrade path** (a migration, repair, or convenience flow that turns enforced state back into exempt state — the v0.3.1 seal-laundering was exactly this class). A user deliberately lying in their own repository is outside the warranty; a tool that launders for them is a defect.

> **Single-writer contract (v0.5.4):** **one mutating command per mine at a time.** Every writing command reads its own snapshot of the files it touches and writes them back whole, so two writers on one mine can lose committed work — a fresh seal overwritten by a migration's older buffer, a successful retag erased by a neighbour's rollback, a verification row that is already stale when it lands. WeaveDoc does not support that and does not repair it. The CLI enforces its half: a mutating command takes `.weavedoc/mine.lock` at the door and a second one is **refused, not queued** (read-only commands, and the read-only modes `--check`/`--dry-run`/`--dry`, are never gated). What the CLI cannot see is outside the lock — **an agent or editor writing mine files directly, a second checkout of a shared drive, or two sessions on one working tree**; keeping those serialised is the user's half.
>
> **The guarantees below are stated under this contract.** "Byte-identical rollback" and "no automatic downgrade path" hold for one writer at a time; under concurrent mutation neither is warranted.
>
> **Recovering from a concurrent write is not re-running the command.** What gets lost is *evidence*, not a cache: a review seal says "these bytes, in this context, were reviewed" and a ledger row records the round, standard and digest of a verification that happened. Re-running `seal-review` re-stamps a digest without anyone re-reading the document; re-running `attest` writes a verdict nobody re-verified. If a mine was mutated concurrently, treat the affected units as **unverified**: re-review, or confirm the bytes are identical to what was reviewed, before re-sealing — and re-verify before re-attesting. The commands whose whole output is *derived* from the mine — `retag` and `reindex` — are the exception: re-running them really is the repair.
>
> **A killed command leaves its lock behind.** Ctrl-C (and any signal) stops the process without unwinding, so `.weavedoc/mine.lock` survives — deliberately: nothing may reclaim a lock automatically, because no rule can tell a killed writer from a slow one. The next command refuses and names the path; delete it and its contents by hand. (`consecrate` is the exception — it handles the signal and exits cleanly.)

Conventions:
- Frontmatter is YAML at the top of a markdown file.
- **Fill every placeholder.** The shipped templates write required values as `{a description in braces}`. A required field left holding one of those — a value that is *entirely* one brace group — is **rejected by `validate`**: it is an instruction, not a value, and consumers read it as one (a plan left with its placeholder `tone` had that sentence taken as the document's tone). Deliberately narrow: a value that merely *contains* braces is real content, and a list of placeholders (`tags: [{tag1}, {tag2}]`) opens with `[`, so neither is touched. If a value genuinely belongs in braces, put any character outside them. (Schema key: `fm.placeholder`.) The same principle applies to review entries — see the `Fidelity violations` section below.
- IDs are short, stable, and never encode anything that can change.
- A material's `converted.md` is the source of truth for that material; `catalog.md` is generated from all of them.

## project.md
Frontmatter:
- `version` — int.
- `language` — prose language for this project (e.g. `ko`, `en`); mirrors `config.language`.
- `roles` — list of this project's material roles (project-defined; values in the project language, e.g. `[근거, 참고, 내부]`). **AI assigns silently at gather** (appending new roles as it uses them); the user edits anytime. A role earns user attention only at consumption — it frames a conflict question ("계약서 vs 회의록") when map lays a disagreement before the user.
- `tone` — optional; one line describing the writing tone (project language). May stay empty — each document's `plan` sets its own tone; fill only if the project has a standing tone.
- `authority` — optional list of `roles`, **legacy-inert (schema v3)**: no conflict is resolved by role rank — every ruling is the user's, per entry, and neither machine nor AI orders winners by authority, date, or recency. The key stays legal so migrated v2 mines remain valid; `validate` checks only that entries are declared roles (`PROJ-AUTHORITY`). Nothing reads it as precedence.
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
- `corrects` — optional list of `m<id>` references, each optionally naming a section (`[m011 §4]`). **This material displaces named parts of earlier ones.** Two things follow, both hand-done and both dropped in a real run: `map` reads off these references exactly what to re-ground (which cards' `source`/`location`/body move to this material) instead of inferring it, and the mirror is *known* to be a correction rather than a new setting — a consumer reading only the body could otherwise not tell (it reached the Human queue as an open item). `validate` checks each id resolves and that nothing corrects itself.
- `role` — one value from `project.md` `roles` (project language).
- `topics` — list of free topic tags (project language).
- `format` — original format (e.g. `pdf`, `docx`, `xlsx`, `image`, `md`).
- `source_path` — where the original came from, **as of before intake**. For `file`: the path the item was dropped at, recorded **pre-move** (intake MOVES inbox files, so this field is the only surviving record of where it arrived — and it is the value gather's duplicate check compares; the post-move location is always `materials/<id>/source.<ext>` and never goes here). For an outside source: the external path it was copied from. For origins with no filesystem original (`conversation` / `user-answer` / `prior-doc`): the non-path handle instead — session date, the question it answered, or the source document id. For `research`: the primary `url` already carries this; repeat it here.
- `added` — date `YYYY-MM-DD`. **When it entered the mine**, not when the source was written. Batch intake gives every material the same `added`, so it can never order two sources — do not use it for `supersedes`.
- `dated` — optional date `YYYY-MM-DD`: **the source's own date** (the contract's signing date, the minutes' meeting date, the spec's revision date), taken from the source itself. Context the user may lean on when ruling a conflict — **never a resolution axis**: no one, machine or AI, orders winners by date (schema v3 has no mechanical resolution at all). The field still matters because it is *declared*: a date read out of a body is not a field, and a real run showed two readers deriving **opposite winners** from body-read dates on the same mine — the class this field exists to keep out of the record.
- `status` — enum: `collected` | `converted` | `verified` | `used` | `retracted`. `verified` = passed cold verification (conversion fidelity confirmed). `used` = a consecrated document cited it (stamped by `refine`) — lifecycle, **not** a verification verdict: the stamp overwrites `verified`, so `scope` counts a used-but-unverified material as still owed. `retracted` = withdrawn by the user (set by `gather`'s retraction flow) — the material grounds nothing from then on: every truth grounded on it is re-grounded on a live material or removed (map's job; `validate` names each leftover as `TRUTH-SOURCE-DANGLING`), but the folder and files stay as audit trail — **never deleted**.
- `summary` — 2–3 line AI summary (project language).
- `stage` — optional enum: `plan` | `applied`. Set when the source is clearly a plan/proposal (계획서·기획 문서·프롬프트 초안) vs a record of what was actually applied/executed. Truths extracted from a `plan` material carry an implicit "실행 확인 안 됨" caveat — a plan entry is never evidence something was used (a real run mislabeled never-used plan content as a "구버전", implying prior use).

Body: the material converted to readable markdown (project language). **The body is a mirror of the source — nothing added.** No derived tables/aggregates, no sort-order/superlative statements, no cross-material commentary, no invented rationale. Two marked exception line types (both excluded from mirror/M3 checks, both barred from stating new facts):
- `> [note] …` — handling guidance genuinely needed but not in the source (e.g. "값은 SUNO에 요청한 값이며 실측 아님").
- `> [machine-note] …` — machine framing recorded inside a conversation/user-answer material (an anchor, a normalization). Never promoted into a truth claim.

## catalog.md (generated)
A table indexing all materials, columns: `id`, `title`, `role`, `origin`, `status`. Regenerated from material frontmatter; not hand-edited.

## materials/intake-ledger.tsv (machine-owned intake ledger)
**The mine's only mechanical record of how a material came IN.** Every other material check above asks whether the folder has the right *shape*; none of them asks where its bytes came from. That gap has one specific consequence: the agent that writes a material also writes the cards that cite it, so an **invented** material is structurally perfect — its quotes match, its coverage closes, its seals pass, `validate` is green. Adding checks downstream of a forgeable root only makes the mine state the forgery with more confidence; `247/247 sealed` means *the cards agree with the materials*, never *the materials agree with the world*. This ledger is the same device the verification lane has had since v0.3.2 — append-only, digest-bound, `legacy-unbound` for what predates it — applied to the lane it was never applied to.

**It does not prevent fabrication and is not designed to.** An agent can call `intake` and invent a `source.md` in the same breath. What it removes is fabrication's status as the *default* and its invisibility: a silent file write is no longer sufficient, the alternative leaves a row with a digest bound to bytes that had to exist on disk, and a material with no row at all is named. The judgment stays with the human, where WeaveDoc puts every judgment.

Written **only** by `weavedoc intake` (see its two forms below); never by hand — a hand-written row has no digest that anyone computed, which is the thing the file exists to record. Append-only TSV (`id · sha256 · declaration · sources · copy · note · date`; `#` lines are comments), **LAST row per id wins**, so re-declaring after a legitimate change is an append and the history stays.

- `sha256` — a **tree digest** over every `source.*` in the material folder (`name NUL sha256 LF` per entry, sorted bytewise, re-hashed — the same manifest shape a directory artifact hashes to). Adding, removing, renaming *or* editing an original moves it, so `scope` reports `stale (source)`. `-` when the declaration binds no source.
- `declaration` — enum: `declared` | `anchored` | `no-source` | `legacy-unbound`. The first three are what `intake` writes; **`legacy-unbound` is minted only by `upgrade`**, exactly as its verify-sidecar twin is.
- `sources` — how many `source.*` files the digest covers, or `-`. A count rather than a filename because the digest covers the whole *set*, and naming one file would misdescribe a set of two.
- `copy` — digest of the material's **`converted.md`**, via the same `matDigest` the verification lane uses for that file (frontmatter `status:` excluded, because status is the lifecycle axis and a copy digest that moved on a lifecycle stamp would cry stale on an ordinary day). `-` only for `legacy-unbound`.
- `note` — free text, non-empty: how it arrived (who handed it over, from where), the **ruling** behind `--no-source`, or what an `--anchor-existing` run was vouching for. Migration writes the origin token `pre-intake-ledger` here.
- `date` — `YYYY-MM-DD`.

**Why the copy is bound at all — the half the source digest cannot see.** The source digest catches an *original* being rewritten and says nothing about `converted.md`. A real run found that is the half that gets edited: an owner said "drop this from the project", and the session carried it out by **deleting a column out of the material** — the mine's own record of what a document said. Nothing reported it, because the material had never been verified and so bound no bytes; every later reviewer met a mismatch it could not explain, and the pressure to invent an explanation followed. A copy edited to record a *decision* falsifies the record whatever the intention. The machine cannot tell a conversion fix from a decision, and does not try: it reports which side moved, in a sentence that names both possibilities, and the reader answers.

The structural row filter is the verify sidecar's, plus **two cross-column clauses that are the point of the file**: a word that binds a source (`declared`, `anchored`) must carry a 64-hex digest *and* a positive `sources` count, and a word that binds a copy (those two plus `no-source`) must carry a 64-hex `copy`. `intake` always computes what it writes, so a hand-written row holding `-` would claim a binding to bytes nobody hashed — the exact move this ledger exists to make visible, performed on the ledger itself. Such a row is not a declaration with a missing field; it is not a declaration, and it fails the filter so every consumer reads it as damage. The two clauses are separate because the two bindings are: `no-source` binds no source — that is its whole content — and still binds a copy, because a material with no original is precisely the one no reviewer can ever re-derive from anything else. The rest of the reader is the verify lane's, parameterised and not copied: an unreadable file and a row with an empty id column each void the **whole** ledger (unknown evidence is not absence; an unattributable row could be any material's declaration), and an id whose *last* row is malformed is quarantined — no declaration at all, not even an earlier valid one.

The `copy` column sits **fourth, not second**, and the reason is that same shared reader: it takes the declaration word from `f[2]` for *both* ledgers. Aligning columns 0–2 across the two files is what lets the intake lane reuse a parser two review rounds hardened, instead of growing a second one that drifts from it.

`--no-source` is the **one ruled exception**, and it exists because without it the check dies of a single true case: a material whose original genuinely does not exist (a value the user stated with nothing to compare against) would be permanently undeclared, and one permanent false alarm is how a warning stops being read. It is not free — the ruling goes in the note, it binds no *source*, and it is counted apart from `declared` in `scope`, `census` and this format. It still binds the copy.

### `intake --anchor-existing <note>` — the migration answer
A mine that predates this ledger carries a backlog of materials bound to nothing: editable, on either side, with no trace. `upgrade` mints them `legacy-unbound` because that is the only honest thing a migration can say — **nobody witnessed those bytes** — and the backlog then sits there. The way out cannot be for `upgrade` to hash them on its way past: a digest minted by a migration reads afterwards as evidence while in fact recording whatever happened to be on disk the moment a tool ran, *including an edit made ten minutes earlier*. That is how a falsified copy becomes canon, and a real run came within one command of it.

So the bytes are bound by a separate act, by a person, who is vouching that the tree is the one they mean. Three properties make that claim honest:

- The word it writes is **`anchored`, not `declared`.** Nothing was handed over and the record may not imply it was. Collapsing the two would let a mine that anchored its backlog this morning report "32 declared".
- **Anchored is not verified.** It records the bytes as they stood, and makes no claim that anyone read the material or that it says what its original says. It is counted apart from verification everywhere, in a different ledger.
- **It never re-anchors a material that already carries a binding** — stale or not. Adopting whatever a stale material was edited into would turn the one command that exists to *expose* an edit into the one that buries it. Re-binding after a deliberate change stays available and has to name the material: `intake <id> <note>`.

Materials that need a *ruling* (no `source.*` at all) are named and skipped, never batched — a ruling is the user's. If every target needs one, the command writes nothing and says so.

`upgrade` now **reports** the unbound count and what it costs instead of minting its rows in silence. Leaving materials unbound was always a decision; it was taken on the owner's behalf and never put in front of them, and `legacy-unbound` reads as a verification backlog (old, low priority) when what it means is that nothing will notice if these files change.

**`MAT-UNDECLARED` is a WARNING and never a block**, and the constraint is not a matter of taste: every mine in existence predates this ledger, so a blocking version would redden every project at once and be switched off within a day — the same outcome as not shipping it, minus the trust. (The judgment `CLAUDE-BLOCK-STALE` shipped under one bundle earlier: *a warning, never a problem, and it must not block a ship.*) `weavedoc upgrade --apply` fills a pre-ledger mine's rows as `legacy-unbound` — **real history that binds no bytes**, counted apart and never silently equal to a declaration. After that backfill, a `MAT-UNDECLARED` means what it is supposed to mean: a material that appeared *after* the ledger existed and was never declared.

`scope` is where the digests are **compared**, because it is the command that re-reads every original; `validate` and `census` report row presence only and say so in their own wording — neither prints "digest-bound" for a comparison it did not run. A declaration whose source set can no longer be read as a set (a deleted original, a `source.*` turned symlink, a folder mid-write) is neither `declared` nor `undeclared`: `scope` names it separately, because collapsing it into either bucket would describe a state the mine is not in.

## truths/&lt;id&gt;.md
Each truth is an atomic, citable fact extracted from a material. One file per truth, flat in `truths/`. The `map` skill creates these; the AI re-derives inter-truth relationships (supports, contradicts, supersedes) on the fly by reading relevant truths — no persistent edge store.

Frontmatter:
- `id` — `t<NNN>`, stable, auto-incremented. Equals the filename (without `.md`). **Zero-padded to at least three digits** (`t001`, `t042`, `t1000`) — one number, one spelling. Two spellings of one number (`t5.md` and `t005.md`) collapse into a single entry in the reference tables (`derived_from`, `corroborated_by`, conflicts.json targets), so a check reads one file while reporting the other; `validate` rejects a non-canonical filename. References *to* an id stay lenient — `derived_from: [t5]` resolves to `t005.md` — precisely because the filename rule leaves only one file it can mean.
- `claim` — one-sentence statement of the fact (project language).
- `source` — material id this truth was extracted from (e.g. `m001`).
- `location` — where in the source (e.g. `§4, 1문단`). Project language.
- `tags` — list of topic tags (project language). N:N — a truth can have multiple tags. Tags are the primary lookup mechanism: AI greps by tag to find related truths.
- **No state fields (schema v3).** A card that exists IS canonical — there is no `status`, no
  `conflict_with`, no `resolution`, no `superseded`, and `validate` rejects each as
  `TRUTH-V2-FIELD` (state growing back onto cards is discarded machinery returning). The value
  changed? Edit the card **in place** (same id) — canonical-current exists because corrections
  and reversals are frequent and one fact must not smear history across its neighbours. An
  undecided disagreement lives in `.weavedoc-state/conflicts.json` until the user rules (see
  that section) and never wears a card. The past lives in Git. A card whose grounding broke is
  not stamped — it is re-grounded (map) or deleted, and `validate` names the break
  (`TRUTH-SOURCE-DANGLING`, the quote seal) either way.
- `provenance` — optional enum (default `stated`): **who authored the value.**
  - `stated` — the fact is in the material as the user/source stated it.
  - `adopted` — the value originated as a **machine proposal the user adopted**, or was **machine-fetched from an `origin: research` material and accepted**; the adoption exchange must be visible in the source material. (A real run recorded a machine-proposed 158cm in the exact same shape as user-supplied values — this field is what keeps "기계는 조용히 고르지 않는다" true at the *record* level, not just in chat.) **A truth whose source is `origin: research` may not be `stated`** — nobody stated a value the machine went and got, and since `stated` is the default, silence would land there and undo at the truth level exactly what `origin: research` stops at the material level. `validate` enforces it.
  - `derived` — the machine computed/interpreted it from other facts. Requires `derived_from`; `validate` enforces this.
  `adopted` + `derived` form the **priority re-verify set** and are highlighted in the human-confirmation delta.
- `derived_from` — required when `provenance: derived`. List of truth/material ids the derivation used.
- `assumptions` — list of premises the derivation rests on that appear in **no material** (e.g. `[세는나이 고1=17]`). Every unstated anchor goes here — an empty list means the derivation uses stated facts only.
- `as_of` — the phase/date at which a **time-varying** claim (나이·학년·소속·상태) is true (e.g. `First Light (Phase 1)`). In a phase-structured project a time-varying claim without `as_of` is an extraction error — the "데뷔 시점 18/18/16/19" incident was two phases collapsed under one label, impossible to write with `as_of` present.
- `corroborated_by` — optional list of material ids that independently confirm this truth (recorded by `map`'s duplicate check instead of creating a duplicate truth; chat-only corroboration is lost when the session ends). **Citing the agreement**: there is no separate marker for corroboration — the citable handle is the truth id itself. A document that wants to say "two sources agree" cites the truth (`<!-- t:<id> -->`) and names the corroborating materials in its visible citation (e.g. `(출처: 계약서 초안 · 킥오프 회의록)`); the truth's `corroborated_by` is the record that backs that sentence, and the gate accepts it because the claim is the cited truth's claim. Writing "m003도 동의한다" as a *separate uncited assertion* is what the gate correctly rejects as unsupported.
## truths/tree.md (generated)
A tag-grouped view of all truths for dashboard consumption. Format: one `## <tag>` heading per tag, listing truth ids + claims underneath — each entry carries the same **consumer labels** as `pull` after a ` ··` separator (see index.md below). **Regenerated only by `weavedoc reindex`** — never hand-edited (hand edits in a real run consumed ~45% of the tool calls and corrupted an entry). Run `reindex` whenever truths change.

## truths/index.md (generated)
A flat one-line-per-truth index for quick AI scanning. Format: `- <id>: <claim> [<source>] — [<tag1>, <tag2>] ··<labels>` (the ` ··<labels>` tail only when labels apply). The labels are **the same set `pull` prints** — `(as_of: …)`, `[DERIVED — …]`, `[ADOPTED — …]`, `[PLAN-STAGE SOURCE — never evidence of use]`, `[RETRACTED SOURCE]` — produced by one shared function, because a truth whose fact depends on the entry path a consumer took is the defect this closed (field report D1: a plan-stage album spec read as a release fact via tree.md). ` ··` is the label separator: `pull` strips the tail before term-matching, so label prose is output, never search text (and `reindex` rewrites a literal `··` inside a claim as `· ·`). **Regenerated only by `weavedoc reindex`**; `validate` fails when it drifts from the truth files. AI reads this file first to identify relevant truths by tag before opening individual files. Mines indexed by an older bundle simply lack the label tail — one `reindex` adds it.

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
- edited: t027 (재접지 — m013 정정 자료로 source·본문 교체, 키·나이 갱신)
- removed: t133 (근거 없는 추출 — 어느 자료에도 없는 문장; 번호는 재사용되지 않음)
- confirmed: 2026-07-24 (blanket)
```

Line kinds (`changelog.line.kinds`): `added:` (id + `[provenance]` + one-line claim), `superseded:` (a v2-era spelling kept readable in migrated logs — new entries use `edited:`/`removed:`), `edited:` (id + what changed — in-place canonical updates land here), `removed:` (id + why the card was deleted — a human record only: no command reads it back as a judgment input, and numbering holes need no explaining because the allocator never refills them), `confirmed:` (appended after the human reviews the delta — `blanket` = 일괄 통과, `itemized` = 항목별 확인; **a dated marker only** — `confirmed: (대기)` is a placeholder, and what is still awaiting confirmation is every block after the last *dated* one).

The confirmation step renders every block since the last `confirmed:` marker, so the `## YYYY-MM-DD <skill>` header is load-bearing, not decoration: it is what bounds "what changed since you last looked".

## truths/verify.md (verify state)
Written by `weavedoc-verify` (truths mode). Records the verification state of the truth set.

Frontmatter:
- `status` — enum: `passed` | `failed` | `escalated` | `stale` | `in-progress`. `passed` is written **only** when `consecutive_passes` reached `config.verify.repeat` — a clean round that leaves the count short is `in-progress`, not `passed`, because one clean round is evidence about that round and not about the target. `failed` = the last round found blocking findings. `escalated` = `max_rounds` exhausted with the count still short. `stale` = new truths added since the last pass; re-run needed.
- `round` — int, last round number.
- `consecutive_passes` — int, optional (absent = 0). Clean rounds **in a row** so far. +1 on a clean round; back to **0** on any failing round, on a moved baseline (the step-0 pin), *and* on a round whose defender made a **bar-crossing ticket-downgrade** (blocking at the claimed grade, non-blocking at the new one — the ladder in `weavedoc-review`'s reviewers.md): that downgrade's test is the next fresh panel, so the loop may not converge before it runs. Written after every round so a cold session resumes the loop instead of restarting it.
- `verified_at` — date `YYYY-MM-DD`.

Body:
- the T# verdict table (T1–T5, each **PASS / PARTIAL / FAIL / `— (level)`** with evidence). `PARTIAL` = the round owed this check and didn't show it (blocks like a should-fix); **`— (level)` = the level never ran that lens** (`light` runs T1–T2, `standard` T1–T3, `full` T1–T5) and is not a defect — without that distinction `light` and `standard` could never pass. The material axis uses the same convention over M1–M4, plus `— (n/a)` for M4 on a non-`research` material. T5 reads the mine the way `READ.md` tells a consumer to and no other way (READ.md + `weavedoc pull` + the truth files pull points at + the consumer entry points READ.md rule 5 names (`truths/index.md`, `truths/tree.md`, `census`) + `project.md` `required_tags` (it is what tells you which topics to pull). NOT materials, NOT `source.*`, NOT coverage, NOT conversion history), so it is the one lens whose absence never surfaces as a contradiction;
- `## Verified units` — per material / truth-cluster: last verified round + date + the standard it met (`passes 2/2`). Recording the standard matters when `repeat` is raised later — units that cleared the older, lower bar stay visible instead of silently inheriting the new one. **Anything created or changed after a pass is `stale` for that unit** — a global `passed` never covers units born after it (a real run let an unverified correction ride into a "passed" mine). Summaries always show the unverified count ("자료 16 중 verified 15 · 미검증 1").

  **Layout is free; the verdict is not.** Write the section as a table or as bullets — both are read. What every entry must do is **end with the verdict word** `schema: verify.units.verified` (`verified`), because that is the only thing a machine can read across both shapes: `- m001 · t001 — R1 2026-07-30 · passes 2/2 · verified`, or a table row whose last cell is `verified`. The surrounding `verify.sections` value is an exact positional contract of three distinct non-empty roles (Verified units, Human queue, Adjudications); if it is malformed, no section grants evidence and every consumer reports the contract instead of shifting a later role into this one. `weavedoc scope` reads exactly this **plus the digest sidecar below** (a digest-less markdown entry reads as `legacy-unbound`), and it counts an entry ending in anything else — a failed unit (`**미통과**`), an unrun axis (`R3 미실행`), or a legacy note with no verdict at all — as **covering nothing**, then names that entry so a missing word is visible instead of looking like a ledger that just hadn't got there yet. A plain substring test would be wrong in the other direction: `unverified` contains `verified`.
- `truths/verify-ledger.tsv` — **machine-owned verification sidecar** (WD-COR-003), written only by `weavedoc attest <verified|failed> <round> <standard> <id...>`, never by hand. Append-only TSV (`id · sha256 · verdict · round · standard · date`; `#` lines are comments); the **LAST row per id wins**, so re-verification is an append and the round history stays. The digest pins the exact bytes verified: a truth's digest covers its **whole file, raw bytes**; a material's digest covers `converted.md` **minus its frontmatter `status:` line** — `status` is the lifecycle axis (`refine` stamps `used` at consecration), and a lifecycle stamp must not invalidate a verification. Every reader consumes the ledger through **one strict structural parser** (v0.3.3): exactly six columns, digest 64-hex or `-`, round integer or `-`, non-empty standard, real-calendar date — a row that fails it covers nothing in `scope` (named, never absorbed) and blocks in `validate`, never one without the other. `weavedoc scope` reads this ledger first: digest match = **verified (digest-bound)** · mismatch = **stale** · `failed` verdict = **failed**, each per unit, mechanically — a manual edit, an agent slip, and a normal re-map all look identical to the digest. A v1 record with **no** sidecar row — a material's own `status: verified`, or a markdown `## Verified units` row — is **`legacy-unbound`**: preserved verification history that binds no bytes, never deleted and never counted digest-bound. Migration-minted legacy rows carry an **origin token** in the standard column (v0.3.2): `v1-truths-ledger` for t-ids materialized from `## Verified units`, `v1-material-frontmatter` for materials materialized from their own `status: verified` — an m-id mention in `## Verified units` is extraction scope, not a conversion verdict (WD-COR-001), and mints nothing. The reader rule is deliberately asymmetric: an m-id legacy row counts as material evidence **only** with the material origin token (an origin-less m row is a pre-0.3.2 cross-lane mint — `scope` names it, ignores it, and the material falls back to its own frontmatter), while t-id rows accept `-` too, because the truths lane was always the right lane and every 0.3.1 t row is correct history. `attest` also mirrors a readable line into `## Verified units` (verified verdicts only), so the markdown stays the human view while the sidecar is the machine's source of truth.
- `## Human queue` — reviewer findings the machine wanted to dismiss on **semantic** grounds ("원문에서 함의됨" / "파생이라 무해" / "다른 파일에 기록됨"). Semantic dismissal is the user's call, not the machine's: an entry leaves this queue only by user ruling (→ then it may become do-not-raise). A real run self-dismissed the same reviewer finding twice; it was the one error the user later corrected.

  **Does an open entry block consecration? No — but the machine may not pass it silently** (ruled 2026-08-01; before this, no document said either way and two users decided differently whether the document ships at all). The fidelity gate is the *only* blocking membrane, and this queue is on the advisory side, so an open entry does not fail `validate` and does not stop `final.md`. What it does stop is the machine deciding alone: **`refine` must list every open entry to the user at the consecration step and get an explicit go-ahead** — consecrating over an unread queue is precisely the semantic judgement the queue exists to intercept, just made one level up. Machine offers, human decides. The go-ahead is **recorded**: an HTML comment under `# Human queue` holding the date, the entries covered and the user’s words — a later cold auditor must be able to see the interception happened.

  Entry format — **two fixed English tags, then prose in the project language**:
  `- [<state>] [<ownership>] <where> — <what the machine wanted to dismiss + its reason> — <what breaks if the dismissal is wrong>`
  - **Empty ledger** — write `- (없음)` (project language) or `- (none)`, **alone on its line**. Readers treat that exact line as "no entries" rather than as an entry missing its tags; a line that merely *opens* with those words is an ordinary entry and is counted and listed as one (`weavedoc status --open`, v0.5.7). Same idiom in `questions.md`.
  - **Continuations** — an indented line under an entry belongs to it. When the entry's own line carries nothing but its tags, `status --open` folds those lines in so the listing shows the content; when the entry already carries content, indented lines stay detail and are not listed. A still-template tag slot over real content (inline or realized from a continuation) surfaces as an **untagged** entry rather than vanishing (v0.5.10). The fold is display only: state/ownership are judged on the **entry line** — a tag written on a continuation line does not satisfy the ownership requirement.

    **"Under" means strictly deeper, and depth is the literal lead** (v0.5.17). A bullet is detail of the entry above it when its leading whitespace *starts with* that entry's and is longer — `  - …` under `- …`, or `    - …` under `  - …`. Two bullets sharing a lead are **peers**, each its own entry, however either is tagged; a lead that is not an extension of the parent's (a tab under two spaces) is not nesting either, and surfaces rather than being absorbed. Reading depth as a flag — "is there an entry above?" — cost three measured drops in one release: peers merged into one listing, a placeholder peer of an `[open]` entry disappeared entirely, and a genuine sub-bullet was counted twice. Each `## Human queue` section is read on its own, so nothing carries across a round boundary. A **control-character lead** (`\v`, `\f`, `\r`) is not indentation for this purpose: such a bullet is always an entry, because no editor writes one and the alternative left it handled by nobody.
  - `state` (`humanqueue.enum.state`) — `open` | `ruled`. A `ruled` entry records the user's utterance with it, like `questions.md`.
  - `ownership` (`humanqueue.enum.ownership`) — **whose decision this actually is**, assigned by the **cold defender** when the entry is written (not by the producer, and not when the user asks). The test is *what the answer requires*, not whether a recommendation is possible — the machine can nearly always produce some recommendation, so "추천이 가능한가"로 가르면 `user-only`이 구조적으로 비고 이 축이 정확히 드러내려던 항목이 사라진다:
    - `user-only` — answering needs information **no material holds**: a fact, an intent, or a preference only the user has (은지의 자퇴 시점). A recommendation about *form* doesn't move it out of this bucket.
    - `recommended` — the machine can derive a defensible answer from the mine; the user is confirming taste or accepting a cost.
    - `machine` — record hygiene with nothing to weigh; the user says "해줘" and it's done.
    Items needing **work rather than a decision** — a `fact` finding, or something no one can judge without material access — do not enter this queue at all: facts route to `map`, unjudgeable checks are a verify PARTIAL. Forcing them into a bucket mislabels them.
    **The producer may not tag `machine`.** A finding reaches this queue only because the machine wanted to dismiss it and wasn't allowed to; letting that same machine mark it "nothing to weigh" revives the dismissal one level up, where the confirmation step renders it as a compact "just say go" list the user skims. Retagging an entry that arrived untagged defaults to `user-only` — the direction that surfaces rather than buries.

  The tags exist because a flat queue hands the triage back to the human. A real run accumulated eleven entries and reported them as one list; the user had to ask *"내가 결정해야하는걸 구체적으로 말해줘"* to get the split — and the split was **1 `user-only` / 3 `recommended` / 7 `machine`**, all of which the machine already knew when it wrote each entry. `validate` enforces the ownership tag on every `[open]` entry (a `ruled` entry is closed and nothing reads its ownership) (untagged legacy entries are reported by `weavedoc status` instead of hard-failing an already-verified mine); `weavedoc status` prints the open queue split so a completeness line can never read "열린 갭 0 · 열린 질문 0" while eleven decisions sit waiting.
- `## Adjudications` — do-not-raise categories for future rounds. Only user-ruled entries land here.

## .weavedoc-state/ (machine-owned mine state — schema v3)

Two JSON files, at the mine root and OUTSIDE `.weavedoc/` precisely so replacing the runtime
bundle wholesale can never overwrite mine state; versioned like the rest of the mine, created
by init (empty forms) and by the v2→v3 migrator. On a v3 mine `validate` fail-closes when
either is missing (`STATE-MISSING`) or unparseable (`STATE-MALFORMED`) — unreadable state never
reads as empty state.

- `conflicts.json` — **open disagreements only**; resolution IS deletion of the entry, and no
  archive/accepted/winner/suppression section may ever grow here. Detection is the AI's
  judgment (map), the ruling is the human's; the machine keeps the ledger hygienic (closed key
  vocabulary, exact id spellings `c001`, typed `targets`/`candidates`) and blocks shipping
  while any entry is open (`CONFLICT-OPEN`, inherited by consecrate). `targets: []` is the
  legal *undecided* state — nobody ruled yet — and is not "resolved to nothing": the same
  zero, ruled by the user (all candidates rejected), is an entry DELETED with no card created.
  A candidate is the lossless envelope of a claim whose card was never created: claim + typed
  `source` (mNNN) + optional location/quote/tags/note.
- `id-sequences.json` — the typed monotonic allocator (`conflict|material|truth`). Canonical-
  current deletes cards, and max+1 scanning re-grants the highest deleted number — after which
  an old `<!-- t:t042 -->` cites a different fact. Numbers move one way; a deleted id is never
  reused; numbering holes are the normal trace of deletion and no surface warns about them.
  Ids are granted by the allocator, never by scanning.

## documents/&lt;doc-id&gt;/
- `plan.md` — frontmatter: `doc_id`, `doc_type` (project language), `tone`, `status` (enum: `planned` | `drafting` | `reviewing` | `done` | `stale`), `continues` (list of prior `doc-id`s, for series), `cited_truths` (list of truth ids cited in the draft/final — generated by `write`/`refine`, used for change propagation), `scope_tags` (list of tags this document covers — collected by `plan` from the section notes' `tags` fields; used to detect staleness from NEW truths added to the mine). Body: the outline — one heading per section, each with a note `<!-- purpose / tags: truth tags the section draws on / required|optional -->`. The note's `tags` use the **truth-tag vocabulary** (`truths/*.md` `tags:`), not material role·topics — `scope_tags` is harvested from these notes and staleness compares it against new truths' tags, so a note written in the material vocabulary silently disables the trigger.
- **Single-file output:** `draft.md` — the working draft, improved in place across review rounds. `final.md` — the finished document.
- **Multi-file output:** `draft/` directory containing individual page files (e.g. `draft/index.md`, `draft/yuna.md`, `draft/phase-1.md`). `final/` directory with the same structure. The plan's page list determines which files exist; `write` creates them; `review` checks each; `refine` updates them. File naming follows the plan's naming convention (typically kebab-case).
- **Citation markers (both modes):** Claims carry **inline truth citations** using the marker `<!-- t:<id> -->` immediately after the sentence (e.g. `세하는 17세이다.<!-- t:t006 -->`). The marker is invisible in rendered markdown but machine-parseable. Each citation also shows a source label for human readers: `(출처: <label>)` or footnote-style `[^m001]` with matching definitions — the inline `<!-- t:... -->` marker is the machine-readable part; the visible citation is the human-readable part. **The two halves are independent, and only the marker is the gate's input.** The label defaults to the material's `title`, which is right for an internal document; for an external audience it may be a **publication label** instead (ruled 2026-08-01), because material titles are internal names — a customer-facing memo citing "Support Runbook (excerpt)" or literally "user answer" leaks the mine's shape, and before this ruling the format left no legal way out: dropping the visible half broke the documented human-readable requirement, keeping it shipped internal names. `plan` already elicits the **audience** (`plan:37`); when it is external, `plan.md` records the label each cited material carries in this document, and `write`/`refine` use those. Relabelling never touches `<!-- t:<id> -->`, so fidelity checking, `cited_truths` and propagation are unaffected — what changes is only what a reader sees. A label may not misattribute: it names the same source in publishable words, never a different one. `write` and `refine` update `plan.md`'s `cited_truths` from these markers after each pass (scanning all draft files in multi-file mode).
- `review.md` — optional frontmatter `round` + `consecutive_passes` (the advisory loop's state; absent = 0 — `refine` reads these to resume the loop instead of restarting it), plus the **seal fields** `reviewed_kind` + `reviewed_digest` + `review_context_digest`, written by `weavedoc seal-review <doc-id> [draft|final]` and never by hand: they pin **which bytes** the round reviewed (single file = raw-bytes sha256; `draft/`·`final/` tree = sorted-relpath `path\0sha256\n` manifest, re-hashed) and **the ground** the verdict rests on (cited truths · their source materials via the status-excluded material digest, so the later `used` stamp cannot stale the review it consecrated under · config · schema). `validate` hard-fails a final whose bytes or context differ from its sealed review; a digest-less review next to a final reads as **legacy-unbound** — counted and shown (`review seals:` line), non-blocking until schema v2. A migrated v1 review carries `review_legacy: <date>` instead of seals — upgrade writes it, and it is what lets a v2 mine distinguish v1 history (legacy-unbound, non-blocking) from a tampered review whose seals were stripped (`GATE-UNSEALED`, blocking). The seal is an **all-or-none tuple**: any strict subset — a missing `reviewed_kind`, a stripped context digest, a stray seal field without the digest — blocks as `GATE-UNSEALED` on a schema-2 mine, because each missing member disables exactly one check while the others keep the green light credible. And the marker's lifetime ends at the next seal: `seal-review` **removes** `review_legacy` when it seals (a freshly sealed review is not v1 history), so a marker sitting next to a seal is a parked demotion path and blocks as `GATE-SEAL-MARKER`. These **structural** invariants (tuple completeness, kind enum, marker coexistence) hold for any review — draft stage included (v0.3.3); byte and context *enforcement* applies next to a consecrated output, where the verdict ships, so editing a draft under an old seal between rounds stays the normal refine loop. `upgrade` writes the marker only while a version-1 record is still present — it refuses a schema-2 mine outright, which is what closed the laundering path (strip the seals, run `--apply`, read as history) — and a v0.1 review with no frontmatter at all gets a fresh block prepended so such a mine stays migratable. `weavedoc consecrate <doc-id>` is the mechanized write path to final: gate emptiness re-checked with the same reader, seal + draft + context verified, candidate staged on the same filesystem, **one** full validation with the candidate in place (the exemption for the doc's own in-flight artifacts is a **function argument** — never a variable, which the environment can inject), atomic promote — a validation failure or an interrupt (INT/TERM) restores the original final. A hard kill can run no restore, so consecrate writes a durable `.consecrate.inflight` marker **before its first final mutation** (creation is exclusive — concurrent runs cannot both hold the transaction) and removes it **last, and only behind a verified postcondition**: if a restore comes up incomplete the marker stays. While the marker or the `.final.bak` backup exists, both `validate` (`CONSEC-INTERRUPTED`) and `consecrate` refuse until a human resolves the leftover — recovery is **compare-first** (byte-compare final against the reviewed draft: identical → staged candidate, safe to remove; different → your original, keep it; absent with a backup present → restore it), because a crash before the swap leaves the *original* at final. The marker is written first but not fsynced — power-loss protection is only as good as the filesystem's write ordering; process-level kills are fully covered. Then four level-1 sections. **`Fidelity violations`** (the mandatory gate): `- [<kind>] <where> — <what>`, `kind` enum: `contradiction` | `unsupported` | `missing-required`. NOT editable, NOT triaged-down, NOT adjudicated away; any open entry blocks `final.md`/`final/` and consecration. **The zone rule (ruled 2026-08-01): a kind in brackets lives ONLY inside this section.** Anywhere else in review.md — other sections, prose, any heading, any line shape — a bracketed kind is blocked by `validate`, because the bracket is the signature of a gate-actionable entry and outside the gate's zone that signature is either a parked violation or a mislabelled record. Records and mentions ABOUT violations (adjudications, findings prose, Human-queue entries) write the kind **without brackets**: `- fixed: contradiction — …`. Archived history goes in an HTML comment with its closing `-->` on its own line. The rule is shape-free on purpose — no way of dressing the line (bullet, number, quote, emphasis, checkbox, table) changes the verdict, which is what ended three rounds of shape-by-shape bypasses. **The comparison is normalised**: bracket interiors are folded to lowercase alphanumerics before matching, so `[Missing-Required]`, `[missing required]`, `[missing_required]` and a token split by an invisible character are all one token — spelling variants cannot become new bypasses. **And the vocabulary is closed**: kinds are these three fixed English tokens, period. A bracketed word outside them (`[모순]`, an ad-hoc label) is prose wearing brackets — the machine does not chase human wording (the same ruling that left claim-vs-body checking to humans), and inside the gate's own section such lines still fail closed (any non-placeholder bracketed line there is an entry). A review entry whose kind slot still holds the template placeholder but whose remainder is written out is treated as a real entry, not an untouched template — the remainder decides. **`Findings`** (advisory persona pass): `- [<severity>] <where> — <what + why>`, `severity` enum: `critical` | `should-fix` | `nice-to-have`. Plus an `adjudications` block recording fixed/dropped/accepted *advisory* findings (`- fixed|dropped|accepted: <finding> — <reason>` — `fixed` is history, the other two are suppressions) so re-reviews don't re-raise them, and a **`Human queue`** section with the same entry format and ownership rules as `truths/verify.md`'s — the advisory triage can dismiss a finding on semantic grounds too, and a dismissal the machine isn't allowed to make needs a legal place to sit on this side of the pipeline as well.
  - **Gate-slot clarification:** “a bracketed line inside the gate” above means a bracket occupying the entry-slot position: first after `- `, a hash pseudo-entry such as `#[kind]`, a hash-numbered pseudo-entry such as `#1 [kind]`, or a stray `-->` prefix. A bracket later in a normally spaced heading (for example `# 1 [draft]` or `# round 2 note [draft]`) is prose unless its bracket contains a known violation kind, which the shape-free zone rule still blocks. Slot-position brackets are typed before a heading may end the zone; any non-placeholder unknown slot blocks.
- `final.md` (single-file) or `final/` (multi-file) — the finished document. Written only when the fidelity gate is clean (zero open fidelity violations). Re-enters as an `origin: prior-doc` material for later documents — the gate is the membrane that keeps the growing material set free of contradictions.

## Quote markers in `converted.md` (schema v3 — not yet enforced)

**Status: declared, implemented read-only, and NOT wired to any gate.** The parser and its fixtures
exist; no command reads them yet. Recorded here so the grammar is written down in one place before
anything enforces it.

A verbatim claim in a machine-authored `converted.md` carries a marker immediately above its quote
block:

```markdown
<!-- wd:quote source=self file=source.md location="§4" mode=verbatim -->
> the sentence exactly as the raw source has it
```

- `source` — `self` (this material's own raw source) or `mNNN` (another material's). A material may
  not name **itself by id**: `self` is the one spelling, so one provider has one address. `tNNN` is
  refused outright — a truth proving a material that proves the truth is circular.
- `file` — the raw source's filename. Required when the material has more than one `source.*`, and
  always required for `mode=not-checkable`. Never inferred from "there was only one".
- `location` — human attribution, for a cold reviewer. Required for `mode=not-checkable`.
- `mode` — `verbatim` (default) or `not-checkable`. `not-checkable` is allowed only where the source
  is genuinely binary; it never reads as sealed and opens cold-verification debt instead. A text
  mismatch may not be relabelled into it.

The marker must occupy its own line(s) entirely — a marker inside a sentence, or nested in another
comment, is not a marker. **Every blockquote needs one:** an unmarked quote block is reported,
because deleting the marker would otherwise remove the claim from the checked set while it still
reads as a quotation.

The quote grammar is narrow: `>` at column zero. An indented `>`, a `>` inside a list item, and a
lazy continuation (a bare line a renderer folds into the quote) are **refused by name** rather than
half-checked — see [`PARSER-MODEL.md`](PARSER-MODEL.md) §5b. Comparison is byte-domain with the same
whitespace rule as the truth seal, so a re-wrapped quote is the same quote and a non-breaking space
is content rather than syntax.

## Truth → document propagation (change tracking)

When the data mine changes, documents drawn from it may become inconsistent. Two propagation triggers:

### Trigger A — truth changed (in-place claim edit)

A truth's `claim` is edited in place — adoption of a candidate, re-grounding on a correction material, or a 분리·병합 rewrite (schema v3: every value change is an in-place card edit, so claim change IS the trigger).

1. **Detection.** `weavedoc-map` (step 6) detects truth changes. For each changed truth id, it greps `documents/*/plan.md` frontmatter for `cited_truths` entries matching that id.
2. **Staleness.** Any document whose `cited_truths` includes the changed truth gets its `plan.md` `status` set to `stale`.
3. **Recovery.** Re-run `weavedoc-review` on the draft (re-checks cited truths), then `refine` if needed, then re-consecrate. Note a documented cost: fixing a `contradiction` violation routes through `map` (the user rules the entry; the ruling is applied to the card), which changes a cited truth and stales the very document being refined — one extra review round per conflict fixed. That is the bias-to-stale working as designed (the value DID change); it is priced here so nobody reads it as a malfunction.

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

Entries open at column 0; an indented line under an entry belongs to it (a continuation). A blank line or a closed comment/fence is state-neutral: it does not itself close or materialise the parent, while the next column-zero entry or EOF ends that parent. An indented bullet without a column-zero parent is surfaced as a malformed orphan, never accepted as a waiting question or discarded as prose. `status --open` folds continuations into the entry's listed line when the entry's own line is nothing but its state tag — including a still-template tag over real continuation content, which surfaces as an unrecognized state rather than vanishing (v0.5.10); when the entry already carries content, indented lines stay unlisted detail. The empty-ledger idiom is `- (없음)` / `- (none)` alone on its line (same as the Human queue's).

- `open` → `proposed` when candidates are on the table but nothing is confirmed.
- `proposed` → `answered` **only on a quotable confirming user utterance, recorded with the entry** (`(사용자: "라온이 좋아보여")`). Silence is not confirmation: a machine default that survived without objection stays `proposed` and its value is marked 제안값 — locking an item `answered` without an explicit confirmation caused a same-turn reopen in a real run.
- An item that was **asked but not answered** stays `open` — it never silently disappears into a material-side "미제공" note while the report claims "열린 갭 0".
- An answered question's content is saved as a `user-answer` material and cited.

## gaps.md
The **mine completeness register** written by `weavedoc-gaps` (project root). Surfaces structural gaps in an *already-closed* pattern so each is consciously **filled or accepted** — the incompleteness counterpart to conflict handling. **Non-blocking by default** (fill-or-accept). With `fidelity.completeness: required`, `validate` blocks a consecrated output while `# Open` holds entries — or while no gaps.md exists at all (a warranty nobody ran is not a warranty); `# Accepted` entries are decisions and never block. Under `required` the register grammar is **fail-closed and state-based** (v0.3.3): exactly one `# Open` and one `# Accepted` heading (both must exist), comments must balance (an unclosed `<!--` blanks everything after it and blocks), entries are `- ` bullets, and an indented line is a continuation **only under a bullet** — indented prose with no open entry above it blocks, because "a continuation of nothing" is a gap no counter sees. The placeholder filter judges the **remainder** (the same ruling review entries follow): a real gap that kept placeholder brackets in its kind slot (`- [<reference>] …` + filled prose) **counts as an open gap**; only a line that is placeholders throughout stays template noise. Anything else blocks as `COMP-MALFORMED`. `gaps.sections` is exactly two distinct non-empty positional roles (open, then accepted), and `gaps.enum.kind` is one or more distinct non-empty kind names. If either contract is malformed, every reader disables both roles and reports the schema error; it never drops an empty member, ignores an extra member or silently chooses a fallback. Two sections (`gaps.sections`):

**An empty section is zero bullets** (ruled 2026-08-07). The Human queue and `questions.md` have an empty-ledger idiom (`- (없음)` / `- (none)`); **this register does not, in either section.** Every bullet here is a kind-tagged gap or a kind-tagged accepted decision — that one invariant is what lets anything read the file, and a language-specific sentinel would carve an exception into it. A bullet with no usable `[<kind>]` slot is therefore a **malformed register entry**, not a gap: `validate` blocks it as `COMP-MALFORMED` under `required`, and `weavedoc status --open` lists it as malformed at any setting rather than counting it among the open gaps. (A real mine wrote `- (없음)` under `# Open` and the run reported one waiting gap whose entire text was the word "none".)

- **`# Open`** — `- [<kind>] <where> — <what's missing> — <evidence/pattern>` (+ optional ` — conf: high|med|low`; `low` entries are weak signals, collapsed out of headline counts). `kind` enum (`gaps.enum.kind`): `declared` (a material/truth says 미정/미완성/TBD — the mechanical floor, from `weavedoc gaps`), `reference` (a truth names a load-bearing entity no truth defines), `enumeration` (a stated count exceeds coverage — counted over the cards that exist (a card that exists is canonical, schema v3); mine statistics come from `weavedoc census`, never hand-counted), `symmetry` (peers of one class share an attribute one lacks — raise at peer coverage ≥ 3/4, below that it's a `conf: low` weak signal).
- **`# Accepted`** — `- [<kind>] <where> — <why intentionally left> — scope: <tags> — recheck: <condition> — as-of: <ids>`. A gap the user chose to leave open (do-not-resurface). It **re-surfaces** when its `scope` tags gain a new/changed truth (same staleness trigger as document propagation, Trigger B), or closes when filled.

A **filled** gap does not live here — the value enters via `questions.md` → `user-answer` material → `map` → truth, and the gap closes on the next scan. **Read-existing-first:** a topic is covered when a canonical card holds it, and a value can be *pending* rather than missing — sitting in an open conflicts.json entry or an answered `questions.md` line awaiting map — so check both before raising. `weavedoc gaps` (bin) provides only the mechanical `declared` scan over `converted.md` + `truths/`; the semantic kinds are the skill's job.

## .weavedoc/config.yaml
- `version` — int.
- `language` — prose language, set once at init.
- `paths` — locations of `inbox`, `materials`, `truths`, `documents` (only locations are changeable; structure is fixed).
- `fidelity` — the **mandatory gate** (weavedoc's warranty). Contradiction + grounding (every claim traces to a material; nothing contradicts the source) is **always enforced; no switch**. `completeness` (`off` | `required`) — when `required`, a missing *required* element is a violation (normative docs: contracts, SOWs). Fidelity violations block `final.md`/consecration regardless of `review`.
- `conflicts` — source-vs-source conflict handling (detection is review's #1 priority, **never off**). `detection` (`standard` | `deep`) — how hard to hunt conflicts between materials. (`attribution` is legacy-inert, schema v3: 병기 is the 분리·병합 ruling, per entry, always the user's — no standing authorization exists. The key stays legal for migrated v2 configs and nothing reads it.)
- `verify` — per-transformation fidelity check (upstream of the document-level review gate). `strength` (1 = block on critical, 2 = + should-fix, 3 = + nice-to-have — default 2), `max_rounds`, `repeat` (**clean rounds in a row** required to pass, keyed by scale — `full` defaults to 2; one clean round is not a pass), `scale` (`skip` | `light` | `standard` | `full` — project default; material format overrides per the format-risk table in `weavedoc-verify`).
- `review` — the **advisory** quality pass (never blocks consecration): `strength` (1 = block on critical, 2 = + should-fix, 3 = + nice-to-have — advisory findings only), `max_rounds` (exceeded → escalate to the user, never auto-pass), `repeat` (**clean rounds in a row** required, keyed by scale — `full` defaults to 2), `scale` (`skip` | `light` | `standard` | `full` — reviewer count/effort).
- `gaps` — the **mine completeness register** knobs (`weavedoc-gaps`; non-blocking). `markers` — a `|`-separated grep alternation of project-language incompleteness markers scanned by `weavedoc gaps` (e.g. `미정|미완성|TBD|추후 보강`); optional, a Korean-leaning default applies if unset.

## CLAUDE.md (the pointer block — bundle-owned)

`weavedoc init` plants a fixed block in the project's `CLAUDE.md`, between `<!-- weavedoc:begin -->` and `<!-- weavedoc:end -->`. Its text is **the bundle's**, shipped as `.weavedoc/templates/claude-block.md` — one copy, hashed in the release manifest, copied verbatim (markers included). Project-specific text goes **outside** the markers; the marked region is machine-owned.

It is a **pointer and only a pointer**: it says a mine is here and that `.weavedoc/READ.md` must be read before any data is, and it never restates what READ.md says. That is a hard rule, not a style preference. CLAUDE.md is injected into every session *before* any file is opened, so a summary living there does not merely go stale — it **primes**, and a primed reader reports the remembered version as the file's content. Observed on a real mine (2026-08-13): the block still carried a v2 parenthetical after migration had moved READ.md and every card to v3; a session read READ.md first, as instructed, reported the *v2* protocol as though quoting it, cited a `status:` field the mine does not have, and built the user's options on that model.

`validate` byte-compares the marked region against the shipped template (CRLF-normalised, so a Windows checkout does not false-alarm) and warns `CLAUDE-BLOCK-STALE` on any difference — the block is not automatically rewritten, because the mine's writers do not reach outside the mine. The repair is re-running `weavedoc-init`, whose reconfigure path re-ensures the block. The check is silent when neither marker is present (a project that never planted the pointer has no pointer to be stale) and reports `CLAUDE-BLOCK-NOTEMPLATE` when the template is missing, rather than letting an un-run comparison read as a pass.

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
| `CONFLICT-OPEN` | `.weavedoc-state/conflicts.json` holds open entries — undecided disagreements block shipping |
| `CFG-RANGE` | config number outside its allowed range |
| `CFG-UNKNOWN-KEY` | *(warning)* unknown top-level config key |
| `CLAUDE-BLOCK-NOTEMPLATE` | *(warning)* CLAUDE.md carries the marker block but `.weavedoc/templates/claude-block.md` is missing — the comparison did not run |
| `CLAUDE-BLOCK-STALE` | *(warning)* CLAUDE.md's weavedoc block is not the one this bundle ships (or its marker pair is broken) |
| `COMP-MALFORMED` | completeness required but `gaps.md` is structurally unreadable (missing/duplicate sections, lexical damage, stray records, invalid kind slots or unreadable lines) |
| `COMP-NO-REGISTER` | completeness `required` but no `gaps.md` — the warranty never ran |
| `COMP-OPEN-GAPS` | completeness `required` and open gaps sit next to a consecrated output |
| `CONSEC-INTERRUPTED` | an in-flight consecration artifact (`.consecrate.inflight` / `.final.bak`) exists |
| `COVERAGE-DANGLING` | coverage manifest mentions an id that no longer exists |
| `COVERAGE-LEGACY` | `## legacy` exemption section is malformed |
| `COVERAGE-MALFORMED` | `truths/coverage.md` exists but is unreadable or ends inside an open comment/code fence |
| `COVERAGE-SECTION` | coverage section missing or misnamed for a material |
| `DATE-INVALID` | a date field is not a real zero-padded `YYYY-MM-DD` |
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
| `HQ-UNTERMINATED-COMMENT` | `truths/verify.md` ends inside an open `<!--`, hiding its Human queue |
| `HQ-UNTERMINATED-FENCE` | a Human-queue file ends inside an open code fence — entries below it are invisible to every reader |
| `HQ-UNTERMINATED-FRONTMATTER` | `truths/verify.md` ends inside open frontmatter, so its Human queue is metadata rather than live structure |
| `HQ-UNTAGGED` | Human-queue entry without a valid ownership tag |
| `LEDGER-MALFORMED` | a verify-ledger row the reader cannot parse (columns, id, digest, round, standard or date) |
| `LEDGER-UNREADABLE` | the verify-ledger EXISTS but its bytes cannot be read (permissions, or a directory wearing its name) — unknown evidence is not absence, so nothing counts as verified until it is fixed |
| `LEDGER-VERDICT` | a verify-ledger row carries a verdict outside verified|failed|legacy-unbound |
| `IDX-MISSING` | `truths/index.md` or `tree.md` absent (run `reindex`) |
| `IDX-SYNC` | index and truth files disagree (run `reindex`) |
| `MAT-CORRECTS-DANGLING` | `corrects` names a material that does not exist |
| `MAT-CORRECTS-SELF` | a material corrects itself |
| `MAT-ENUM` | material `origin`/`status`/`stage` outside its enum |
| `MAT-FM-UNCLOSED` | material frontmatter is never closed — the body is empty to every reader |
| `MAT-ID-MISMATCH` | `id:` disagrees with the folder name |
| `MAT-ID-NONCANON` | folder name is not the canonical zero-padded id |
| `MAT-INTAKE-LEDGER` | *(warning)* `materials/intake-ledger.tsv` is unreadable, holds a row the reader cannot use, or names an id with no live material — the materials it covers read as undeclared |
| `MAT-NO-CONVERTED` | material folder without `converted.md` |
| `MAT-RESEARCH-FIELDS` | `origin: research` without `url` / `retrieved_at` |
| `MAT-ROLE` | material role is not declared in `project.md` |
| `MAT-UNDECLARED` | *(warning)* a material with no row in `materials/intake-ledger.tsv` — nothing records how it entered the mine, so a source the user handed over and a folder an agent wrote read identically |
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
| `REVIEW-COMMENT-SWALLOWS` | a comment hides violation-shaped entries from the gate |
| `REVIEW-DUP-HEADING` | more than one `Fidelity violations` heading — only the first is read |
| `REVIEW-KIND-OUTSIDE` | a bracketed violation kind sits outside the gate's zone |
| `REVIEW-KIND-SHAPE` | a gate entry the reader cannot act on (leading `#` or `-->`) |
| `REVIEW-KIND-UNKNOWN` | bracketed slot inside the gate is not an exact violation kind |
| `REVIEW-LOST-SECTION` | a declared section vanishes once comments are stripped |
| `REVIEW-UNREADABLE` | `review.md` exists but cannot be read, so the fidelity gate is unknown |
| `REVIEW-UNTERMINATED-COMMENT` | `review.md` ends inside an open `<!--` |
| `REVIEW-UNTERMINATED-FENCE` | `review.md` ends inside an open code fence, making fidelity-zone boundaries unreliable |
| `REVIEW-UNTERMINATED-FRONTMATTER` | `review.md` ends inside open frontmatter, hiding the fidelity gate as metadata |
| `SCHEMA-ROSTER` | the declared schema key roster is truncated |
| `SCHEMA-UNREADABLE` | `.weavedoc/schema` is missing/unreadable, or a consumed positional/enum contract (including gaps roles/kinds) is malformed — no verdict is issued |
| `SCHEMA-VERIFY-SECTIONS` | `verify.sections` is not exactly three distinct non-empty positional roles (Verified units, Human queue, Adjudications), so no section may grant evidence |
| `SEAL-QUOTE-MISSING` | a truth's verbatim body is not found in its source (laundering risk) |
| `SEAL-SPLIT-BLOCK` | body lines are each verbatim but not one contiguous block |
| `CONF-SOURCE-DANGLING` | a conflicts.json candidate cites a material the mine no longer holds |
| `CONF-TARGET-DANGLING` | a conflicts.json entry targets a truth card the mine no longer holds |
| `IDSEQ-BEHIND` | the allocator's next counter is at or below an observed id — the next grant would collide |
| `STATE-MALFORMED` | a `.weavedoc-state` file does not parse as its contract (the model's finer codes ride in the message) |
| `STATE-MISSING` | a v3 mine is missing `conflicts.json` or `id-sequences.json` — unreadable state never reads as empty |
| `TRUTH-BODY-EMPTY` | truth body is empty — there is no verbatim quote to seal |
| `TRUTH-BODY-FRAGMENT` | truth body is a single too-short fragment |
| `TRUTH-DIR` | a directory wearing a truth filename |
| `TRUTH-FM-UNCLOSED` | truth frontmatter is never closed |
| `TRUTH-ID-MISMATCH` | `id:` disagrees with the filename |
| `TRUTH-ID-NONCANON` | filename is not the canonical zero-padded id |
| `TRUTH-NO-FM` | file in `truths/` has no frontmatter — not read as a truth at all |
| `TRUTH-REF-DANGLING` | a truth reference field names an id that does not exist |
| `TRUTH-SOURCE-DANGLING` | `source` names a material that does not exist |
| `TRUTH-V2-FIELD` | a truth card carries a schema-2 state field (`status`/`conflict_with`/`resolution`/`superseded`) |
| `VER-DISAGREE` | `project.md` and `config.yaml` schema versions disagree |
| `VER-FUTURE` | the project declares a schema newer than this runtime supports |
| `VER-NOT-INT` | a schema version field is not an integer |
| `VER-V1-BRIDGE` | the mine is schema v1 — migrate via the pinned bridge runtime v0.5.21 first |
| `VER-V2-UPGRADE` | the mine is schema v2 — run the v2→v3 migrator before any other command |
| `VERIFY-ENUM` | `truths/verify.md` `status` outside its enum |
| `VERIFY-SECTION` | a required `verify.md` section is missing |
