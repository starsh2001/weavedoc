---
name: weavedoc-init
description: First-time setup for a WeaveDoc project — opens with a fixed setup interview (language · fidelity · verify/review intensity), then creates the data mine infrastructure. Use when the user says "weavedoc init", "init weavedoc", "set up weavedoc", "start a weavedoc project", "weavedoc 시작", "초기화", or asks to initialize the document workspace. Re-invoking on an existing project re-runs the interview and updates config (it does not recreate the project).
---

# weavedoc-init

Setup of a WeaveDoc data mine — the persistent, growing truth-source that documents are drawn from. It **opens with a fixed setup interview** before creating anything. **Re-invoke init anytime to *reconfigure*** — it re-asks the interview and updates `.weavedoc/config.yaml`, without recreating folders or wiping materials/truths.

> **Language — detect, then CONFIRM (don't assume).** Check the OS locale (Unix `$LANG`/`LC_*`; on Windows, the registry locale since bash `$LANG` is empty). **Then confirm it with the user** — that's the interview's Q1, asked with the language as a word, not the code (*"OS 언어가 한국어로 잡혀요 — 이 언어로 진행할까요?"*, default = the detected one; the code goes to `config.language`, never shown). Reply in the chosen language from word one. If detection returns nothing, **ASK** outright — **never silently default to English.** The choice is written to `config.language`; all later skills just read it.

> **Decisions: recommend + leave a way out.** When you ask the user to decide: **mark your recommended option `(추천)`** with a one-line why, and **always allow a free-form answer.** Don't force a closed pick.

## Flow

### 1. Figure out what you have
**Check the directory first.** Does `.weavedoc/config.yaml` already exist? → this is a **reconfigure**: run only **§2 (the interview)**, update config, and **stop** — don't recreate folders. Otherwise, first-time setup — continue to §3+.

### 2. Setup interview — the fixed questionnaire (ask before creating anything)
Ask **exactly** these questions, in order. Don't improvise, skip, or silently default. A fixed interview keeps every project configured consciously and nothing decided in the dark. You may batch Q2–Q3 in one AskUserQuestion call.

**Q1. Language** — confirm the detected locale (see the callout above).

**Q2. Fidelity & conflicts** — explain briefly, then ask:
- **Completeness** — *"누락이 그 자체로 위반인 프로젝트인가요? (계약서, SOW → required / 일반 보고서 → off)"* (추천: off)
- **Conflict detection** — *"자료 간 충돌을 얼마나 적극적으로 찾을까요? (standard / deep)"* (추천: deep)
- **Conflict attribution** — *"충돌 발견 시 병기(양쪽 다 기록)를 건별로 물을까요, 프로젝트 전체에 허용할까요? (ask / allow)"* (추천: ask)

**Q3. Verify & review intensity** — explain the scale briefly, then ask:
- **Verify strength** — *"자료→진실 변환 검증 강도: 1(critical만) / 2(+should-fix) / 3(+nice-to-have)"* (추천: 2)
- **Review strength** — *"문서 리뷰 강도: 1 / 2 / 3"* (추천: 1)
- **Scale** — *"검증/리뷰 규모: skip / light / standard / full"* (추천: standard)

Write the answers to `.weavedoc/config.yaml`. On a **reconfigure**, update config, **re-ensure the CLAUDE.md pointer block** (see §3 — idempotent), and **stop here**.

### 3. Create the mine infrastructure (first-time only)
- **Folders.** Create `inbox/`, `materials/`, `truths/`, `documents/` per the config paths.
- **project.md.** Create from `.weavedoc/templates/project.md` with minimal defaults:
  - `roles` — leave empty `[]`; the first `gather` proposes roles from the actual materials.
  - `tone` — leave empty; it is optional HERE (a standing project tone, if one exists). Each `plan` then writes a concrete tone into its own `plan.md`, where the field is required — "inherited" is resolved at plan time, not left blank.
  - `required_tags` — leave empty unless completeness is `required`.
  - Body — a one-line placeholder: the mine's character reveals itself as materials are gathered.
- **CLAUDE.md pointer (read-protocol tripwire).** *Unlike the rest of §3, this bullet runs on **reconfigure** too (§2 points here).* Ensure the project's `CLAUDE.md` contains this fixed block between the markers (create the file if absent; if the markers exist, replace the block's content; otherwise append — **idempotent, never duplicated**). This is what makes any future session — including creative ones that never invoke a weavedoc skill — hit the read protocol before touching the mine:

  ```markdown
  <!-- weavedoc:begin -->
  This repo contains a WeaveDoc data mine (truths/, materials/). Before reading ANY data
  from it — for any purpose, including creative work — read and follow `.weavedoc/READ.md`
  (status filtering, as_of, provenance). For lookups, prefer:
  `bash .weavedoc/bin/weavedoc pull <tag-or-keyword>`.
  <!-- weavedoc:end -->
  ```

### 4. Hand off
The data mine is ready to grow — this opens the **mine-building phase**. When ready, the user can drop materials into `inbox/` and say **"gather"**, or seed from this conversation by saying so (gather distills it). Offer these as available options ("이제 gather를 할 수 있습니다"), not instructions.

## Rules
- Fixed English keys/enums; prose in `config.language` (see `.weavedoc/FORMATS.md`).
- The interview is **fixed and complete** — never skip a question, never silently default a config value.
- Init sets up **infrastructure only** — it does not ask about project purpose, material types, or output documents. Those emerge from gather (roles), plan (document type/tone/scope), and the materials themselves.
- This skill **must not** be run as a subagent — it requires user interaction for the interview.
