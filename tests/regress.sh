#!/usr/bin/env bash
# WeaveDoc regression suite — tracked in tests/ since Phase 0 (IMPROVEMENT_PLAN WD-QA-001).
#
# Fixtures: a per-run mktemp workspace, removed on exit — parallel runs cannot collide.
# Results: a keyed cache dir under $TMPDIR (key = commit + bundle bytes + OS + tool versions),
# which is what makes --resume safe across exactly one thing: the same configuration.
#
#   bash notes/regress.sh            # every case (parallel)
#   bash notes/regress.sh gate       # only cases whose name contains "gate"
#   bash notes/regress.sh -j1 gate   # serially, for debugging
#   bash notes/regress.sh --one NAME # exactly one case, output inline
#
# One `validate` costs ~35s on MSYS/Windows for a 1-truth mine, so cases run in parallel, each in
# its own copy of the fixture. Each case starts from a pristine minimal project (1 material ·
# 1 truth · 1 document · final.md) that validates clean, mutates it, and asserts on the output.
# A case named block_* must be REJECTED for a named reason; pass_* must not be rejected at all;
# acct_* asserts on the `examined:` accounting line.

set -u
REPO=$(cd "$(dirname "$0")/.." >/dev/null 2>&1 && pwd)

# ---- workspace & result-cache isolation (WD-QA-002) ----
# Fixtures live in a per-run mktemp dir removed by trap: two runs can never collide, and an
# interrupted run leaves no workspace behind. Results live in a KEYED cache dir — the key hashes
# commit + bundle bytes + OS + tool versions, so --resume can only ever reuse results produced by
# THIS exact configuration. A different key is a different directory: stale results are
# unreachable, not filtered. WD_REG_KEY_SALT exists so a test can force a fresh key.
KEY=$( { git -C "$REPO" rev-parse HEAD 2>/dev/null
         cat "$REPO/.weavedoc/VERSION" 2>/dev/null
         sha256sum "$REPO/.weavedoc/bin/weavedoc" "$REPO/.weavedoc/schema" 2>/dev/null | awk '{print $1}'
         uname -sr; bash --version | head -1; awk --version 2>/dev/null | head -1; sed --version 2>/dev/null | head -1
         printf '%s' "${WD_REG_KEY_SALT:-}"
       } | sha256sum | awk '{print $1}' | cut -c1-12 )
CACHE="${TMPDIR:-/tmp}/wd-reg-$KEY"
RES="$CACHE/res"
# Workers inherit the parent's workspace via env; only the invocation that CREATED the mktemp
# dir removes it (a worker must never delete the floor the other workers stand on).
CREATED_WORK=0
if [ -n "${WD_REG_WORK:-}" ] && [ -d "${WD_REG_WORK:-}" ]; then
  WORK="$WD_REG_WORK"
else
  WORK=$(mktemp -d "${TMPDIR:-/tmp}/wd-reg-work.XXXXXX")
  CREATED_WORK=1
  export WD_REG_WORK="$WORK"
fi
PRISTINE="$WORK/pristine"
cleanup() { [ "$CREATED_WORK" -eq 1 ] && rm -rf "$WORK" 2>/dev/null; }
trap cleanup EXIT
# Best-effort child reaping on abort (MSYS process groups are approximate; the mktemp removal
# above is what guarantees no cross-run contamination either way).
trap 'trap - INT TERM; kill 0 2>/dev/null' INT TERM
W=""
OUT=""; RC=0
CASE=""
JOBS=6
FILTER=""
ONE=""
RESUME=0
LIMIT=0
while [ $# -gt 0 ]; do
  case "$1" in
    -j*) JOBS=${1#-j} ;;
    -n*) LIMIT=${1#-n} ;;
    --one) ONE="$2"; shift ;;
    --resume) RESUME=1 ;;
    *) FILTER="$1" ;;
  esac
  shift
done

TO=""
command -v timeout >/dev/null 2>&1 && TO="timeout 300"

# ---------------------------------------------------------------- fixture

# review4 <root> <violations-body> [heading-line]
review4() {
  local root="$1" body="$2" head="${3:-# Fidelity violations}"
  {
    printf -- '---\n'
    printf 'round: 1\n'
    printf 'consecutive_passes: 0\n'
    printf -- '---\n\n'
    printf '%s\n\n' "$head"
    [ -n "$body" ] && printf '%s\n\n' "$body"
    printf '# Findings\n\n'
    printf '# Adjudications\n\n'
    printf '# Human queue\n'
  } > "$root/documents/d1/review.md"
}
REV() { review4 "$W" "$@"; }

mkpristine() {
  rm -rf "$PRISTINE" 2>/dev/null
  mkdir -p "$PRISTINE"
  cp -r "$REPO/.weavedoc" "$PRISTINE/.weavedoc"
  cp "$REPO/.weavedoc/templates/config.yaml" "$PRISTINE/.weavedoc/config.yaml"
  mkdir -p "$PRISTINE/inbox" "$PRISTINE/materials/m001" "$PRISTINE/truths" "$PRISTINE/documents/d1"

  cat > "$PRISTINE/project.md" <<'EOF'
---
version: 2
language: ko
roles: [계약서]
tone: 담백
required_tags: []
---

최소 픽스처 프로젝트.
EOF
  sed -i 's/^version: 1$/version: 2/' "$PRISTINE/.weavedoc/config.yaml"

  cat > "$PRISTINE/catalog.md" <<'EOF'
# 자료 목록

| id | 제목 | 역할 | 상태 |
|---|---|---|---|
| m001 | 용역 계약서 | 계약서 | converted |
EOF

  cat > "$PRISTINE/materials/m001/converted.md" <<'EOF'
---
id: m001
title: 용역 계약서
origin: file
role: 계약서
topics: [대금, 위약]
format: md
source_path: inbox/contract.md
added: 2026-07-01
status: converted
summary: 대금과 위약금을 정한 최소 계약서.
---

# 용역 계약서

제3조 대금은 5천만원으로 한다.
제5조 납품 기한은 2026년 12월 31일로 한다.
제7조 위약금은 계약금액의 10%로 한다.
EOF

  cat > "$PRISTINE/truths/t001.md" <<'EOF'
---
id: t001
claim: "위약금은 계약금액의 10%다"
source: m001
location: "제7조"
tags: [위약]
status: ok
provenance: stated
---

제7조 위약금은 계약금액의 10%로 한다.
EOF

  cat > "$PRISTINE/truths/coverage.md" <<'EOF'
# Coverage

## m001

- 위약금 조항: t001
- 대금 조항: (아직 추출 안 함)
EOF

  cat > "$PRISTINE/truths/verify.md" <<'EOF'
---
status: passed
round: 1
verified_at: 2026-07-30
---

## Verified units

- m001 · t001 — R1 2026-07-30 · passes 2/2 · verified

## Adjudications

## Human queue
EOF

  cat > "$PRISTINE/truths/changelog.md" <<'EOF'
# 변경 로그

- added: t001 (2026-07-30)
EOF

  cat > "$PRISTINE/documents/d1/plan.md" <<'EOF'
---
doc_id: d1
doc_type: report
tone: 담백
status: planned
continues: []
cited_truths: [t001]
scope_tags: [위약]
---

# 개요

<!-- purpose: 계약 요약 | tags: 위약 | required -->
EOF

  cat > "$PRISTINE/documents/d1/draft.md" <<'EOF'
# 개요

위약금은 계약금액의 10%다. <!-- t:t001 -->
EOF

  cp "$PRISTINE/documents/d1/draft.md" "$PRISTINE/documents/d1/final.md"
  review4 "$PRISTINE" ""
  ( cd "$PRISTINE" && bash .weavedoc/bin/weavedoc reindex >/dev/null 2>&1 )
}

# ---------------------------------------------------------------- assertions

RESULT=""
ok()  { [ -z "$RESULT" ] && RESULT="PASS"; return 0; }
bad() { RESULT="FAIL $1"; }

expect_block() { # $1 = substring the rejection must name
  if [ "$RC" -eq 0 ]; then bad "expected rejection, got a pass"
  elif ! printf '%s\n' "$OUT" | grep -qF -- "$1"; then bad "rejected, but not for [$1]"
  else ok; fi
}
expect_pass() { if [ "$RC" -ne 0 ]; then bad "expected a pass, got rejection"; else ok; fi; }
expect_has()   { printf '%s\n' "$OUT" | grep -qF -- "$1" || bad "output lacks [$1]"; ok; }
expect_hasnt() { printf '%s\n' "$OUT" | grep -qF -- "$1" && bad "output must not contain [$1]"; ok; }

vrun() { OUT=$( ( cd "$W" && $TO bash .weavedoc/bin/weavedoc "$@" ) 2>&1 ); RC=$?; }

# ---------------------------------------------------------------- gate: must block
# Every one of these ships final.md next to an OPEN violation.

