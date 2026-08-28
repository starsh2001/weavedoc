---
name: weavedoc-init
description: First-time setup for a WeaveDoc project — opens with a fixed setup interview (language · fidelity · verify/review intensity), then creates the data mine infrastructure. Use when the user says "weavedoc init", "init weavedoc", "set up weavedoc", "start a weavedoc project", "weavedoc 시작", "초기화", or asks to initialize the document workspace. Re-invoking on an existing project re-runs the interview and updates config (it does not recreate the project).
---

# weavedoc-init

Setup of a WeaveDoc data mine — the persistent, growing truth-source that documents are drawn from. It **opens with a fixed setup interview** before creating anything. **Re-invoke init anytime to *reconfigure*** — it re-asks the interview and updates `.weavedoc/config.yaml`, without recreating folders or wiping materials/truths.

> **Language — detect, then CONFIRM (don't assume).** Check the OS locale (Unix `$LANG`/`LC_*`; on Windows, the registry locale since bash `$LANG` is empty). **Then confirm it with the user** — that's the interview's Q1, asked with the language as a word, not the code (*"OS 언어가 한국어로 잡혀요 — 이 언어로 진행할까요?"*, default = the detected one; the code goes to `config.language`, never shown). Reply in the chosen language from word one. If detection returns nothing, **ASK** outright — **never silently default to English.** The choice is written to `config.language`; all later skills just read it.

> **Decisions: recommend + leave a way out.** When you ask the user to decide: **mark your recommended option `(추천)`** with a one-line why, and **always allow a free-form answer.** Don't force a closed pick.

> **Running weavedoc: pick the shell by platform.** Commands are written `node .weavedoc/bin/weavedoc.mjs …` and read the same in every shell. **On Windows run them through PowerShell; everywhere else through bash** — Git Bash pays ~290ms per process to emulate Unix (measured: 373ms vs 80ms for one invocation), and a mine-wide command spends most of its time there. Never create a `.ps1` wrapper: PowerShell's execution policy applies to `.ps1` files and a downloaded one is blocked under `RemoteSigned`, while `node script.mjs` is not subject to it at all.

> **One writer per mine.** WeaveDoc is single-writer: one mutating session, and one mutating command, against a mine at a time (FORMATS.md). The CLI refuses a second mutating command; it cannot see YOU editing mine files directly, so never run this skill against a mine another session is writing to. A lost seal or verification row is evidence, not a cache — re-running the command is not the repair.

> **The work's owner is the skill, not the session.** When a run spawns work another skill owns — a ruling mid-verify that needs a material (gather), a card correction (map), a document edit (write) — invoke that skill before doing the work; never imitate its output shape from memory. Imitation carries the visible conventions and drops the invisible duties. Measured (a real run): a verify walkthrough produced 8 materials and 23 cards inline with gather/map never loaded — all seven of the round's blocking findings clustered in that unloaded work, while the loaded skill's own procedure ran clean. Rule distance, not context volume, corrodes.

## Authority — who decides, at this mine's level

Read `authority` from `.weavedoc/config.yaml`: `strict` | `standard` | `delegated`, and **absent means `standard`** (this axis is younger than every mine that exists, so absence is the normal state, not a gap). For work that belongs to a document, that document's `plan.md` frontmatter may override the mine's level; the override governs the document's own steps and leaves mine-side work at the mine's level, because nothing has ruled yet whether a strict document reaches back over the materials it draws on. **A decision the level's text does not name goes to the user.** Same fail-safe direction the Human queue's ownership tag takes, for the same reason: a decision the machine takes unasked is invisible, while one it surfaces costs a question. And the level says who decides, never what is true — the mirror rule, the quote seal, the intake declaration, conflict blocking and the fidelity gate hold identically at all three.

**This skill's row.** Init is where the level is **chosen** rather than exercised: the interview's Authority question (§2) writes `authority` into `config.yaml`, and a reconfigure re-asks it like every other answer. One thing follows that looks like a gap and is not — **init never back-fills the key into a config that lacks it.** A mine with no `authority` line predates the axis and reads as `standard` everywhere, and writing that default in would erase the one distinction that matters here: whether anyone chose it. Beyond the interview, init falls under the rule above, which is what it already does: it asks.

## Flow

### 1. Figure out what you have
**Check the directory first.** Does `.weavedoc/config.yaml` already exist? → this is a **reconfigure**: run only **§2 (the interview)**, update config, and **stop** — don't recreate folders. Otherwise, first-time setup — continue to §3+.

### 2. Setup interview — the fixed questionnaire (ask before creating anything)
Ask **exactly** these questions, in order. Don't improvise, skip, or silently default. A fixed interview keeps every project configured consciously and nothing decided in the dark.

**Q1. Language** — confirm the detected locale (see the callout above). This one you assemble yourself: it names the detected language as a word, so it has no fixed wording to hand out.

**Q2 and Q3 come from the runtime, not from this file.**

```
node .weavedoc/bin/weavedoc.mjs interview
```

It prints **two JSON arrays** — Q2 (`authority`, `completeness`, `conflicts.detection`) and Q3 (`verify.strength`, `review.strength`, `scale`). **Paste each array verbatim as `AskUserQuestion`'s `questions` argument**, one call per array. Two calls, not one: the tool takes at most four questions and the interview asks six. `authority` opens the first call because it is the framing question — **who decides**, as against the *how hard do we check* axis every other question sets; the two are orthogonal, and a project can want either combination.

- **Copy, never retype.** The output is entirely ASCII with every Korean character pre-escaped, precisely so that no one has to encode Hangul by hand — the step where the sibling project GroveSpec measured two corruptions (`나뉩니다` printed as `나뉜니다`) that reached the user's screen. Re-typing or re-encoding the payload puts that step back.
- **Explain before you ask.** The arrays carry the questions and the options; the one- or two-sentence framing of what each group decides is yours to say in the report's opening.
- **If `config.language` is not Korean, translate the decoded text.** Translating is a different act from transcribing, and it is the agent's job.
- **A label IS a config value** (`strict`, `standard`, `delegated`, `off`, `required`, `deep`, `1`, `2`, `3`, `light`, `full`, `skip`) — with no exception and no suffix to strip: write the chosen label into `config.yaml` exactly as it came back. The recommendation is marked at the **start of the option's description** (`(추천) …`), and the recommended option is listed first. A regression case compares the labels against `.weavedoc/schema` **verbatim, both directions**, so the questionnaire can neither offer a value `validate` would reject nor withhold a legal one.

(There is no attribution question: every conflict ruling is the user's, per-entry — 병기 is the 분리·병합 ruling, whose record is the split cards themselves. The v2-era `conflicts.attribution` key was retired in 0.6.14; a stray line is simply unread.)

Write the answers to `.weavedoc/config.yaml`. On a **reconfigure**, update config, then re-ensure the **four** idempotent guards from §3 — the **configured folders and their `.gitkeep` markers**, the **search shield (`.ignore`)**, the **CLAUDE.md pointer block** and the **settings hook entries** — and **stop here**. (This said *two* through v0.5.20 while the folder bullet below already claimed to run on reconfigure — the two lines contradicted each other, and a reconfigure that renames a path leaves a NEW empty directory that Git cannot carry, so the marker guard belongs in this list. External review, v0.5.21.) (Each of the four is marked *runs on reconfigure too*; a reconfigured mine that skips the shield leaves its raw layer searchable until the next gather, and one that skips the hook entries leaves the skill gate unwired until init runs again.)

### 3. Create the mine infrastructure (first-time only)
- **State files (schema v3).** Create `.weavedoc-state/` with the two machine-owned files a v3 mine carries from birth, both in their valid empty form: `conflicts.json` as `{"version": 1, "open": []}` and `id-sequences.json` as `{"version": 1, "next": {"conflict": 1, "material": 1, "truth": 1}}` (2-space indent, trailing newline — the canonical spelling the runtime writes). `validate` fail-closes on a v3 mine missing either (`STATE-MISSING`): a conflicts store that cannot be read must never read as "no conflicts". The directory lives at the mine root, OUTSIDE `.weavedoc/`, precisely so replacing the runtime bundle wholesale can never overwrite mine state; it is versioned like the rest of the mine (never gitignored). *Runs on **reconfigure** too* — but only ever CREATES missing files, never overwrites existing state.
- **Folders.** Create `inbox/`, `materials/`, `truths/`, `documents/` per the config paths — **each with a `.gitkeep` inside**. *Runs on **reconfigure** too* (a renamed path leaves a new directory that Git also cannot carry). Git stores files, never directories, so a configured directory that is still empty simply does not survive a clone — and `validate` then blocks with `CFG-PATH-MISSING`, correctly, because a check that walks a directory which isn't there runs zero times and that is indistinguishable from passing. Measured on a fresh clone of a real mine: `documents/` gone, rc 1. The marker is the fix rather than teaching `validate` to accept a missing directory: the fail-closed reading is the one worth keeping, and it is the empty directory that is unrepresentable, not the check that is wrong.
- **project.md.** Create from `.weavedoc/templates/project.md` with minimal defaults:
  - `roles` — leave empty `[]`; the first `gather` proposes roles from the actual materials.
  - `tone` — leave empty; it is optional HERE (a standing project tone, if one exists). Each `plan` then writes a concrete tone into its own `plan.md`, where the field is required — "inherited" is resolved at plan time, not left blank.
  - `required_tags` — leave empty unless completeness is `required`. When it IS `required`: ask the user which topics are mandatory **only if they can name them now** (a contract project usually can — 조항 categories are known before materials arrive); otherwise **defer explicitly**: leave `[]`, tell the user the completeness setting has no mechanical teeth until this list is filled (validate's required-tag check over an empty list checks nothing), and note that the first `gather`/`map` proposes candidates from the actual materials and the first `plan` (structural-gap step) cross-checks them. Deferring is legal; deferring *silently* is what leaves the setting inert.
  - Body — a one-line placeholder: the mine's character reveals itself as materials are gathered.
- **Search shield (`.ignore`).** *Runs on **reconfigure** too.* Ensure the project root has an `.ignore` file shielding the raw layer from content searches (create if absent; if present, ensure the two entries exist). Use the **configured** `paths` values, not the literals:

  ```
  # WeaveDoc search shield — the raw layer is the AUDIT surface, not the read surface.
  # ripgrep-family search (git or not) skips these by default, so a casual grep can
  # never hand out raw, superseded source text. Deliberate reads by path still work —
  # that is the audit path (verify, retraction). NOT .gitignore: originals stay versioned.
  inbox/
  materials/*/source.*
  ```

  This is the mechanical half of the read protocol: the CLAUDE.md block below tells a session *not* to read raw sources; this makes a content search *unable to find them* even in a session that never reads the block. Ruled 2026-07-31.

  **Say this out loud at setup — `.ignore` is a search shield, not a security boundary (WD-SEC-001).** Tell the user, in one plain sentence, that **raw originals stay versioned in Git**: `materials/*/source.*` is committed like any other file, so anything sensitive in a source document goes into the repository's history and reaches everyone who can clone it. That is deliberate — the raw layer is the audit surface, and a mine whose originals are not versioned cannot prove what it was built from. But it is a *choice*, and the user must be told it was made rather than discovering it after a push. If the project handles sensitive material, the honest options are: keep the repository private, keep the mine out of Git entirely, or gitignore `materials/*/source.*` **while accepting that the audit trail and any recovery of originals then live outside version control**. Do not describe `.ignore` as protection: it hides files from content search, and nothing more — it is not access control, not encryption, and not a Git exclusion.
- **CLAUDE.md pointer (read-protocol tripwire).** *Unlike the rest of §3, this bullet runs on **reconfigure** too (§2 points here).* Ensure the project's `CLAUDE.md` carries the contents of **`.weavedoc/templates/claude-block.md`, verbatim** — that file already holds the `<!-- weavedoc:begin -->` / `<!-- weavedoc:end -->` markers, so it is a copy and never an assembly. Create `CLAUDE.md` if absent; if the markers are already there, replace that whole region (markers included) with the file's bytes; otherwise append — **idempotent, never duplicated**. Anything the project wants to say for itself goes *outside* the markers. This is what makes any future session — including creative ones that never invoke a weavedoc skill — hit the read protocol before touching the mine.

  **Copy it; do not retype, reword or re-wrap it.** The block's text belongs to the **bundle**, not to this skill and not to the project: `validate` byte-compares the marked region against that template (CRLF-normalised) and warns `CLAUDE-BLOCK-STALE` when they differ. That warning is the only thing standing between a bundle upgrade and a pointer that quietly keeps describing the previous one — the repair is re-running this skill (reconfigure), which lands right back here.

  **A pointer may not summarise.** The block names where the protocol lives and stops; it must never restate what `.weavedoc/READ.md` says. CLAUDE.md is injected into every session *before* any file is opened, so a summary there does not merely go stale — it **primes**, and a primed reader reports the remembered version as the file's content. Measured (eclypse, 2026-08-13): the block still carried a v2 parenthetical — `(status filtering, as_of, provenance)` — after `upgrade --apply` had moved the schema, the validator, READ.md and 271 cards to v3. A session read READ.md first, exactly as instructed, and still reported the *v2* protocol as though quoting the file, cited a `status: ok` field that exists nowhere, built the user's options on that model, and — when challenged — blamed the file for being out of date. A wrong model does not just produce a wrong answer; asking the user a question on top of it launders the error into a decision.

- **Settings hook entries (the skill gate's wiring).** *Runs on **reconfigure** too.* Ensure the project's `.claude/settings.json` carries the hook entries `.weavedoc/templates/hooks.json` ships — **copy them verbatim; do not retype, reword or re-shape them.** An entry is ours exactly when its command contains the marker substring `.weavedoc/bin/hooks/`: replace every entry carrying that marker with the template's current one, and **preserve every entry that does not** — a project's own hooks are not ours to touch, and deleting someone else's entry breaks their machinery in a file we merely share. Create the file, its `hooks` object and any missing event array when absent — idempotent, never duplicated.

  The entries' text belongs to the **bundle**: `validate` compares the planted ones against that template and warns `HOOKS-STALE` when they differ (`HOOKS-NOTEMPLATE` when the template itself is gone), and the repair is re-running this skill (reconfigure), which lands right back here. They comply with the planted-artifact rule below: each command is a stable, version-free path into the bundle, so replacing `.weavedoc/` changes what the gate does without another visit to `settings.json`.

### 4. Hand off
The data mine is ready to grow — this opens the **mine-building phase**. When ready, the user can drop materials into `inbox/` and say **"gather"**, or seed from this conversation by saying so (gather distills it). Offer these as available options ("이제 gather를 할 수 있습니다"), not instructions.

## Report
Open and close this run with the **step report** — the fixed shape in `.weavedoc/FORMATS.md` ("The step report"): the `[weavedoc-init] starting` anchor and 2–4 sentences, then `done — …` carrying `Result` · `Open` · `Your turn` · `Next`, in that order, none omitted. §4 above is the `Next` slot. What this skill puts in the two middle slots:
- **Open** — anything the interview deferred rather than decided, above all `required_tags` left empty under `completeness: required` (the setting has no mechanical teeth until that list is filled, and saying so is this slot's job).
- **Your turn** — nothing, on an ordinary run: the interview already collected every decision. Say that in a sentence rather than dropping the slot.

The opening report matters most here, because this is the run where the user meets WeaveDoc: the interview questions come first, and the anchor plus its 2–4 sentences are what tell someone what they are about to be asked and why.

## Rules
- Fixed English keys/enums; prose in `config.language` (see `.weavedoc/FORMATS.md`).
- The interview is **fixed and complete** — never skip a question, never silently default a config value.
- Init sets up **infrastructure only** — it does not ask about project purpose, material types, or output documents. Those emerge from gather (roles), plan (document type/tone/scope), and the materials themselves.
- **What init PLANTS may not carry version-dependent prose.** A bundle file travels with the bundle — replace `.weavedoc/` and it is current again. A planted file (`project.md`, `.ignore`, the CLAUDE.md block) is copied into the mine once and **no command reaches back into it**: `upgrade` moves the schema, the validator, READ.md and every card, and a planted sentence describing "how this version works" stays behind, indefinitely, next to a mine that no longer works that way. So a planted artifact states *its own* content (paths it shields, values it declares) and points at the bundle for everything else. The CLAUDE.md block and the settings hook entries are the two planted artifacts the bundle checks (`CLAUDE-BLOCK-STALE`, `HOOKS-STALE`): the block because it is injected into a session before any file is read, the entries because the harness executes them without any session reading them at all. In both, a stale copy misleads a reader who has no reason to look.
- This skill **must not** be run as a subagent — it requires user interaction for the interview.
