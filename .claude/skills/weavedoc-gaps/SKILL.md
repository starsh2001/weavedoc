---
name: weavedoc-gaps
description: Surface structural gaps in the data mine — self-declared incompleteness (미정/TBD), dangling references, count mismatches, entity asymmetry — and resolve each by fill-or-accept. Use when the user says "gaps", "빠진 곳", "완성도 점검", "구멍", "뭐 비었어", "자료가 충분한가", "census", "completeness check", or before plan. Produces gaps.md.
---

# weavedoc-gaps

The mine's completeness gate — the incompleteness counterpart to conflict detection. WeaveDoc catches silent *drift* (conflicts, fidelity); this catches silent *incompleteness* — holes in an already-closed pattern. Every gap is surfaced and then consciously **filled or accepted**, so "unfinished" becomes a decision, never an oversight. Called repeatedly; re-evaluates as the mine grows.

> **Language: read it first.** Read `language:` from `.weavedoc/config.yaml` and write **every** reply in that language. These skill files are English; your output is not.

> **Running weavedoc: pick the shell by platform.** Commands below are written `node .weavedoc/bin/weavedoc.mjs …` and read the same in every shell. **On Windows run them through PowerShell; everywhere else through bash** — Git Bash pays ~290ms per process to emulate Unix (measured: 373ms vs 80ms for one invocation), and a mine-wide command spends most of its time there. Never create a `.ps1` wrapper: PowerShell's execution policy applies to `.ps1` files and a downloaded one is blocked under `RemoteSigned`, while `node script.mjs` is not subject to it at all.

> **One writer per mine.** WeaveDoc is single-writer: one mutating session, and one mutating command, against a mine at a time (FORMATS.md). The CLI refuses a second mutating command; it cannot see YOU editing mine files directly, so never run this skill against a mine another session is writing to. A lost seal or verification row is evidence, not a cache — re-running the command is not the repair.

> **Surface, don't point.** A run that ends with anything waiting on the user — an unresolved conflict, an open question, a Human-queue entry, a fidelity violation, an open gap — must state each item **in the closing message itself**: what it is (id where one exists) · the issue in one line (a conflict names both sides and their sources; a Human-queue entry keeps its ownership tag) · what the user must decide or supply. Every item gets its line — with many items, compress the detail, never the list. The file path comes *after* the substance, as the reference — never instead of it. "questions.md를 확인하세요" with the content only on disk is the handoff twin of the banned blanket "정확합니까?" (verify): no reviewable surface in the message, so the user must open files just to learn what is wrong. Ruled 2026-08-06 — real runs ended exactly that way ("파일을 안 열어봐도 어떤 부분이 문제인지 메시지로 명시"). Its mechanical source: `node .weavedoc/bin/weavedoc.mjs status --open` prints every open item across all five categories, one line each — take the list from that output and render it in the reply language, never re-compose it from memory (the census discipline, applied to the handoff).

> **Decisions: recommend + leave a way out.** For each gap, mark your recommended disposition `(추천)` (fill or accept) with a one-line why, and always allow a free-form answer. Don't force a closed pick.

> **Thin context.** Don't read the whole mine. Use `truths/index.md` and `catalog.md` as indexes; `grep` by tag; load individual files only when a check needs them. Re-read from disk.

> **Write-scope.** This skill writes only to `gaps.md` and `questions.md` (except one policy field: on the FIRST run it persists the 설정 밀도 answer to `project.md` frontmatter `gap_density` (`minimal`|`dense`) — step 6, asked once and never re-guessed). Fills flow through the normal pipeline (`gather`/`map` create the `user-answer` material and the truth) — this skill does **not** create truths or edit materials, and **never invents a value** (proposing candidates when the user asks is fine — but a proposal stays a proposal until adopted, and enters the mine tagged `provenance: adopted`, never as if the user said it).