block_gate_plain() {
  REV '- [contradiction] 3장 — 초안은 위약금 30%라 쓰지만 t001은 10%다'
  vrun validate; expect_block "consecrated through an open gate"
}
block_gate_angle_contra() {
  REV '- [<contradiction>] 3장 — 초안 <12%>는 t001(<10%>)과 모순'
  vrun validate; expect_block "consecrated through an open gate"
}
block_gate_angle_unsup() {
  REV '- [<unsupported>] 2장 <각주 3> — 인용된 수치가 어느 자료에도 없다'
  vrun validate; expect_block "consecrated through an open gate"
}
block_gate_brace_missing() {
  REV '- [{missing-required}] {대금} — 필수 태그에 truth가 없다'
  vrun validate; expect_block "consecrated through an open gate"
}
block_gate_level2() {
  REV '- [contradiction] 3장 — t001과 모순' '## Fidelity violations'
  vrun validate; expect_block "consecrated through an open gate"
}
block_gate_subheading_sibling() {
  # A SIBLING section name written one level deeper must not end the section from inside it.
  REV '## Findings

- [contradiction] 3장 — 초안은 위약금 30%라 쓰지만 t001은 10%다'
  vrun validate; expect_block "consecrated through an open gate"
}
block_gate_subheading_hq3() {
  REV '### Human queue

- [contradiction] 3장 — t001과 모순'
  vrun validate; expect_block "consecrated through an open gate"
}
block_gate_planted_sibling_tier() {
  # Siblings at ##, violations at #, and a planted `## Findings` INSIDE the violations section.
  # Textually identical to the legitimate layout in pass_gate_siblings_l2, so no level rule can
  # separate them — this is the case the file-wide entry census exists for.
  {
    printf -- '---\nround: 1\n---\n\n'
    printf '# Fidelity violations\n\n'
    printf '## Findings\n\n- [contradiction] 3장 — 초안은 위약금 30%%라 쓰지만 t001은 10%%다\n\n'
    printf '## Adjudications\n\n## Human queue\n'
  } > "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
block_gate_entry_after_second_heading() {
  # The entry sits under a SECOND copy of the heading, which the gate never reads.
  REV ''
  printf '\n# Fidelity violations\n\n- [contradiction] 3장 — t001과 모순\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
block_gate_subheading_own() {
  # Same shape with a non-sibling sub-heading — this direction has been closed since .11.
  REV '## round 2

- [contradiction] 3장 — t001과 모순'
  vrun validate; expect_block "consecrated through an open gate"
}
block_gate_unterminated_comment() {
  REV '<!-- 지난 라운드 보관
- [contradiction] 3장 — t001과 모순'
  vrun validate; expect_block "unterminated"
}
block_gate_arrow_swallows_entries() {
  # C2 (R3): a forgotten `<!--` swallows perfectly REGULAR entries and a mid-prose arrow closes it
  # — no heading is swallowed, so the declared-section survival check stays silent, and the file
  # does not end inside a comment, so comment_balanced stays silent. The closer's shape is the
  # tell: prose follows the arrow on the same line.
  REV ''
  cat >> "$W/documents/d1/review.md" <<'EOF'

<!-- 라운드 1(닫힘) 기록 보관
- [contradiction] (R1) 인용 오류 — 수정 완료

- [contradiction] (R2) 초안 2장 — 위약금 문장이 t001 원문과 어긋난다
- [unsupported] (R2) 초안 3장 — 지연배상 수치에 근거 truth가 없다

정정 흐름: 초안 --> 검토 --> 재작성
EOF
  vrun validate; expect_block "closing '-->' is followed by"
}
pass_gate_prose_arrow_no_comment() {
  # arrows in prose with NO open comment anywhere — must stay silent
  REV ''
  printf -- '\n검토 순서: 초안 --> 재작성 --> 봉헌.\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_pass
}
block_gate_arrow_prefixed_entry() {
  # R4-S2: a `-->`-opened line whose kind is EXACT used to get "fix the kind" — a prescription
  # with nothing to fix. The message must name the arrow as the cause. INSIDE the section now:
  # outside it the zone rule speaks first (with its own correct prescription), so the arrow
  # guidance's jurisdiction is the zone interior.
  REV '--> - [contradiction] 3장 — 초안 30% vs t001 10%'
  vrun validate; expect_block "starts with '-->'"
  expect_hasnt "fix the kind"
}
block_gate_arrow_prefixed_outside() {
  # the same line parked outside: the zone rule names it — blocked either way
  REV ''
  printf -- '\n--> - [contradiction] 3장 — 초안 30%% vs t001 10%%\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
block_gate_arrow_swallows_nearmiss() {
  # R4-S1 half 1: a comment swallowing ONLY near-miss / #-numbered shapes — the lines the
  # near-miss guidance calls "someone trying to write a violation" — used to count 0 and
  # stay silent even with a mid-line closer
  REV ''
  cat >> "$W/documents/d1/review.md" <<'EOF'

<!-- 라운드 1 기록 보관
#1 [contradiction] 3장 — 초안 30% vs t001 10%
#2 [Unsupported ] 5장 — 근거 없는 날짜
정정 흐름: 초안 --> 검토 --> 재작성
EOF
  vrun validate; expect_block "closing '-->' is followed by"
}
block_gate_arrow_entry_on_closer_line() {
  # R4-S1 half 2: the swallowed entry sits ON the closing line itself — the pre-arrow part
  # of that line is comment interior and must be counted before the C event fires
  REV ''
  cat >> "$W/documents/d1/review.md" <<'EOF'

<!-- 보관 시작
- [contradiction] 3장 — 초안 30% vs t001 10% --> 이후 재검토 예정
EOF
  vrun validate; expect_block "closing '-->' is followed by"
}
pass_gate_archived_entry_arrow_eol() {
  # the deliberate-archive shape stays legal: entries swallowed, closer ENDS its line
  REV ''
  cat >> "$W/documents/d1/review.md" <<'EOF'

<!-- 라운드 1(닫힘) 기록 보관
- [contradiction] 3장 — 해소됨
-->
EOF
  vrun validate; expect_pass
}
block_gate_stray_arrow() {
  # `-->` in ordinary prose LATER in the file rebalances the count, so the file does not end inside
  # a comment — and everything between the two markers, violations included, is blanked out.
  REV '<!-- 보관
- [contradiction] 3장 — t001과 모순'
  printf '\n초안 2장 --> 3장 순서로 읽는다.\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "gone once comments are stripped"
}
block_gate_heading_in_comment() {
  # The heading exists only inside a closed comment, on its own line: dup_section greps the RAW file
  # and sees one (so the gate is deemed runnable) while fid_body, which reads through nocomment,
  # finds nothing and calls the section empty.
  {
    printf -- '---\nround: 1\n---\n\n'
    printf '<!--\n# Fidelity violations\n\n'
    printf -- '- [contradiction] 3장 — t001과 모순\n-->\n\n'
    printf '# Findings\n\n# Adjudications\n\n# Human queue\n'
  } > "$W/documents/d1/review.md"
  vrun validate; expect_block "heading the gate can read"
}
pass_gate_archived_heading() {
  # The other direction of the same two-reader split: keeping a PAST round inside a closed comment,
  # heading and all, makes the raw grep count two headings and blocks forever — and the message says
  # to merge them, which revives a closed violation and blocks again. There is no way out.
  {
    printf -- '---\nround: 2\n---\n\n'
    printf '# Fidelity violations\n\n'
    printf '<!-- 라운드 1 이력 (해소됨)\n# Fidelity violations\n\n'
    printf -- '- [contradiction] 3장 — 초안 30%%가 t001과 모순 (해소)\n-->\n\n'
    printf '# Findings\n\n# Adjudications\n\n# Human queue\n'
  } > "$W/documents/d1/review.md"
  vrun validate; expect_pass
}
block_gate_final_dir() {
  rm -f "$W/documents/d1/final.md"; mkdir -p "$W/documents/d1/final"
  cp "$W/documents/d1/draft.md" "$W/documents/d1/final/01.md"
  REV '- [contradiction] 3장 — t001과 모순'
  vrun validate; expect_block "consecrated through an open gate"
}
block_gate_no_review() {
  rm -f "$W/documents/d1/review.md"
  vrun validate; expect_block "no review.md"
}
block_gate_dup_heading() {
  REV '- [contradiction] 3장 — t001과 모순'
  printf '\n# Fidelity violations\n\n- 보관\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "more than one 'Fidelity violations' heading"
}

# near-miss kinds: ruled 2026-07-31 — not guessed into a violation, not binned as template; a
# dedicated prob names the slot and demands an exact kind (fails toward blocking either way)
block_gate_kind_case() {
  REV '- [<Contradiction>] 3장 — 초안이 t001과 모순'
  vrun validate; expect_block "not an exact violation kind"
}
block_gate_kind_space() {
  REV '- [<missing-required >] {대금} — 필수 태그에 truth가 없다'
  vrun validate; expect_block "not an exact violation kind"
}
block_gate_kind_dual() {
  REV '- [<contradiction / unsupported>] 2장 — 어느 쪽인지 정하지 않았다'
  vrun validate; expect_block "not an exact violation kind"
}
block_gate_kind_outside() {
  # a near-miss parked OUTSIDE the section: the zone rule catches it (bracketed kind, any shape,
  # case-insensitive) — the near-miss guidance is inside-zone only now
  REV ''
  printf -- '\n- [<Contradiction>] 3장 — 절 밖에 주차된 근사 항목\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
pass_gate_kind_typo_archived() {
  REV '<!--
- [<Contradiction>] 지난 라운드 — 해소됨
-->'
  vrun validate; expect_pass
}

# `#`-prefixed entries: ruled 2026-07-31 — is_noise drops every `#` line (a rule meant for headings,
# which fid_body already discards), so a numbered list renders as body text and reads as an empty
# section. Named, not guessed into a violation.
block_gate_hash_numbered() {
  REV '#1 [contradiction] 3장 — 초안이 t001과 모순
#2 [unsupported] 2장 — 근거가 없다'
  vrun validate; expect_block "starts with '#'"
}
block_gate_hash_outside() {
  # outside the zone the near-miss guidance no longer runs — the zone rule names it directly
  REV ''
  printf -- '\n#1 [contradiction] 3장 — 절 밖에 주차된 번호 항목\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
pass_gate_hash_archived() {
  REV '<!--
#1 [contradiction] 지난 라운드 — 해소됨
-->'
  vrun validate; expect_pass
}
pass_gate_hash_prose() {
  # a `#` line with no kind in its slot is ordinary prose/heading — must stay silent
  REV '# round 2 노트 [작성중]

라운드 2에서 위반 없음.'
  vrun validate; expect_pass
}

# bullet-shape variants parked outside the readable section: the census now counts with the gate's
# own judge (gate_entry = is_noise + kind-bearing + entry-position), so the bullet shape no longer
# decides visibility (C1)
block_gate_bullet_star() {
  REV ''
  printf -- '\n* [contradiction] 3장 — 별표 불릿으로 절 밖에 주차\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
block_gate_bullet_twospace() {
  REV ''
  printf -- '\n-  [unsupported] 2장 — 두 칸 불릿\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
block_gate_bullet_tab() {
  REV ''
  printf -- '\n-\t[contradiction] 3장 — 탭 불릿\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
block_gate_bulletless() {
  REV ''
  printf -- '\n[contradiction] 2장 — 불릿 없음\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
block_gate_star_nearmiss() {
  # `* [<Contradiction>]` is an is_noise ENTRY (the template rule matches `- [<` only), so it is
  # census jurisdiction — the shape mis-scoped as C3 during the .1 work, now genuinely closed
  REV ''
  printf -- '\n* [<Contradiction>] 3장 — 별표+꺾쇠 조합\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
block_gate_ordered_list() {
  # R4-C1: a markdown ORDERED list is scaffolding, not words — is_noise calls it an entry
  REV ''
  printf -- '\n1. [contradiction] 3장 — 초안은 30%%라 쓰지만 t001은 10%%다\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
block_gate_blockquote() {
  REV ''
  printf -- '\n> - [contradiction] 3장 — 인용문 안에 주차된 항목\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
block_gate_nbsp_bullet() {
  # what a paste from a word processor leaves: U+00A0 after the bullet
  REV ''
  printf -- '\n-\302\240[contradiction] 3장 — 불릿 뒤가 비분리 공백\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
block_gate_unclosed_bracket() {
  # the closing ] was never typed; the slot ends at the first space instead
  REV ''
  printf -- '\n- [contradiction 3장 — 닫는 대괄호를 안 침\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
block_gate_unclosed_bracket_todo() {
  # ACCEPTED FALSE-POSITIVE (2026-08-01 zone rule — the belt buckle beeps): an unclosed bracket
  # holding a kind word anywhere before its (missing) `]` is indistinguishable from an entry whose
  # closing bracket was never typed, so it blocks. The escape is one keystroke and the message
  # says it: write the note without the bracket (`- TODO contradiction 처리…`).
  REV ''
  printf -- '\n- [TODO contradiction 처리 방침을 정할 것\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
pass_gate_bare_todo_note() {
  # the escape the message prescribes — same note, no bracket
  REV ''
  printf -- '\n- TODO contradiction 처리 방침을 정할 것\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_pass
}
block_gate_labelled_entry_outside() {
  # RETIRED LIMIT (2026-08-01 zone rule): this shape used to pass silently as a "stated limit"
  # because a labelled entry and an adjudication record share a string shape. Under the zone rule
  # the ambiguity is gone the loud way — BOTH block, and the message names the record-writer's
  # legal spelling (kind without brackets).
  REV ''
  printf -- '\n- 3장 [contradiction] 라벨을 앞에 붙인 항목\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
block_gate_emphasised_kind() {
  # R5-C1 half 1 (:274): inline markup around the kind is scaffolding — the line renders as an
  # ordinary entry with the kind emphasised, and is_noise calls it an entry
  REV ''
  printf -- '\n- **[contradiction]** 3장 — 초안 30%% vs t001 10%%\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
block_gate_backticked_kind() {
  REV ''
  printf -- '\n- `[contradiction]` 3장 — 인라인 코드로 감싼 kind\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
block_gate_task_checkbox() {
  # R5-C1 half 2 (:279-282): a markdown task checkbox is not the kind slot — advance exactly one
  REV ''
  printf -- '\n- [ ] [contradiction] 3장 — 체크리스트로 쓴 위반 목록\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
block_gate_task_checkbox_checked() {
  REV ''
  printf -- '\n- [x] [contradiction] 3장 — 체크된 항목\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
block_gate_bracketed_label_outside() {
  # retired limit, bracketed twin — same ruling as block_gate_labelled_entry_outside
  REV ''
  printf -- '\n- [3장] [contradiction] 라벨을 대괄호로 감싼 항목\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
block_gate_findings_bracketed_mention() {
  # a Findings entry whose prose BRACKETS a kind: under the zone rule the bracket is the metal —
  # mentions outside the zone spell the kind bare
  REV ''
  printf -- '\n- [critical] 게이트가 [contradiction] 줄을 못 본다 — 3장\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
pass_gate_findings_unbracketed_mention() {
  # the legal spelling of the same sentence: kind without brackets — no metal, no beep
  REV ''
  printf -- '\n- [critical] 게이트가 contradiction 줄을 못 본다 — 3장\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_pass
}
block_gate_emphasised_prose_mention() {
  REV ''
  printf -- '\n- *중요* [contradiction] 관련 논의 메모\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
block_gate_half_written_template() {
  # R5-S1 (ruled 2026-08-01): the kind slot still says {kind} but the entry is written out. That
  # is someone who filled it in and missed one slot, and it was dropped in silence — a written
  # violation inside the section, shipping under a clean tick.
  REV '- [{kind}] 3장 — 초안은 위약금 30%라 쓰지만 t001은 10%다'
  vrun validate; expect_block "consecrated through an open gate"
}
block_gate_half_written_angle() {
  REV '- [<kind>] 3장 — 초안 30% vs t001 10%'
  vrun validate; expect_block "consecrated through an open gate"
}
block_gate_half_written_unclosed() {
  # the closing ] is missing too, so the slot's own } must not be mistaken for "still a template"
  REV '- [{kind} 3장 — 닫는 대괄호도 빠짐'
  vrun validate; expect_block "consecrated through an open gate"
}
pass_gate_untouched_template_line() {
  # the shipped template's own line — remainder is placeholders too, so nothing was written
  REV '- [{kind}] {where} — {what}'
  vrun validate; expect_pass
}
pass_gate_untouched_template_angle() {
  REV '- [<kind>] <where> — <what>'
  vrun validate; expect_pass
}
pass_gate_bare_placeholder_stub() {
  # placeholder with nothing after it — still an untouched stub
  REV '- [{kind}]'
  vrun validate; expect_pass
}
block_gate_ordered_list_inside() {
  # the control that proves the bundle no longer contradicts itself: same line, inside the section
  REV '1. [contradiction] 3장 — 초안은 30%라 쓰지만 t001은 10%다'
  vrun validate; expect_block "consecrated through an open gate"
}
block_adjudication_bracketed_kind() {
  # FORMAT CHANGE (2026-08-01): a record about a violation writes its kind WITHOUT brackets.
  # The bracketed form used to pass as the stated limit; under the zone rule the bracket is the
  # entry signature, so a bracketed kind outside the zone always stops — and the message teaches
  # the legal spelling.
  REV ''
  printf -- '\n- fixed: [contradiction] 3장 건 — 원문 재인용으로 해소\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
  expect_has "without brackets"
}
pass_adjudication_kind_unbracketed() {
  # the legal record spelling: kind as a bare word
  REV ''
  printf -- '\n- fixed: contradiction 3장 건 — 원문 재인용으로 해소\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_pass
}
block_gate_spelled_kind_outside() {
  # R6-C1: token comparison is normalised — `missing required` (space for hyphen) is the same token
  REV ''
  printf -- '\n- [missing required] 5장 — 인건비 산출 근거가 없다\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
block_gate_zwsp_kind_outside() {
  # a zero-width space inside the token — invisible to the eye, folded away by the comparison
  REV ''
  printf -- '\n- [contra\342\200\213diction] 3장 — 제로폭 공백\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
pass_gate_korean_word_outside() {
  # THE VOCABULARY BOUNDARY (ruled 2026-08-01): kinds are the three fixed English tokens. A
  # bracketed Korean word is prose wearing brackets — out of the warranty (the same ruling that
  # left claim-vs-body to humans). Inside the zone it still fails closed via is_noise.
  REV ''
  printf -- '\n- [모순] 3장 — 어휘 밖이므로 산문\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_pass
}
acct_status_empty_queue_idiom() {
  # R6-N1: `- (없음)` is the documented empty-queue idiom, not an untagged entry
  printf -- '- (없음)\n' >> "$W/truths/verify.md"
  vrun status; expect_hasnt "no '[open]'/'[ruled]' state tag"
}
block_gate_table_row() {
  # a TABLE of violations parked outside — a shape no round had found yet; under the zone rule
  # the shape never mattered, which is the point
  REV ''
  printf -- '\n| [contradiction] | 3장 | 초안 30%% vs t001 10%% |\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
block_gate_undeclared_heading() {
  # parked under a heading that is no declared section at all
  REV ''
  printf -- '\n# 라운드 메모\n\n- [contradiction] 3장 — 초안 30%% vs t001 10%%\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
pass_gate_bare_kind_prose_outside() {
  # a kind as a BARE WORD outside the zone is prose, not a record signature — no bracket, no metal
  REV ''
  printf -- '\n다음 라운드에서 contradiction 검출 규칙을 재검토한다.\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_pass
}
meta_single_judges() {
  # The drift every round kept finding — "the rule was unified, one site was left out" — is now
  # watched by the suite itself: each grep pins an invariant about the BINARY, so a new duplicate
  # judge fails here before a cold reviewer has to find it.
  local B="$REPO/.weavedoc/bin/weavedoc" bad="" fn n
  for fn in is_noise has_fm fid_mark fid_body nocomment canon_id is_placeholder req_value \
            truth_digest mat_digest unit_digest ledger_rows ledger_file \
            artifact_digest context_digest doc_draft_path doc_final_path; do
    n=$(grep -cE "^${fn}\(\)" "$B" || true)
    [ "${n:-0}" -eq 1 ] || bad="$bad ${fn}=${n};"
  done
  # the opening-fence judge is has_fm ONLY — an inline exact-match comparison is a second judge
  n=$(grep -c 'head -1.*= "---"' "$B" || true)
  [ "${n:-0}" -eq 0 ] || bad="$bad inline-fence-judges=${n};"
  # strict key spelling (`^key:` with nothing between key and colon) must not reappear in any
  # frontmatter/flow reader — the lenient form is `^key[[:space:]]*:` (three rounds re-learned this)
  n=$(grep -cE '\^(source|status|tags|claim|title|origin|role|topics|format|added|summary|resolution|conflict_with|provenance|derived_from|superseded|corroborated_by|winner|decided_by|decision_kind|scope):[^:]' "$B" || true)
  [ "${n:-0}" -eq 0 ] || bad="$bad strict-key-patterns=${n};"
  OUT="${bad:-ok}"; RC=0; [ -n "$bad" ] && RC=1
  expect_pass
}
pass_hq_kind_mention() {
  # a Human-queue entry whose prose mentions a kind — first slot is [open], not a kind (kind-bearing filter)
  REV ''
  printf -- '\n- [open] [user-only] contradiction 처리 방침 — 병기 허용 여부\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_pass
}

# heading shapes the reader cannot match -> that silence is itself a failure
block_title_suffix()   { REV '- [contradiction] x — y' '# Fidelity violations (2건)'; vrun validate; expect_block "heading the gate can read"; }
block_title_colon()    { REV '- [contradiction] x — y' '# Fidelity violations:';      vrun validate; expect_block "heading the gate can read"; }
block_title_number()   { REV '- [contradiction] x — y' '# 1. Fidelity violations';    vrun validate; expect_block "heading the gate can read"; }
block_title_case()     { REV '- [contradiction] x — y' '# FIDELITY VIOLATIONS';       vrun validate; expect_block "heading the gate can read"; }
block_title_bilingual(){ REV '- [contradiction] x — y' '# Fidelity violations 충실성 위반'; vrun validate; expect_block "heading the gate can read"; }
block_title_nbsp()     { REV '- [contradiction] x — y' "$(printf '# Fidelity violations\xc2\xa0')"; vrun validate; expect_block "heading the gate can read"; }
block_title_indent()   { REV '- [contradiction] x — y' '  # Fidelity violations';     vrun validate; expect_block "heading the gate can read"; }

# ---------------------------------------------------------------- paths

block_paths_redirect() {
  sed -i 's|^  truths: truths$|  truths: truths-moved|; s|^  documents: documents$|  documents: documents-moved|' "$W/.weavedoc/config.yaml"
  vrun validate
  expect_block "config paths.truths"
  expect_has "truths 0"
}
pass_paths_dot_prefix() {
  # A path that spells the SAME folder a different way is not a redirect.
  sed -i 's|^  materials: materials$|  materials: ./materials|' "$W/.weavedoc/config.yaml"
  vrun validate; expect_pass
}
pass_paths_absolute() {
  local abs; abs=$( cd "$W" >/dev/null && pwd )
  sed -i "s|^  documents: documents$|  documents: $abs/documents|" "$W/.weavedoc/config.yaml"
  vrun validate; expect_pass
}

# ---------------------------------------------------------------- truth/material level

# H1 (R3): legal YAML spellings of a key that the strict field readers missed. On `source` the miss
# was silent and total — the seal is guarded by tsrc!="" so it ran zero times and a fabricated body
# shipped under a tick.
block_source_space_before_colon() {
  sed -i 's/^source: m001$/source : m001/' "$W/truths/t001.md"
  sed -i 's/^제7조 위약금은 계약금액의 10%로 한다\.$/제7조 위약금은 계약금액의 50%로 하며 계약을 해지한다./' "$W/truths/t001.md"
  vrun validate; expect_block "quote not found"
}
block_source_no_space_after_colon() {
  sed -i 's/^source: m001$/source:m001/' "$W/truths/t001.md"
  sed -i 's/^제7조 위약금은 계약금액의 10%로 한다\.$/제7조 위약금은 계약금액의 50%로 하며 계약을 해지한다./' "$W/truths/t001.md"
  vrun validate; expect_block "quote not found"
}
pass_key_spacing_variants() {
  # the same spellings on a HONEST truth: readers accept them, the seal runs and passes
  sed -i 's/^source: m001$/source : m001/; s/^status: ok$/status:ok/; s/^tags: \[위약\]$/tags :[위약]/' "$W/truths/t001.md"
  vrun validate; expect_pass
  vrun census; expect_has "live 1"
}

pass_source_unpadded() {
  # R4-S3: `source: m1` names folder m001 — a REFERENCE, so the .2 leniency promise applies.
  # It used to fail "no material folder" on every truth of a mine migrated exactly as the
  # CHANGELOG instructed, and while it failed the seal did not run. Must resolve AND seal,
  # and the coverage pairing must still land on `## m001`.
  sed -i 's/^source: m001$/source: m1/' "$W/truths/t001.md"
  vrun validate; expect_pass
  expect_has "1 sealed"
}
block_source_unpadded_dishonest() {
  # leniency must not weaken the seal: the resolved source's body is still checked verbatim
  sed -i 's/^source: m001$/source: m1/' "$W/truths/t001.md"
  sed -i 's/^제7조 위약금은 계약금액의 10%로 한다\.$/제7조 위약금은 계약금액의 50%로 하며 계약을 해지한다./' "$W/truths/t001.md"
  vrun validate; expect_block "quote not found"
}
block_source_dangling() {
  # a source naming NO folder in any spelling still blocks
  sed -i 's/^source: m001$/source: m404/' "$W/truths/t001.md"
  vrun validate; expect_block "no material folder"
}
pass_coverage_unpadded_mention() {
  # coverage's truth mentions are references too: `t1` in the ## m001 section must pair with
  # t001.md — not read as "no such truth file", and not leave t001 reported missing
  sed -i 's/^- 위약금 조항: t001$/- 위약금 조항: t1/' "$W/truths/coverage.md"
  vrun validate; expect_pass
}
block_empty_source() {
  sed -i 's/^source: m001$/source:/' "$W/truths/t001.md"
  vrun validate; expect_block "frontmatter 'source' is empty"
}
block_empty_body() {
  awk '/^---[[:space:]]*$/{n++} {print} n==2{exit}' "$W/truths/t001.md" > "$W/truths/t001.new"
  mv "$W/truths/t001.new" "$W/truths/t001.md"
  vrun validate; expect_block "body is empty"
}
block_fm_unclosed() {
  awk 'NR==1{print; next} /^---[[:space:]]*$/{next} {print}' "$W/truths/t001.md" > "$W/truths/t001.new"
  mv "$W/truths/t001.new" "$W/truths/t001.md"
  vrun validate; expect_block "frontmatter is never closed"
}
block_material_fm_unclosed() {
  awk 'NR==1{print; next} /^---[[:space:]]*$/{next} {print}' "$W/materials/m001/converted.md" > "$W/materials/m001/new"
  mv "$W/materials/m001/new" "$W/materials/m001/converted.md"
  vrun validate; expect_block "never closed"
  # S2 (R3): the material is unread, so its truths are UNCHECKED — not accused of laundering,
  # and not counted as a seal that ran and failed
  expect_hasnt "laundering risk"
  expect_has "← 1 NOT checked"
}
pass_material_dated() {
  # R5-S9: `dated` is the source's OWN date — the only field a supersedes resolution may order by
  # (`added` is intake order and a batch makes them equal). Optional, but date-checked when present.
  sed -i '/^added:/a dated: 2026-06-15' "$W/materials/m001/converted.md"
  vrun validate; expect_pass
}
block_material_dated_malformed() {
  sed -i '/^added:/a dated: 2026-6-15' "$W/materials/m001/converted.md"
  vrun validate; expect_block "dated '2026-6-15' is not a date"
}
block_material_fence_space_unclosed() {
  # R4-C2: `--- ` opens frontmatter everywhere else in the tool, so the "never closed" alarm must
  # still fire. It used to be switched off by the trailing space, and with it the whole seal.
  awk 'NR==1{print "--- "; next} /^---[[:space:]]*$/{next} {print}' "$W/materials/m001/converted.md" > "$W/materials/m001/new"
  mv "$W/materials/m001/new" "$W/materials/m001/converted.md"
  vrun validate; expect_block "never closed"
  expect_has "← 1 NOT checked"
}
pass_material_fence_space_closed() {
  # the other direction: the same spelling, properly closed, is legal input and still seals
  sed -i '1s/^---$/--- /' "$W/materials/m001/converted.md"
  vrun validate; expect_pass; expect_has "1 sealed"
}
block_truth_fence_space_unclosed() {
  # the twin at the truth side: it used to report "no frontmatter … not read as a truth at all",
  # three clauses that are false of a file whose fence is merely spelled with a trailing space
  awk 'NR==1{print "--- "; next} /^---[[:space:]]*$/{next} {print}' "$W/truths/t001.md" > "$W/truths/new"
  mv "$W/truths/new" "$W/truths/t001.md"
  vrun validate; expect_block "never closed"
  expect_hasnt "not read as a truth at all"
}
pass_truth_fence_space_closed() {
  sed -i '1s/^---$/--- /' "$W/truths/t001.md"
  vrun validate; expect_pass; expect_has "1 sealed"
}
block_placeholder_tone() {
  # Ruled 2026-07-31: an unfilled template placeholder is an instruction, not a value. validate
  # accepted it as present-and-non-empty and write read the instruction AS the document's tone.
  sed -i 's/^tone: .*$/tone: {the project tone, copied here, unless this document overrides it}/' "$W/documents/d1/plan.md"
  vrun validate; expect_block "still holds the template placeholder"
}
block_placeholder_truth_claim() {
  # the truth side reads through the big awk — same rule, same pattern, read from the schema
  sed -i 's/^claim: .*$/claim: {one-sentence fact}/' "$W/truths/t001.md"
  vrun validate; expect_block "still holds the template placeholder"
}
block_placeholder_material_title() {
  sed -i 's/^title: .*$/title: {human-readable name}/' "$W/materials/m001/converted.md"
  vrun validate; expect_block "still holds the template placeholder"
}
pass_braces_inside_a_real_value() {
  # deliberately narrow: only a value that is ENTIRELY one brace group. Real content that merely
  # contains braces is untouched — the escape the message prescribes.
  sed -i 's/^tone: .*$/tone: {담백} 유지/' "$W/documents/d1/plan.md"
  vrun validate; expect_pass
}
pass_placeholder_shaped_tag_list() {
  # a LIST of placeholders opens with `[`, so the rule never sees it as one brace group
  sed -i 's/^tags: \[위약\]$/tags: [{tag1}, {tag2}]/' "$W/truths/t001.md"
  vrun validate; expect_hasnt "still holds the template placeholder"
}
block_last_truth_deleted() {
  # R5-C2: deleting the last truth file used to switch OFF required_tags coverage, the index set
  # cross-check and the coverage cross-check — all three, under a clean ✓ exit 0, while index.md
  # and coverage.md still named the deleted truth. "No truths" is the strongest thing those
  # checks have to say, not a reason to skip them.
  sed -i 's/^required_tags: \[\]$/required_tags: [위약]/' "$W/project.md"
  rm -f "$W/truths/t001.md"
  vrun validate; expect_block "has no live truths"
  expect_has "entry 't001' has no truth file"
  expect_has "coverage.md  mentions 't001'"
  expect_hasnt "fatal"
}
block_catalog_missing() {
  # R5-N1: deleting catalog.md switched the orphan cross-check off in both directions under a
  # clean tick — the same silence index.md/tree.md have always been loud about
  rm -f "$W/catalog.md"
  vrun validate; expect_block "catalog.md  missing"
}
pass_verify_md_absent_is_legal() {
  # R5-N1, ruled 2026-08-01: absence is LEGAL (verify is an on-demand lane, so blocking would fail
  # every mine before its first run) but NOT silent — status says so.
  rm -f "$W/truths/verify.md"
  vrun validate; expect_pass
  vrun status; expect_has "verification: none yet"
}
acct_census_duplicate_index_line() {
  # R5-N2: the printed count read LINES while the set cross-check compares `sort -u` ids, so a
  # duplicated entry printed two disagreeing numbers with nothing explaining them
  printf -- '- t001: 위약금은 10%%다 [m001] — [위약]\n' >> "$W/truths/index.md"
  vrun census; expect_has "entry line(s) for 1 distinct id(s)"
}
block_hq_subheading_grouping() {
  # R7-C1: a ledger groups its rounds with sub-headings (the production mine does). The level-1
  # reader used to end the section at ANY deeper heading, so the body came back empty, the
  # ownership check ran zero times, and `✓ all checks passed` shipped over untagged open entries.
  cat >> "$W/truths/verify.md" <<'EOF'

### 라운드 2

- [open] 소유권 태그 없음 A
EOF
  vrun validate; expect_block "has no valid ownership tag"
}
block_hq_deeper_heading_level() {
  # `### Human queue` was read by neither level reader — the section is found at any level now
  printf -- '\n### Human queue\n\n- [open] 소유권 태그 없음 B\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "has no valid ownership tag"
}
block_second_human_queue_section() {
  # R6-C2: a Human queue is an append-per-round log, so a file legitimately carries several
  # `## Human queue` sections (a real mine repeats `## Adjudications` three times). Reading only
  # the first hid every later round's entries from the status counter AND from the ownership
  # check at once — `human queue: 0` beside `✓ all checks passed`.
  cat >> "$W/truths/verify.md" <<'EOF'

## Human queue

- [open] [user-only] 라운드 2 — 병기 허용 여부
- [open] 소유권 태그 없음 A
EOF
  vrun validate; expect_block "has no valid ownership tag"
  vrun status; expect_has "open 2"
}
acct_status_hq_subbullets() {
  # R5-N3: sub-bullets of a correctly tagged entry were reported as untagged entries, with a
  # prescription that cannot be followed without destroying the entry's structure
  printf -- '- [open] [user-only] 병기 허용 여부\n  - 근거: 두 자료가 다른 값을 말함\n  - 비용: 재작성 1회\n' >> "$W/truths/verify.md"
  vrun status; expect_hasnt "untagged entry(s)"
}
acct_census_last_truth_deleted() {
  # census's set cross-check has an arm for exactly this state; an early return made it unreachable
  rm -f "$W/truths/t001.md"
  vrun census; expect_has "truth files 0 · index entries 1"
  expect_has "index entries with no truth file: t001"
}
acct_census_bare_coverage_heading() {
  # R4-S4: a bare `## m002` heading is not a record — the numerator must not count it.
  # `## legacy` demands a ruled date + quoted utterance per entry; a heading with no body had
  # the same +1 effect guarded by nothing.
  mkdir -p "$W/materials/m002"
  printf -- '---\nid: m002\ntitle: 회의록\nstatus: converted\nroles: [보조]\ntopics: [일정]\n---\n\n주요 일정 논의.\n' > "$W/materials/m002/converted.md"
  printf -- '| m002 | 회의록 | 보조 |\n' >> "$W/catalog.md"
  printf -- '\n## m002\n' >> "$W/truths/coverage.md"
  vrun census; expect_has "coverage records 1/2"
  # a skip-with-reason line IS map's audit record — with one, the section counts
  printf -- '- 일정 항목: (추출 대상 아님 — 보조 자료)\n' >> "$W/truths/coverage.md"
  vrun census; expect_has "coverage records 2/2"
}
addm2() { # $1=id — a second material, in catalog, sourced from m001's shape
  mkdir -p "$W/materials/$1"
  sed "s/^id: m001/id: $1/" "$W/materials/m001/converted.md" > "$W/materials/$1/converted.md"
  printf '| %s | 추가자료 | 계약서 |\n' "$1" >> "$W/catalog.md"
}
acct_census_legacy_lenient_spelling() {
  # R5-S4: `- m3` for folder m003 is a REFERENCE, so it must canonicalise before mstatus looks it
  # up. Without that the retracted-skip could never fire and the denominator was subtracted twice
  # for a material that was never in it — the ledger read closed while a live material held none.
  addm2 m002; addm2 m003
  sed -i 's/^status: converted/status: retracted/' "$W/materials/m003/converted.md"
  printf '\n## legacy\n- m3 — ruled: 2026-07-30 "옛 자료라 면제"\n' >> "$W/truths/coverage.md"
  vrun census; expect_has "coverage records 1/2 material(s)"
  expect_hasnt "✗"
}
acct_census_legacy_retracted_not_malformed() {
  # R5-S6: n_legacy is 0 both when nothing parsed AND when everything parsed then named a
  # retracted material. Reporting the second as malformed gave an ✗ the user could only clear by
  # writing the line the way it already was.
  addm2 m002; addm2 m003
  sed -i 's/^status: converted/status: retracted/' "$W/materials/m003/converted.md"
  printf '\n## legacy\n- m003 — ruled: 2026-07-30 "옛 자료라 면제"\n' >> "$W/truths/coverage.md"
  vrun census; expect_hasnt "none begins with an m-id"
}
acct_census_legacy_truly_malformed() {
  # the other direction: bullets present, none parsed — the ✗ must still fire
  printf '\n## legacy\n- 아무 id도 없는 줄\n' >> "$W/truths/coverage.md"
  vrun census; expect_has "none begins with an m-id"
}
acct_census_legacy_live_exemption() {
  # and a legitimate exemption still subtracts, with the raw total shown
  addm2 m002
  printf '\n## legacy\n- m002 — ruled: 2026-07-30 "옛 자료라 면제"\n' >> "$W/truths/coverage.md"
  vrun census; expect_has "coverage records 1/1 of 2 material(s) (1 legacy-exempt)"
}
acct_census_section_for_missing_material() {
  # R5-S5: numerator and denominator must count ONE population. A section naming a material with
  # no converted.md is a coverage.md error (validate is red), not a unit of coverage.
  addm2 m002; : > "$W/materials/m002/converted.md"
  printf '\n## m099\n- 없는 자료\n' >> "$W/truths/coverage.md"
  vrun census; expect_has "coverage records 1/2 material(s)"
  expect_hasnt "numerator exceeds denominator"
}
acct_census_unclosed_material_denominator() {
  # R4-S5: an unparseable converted.md is still a material on disk. The old denominator counted
  # only materials whose frontmatter CLOSED, so this state read `coverage 1/1` — and pushed the
  # other way, a ratio above 1 whose warning named two causes that were both false.
  mkdir -p "$W/materials/m002"
  printf -- '---\nid: m002\ntitle: 회의록\n\n본문 없음 상태.\n' > "$W/materials/m002/converted.md"
  printf -- '| m002 | 회의록 | 보조 |\n' >> "$W/catalog.md"
  vrun census; expect_has "/2 material(s)"
}
acct_zero_byte_truth() {
  # S3 (R3): awk skips a zero-byte file entirely, so it used to vanish from the denominator
  # instead of showing up as unchecked. The file count now comes from disk, like census.
  : > "$W/truths/t002.md"
  vrun validate; expect_has "truths 2"
  expect_has "← 1 NOT checked"
  vrun census; expect_has "truth files 2"
}
block_fabricated_body() {
  printf -- '---\nid: t002\nclaim: "지체상금은 일 0.1%%다"\nsource: m001\ntags: [위약]\nstatus: ok\n---\n\n제9조 지체상금은 일 0.1%%로 한다.\n그 상한은 계약금액의 10%%다.\n' > "$W/truths/t002.md"
  vrun validate; expect_block "quote not found"
}
block_conflict_oneside() {
  sed -i 's/^status: ok$/status: conflict\nconflict_with: [t002]/' "$W/truths/t001.md"
  printf -- '---\nid: t002\nclaim: "위약금은 계약금액의 10%%다(사본)"\nsource: m001\ntags: [위약]\nstatus: ok\n---\n\n제7조 위약금은 계약금액의 10%%로 한다.\n' > "$W/truths/t002.md"
  vrun validate; expect_block "does not name"
}
block_dup_key() {
  sed -i 's/^provenance: stated$/provenance: stated\nstatus: conflict/' "$W/truths/t001.md"
  vrun validate; expect_block "appears 2 times"
}
# canonical id spelling: ruled 2026-07-31 — one number, one spelling. Two spellings collapse into
# one entry in the reciprocity/winner/retracted tables, so the format now nails the padding down.
block_id_unpadded() {
  mv "$W/truths/t001.md" "$W/truths/t5.md"
  sed -i 's/^id: t001$/id: t5/' "$W/truths/t5.md"
  sed -i 's/^- 위약금 조항: t001$/- 위약금 조항: t5/' "$W/truths/coverage.md"
  sed -i 's/^cited_truths: \[t001\]$/cited_truths: [t5]/' "$W/documents/d1/plan.md"
  ( cd "$W" && bash .weavedoc/bin/weavedoc reindex >/dev/null 2>&1 )
  vrun validate; expect_block "rename it to 't005.md'"
}
block_id_overpadded() {
  mv "$W/truths/t001.md" "$W/truths/t0001.md"
  sed -i 's/^id: t001$/id: t0001/' "$W/truths/t0001.md"
  sed -i 's/^- 위약금 조항: t001$/- 위약금 조항: t0001/' "$W/truths/coverage.md"
  sed -i 's/^cited_truths: \[t001\]$/cited_truths: [t0001]/' "$W/documents/d1/plan.md"
  ( cd "$W" && bash .weavedoc/bin/weavedoc reindex >/dev/null 2>&1 )
  vrun validate; expect_block "rename it to 't001.md'"
}
block_material_id_unpadded() {
  mv "$W/materials/m001" "$W/materials/m5"
  sed -i 's/^id: m001$/id: m5/' "$W/materials/m5/converted.md"
  sed -i 's/^source: m001$/source: m5/' "$W/truths/t001.md"
  sed -i 's/^## m001$/## m5/' "$W/truths/coverage.md"
  sed -i 's/| m001 |/| m5 |/' "$W/catalog.md"
  vrun validate; expect_block "rename it to 'm005'"
}
pass_id_four_digit() {
  # four digits need no extra padding — t1000 IS canonical
  mv "$W/truths/t001.md" "$W/truths/t1000.md"
  sed -i 's/^id: t001$/id: t1000/' "$W/truths/t1000.md"
  sed -i 's/^- 위약금 조항: t001$/- 위약금 조항: t1000/' "$W/truths/coverage.md"
  sed -i 's/^cited_truths: \[t001\]$/cited_truths: [t1000]/' "$W/documents/d1/plan.md"
  printf -- '- added: t1000 (2026-07-30)\n' >> "$W/truths/changelog.md"
  ( cd "$W" && bash .weavedoc/bin/weavedoc reindex >/dev/null 2>&1 )
  vrun validate; expect_pass
}
pass_id_generated_files_ignored() {
  # index.md / tree.md sit in truths/ and must not be judged as id filenames
  vrun validate; expect_pass
  OUT=$(ls "$W/truths"); expect_has "tree.md"
}

block_cited_dangling() {
  sed -i 's/^cited_truths: \[t001\]$/cited_truths: [t999]/' "$W/documents/d1/plan.md"
  vrun validate; expect_block "no such truth"
}
block_date_impossible() {
  sed -i 's/^added: 2026-07-01$/added: 2026-99-99/' "$W/materials/m001/converted.md"
  vrun validate; expect_block "is not a date"
}
block_date_unpadded() {
  sed -i 's/^added: 2026-07-01$/added: 2026-7-3/' "$W/materials/m001/converted.md"
  vrun validate; expect_block "is not a date"
}
block_date_placeholder() {
  sed -i 's|^origin: file$|origin: research\nurl: https://example.com/x\nretrieved_at: (미정)|' "$W/materials/m001/converted.md"
  vrun validate; expect_block "is not a date"
}
block_resolution_type() {
  sed -i 's/^status: ok$/status: discarded\nresolution: {type: merge, winner: [t002], decided_by: user, decision_kind: supplied}/' "$W/truths/t001.md"
  vrun validate; expect_block "resolution type"
}
block_resolution_kind() {
  sed -i 's/^status: ok$/status: discarded\nresolution: {type: pick, winner: [t002], decided_by: user, decision_kind: guessed}/' "$W/truths/t001.md"
  vrun validate; expect_block "decision_kind"
}
block_resolution_by() {
  sed -i 's/^status: ok$/status: discarded\nresolution: {type: pick, winner: [t002], decided_by: nobody, decision_kind: supplied}/' "$W/truths/t001.md"
  # R4-N: pin the ENUM message, not just the word. `"decided_by"` alone also matches the
  # "resolution has no 'decided_by'" branch, so this case used to stay green while the reader
  # was blind to the key entirely — the exact regression C3 was.
  vrun validate; expect_block "resolution decided_by"
}
block_resolution_space_before_colon() {
  # R4-C3: space before the colon is legal YAML. With only `decided_by:` canonical, an
  # out-of-enum type, an out-of-enum decision_kind and a winner naming a truth that does not
  # exist ALL passed with a clean ✓ — three checks off at once, silently.
  sed -i 's/^status: ok$/status: discarded\nresolution: {type : pick-invalid, winner : [t404], decided_by: user, decision_kind : guessed}/' "$W/truths/t001.md"
  vrun validate; expect_block "t404"
  expect_has "resolution type"
  expect_has "resolution decision_kind"
}
pass_retag_leaves_unclosed_list_alone() {
  # R5-S2: with no closing ], the tail sub strips nothing and appending it produced
  # `tags: [벌칙]tags: [위약` — the only writer corrupting a file while reporting success.
  # The line must survive untouched (deleting it would be worse), and validate names the cause.
  sed -i 's/^tags: \[위약\]$/tags: [위약/' "$W/truths/t001.md"
  ( cd "$W" && bash .weavedoc/bin/weavedoc retag 위약 벌칙 >/dev/null 2>&1 )
  OUT=$(grep -c '^tags: \[위약$' "$W/truths/t001.md"); RC=0
  expect_has "1"
  vrun validate; expect_block "never closes on this line"
}
pass_pull_scope_space_before_colon() {
  # R5-S3: the eighth site of the key-spelling rule. `scope : [금액]` used to vanish, so pull
  # reported a PARTIAL supersede as a total one.
  printf -- '---\nid: t002\nclaim: "대금은 5천만원이다"\nsource: m001\ntags: [대금]\nstatus: ok\n---\n\n제3조 대금은 5천만원으로 한다.\n' > "$W/truths/t002.md"
  sed -i 's/^status: ok$/status: discarded\nresolution: {type: pick, winner: [t002], scope : [금액], decided_by: user, decision_kind: supplied}/' "$W/truths/t001.md"
  addt2
  vrun pull 위약; expect_has "금액"
}
pass_resolution_space_before_colon_valid() {
  # the other direction: the same spacing with valid values must not invent a complaint —
  # in particular not the false "resolution has no 'decided_by'" about a resolution that has one
  printf -- '---\nid: t002\nclaim: "대금은 5천만원이다"\nsource: m001\ntags: [대금]\nstatus: ok\n---\n\n제3조 대금은 5천만원으로 한다.\n' > "$W/truths/t002.md"
  sed -i 's/^status: ok$/status: discarded\nresolution: {type : pick, winner : [t002], decided_by : user, decision_kind : supplied}/' "$W/truths/t001.md"
  addt2
  vrun validate; expect_pass
  expect_hasnt "no 'decided_by'"
}
block_resolution_no_decided_by() {
  sed -i 's/^status: ok$/status: discarded\nresolution: {type: pick, winner: [t002], decision_kind: supplied}/' "$W/truths/t001.md"
  vrun validate; expect_block "no 'decided_by'"
}
block_resolution_winner_dangling() {
  sed -i 's/^status: ok$/status: discarded\nresolution: {type: pick, winner: [t404], decided_by: user, decision_kind: supplied}/' "$W/truths/t001.md"
  vrun validate; expect_block "t404"
}
addt2() { # register t002 in the ledgers so the only thing left to complain about is the seal
  printf -- '- 대금 조항: t002\n' >> "$W/truths/coverage.md"
  printf -- '- added: t002 (2026-07-30)\n' >> "$W/truths/changelog.md"
  ( cd "$W" && bash .weavedoc/bin/weavedoc reindex >/dev/null 2>&1 )
}
block_short_body_seal() {
  # A body too small to be evidence of anything: index() finds it inside almost any material.
  printf -- '---\nid: t002\nclaim: "대금은 5천만원이다"\nsource: m001\ntags: [대금]\nstatus: ok\n---\n\n5천만원\n' > "$W/truths/t002.md"
  addt2
  vrun validate; expect_block "fragment"
}
block_spliced_quote() {
  # Each line is verbatim; the two skip 제5조, which sits between them in the source. Markdown
  # renders soft-wrapped lines as one paragraph, so the result is a sentence the source never had —
  # and the realistic accident is a quote that drops the qualifying middle line.
  printf -- '---\nid: t002\nclaim: "대금 5천만원의 위약금은 10%%다"\nsource: m001\ntags: [대금]\nstatus: ok\n---\n\n제3조 대금은 5천만원으로 한다.\n제7조 위약금은 계약금액의 10%%로 한다.\n' > "$W/truths/t002.md"
  addt2
  vrun validate; expect_block "NOT adjacent"
}
pass_multiline_verbatim() {
  # A genuine multi-line verbatim quote — adjacent lines copied as a block. Must stay clean, or the
  # spliced-quote check has bought a false failure on the shape FORMATS explicitly encourages.
  printf -- '---\nid: t002\nclaim: "대금과 납품 기한"\nsource: m001\ntags: [대금]\nstatus: ok\n---\n\n제3조 대금은 5천만원으로 한다.\n제5조 납품 기한은 2026년 12월 31일로 한다.\n' > "$W/truths/t002.md"
  addt2
  vrun validate; expect_pass
}
pass_claim_shown_beside_seal() {
  # Body verbatim, claim invented. Nothing can BLOCK this — a claim is a paraphrase by design, and
  # the one mechanical proxy (every number in the claim must be in the body) false-fails 8% of a real
  # 255-truth mine on legitimate claims like "4인" and "Phase 2". What is testable is that the
  # consumer surface stops showing only the unverified half: pull must print the sealed line too.
  sed -i 's/^claim: .*$/claim: "위약금은 계약금액의 30%다"/' "$W/truths/t001.md"
  ( cd "$W" && bash .weavedoc/bin/weavedoc reindex >/dev/null 2>&1 )
  vrun pull 위약
  expect_has "30%"
  expect_has "sealed: 제7조 위약금은 계약금액의 10%로 한다."
}
block_verify_section_in_comment() {
  # The required section exists only inside a comment. The existence check greps the RAW file, so an
  # archived (or accidentally commented-out) section satisfies it while nothing can read it.
  {
    printf -- '---\nstatus: passed\nround: 1\nverified_at: 2026-07-30\n---\n\n'
    printf '<!--\n## Verified units\n\n- m001 · t001 — 지난 라운드 이력\n-->\n\n'
    printf '## Adjudications\n\n## Human queue\n'
  } > "$W/truths/verify.md"
  vrun validate; expect_block "required section"
}

# ---------------------------------------------------------------- must NOT be rejected

pass_baseline()       { vrun validate; expect_pass; }
pass_gate_empty()     { REV ''; vrun validate; expect_pass; }
pass_gate_template()  { REV '- [<kind>] <where> — <what>'; vrun validate; expect_pass; }
pass_gate_empty_sub() {
  REV '## round 2 노트

라운드 2에서 위반 없음.'
  vrun validate; expect_pass
}
pass_gate_siblings_l2() {
  # Other sections at ##, violations at # and EMPTY: the section must not run to EOF and swallow
  # the advisory findings.
  {
    printf -- '---\nround: 1\n---\n\n'
    printf '# Fidelity violations\n\n'
    printf '## Findings\n\n- [critical] 2장 — 근거 표시가 약하다\n\n'
    printf '## Adjudications\n\n## Human queue\n'
  } > "$W/documents/d1/review.md"
  vrun validate; expect_pass
}
pass_gate_archived_comment() {
  REV '<!--
지난 라운드 보관:
- [contradiction] 3장 — 해소됨
-->'
  vrun validate; expect_pass
}
pass_gate_none_prose() {
  REV '(없음)'
  vrun validate; expect_pass
}
pass_yaml_trailing_comment() {
  sed -i 's/^status: ok$/status: ok  # 확인함/' "$W/truths/t001.md"
  vrun validate; expect_pass
}
pass_hash_in_quoted_claim() {
  sed -i 's/^claim: .*$/claim: "위약금은 계약금액의 10%다 — 3월 회의 #3 결과"/' "$W/truths/t001.md"
  ( cd "$W" && bash .weavedoc/bin/weavedoc reindex >/dev/null 2>&1 )
  vrun validate; expect_pass
  OUT=$(cat "$W/truths/index.md"); expect_has '3월 회의 #3 결과'
}
block_required_tag_tombstone() {
  # R4-S6: a retracted tombstone satisfied required_tags — retracting the last real extraction
  # of a mandatory topic kept the mine green about it. Legal stub: status retracted, body
  # removed, withdrawal recorded in changelog.
  sed -i 's/^required_tags: \[\]$/required_tags: [위약]/' "$W/project.md"
  awk '/^---[[:space:]]*$/{n++} {print} n==2{exit}' "$W/truths/t001.md" > "$W/truths/t001.new"
  mv "$W/truths/t001.new" "$W/truths/t001.md"
  sed -i 's/^status: ok$/status: retracted/' "$W/truths/t001.md"
  printf -- '- removed: t001 (2026-07-31) — 근거 인용이 원문에 없음\n' >> "$W/truths/changelog.md"
  vrun validate; expect_block "has no live truths"
}
pass_required_tag_live_covers() {
  # the other direction: a live truth carrying the tag still satisfies it
  sed -i 's/^required_tags: \[\]$/required_tags: [위약]/' "$W/project.md"
  vrun validate; expect_pass
}
pass_two_word_required_tags() {
  sed -i 's/^required_tags: \[\]$/required_tags: [계약 범위, 위약]/' "$W/project.md"
  sed -i 's/^tags: \[위약\]$/tags: [계약 범위, 위약]/' "$W/truths/t001.md"
  vrun validate; expect_pass
}
pass_winner_short_id() {
  mv "$W/truths/t001.md" "$W/truths/t005.md"
  sed -i 's/^id: t001$/id: t005/; s/^status: ok$/status: ok\nconflict_with: [t006]\nresolution: {type: pick, winner: [t5], decided_by: user, decision_kind: supplied}/' "$W/truths/t005.md"
  printf -- '---\nid: t006\nclaim: "위약금은 20%%다"\nsource: m001\ntags: [위약]\nstatus: discarded\nconflict_with: [t005]\nresolution: {type: pick, winner: [t5], decided_by: user, decision_kind: supplied}\n---\n\n제7조 위약금은 계약금액의 10%%로 한다.\n' > "$W/truths/t006.md"
  sed -i 's/^- 위약금 조항: t001$/- 위약금 조항: t005, t006/' "$W/truths/coverage.md"
  sed -i 's/^cited_truths: \[t001\]$/cited_truths: [t005]/' "$W/documents/d1/plan.md"
  printf -- '- added: t005 (2026-07-30)\n- added: t006 (2026-07-30)\n' >> "$W/truths/changelog.md"
  ( cd "$W" && bash .weavedoc/bin/weavedoc reindex >/dev/null 2>&1 )
  vrun validate; expect_pass
  vrun pull 위약; expect_has "usable 1"
}
pass_cited_short_id() {
  mv "$W/truths/t001.md" "$W/truths/t005.md"
  sed -i 's/^id: t001$/id: t005/' "$W/truths/t005.md"
  sed -i 's/^- 위약금 조항: t001$/- 위약금 조항: t005/' "$W/truths/coverage.md"
  sed -i 's/^cited_truths: \[t001\]$/cited_truths: [t5]/' "$W/documents/d1/plan.md"
  printf -- '- added: t005 (2026-07-30)\n' >> "$W/truths/changelog.md"
  ( cd "$W" && bash .weavedoc/bin/weavedoc reindex >/dev/null 2>&1 )
  vrun validate; expect_pass
}
pass_tombstone() {
  printf -- '---\nid: t002\nclaim: "지체상금 조항이 있다"\nsource: m001\ntags: [위약]\nstatus: retracted\n---\n' > "$W/truths/t002.md"
  printf -- '- removed: t002 (2026-07-30) — 원문에 없는 조항이었다\n' >> "$W/truths/changelog.md"
  printf -- '- 지체상금: t002 (철회)\n' >> "$W/truths/coverage.md"
  ( cd "$W" && bash .weavedoc/bin/weavedoc reindex >/dev/null 2>&1 )
  vrun validate; expect_pass
  expect_has "1 tombstone"
  expect_hasnt "NOT checked"
}
pass_locales() {
  local l out1="" outN
  for l in C ko_KR.UTF-8 en_US.UTF-8 __unset__; do
    if [ "$l" = "__unset__" ]; then outN=$( ( cd "$W" && unset LC_ALL LANG; $TO bash .weavedoc/bin/weavedoc validate ) 2>&1 )
    else outN=$( ( cd "$W" && LC_ALL="$l" LANG="$l" $TO bash .weavedoc/bin/weavedoc validate ) 2>&1 ); fi
    if [ -z "$out1" ]; then out1="$outN"
    elif [ "$out1" != "$outN" ]; then
      OUT="locale $l differs:
$outN
--- vs C ---
$out1"; bad "verdict is locale-dependent"; return
    fi
  done
  OUT="$out1"; ok
}
pass_retag_keeps_trailing_comment() {
  # R4-N2: everything after the closing bracket rides along — a trailing YAML comment is a
  # comment, not part of the value, and the rewrite used to silently delete the user's note
  sed -i 's/^tags: \[위약\]$/tags: [위약]  # 3월 회의에서 정한 분류/' "$W/truths/t001.md"
  ( cd "$W" && bash .weavedoc/bin/weavedoc retag 위약 벌칙 >/dev/null 2>&1 )
  OUT=$(grep '^tags:' "$W/truths/t001.md"); RC=0
  expect_has "tags: [벌칙]  # 3월 회의에서 정한 분류"
}
acct_census_swapped_index_id() {
  # R4-N3: count-only comparison let a dangling entry and an unindexed file cancel out.
  # Both sides must be NAMED now.
  sed -i 's/^- t001:/- t099:/' "$W/truths/index.md"
  vrun census
  expect_has "index entries with no truth file: t099"
  expect_has "truth files with no index entry: t001"
}
acct_status_material_count() {
  # R3-N1: status used to count FOLDERS while validate counts converted.md files (2 vs 1 on the
  # same mine). One definition now; a lingering difference is shown, not absorbed.
  mkdir -p "$W/materials/m002"
  vrun status
  expect_has "materials: 1 (1 folder(s) without converted.md"
}
acct_scope_counts_unverified() {
  # The command the verify skill now reads its round scope from, and the number that replaced
  # "all of them, again": the markdown ledger covers t001 (legacy-unbound under WD-COR-003), so
  # a NEW truth is the only thing unverified. Doubles as the bullet-shape test — the shipped
  # template writes bullets, the production mine writes a table, and a parser knowing only one
  # reads the other mine as "nothing verified", the full-mine round this command prevents.
  printf -- '---\nid: t002\nclaim: "대금은 5천만원이다"\nsource: m001\ntags: [대금]\nstatus: ok\n---\n\n제3조 대금은 5천만원으로 한다.\n' > "$W/truths/t002.md"
  vrun scope
  expect_has "1 legacy-unbound"
  expect_has "1 unverified"
  expect_has "t002"
}
acct_scope_unmarked_entry_covers_nothing() {
  # An entry naming units with NO verdict covers nothing — and must not vanish either, or a line
  # needing one word added looks exactly like a ledger that simply hasn't got there yet.
  sed -i 's/ · verified$/ — 원본 대조 완료/' "$W/truths/verify.md"
  vrun scope
  expect_has 'end in no "verified" verdict'
  expect_has "0 verified"
}
acct_scope_unverified_is_not_verified() {
  # The substring trap: `unverified` contains `verified`. Matching anywhere in the line would read
  # the ledger's own denial as coverage.
  sed -i 's/^- m001 .*$/- m001 · t001 — R2 · unverified/' "$W/truths/verify.md"
  vrun scope
  expect_has "0 verified"
}
acct_scope_failed_row_not_coverage() {
  # A failed unit names its ids too. Harvesting ids without reading the verdict beside them would
  # certify exactly the units the ledger just refused to certify.
  sed -i 's/^- m001 .*$/| t001 | R2 | **미통과** |/' "$W/truths/verify.md"
  vrun scope
  expect_has "0 verified"
}
acct_scope_used_unverified() {
  # WD-COR-001: `used` is lifecycle, not a verdict — a material that skipped verify and then got
  # cited must stay owed, or the debt vanishes forever. The pristine ledger names m001 in
  # `## Verified units`, so this also pins that a truths-lane mention (extraction ledger) is not
  # a conversion verdict: material verification records ONLY in the material's own status.
  sed -i 's/^status: converted$/status: used/' "$W/materials/m001/converted.md"
  vrun scope
  expect_has "materials  1 converted · 0 verified"
  expect_has "1 unverified"
  expect_has "records citation, not verification"
}
acct_scope_verified_evidence_only() {
  # WD-COR-003: v1 `status: verified` is a digest-less verification record — real history,
  # preserved, but it binds no bytes. It is `legacy-unbound`, never digest-bound verified.
  sed -i 's/^status: converted$/status: verified/' "$W/materials/m001/converted.md"
  vrun scope
  expect_has "materials  1 converted · 0 verified (digest-bound) · 1 legacy-unbound"
}
acct_scope_legacy_unbound() {
  # The pristine mine is a v1 mine: t001 verified by a digest-less markdown row. Shown apart as
  # legacy-unbound and excluded from the digest-bound count (WD-COR-003).
  vrun scope
  expect_has "truths     1 live · 0 verified (digest-bound) · 1 legacy-unbound"
}
acct_scope_bound_verified() {
  # attest pins current bytes; the unit counts digest-bound verified and nothing is owed on it.
  vrun attest verified 2 standard m001 t001
  vrun scope
  expect_has "materials  1 converted · 1 verified (digest-bound) · 0 legacy-unbound · 0 stale · 0 failed · 0 unverified"
  expect_has "truths     1 live · 1 verified (digest-bound) · 0 legacy-unbound · 0 stale · 0 failed · 0 unverified"
}
acct_scope_truth_digest_stale() {
  # One character in a verified truth → stale. A manual edit, an agent slip, and a normal re-map
  # all look identical to the digest; that is the point (WD-COR-003).
  vrun attest verified 2 standard t001
  printf '한 글자.\n' >> "$W/truths/t001.md"
  vrun scope
  expect_has "1 stale"
  expect_has "→ stale: t001"
}
acct_scope_material_digest_stale() {
  vrun attest verified 2 standard m001
  printf '\n제9조 추가 조항.\n' >> "$W/materials/m001/converted.md"
  vrun scope
  expect_has "materials  1 converted · 0 verified (digest-bound) · 0 legacy-unbound · 1 stale"
}
acct_scope_lifecycle_not_stale() {
  # The axis split pays off here: refine's `used` stamp rewrites only the frontmatter status
  # line, and the material digest excludes exactly that line — verification survives use.
  vrun attest verified 2 standard m001
  sed -i 's/^status: converted$/status: used/' "$W/materials/m001/converted.md"
  vrun scope
  expect_has "materials  1 converted · 1 verified (digest-bound) · 0 legacy-unbound · 0 stale · 0 failed · 0 unverified"
}
acct_legacy_reverify_binds_digest() {
  # Re-verifying a legacy-unbound unit promotes it: the sidecar row binds bytes, and the old
  # markdown row stops counting as legacy — covered is covered once.
  vrun attest verified 2 standard t001
  vrun scope
  expect_has "truths     1 live · 1 verified (digest-bound) · 0 legacy-unbound"
}
acct_scope_failed_recorded() {
  # A failed verdict is a record, not coverage — the unit stays owed and is counted apart.
  vrun attest failed 2 standard t001
  vrun scope
  expect_has "1 failed"
}
acct_scope_retracted_truth_excluded() {
  # Tombstones (retracted/discarded) leave the population — the same rule retracted materials
  # already follow: not owed, or the ratio reports a debt nobody can ever pay down.
  printf -- '---\nid: t002\nclaim: "지체상금 조항이 있다"\nsource: m001\ntags: [위약]\nstatus: retracted\n---\n' > "$W/truths/t002.md"
  printf -- '- removed: t002 (2026-07-30) — 원문에 없었다\n' >> "$W/truths/changelog.md"
  ( cd "$W" && bash .weavedoc/bin/weavedoc reindex >/dev/null 2>&1 )
  vrun scope
  expect_has "truths     1 live"
  expect_has "1 tombstone"
}
pass_attest_validate_clean() {
  # The sidecar is additive: no v1 glob or census sees it, and validate stays clean next to it.
  vrun attest verified 2 standard m001 t001
  vrun validate; expect_pass
}
block_attest_bad_target() {
  # attest is all-or-nothing: one unresolvable id and NOTHING is written.
  vrun attest verified 2 standard t001 t999
  expect_block "t999"
  vrun scope
  expect_has "0 verified (digest-bound)"
}

# ---- WD-COR-002: review/final digest binding + staged consecration ----
mktree() { # convert d1 to a multi-file draft/ + final/ (final = byte-identical copy)
  rm -f "$W/documents/d1/draft.md" "$W/documents/d1/final.md"
  mkdir -p "$W/documents/d1/draft"
  printf '# 1장\n\n위약금은 계약금액의 10%%다. <!-- t:t001 -->\n' > "$W/documents/d1/draft/01.md"
  printf '# 2장\n\n끝.\n' > "$W/documents/d1/draft/02.md"
  cp -r "$W/documents/d1/draft" "$W/documents/d1/final"
}
pass_gate_seal_and_match() {
  # seal-review pins the reviewed bytes + context; a final that IS those bytes passes, and the
  # seal is counted out loud.
  vrun seal-review d1 draft
  expect_has "reviewed_digest"
  vrun validate; expect_pass
  expect_has "review seals: 1 digest-bound"
}
block_gate_final_digest_single() {
  # One character into final.md after the clean review → refuse: nobody reviewed these bytes.
  vrun seal-review d1 draft
  printf '몰래 한 줄.\n' >> "$W/documents/d1/final.md"
  vrun validate; expect_block "not the bytes the clean review reviewed"
}
block_gate_context_truth_changed() {
  # The verdict rested on t001; changing the claim under it stales the review. Frontmatter edit,
  # not body — the verbatim seal must stay green so THIS check is the one that fires.
  vrun seal-review d1 draft
  sed -i 's/^claim: "위약금은 계약금액의 10%다"$/claim: "위약금은 계약금액의 11%다"/' "$W/truths/t001.md"
  vrun validate; expect_block "review context changed"
}
block_gate_context_source_changed() {
  # A source material growing a clause after the review → context stale. Appending keeps t001's
  # quote intact, so the anti-laundering seal stays green and the context check is what fires.
  vrun seal-review d1 draft
  printf '\n제11조 신설 조항.\n' >> "$W/materials/m001/converted.md"
  vrun validate; expect_block "review context changed"
}
pass_gate_context_survives_used_stamp() {
  # Consecration stamps materials `used` AFTER the review — the context digest hashes materials
  # with the lifecycle line excluded (mat_digest), or the normal flow would stale its own review.
  vrun seal-review d1 draft
  sed -i 's/^status: converted$/status: used/' "$W/materials/m001/converted.md"
  vrun validate; expect_pass
}
block_gate_context_config_changed() {
  vrun seal-review d1 draft
  printf '# context poke\n' >> "$W/.weavedoc/config.yaml"
  vrun validate; expect_block "review context changed"
}
pass_gate_legacy_review_unbound() {
  # A v1 review (no digest fields) next to a final stays valid — migration train: presence of
  # the v2 field activates enforcement; absence is legacy-unbound, counted and never blocking.
  vrun validate; expect_pass
  expect_has "1 legacy-unbound"
}
pass_consecrate_promotes() {
  # The §5.3 flow: candidate staged, digests matched, ONE full validation, atomic promote.
  rm -f "$W/documents/d1/final.md"
  vrun seal-review d1 draft
  vrun consecrate d1
  expect_pass
  expect_has "full validation: 1 run"
  OUT=$(cat "$W/documents/d1/final.md"); RC=0
  expect_has "위약금은 계약금액의 10%다"
}
block_consecrate_stale_draft() {
  # Draft moved after the seal → consecrate refuses; nothing is written.
  vrun seal-review d1 draft
  printf '추가 문장.\n' >> "$W/documents/d1/draft.md"
  vrun consecrate d1
  expect_block "draft changed after the clean review"
}
block_consecrate_unsealed() {
  # A v1 (digest-less) review cannot drive the new consecration path — seal first.
  vrun consecrate d1
  expect_block "unsealed"
}
block_consecrate_open_gate() {
  REV '- [contradiction] 3장 — t001과 모순'
  vrun seal-review d1 draft
  vrun consecrate d1
  expect_block "open gate"
}
acct_consecrate_failure_preserves_final() {
  # Post-swap full validation fails → the original final is byte-restored, candidate unpromoted.
  # The break (missing index) is outside the context manifest, so prechecks pass and the failure
  # lands exactly where the rollback path lives.
  printf '개정판. <!-- t:t001 -->\n' > "$W/documents/d1/draft.md"
  vrun seal-review d1 draft
  rm -f "$W/truths/index.md"
  vrun consecrate d1
  expect_block "original final preserved"
  OUT=$(cat "$W/documents/d1/final.md"); RC=0
  expect_has "위약금은 계약금액의 10%다"
  expect_hasnt "개정판"
}
pass_gate_tree_seal_match() {
  mktree
  vrun seal-review d1 draft
  vrun validate; expect_pass
  expect_has "review seals: 1 digest-bound"
}
block_gate_tree_content() {
  mktree; vrun seal-review d1 draft
  printf 'x\n' >> "$W/documents/d1/final/02.md"
  vrun validate; expect_block "not the bytes the clean review reviewed"
}
block_gate_tree_added() {
  mktree; vrun seal-review d1 draft
  printf '# 3장\n' > "$W/documents/d1/final/03.md"
  vrun validate; expect_block "not the bytes the clean review reviewed"
}
block_gate_tree_removed() {
  mktree; vrun seal-review d1 draft
  rm "$W/documents/d1/final/02.md"
  vrun validate; expect_block "not the bytes the clean review reviewed"
}
block_gate_tree_renamed() {
  mktree; vrun seal-review d1 draft
  mv "$W/documents/d1/final/02.md" "$W/documents/d1/final/02b.md"
  vrun validate; expect_block "not the bytes the clean review reviewed"
}

# ---- WD-COR-004: completeness warranty — required wires the gap register into the gate ----
req_completeness() { sed -i 's/^  completeness: off/  completeness: required/' "$W/.weavedoc/config.yaml"; }
block_completeness_required_open_gap() {
  # `required` + a consecrated output + an OPEN gap = a violation, not a note. The default (off)
  # keeps fill-or-accept non-blocking; the knob is what turns the register into a gate input.
  req_completeness
  printf '# Open\n\n- [declared] m001 — 대금 조항 미완성 — "미정" 표기\n\n# Accepted\n' > "$W/gaps.md"
  vrun validate; expect_block "open gap"
}
block_completeness_required_no_register() {
  # `required` with no gaps.md at all: the register never ran, so the warranty is void — a
  # warranty nobody ran is not a warranty (fail-closed, same as the gate's own record).
  req_completeness
  vrun validate; expect_block "no gaps.md"
}
pass_completeness_required_accepted_only() {
  # Accepted gaps are decisions, not debt — `required` blocks only what is still open.
  req_completeness
  printf '# Open\n\n# Accepted\n\n- [declared] m001 — 부속서 없음 — 의도적 제외 — scope: 위약 — recheck: 부속서 입수 시 — as-of: t001\n' > "$W/gaps.md"
  vrun validate; expect_pass
}
pass_completeness_off_register_ignored() {
  # The default stays the default: off = fill-or-accept, never a hard failure.
  printf '# Open\n\n- [declared] m001 — 대금 조항 미완성 — "미정" 표기\n\n# Accepted\n' > "$W/gaps.md"
  vrun validate; expect_pass
}
acct_status_completeness_off() {
  vrun status
  expect_has "completeness: off"
}
acct_consecrate_completeness_off_note() {
  rm -f "$W/documents/d1/final.md"
  vrun seal-review d1 draft
  vrun consecrate d1
  expect_has "completeness is off"
}

# ---- fidtest.sh absorption (Phase 2, WD-QA-001) — the three shapes the inventory could not
# map to an existing case, pinned at their live verdicts. The other eight were duplicates
# (tests/baseline/fidtest-inventory.md holds the mapping); the side-by-side harness itself is
# retired — its two-reader purpose ended when meta_single_judges pinned fid_body to ONE judge.
block_gate_fid_c4_sib2_open() {
  # ## siblings around the # gate do not soften it: a violation directly under the gate blocks.
  printf -- '---\nround: 1\n---\n\n# Fidelity violations\n\n- [contradiction] 3장 — t001과 모순\n\n## Findings\n\n## Adjudications\n\n## Human queue\n' > "$W/documents/d1/review.md"
  vrun validate; expect_block "consecrated through an open gate"
}
block_gate_fid_c8_ambiguous_tier() {
  # Every section at ## and the violation after '## Findings': whatever tier a reader guesses,
  # the bracketed kind sits outside the gate zone and blocks for exactly that reason.
  printf -- '---\nround: 1\n---\n\n# Fidelity violations\n\n## Findings\n\n- [contradiction] 3장 — t001과 모순\n\n## Adjudications\n\n## Human queue\n' > "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
}
block_gate_fid_c9_lonely() {
  # A review holding ONLY the gate section with an open entry still blocks — missing sibling
  # sections are not enforced, and their absence cannot become a bypass.
  printf -- '---\nround: 1\n---\n\n# Fidelity violations\n\n- [contradiction] 3장 — t001과 모순\n' > "$W/documents/d1/review.md"
  vrun validate; expect_block "consecrated through an open gate"
}

# ---- WD-MIG-002 + WD-CFG-001 (Phase 3 unit 6): schema v2 negotiation + full config contract ----
block_schema_future_version() {
  # A schema newer than this runtime supports is fail-closed — guessing at a future format is
  # how silent corruption ships.
  sed -i 's/^version: 2$/version: 3/' "$W/project.md"
  vrun validate; expect_block "newer than this runtime"
}
acct_schema_v1_notice() {
  # v1 stays readable (dual-reader) but not silent: the notice names the exact next command.
  sed -i 's/^version: 2$/version: 1/' "$W/project.md"
  sed -i 's/^version: 2$/version: 1/' "$W/.weavedoc/config.yaml"
  vrun validate
  expect_pass
  expect_has "upgrade --check"
}
block_schema_version_disagreement() {
  # project.md and config.yaml each carry a version; two records of one fact must agree.
  sed -i 's/^version: 2$/version: 1/' "$W/.weavedoc/config.yaml"
  vrun validate; expect_block "disagree"
}
block_config_review_strength_range() {
  # The failing case that proves section-aware reading: verify.strength stays legal while
  # review.strength is out of range — a first-match flat reader cannot even see it.
  sed -i '/^review:/,/^gaps:/ s/^  strength: 1/  strength: 9/' "$W/.weavedoc/config.yaml"
  vrun validate; expect_block "review.strength"
}
block_config_verify_max_rounds() {
  sed -i '/^verify:/,/^review:/ s/^  max_rounds: 5/  max_rounds: 0/' "$W/.weavedoc/config.yaml"
  vrun validate; expect_block "verify.max_rounds"
}
block_config_bad_scale() {
  sed -i '/^verify:/,/^review:/ s/^  scale: standard/  scale: turbo/' "$W/.weavedoc/config.yaml"
  vrun validate; expect_block "verify.scale"
}
block_config_bad_repeat() {
  sed -i '/^verify:/,/^review:/ s/^    full:     2/    full:     -1/' "$W/.weavedoc/config.yaml"
  vrun validate; expect_block "verify.repeat"
}
acct_config_unknown_key_warned() {
  # Unknown top-level keys are a named warning, not a failure (decided: a user extension or a
  # typo both deserve a line; only a typo deserves a red build, and the machine cannot tell).
  printf 'mystery: x\n' >> "$W/.weavedoc/config.yaml"
  vrun validate
  expect_pass
  expect_has "unknown config key"
  expect_has "mystery"
}

# ---- WD-MIG-001 (Phase 3 units 7–8): the v0.1 golden mine and the upgrade path ----
mkv1() { # devolve the pristine workspace into an authentic v0.1-shaped mine
  sed -i 's/^version: 2$/version: 1/' "$W/project.md"
  sed -i 's/^version: 2/version: 1/' "$W/.weavedoc/config.yaml"
  sed -i 's/^  max_rounds: 5/  max_rounds: 3/' "$W/.weavedoc/config.yaml"
  # the v0.1 scalar repeat (the exact shape WD-MIG-001 names)
  awk '
    /^    (skip|light|standard|full):/ { next }
    /^  repeat:/ { print "  repeat: 1              # clean rounds in a row required to pass"; next }
    { print }' "$W/.weavedoc/config.yaml" > "$W/.cfg.tmp" && mv "$W/.cfg.tmp" "$W/.weavedoc/config.yaml"
  # v0.1 short ids, with every reference spelled the old way
  mv "$W/materials/m001" "$W/materials/m1"
  sed -i 's/^id: m001$/id: m1/' "$W/materials/m1/converted.md"
  sed -i 's/| m001 |/| m1 |/' "$W/catalog.md"
  mv "$W/truths/t001.md" "$W/truths/t1.md"
  sed -i 's/^id: t001$/id: t1/; s/^source: m001$/source: m1/' "$W/truths/t1.md"
  sed -i 's/t001/t1/g; s/m001/m1/g' "$W/truths/coverage.md" "$W/truths/changelog.md" "$W/documents/d1/plan.md"
  # verify.md as v0.1 wrote it: a verdictless success row, no Human queue / Adjudications
  printf -- '---\nstatus: passed\nround: 1\nverified_at: 2026-07-30\n---\n\n## Verified units\n\n- m1 · t1 — R1 2026-07-30 · passes 2/2\n' > "$W/truths/verify.md"
  # a bracketed kind as legacy HISTORY outside the gate (the zone rule postdates v0.1)
  printf -- '\n- [contradiction] 3장 — R1에서 수정 완료\n' >> "$W/documents/d1/review.md"
  rm -f "$W/truths/verify-ledger.tsv"
  ( cd "$W" && bash .weavedoc/bin/weavedoc reindex >/dev/null 2>&1 )
}
acct_upgrade_uptodate() {
  # Idempotence starts at the reader: a current mine reports zero work, exit 0.
  vrun upgrade --check
  expect_pass
  expect_has "nothing to do"
}
acct_upgrade_check_v1() {
  # --check is the read-only census of the migration: names every item class, exits 1 as the
  # scriptable "migration needed" signal.
  mkv1
  vrun upgrade --check
  [ "$RC" -eq 1 ] || bad "expected exit 1 (migration needed), got $RC"
  expect_has "version: 1 → 2"
  expect_has "m1 → m001"
  expect_has "t1 → t001"
  expect_has "verdict"
  expect_has "repeat"
  expect_has "--dry-run"
}
acct_upgrade_dryrun_readonly() {
  # dry-run prints the full plan and writes NOTHING — proven by hashing the whole tree.
  mkv1
  local pre post
  pre=$(cd "$W" && find . -type f | LC_ALL=C sort | xargs sha256sum 2>/dev/null | sha256sum | awk '{print $1}')
  vrun upgrade --dry-run
  post=$(cd "$W" && find . -type f | LC_ALL=C sort | xargs sha256sum 2>/dev/null | sha256sum | awk '{print $1}')
  [ "$RC" -eq 1 ] || bad "expected exit 1 (migration needed), got $RC"
  expect_has "would"
  if [ "$pre" = "$post" ]; then ok; else bad "dry-run modified the tree"; fi
}
block_upgrade_bad_flag() {
  vrun upgrade --frobnicate
  expect_block "usage"
}
acct_upgrade_apply_golden() {
  # The §6 completion conditions in one flow: the v0.1 golden mine migrates, validates clean,
  # reports its history as legacy-unbound, and a second upgrade finds zero work (idempotence).
  mkv1
  vrun upgrade --apply
  expect_pass
  expect_has "applied"
  vrun validate
  expect_pass
  vrun scope
  expect_has "legacy-unbound"
  vrun upgrade --check
  expect_has "nothing to do"
}
acct_upgrade_rollback() {
  # Post-apply full validation fails (a broken verbatim seal the scan does not look for) → every
  # byte is restored; proven by hashing the whole tree before and after.
  mkv1
  printf '몰래 추가된 줄.\n' >> "$W/truths/t1.md"
  local pre post
  pre=$(cd "$W" && find . -type f | LC_ALL=C sort | xargs sha256sum 2>/dev/null | sha256sum | awk '{print $1}')
  vrun upgrade --apply
  [ "$RC" -eq 1 ] || bad "expected exit 1 after rollback, got $RC"
  expect_has "rolled back"
  post=$(cd "$W" && find . -type f | LC_ALL=C sort | xargs sha256sum 2>/dev/null | sha256sum | awk '{print $1}')
  if [ "$pre" = "$post" ]; then ok; else bad "tree differs after rollback"; fi
}
block_upgrade_apply_collision() {
  # A rename target that already exists aborts BEFORE any write (§8 principle 3).
  mkv1
  mkdir -p "$W/materials/m001"
  local pre post
  pre=$(cd "$W" && find . -type f | LC_ALL=C sort | xargs sha256sum 2>/dev/null | sha256sum | awk '{print $1}')
  vrun upgrade --apply
  expect_block "collision"
  post=$(cd "$W" && find . -type f | LC_ALL=C sort | xargs sha256sum 2>/dev/null | sha256sum | awk '{print $1}')
  if [ "$pre" = "$post" ]; then ok; else bad "collision precheck wrote something"; fi
}

# ---- WD-CLI-001 + WD-IO-001 (Phase 4 remainder): boundary defects + write transactions ----
block_date_feb31() {
  # A field the format calls a date must not accept a day the calendar does not have.
  sed -i 's/^added: 2026-07-01$/added: 2026-02-31/' "$W/materials/m001/converted.md"
  vrun validate; expect_block "not a date"
}
block_date_leap() {
  sed -i 's/^added: 2026-07-01$/added: 2023-02-29/' "$W/materials/m001/converted.md"
  vrun validate; expect_block "not a date"
}
pass_date_leap() {
  sed -i 's/^added: 2026-07-01$/added: 2024-02-29/' "$W/materials/m001/converted.md"
  vrun validate; expect_pass
}
block_truth_shaped_directory() {
  # A directory wearing a truth filename is not a truth — counting it would inflate the
  # population and every per-file reader would quietly fail on it.
  mkdir -p "$W/truths/t009.md"
  vrun validate; expect_block "directory"
}
acct_ledger_range_reversed() {
  # A reversed range expands to nothing in a naive loop — silently covering zero units while
  # looking like a ledger row. It is named instead, and covers nothing loudly.
  sed -i '/^## Verified units$/a - t009-t002 — R1 2026-07-30 · verified' "$W/truths/verify.md"
  vrun scope
  expect_has "t009-t002"
  expect_has "cover nothing"
}
acct_ledger_range_giant() {
  # An absurd span must not expand: the cap keeps one typo from minting a million covered ids.
  sed -i '/^## Verified units$/a - t001-t99999 — R1 2026-07-30 · verified' "$W/truths/verify.md"
  vrun scope
  expect_has "t001-t99999"
  expect_has "cover nothing"
}
block_cli_validate_extra_arg() {
  vrun validate --verbose
  expect_block "usage"
}
block_cli_pull_noarg() {
  vrun pull
  expect_block "usage"
}
block_cli_reindex_unexpected() {
  # Pins the fix the plan names: `reindex --check unexpected` must not succeed.
  vrun reindex --check unexpected
  expect_block "usage"
}
block_retag_unknown_flag() {
  # The unknown third flag used to be ignored — "--forcee" meant "--dry misspelled" to the user
  # and "write everything" to the tool. A write command must not guess.
  vrun retag 위약 위약금2 --forcee
  expect_block "usage"
  OUT=$(cat "$W/truths/t001.md"); RC=0
  expect_has "tags: [위약]"
}
acct_cfg_windows_abs_path() {
  # `C:\…` is an absolute path, not a folder name to glue under the project root.
  sed -i 's|^  materials: materials$|  materials: C:\\wd-nope|' "$W/.weavedoc/config.yaml"
  vrun validate
  expect_has "C:/wd-nope"
}
block_retag_outside_root() {
  # A write command refuses a target that resolves outside the project (WD-IO-001) — a
  # redirected path may READ from wherever the user says; writing there is another matter.
  mkdir -p "$W/../wd-esc-$$"
  cp "$W/truths/t001.md" "$W/../wd-esc-$$/"
  sed -i "s|^  truths: truths$|  truths: ../wd-esc-$$|" "$W/.weavedoc/config.yaml"
  vrun retag 위약 위약담보
  expect_block "outside the project root"
  rm -rf "$W/../wd-esc-$$"
}
acct_retag_symlink_guard() {
  # Dual-behavior on purpose: where `ln -s` makes a real symlink (Linux, CI), the write is
  # refused through it; on MSYS `ln -s` degrades to a copy, and then the copy is a normal dir
  # and retag works — each platform asserts what is true THERE.
  mv "$W/truths" "$W/truths-real"
  ln -s "$W/truths-real" "$W/truths" 2>/dev/null || mv "$W/truths-real" "$W/truths"
  vrun retag 위약 위약담보
  if [ -L "$W/truths" ]; then expect_block "symlink"
  else expect_pass; fi
}
acct_retag_rollback() {
  # Post-write validation fails (catalog removed — a break retag does not cause and cannot fix)
  # → every edited file is restored; the tag rename must not survive a red validate.
  rm -f "$W/catalog.md"
  vrun retag 위약 위약담보
  expect_block "rolled back"
  OUT=$(cat "$W/truths/t001.md"); RC=0
  expect_has "tags: [위약]"
}
block_plan_audience_invalid() {
  sed -i 's/^scope_tags: \[위약\]$/scope_tags: [위약]\naudience: 사외/' "$W/documents/d1/plan.md"
  vrun validate; expect_block "audience"
}
block_plan_external_needs_labels() {
  # An external document ships with its publication labels or not at all (WD-CFG-001).
  sed -i 's/^scope_tags: \[위약\]$/scope_tags: [위약]\naudience: external/' "$W/documents/d1/plan.md"
  vrun validate; expect_block "publication_labels"
}
pass_plan_external_labeled() {
  sed -i 's/^scope_tags: \[위약\]$/scope_tags: [위약]\naudience: external\npublication_labels: [대외공개]/' "$W/documents/d1/plan.md"
  vrun validate; expect_pass
}

# ---- WD-E2E-001 (Phase 5): the document half's mechanical spine, end to end ----
# e2e_* cases are SEQUENCES: each drives a document through the real command flow (seal →
# consecrate → gate digests → staleness → recovery) and asserts at every joint. What they cannot
# cover is the AI half — a skill deciding what to write; that first real run stays on the plan.
mkdoc2() { # a second document, born unconsecrated: plan + draft citing t001, clean review
  mkdir -p "$W/documents/d2"
  printf -- '---\ndoc_id: d2\ndoc_type: report\ntone: 담백\nstatus: planned\ncontinues: []\ncited_truths: [t001]\nscope_tags: [위약]\n---\n\n# 개요\n' > "$W/documents/d2/plan.md"
  printf -- '# 개요\n\n위약금은 계약금액의 10%%다. <!-- t:t001 -->\n' > "$W/documents/d2/draft.md"
  printf -- '---\nround: 1\n---\n\n# Fidelity violations\n\n# Findings\n\n# Adjudications\n\n# Human queue\n' > "$W/documents/d2/review.md"
}
e2e_single_document() {
  # plan → draft → clean review → seal → consecrate → sealed validate. Every joint asserted.
  mkdoc2
  vrun seal-review d2 draft;  expect_has "reviewed_digest"
  vrun consecrate d2;         expect_pass; expect_has "full validation: 1 run"
  OUT=$(cat "$W/documents/d2/final.md"); RC=0
  expect_has "위약금은 계약금액의 10%다"
  vrun validate;              expect_pass
  expect_has "review seals: 1 digest-bound · 1 legacy-unbound"
}
e2e_multi_document() {
  # The same spine with a draft/ tree — the manifest digest carries the whole flow.
  mkdoc2
  rm "$W/documents/d2/draft.md"
  mkdir -p "$W/documents/d2/draft"
  printf -- '# 1장\n\n위약금은 계약금액의 10%%다. <!-- t:t001 -->\n' > "$W/documents/d2/draft/01.md"
  printf -- '# 2장\n\n끝.\n' > "$W/documents/d2/draft/02.md"
  vrun seal-review d2 draft
  vrun consecrate d2;  expect_pass
  [ -d "$W/documents/d2/final" ] || bad "final/ directory was not created"
  vrun validate;       expect_pass
}
e2e_stale_context_recovery() {
  # Consecrated green → a cited truth's claim moves → hard red (the review no longer describes
  # this mine) → re-review re-seals → green again. The full staleness round trip.
  mkdoc2
  vrun seal-review d2 draft
  vrun consecrate d2;  expect_pass
  sed -i 's/^claim: "위약금은 계약금액의 10%다"$/claim: "위약금은 계약금액의 12%다"/' "$W/truths/t001.md"
  vrun validate;       expect_block "review context changed"
  vrun seal-review d2 draft
  vrun validate;       expect_pass
}
e2e_block_repair_contradiction() {
  # The gate refuses a violation by name; repairing the review (the violation resolved and the
  # section emptied) reopens the road to final. Same flow for each kind below.
  mkdoc2
  sed -i '/^# Fidelity violations$/a \\n- [contradiction] 1장 — t001과 모순' "$W/documents/d2/review.md"
  vrun seal-review d2 draft
  vrun consecrate d2;  expect_block "open gate"
  [ -e "$W/documents/d2/final.md" ] && bad "a refused consecration left a final behind"
  sed -i '/- \[contradiction\] 1장 — t001과 모순/d' "$W/documents/d2/review.md"
  vrun seal-review d2 draft
  vrun consecrate d2;  expect_pass
}
e2e_block_repair_unsupported() {
  mkdoc2
  sed -i '/^# Fidelity violations$/a \\n- [unsupported] 2장 — 근거 없음' "$W/documents/d2/review.md"
  vrun seal-review d2 draft
  vrun consecrate d2;  expect_block "open gate"
  sed -i '/- \[unsupported\] 2장 — 근거 없음/d' "$W/documents/d2/review.md"
  vrun seal-review d2 draft
  vrun consecrate d2;  expect_pass
}
e2e_block_repair_missing_required() {
  mkdoc2
  sed -i '/^# Fidelity violations$/a \\n- [missing-required] 위약 조항 누락' "$W/documents/d2/review.md"
  vrun seal-review d2 draft
  vrun consecrate d2;  expect_block "open gate"
  sed -i '/- \[missing-required\] 위약 조항 누락/d' "$W/documents/d2/review.md"
  vrun seal-review d2 draft
  vrun consecrate d2;  expect_pass
}
e2e_user_answer_chain() {
  # The ask loop's artifact chain: a user answer becomes a material, the material grounds a
  # truth, the truth is cited — and the whole chain validates and consecrates.
  mkdir -p "$W/materials/m002"
  printf -- '---\nid: m002\ntitle: 사용자 답변 — 지연 배상\norigin: user-answer\nrole: 계약서\ntopics: [지연]\nformat: md\nsource_path: inbox/answer.md\nadded: 2026-07-02\nstatus: converted\nsummary: 지연 배상 한도에 대한 사용자 답변.\n---\n\n지연 배상 한도는 계약금액의 20%%다.\n' > "$W/materials/m002/converted.md"
  printf '| m002 | 사용자 답변 — 지연 배상 | 계약서 | converted |\n' >> "$W/catalog.md"
  printf -- '---\nid: t002\nclaim: "지연 배상 한도는 계약금액의 20%%다"\nsource: m002\ntags: [지연]\nstatus: ok\nprovenance: stated\n---\n\n지연 배상 한도는 계약금액의 20%%다.\n' > "$W/truths/t002.md"
  ( cd "$W" && bash .weavedoc/bin/weavedoc reindex >/dev/null 2>&1 )
  mkdoc2
  sed -i 's/^cited_truths: \[t001\]$/cited_truths: [t001, t002]/' "$W/documents/d2/plan.md"
  printf -- '\n지연 배상 한도는 계약금액의 20%%다. <!-- t:t002 -->\n' >> "$W/documents/d2/draft.md"
  vrun seal-review d2 draft
  vrun consecrate d2;  expect_pass
  vrun validate;       expect_pass
}
e2e_open_queue_consecrates() {
  # Ruled 2026-08-01 and pinned here as a sequence: an open Human-queue entry does NOT block the
  # machine's consecration — listing it and getting the go-ahead is the SKILL's duty, one level
  # up. The only blocking membrane is the fidelity gate.
  mkdoc2
  printf -- '\n- [open] [user-only] 1장 — 표현 수위 판단\n' >> "$W/documents/d2/review.md"
  vrun seal-review d2 draft
  vrun consecrate d2;  expect_pass
  vrun validate;       expect_pass
}

# ---- WD-CLI-002 (Phase 5 unit 11a): stable diagnostic codes + validate --json ----
acct_json_validate_clean() {
  vrun validate --json
  expect_pass
  expect_has '"result":"pass"'
  expect_has '"output_schema_version":1'
  expect_has '"diagnostics":[]'
}
acct_json_validate_diag() {
  # The machine surface: exit 1, result fail, and the STABLE code — the message may be reworded,
  # the code may not.
  vrun seal-review d1 draft
  printf 'x\n' >> "$W/documents/d1/final.md"
  vrun validate --json
  [ "$RC" -eq 1 ] || bad "expected exit 1, got $RC"
  expect_has '"result":"fail"'
  expect_has '"code":"GATE-FINAL-DIGEST"'
}
acct_diag_code_human() {
  # Human output carries the same code in brackets — citable, greppable, stable.
  printf 'x\n' >> "$W/truths/t001.md"
  vrun validate
  expect_block "[SEAL-QUOTE-MISSING]"
}
meta_uncoded_ratchet() {
  # Every SHELL prob site carries a code; the two matches allowed are emit_probs' router lines.
  # awk-emitted diagnostics are wave 11b — this ratchet keeps the shell side at zero meanwhile.
  local n
  n=$(grep -E '\bprob "' "$REPO/.weavedoc/bin/weavedoc" | grep -cvE '\$code|\$line' || true)
  OUT="uncoded shell prob sites: ${n:-?}"; RC=0
  if [ "${n:-1}" -eq 0 ]; then ok; else bad "shell prob sites without a code: $n (the ratchet allows zero)"; fi
}

meta_doc_sync() {
  # Docs and code agree, checked mechanically (Phase 5): dispatch ↔ README ↔ bin header, and
  # VERSION ↔ CHANGELOG's newest entry. Green only while all four surfaces say one thing.
  OUT=$(bash "$REPO/tests/doccheck.sh" 2>&1); RC=$?
  expect_pass
  expect_has "docs and code agree"
}

# ---- command smoke floor (Phase 2: every CLI command has at least one covered run) ----
acct_smoke_version() { vrun version; expect_pass; expect_has "fingerprint:"; }
acct_smoke_lang()    { vrun lang;    expect_pass; expect_has "ko"; }
acct_smoke_locale() {
  # `locale`'s contract has TWO documented outcomes: a short code + exit 0, or empty + exit 1
  # ("init then asks"). What the smoke pins is that it terminates in one of them — not a usage
  # error, not a crash. Getting here took two CI rounds: run 1 caught the smoke asserting "ko"
  # (the dev machine), run 2 caught it asserting exit 0 (the Windows outcome only).
  vrun locale
  if [ "$RC" -eq 0 ] || [ "$RC" -eq 1 ]; then ok; else bad "locale exited $RC (contract: 0+code or 1+empty)"; fi
}
acct_smoke_pull() {
  vrun pull 위약
  expect_pass
  expect_has "t001"
  expect_has "usable 1"
}
acct_smoke_impact() {
  vrun impact m001
  expect_pass
  expect_has "truths extracted from it"
  expect_has "t001"
}
acct_smoke_gaps() {
  vrun gaps
  expect_pass
  expect_has "RAW scan, not an open count"
}
acct_status_untagged_open() {
  # R3-N2: a `- [open]` with no ownership tag landed in the total but in no bucket and not in
  # untagged — `open 5 — 2 · 1 · 1` with the missing one nowhere. The remainder is now shown.
  printf -- '- [open] 소유권 태그 없는 항목\n' >> "$W/truths/verify.md"
  vrun status
  expect_has "missing an ownership tag"
}
pass_retag_leaves_body_alone() {
  # S1 (R3): a truth whose BODY quotes a line shaped like a list field. retag rewrote the quote,
  # the seal then failed on the tool's own edit, and the message blamed the user for laundering.
  sed -i 's/^제3조 대금은 5천만원으로 한다\.$/제3조 대금은 5천만원으로 한다.\ntags: [위약, 대금]/' "$W/materials/m001/converted.md"
  printf -- '---\nid: t002\nclaim: "자료가 선언한 태그 줄"\nsource: m001\ntags: [대금]\nstatus: ok\n---\n\ntags: [위약, 대금]\n' > "$W/truths/t002.md"
  printf -- '- 태그 선언 줄: t002\n' >> "$W/truths/coverage.md"
  printf -- '- added: t002 (2026-07-30)\n' >> "$W/truths/changelog.md"
  ( cd "$W" && bash .weavedoc/bin/weavedoc reindex >/dev/null 2>&1 )
  vrun validate; expect_pass
  ( cd "$W" && bash .weavedoc/bin/weavedoc retag 위약 벌칙 >/dev/null 2>&1 )
  OUT=$(cat "$W/truths/t002.md")
  expect_has "tags: [위약, 대금]"      # the BODY quote is untouched
  expect_hasnt "tags: [벌칙, 대금]"    # nothing rewrote it
  vrun validate; expect_pass           # and the seal still holds
}
pass_retag_still_rewrites_frontmatter() {
  ( cd "$W" && bash .weavedoc/bin/weavedoc retag 위약 벌칙 >/dev/null 2>&1 )
  OUT=$(grep '^tags:' "$W/truths/t001.md"); expect_has "벌칙"
}
pass_crlf_retag() {
  printf -- '---\r\nid: t002\r\nclaim: "대금은 5천만원이다"\r\nsource: m001\r\ntags: [대금]\r\nstatus: ok\r\n---\r\n\r\n제3조 대금은 5천만원으로 한다.\r\n' > "$W/truths/t002.md"
  ( cd "$W" && bash .weavedoc/bin/weavedoc retag 대금 금액 >/dev/null 2>&1 )
  # Through od, not grep: MSYS grep reads files in text mode, so a CR-matching pattern never fires
  # and the test reported every CRLF file as stripped.
  hascr() { od -c "$1" | grep -qF '\r'; }
  if ! hascr "$W/truths/t002.md"; then OUT="$(cat -A "$W/truths/t002.md" | head -4)"; bad "retag stripped CRLF"; return; fi
  if hascr "$W/truths/t001.md"; then OUT="$(cat -A "$W/truths/t001.md" | head -4)"; bad "retag introduced CR into an LF file"; return; fi
  OUT="(line endings preserved both ways)"; ok
}
pass_space_in_path() {
  # Lives under the per-run mktemp workspace like every other fixture — the trap cleans it, and
  # `set -u` is why a stale variable here dies loudly instead of writing into a shared /tmp path.
  local sw="$WORK/space-$$/with space/proj"
  rm -rf "$WORK/space-$$" 2>/dev/null; mkdir -p "$WORK/space-$$/with space"
  cp -r "$PRISTINE" "$sw"
  OUT=$( ( cd "$sw" && $TO bash .weavedoc/bin/weavedoc validate ) 2>&1 ); RC=$?
  expect_pass
  expect_has "materials 1"
  rm -rf "$WORK/space-$$" 2>/dev/null
}
pass_shipped_templates() {
  # A project built from the three shipped templates, filled in exactly as documented.
  local p="$W-tmpl"; rm -rf "$p" 2>/dev/null; mkdir -p "$p/materials/m001" "$p/truths" "$p/documents/d1"
  cp -r "$REPO/.weavedoc" "$p/.weavedoc"
  cp "$REPO/.weavedoc/templates/config.yaml" "$p/.weavedoc/config.yaml"
  sed -e 's/{ko|en}/ko/' -e 's/^roles: \[\]/roles: [계약서]/' -e 's/^tone:.*$/tone: 담백/' \
      -e 's/{one-line placeholder — filled in as the mine grows}/최소 프로젝트./' \
      "$REPO/.weavedoc/templates/project.md" > "$p/project.md"
  sed -e 's/{m<NNN>}/m001/' -e 's/{human-readable name}/계약서/' \
      -e 's/{file|user-answer|prior-doc|conversation|research}/file/' \
      -e 's/{one of project.md roles}/계약서/' -e 's/\[{topic}, {topic}\]/[위약]/' \
      -e 's/{pdf|docx|xlsx|image|md|...}/md/' -e 's|{where the original came from}|inbox/c.md|' \
      -e 's/{YYYY-MM-DD}/2026-07-01/' -e 's/{collected|converted|verified|used|retracted}/converted/' \
      -e 's/{2-3 line summary}/최소 계약서./' -e 's/{converted content}/제7조 위약금은 10%로 한다./' \
      "$REPO/.weavedoc/templates/material.md" > "$p/materials/m001/converted.md"
  sed -e 's/t{NNN}/t001/' -e 's/{one-sentence fact}/위약금은 10%다/' -e 's/^source: m{N}$/source: m001/' \
      -e 's/{where in the source}/제7조/' -e 's/\[{tag1}, {tag2}\]/[위약]/' \
      -e 's/{Verbatim quote from the source material pinning the exact claim — copy-pasted, never paraphrased.}/제7조 위약금은 10%로 한다./' \
      "$REPO/.weavedoc/templates/truth.md" > "$p/truths/t001.md"
  sed -e 's/{doc-id}/d1/' -e 's/{report|proposal|review|research-log|...}/report/' \
      -e 's/{the project tone, copied here, unless this document overrides it — required, never blank}/담백/' \
      -e 's/{planned|drafting|reviewing|done|stale}/planned/' \
      -e 's/{Section title}/개요/' \
      "$REPO/.weavedoc/templates/plan.md" > "$p/documents/d1/plan.md"
  # the tone sed above must actually FIRE — R4-N1: a stale placeholder pattern left the template
  # text in place, validate passed anyway, and the case covered nothing while claiming to.
  grep -q '^tone: 담백$' "$p/documents/d1/plan.md" || { bad "tone sed did not fire — placeholder drifted"; return; }
  printf '# 자료 목록\n\n| id | 제목 |\n|---|---|\n| m001 | 계약서 |\n' > "$p/catalog.md"
  printf '# Coverage\n\n## m001\n\n- 위약금: t001\n' > "$p/truths/coverage.md"
  cp "$REPO/.weavedoc/templates/review.md" "$p/documents/d1/review.md"
  ( cd "$p" && bash .weavedoc/bin/weavedoc reindex >/dev/null 2>&1 )
  OUT=$( ( cd "$p" && $TO bash .weavedoc/bin/weavedoc validate ) 2>&1 ); RC=$?
  expect_pass
}

# ---------------------------------------------------------------- accounting (examined:)

acct_clean() { vrun validate; expect_has "truths 1 (1 sealed)"; }
acct_sealfail() {
  printf -- '---\nid: t002\nclaim: "지체상금은 일 0.1%%다"\nsource: m001\ntags: [위약]\nstatus: ok\n---\n\n제9조 지체상금은 일 0.1%%로 한다.\n' > "$W/truths/t002.md"
  ( cd "$W" && bash .weavedoc/bin/weavedoc reindex >/dev/null 2>&1 )
  vrun validate; expect_has "1 sealed · 1 seal FAILED"
}
acct_tombstone() {
  printf -- '---\nid: t002\nclaim: "지체상금 조항이 있다"\nsource: m001\ntags: [위약]\nstatus: retracted\n---\n' > "$W/truths/t002.md"
  printf -- '- removed: t002 (2026-07-30) — 원문에 없었다\n' >> "$W/truths/changelog.md"
  ( cd "$W" && bash .weavedoc/bin/weavedoc reindex >/dev/null 2>&1 )
  vrun validate; expect_has "1 sealed · 1 tombstone"
}
acct_notchecked() {
  sed -i 's/^source: m001$/source:/' "$W/truths/t001.md"
  vrun validate; expect_has "← 1 NOT checked"
}
acct_no_truths_yet() {
  rm -f "$W"/truths/t0*.md "$W/truths/index.md" "$W/truths/tree.md" "$W/truths/coverage.md"
  rm -rf "$W/documents/d1"
  mkdir -p "$W/materials/m002"
  sed -e 's/^id: m001$/id: m002/' "$W/materials/m001/converted.md" > "$W/materials/m002/converted.md"
  printf '| m002 | 두 번째 자료 | 계약서 | converted |\n' >> "$W/catalog.md"
  vrun validate; expect_has "materials 2"
}
acct_material_without_converted() {
  mkdir -p "$W/materials/m002"
  vrun validate; expect_has "materials 1"
}
acct_materials_redirected() {
  sed -i 's|^  materials: materials$|  materials: materials-moved|' "$W/.weavedoc/config.yaml"
  vrun validate; expect_has "materials 0"
}

# ---------------------------------------------------------------- driver

runone() { # $1 = case name; runs in its own fixture copy, writes $RES/<case>
  CASE="$1"
  W="$WORK/w/$CASE"
  rm -rf "$W" 2>/dev/null; mkdir -p "$W"
  cp -r "$PRISTINE"/. "$W"/
  RESULT=""; OUT=""; RC=0
  "$CASE"
  {
    printf '%s\t%s\n' "$CASE" "$RESULT"
    printf '%s\n' "$OUT" | sed 's/^/\t| /'
  } > "$RES/$CASE"
}

if [ -n "$ONE" ]; then
  mkdir -p "$RES"
  # Standalone --one with no inherited workspace: build the fixture instead of failing on a
  # missing pristine (a stale shared pristine once ran an OLD bin against a new case — the keyed
  # per-run workspace removes that class entirely).
  [ -d "$PRISTINE" ] || mkpristine
  runone "$ONE"
  cat "$RES/$ONE"
  grep -q "	PASS" "$RES/$ONE"
  exit $?
fi

# `meta_` is in the selector because it was NOT, and the guard added in 2026-08-01.2 as the
# structural answer to three rounds of duplicate-judge criticals sat unselected while the suite
# printed a clean total. A case that cannot be selected is a case that does not exist.
CASES=$(declare -F | awk '{print $3}' | grep -E '^(block|pass|acct|meta|e2e)_' | LC_ALL=C sort)
if [ -n "$FILTER" ]; then CASES=$(printf '%s\n' "$CASES" | grep -F "$FILTER" || true); fi
[ -z "$CASES" ] && { echo "no cases match [$FILTER]"; exit 2; }

echo "weavedoc regression — $(cd "$REPO" && git rev-parse --short HEAD 2>/dev/null) / bundle $(cat "$REPO/.weavedoc/VERSION") / $(printf '%s\n' "$CASES" | wc -l | tr -d ' ') cases, -j$JOBS"
echo "  env: $(uname -sr) · bash ${BASH_VERSION%%(*} · cache key $KEY"
bash -n "$REPO/.weavedoc/bin/weavedoc" || { echo "!! bin/weavedoc does not parse"; exit 2; }
mkpristine
OUT=$( ( cd "$PRISTINE" && bash .weavedoc/bin/weavedoc validate ) 2>&1 ) || {
  echo "!! the pristine fixture does not validate — every case below would be meaningless"
  printf '%s\n' "$OUT" | sed 's/^/   | /'; exit 2
}
mkdir -p "$RES" "$WORK/w"
# --resume keeps results already in THIS key's cache and runs only what is missing. One `validate`
# costs ~40s here even at -j6, so a full sweep outlives a single foreground command; without
# resume every interruption threw away the whole sweep. A different commit/bundle/toolchain is a
# different key — its cache is a different directory, so cross-configuration reuse cannot happen.
if [ "$RESUME" -eq 0 ]; then rm -rf "$RES" "$WORK/w" 2>/dev/null; mkdir -p "$RES" "$WORK/w"; fi

TODO=""
for CASE in $CASES; do
  [ "$RESUME" -eq 1 ] && [ -f "$RES/$CASE" ] && continue
  TODO="$TODO $CASE"
done
if [ "$LIMIT" -gt 0 ]; then TODO=$(printf '%s\n' $TODO | head -"$LIMIT" | tr '\n' ' '); fi
if [ -n "$TODO" ]; then
  echo "running:$(printf '%s\n' $TODO | wc -l | tr -d ' ') case(s)"
  printf '%s\n' $TODO | xargs -P "$JOBS" -I{} bash "$0" --one {} >/dev/null 2>&1
fi

NPASS=0; NFAIL=0; NMISS=0
for CASE in $CASES; do
  if [ ! -f "$RES/$CASE" ]; then NMISS=$((NMISS+1)); continue; fi
  if head -1 "$RES/$CASE" | grep -q "	PASS"; then NPASS=$((NPASS+1))
  else NFAIL=$((NFAIL+1)); sed 's/^/  /' "$RES/$CASE"; fi
done

echo
echo "passed $NPASS · failed $NFAIL · not yet run $NMISS"
[ "$NFAIL" -eq 0 ] && [ "$NMISS" -eq 0 ]