> **Grounding discipline.** (1) When the user questions where a claim came from ("어디에 있어?"), **re-read the file before answering** — never answer from conversation memory — and show `source`/`location` + the verbatim line. (2) Never attach modifiers the material doesn't support (구버전·실제 적용…). (3) A guess with no material basis is presented as a guess, never "가능성이 높다".

## Prerequisite gate
- `.weavedoc/config.yaml` must exist. If not → `weavedoc init`.
- `truths/` must have truths (the mine must exist to have gaps). If not → `weavedoc map`.
- **Stop** if prerequisites aren't met.

## What counts as a gap — closed patterns only, high precision

A gate stops the user, so it raises only **defensible holes in a pattern the mine itself implies** — never "could be richer" (that's advisory, out of scope). Four kinds (`gaps.enum.kind`):

1. **declared** — a material or truth says it's incomplete (`미정`, `미완성`, `TBD`, `추후 보강`…). Mechanical: `weavedoc gaps` greps these over `converted.md` + `truths/` (never inbox/ref/source). Precision ~100%.
2. **reference** — a truth names an entity that no truth defines. **The noisy kind — bias hard to silence.** Raise only when the undefined entity clearly **carries narrative/structural weight** (a central named character, a role the mine leans on). A background relative, an institution named in passing, or a one-off proper noun is **not** a gap — e.g. `초아 외할머니` or `대형기획사 이사진` are mentioned but incidental → do not raise. When unsure, **don't raise** (note it in the report so the user can overrule).
3. **enumeration** — a stated count exceeds actual coverage: "6곡" but 5 lyric truths, "5인조" but 3 member profiles, "4 Phase" but 3 described. A card that exists is canonical (schema v3), so the count is over the cards that exist — `census` numbers, never eye-counts.
4. **symmetry** — peers of one class (members, songs, groups…) share an attribute that one lacks: 3 of 4 members have a 본명, one doesn't. Offer as a **candidate** — symmetry isn't always mandatory, so it's fill-or-accept like the rest.

Anything fuzzy or qualitative (narrative balance, "this theme is thin", "add stage notes") is **not** a gap — that's the optional enrichment layer, deliberately out of this skill.

## Two rules that keep precision honest

- **Read-existing-first.** Before raising a gap, check what the mine already encodes. An entity is **covered if any canonical card holds it** — "present via an older source" still counts (a card extracted from an early material is as current as any other; age of grounding is not absence). And check the open lanes before calling a blank fillable: a value sitting in an open conflicts.json entry or an answered `questions.md` line is *pending*, not missing. Count and compare over the cards that exist, never over "the newest batch."
- **Dedup by concept.** The same hole is often declared in several materials (Knock:One 상세 미완성 appears in three). Collapse to **one** gap citing all sources — never one row per mention.

## Fill or accept — the mandatory disposition, never a forced value

"필수" means every open gap must be **processed**, not that every blank must be filled. Two ways to close one:

- **Fill.** The user supplies the missing fact (or points to a source). Queue it in `questions.md`; the answer becomes a `user-answer` material via `gather`, `map` extracts the truth, and the gap closes on the next scan. **Grounded, never fabricated** — the value comes from the user or a material, not from you.
- **Accept.** The user declares the blank intentional (e.g. a name kept mysterious by design). Write it to `gaps.md` `# Accepted` with a **recheck condition** so it doesn't resurface — but isn't buried forever:
  `- [<kind>] <where> — <why left> — scope: <tags> — recheck: <condition> — as-of: <ids>`
  The accept **re-surfaces** when its `scope` tags gain a new or changed truth (the same staleness trigger as document propagation) — then ask once: "still intentional?" A new material that *contradicts* the accept's premise is a conflict → hand to `map`. Accept is always available, so the gate is mandatory **without deadlock.**

## Steps

1. **Scan (declared).** Run `node .weavedoc/bin/weavedoc.mjs gaps`. It prints the **census first** — truth-file count vs index entries, coverage records (numbering holes are the allocator's normal trace and are not reported). **Use the census numbers in every report; never count by eye** (a real run printed 191/181 for a mine of 188/178 and silently skipped a numbering hole). A census mismatch is itself an `enumeration` gap. Then triage the marker + checkbox hits: a marker inside **narrative prose** is not a declaration ("인정하지 못했다" matching `정하지 못` is noise) — real declarations live in table cells, editor's notes (`*… — 미완성 (추후 보강)*`), and unchecked checkboxes. Report what you dropped as noise.
2. **Scan (semantic).** For `reference`/`enumeration`/`symmetry`, read `truths/tree.md` (the tag-clustered view — don't also bulk-read `index.md`; they hold the same claims twice) and work by tag cluster (thin context). Apply the weight rule (reference), count live truths (enumeration), compare peers within a class (symmetry). **A verdict needs tool evidence** — "0건"/"없음" claims must rest on a `count` or files-mode grep, never on memory of prior reads and never on a truncated content grep (a real run "proved" an absence from a result cut at 40 lines). Single CJK characters (키·색) are not grep tokens — anchor them (`\| *\*\*키\*\*`) or search the value pattern (`[0-9]{2,3} *cm`). **Symmetry threshold:** raise at peer coverage ≥ 3/4 (or ≥75%); below that it's a weak signal — record with `conf: low`, collapsed out of the headline count (a real run raised a 2/4 and silently dropped a 2/7 because no threshold existed).
3. **Read-existing-first + dedup.** Drop anything the mine already covers (a canonical card, or a value pending in an open lane). Collapse mentions to concepts. **Absence has three readings** — before treating a blank as fillable, ask which it is: ① 값이 있는데 기록이 안 됐다 → fill, ② **애초에 쓰지 않았다** → that's a *fact* (route to gather/map: "X는 사용하지 않았다"), ③ 아직 안 정했다 → fill or accept. A `stage: plan` material makes ② likely — a plan entry is not evidence anything was used (a real run spent 4 turns hunting "구버전 Exclude 값" that were never-used plan entries).
4. **Reconcile the register.** For each `# Accepted` entry: filled → remove (closed); scope changed → flag for re-confirm; else keep suppressed. Drop `# Open` entries that are now filled/covered.
5. **Write `gaps.md`.** List surviving open gaps under `# Open` (kind, where, what, evidence, `conf:`).
6. **Disposition — sequential, priority-ordered.** More than 3 open gaps → **never one big table**; go one at a time (batches of ≤3 at most). Order by: recommended-fill first, then ascending fill cost; every gap carries a **cost label** (`값 1개` / `값 4개 + 선결정 1` / `서사 5인분`) so the user sees the weight before engaging (a real run listed a scalar and a 5-person narrative at equal weight, and the user had to impose order themselves: "순서대로 처리하자"). On the **first** gaps run, ask once and persist to `project.md` frontmatter `gap_density`: *"설정 밀도 — 빈칸을 촘촘히 채우는 편 / 최소로 유지하는 편?"* — this one policy sets the default disposition for most gaps; don't re-guess it per gap (a real run guessed 7 times and had 2 recommendations flipped by the user's one-line policy). Present each gap with a recommended fill/accept `(추천)` + why; allow free-form. Fill → `questions.md` (then point to `gather`/`map`). Accept → `# Accepted` with a recheck condition. Plain words in user-facing text — no 큐잉/진실화/봉인.
7. **Report.** Summarize open / filled-this-run / accepted, and what re-surfaced — with **census numbers**, not eye-counts. **List every candidate you considered and dropped, with the drop reason** — a complete ledger, not a sample (a real run's "올리지 않은 항목" list was itself missing three dropped candidates, including an unresolved user-confirmation request in verify.md). Unresolved confirmation requests found in non-truth mine files get their own "미해결 확인 요청" list — they are not gaps but must not be silently discarded.

## Fill protocol — how to ask (each rule broke in a real run)

- **Artifact-first.** If the missing thing is a real artifact the user may simply have (프롬프트·파일·가사·스펙), ask **"실물이 있으세요?"** before recommending accept — and never infer a real-world artifact's absence from in-world lore ("작중 강소은 작곡이니 프롬프트가 없을 것" — the user had all six prompts on hand; the accept recommendation would have sealed real material into `# Accepted`).
- **Convention before value.** If the value depends on a convention (나이 체계·기준 시점·단위·좌표계) that no material states, ask the convention as its own question **first** — never pick one silently and present computed results (a silently-chosen 세는나이 anchor seeded the debut-age incident two skills downstream).
- **Taste axis before candidates.** For naming/aesthetic fills, first ask which style axis the user wants — options are *style examples* (`순우리말 조어(미리내고) / 지명형(반포고) / 실존형 / …`), not candidate answers — then propose on the chosen axis. You already enumerate these axes internally; surface the enumeration instead of resolving it alone. A comparative rejection ("좀더 현실적으로") moves **one notch on the same axis** and keeps one previous candidate as an anchor — it is not a category switch (a real run jumped from 조어 to 실존 교명 and was corrected: "아니 실제 이름을 원한게 아냐").
- **Escalate your own flip-flops.** If your internal judgment on a point reverses ≥ 2 times while drafting, don't self-resolve — surface the wobble as the question. (A real run flipped an age-gap derivation four times in thinking, output only confidence, and the user's one-line frame answer — "페이즈별 스냅샷" — was an option the machine's menu never contained.)
- **Register check for descriptions.** For spaces/organizations/systems, ask which register the user wants — 분위기 한 줄 or 구조 명세(구획·연결 관계) — before proposing; mood adjectives answered a floor-plan question in a real run and took two corrections. When proposing, stay grounded in existing truths (a proposed "대표실" contradicted t018, which was already in the mine).
- **Symmetry fills.** Present ① existing peer values marked **정정 가능** (a fill turn may correct them — route corrections to map), ② the empty slots, ③ any pattern you noticed as an *observation*, never as the proposal's skeleton (an uninvited "나이순 키 사다리" was broken by the user's first answer, which also corrected an "existing" value).
- **One thing at a time.** Don't bundle "confirm the current item" with "decide the next item" while the current one is unconfirmed.

## Ledger discipline (questions.md / gaps.md)

- Three states: `[open]` → `[proposed]` (candidates on the table) → `[answered]`. `[answered]` **requires a quotable confirming user utterance recorded with the entry**; silence or momentum is not confirmation (a real run locked school names `answered` without one and reopened them next turn). A machine default that survived without objection stays `[proposed]`, its value marked 제안값 — it enters the mine as `provenance: adopted`, never as a user statement.
- **Write once, on settlement.** While a value is being batted around, keep it in conversation; write the file when the user confirms or when moving to the next item (the school-name line was rewritten 5× in one run; the same run's office item did 3 prose rounds + 1 write — regularize the good pattern).
- **Keep gaps.md honest.** At run end, annotate `# Open` entries answered this run (`→ answered in questions.md, map 대기`) — a cold reader of gaps.md alone must be able to see the interview happened.

## Relationship to other skills (no overlap)
- **verify** checks transformation *fidelity* ("was the material extracted faithfully?"). This checks *coverage* ("is what should be here, here?") — a different axis.
- **map** owns truths and conflicts; gaps never writes truths — fills route through map. A `reference`/`symmetry` gap is about absence, not contradiction.
- **plan** may consult `gaps.md` before proposing structure (document-scoped structural questions stay in plan; mine-scoped closure lives here). This skill does **not** hard-block plan — it's available anytime; the user chooses to harden the mine first or proceed. (Whether an open gap blocks `final.md` is the `fidelity.completeness` knob: `required` makes `validate` block a consecrated output while `# Open` holds entries — wired since v0.3.3.)
- **required_tags** (`project.md`) is the existing mine-level "tag must have ≥1 truth" check enforced by the fidelity gate; treat a zero-coverage required tag as an enumeration gap and surface it here too.

## Next
"map" to extract truths for anything you filled, then "verify", then "plan".

> **This skill must not be run as a subagent** — it may need user interaction for fill-or-accept.
