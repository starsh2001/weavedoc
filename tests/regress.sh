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

# ---- runtime under test ----
# Every case here is a CLI black box: it builds a mine, runs a command, and asserts stdout plus the
# exit code. Nothing reads the runtime's internals. So the runtime can be swapped WITHOUT touching a
# single case — which is what made the bash→Node rewrite verifiable against its predecessor's own
# suite, and what will make the next such change verifiable too. WD_BIN is the invocation prefix:
# interpreter first, entrypoint second, both project-relative and free of spaces (word splitting
# here is deliberate and safe for that reason).
# The default is the SHIPPED runtime. It was `bash .weavedoc/bin/weavedoc` while both runtimes
# shipped, which meant a plain local run graded the reference rather than the product — the v0.4.0
# external review's finding. The bash runtime was deleted in bundle 2026-08-05.3; its last
# comparison is pinned in tests/baseline/parity-final-2026-08-05.md.
WD_BIN=${WD_BIN:-"node .weavedoc/bin/weavedoc.mjs"}
read -r -a WDRUN <<< "$WD_BIN"
[ "${#WDRUN[@]}" -ge 2 ] || { echo "WD_BIN must be '<interpreter> <entrypoint>' — got '$WD_BIN'"; exit 2; }
WD_ENTRY=${WDRUN[${#WDRUN[@]}-1]}
[ -f "$REPO/$WD_ENTRY" ] || { echo "WD_BIN entrypoint not found: $REPO/$WD_ENTRY"; exit 2; }

# ---- workspace & result-cache isolation (WD-QA-002) ----
# Fixtures live in a per-run mktemp dir removed by trap: two runs can never collide, and an
# interrupted run leaves no workspace behind. Results live in a KEYED cache dir — the key hashes
# commit + bundle bytes + OS + tool versions, so --resume can only ever reuse results produced by
# THIS exact configuration. A different key is a different directory: stale results are
# unreachable, not filtered. WD_REG_KEY_SALT exists so a test can force a fresh key.
# The path half of the resume KEY: every keyed file's REPO-RELATIVE path, whole. The subshell cd
# makes find emit relative paths, so nothing is stripped and nothing machine-specific leaks in.
# DEFINED ABOVE the KEY computation on purpose — below it, the call inside KEY would fail into its
# 2>/dev/null and the paths would silently vanish from the key (the emptiness-looks-like-success
# class this suite keeps a name for).
key_paths() { ( cd "$1" && find tests .weavedoc/templates .weavedoc/bin -type f -print0 | sort -z | tr '\0' '\n' ); }

KEY=$( { git -C "$REPO" rev-parse HEAD 2>/dev/null
         cat "$REPO/.weavedoc/VERSION" 2>/dev/null
         # WD_BIN itself: two different invocations of the same commit are different configurations
         # and must not share a result cache, or `--resume` would hand one implementation's results
         # to the other and call the run green.
         printf '%s\n' "$WD_BIN"
         # The WHOLE runtime's bytes, not just the entrypoint. The entrypoint is a thin dispatcher
         # whose behavior lives in bin/lib/, so a key that hashed only $WD_ENTRY let a dirty lib
         # edit reuse the previous run's results under --resume (the v0.4.0 external review's
         # finding; HEAD only covers COMMITTED edits).
         { sha256sum "$REPO/.weavedoc/bin/weavedoc.mjs" "$REPO/.weavedoc/schema"
           # find, not a flat glob: a future lib/subdir/ must key too. Sorted for stability.
           find "$REPO/.weavedoc/bin/lib" -type f -print0 | sort -z | xargs -0 sha256sum
           # EVERYTHING a case consumes is configuration (v0.5.2 keyed the faultinject drivers;
           # review #6 named the rest of the class): doccheck.sh and ctlscan.mjs are RUN by cases,
           # the golden files are COMPARED by one, and the pristine fixture copies a template out
           # of .weavedoc/templates — a dirty edit to any of them changes what a case measures
           # without changing the case, and --resume would hand back the stale result. The *.sh
           # glob keys this harness's own bytes too (v0.5.1), so the separate self-hash is gone.
           sha256sum "$REPO"/tests/*.sh "$REPO"/tests/*.mjs
           # ...and the DOCS those scripts read (review #7): the doccheck case greps README,
           # CHANGELOG and FORMATS — a dirty edit there changes what it measures too.
           sha256sum "$REPO/README.md" "$REPO/CHANGELOG.md" "$REPO/.weavedoc/FORMATS.md"
           find "$REPO/tests/baseline/golden" "$REPO/.weavedoc/templates" -type f -print0 | sort -z | xargs -0 sha256sum
           : ; } 2>/dev/null | awk '{print $1}'
         # PATHS, not just contents (review #9) — and WHOLE repo-relative paths, not basenames
         # (review #10): the first fix hashed `basename` output, so moving a file between
         # directories — golden/version.txt into golden/z/ — kept the key while the fixed path
         # the cases read went stale, and --resume reported 430 "passed" having run nothing
         # (measured). Outside the awk so the lines survive whole; a FUNCTION so the case
         # guarding it runs these same bytes rather than a copy that can drift.
         key_paths "$REPO" 2>/dev/null
         # The RUNNER's version (v0.5.1, external review): a node upgrade is a different
         # configuration the way a bash upgrade always was (bash/awk/sed are keyed below).
         node --version 2>/dev/null
         uname -sr; bash --version | head -1; awk --version 2>/dev/null | head -1; sed --version 2>/dev/null | head -1
         printf '%s' "${WD_REG_KEY_SALT:-}"
       } | sha256sum | awk '{print $1}' | cut -c1-12 )
# The key's own vacuity guard: the path half runs inside 2>/dev/null, so a broken key_paths would
# not fail — it would just leave the key path-blind again. Checked loudly, once, here.
[ -n "$(key_paths "$REPO" 2>/dev/null)" ] || { echo "key_paths produced nothing — the resume key lost its path half"; exit 2; }
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
  # NOT auto-sealed: a sealed review enforces its digests on ANY mine, so sealing here would
  # stale the context under every case that touches a truth or the config (a real 29-case pileup
  # taught this). The pristine stays a v1 mine with a legacy review; seal-needing cases run
  # seal-review (or mk_v2) themselves, AFTER their mutations.
}
strip_seal() { # $1=review.md — remove the seal fields (the tamper the v2 gate must catch)
  sed -i '/^reviewed_kind:/d; /^reviewed_digest:/d; /^review_context_digest:/d' "$1"
}
mk_v2() { # promote the workspace to a schema-2 mine with a sealed review — the state where the
  # v0.3.1 seal enforcement applies. The pristine fixture stays v1 (dual-reader) so that the 250+
  # cases which edit truths/materials are not all staled by a seal they never asked for.
  sed -i 's/^version: 1$/version: 2/' "$W/project.md"
  sed -i 's/^version: 1/version: 2/' "$W/.weavedoc/config.yaml"
  # The suite is not `set -e`: a silent seal-review failure here would hand every v2 case an
  # UNSEALED mine, and the strip_seal block cases would then pass for the wrong reason (never
  # sealed is observably identical to stripped). A helper failure is a case failure, loudly.
  ( cd "$W" && "${WDRUN[@]}" seal-review d1 draft >/dev/null 2>&1 ) \
    || bad "mk_v2: seal-review failed — the case would assert against an unsealed mine"
}
REV() { review4 "$W" "$@"; }
mkscale() { # deterministic 8-material · 60-truth mine — the scale where spawn regressions show.
  # The minimal fixture's 1-truth loops spawn a few dozen processes and hide an O(N) spawn
  # regression completely (field report 2026-08-03, P1). Every truth quotes its source line
  # verbatim so the seal check does real substring work. No documents: the spawn hotspots under
  # measure are the materials/truths loops, and a doc would only add unrelated gate output.
  local M=8 T=60 mi ti mid tid line
  rm -rf "$W/materials" "$W/truths" "$W/documents"
  mkdir -p "$W/materials" "$W/truths" "$W/documents"
  printf '# 자료 목록\n\n| id | 제목 | 역할 | 상태 |\n|---|---|---|---|\n' > "$W/catalog.md"
  for (( mi=1; mi<=M; mi++ )); do
    printf -v mid 'm%03d' "$mi"
    mkdir -p "$W/materials/$mid"
    { printf -- '---\nid: %s\ntitle: 계약서 %d\norigin: file\nrole: 계약서\ntopics: [스케일]\nformat: md\nsource_path: inbox/c%d.md\nadded: 2026-07-01\nstatus: converted\nsummary: 스케일 픽스처 자료 %d.\n---\n\n# 계약서 %d\n\n' "$mid" "$mi" "$mi" "$mi" "$mi"
      for (( line=1; line<=40; line++ )); do printf '제%d조 자료%d의 조항 %d은 유효하다.\n' "$line" "$mi" "$line"; done
    } > "$W/materials/$mid/converted.md"
    printf '| %s | 계약서 %d | 계약서 | converted |\n' "$mid" "$mi" >> "$W/catalog.md"
  done
  printf '# Coverage\n\n' > "$W/truths/coverage.md"
  for (( mi=1; mi<=M; mi++ )); do
    printf '## m%03d\n\n' "$mi" >> "$W/truths/coverage.md"
    for (( ti=mi; ti<=T; ti+=M )); do printf -- '- 조항 %d: t%03d\n' "$(( (ti - 1) / M + 1 ))" "$ti" >> "$W/truths/coverage.md"; done
    printf '\n' >> "$W/truths/coverage.md"
  done
  printf '# 변경 로그\n\n' > "$W/truths/changelog.md"
  for (( ti=1; ti<=T; ti++ )); do
    printf -v tid 't%03d' "$ti"
    mi=$(( (ti - 1) % M + 1 )); printf -v mid 'm%03d' "$mi"
    line=$(( (ti - 1) / M + 1 ))
    printf -- '---\nid: %s\nclaim: "자료%d의 조항 %d이 유효하다"\nsource: %s\nlocation: "제%d조"\ntags: [스케일, 조항%d]\nstatus: ok\nprovenance: stated\n---\n\n제%d조 자료%d의 조항 %d은 유효하다.\n' \
      "$tid" "$mi" "$line" "$mid" "$line" "$line" "$line" "$mi" "$line" > "$W/truths/$tid.md"
    printf -- '- added: %s (2026-07-30)\n' "$tid" >> "$W/truths/changelog.md"
  done
  printf -- '---\nstatus: passed\nround: 1\nverified_at: 2026-07-30\n---\n\n## Verified units\n\n## Adjudications\n\n## Human queue\n' > "$W/truths/verify.md"
  ( cd "$W" && "${WDRUN[@]}" reindex >/dev/null 2>&1 ) || bad "mkscale: reindex failed"
}
pass_locale_emoji_claim() {
  # gawk 5.0's multibyte machinery misread emoji-bearing claim lines under UTF-8 locales: five
  # valid truths on a real mine reported FM-MISSING under ko_KR.UTF-8 while passing under C —
  # the verdict depended on which locale the shell happened to inherit (v0.3.4 latent, found by
  # a session-locale change). Content-parsing awks are byte-pinned (LC_ALL=C) now; the same
  # mine must validate identically under both locales. A missing ko_KR locale degrades to C
  # behaviour, so the case cannot false-fail where the locale is not generated.
  printf -- '---\nid: t002\nclaim: "품질 심사 — 🔴 즉시 수정, 🟡 확인 필요, 🟢 통과"\nsource: m001\ntags: [위약]\nstatus: ok\nprovenance: stated\n---\n\n제7조 위약금은 계약금액의 10%%로 한다.\n' > "$W/truths/t002.md"
  printf -- '\n- 심사: t002\n' >> "$W/truths/coverage.md"
  printf -- '- added: t002 (2026-07-30)\n' >> "$W/truths/changelog.md"
  ( cd "$W" && "${WDRUN[@]}" reindex >/dev/null 2>&1 )
  OUT=$( ( cd "$W" && LC_ALL= LANG=ko_KR.UTF-8 $TO "${WDRUN[@]}" validate ) 2>&1 ); RC=$?
  expect_pass
  OUT=$( ( cd "$W" && LC_ALL=C $TO "${WDRUN[@]}" validate ) 2>&1 ); RC=$?
  expect_pass
}
acct_scope_quoted_status_is_tombstone() {
  # scope's truth classifier carried its OWN status parser, and that one never peeled the quotes.
  # A perfectly legal `status: "retracted"` therefore read as a LIVE truth in scope while validate
  # — which uses the shared frontmatter value rule — read the same bytes as a tombstone. Two
  # parsers on one field is the drift class itself; scope uses the shared rule now.
  printf -- '---\nid: t002\nclaim: "철회된 주장"\nsource: m001\ntags: [위약]\nstatus: "retracted"\nprovenance: stated\n---\n\n제7조 위약금은 계약금액의 10%%로 한다.\n' > "$W/truths/t002.md"
  vrun scope
  expect_has "truths     1 live"
  expect_has "1 tombstone truth(s)"
}
pass_locale_scope_census_match() {
  # The locale pin, extended to the two commands the sweep missed (2026-08-04). scope classified
  # truths with an unpinned awk and SLICED THE LEDGER WITH AN UNPINNED GREP: GNU grep calls a
  # stream holding invalid UTF-8 "binary" under a multibyte locale and prints one sentence instead
  # of the matching rows, so scope reported different verify debt — and fabricated a ghost id out
  # of the sentence — depending on which locale the shell happened to inherit. The `standard`
  # column is free-form text a Korean console can easily fill with CP949 bytes. Byte semantics,
  # one verdict. A missing ko_KR locale degrades to C, so this cannot false-fail where it is absent.
  printf -- '---\nid: t002\nclaim: "품질 심사 — 🔴 즉시 수정, 🟡 확인 필요, 🟢 통과"\nsource: m001\ntags: [위약]\nstatus: ok\nprovenance: stated\n---\n\n제7조 위약금은 계약금액의 10%%로 한다.\n' > "$W/truths/t002.md"
  printf -- '\n- 심사: t002\n' >> "$W/truths/coverage.md"
  printf -- '- added: t002 (2026-07-30)\n' >> "$W/truths/changelog.md"
  ( cd "$W" && "${WDRUN[@]}" reindex >/dev/null 2>&1 )
  vrun attest verified 2 "$(printf '\xb0\xcb\xc1\xf5')" m001 t001
  # STDOUT ONLY. The verdict is on stdout; stderr carries gawk's "invalid multibyte data" notes and,
  # on a machine where ko_KR.UTF-8 was never generated, bash's setlocale warnings. Comparing stderr
  # too would fail the case for the absence of a locale rather than for a disagreement — the same
  # safe-degradation property pass_locale_emoji_claim documents (no locale → the run is C → match).
  for cmd_ in scope census; do
    sc_=$( ( cd "$W" && LC_ALL=C $TO "${WDRUN[@]}" "$cmd_" ) 2>/dev/null )
    sk_=$( ( cd "$W" && LC_ALL= LANG=ko_KR.UTF-8 $TO "${WDRUN[@]}" "$cmd_" ) 2>/dev/null )
    OUT="[$cmd_ · LC_ALL=C]
$sc_
[$cmd_ · ko_KR.UTF-8]
$sk_"; RC=0
    [ "$sc_" = "$sk_" ] || { bad "$cmd_ verdict depends on locale"; return; }
  done
  ok
}
acct_res_reason_comma_warns() {
  # D3 (field report, decided 2026-08-04): an unquoted reason holding a comma that opens no new
  # key is exactly where a strict YAML parser truncates the value (eclypse t245's correction
  # note fell below the cut). Warn-first, never blocking — deployed mines must not go red.
  sed -i '/^provenance: stated$/a resolution: {type: attribute, decided_by: user, decision_kind: supplied, reason: 양쪽 병기, 정정 부기 포함}' "$W/truths/t001.md"
  vrun validate
  expect_pass
  expect_has "[RES-REASON-UNQUOTED]"
}
acct_res_reason_quoted_silent() {
  # The compliant shape: quoted reason with commas inside — no warning (guard against
  # over-warning the format we are steering everyone toward).
  sed -i '/^provenance: stated$/a resolution: {type: attribute, decided_by: user, decision_kind: supplied, reason: "양쪽 병기, 정정 부기 포함"}' "$W/truths/t001.md"
  vrun validate
  expect_pass
  expect_hasnt "[RES-REASON-UNQUOTED]"
}
acct_pull_table_preview_counts() {
  # D2 (field report): a table-bodied truth previewed as its header row alone — a reviewer
  # decided "the mine has no runtime lengths" while every length sat in the table body. The
  # preview now says it is a table and how big.
  printf -- '---\nid: t002\nclaim: "수록곡 길이 표"\nsource: m001\ntags: [위약]\nstatus: ok\nprovenance: stated\n---\n\n| # | 곡 | 길이 |\n|---|---|---|\n| 1 | 서곡 | 3:10 |\n| 2 | 종곡 | 4:02 |\n' > "$W/truths/t002.md"
  printf '\n- 표: t002\n' >> "$W/truths/coverage.md"
  printf -- '- added: t002 (2026-07-30)\n' >> "$W/truths/changelog.md"
  vrun reindex
  vrun pull 수록곡
  expect_has "표 4행"
  expect_has "| # | 곡 | 길이 |"
}
mkplanstage() { # m002 (stage: plan) + t002 derived from it, with as_of — the label-bearing shape
  mkdir -p "$W/materials/m002"
  printf -- '---\nid: m002\ntitle: 기획서\norigin: file\nrole: 계약서\ntopics: [기획]\nformat: md\nsource_path: inbox/plan.md\nadded: 2026-07-01\nstatus: converted\nstage: plan\nsummary: 계획 단계 자료.\n---\n\n# 기획서\n\n6곡 앨범을 계획한다.\n' > "$W/materials/m002/converted.md"
  printf '| m002 | 기획서 | 계약서 | converted |\n' >> "$W/catalog.md"
  printf -- '---\nid: t002\nclaim: "앨범은 6곡으로 계획되었다"\nsource: m002\ntags: [음악]\nstatus: ok\nprovenance: derived\nderived_from: [m002]\nassumptions: [발매 전 변경 가능]\nas_of: 2026-07-01\n---\n\n6곡 앨범을 계획한다.\n' > "$W/truths/t002.md"
  printf '\n## m002\n\n- 계획: t002\n' >> "$W/truths/coverage.md"
  printf -- '- added: t002 (2026-07-30)\n' >> "$W/truths/changelog.md"
}
acct_tree_carries_labels() {
  # D1 (field report): pull attached PLAN-STAGE/as_of/DERIVED while index.md/tree.md carried
  # only the status marker — the consumer's fact depended on which entry path they took. A
  # reviewer browsing tree.md read a plan-stage album spec as a release fact.
  mkplanstage
  vrun reindex; expect_pass
  OUT=$(cat "$W/truths/tree.md"); RC=0
  expect_has "PLAN-STAGE"
  expect_has "as_of: 2026-07-01"
  OUT=$(cat "$W/truths/index.md"); RC=0
  expect_has "PLAN-STAGE"
  vrun validate; expect_pass
}
acct_pull_index_labels_agree() {
  # The acceptance rule: one truth, one label set — pull and the index surfaces say the same
  # thing. And the labels are OUTPUT, not search text: pulling a word that appears only inside
  # label prose must not hit every labeled truth.
  mkplanstage
  vrun reindex
  vrun pull 앨범
  expect_has "[PLAN-STAGE SOURCE — never evidence of use]"
  expect_has "(as_of: 2026-07-01)"
  vrun pull evidence
  expect_has "no matches"
}
acct_pull_partial_discard_labels() {
  # D4 (field report): the discarded branch dropped $lab and [$src] — on a PARTIAL discard
  # (resolution.scope) the surviving half is exactly the content that needs its labels, and it
  # printed unlabeled (eclypse t040, an open Human-queue item since 2026-08-01).
  mkplanstage
  sed -i 's/^status: ok$/status: discarded/' "$W/truths/t002.md"
  sed -i '/^as_of:/a resolution: {type: value, winner: t001, scope: [곡수], decided_by: user, decision_kind: supplied, reason: "곡수만 정정"}' "$W/truths/t002.md"
  vrun reindex
  vrun pull 앨범
  expect_has "scope [곡수]"
  expect_has "PLAN-STAGE"
  expect_has "[m002]"
}
acct_pull_full_discard_unchanged() {
  # Full discard (no scope): the protocol says follow the successor — the row stays terse and
  # label-free, exactly as before (the guard against relabeling what should stay quiet).
  mkplanstage
  sed -i 's/^status: ok$/status: discarded/' "$W/truths/t002.md"
  sed -i '/^as_of:/a resolution: {type: value, winner: t001, decided_by: user, decision_kind: supplied, reason: "전체 대체"}' "$W/truths/t002.md"
  vrun reindex
  vrun pull 앨범
  expect_has "DISCARDED → t001"
  expect_hasnt "PLAN-STAGE"
}
acct_scale_snapshot() {
  # Field-report P1 contract, mechanized: the fold must produce the SAME verdicts at scale.
  # Pinned on exact examined/scope tallies — a refactor that drops or double-counts a check
  # class moves one of these lines.
  mkscale
  vrun validate
  expect_pass
  expect_has "examined: materials 8 · truths 60 (60 sealed)"
  vrun scope
  expect_has "truths     60 live · 0 verified (digest-bound) · 0 legacy-unbound · 0 stale · 0 failed · 60 unverified"
  vrun pull 조항3
  expect_pass
  expect_has "usable"
}

mkpristine() {
  rm -rf "$PRISTINE" 2>/dev/null
  mkdir -p "$PRISTINE"
  cp -r "$REPO/.weavedoc" "$PRISTINE/.weavedoc"
  cp "$REPO/.weavedoc/templates/config.yaml" "$PRISTINE/.weavedoc/config.yaml"
  mkdir -p "$PRISTINE/inbox" "$PRISTINE/materials/m001" "$PRISTINE/truths" "$PRISTINE/documents/d1"

  cat > "$PRISTINE/project.md" <<'EOF'
---
version: 1
language: ko
roles: [계약서]
tone: 담백
required_tags: []
---

최소 픽스처 프로젝트.
EOF
  # The pristine mine is a v1 mine ON PURPOSE (project + config both version: 1): 250+ cases
  # mutate truths/materials freely, and a v2 fixture would stale a seal on every one of them.
  # Cases that need v2 seal enforcement promote explicitly via mk_v2.
  sed -i 's/^version: 2/version: 1/' "$PRISTINE/.weavedoc/config.yaml"

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
  ( cd "$PRISTINE" && "${WDRUN[@]}" reindex >/dev/null 2>&1 )
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

vrun() { OUT=$( ( cd "$W" && $TO "${WDRUN[@]}" "$@" ) 2>&1 ); RC=$?; }
# The two cases below read the runtime SOURCE rather than its output — the only ones in the suite
# that do, and the reason they exist is that the invariants they pin (one judge per rule, every
# emitted diagnostic code documented, no uncoded diagnostic) cannot be seen from outside. They
# encode the runtime's own syntax, so a future runtime needs its own spelling of the same
# invariant, not a path swap: a green sweep must never mean "and these invariants went unwatched".
# NAMED `nodeshape_`, not `meta_`, and that matters: the case selector picks up every function
# matching ^(block|pass|acct|meta|e2e)_, so a helper called meta_..._node is SELECTED as a case of
# its own and run under the bash runner too, where it inspects the wrong entrypoint. It reported
# `inline-fence-judges=31` against the bash file on the first run — the suite catching the author.
# The mirror of "a case that cannot be selected does not exist" is "a helper that can be selected is
# a case nobody wrote".
# The Node runtime is a DIRECTORY of modules, not one file, so every source-shape invariant below
# reads this list rather than a single entrypoint. Missing a module here would make a duplicate judge
# invisible, which is the exact failure these cases exist to prevent — so the list is globbed, never
# enumerated.
# RECURSIVE, not `bin/lib/*.mjs`: a cold review proved that a duplicate judge in `bin/extra.mjs` or
# `bin/lib/sub/mod.mjs` was invisible to every arm below. The set these invariants police is "the
# runtime", and the runtime is whatever .mjs sits under bin/.
node_sources() { find "$REPO/.weavedoc/bin" -name '*.mjs' -type f | LC_ALL=C sort; }

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
nodeshape_single_judges() {
  # The SAME invariant, spelled for a runtime that is modules rather than one file. Every judge is
  # exported from exactly one place, so a second copy of a rule fails here instead of being found by
  # a cold reviewer three rounds later.
  local bad="" fn n
  local -a SRC; mapfile -t SRC < <(node_sources)
  for fn in isNoise hasFm fidMark fidBody nocomment canonId isPlaceholder isFence \
            truthDigest matDigest unitDigest ledgerRows artifactDigest contextDigest \
            docDraftPath docFinalPath splitLines fmVal fmKey; do
    # Any binding form, at any indentation: `export const`, a bare `function`, a `let`, or a
    # function-local `const`. The first spelling of this only matched a top-level `export const`,
    # so `export let isFence = …` and an indented shadow both counted as ZERO definitions and the
    # check went green on a second judge — proved by a cold review.
    n=$(grep -hcE "^[[:space:]]*(export[[:space:]]+)?(async[[:space:]]+)?(function|const|let|var)[[:space:]]+${fn}\b" "${SRC[@]}" 2>/dev/null | awk '{s+=$1} END{print s+0}')
    [ "${n:-0}" -eq 1 ] || bad="$bad ${fn}=${n};"
  done
  # THE FENCE JUDGE IS isFence ONLY. This is not hypothetical: the port carried ELEVEN inline
  # spellings of `^---[ \t]*$`, every one of them narrower than the `[[:space:]]` the bash runtime
  # uses, and a fence carrying a vertical tab closed the block for bash and not for Node — which
  # then read frontmatter on into the document body. core.mjs holds the one spelling; an inline
  # fence regex anywhere else is a second judge.
  # Comments are skipped: the port's comments QUOTE the bash pattern constantly, and counting those
  # made the check fail on its own documentation the first time it ran.
  # Matches the `[class]` spelling AND the `\s` one. A cold review showed `/^---\s*$/` — the single
  # most likely thing a porter reaches for — sailed past a grep that only looked for the bracket.
  n=$(grep -hv "^[[:space:]]*//" "${SRC[@]}" | grep -cE '/\^---(\[|\\s|\\t| )' || true)
  [ "${n:-0}" -le 1 ] || bad="$bad inline-fence-judges=${n};"
  # A diagnostic must go through prob/warn. `out(\`  [CODE] …\`)` prints exactly what prob prints and
  # is invisible to BOTH the code-table arm and the ratchet — a whole diagnostic outside the contract.
  n=$(grep -hv "^[[:space:]]*//" "${SRC[@]}" | grep -cE 'out\(`[[:space:]]+\[[A-Z][A-Z0-9-]+\]' || true)
  [ "${n:-0}" -eq 0 ] || bad="$bad diagnostics-bypassing-prob=${n};"
  # Strict key spelling (`^key:` with nothing between the key and its colon) must not reappear in
  # any frontmatter or flow reader — the lenient form is `^key[ \t\v\f\r]*:`, because `source : m001`
  # and `source:m001` are both legal YAML and both were missed for a whole release.
  n=$(grep -hcE '/\^(source|status|tags|claim|title|origin|role|topics|format|added|summary|resolution|conflict_with|provenance|derived_from|superseded|corroborated_by|winner|decided_by|decision_kind|scope):' "${SRC[@]}" 2>/dev/null | awk '{s+=$1} END{print s+0}')
  [ "${n:-0}" -eq 0 ] || bad="$bad strict-key-patterns=${n};"
  # No literal C0 control character may sit in the source. The bash runtime keeps its reference-index
  # separator as a raw \001, which RENDERS AS NOTHING — read as text it says "split on the empty
  # string, i.e. into characters", and porting that reading produced plausible garbage. The port
  # spells both separators as escapes so the next reader cannot be misled the same way.
  # Counted through a NAMED variable with a default at every step. The obvious spelling —
  #   n=$(( n + $(node … | sed 's/[^0-9]//g') ))
  # — is a trap: when the scanner prints nothing (node off PATH, ctlscan missing, a throw), the
  # substitution is EMPTY and `$(( 0 +  ))` is a bash SYNTAX error, which aborts the enclosing
  # command list rather than returning non-zero. Inside `--one` that skips the branch's own `exit`
  # and execution falls through to the top-level sweep — which is `xargs -P6 bash "$0" --one {}`,
  # i.e. this script forking itself without bound. Observed ~20 levels deep before it was killed.
  # A check that cannot run must fail LOUD, never fall through into the runner.
  local f one
  n=0
  for f in "$REPO/$WD_ENTRY" "$REPO"/.weavedoc/bin/lib/*.mjs; do
    one=$(node "$REPO/tests/ctlscan.mjs" "$f" 2>/dev/null | tail -1 | sed 's/[^0-9]//g')
    case "$one" in ''|*[!0-9]*) bad="$bad ctlscan-unusable:${f##*/};"; continue ;; esac
    n=$(( n + one ))
  done
  [ "$n" -eq 0 ] || bad="$bad literal-control-chars=${n};"
  OUT="${bad:-ok}"; RC=0; [ -n "$bad" ] && RC=1
  expect_pass
}
meta_single_judges() {
  # The drift every round kept finding — "the rule was unified, one site was left out" — is now
  # watched by the suite itself: each grep pins an invariant about the RUNTIME SOURCE, so a new
  # duplicate judge fails here before a cold reviewer has to find it. This is one of the two cases
  # in the suite that read the source rather than the output, because the invariant it pins cannot
  # be seen from outside.
  nodeshape_single_judges
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
  # The path must be spelled in the NATIVE form on Windows. Under MSYS `pwd` prints an MSYS path
  # (`/tmp/...`), and that spelling is a translation only MSYS programs perform — measured here,
  # `/tmp` is not `C:\tmp` but `C:\Users\<u>\AppData\Local\Temp`, which nothing outside MSYS can
  # know. bash IS an MSYS program so it resolves it; the shipped Node runtime is a native program
  # and cannot. Declared parity exception (REWRITE_PLAN §5) — the same MSYS/native boundary as the
  # invalid-UTF-8 argv bytes. What this case is FOR is that an absolute path in config.paths works
  # at all, so it spells one the way a Windows user actually would.
  local abs; abs=$( cd "$W" >/dev/null && pwd )
  case "$(uname -s)" in MINGW*|MSYS*) abs=$( cd "$W" >/dev/null && pwd -W );; esac
  sed -i "s|^  documents: documents$|  documents: $abs/documents|" "$W/.weavedoc/config.yaml"
  # ...and the edit has to have LANDED. Without this the case degrades into a plain `validate`
  # pass the moment the config key is respelled, and reports AGREE while measuring nothing.
  grep -qF "  documents: $abs/documents" "$W/.weavedoc/config.yaml" || { bad "fixture no-op: config still has no absolute documents path"; return; }
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
  ( cd "$W" && "${WDRUN[@]}" reindex >/dev/null 2>&1 )
  vrun validate; expect_block "rename it to 't005.md'"
}
block_id_overpadded() {
  mv "$W/truths/t001.md" "$W/truths/t0001.md"
  sed -i 's/^id: t001$/id: t0001/' "$W/truths/t0001.md"
  sed -i 's/^- 위약금 조항: t001$/- 위약금 조항: t0001/' "$W/truths/coverage.md"
  sed -i 's/^cited_truths: \[t001\]$/cited_truths: [t0001]/' "$W/documents/d1/plan.md"
  ( cd "$W" && "${WDRUN[@]}" reindex >/dev/null 2>&1 )
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
  ( cd "$W" && "${WDRUN[@]}" reindex >/dev/null 2>&1 )
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
  ( cd "$W" && "${WDRUN[@]}" retag 위약 벌칙 >/dev/null 2>&1 )
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
  ( cd "$W" && "${WDRUN[@]}" reindex >/dev/null 2>&1 )
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
  ( cd "$W" && "${WDRUN[@]}" reindex >/dev/null 2>&1 )
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
  ( cd "$W" && "${WDRUN[@]}" reindex >/dev/null 2>&1 )
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
  ( cd "$W" && "${WDRUN[@]}" reindex >/dev/null 2>&1 )
  vrun validate; expect_pass
  vrun pull 위약; expect_has "usable 1"
}
pass_cited_short_id() {
  mv "$W/truths/t001.md" "$W/truths/t005.md"
  sed -i 's/^id: t001$/id: t005/' "$W/truths/t005.md"
  sed -i 's/^- 위약금 조항: t001$/- 위약금 조항: t005/' "$W/truths/coverage.md"
  sed -i 's/^cited_truths: \[t001\]$/cited_truths: [t5]/' "$W/documents/d1/plan.md"
  printf -- '- added: t005 (2026-07-30)\n' >> "$W/truths/changelog.md"
  ( cd "$W" && "${WDRUN[@]}" reindex >/dev/null 2>&1 )
  vrun validate; expect_pass
}
pass_tombstone() {
  printf -- '---\nid: t002\nclaim: "지체상금 조항이 있다"\nsource: m001\ntags: [위약]\nstatus: retracted\n---\n' > "$W/truths/t002.md"
  printf -- '- removed: t002 (2026-07-30) — 원문에 없는 조항이었다\n' >> "$W/truths/changelog.md"
  printf -- '- 지체상금: t002 (철회)\n' >> "$W/truths/coverage.md"
  ( cd "$W" && "${WDRUN[@]}" reindex >/dev/null 2>&1 )
  vrun validate; expect_pass
  expect_has "1 tombstone"
  expect_hasnt "NOT checked"
}
pass_locales() {
  local l out1="" outN
  for l in C ko_KR.UTF-8 en_US.UTF-8 __unset__; do
    if [ "$l" = "__unset__" ]; then outN=$( ( cd "$W" && unset LC_ALL LANG; $TO "${WDRUN[@]}" validate ) 2>&1 )
    else outN=$( ( cd "$W" && LC_ALL="$l" LANG="$l" $TO "${WDRUN[@]}" validate ) 2>&1 ); fi
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
  ( cd "$W" && "${WDRUN[@]}" retag 위약 벌칙 >/dev/null 2>&1 )
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
  ( cd "$W" && "${WDRUN[@]}" reindex >/dev/null 2>&1 )
  vrun scope
  expect_has "truths     1 live"
  expect_has "1 tombstone"
}
pass_attest_validate_clean() {
  # The sidecar is additive: no v1 glob or census sees it, and validate stays clean next to it.
  vrun attest verified 2 standard m001 t001
  vrun validate; expect_pass
}
pass_attest_standard_verbatim_in_mirror() {
  # `standard` is free text the caller supplies, and it reaches TWO surfaces: the ledger row (built
  # with printf -v) and the `## Verified units` mirror line. The mirror used to go through
  # `awk -v line=…`, and gawk ESCAPE-PROCESSES a -v value — so a Windows path was written as
  # `C:<TAB>oolsstd` while the ledger held `C:\tools\std`, two spellings of one fact. Worse with a
  # `\n`: the mirror entry split into two lines and stopped being an entry at all. stdout was
  # correct throughout, so nothing that watched stdout could see it.
  vrun attest verified 2 'C:\tools\std' m001
  OUT=$(cat "$W/truths/verify.md"); RC=0
  expect_has 'C:\tools\std'
}
pass_attest_standard_newline_stays_one_line() {
  # The same defect at its worst: an escape that expands to a newline used to make ONE mirror entry
  # into two lines, the second of which reads as a bare list item covering nothing.
  # Asserted on the line's END, not its start: when the entry splits, the first line still opens
  # with `- m001 — R2` and only the verdict moves off it, so a prefix match counts 1 either way and
  # tests nothing. (It did. This case was written that way first and passed against the defect.)
  vrun attest verified 2 'a\nb' m001
  OUT=$(grep -c '^- m001 — R2.*· verified$' "$W/truths/verify.md"); RC=0
  expect_has "1"
}
block_attest_control_byte_in_standard() {
  # The one free-text column may not carry a control byte: a TAB widens the row, a newline splits
  # it. Both were writable, and the row then covered nothing while validate reported a malformed
  # ledger the user never knowingly created. Refused at the door — the ledger must not be breakable
  # through its own writer. Asserted on the RESULTING FILE too, not just the exit code: a refusal
  # that still wrote something is not a refusal.
  local before after
  before=$( [ -f "$W/truths/verify-ledger.tsv" ] && wc -l < "$W/truths/verify-ledger.tsv" || echo 0 )
  vrun attest verified 2 "$(printf 'a\tb')" m001
  expect_block "may not contain a tab, newline or other control character"
  after=$( [ -f "$W/truths/verify-ledger.tsv" ] && wc -l < "$W/truths/verify-ledger.tsv" || echo 0 )
  [ "$before" = "$after" ] || bad "refused but still wrote: ledger went from $before to $after line(s)"
  vrun attest verified 2 "$(printf 'a\nb')" m001
  expect_block "may not contain a tab, newline or other control character"
}
block_attest_onto_unterminated_ledger() {
  # An append onto a torn final row would FUSE the two into one row. That torn row is the signature
  # of an attest that died mid-write, so this is the second attest of a crashed pair: it must refuse
  # rather than quietly make the damage unreadable. validate already blocks the mine; this stops the
  # writer from compounding it.
  vrun attest verified 1 standard m001
  printf 't001\t-\tverified\t1\tstandard\t2026-07-01' >> "$W/truths/verify-ledger.tsv"
  vrun attest verified 2 standard t001
  expect_block "no line terminator"
  # ...and the torn row is still exactly as it was — not fused, not repaired behind the user's back.
  OUT=$(tail -c 40 "$W/truths/verify-ledger.tsv"); RC=0
  expect_has "2026-07-01"
}
acct_attest_concurrent_row_survives_rollback() {
  # v0.5.2 (external review P0-1a). The v0.5.1 truncate-back rollback was a COMPENSATING write, and
  # a compensating write without mutual exclusion erases a neighbour's success: attest A appended
  # its row (rc 0) inside attest B's stat-to-truncate window, and B's rollback chopped it — A
  # reported success for a row that no longer existed, and the resulting TSV was well-formed, so
  # validate saw nothing. DETERMINISTIC via the seam: B's injected append holds the critical
  # section for 1.2s before failing; A runs beside it. Under the lock, A waits and lands AFTER B's
  # verified rollback. Without it (red-first), A lands inside the window and dies.
  vrun attest verified 1 seed m001
  ( cd "$W" && $TO node "$REPO/tests/attest-faultinject.mjs" --sleep-ms 1200 verified 2 bstd t001 ) > "$W/.b.out" 2>&1 &
  local bpid=$!
  sleep 0.4
  vrun attest verified 2 astd m001
  local arc=$RC
  wait "$bpid"; local brc=$?
  [ "$arc" -eq 0 ] || bad "the real attest failed (rc $arc) — the lock wait may be shorter than the injected hold"
  [ "$brc" -ne 0 ] || bad "the injected attest reported success"
  [ "$(grep -c $'\tastd\t' "$W/truths/verify-ledger.tsv")" = 1 ] || bad "A's committed row did not survive B's rollback"
  [ "$(grep -c $'\tseed\t' "$W/truths/verify-ledger.tsv")" = 1 ] || bad "the seed row is gone"
  [ ! -d "$W/truths/verify-ledger.tsv.lock" ] || bad "the lock was not released"
  vrun validate; expect_pass
}
acct_attest_concurrent_new_ledger_survives_unlink() {
  # The fresh-ledger twin (P0-1b), the worse half: B created the ledger, A landed a committed row
  # in it, and B's created-here rollback UNLINKED the whole file — A's rc-0 row went with it. Under
  # the lock, B's create-fail-unlink completes as a unit before A begins, so A creates a fresh
  # ledger and its row survives.
  ( cd "$W" && $TO node "$REPO/tests/attest-faultinject.mjs" --sleep-ms 1200 verified 1 bstd t001 ) > "$W/.b2.out" 2>&1 &
  local bpid=$!
  sleep 0.4
  vrun attest verified 1 astd m001
  local arc=$RC
  wait "$bpid"; local brc=$?
  [ "$arc" -eq 0 ] || bad "the real attest failed (rc $arc)"
  [ "$brc" -ne 0 ] || bad "the injected attest reported success"
  [ -f "$W/truths/verify-ledger.tsv" ] || { bad "the ledger was unlinked with A's committed row inside"; return; }
  [ "$(grep -c $'\tastd\t' "$W/truths/verify-ledger.tsv")" = 1 ] || bad "A's committed row did not survive"
  vrun validate; expect_pass
}
acct_attest_stale_lock_refuses_human_only() {
  # NO AUTOMATIC RECLAIM (review #6, replacing the v0.5.2 first cut's age-based one). The reclaim
  # was measured STEALING the lock from a slow-but-alive holder — no age threshold can tell a
  # corpse from a suspended process or a sleeping laptop — so a leftover lock now refuses every
  # writer until a HUMAN removes it, and the refusal says exactly that. Aged with touch -d to
  # prove age buys nothing anymore. Red vs the reclaiming runtime: it reclaims and passes.
  # THE FIXTURE IS A REAL CRASH SHAPE (v0.5.4, review #8 P2): a crashed writer leaves the OWNER
  # MARKER inside the directory, and this case used to plant a bare one — which is how the refusal
  # went on telling users to do something (`rmdir`) that fails on the real thing, unnoticed.
  mkdir -p "$W/truths/verify-ledger.tsv.lock"
  printf 'a-nonce-from-the-crashed-run' > "$W/truths/verify-ledger.tsv.lock/owner"
  touch -d '1 hour ago' "$W/truths/verify-ledger.tsv.lock"
  vrun attest verified 1 std m001
  expect_block "NEVER be reclaimed automatically"
  expect_has "delete that path AND ITS CONTENTS"
  expect_has "Nothing written"
  [ -d "$W/truths/verify-ledger.tsv.lock" ] || bad "the refusal removed a lock it promised never to touch"
  [ -f "$W/truths/verify-ledger.tsv.lock/owner" ] || bad "the refusal ate the owner marker"
  [ ! -f "$W/truths/verify-ledger.tsv" ] || bad "a ledger appeared despite the refusal"
  # The instruction must be TRUE: an empty-directory removal does NOT clear a real crash lock...
  rmdir "$W/truths/verify-ledger.tsv.lock" 2>/dev/null && bad "the message's premise is false: rmdir cleared a marked lock"
  # ...and the documented recovery does — after which the same attest lands.
  rm -rf "$W/truths/verify-ledger.tsv.lock"
  vrun attest verified 1 std m001
  expect_pass
  [ ! -d "$W/truths/verify-ledger.tsv.lock" ] || bad "the lock survived a successful attest"
}
acct_attest_lock_worn_by_alien_object_refuses() {
  # The lock path occupied by something that is NOT a lock directory — a FILE wearing the name, or
  # a directory with residue inside. Under the first cut these were the UNBOUNDED-SPIN shapes (the
  # reclaim's rmdir could never succeed and its `continue` skipped the bound — measured rc 124 at
  # 100% CPU, both platforms, cold review CRITICAL). With no reclaim there is nothing to spin on:
  # mkdir says EEXIST for both shapes on every platform (measured), so they ride the bounded wait
  # into the same human-only refusal, file intact, nothing written.
  # Red vs the reclaiming runtime: it answers with its own "cannot be removed (ENOTEMPTY)" story.
  mkdir -p "$W/truths/verify-ledger.tsv.lock"
  touch "$W/truths/verify-ledger.tsv.lock/residue"
  touch -d '1 hour ago' "$W/truths/verify-ledger.tsv.lock"
  vrun attest verified 1 std m001
  expect_block "NEVER be reclaimed automatically"
  expect_has "Nothing written"
  [ -f "$W/truths/verify-ledger.tsv.lock/residue" ] || bad "the refusal touched the alien object"
  [ ! -f "$W/truths/verify-ledger.tsv" ] || bad "a ledger appeared despite the refusal"
}
acct_attest_slow_holder_not_stolen() {
  # THE review-#6 P0-1 regression: a LIVE holder past the old 10s threshold. B's injected append
  # holds the critical section for 13s; A enters at 10.6s — under the first cut A reclaimed B's
  # live lock, committed rc 0, and B's rollback then CHOPPED A's committed row (measured:
  # astd_rows=0 with arc=0; on a fresh ledger B's unlink took the whole file). With no reclaim, A
  # waits its bounded 5s, meets B's release at ~13s, and lands AFTER B's verified rollback — both
  # rows of the story survive. Slow by construction (~14s): it is the only case that buys this.
  vrun attest verified 1 seed m001
  ( cd "$W" && node "$REPO/tests/attest-faultinject.mjs" --sleep-ms 13000 verified 2 bstd t001 ) > "$W/.b.out" 2>&1 &
  local bpid=$!
  sleep 10.6
  vrun attest verified 2 astd m001
  local arc=$RC
  wait "$bpid"; local brc=$?
  [ "$arc" -eq 0 ] || bad "the real attest failed (rc $arc) — its bounded wait should span the holder's release"
  [ "$brc" -ne 0 ] || bad "the injected attest reported success"
  [ "$(grep -c $'\tastd\t' "$W/truths/verify-ledger.tsv")" = 1 ] || bad "A's committed row did not survive — the live lock was stolen"
  [ "$(grep -c $'\tseed\t' "$W/truths/verify-ledger.tsv")" = 1 ] || bad "the seed row is gone"
  [ ! -d "$W/truths/verify-ledger.tsv.lock" ] || bad "the lock was not released"
  vrun validate; expect_pass
}
acct_attest_ledger_accumulates_in_order() {
  # A REGRESSION GUARD, and it passes against the old writer too — said plainly because a case that
  # cannot fail on the change it accompanies is not evidence for that change, and this suite has
  # twice been fooled by one that looked like it was. What it pins is the INVARIANT the rewrite must
  # not break: rows accumulate, the header survives, and order is preserved (order decides which row
  # `LAST row per id wins` selects, so a writer that reordered would change verdicts silently).
  #
  # The change it accompanies — appending instead of read-whole-then-rewrite — closes two holes the
  # suite cannot reach, and they are not equally proven:
  #   MEASURED. A read fault on an EXISTING ledger. Old writer, as an unprivileged user against a
  #   chmod-000 ledger: rc 0, "attest: verified — R2 …", and the earlier row COUNT WENT 1 -> 0. It
  #   reported success while deleting the verification history. New writer: rc 1, refuses, row
  #   survives. Not testable here — the harness runs as root in the container, where chmod does not
  #   bind.
  #   NOT REPRODUCED. The lost update between two concurrent attests. Read-then-rewrite is a
  #   lost-update pattern by construction, but two short-lived node processes did not interleave in
  #   the critical section when tried, so this is an argument from the code's shape, not a
  #   measurement. Appending removes the pattern either way; a race in a suite would be a flake
  #   generator, so it is not pinned here.
  vrun attest verified 1 first m001
  vrun attest verified 2 second t001
  vrun attest verified 3 third m001
  local f="$W/truths/verify-ledger.tsv"
  grep -q '^# machine-owned' "$f" || bad "header lost"
  [ "$(grep -c '	first	' "$f")" = 1 ] || bad "the first round's row did not survive later attests"
  [ "$(grep -c '	second	' "$f")" = 1 ] || bad "the second round's row did not survive"
  # Order matters: LAST row per id wins, so a rewrite that reordered would change which one does.
  [ "$(grep -n '	third	' "$f" | cut -d: -f1)" -gt "$(grep -n '	first	' "$f" | cut -d: -f1)" ] \
    || bad "the newer m001 row is not after the older one — 'last row per id wins' would pick the wrong one"
  vrun scope; expect_has "1 verified (digest-bound)"
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
  # An unsealed review cannot drive the consecration path — seal first. (The fixture review is
  # auto-sealed since v0.3.1, so the tamper is applied explicitly.)
  strip_seal "$W/documents/d1/review.md"
  vrun consecrate d1
  expect_block "unsealed review"
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
block_consecrate_validate_fail_final_unremovable() {
  # FAULT INJECTION (v0.3.6). The abort and mv-failure branches both verify a postcondition before
  # dropping the in-flight marker; the validate-failure branch did not. It trusted `rm -rf "$fin"`,
  # and on a FIRST-EVER consecration (no original, so nothing to restore) it removed the marker
  # without ever looking at the final slot. When the removal fails, the rejected UNVALIDATED
  # candidate keeps the final name and the one artifact that would have told anyone is gone.
  rm -f "$W/documents/d1/final.md"                    # first-ever consecration: no original, no backup
  printf '개정판. <!-- t:t001 -->\n' > "$W/documents/d1/draft.md"
  vrun seal-review d1 draft
  rm -f "$W/truths/index.md"                          # fails validate AFTER staging — outside the context manifest
  # node:fs cannot be reached by a PATH shim, so the removal is an injectable operation with a real
  # default and this driver is the only caller that passes anything else — no runtime switch, no
  # environment channel. (The bash arm used a PATH shim for `rm`; it went with the bash runtime in
  # bundle 2026-08-05.3, and the invariant below is unchanged.)
  OUT=$( ( cd "$W" && $TO node "$REPO/tests/consecrate-faultinject.mjs" d1 documents/d1/final.md ) 2>&1 ); RC=$?
  [ "$RC" -eq 0 ] && bad "consecrate reported success after the full validation failed"
  expect_has "UNVALIDATED"
  # Last, so this message is the one that surfaces: the marker is the whole postcondition.
  [ -e "$W/documents/d1/.consecrate.inflight" ]     || bad "in-flight marker removed while the final slot still held the rejected candidate"
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
block_completeness_kind_typo_open() {
  # v0.5.1 external review P1-6. `gaps.enum.kind` sat in the schema while nothing read it — the
  # declared-but-unread class the schema's own header warns about. A typo'd kind under Open used to
  # block only as an ordinary open gap (the safe direction, but the wrong diagnosis); it is named
  # as a vocabulary violation now, with the enum in the message.
  req_completeness
  printf '# Open\n\n- [declraed] m001 — 오타 kind — 근거\n\n# Accepted\n' > "$W/gaps.md"
  vrun validate
  expect_block "kind '[declraed]' is not in the vocabulary"
}
block_completeness_kind_typo_accepted() {
  # The dangerous direction: under Accepted a typo'd kind used to pass SILENTLY — a decision nobody
  # made about a kind that does not exist, invisible until its re-surface triggers never fired.
  req_completeness
  printf '# Open\n\n# Accepted\n\n- [declraed] m001 — 오타 kind — scope: x — recheck: y — as-of: t001\n' > "$W/gaps.md"
  vrun validate
  expect_block "kind '[declraed]' is not in the vocabulary"
}
pass_completeness_kind_conf_suffix() {
  # The guard against over-reach: every real kind still passes, including alongside the documented
  # `conf:` suffix, and the placeholder bullet (`- [<kind>]`) is still template noise, not a typo.
  req_completeness
  printf '# Open\n\n# Accepted\n\n- [symmetry] KnockOne — 의도적 얕음 — scope: KnockOne — recheck: 상세 truth 추가 시 — as-of: t060\n- [enumeration] 목록 — 의도 — scope: x — recheck: y — as-of: t001\n' > "$W/gaps.md"
  vrun validate; expect_pass
}
block_completeness_accepted_prose() {
  # The external review's finding, verbatim: under `required`, prose that is not a bullet and
  # carries none of the entry's fields sat under '# Accepted' and validate PASSED. The register
  # grammar is documented fail-closed — "anything else blocks" — but the scanner only ever ran over
  # '# Open', so the twin section accepted anything. One scanner now, called twice.
  req_completeness
  printf '# Open\n\n# Accepted\n\nprose with no bullet and none of the fields at all\n' > "$W/gaps.md"
  vrun validate; expect_block "'# Accepted' holds a line the register grammar cannot read"
}
block_completeness_accepted_orphan_continuation() {
  # The state-based half of the same grammar: an indented line is a continuation only UNDER a
  # bullet. Orphaned, it is a decision nobody can point at — the Accepted twin of the rule '# Open'
  # has had since v0.3.3.
  req_completeness
  printf '# Open\n\n# Accepted\n\n  계속 줄인데 위에 항목이 없다\n' > "$W/gaps.md"
  vrun validate; expect_block "'# Accepted' holds a line the register grammar cannot read"
}
pass_completeness_accepted_continuation_under_bullet() {
  # ...and the shape that must NOT block, so the rule above cannot drift into refusing legitimate
  # multi-line accepted entries. Same fixture family, one indent level, a real bullet above it.
  req_completeness
  printf '# Open\n\n# Accepted\n\n- [declared] m001 — 부속서 없음 — scope: 위약 — recheck: 입수 시 — as-of: t001\n  이어지는 설명 줄\n' > "$W/gaps.md"
  vrun validate; expect_pass
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
  sed -i 's/^version: 1$/version: 3/' "$W/project.md"
  sed -i 's/^version: 1/version: 3/' "$W/.weavedoc/config.yaml"
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
  sed -i 's/^version: 1$/version: 2/' "$W/project.md"
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
  ( cd "$W" && "${WDRUN[@]}" reindex >/dev/null 2>&1 )
}
acct_upgrade_uptodate() {
  # Idempotence starts at the reader: right after an apply, a re-check reports zero work.
  # (The pristine fixture is a v1 mine on purpose, so "up to date" is the post-apply state.)
  vrun upgrade --apply
  expect_pass
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
acct_retag_readonly_target_no_partial_state() {
  # §9's fault condition ("write failure injection leaves no partial state"), asserted as the DUAL
  # OUTCOME it actually promises: fully-before with rc!=0, or fully-after with rc==0 — never half.
  # Before §11 2026-08-05 the node runtime failed this exact probe: EACCES escaped mid-loop, t001
  # kept the new tag, project.md kept the old one, and the backup dir sat abandoned (measured).
  sed -i 's/^required_tags: \[\]$/required_tags: [위약]/' "$W/project.md"
  chmod 444 "$W/project.md" 2>/dev/null
  vrun retag 위약 벌칙
  local rc=$RC t r
  chmod 644 "$W/project.md" 2>/dev/null
  t=$(grep -m1 '^tags:' "$W/truths/t001.md"); r=$(grep -m1 '^required_tags:' "$W/project.md")
  local p; p=$(grep -m1 '^scope_tags:' "$W/documents/d1/plan.md")
  if [ "$rc" -eq 0 ]; then
    { [ "$t" = 'tags: [벌칙]' ] && [ "$r" = 'required_tags: [벌칙]' ] && [ "$p" = 'scope_tags: [벌칙]' ]; } || bad "rc 0 but not fully-after: t001='$t' project='$r' plan='$p'"
  else
    { [ "$t" = 'tags: [위약]' ] && [ "$r" = 'required_tags: [위약]' ] && [ "$p" = 'scope_tags: [위약]' ]; } || bad "rc $rc but not fully-before: t001='$t' project='$r' plan='$p'"
  fi
  [ -z "$(ls -d "$W"/.retag-bak.* 2>/dev/null)" ] || bad "backup dir left behind"
  ok
}
acct_retag_write_fault_rolls_back() {
  # Nth-write failure, injected through the operation seam (a PATH shim cannot reach node:fs):
  # truths rewrite first, project.md second, and the fault lands on the SECOND write — so the
  # boundary is entered with real half-applied state to roll back. Fully-before, rc!=0, no backup
  # left, and the rollback is VERIFIED (byte equality), not assumed.
  sed -i 's/^required_tags: \[\]$/required_tags: [위약]/' "$W/project.md"
  OUT=$( ( cd "$W" && $TO node "$REPO/tests/retag-faultinject.mjs" 위약 벌칙 project.md ) 2>&1 ); RC=$?
  [ "$RC" -eq 0 ] && bad "retag reported success around an injected write failure"
  expect_has "rolled back"
  [ "$(grep -m1 '^tags:' "$W/truths/t001.md")" = 'tags: [위약]' ] || bad "t001 tags not restored"
  [ "$(grep -m1 '^required_tags:' "$W/project.md")" = 'required_tags: [위약]' ] || bad "project required_tags changed"
  # The THIRD write surface too (cold review 2026-08-05): the code's postcondition covers plan.md,
  # and an assertion that named only two surfaces would pass a half-state on the third.
  [ "$(grep -m1 '^scope_tags:' "$W/documents/d1/plan.md")" = 'scope_tags: [위약]' ] || bad "plan scope_tags changed"
  [ -z "$(ls -d "$W"/.retag-bak.* 2>/dev/null)" ] || bad "backup dir left after a verified rollback"
}
acct_retag_rollback_fault_preserves_backup() {
  # The write fails AND the rollback's restore fails for the file that was already rewritten. The
  # one honest outcome: keep the backup, name what could not be restored, refuse to say "as
  # before". Deleting the backup here would be the only copy of the original going with it.
  sed -i 's/^required_tags: \[\]$/required_tags: [위약]/' "$W/project.md"
  OUT=$( ( cd "$W" && $TO node "$REPO/tests/retag-faultinject.mjs" 위약 벌칙 project.md t001.md ) 2>&1 ); RC=$?
  [ "$RC" -eq 0 ] && bad "retag reported success around an injected write failure"
  expect_has "rollback INCOMPLETE"
  local b
  b=$(ls -d "$W"/.retag-bak.* 2>/dev/null | head -1)
  [ -n "$b" ] || { bad "backup dir was deleted though the rollback could not be verified"; return; }
  grep -q '위약' "$b/truths__t001.md" || bad "backup does not hold the original t001"
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
  ( cd "$W" && "${WDRUN[@]}" reindex >/dev/null 2>&1 )
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

# ---- v0.3.1 P0 (cold-review findings): seal enforcement, crash safety, fail-closed edges ----
block_gate_v2_unsealed() {
  # THE review-seal bypass: on a v2 mine, deleting the three seal fields and editing the final
  # used to read as "legacy" and pass. A v2 mine has no legacy excuse — absence blocks.
  mk_v2; strip_seal "$W/documents/d1/review.md"
  printf '몰래 한 줄.\n' >> "$W/documents/d1/final.md"
  vrun validate; expect_block "[GATE-UNSEALED]"
}
block_gate_v2_context_seal_stripped() {
  # Deleting ONLY review_context_digest then moving a source must not slip through either.
  mk_v2
  sed -i '/^review_context_digest:/d' "$W/documents/d1/review.md"
  printf '\n제12조 신설.\n' >> "$W/materials/m001/converted.md"
  vrun validate; expect_block "[GATE-UNSEALED]"
}
pass_gate_v2_sealed_clean() {
  # The v2 happy path pinned from the pass side: a properly sealed schema-2 mine validates
  # clean and counts its seal digest-bound — the block cases above only prove rejection.
  mk_v2
  vrun validate; expect_pass
  expect_has "1 digest-bound"
}
pass_consecrate_v2_e2e() {
  # The v2 consecration spine: sealed draft → consecrate → one full validation → promoted, no
  # transaction residue, and the sealed validate stays green afterwards.
  mk_v2
  vrun consecrate d1
  expect_pass
  expect_has "full validation: 1 run"
  [ -e "$W/documents/d1/.consecrate.inflight" ] && bad "in-flight marker left behind"
  [ -e "$W/documents/d1/.final.bak" ] && bad "backup left behind"
  vrun validate; expect_pass
  expect_has "1 digest-bound"
}
block_gate_v2_seal_next_to_marker() {
  # A full seal and the migration marker on ONE review: seal-review removes the marker when a
  # real round seals, so coexistence is tamper (a hand-added marker parked as a future demotion
  # path — strip the seal later and the review reads as "legacy"). Blocked while the seal stands.
  mk_v2
  sed -i '1a review_legacy: 2026-01-01' "$W/documents/d1/review.md"
  vrun validate; expect_block "[GATE-SEAL-MARKER]"
}
pass_seal_review_strips_marker() {
  # Re-sealing a migrated review ends its legacy status: the marker says "v1 history, digest-less
  # by definition" and a fresh seal makes that sentence false. seal-review removes it.
  sed -i 's/^version: 1$/version: 2/' "$W/project.md"
  sed -i 's/^version: 1/version: 2/' "$W/.weavedoc/config.yaml"
  sed -i '1a review_legacy: 2026-01-01' "$W/documents/d1/review.md"
  vrun seal-review d1 draft
  expect_has "reviewed_digest"
  OUT=$(cat "$W/documents/d1/review.md"); RC=0
  expect_hasnt "review_legacy"
  vrun validate; expect_pass
}
block_gate_v2_kind_missing() {
  # The seal is a TUPLE: deleting only reviewed_kind must read as a partial seal, not as a seal.
  mk_v2
  sed -i '/^reviewed_kind:/d' "$W/documents/d1/review.md"
  vrun validate; expect_block "[GATE-UNSEALED]"
}
block_gate_v2_kind_invalid() {
  # reviewed_kind outside draft|final is a seal validate cannot interpret — malformed, not green.
  mk_v2
  sed -i 's/^reviewed_kind: draft$/reviewed_kind: banana/' "$W/documents/d1/review.md"
  vrun validate; expect_block "[GATE-UNSEALED]"
}
pass_gate_v1_unsealed_is_legacy() {
  # The dual-reader stays: a genuine v1 mine with an unsealed review is legacy-unbound, counted
  # and shown, never blocking — the v2 block above is what distinguishes tamper from history.
  strip_seal "$W/documents/d1/review.md"
  vrun validate
  expect_pass
  expect_has "1 legacy-unbound"
}
block_gate_context_quoted_citations() {
  # cited_truths: ["t001"] — the quoted spelling. The context parser dropped the quotes' ids
  # silently, so a cited truth could move without staling the review.
  sed -i 's/^cited_truths: \[t001\]$/cited_truths: ["t001"]/' "$W/documents/d1/plan.md"
  ( cd "$W" && "${WDRUN[@]}" seal-review d1 draft >/dev/null 2>&1 )
  sed -i 's/^claim: "위약금은 계약금액의 10%다"$/claim: "위약금은 계약금액의 11%다"/' "$W/truths/t001.md"
  vrun validate; expect_block "review context changed"
}
block_gate_dual_final() {
  # final.md AND final/ at once: only one was digest-checked, so the other could carry
  # unreviewed bytes. Ambiguity blocks.
  mkdir -p "$W/documents/d1/final"
  printf '# 몰래\n' > "$W/documents/d1/final/01.md"
  vrun validate; expect_block "both final.md and final/"
}
block_completeness_malformed_register() {
  # required + a gaps.md with no readable Open section = a register that never ran, wearing a
  # filename. Fail-closed, same as the missing-file rule.
  req_completeness
  printf '메모만 있는 파일.\n' > "$W/gaps.md"
  vrun validate; expect_block "no readable"
}
block_consecrate_interrupted_detected() {
  # A leftover .final.bak means an earlier consecration died mid-validate: the final slot may
  # hold an UNVALIDATED candidate and the backup is the only original. Re-running used to delete
  # that backup first — now it refuses until a human restores or clears.
  rm -f "$W/documents/d1/final.md"
  ( cd "$W" && "${WDRUN[@]}" seal-review d1 draft >/dev/null 2>&1 )
  printf '원본 final이었던 것\n' > "$W/documents/d1/.final.bak"
  vrun consecrate d1
  expect_block "interrupted"
  OUT=$(cat "$W/documents/d1/.final.bak"); RC=0
  expect_has "원본 final이었던 것"
}

block_completeness_prose_gap() {
  # A real gap written as prose under '# Open': the bullet counter reads 0 and the register
  # passed while holding exactly the debt it exists to surface. Grammar the machine cannot
  # count is a malformed register, not zero open gaps.
  req_completeness
  printf '# Open\n\n대금 조항 정보가 부족함 — bullet이 아닌 산문 기록\n\n# Accepted\n' > "$W/gaps.md"
  vrun validate; expect_block "[COMP-MALFORMED]"
}
block_completeness_dup_open() {
  # Two '# Open' headings, gaps under the second: the counter read only the first (empty) and
  # passed. A duplicated register section splits the ledger — blocked as malformed.
  req_completeness
  printf '# Open\n\n# Open\n\n- [declared] m001 — 대금 조항 미완성 — "미정" 표기\n\n# Accepted\n' > "$W/gaps.md"
  vrun validate; expect_block "[COMP-MALFORMED]"
}
block_completeness_open_gap_with_continuation() {
  # An indented continuation line under a bullet is legal grammar — the entry still counts as
  # ONE open gap (COMP-OPEN-GAPS), and the continuation must not read as malformed prose.
  req_completeness
  printf '# Open\n\n- [declared] m001 — 대금 조항 미완성 — "미정" 표기\n  후속: 부속서 2에서 재확인 필요\n\n# Accepted\n' > "$W/gaps.md"
  vrun validate; expect_block "[COMP-OPEN-GAPS]"
  expect_hasnt "[COMP-MALFORMED]"
}
block_completeness_placeholder_bullet_real_continuation() {
  # The hole the noise filter left open (v0.3.6): "is this template noise?" was decided per BULLET,
  # so an entry that kept the shipped placeholder bullet and wrote its real content in the indented
  # continuation counted as ZERO. The continuation belongs to the ENTRY — the register passed while
  # holding exactly the debt it exists to surface, which is the shape `required` is bought for.
  req_completeness
  cat > "$W/gaps.md" <<'EOF'
# Open

- [{kind}] {where} — {what's missing} — {evidence/pattern}
  m001 대금 조항이 "미정"으로 남아 있음

# Accepted
EOF
  vrun validate; expect_block "[COMP-OPEN-GAPS]"
}
pass_completeness_placeholder_bullet_placeholder_continuation() {
  # Attacks the FIX, not the bug: a continuation that is itself template text must stay noise. The
  # entry-level rule judges the REMAINDER with the bullet rule's own spelling — a second, looser
  # spelling here would block every freshly-initialised multi-line register on a gap that isn't there.
  req_completeness
  cat > "$W/gaps.md" <<'EOF'
# Open

- [{kind}] {where} — {what's missing} — {evidence/pattern}
  {follow-up} — {as-of}

# Accepted
EOF
  vrun validate; expect_pass
}
acct_completeness_noise_bullet_counts_once() {
  # Attacks the FIX from the other side: an entry is ONE gap however many continuations carry its
  # content. Counting per line would report 2, and the number is the thing a human acts on.
  req_completeness
  cat > "$W/gaps.md" <<'EOF'
# Open

- [{kind}] {where} — {what's missing} — {evidence/pattern}
  m001 대금 조항이 "미정"으로 남아 있음
  부속서 2도 아직 확보되지 않음

# Accepted
EOF
  vrun validate
  expect_has "holds 1 open gap(s)"
}
pass_completeness_comment_in_open() {
  # HTML comments are audit history, not entries — an Open section holding only a comment is a
  # clean register (the same nocomment rule every other ledger reader applies).
  req_completeness
  printf '# Open\n\n<!-- 2026-08-01 감사에서 정리 — 남은 항목 없음 -->\n\n# Accepted\n' > "$W/gaps.md"
  vrun validate; expect_pass
}
block_completeness_indented_prose_gap() {
  # A whole gap written INDENTED, with no bullet above it: the continuation tolerance read it as
  # a continuation of nothing and the register passed. Continuations are legal only AFTER a
  # bullet — an indented line with no open entry above is prose the counter cannot see.
  req_completeness
  printf '# Open\n\n  대금 조항 자료가 부족함 — 들여쓴 산문\n\n# Accepted\n' > "$W/gaps.md"
  vrun validate; expect_block "[COMP-MALFORMED]"
}
block_completeness_placeholder_kind_gap() {
  # countlines' KNOWN LIMIT became load-bearing under `required`: a REAL gap whose kind slot
  # kept placeholder brackets (`- [<reference>] …`) was dropped by the placeholder filter and
  # counted zero. The remainder decides (same ruling as review entries): filled prose = entry.
  req_completeness
  printf -- '- [<reference>] t001 — 근거 조항이 정의되지 않음 — 제3조가 언급만 됨\n' > "$W/.gapline"
  printf '# Open\n\n%s\n\n# Accepted\n' "$(cat "$W/.gapline")" > "$W/gaps.md"; rm -f "$W/.gapline"
  vrun validate; expect_block "[COMP-OPEN-GAPS]"
}
pass_completeness_template_stub_open() {
  # The untouched template line stays noise: every slot is still a placeholder, so a freshly
  # initialised register must not read as one open gap.
  req_completeness
  printf '# Open\n\n- [{kind}] {where} — {what is missing} — {evidence}\n\n# Accepted\n' > "$W/gaps.md"
  vrun validate; expect_pass
}
block_completeness_unterminated_comment() {
  # An unclosed '<!--' blanks everything after it before the counter reads a line — gaps hidden
  # behind it vanished. The same comment_balanced rule review.md already has.
  req_completeness
  printf '# Open\n\n<!-- 정리 중\n- [declared] m001 — 대금 조항 미완성 — "미정"\n\n# Accepted\n' > "$W/gaps.md"
  vrun validate; expect_block "[COMP-MALFORMED]"
}
block_completeness_missing_accepted() {
  # The register format is two sections; a file without '# Accepted' is not the register the
  # gaps skill writes — fail-closed like the missing-Open case.
  req_completeness
  printf '# Open\n' > "$W/gaps.md"
  vrun validate; expect_block "[COMP-MALFORMED]"
}
acct_upgrade_fmless_review() {
  # A genuine v0.1 review may carry NO frontmatter block at all. The migration scan promised a
  # review_legacy marker its apply could not insert (the awk keyed on an opening '---'), so
  # post-validate hit GATE-UNSEALED and rolled the whole migration back — such a mine was
  # permanently unmigratable. Apply now prepends a fresh frontmatter block instead.
  mkv1
  printf '# Fidelity violations\n\n# Findings\n\n# Adjudications\n\n# Human queue\n' > "$W/documents/d1/review.md"
  vrun upgrade --apply
  expect_pass
  OUT=$(cat "$W/documents/d1/review.md"); RC=0
  expect_has "review_legacy"
  vrun validate; expect_pass
}
block_consecrate_dual_final() {
  # final.md AND final/ at once: doc_final_path resolves the directory, so the old code moved
  # final/ aside, overwrote final.md with the candidate (no backup), validated a mine where the
  # dual state had vanished, then deleted the backup — BOTH prior artifacts destroyed, exit 0.
  # Consecrate now refuses before its first write, same reading as GATE-DUAL-FINAL.
  ( cd "$W" && "${WDRUN[@]}" seal-review d1 draft >/dev/null 2>&1 )
  mkdir -p "$W/documents/d1/final"
  printf '보존되어야 할 디렉터리 산출물\n' > "$W/documents/d1/final/01.md"
  vrun consecrate d1
  expect_block "both final.md and final/"
  OUT=$(cat "$W/documents/d1/final.md"); RC=0
  expect_has "위약금은 계약금액의 10%다"
  OUT=$(cat "$W/documents/d1/final/01.md"); RC=0
  expect_has "보존되어야 할 디렉터리 산출물"
}
acct_scope_short_row_covers_nothing() {
  # scope read any ≥3-column row while validate demanded six — a truncated attest row counted
  # digest-bound verified in scope while validate blocked the mine (two parsers, one ledger).
  # The strict row filter is shared now: a structurally malformed row covers nothing ANYWHERE,
  # and scope names it instead of silently absorbing it.
  vrun attest verified 2 standard t001
  sed -i -E 's/^(t001\t[0-9a-f]{64}\tverified)\t.*$/\1/' "$W/truths/verify-ledger.tsv"
  vrun scope
  expect_has "0 verified (digest-bound)"
  expect_has "[LEDGER-MALFORMED]"
}
block_ledger_short_row() {
  # attest writes all six columns; a three-column row is a hand edit the reader cannot trust.
  # It used to pass (the check stopped at "at least id·digest·verdict").
  printf 't001\tabc\tverified\n' > "$W/truths/verify-ledger.tsv"
  vrun validate; expect_block "[LEDGER-MALFORMED]"
}
block_ledger_bad_digest() {
  # A digest column that is neither 64-hex nor '-' binds nothing — scope would read it as
  # "stale" (fail-safe), but validate must name the malformation instead of letting a garbage
  # hash wear the shape of evidence.
  printf 't001\tnotahash\tverified\t2\tstandard\t2026-08-01\n' > "$W/truths/verify-ledger.tsv"
  vrun validate; expect_block "[LEDGER-MALFORMED]"
}
block_ledger_bad_date() {
  printf 't001\t-\tlegacy-unbound\t-\t-\t2026-13-99\n' > "$W/truths/verify-ledger.tsv"
  vrun validate; expect_block "[LEDGER-MALFORMED]"
}
acct_upgrade_mid_not_material_evidence() {
  # WD-COR-001 held through migration: the pristine Verified units row names m001, but that
  # ledger is the TRUTHS lane (extraction scope) — the conversion verdict lives only in the
  # material's own frontmatter, and m001 here says `status: converted`. The 0.3.1 migration
  # minted a legacy row from the mention anyway, demoting mandatory verification debt into
  # non-blocking legacy backlog. Post-apply, m001 must still be OWED.
  vrun upgrade --apply
  expect_pass
  vrun scope
  expect_has "materials  1 converted · 0 verified (digest-bound) · 0 legacy-unbound"
  expect_has "1 unverified"
  vrun validate; expect_pass
}
acct_upgrade_material_fm_verified_migrates() {
  # The correct material source: v1 `status: verified` IS conversion history, and it must gain
  # a ledger row (with its origin recorded) or a later `used` stamp erases the evidence.
  sed -i 's/^status: converted$/status: verified/' "$W/materials/m001/converted.md"
  vrun upgrade --apply
  expect_pass
  OUT=$(cat "$W/truths/verify-ledger.tsv"); RC=0
  expect_has "v1-material-frontmatter"
  vrun scope
  expect_has "materials  1 converted · 0 verified (digest-bound) · 1 legacy-unbound"
}
acct_upgrade_resume_after_031_rows() {
  # Resuming a migration that a 0.3.1 runtime started: the origin-less m-id row it left behind
  # sat in the coverage set and blocked the CORRECT material-origin row from ever being minted.
  # Coverage is per-lane now — an m row covers the material lane only when it is valid material
  # evidence (origin token or a real verdict).
  sed -i 's/^status: converted$/status: verified/' "$W/materials/m001/converted.md"
  printf 'm001\t-\tlegacy-unbound\t-\t-\t2026-08-01\n' > "$W/truths/verify-ledger.tsv"
  vrun upgrade --apply
  expect_pass
  OUT=$(cat "$W/truths/verify-ledger.tsv"); RC=0
  expect_has "v1-material-frontmatter"
}
block_sealreview_dashnote_fm() {
  # `---note` satisfied the loose `^---` precheck while the strict awk never entered the
  # frontmatter — seal-review printed digests and a success line WITHOUT writing a seal.
  sed -i '1s/^---$/---note/' "$W/documents/d1/review.md"
  vrun seal-review d1 draft
  expect_block "no frontmatter"
}
block_sealreview_unclosed_fm_keeps_the_seal() {
  # The SIBLING of the case above, and the worse half. `---note` fails the opening precheck; a block
  # that OPENS correctly and never CLOSES sailed past it, and then the insertion loop — which puts
  # the three fields in just before the closing fence, dropping any earlier spelling on the way —
  # never found a fence. So it dropped every seal line and inserted none, printed the digests it had
  # just failed to write, and exited 0. Measured: a review that HELD a valid seal came out with
  # NONE. A seal binds a clean review to the bytes it reviewed; deleting one while reporting success
  # is the worst direction this command can fail in.
  vrun seal-review d1 draft; expect_pass
  local before after
  before=$(grep -c '^reviewed_\|^review_context_' "$W/documents/d1/review.md")
  [ "$before" = 3 ] || { bad "fixture never got a seal ($before fields) — the case would prove nothing"; return; }
  # remove the CLOSING fence only
  awk 'NR==1{print;next} !d && /^---[ \t]*$/ {d=1;next} {print}' "$W/documents/d1/review.md" > "$W/t" && mv "$W/t" "$W/documents/d1/review.md"
  vrun seal-review d1 draft
  expect_block "frontmatter block never closes"
  after=$(grep -c '^reviewed_\|^review_context_' "$W/documents/d1/review.md")
  [ "$before" = "$after" ] || bad "refused but still edited the file: seal fields went $before -> $after"
}
acct_reindex_partial_rename_rolls_back() {
  # Staging BOTH views before renaming EITHER is not enough: with tree.md unreplaceable the first
  # rename still landed, so index.md was regenerated beside an untouched tree.md — the very split
  # the staging exists to prevent — and the command printed "the staged copies were discarded",
  # which was FALSE about the one that had not been. A message that misreports the state is worse
  # than the state. The first rename is undoable now, and the message says which of the two
  # outcomes actually happened.
  printf 'stale-index\n' > "$W/truths/index.md"
  rm -f "$W/truths/tree.md"; mkdir "$W/truths/tree.md"; printf 'x\n' > "$W/truths/tree.md/inside"
  vrun reindex
  expect_block "index.md was rolled back"
  OUT=$(head -1 "$W/truths/index.md"); RC=0
  expect_has "stale-index"
}
acct_consecrate_marker_removal_failure_is_named() {
  # The promotion succeeds, the in-flight marker cannot be removed, and the NEXT validate then fails
  # CONSEC-INTERRUPTED. Swallowing that left a green consecrate beside a red mine with no line
  # connecting them (measured: rc 0, marker present, next validate rc 1). rc STAYS 0 — the final
  # really is the reviewed draft, and failing would send the user to redo work that is done — but
  # the one remaining file is named, in the spelling the backup-removal failure already uses.
  printf '개정판. <!-- t:t001 -->\n' > "$W/documents/d1/draft.md"
  vrun seal-review d1 draft
  OUT=$( ( cd "$W" && $TO node "$REPO/tests/consecrate-faultinject.mjs" d1 .consecrate.inflight ) 2>&1 ); RC=$?
  [ "$RC" -eq 0 ] || bad "consecrate should still report success — the promotion happened (rc $RC)"
  expect_has "in-flight marker could not be removed"
  expect_has "CONSEC-INTERRUPTED"
  [ -e "$W/documents/d1/.consecrate.inflight" ] || bad "the injection did not actually keep the marker — the case would prove nothing"
}
block_upgrade_garbage_version() {
  # `version: banana` skipped the numeric future-check and read as "already at schema 2" with
  # exit 0. The matrix is closed: a record is 1 or the current schema, anything else refuses.
  sed -i 's/^version: 1$/version: banana/' "$W/project.md"
  sed -i 's/^version: 1/version: banana/' "$W/.weavedoc/config.yaml"
  vrun upgrade --check
  expect_block "not a version this migration understands"
}
block_gate_draft_partial_tuple() {
  # Structural seal invariants hold for ANY review, not only next to a final: a draft-stage
  # review with a partial tuple is the same tamper shape one consecration earlier.
  mk_v2
  mkdoc2
  ( cd "$W" && "${WDRUN[@]}" seal-review d2 draft >/dev/null 2>&1 )
  sed -i '/^reviewed_kind:/d' "$W/documents/d2/review.md"
  vrun validate; expect_block "[GATE-UNSEALED]"
}
block_gate_draft_seal_marker() {
  # Marker-next-to-seal is tamper at draft stage too — waiting for the consecration to notice
  # hands the demotion a whole review round to sit undetected.
  mk_v2
  mkdoc2
  ( cd "$W" && "${WDRUN[@]}" seal-review d2 draft >/dev/null 2>&1 )
  sed -i '1a review_legacy: 2026-01-01' "$W/documents/d2/review.md"
  vrun validate; expect_block "[GATE-SEAL-MARKER]"
}
acct_scope_originless_mid_row_ignored() {
  # A 0.3.1-migrated mine already carries origin-less m-id legacy rows — the runtime corrects
  # them fail-safe: not material evidence (the material falls back to its own status and is
  # owed again), and SHOWN, never silently absorbed.
  printf 'm001\t-\tlegacy-unbound\t-\t-\t2026-08-01\n' > "$W/truths/verify-ledger.tsv"
  vrun scope
  expect_has "1 unverified"
  expect_has "pre-0.3.2"
}
acct_scope_tid_originless_grandfathered() {
  # t-id rows keep accepting `-`: the truths lane was always the right lane, so every 0.3.1 t
  # row is correct history. The asymmetry is the fix, not an accident.
  printf 't001\t-\tlegacy-unbound\t-\t-\t2026-08-01\n' > "$W/truths/verify-ledger.tsv"
  vrun scope
  expect_has "truths     1 live · 0 verified (digest-bound) · 1 legacy-unbound"
}
block_validate_inflight_marker() {
  # .consecrate.inflight is the durable trace of a consecration that is running or died hard
  # (SIGKILL/power — no trap runs). While it exists the final slot may hold an unvalidated
  # candidate, and a plain validate must say so instead of green-lighting the mine.
  printf 'started: 2026-08-03\ndoc: d1\n' > "$W/documents/d1/.consecrate.inflight"
  vrun validate; expect_block "[CONSEC-INTERRUPTED]"
}
block_validate_leftover_bak() {
  # .final.bak holds the ONLY original after a mid-validate death. validate used to pass right
  # over it — the mine looked healthy while a transaction sat half-done.
  printf 'x\n' > "$W/documents/d1/.final.bak"
  vrun validate; expect_block "[CONSEC-INTERRUPTED]"
}
block_consecrate_marker_detected() {
  # A first-ever consecration killed hard leaves marker + candidate and NO backup (nothing
  # existed to back up). Re-running must refuse on the marker alone — and the recovery guidance
  # must say COMPARE FIRST: a crash before the swap leaves the ORIGINAL at final, so "remove
  # final" as a blanket instruction deletes the wrong file (third cold review).
  ( cd "$W" && "${WDRUN[@]}" seal-review d1 draft >/dev/null 2>&1 )
  printf 'started: 2026-08-03\ndoc: d1\n' > "$W/documents/d1/.consecrate.inflight"
  vrun consecrate d1
  expect_block "interrupted"
  expect_has "byte-compare"
  [ -e "$W/documents/d1/.consecrate.inflight" ] || bad "refusal removed the marker it refused on"
}
block_validate_env_injection_ignored() {
  # The exemption channel must be a function argument, not a variable: bash imports the caller's
  # environment into shell variables, so `WD_CONSEC_DOC=d1 weavedoc validate` handed the
  # consecrate-only exemption to ANY external caller (third cold review P0-2 — reproduced).
  printf 'started: 2026-08-03\ndoc: d1\n' > "$W/documents/d1/.consecrate.inflight"
  OUT=$( ( cd "$W" && WD_CONSEC_DOC=d1 $TO "${WDRUN[@]}" validate ) 2>&1 ); RC=$?
  expect_block "[CONSEC-INTERRUPTED]"
}
block_consecrate_bad_docid() {
  # A doc id is a plain folder name under documents/ — path fragments must be refused before any
  # filesystem access, not resolved relative to the tree.
  vrun consecrate ../d1
  expect_block "not a document id"
}
acct_consecrate_no_residue() {
  # The clean path leaves nothing behind: final promoted, no marker, no backup — the artifacts
  # exist only while the transaction is genuinely open.
  rm -f "$W/documents/d1/final.md"
  ( cd "$W" && "${WDRUN[@]}" seal-review d1 draft >/dev/null 2>&1 )
  vrun consecrate d1
  expect_pass
  [ -f "$W/documents/d1/final.md" ] || bad "final.md was not created"
  [ -e "$W/documents/d1/.consecrate.inflight" ] && bad "in-flight marker left behind"
  [ -e "$W/documents/d1/.final.bak" ] && bad "backup left behind"
  ok
}
block_upgrade_incomplete_passes() {
  # `passes 1/2` is a run that stopped short. It must not gain a verdict, and apply must not
  # stamp schema 2 over it — unfinished verification stays visible debt, and idempotence holds.
  mkv1
  sed -i 's|passes 2/2|passes 1/2|' "$W/truths/verify.md"
  vrun upgrade --apply
  expect_block "human ruling"
  OUT=$(cat "$W/project.md"); RC=0
  expect_has "version: 1"
}
block_upgrade_pairwise_collision() {
  # t01.md and t1.md both canonicalize to t001 — the second copy would silently overwrite the
  # first in a sequential apply. Caught before one byte moves.
  mkv1
  cp "$W/truths/t1.md" "$W/truths/t01.md"
  sed -i 's/^id: t1$/id: t01/' "$W/truths/t01.md"
  vrun upgrade --apply
  expect_block "both canonicalize"
}
block_upgrade_v2_launder() {
  # THE v0.3.1 laundering path: strip the seals off a schema-2 mine, run upgrade --apply, and the
  # migration stamped review_legacy over the tamper — validate then read it as history. Upgrade
  # is a v1→2 migration and must refuse to touch a mine that is already at schema 2.
  mk_v2
  strip_seal "$W/documents/d1/review.md"
  vrun upgrade --apply
  expect_has "nothing to do"
  OUT=$(cat "$W/documents/d1/review.md"); RC=0
  expect_hasnt "review_legacy"
  vrun validate; expect_block "[GATE-UNSEALED]"
}
block_upgrade_future_schema() {
  # upgrade on a schema NEWER than this runtime is fail-closed, mirroring validate — "already at
  # schema 2" over a v3 mine was a reader guessing at a format it cannot read.
  sed -i 's/^version: 1$/version: 3/' "$W/project.md"
  sed -i 's/^version: 1/version: 3/' "$W/.weavedoc/config.yaml"
  vrun upgrade --check
  expect_block "newer than this runtime"
}
pass_upgrade_resume_mixed() {
  # A crashed apply stamps project before config (stamps are LAST, in that order) — the rescan
  # of that half-stamped mine must still read as a v1 migration, or a crash is unrecoverable.
  sed -i 's/^version: 1$/version: 2/' "$W/project.md"
  vrun upgrade --apply
  expect_pass
  vrun validate; expect_pass
}
acct_upgrade_readonly_target_no_partial_state() {
  # §9's fault condition as the DUAL OUTCOME (fully-before + rc!=0, or fully-after + rc==0). Before
  # §11 2026-08-05 the node runtime failed this probe in the worst shape: EACCES escaped at the
  # version stamp, review_legacy already inserted, version still 1, backup abandoned (measured —
  # the exact mixed state the marker discipline exists to prevent).
  chmod 444 "$W/project.md" 2>/dev/null
  vrun upgrade --apply
  local rc=$RC pv cv
  chmod 644 "$W/project.md" 2>/dev/null
  pv=$(grep -m1 '^version:' "$W/project.md"); cv=$(grep -m1 '^version:' "$W/.weavedoc/config.yaml")
  if [ "$rc" -eq 0 ]; then
    { [ "$pv" = 'version: 2' ] && [ "$cv" = 'version: 2' ]; } || bad "rc 0 but not fully-after: project='$pv' config='$cv'"
    [ -n "$(ls -d "$W"/.upgrade-backup-* 2>/dev/null)" ] || bad "success keeps the backup+manifest dir by design, and it is missing"
  else
    { [ "$pv" = 'version: 1' ] && [ "$cv" = 'version: 1' ]; } || bad "rc $rc but not fully-before: project='$pv' config='$cv'"
    grep -q 'review_legacy' "$W/documents/d1/review.md" && bad "rc $rc but review_legacy marker left stamped"
    [ -z "$(ls -d "$W"/.upgrade-backup-* 2>/dev/null)" ] || bad "failure left the backup dir with rollback claimed complete"
  fi
  ok
}
acct_upgrade_write_fault_rolls_back() {
  # Nth-write failure through the operation seam: the fault lands on the version stamp, so every
  # earlier phase (verify.md verdict words, the materialized ledger, review_legacy markers) has
  # really happened when the boundary fires. Rollback restores the touched, REMOVES the created
  # (the materialized ledger is born in this transaction), and is verified before "rolled back".
  # The verdict word is stripped FIRST so phase 2 genuinely edits verify.md (cold review
  # 2026-08-05) — otherwise the byte-restore assertion below would be guarding an untouched file.
  sed -i 's/ · verified$//' "$W/truths/verify.md"
  grep -q 'passes 2/2$' "$W/truths/verify.md" || { bad "fixture no-op: verify.md row still carries its verdict word"; return; }
  cp "$W/truths/verify.md" "$W/.verify.before"
  OUT=$( ( cd "$W" && $TO node "$REPO/tests/upgrade-faultinject.mjs" project.md ) 2>&1 ); RC=$?
  [ "$RC" -eq 0 ] && bad "upgrade reported success around an injected write failure"
  expect_has "rolled back"
  [ "$(grep -m1 '^version:' "$W/project.md")" = 'version: 1' ] || bad "project version not restored"
  [ "$(grep -m1 '^version:' "$W/.weavedoc/config.yaml")" = 'version: 1' ] || bad "config version not restored"
  grep -q 'review_legacy' "$W/documents/d1/review.md" && bad "review_legacy marker left stamped"
  cmp -s "$W/.verify.before" "$W/truths/verify.md" || bad "verify.md not byte-restored"
  [ ! -f "$W/truths/verify-ledger.tsv" ] || bad "created ledger not removed by rollback"
  [ -z "$(ls -d "$W"/.upgrade-backup-* 2>/dev/null)" ] || bad "backup dir left after a verified rollback"
  ok
}
acct_attest_partial_append_rolls_back() {
  # v0.5.1 external review P1-3. One append call can land SOME bytes and then fail (ENOSPC, a size
  # limit) — and whatever COMPLETE rows landed became real evidence under last-row-wins while the
  # command reported failure: the first id verified, the second not, under one rc 1. All-or-nothing
  # now survives the partial: the size is recorded before, the file truncated back, the truncation
  # VERIFIED — and the case asserts the LEDGER, not just the message.
  vrun attest verified 1 seed m001
  cp "$W/truths/verify-ledger.tsv" "$W/.ledger.before"
  OUT=$( ( cd "$W" && $TO node "$REPO/tests/attest-faultinject.mjs" verified 2 std m001 t001 ) 2>&1 ); RC=$?
  [ "$RC" -eq 0 ] && bad "attest reported success around an injected partial append"
  expect_has "rolled back"
  cmp -s "$W/.ledger.before" "$W/truths/verify-ledger.tsv" || bad "ledger not byte-identical after the rollback — partial rows remain"
  vrun scope
  expect_has "1 verified (digest-bound)"
}
block_reindex_unreadable_index_refuses() {
  # v0.5.1 external review P1-1. An existing index this command cannot read is an index it cannot
  # promise to put back — the read failure used to fold into "no index yet", which handed the undo
  # path the wrong null: after a tree fault, "restore the old bytes" became "delete the file", and
  # the command said "rolled back" over an index it had just destroyed. Refused up front now, while
  # both views are untouched. (The directory spelling of unreadable — chmod does not bind for the
  # container's root; the EACCES branch is the same code, measured by hand as an unprivileged user.)
  rm -f "$W/truths/index.md"; mkdir "$W/truths/index.md"
  vrun reindex
  expect_block "cannot be read"
  [ -d "$W/truths/index.md" ] || bad "the unreadable index was touched"
  OUT=$(head -1 "$W/truths/tree.md"); RC=0
  expect_has "#"
}
acct_retag_rollback_resync_failure_named() {
  # v0.5.1 external review P1-2. The rollback's own re-sync used to run unchecked, and the message
  # still said "indexes re-synced" — combine a write fault with an index fault and the command
  # claimed a sync that never happened. The restored tag files are byte-verified either way; what
  # changes is the SENTENCE, which now says the re-sync failed and what to run.
  sed -i 's/^required_tags: \[\]$/required_tags: [위약]/' "$W/project.md"
  rm -f "$W/truths/index.md"; mkdir "$W/truths/index.md"
  vrun retag 위약 벌칙
  expect_block "index re-sync itself failed"
  [ "$(grep -m1 '^tags:' "$W/truths/t001.md")" = 'tags: [위약]' ] || bad "t001 tags not restored"
  [ -z "$(ls -d "$W"/.retag-bak.* 2>/dev/null)" ] || bad "backup dir left behind"
}
acct_upgrade_copy_fault_leaves_no_partial() {
  # v0.5.1 external review P1-4. Registration is INTENT, and intent must be on the rollback list
  # before the first byte that acts on it. In the old order — copy, delete old, then register — a
  # copy that died partway left a half-made new path rollback did not know about: the old came back
  # from its snapshot and the partial new sat BESIDE it. `crtd` now precedes the copy, so the
  # half-made path is removed like anything else the transaction created.
  mv "$W/truths/t001.md" "$W/truths/t01.md"
  OUT=$( ( cd "$W" && $TO node "$REPO/tests/upgrade-faultinject.mjs" - - t001.md ) 2>&1 ); RC=$?
  [ "$RC" -eq 0 ] && bad "upgrade reported success around an injected partial copy"
  expect_has "rolled back"
  [ -f "$W/truths/t01.md" ] || bad "the old path was not restored"
  [ ! -e "$W/truths/t001.md" ] || bad "the half-made new path survived the rollback"
  [ -z "$(ls -d "$W"/.upgrade-backup-* 2>/dev/null)" ] || bad "backup dir left after a verified rollback"
}
acct_upgrade_rm_fault_leaves_no_partial() {
  # The removal twin: the copy landed whole, the OLD path refuses to go. Old order registered the
  # new path only after this point, so rollback restored old and left new beside it — two files,
  # one id, and the collision precheck then refused every future run. Both gone-or-both-back now.
  mv "$W/truths/t001.md" "$W/truths/t01.md"
  OUT=$( ( cd "$W" && $TO node "$REPO/tests/upgrade-faultinject.mjs" - - - t01.md ) 2>&1 ); RC=$?
  [ "$RC" -eq 0 ] && bad "upgrade reported success around an injected removal failure"
  expect_has "rolled back"
  [ -f "$W/truths/t01.md" ] || bad "the old path is gone"
  [ ! -e "$W/truths/t001.md" ] || bad "the copied new path survived the rollback"
}
acct_upgrade_backup_never_reused() {
  # v0.5.2 (external review P0-2). The backup path was date+PID and mkdirSync(recursive) accepted an
  # existing directory — at which point bkup()'s "already snapshotted this run" dedup mistook the
  # STALE files inside for this run's snapshots, skipped the real ones, and the rollback RESTORED
  # THE STALE BYTES while printing "byte-identical to before". The driver's --collide-bak plants
  # exactly that bait at its own PID's path; mkdtempSync cannot return an existing path, so the
  # bait is now inert. Asserted on the RESTORED BYTES, not the message.
  cp "$W/project.md" "$W/.project.before"
  OUT=$( ( cd "$W" && $TO node "$REPO/tests/upgrade-faultinject.mjs" config.yaml --collide-bak ) 2>&1 ); RC=$?
  [ "$RC" -eq 0 ] && bad "upgrade reported success around an injected write failure"
  expect_has "rolled back"
  cmp -s "$W/.project.before" "$W/project.md" || bad "project.md is not the REAL original — the stale planted snapshot was restored"
  grep -q 'STALE SNAPSHOT' "$W/project.md" && bad "the planted stale bytes are live in the mine"
  # The bait dir itself must survive untouched — pre-fix it was consumed as this run's backup and
  # then deleted by the "verified" rollback, taking the only restore point with it.
  local baitd
  baitd=$(ls -d "$W"/.upgrade-backup-* 2>/dev/null | head -1)
  [ -n "$baitd" ] || { bad "the planted bait dir is gone entirely"; return; }
  grep -q 'STALE SNAPSHOT' "$baitd/project.md" 2>/dev/null || bad "the planted bait dir was consumed: $baitd"
}
acct_upgrade_reindex_failure_rolls_back() {
  # v0.5.2 (external review P1-1). Phase 5's regeneration ran BARE — a failed reindex left the old
  # views beside the renamed truths and the migration still committed "validate clean", because
  # validate checks id presence in the index, not label freshness. A nonzero rc now throws into the
  # boundary and the whole migration rolls back.
  mv "$W/truths/t001.md" "$W/truths/t01.md"
  OUT=$( ( cd "$W" && $TO node "$REPO/tests/upgrade-faultinject.mjs" - --reindex-fail ) 2>&1 ); RC=$?
  [ "$RC" -eq 0 ] && bad "upgrade committed around a failed index regeneration"
  expect_has "rolled back"
  [ -f "$W/truths/t01.md" ] || bad "the rename was not rolled back"
  [ ! -e "$W/truths/t001.md" ] || bad "the renamed file survived the rollback"
}
acct_upgrade_refuses_held_ledger_lock() {
  # Review #6 P0-2: upgrade --apply writes the ledger (it plans FROM it and REWRITES it whole in
  # step 6) yet spoke no lock protocol — measured sailing straight through a LIVE age-0 lock
  # (rc 0, ledger written, zero lock mentions), after which a concurrent attest's created-here
  # rollback unlinked the file with upgrade's freshly minted legacy rows inside, upgrade having
  # already reported success. Every ledger writer takes the ONE lock (lock.mjs) now: a held lock
  # refuses the whole migration after the bounded wait, byte-identically.
  # (An earlier revision of this comment claimed the full attest-beside-upgrade interleave was not
  # constructible — FALSE, my overgeneralisation from the mkv1 mine's renamed ids: the PRISTINE
  # fixture is a v1 mine with canonical ids and attest runs on it (rc 0, measured, review #7).
  # The real interleave is pinned in acct_upgrade_attest_real_cross below.)
  mkv1
  mkdir -p "$W/truths/verify-ledger.tsv.lock"
  local pre post
  pre=$(cd "$W" && find . -type f | LC_ALL=C sort | xargs sha256sum 2>/dev/null | sha256sum | awk '{print $1}')
  vrun upgrade --apply
  expect_block "NEVER be reclaimed automatically"
  expect_has "Nothing written"
  post=$(cd "$W" && find . -type f | LC_ALL=C sort | xargs sha256sum 2>/dev/null | sha256sum | awk '{print $1}')
  [ "$pre" = "$post" ] || bad "the refusal wrote something — the tree differs"
  [ -d "$W/truths/verify-ledger.tsv.lock" ] || bad "the refusal removed the held lock"
  # ...and the human path: remove the leftover, the same migration applies clean.
  rmdir "$W/truths/verify-ledger.tsv.lock"
  vrun upgrade --apply
  expect_pass
  vrun validate
  expect_pass
}
acct_upgrade_concurrent_apply_applies_once() {
  # Review #7 P1-2: the preflight ran BEFORE the lock with no rescan after acquiring, so two
  # applies racing both planned from the v1 state and the loser applied its STALE plan onto the
  # migrated mine — measured: both rc 0 "applied 4 item(s)", TWO backup dirs, the second one
  # snapshotting v2 files under a MANIFEST claiming a v1 restore point. Deterministic via the
  # driver's --slow-write seam: A holds the lock mid-apply for 3s while B preflights beside it;
  # B must RESCAN under the lock (caches cleared, config snapshot rebuilt) and find nothing to do.
  ( cd "$W" && node "$REPO/tests/upgrade-faultinject.mjs" --slow-write 3000 - ) > "$W/.a.out" 2>&1 &
  local apid=$!
  sleep 0.5
  ( cd "$W" && $TO "${WDRUN[@]}" upgrade --apply ) > "$W/.b.out" 2>&1
  local brc=$?
  wait "$apid"; local arc=$?
  [ "$arc" -eq 0 ] || bad "the slow apply failed (rc $arc)"
  [ "$brc" -eq 0 ] || bad "the concurrent apply exited $brc instead of finding nothing to do"
  grep -q 'applied' "$W/.a.out" || bad "the slow apply did not report applying"
  grep -q 'nothing to do' "$W/.b.out" || bad "the loser did not rescan under the lock"
  grep -q 'applied' "$W/.b.out" && bad "the loser applied a STALE plan onto the migrated mine"
  [ "$(ls -d "$W"/.upgrade-backup-* 2>/dev/null | wc -l | tr -d ' ')" = 1 ] || bad "two backup dirs — a stale second apply left a false restore point"
  vrun validate; expect_pass
}
acct_upgrade_attest_real_cross() {
  # Review #7: the REAL attest-beside-upgrade interleave (the pristine fixture is a v1 mine with
  # CANONICAL ids, so attest runs on it — the earlier "not constructible" claim was false). A
  # failing attest HOLDS the lock; upgrade --apply arriving beside it must refuse before writing
  # anything, leaving the mine v1; once the holder exits, the same apply migrates clean.
  # Passes on 95eb395 too (the lock landed there — this pins it); red vs 3041881: sailed through.
  ( cd "$W" && node "$REPO/tests/attest-faultinject.mjs" --sleep-ms 7000 verified 1 bstd m001 ) > "$W/.x.out" 2>&1 &
  local xpid=$!
  sleep 0.6
  vrun upgrade --apply
  local urc=$RC
  [ "$urc" -ne 0 ] || bad "upgrade applied THROUGH the attest's held lock"
  expect_block "is held and was not released"
  expect_has "Nothing written"
  grep -q '^version: 1' "$W/project.md" || bad "the refused apply left the mine migrated"
  wait "$xpid"
  vrun upgrade --apply
  expect_pass
  vrun validate; expect_pass
}
block_upgrade_version_flip_mid_wait() {
  # .3 cold review (real): the under-lock rerun skipped the CLOSED VERSION MATRIX — a mine whose
  # project.md flipped to 'version: 3' while --apply waited on the lock was STAGED INTO and only
  # the post-apply validate rolled it back (rc 1, "rolled back", a backup created and consumed) —
  # data-safe, but "refusing to touch a format this code cannot read" had already touched it.
  # The matrix reruns under the lock now: rc 2, the refusal sentence, zero writes.
  ( cd "$REPO" && node --input-type=module -e "
    import { acquireLedgerLock, releaseLedgerLock } from './.weavedoc/bin/lib/lock.mjs'
    const lk = process.argv[1]
    if (acquireLedgerLock(lk, 'x') !== '') process.exit(2)
    const t = Date.now(); while (Date.now() - t < 3000) { /* hold */ }
    releaseLedgerLock(lk)
  " "$W/truths/verify-ledger.tsv.lock" ) &
  local hpid=$!
  sleep 0.5
  ( cd "$W" && $TO "${WDRUN[@]}" upgrade --apply ) > "$W/.v.out" 2>&1 &
  local upid=$!
  sleep 1.2
  sed -i 's/^version: 1$/version: 3/' "$W/project.md"
  wait "$upid"; local urc=$?
  wait "$hpid"
  [ "$urc" -eq 2 ] || bad "expected rc 2 (refused before any write), got $urc"
  grep -q 'refusing to touch a format this code cannot read' "$W/.v.out" || bad "the future version was not refused"
  grep -q 'rolled back' "$W/.v.out" && bad "the migration ran and rolled back instead of refusing up front"
  [ -z "$(ls -d "$W"/.upgrade-backup-* 2>/dev/null)" ] || bad "a backup dir appeared — writes happened"; ok
}
acct_resume_key_sees_directory_moves() {
  # Review #10: the key's path half hashed BASENAMES, so moving golden/version.txt into golden/z/
  # kept the key identical and --resume replayed 430 passes over inputs that were no longer where
  # the cases read them (measured). This runs the SAME key_paths function the KEY computation
  # uses — a case testing its own copy of the pipeline would be the drift class.
  # Red vs 5999989: key_paths does not exist there; its absence IS the defect record.
  local d="$W/.keyprobe"
  mkdir -p "$d/tests" "$d/.weavedoc/templates" "$d/.weavedoc/bin"
  printf 'same bytes\n' > "$d/tests/moved.txt"
  local p1 p2
  p1=$(key_paths "$d" | sha256sum | awk '{print $1}')
  [ -n "$(key_paths "$d")" ] || { bad "key_paths produced nothing — the guard is vacuous"; return; }
  mkdir -p "$d/tests/z"
  mv "$d/tests/moved.txt" "$d/tests/z/moved.txt"
  p2=$(key_paths "$d" | sha256sum | awk '{print $1}')
  [ "$p1" != "$p2" ] || bad "a same-basename move between directories left the key's path half unchanged"
  rm -rf "$d"; ok
}
block_gaps_fence_shapes() {
  # Review #10: the fence rule was a bare toggle. Both directions were wrong and both are pinned:
  # a 4-space-indented ``` is NOT a fence in Markdown, so the entry after it is REAL and must
  # block (it was swallowed, rc 0 — fail-open); an inner ``` must not close a 4-backtick fence,
  # so the example inside stays text and must pass (it blocked — false positive). Plus the tilde
  # spelling and the unterminated-fence fail-open, which gets the '<!--' ruling.
  req_completeness
  printf '# Open\n\n# Accepted\n\n# Notes\n\n    ```\n- [declared] real entry after a fake fence — reason\n' > "$W/gaps.md"
  vrun validate
  expect_block "outside '# Open' and '# Accepted'"
  printf '# Open\n\n# Accepted\n\n# Notes\n\n````\n```\n- [declared] example inside a 4-tick fence — reason\n````\n' > "$W/gaps.md"
  vrun validate
  expect_pass
  printf '# Open\n\n# Accepted\n\n# Notes\n\n~~~\n- [declared] example in a tilde fence — reason\n~~~\n' > "$W/gaps.md"
  vrun validate
  expect_pass
  printf '# Open\n\n# Accepted\n\n# Notes\n\n```\n- [declared] behind an unterminated fence — reason\n' > "$W/gaps.md"
  vrun validate
  expect_block "unterminated code fence"
}
block_upgrade_one_mode_only() {
  # Review #10: mode was last-wins — a hidden rule the dispatcher's gate could not share, so
  # `upgrade --apply --check` ran read-only but was refused by the mine lock. The ambiguous
  # spelling is a usage error now, and the two parsers cannot disagree about it.
  vrun upgrade --apply --check
  [ "$RC" -eq 2 ] || bad "expected usage rc 2, got $RC"
  expect_has "one mode per invocation"
  vrun upgrade --check --apply
  [ "$RC" -eq 2 ] || bad "expected usage rc 2 for the reversed spelling, got $RC"
  [ ! -d "$W/.weavedoc/mine.lock" ] || bad "the usage refusal left the mine lock behind"
  vrun validate; expect_pass
}
acct_mine_lock_admits_one_writer() {
  # THE SINGLE-WRITER GATE (v0.5.4, review #9). Every mutating command takes .weavedoc/mine.lock
  # at the dispatcher, before it reads anything; a second one is REFUSED, not queued. Simulated
  # with a planted lock (a real second process would need a hold seam in every command, and the
  # gate is one code path for all of them). Red vs v0.5.4: every command below runs and writes.
  mkdir -p "$W/.weavedoc/mine.lock"
  printf 'someone-else' > "$W/.weavedoc/mine.lock/owner"
  local before after
  before=$(cd "$W" && find . -path ./.weavedoc/mine.lock -prune -o -type f -print | LC_ALL=C sort | xargs sha256sum 2>/dev/null | sha256sum | awk '{print $1}')
  local c t0 t1
  # ALL SIX writers, not a sample (review #10: consecrate and retag were missing, so the two
  # commands most likely to gain a pre-gate read had no case watching them).
  for c in "attest verified 1 std m001" "seal-review d1" "reindex" "upgrade --apply" "consecrate d1" "retag onetag twotag"; do
    t0=$(date +%s)
    # shellcheck disable=SC2086
    vrun $c
    t1=$(date +%s)
    [ "$RC" -eq 0 ] && bad "[$c] ran while the mine lock was held"
    printf '%s\n' "$OUT" | grep -qF 'ONE writing command per mine at a time' || bad "[$c] refused without naming the single-writer contract: $OUT"
    # REFUSED, NOT QUEUED — and the elapsed time is what proves it (cold review: without this, a
    # 5s queue that times out into the same sentence passed as a refusal). The contract sentence
    # in FORMATS, README and the skills says "refused"; this is what makes that sentence testable.
    [ "$(( t1 - t0 ))" -le 2 ] || bad "[$c] took $(( t1 - t0 ))s — it QUEUED behind the lock instead of refusing"
  done
  after=$(cd "$W" && find . -path ./.weavedoc/mine.lock -prune -o -type f -print | LC_ALL=C sort | xargs sha256sum 2>/dev/null | sha256sum | awk '{print $1}')
  [ "$before" = "$after" ] || bad "a refused command still wrote — the tree differs"
  [ -f "$W/.weavedoc/mine.lock/owner" ] || bad "a refusal removed the holder's lock"
  # ...and the human path: remove the leftover, the same command lands.
  rm -rf "$W/.weavedoc/mine.lock"
  vrun attest verified 1 std m001
  expect_pass
  [ ! -d "$W/.weavedoc/mine.lock" ] || bad "the mine lock survived a successful command"
}
acct_mine_lock_never_gates_readers() {
  # The gate is for WRITERS. Read-only commands, and the read-only MODES of writing commands,
  # must run untouched while a mine lock is held — a report queueing behind a migration would be
  # a worse tool, and --check/--dry-run/--dry promise to write nothing.
  # Passes on v0.5.4 too (there is no gate there) — said plainly: it is the guard that keeps the
  # gate from spreading, not evidence for it.
  mkdir -p "$W/.weavedoc/mine.lock"
  printf 'someone-else' > "$W/.weavedoc/mine.lock/owner"
  local c
  for c in validate scope status census gaps "upgrade --check" "upgrade --dry-run" "reindex --check"; do
    # shellcheck disable=SC2086
    vrun $c
    printf '%s\n' "$OUT" | grep -qF 'mine lock' && bad "[$c] was gated by the mine lock"
  done
  vrun retag onetag twotag --dry
  printf '%s\n' "$OUT" | grep -qF 'mine lock' && bad "[retag --dry] was gated by the mine lock"
  rm -rf "$W/.weavedoc/mine.lock"; ok
}
acct_mine_lock_released_on_refusal() {
  # A command that refuses for its OWN reasons must not leave the gate behind — the lock is
  # released on every exit, including the ones that end deep inside a command.
  # CANNOT BE RED against the pre-gate runtime, and that is said rather than hidden: with no gate
  # there is no lock to leak. What it pins is the invariant the gate must not break — a refusing
  # command leaves no lock — and it would catch a future exit path that forgets the release.
  vrun attest verified 1 std t999
  [ "$RC" -eq 0 ] && bad "a bogus id was accepted"
  [ ! -d "$W/.weavedoc/mine.lock" ] || bad "the mine lock survived a refusal"
  vrun attest verified 0 std m001
  [ "$RC" -eq 0 ] && bad "round 0 was accepted"
  [ ! -d "$W/.weavedoc/mine.lock" ] || bad "the mine lock survived a usage refusal"
  vrun validate; expect_pass
}
block_upgrade_apply_without_truths_dir() {
  # The lock's own precondition (v0.5.4 cold review). With the lock first, a mine that has no
  # truths/ made mkdir fail ENOENT and the command talked about a lock the user never made, rc 1 —
  # while every other "this mine is unusable" refusal is rc 2. The directory is checked before the
  # lock (the exception cmd-attest already makes) and named for what it is.
  # Red vs the pre-fix draft of this same patch: rc 1 and the ENOENT lock sentence.
  rm -rf "$W/truths"
  vrun upgrade --apply
  [ "$RC" -eq 2 ] || bad "expected rc 2 for an unusable mine, got $RC"
  expect_has "no truths/ directory"
  expect_hasnt "the ledger lock cannot be created"
  [ ! -e "$W/truths" ] || bad "the refusal created something where truths/ used to be"
}
acct_upgrade_judges_nothing_before_the_lock() {
  # THE CLASS GUARD for upgrade (v0.5.4, review #8 P1-1), and it needs no instrumentation: on an
  # ALREADY-MIGRATED mine a pre-lock judgment answers "nothing to do" INSTANTLY, while a
  # lock-first command must wait out the bound and refuse. The elapsed time is the evidence, so
  # this case fails the moment any decision moves back outside the lock — not just today's two.
  # Red vs v0.5.3: rc 0 "nothing to do" in ~0s with the lock held by someone else.
  vrun upgrade --apply
  expect_pass
  mkdir -p "$W/truths/verify-ledger.tsv.lock"
  printf 'someone-else' > "$W/truths/verify-ledger.tsv.lock/owner"
  local t0 t1
  t0=$(date +%s)
  vrun upgrade --apply
  t1=$(date +%s)
  expect_block "is held and was not released"
  expect_has "Nothing written"
  expect_hasnt "nothing to do"
  [ "$(( t1 - t0 ))" -ge 4 ] || bad "returned in $(( t1 - t0 ))s — it judged the mine without holding the lock"
  rm -rf "$W/truths/verify-ledger.tsv.lock"
}
acct_attest_judges_nothing_before_the_lock() {
  # THE CLASS GUARD for attest (v0.5.4, review #8 P1-2), same shape: a BOGUS id is a judgment
  # about the mine. Resolved before the lock it fails instantly with 'no truth file'; resolved
  # under the lock the command waits out the bound and refuses for the lock. The digest lives in
  # that same loop, which is what the review measured going stale across the wait.
  # Red vs v0.5.3: rc 2 "no truth file for 't999'" in ~0s while the lock is held.
  mkdir -p "$W/truths/verify-ledger.tsv.lock"
  printf 'someone-else' > "$W/truths/verify-ledger.tsv.lock/owner"
  local t0 t1
  t0=$(date +%s)
  vrun attest verified 1 std t999
  t1=$(date +%s)
  expect_block "is held and was not released"
  expect_hasnt "no truth file"
  [ "$(( t1 - t0 ))" -ge 4 ] || bad "returned in $(( t1 - t0 ))s — it resolved ids without holding the lock"
  [ ! -f "$W/truths/verify-ledger.tsv" ] || bad "a ledger appeared despite the refusal"
  rm -rf "$W/truths/verify-ledger.tsv.lock"
}
acct_attest_digest_is_taken_under_the_lock() {
  # The consequence the class guard protects (review #8 P1-2): a truth CHANGED during attest's
  # bounded wait must not be recorded as verified against the bytes it had before the wait. The
  # holder mutates the truth mid-hold; the digest attest writes must match the mine AFTER it, so
  # scope sees zero stale. Red vs v0.5.3: attest rc 0 and 'truths … 1 stale' the instant it lands.
  vrun attest verified 1 seed m001
  ( cd "$REPO" && node --input-type=module -e "
    import { acquireLedgerLock, releaseLedgerLock } from './.weavedoc/bin/lib/lock.mjs'
    import { appendFileSync } from 'node:fs'
    const lk = process.argv[1], tf = process.argv[2]
    if (acquireLedgerLock(lk, 'x') !== '') process.exit(2)
    let t = Date.now(); while (Date.now() - t < 1200) { /* hold */ }
    appendFileSync(tf, '\nA line added while attest waited.\n')
    t = Date.now(); while (Date.now() - t < 1200) { /* keep holding */ }
    releaseLedgerLock(lk)
  " "$W/truths/verify-ledger.tsv.lock" "$W/truths/t001.md" ) &
  local hpid=$!
  sleep 0.3
  vrun attest verified 2 std t001
  local arc=$RC
  wait "$hpid"
  grep -q 'A line added while attest waited' "$W/truths/t001.md" || { bad "fixture no-op: the truth was never mutated"; return; }
  [ "$arc" -eq 0 ] || bad "attest failed (rc $arc) — it should have waited out the hold and landed"
  vrun scope
  printf '%s\n' "$OUT" | grep -E '^[[:space:]]*truths ' | grep -q '0 stale' \
    || bad "the row was stale on arrival: $(printf '%s\n' "$OUT" | grep -E '^[[:space:]]*truths ')"
  ok
}
block_completeness_kind_bracket_unclosed() {
  # v0.5.4 (review #8 P1-3). An opener with no ']' reached the placeholder branch, where strip()
  # erased it along with the template word and left '' — so a broken kind slot read as noise and
  # validate said nothing (measured rc 0 for both spellings). Now it is a malformed entry.
  req_completeness
  printf '# Open\n\n# Accepted\n\n- [{kind}\n' > "$W/gaps.md"
  vrun validate
  expect_block "kind bracket never closes"
  printf '# Open\n\n# Accepted\n\n- [<kind>\n' > "$W/gaps.md"
  vrun validate
  expect_block "kind bracket never closes"
  # ...and under Open too — the grammar is one grammar, both sections
  printf '# Open\n\n- [declared 미폐합 — 근거\n\n# Accepted\n' > "$W/gaps.md"
  vrun validate
  expect_block "kind bracket never closes"
  # a CLOSED placeholder stub is still inert
  printf '# Open\n\n# Accepted\n\n- [<kind>] <설명>\n' > "$W/gaps.md"
  vrun validate
  expect_pass
}
block_completeness_kind_truth_table() {
  # THE CLASS, not the reported instance (v0.5.4): opener × closure × body × continuation, every
  # cell asserted in one place so the next shape cannot be "the one nobody enumerated". The three
  # earlier rounds each closed ONE cell of this table (bullet body, continuation, closure) — this
  # is the table itself, and it is the guard against a fourth round.
  req_completeness
  # cell → expected: PASS (inert stub) or a substring the refusal must name
  local -a cells=(
    '- [declared] real body — reason|PASS'
    '- [<kind>] <설명> — <근거>|PASS'
    '- [{kind}] {where} — {what}|PASS'
    '- [<kind>] real body — reason|not in the vocabulary'
    '- [{kind}] real body — reason|not in the vocabulary'
    '- [declraed] real body — reason|not in the vocabulary'
    '- [] real body — reason|COMP-MALFORMED'
    '- [declared|reference] real body — reason|matched exactly and one at a time'
    '- [declared] [reference] real body — reason|TWO kind brackets'
    "- no-kind real body — reason|no '[<kind>]' slot at all"
    '- [{kind}|kind bracket never closes'
    '- [<kind>|kind bracket never closes'
    '- [declared real body — reason|kind bracket never closes'
    # v0.5.4 (review #9): real content sharing the kind slot with a template token. The slot was
    # judged by PREFIX, so these read as noise and drew nothing. A slot that does not strip to
    # empty is a kind, and a kind outside the enum blocks.
    # NO body after the bracket — with one, v0.5.4 already blocked these through the "placeholder
    # kind over a real body" rule. The open shape was the bullet whose ONLY content is the slot.
    '- [{kind} real-content]|not in the vocabulary'
    '- [<kind>real]|not in the vocabulary'
    # ...while a slot that is ENTIRELY one placeholder group stays a stub — the same ruling the
    # template's own line gets ("fill every placeholder" judges the WHOLE value).
    '- [<kind real-content>]|PASS'
  )
  local spec entry want
  for spec in "${cells[@]}"; do
    # the LAST pipe separates cell from expectation, so the compound-kind cell's own pipe is safe
    entry=${spec%|*}; want=${spec##*|}
    printf '# Open\n\n# Accepted\n\n%s\n' "$entry" > "$W/gaps.md"
    vrun validate
    if [ "$want" = PASS ]; then
      [ "$RC" -eq 0 ] || { bad "[$entry] should be inert, got rc $RC"; return; }
    else
      [ "$RC" -ne 0 ] || { bad "[$entry] passed — expected [$want]"; return; }
      printf '%s\n' "$OUT" | grep -qF -- "$want" || { bad "[$entry] blocked, but not for [$want]"; return; }
    fi
  done
  # ...and the continuation axis: a held stub REALIZED by real content is an entry (its
  # placeholder kind is judged), while a stub continued by more noise stays inert.
  printf -- '# Accepted\n\n- [{kind}] {where}\n  real continuation content\n\n# Open\n' > "$W/gaps.md"
  vrun validate; expect_block "not in the vocabulary"
  printf -- '# Accepted\n\n- [{kind}] {where}\n  {more placeholder}\n\n# Open\n' > "$W/gaps.md"
  vrun validate; expect_pass
}
block_completeness_indent_axis() {
  # v0.5.4 (review #9). The indentation was stripped BEFORE the bullet test, so the grammar had no
  # column-zero rule: an ORPHAN indented bullet under no parent counted as an accepted decision
  # (rc 0, measured), and a legitimate SUB-BULLET under a real entry was read as a second entry
  # and blocked for having no kind. An entry opens at column zero; indented bullets are
  # continuations, and a continuation needs an entry above it.
  req_completeness
  printf '# Open\n\n# Accepted\n\n  - [declared] orphan indented bullet — reason\n' > "$W/gaps.md"
  vrun validate
  expect_block "COMP-MALFORMED"
  printf '# Open\n\n# Accepted\n\n- [declared] parent — reason\n  - sub bullet detail\n' > "$W/gaps.md"
  vrun validate
  expect_pass
  # ...and a sub-bullet REALIZES a held stub, exactly as a prose continuation does
  printf -- '# Accepted\n\n- [{kind}] {where}\n  - real sub bullet content\n\n# Open\n' > "$W/gaps.md"
  vrun validate
  expect_block "not in the vocabulary"
}
block_completeness_entry_outside_the_register() {
  # v0.5.4 (review #9). The register is read section by section, so an entry parked under a THIRD
  # heading — or above the first one — was invisible to every check (rc 0, measured) while looking
  # to a human exactly like a recorded gap.
  req_completeness
  printf '# Open\n\n# Accepted\n\n# Deferred\n\n- [declared] parked in a third section — reason\n' > "$W/gaps.md"
  vrun validate
  expect_block "outside '# Open' and '# Accepted'"
  printf -- '- [declared] above every heading — reason\n\n# Open\n\n# Accepted\n' > "$W/gaps.md"
  vrun validate
  expect_block "outside '# Open' and '# Accepted'"
  # a third section with PROSE is fine — the register owns entries, not the whole file
  printf '# Open\n\n# Accepted\n\n# Notes\n\n자유 서술은 등록부가 아니다.\n' > "$W/gaps.md"
  vrun validate
  expect_pass
  # A DEEPER heading stays INSIDE its section — the same nesting sectionAll uses. Such a file still
  # blocks (the register grammar reads a heading line as prose, as it always has), but it must
  # block for THAT reason: reading every heading as a new section made this check say the entry was
  # filed outside the register, which was false about the file (cold review).
  printf '# Open\n\n# Accepted\n\n## 2026-08 라운드\n\n- [declared] entry — reason\n' > "$W/gaps.md"
  vrun validate
  expect_block "cannot read"
  expect_hasnt "outside '# Open' and '# Accepted'"
  # ...and a bullet drawn inside a fenced example is text, not a misfiled gap
  printf '# Open\n\n# Accepted\n\n# Notes\n\n```\n- [declared] 예시일 뿐 — 근거\n```\n' > "$W/gaps.md"
  vrun validate
  expect_pass
}
acct_gaps_cli_counts_entries_like_validate() {
  # v0.5.4 cold review: validate moved to "an entry opens at column zero" and this counter did not,
  # so a sub-bullet under an accepted entry was a second accepted gap to the CLI and a continuation
  # to validate — the same one-file-two-answers split the section-name fix closed one round ago.
  # Red vs HEAD: 'records 2 already accepted'.
  printf '# Open\n\n# Accepted\n\n- [declared] entry — reason\n  - a sub bullet of that entry\n' > "$W/gaps.md"
  vrun gaps
  expect_pass
  expect_has "records 1 already accepted"
  vrun validate
  expect_pass
}
acct_scope_dead_ledger_says_nothing_superseded() {
  # v0.5.4 (review #8 P2). A headless row voids the sidecar, which empties `ledgerBad` — and the
  # superseded-history filter, reading that empty set, announced an id's OWN LATEST odd verdict as
  # "superseded … history". The void lines already say the file counts for nothing; nothing may
  # contradict them. Red vs v0.5.3: both lines print.
  vrun attest verified 1 std m001
  sed -i 's/\tverified\t/\tverifed\t/' "$W/truths/verify-ledger.tsv"
  printf '\t-\tverified\t9\tstd\t2026-01-01\n' >> "$W/truths/verify-ledger.tsv"
  vrun scope
  expect_has "carry no id"
  expect_hasnt "superseded row(s) carry unknown verdicts"
}
acct_gaps_heading_depth_agrees() {
  # v0.5.4 (review #8 P2). sectionAll read any run of '#' while countHeadings stops at six, so a
  # '####### Accepted' register was malformed to validate and one accepted entry to the gaps CLI —
  # one file, two answers. Markdown agrees with the stricter reader, so the cap moved into
  # sectionAll. Red vs v0.5.3: the CLI reports 'records 1 already accepted'.
  req_completeness
  printf '####### Open\n\n####### Accepted\n\n- [declared] entry — reason\n' > "$W/gaps.md"
  vrun validate
  expect_block "no readable '# Open' section"
  vrun gaps
  expect_pass
  expect_has "records 0 already accepted"
  # ...and six hashes stay a heading for both
  printf '###### Open\n\n###### Accepted\n\n- [declared] entry — reason\n' > "$W/gaps.md"
  vrun gaps
  expect_has "records 1 already accepted"
}
acct_lock_release_only_own() {
  # Review #7 low-pri: releaseLedgerLock removes ONLY a lock whose on-disk mark this process
  # wrote. The one path that could break the exclusion without any code being wrong: a human
  # deletes a LIVE lock against the refusal's instruction, a second writer acquires, and the
  # first holder's release then removed the SECOND holder's lock. Simulated in one process:
  # acquire, have the "human" remove the lock, let a foreign writer take the path, release —
  # the foreign lock must survive. Red vs the unmarked runtime: rmdir took the foreign lock.
  mkdir -p "$W/truths"
  local lk="$W/truths/verify-ledger.tsv.lock"
  OUT=$( ( cd "$REPO" && node --input-type=module -e "
    import { acquireLedgerLock, releaseLedgerLock } from './.weavedoc/bin/lib/lock.mjs'
    import { rmSync, mkdirSync, existsSync } from 'node:fs'
    const lk = process.argv[1]
    const w = acquireLedgerLock(lk, 'probe.lock')
    if (w !== '') { console.log('ACQUIRE-FAIL ' + w); process.exit(2) }
    rmSync(lk, { recursive: true, force: true })
    mkdirSync(lk)
    releaseLedgerLock(lk)
    console.log(existsSync(lk) ? 'FOREIGN-SURVIVES' : 'FOREIGN-REMOVED')
  " "$lk" ) 2>&1 ); RC=$?
  expect_has "FOREIGN-SURVIVES"
  rm -rf "$lk"
}
acct_scope_names_superseded_odd_verdict() {
  # v0.5.2 (external review P1-2). A typo'd verdict with a LATER valid row: validate blocks on the
  # history row, but scope judged only the winner — so the very row the mine is blocked on was
  # invisible in the one command that narrates the ledger. The winner still counts (the
  # repaired-ledger rule); the word is named beside it.
  vrun attest verified 1 std m001
  sed -i 's/\tverified\t/\tverifed\t/' "$W/truths/verify-ledger.tsv"
  vrun attest verified 2 std m001
  vrun scope
  expect_has "1 verified (digest-bound)"
  expect_has "superseded row(s) carry unknown verdicts"
  vrun validate
  expect_block "[LEDGER-VERDICT]"
}
acct_scope_names_all_odd_words_per_id() {
  # Review #7 low-pri: oddVerdicts kept only the FIRST odd word per id, so an id whose history
  # carries two different typos showed one in scope while validate named both rows — the
  # two-readers split on the count axis. Every word rides now, joined with '·'.
  vrun attest verified 1 std m001
  sed -i 's/\tverified\t/\tverifed\t/' "$W/truths/verify-ledger.tsv"
  printf 'm001\t-\ttypo2\t9\tstd\t2026-01-01\n' >> "$W/truths/verify-ledger.tsv"
  vrun attest verified 3 std m001
  vrun scope
  expect_has "superseded row(s) carry unknown verdicts"
  expect_has "verifed·typo2"
}
acct_scope_quarantined_odd_not_superseded() {
  # v0.5.2 cold review. The superseded-history line fired on rows that are neither superseded nor
  # history: an odd verdict on an id's LATEST row (the id is quarantined — there is no winner, so
  # "the winner still stands" is false, and the malformed line already covers it) and a HEADLESS
  # odd row, which printed a dangling empty id before its word. Only ids with a valid WINNING row
  # are superseded history now. Red vs the draft: both weird entries print on the superseded line.
  vrun attest verified 1 std m001
  printf 't001\t-\tverifed\t1\tstd\n' >> "$W/truths/verify-ledger.tsv"
  printf '\t-\ttypo\t9\tstd\t2026-01-01\n' >> "$W/truths/verify-ledger.tsv"
  vrun scope
  expect_hasnt "superseded row(s) carry unknown verdicts"
  expect_has "carry no id"
  expect_has "[LEDGER-MALFORMED]"
}
block_completeness_kind_missing_bracket() {
  # v0.5.2 (external review P1-3a). A bare `- no-kind` bullet under Accepted was an accepted
  # decision with no kind at all — FORMATS' entry format opens with exactly one bracketed kind.
  req_completeness
  printf '# Open\n\n# Accepted\n\n- no-kind 항목 — 근거\n' > "$W/gaps.md"
  vrun validate
  expect_block "no '[<kind>]' slot at all"
}
block_completeness_kind_empty_bracket() {
  # v0.5.2 (external review P1-3b). `- []` slipped because the no-error sentinel was '' — the very
  # value an empty bracket produces. The sentinel is null now, so "empty kind" is an error value.
  req_completeness
  printf '# Open\n\n# Accepted\n\n- [] 빈 브래킷 — 근거\n' > "$W/gaps.md"
  vrun validate
  expect_block "COMP-MALFORMED"
}
block_completeness_kind_compound() {
  # v0.5.2 (external review P1-3c). '[declared|reference]' passed because inList is the
  # pipe-substring trick and a compound of adjacent members IS a substring of the enum string. The
  # match is exact and one-at-a-time now.
  req_completeness
  printf '# Open\n\n# Accepted\n\n- [declared|reference] 복합 — 근거\n' > "$W/gaps.md"
  vrun validate
  expect_block "matched exactly and one at a time"
}
block_completeness_kind_double() {
  # Review #6 P1: only the FIRST bracket was judged — '- [declared] [reference] …' rode through
  # wearing TWO routable kinds (measured rc 0). Blocked now, but ONLY when the second bracket IS a
  # kind word: a bracketed citation right after the kind is body, not a second kind.
  req_completeness
  printf '# Open\n\n# Accepted\n\n- [declared] [reference] double-kind — reason\n' > "$W/gaps.md"
  vrun validate
  expect_block "TWO kind brackets"
  printf '# Open\n\n# Accepted\n\n- [declared] [계약서 3조] citation-not-a-kind — reason\n' > "$W/gaps.md"
  vrun validate
  expect_pass
}
block_completeness_kind_placeholder_with_body() {
  # Cold review of the .2 patch (real): '- [<kind>] [declared] x — r' passed with NO diagnostic —
  # the placeholder branch is tested before the kind branch, so a bullet whose kind slot is
  # literal template noise skipped the vocabulary check entirely, and a routable kind word riding
  # in the SECOND bracket changed nothing. A pure stub still reads as noise (not an entry, not an
  # error); but a placeholder kind on a bullet with REAL body is an entry whose kind is not in the
  # vocabulary, and it is judged by exactly that rule now.
  req_completeness
  printf '# Open\n\n# Accepted\n\n- [<kind>] [declared] real body — reason\n' > "$W/gaps.md"
  vrun validate
  expect_block "not in the vocabulary"
  # the freshly-initialised template stub stays inert — noise, not an entry, not an error
  printf '# Open\n\n# Accepted\n\n- [<kind>] <설명> — <근거>\n' > "$W/gaps.md"
  vrun validate
  expect_pass
}
block_completeness_placeholder_realized_by_continuation() {
  # Review #7 P1-1: a placeholder bullet held as noise, then REALIZED by a continuation with real
  # content — the continuation branch counted the entry and judged nothing, so an Accepted
  # decision wearing '[{kind}]' passed validate rc 0 and the gaps CLI both (measured). The bracket
  # word rides along with the noise flag now: realization carries it into the same vocabulary
  # judgment every kind gets.
  req_completeness
  printf -- "# Accepted\n\n- [{kind}] {where} — {what} — {evidence}\n  m001 intentionally accepted but placeholder kind remained\n\n# Open\n" > "$W/gaps.md"
  vrun validate
  expect_block "not in the vocabulary"
  # a placeholder bullet whose continuation is ALSO noise stays a stub — not an entry, not an error
  printf -- "# Accepted\n\n- [{kind}] {where} — {what}\n  {more placeholder}\n\n# Open\n" > "$W/gaps.md"
  vrun validate
  expect_pass
}
block_completeness_sections_degenerate_roster() {
  # Cold review of the .2 patch (nit): 'gaps.sections: Open|Open' — two IDENTICAL members — passed
  # the two-member check and judged a one-section register as complete. A roster that cannot tell
  # its open section from its accepted one is unusable, and it is named now.
  req_completeness
  cp -r "$REPO/.weavedoc/bin" "$W/.weavedoc/bin"
  cp "$REPO/.weavedoc/schema" "$W/.weavedoc/schema"
  cp "$REPO/.weavedoc/VERSION" "$W/.weavedoc/VERSION"
  sed -i 's/^gaps.sections: Open|Accepted$/gaps.sections: Open|Open/' "$W/.weavedoc/schema"
  grep -q '^gaps.sections: Open|Open$' "$W/.weavedoc/schema" || { bad "fixture no-op: schema swap missed"; return; }
  printf '# Open\n\n# Accepted\n' > "$W/gaps.md"
  OUT=$( ( cd "$W" && $TO node .weavedoc/bin/weavedoc.mjs validate ) 2>&1 ); RC=$?
  expect_block "SCHEMA-UNREADABLE"
}
block_completeness_sections_from_schema() {
  # Review #6 P1: gaps.sections joined SCH_KEYS (presence) while the counter spelled
  # 'Open'/'Accepted' by hand — measured: a runtime whose schema said Pending|Waived PASSED a
  # '# Open'/'# Accepted' register and BLOCKED '# Pending'/'# Waived', the exact inversion of the
  # declaration. The section names come from the schema VALUE now. On a runtime COPY, like the
  # other schema-fixture cases: the shipped one is not a fixture.
  req_completeness
  cp -r "$REPO/.weavedoc/bin" "$W/.weavedoc/bin"
  cp "$REPO/.weavedoc/schema" "$W/.weavedoc/schema"
  cp "$REPO/.weavedoc/VERSION" "$W/.weavedoc/VERSION"
  sed -i 's/^gaps.sections: Open|Accepted$/gaps.sections: Pending|Waived/' "$W/.weavedoc/schema"
  grep -q '^gaps.sections: Pending|Waived$' "$W/.weavedoc/schema" || { bad "fixture no-op: schema swap missed"; return; }
  printf '# Open\n\n# Accepted\n\n- [declared] entry — reason\n' > "$W/gaps.md"
  OUT=$( ( cd "$W" && $TO node .weavedoc/bin/weavedoc.mjs validate ) 2>&1 ); RC=$?
  expect_block "no readable '# Pending' section"
  printf '# Pending\n\n# Waived\n\n- [declared] entry — reason\n' > "$W/gaps.md"
  OUT=$( ( cd "$W" && $TO node .weavedoc/bin/weavedoc.mjs validate ) 2>&1 ); RC=$?
  expect_pass
}
acct_shipped_gaps_template_passes_its_own_gate() {
  # THE SHIPPED ARTIFACT, not a hand-written stand-in (v0.5.4 cold review). The template's Accepted
  # line carried its field labels OUTSIDE the braces — 'scope:'/'recheck:'/'as-of:' survived strip(),
  # so the line was not a stub, '{kind}' was judged as a kind, and a freshly-initialised gaps.md
  # BLOCKED under `completeness: required`. The code comment claiming "a pure stub keeps a
  # freshly-initialised gaps.md green" was tested against a stand-in that had no such labels.
  # Red vs HEAD: COMP-MALFORMED naming '[{kind}]'.
  req_completeness
  cp "$REPO/.weavedoc/templates/gaps.md" "$W/gaps.md"
  grep -q '{kind}' "$W/gaps.md" || { bad "fixture no-op: the shipped template has no placeholder kind"; return; }
  vrun validate
  expect_pass
}
acct_gaps_cli_reads_schema_sections() {
  # Review #6 low-pri, the CLI half of the same split: `weavedoc gaps` spelled 'Accepted' by hand
  # and read h1/h2 only, so a schema-renamed section was invisible to it and a '### Accepted'
  # register validate had just counted printed as "records 0 already accepted". It reads the
  # schema's second member now, at any heading level (sectionAll — validate's own tolerance).
  cp -r "$REPO/.weavedoc/bin" "$W/.weavedoc/bin"
  cp "$REPO/.weavedoc/schema" "$W/.weavedoc/schema"
  cp "$REPO/.weavedoc/VERSION" "$W/.weavedoc/VERSION"
  sed -i 's/^gaps.sections: Open|Accepted$/gaps.sections: Pending|Waived/' "$W/.weavedoc/schema"
  grep -q '^gaps.sections: Pending|Waived$' "$W/.weavedoc/schema" || { bad "fixture no-op: schema swap missed"; return; }
  printf '# Pending\n\n# Waived\n\n- [declared] entry — reason\n' > "$W/gaps.md"
  OUT=$( ( cd "$W" && $TO node .weavedoc/bin/weavedoc.mjs gaps ) 2>&1 ); RC=$?
  expect_pass
  expect_has "records 1 already accepted"
  # ...and a deeper heading level is the SAME register to both readers (default schema restored).
  cp "$REPO/.weavedoc/schema" "$W/.weavedoc/schema"
  printf '### Open\n\n### Accepted\n\n- [declared] entry — reason\n' > "$W/gaps.md"
  OUT=$( ( cd "$W" && $TO node .weavedoc/bin/weavedoc.mjs gaps ) 2>&1 ); RC=$?
  expect_pass
  expect_has "records 1 already accepted"
}
block_ledger_torn_comment() {
  # Review #6 low-pri: an unterminated final COMMENT line rode validate's comment-skip (the
  # terminator test came second) and the parser's isSkippable alike — a torn line in the
  # machine-owned file said nothing anywhere (measured: validate rc 0, scope rc 0, no mention).
  # It cannot be evidence — no row starts with '#' — but it IS a torn write, and the two readers
  # answer alike now: validate names it, the parser counts it as file-level damage.
  vrun attest verified 1 std m001
  printf '# torn comment' >> "$W/truths/verify-ledger.tsv"
  vrun validate
  expect_block "the final comment line has no line terminator"
  vrun scope
  expect_has "carry no id"
}
acct_schema_missing_gaps_keys_named() {
  # v0.5.2 (external review P1-3d). gaps.sections and gaps.enum.kind were declared in the schema
  # and absent from SCH_KEYS — deleting them from a runtime's schema changed nothing, which is the
  # declared-but-unread class the schema's own header warns about. On a COPY of the runtime, like
  # the fingerprint case: the shipped one is not a fixture.
  cp -r "$REPO/.weavedoc/bin" "$W/.weavedoc/bin"
  cp "$REPO/.weavedoc/schema" "$W/.weavedoc/schema"
  cp "$REPO/.weavedoc/VERSION" "$W/.weavedoc/VERSION"
  sed -i '/^gaps\.sections:/d; /^gaps\.enum\.kind:/d' "$W/.weavedoc/schema"
  grep -q '^gaps\.' "$W/.weavedoc/schema" && { bad "fixture no-op: gaps keys still present"; return; }
  OUT=$( ( cd "$W" && $TO node .weavedoc/bin/weavedoc.mjs validate ) 2>&1 ); RC=$?
  [ "$RC" -eq 0 ] && bad "validate passed with schema keys deleted"
  expect_has "SCHEMA-UNREADABLE"
}
acct_upgrade_rollback_fault_preserves_backup() {
  # Write fails at the stamp AND the rollback cannot restore verify.md. Keep the backup, name the
  # file, never claim "byte-identical" — the backup is the only copy of the original left.
  OUT=$( ( cd "$W" && $TO node "$REPO/tests/upgrade-faultinject.mjs" project.md verify.md ) 2>&1 ); RC=$?
  [ "$RC" -eq 0 ] && bad "upgrade reported success around an injected write failure"
  expect_has "rollback is INCOMPLETE"
  [ -n "$(ls -d "$W"/.upgrade-backup-* 2>/dev/null)" ] || bad "backup dir was deleted though the rollback could not be verified"
}
acct_mat_digest_line_endings_stable() {
  # A material's digest must not depend on the platform that computed it. mat_digest passes the file
  # through awk, and MSYS gawk strips CR while Linux gawk keeps it — so the SAME material digested
  # to two different values depending on where you ran it (measured 2026-08-04: eclypse m001 gives
  # ebf43fc9… on Windows and 5cf38845… on Linux). A verification is "these bytes were checked"; if
  # the number moves when the checkout does, a git autocrlf clone silently resurrects the whole
  # verification debt. Stated as the consequence rather than as a hash constant: re-writing a
  # verified material with the other line endings must not stale it.
  vrun attest verified 1 standard m001
  # Rewritten in bash, not awk or sed: those two are the very tools whose CR handling differs by
  # platform, so using them to BUILD the fixture would make the case prove nothing on one of them.
  # bash's read keeps CR and its printf writes bytes, on every platform.
  { while IFS= read -r l || [ -n "$l" ]; do printf '%s\r\n' "${l%$'\r'}"; done < "$W/materials/m001/converted.md"; } > "$W/m.crlf"
  mv "$W/m.crlf" "$W/materials/m001/converted.md"
  # Checked with read for the same reason — MSYS grep reports CR inconsistently.
  IFS= read -r l0 < "$W/materials/m001/converted.md"
  case "$l0" in *$'\r') ;; *) bad "fixture did not become CRLF — the case would prove nothing"; return ;; esac
  vrun scope
  expect_has "materials  1 converted · 1 verified (digest-bound)"
  expect_hasnt "→ stale:"
}
block_ledger_extra_empty_column_blocks_both() {
  # v0.5.1 external review P0-1a. validate's column reader was still the retired bash runtime's
  # `IFS=$'\t' read` model — trailing tabs IGNORED — so a row with an extra empty column read as six
  # clean fields there (rc 0) while scope's exact split quarantined it: "named in scope and blocks
  # in validate" held on exactly one side. Every tab delimits now, in both.
  vrun attest verified 1 std m001
  sed -i 's/^m001\t.*$/&\t/' "$W/truths/verify-ledger.tsv"
  grep -q $'\t$' "$W/truths/verify-ledger.tsv" || { bad "fixture no-op: no trailing tab landed"; return; }
  vrun validate
  expect_block "more than six tab-separated columns"
  vrun scope
  expect_has "0 verified (digest-bound)"
  expect_has "[LEDGER-MALFORMED]"
}
block_ledger_headless_row_voids_sidecar() {
  # v0.5.1 external review P0-1b — the worst shape it found. A leading tab makes the id column
  # EMPTY; the old validate reader collapsed leading tabs and read the row as VALID (rc 0), while
  # scope could not attribute it to any id — so m001's FAILED verdict vanished there too, and with
  # `status: verified` in the material the v1 fallback opened: the debt disappeared from both
  # surfaces at once. The headless counter existed and nothing read it.
  # Now: validate names the empty id and blocks; scope voids the WHOLE sidecar (an unattributable
  # row could be ANY unit's latest verdict) and no fallback opens.
  sed -i 's/^status: converted$/status: verified/' "$W/materials/m001/converted.md"
  vrun attest failed 1 std m001
  sed -i 's/^m001\t\(.*\tfailed\t.*\)$/\tm001\t\1/' "$W/truths/verify-ledger.tsv"
  grep -q $'^\t' "$W/truths/verify-ledger.tsv" || { bad "fixture no-op: no leading tab landed"; return; }
  vrun validate
  expect_block "row has an EMPTY id column"
  vrun scope
  expect_has "1 unverified"
  expect_has "carry no id"
  expect_hasnt "legacy-unbound: m001"
}
block_ledger_whitespace_line_voids_both() {
  # v0.5.1 cold review finding 1: validate parsed a lone-TAB line as an empty-id row and blocked,
  # while scope's skip predicate absorbed whitespace-only lines — the two-readers split, one
  # predicate down from the parser that had just been unified. Whitespace-bearing lines now parse
  # (and fail) identically in both.
  vrun attest verified 1 std m001
  printf '\t\n' >> "$W/truths/verify-ledger.tsv"
  vrun validate
  expect_block "row has an EMPTY id column"
  vrun scope
  expect_has "carry no id"
  expect_has "0 verified (digest-bound)"
}
acct_ledger_lenient_id_binds_in_both() {
  # v0.5.1 cold review finding 2: validate accepts a lenient id spelling (`t1` canonicalizes to
  # t001) while scope keyed rows by RAW bytes — so the row could never match its on-disk unit:
  # validate green, evidence silently demoted, and the ghost line then named the WRONG id (the
  # display canonicalized what the keying had not). One id space now: the row binds.
  vrun attest verified 1 std t001
  sed -i 's/^t001\t/t1\t/' "$W/truths/verify-ledger.tsv"
  grep -q $'^t1\t' "$W/truths/verify-ledger.tsv" || { bad "fixture no-op: the id was not respelled"; return; }
  vrun validate; expect_pass
  vrun scope
  expect_has "truths     1 live · 1 verified (digest-bound)"
  expect_hasnt "no truth file"
}
acct_scope_ghost_material_named() {
  # The m-lane twin of the t-ghost line (v0.5.1 cold review finding 9): a structurally valid row
  # for a material that does not exist was absorbed in silence — against scope's own
  # SHOWN-never-absorbed discipline. validate does not check row-id existence (a ledger may
  # legitimately outlive a removed unit), so scope's line is the one place this surfaces.
  vrun attest verified 1 std m001
  printf 'm999\t-\tlegacy-unbound\t-\tv1-material-frontmatter\t2026-07-01\n' >> "$W/truths/verify-ledger.tsv"
  vrun scope
  expect_has "no material on disk"
  vrun validate; expect_pass
}
acct_attest_ledger_directory_refuses_truthfully() {
  # v0.5.1 cold review finding 3: on Windows a directory stats as size 0, so the tail-byte guard
  # never ran, the append failed EISDIR, and the failure branch told the user to delete a torn row
  # that never existed — a refusal with a FALSE diagnosis, and a different one per OS. One check,
  # one true sentence, both platforms.
  vrun attest verified 1 seed m001
  rm -f "$W/truths/verify-ledger.tsv"; mkdir "$W/truths/verify-ledger.tsv"
  vrun attest verified 2 std m001
  expect_block "not a regular file"
}
block_upgrade_headless_ledger_refuses() {
  # v0.5.1 cold review finding 6: scope and validate both declare a headless ledger VOID, but
  # upgrade's scan was a third consumer quietly computing its plan from rows the other two had
  # ruled unusable — a wrong preview, over evidence in an undecidable state. Refused in every mode
  # now, same as unreadable.
  vrun attest failed 1 std m001
  sed -i 's/^m001\t\(.*\tfailed\t.*\)$/\tm001\t\1/' "$W/truths/verify-ledger.tsv"
  grep -q $'^\t' "$W/truths/verify-ledger.tsv" || { bad "fixture no-op: no leading tab landed"; return; }
  vrun upgrade --check
  expect_block "the sidecar is void"
}
block_consecrate_validator_throw_restores() {
  # v0.5.1 cold review finding 5 made this case exist: the fix (a throwing validator counts as a
  # failed validation) was in, tested by hand, and the CHANGELOG claimed red-first coverage the
  # suite did not have. An exception used to escape the whole command — candidate left at final,
  # marker and backup beside it — where the contract promises the automatic restore.
  printf '개정판. <!-- t:t001 -->\n' > "$W/documents/d1/draft.md"
  vrun seal-review d1 draft
  cp "$W/documents/d1/final.md" "$W/.final.before"
  OUT=$( ( cd "$W" && $TO node "$REPO/tests/consecrate-faultinject.mjs" d1 --throw-validate ) 2>&1 ); RC=$?
  [ "$RC" -eq 0 ] && bad "consecrate reported success around a crashing validator"
  expect_has "original final preserved"
  cmp -s "$W/.final.before" "$W/documents/d1/final.md" || bad "final.md is not byte-identical after the restore"
  [ ! -e "$W/documents/d1/.consecrate.inflight" ] || bad "in-flight marker left behind after a verified restore"
}
block_verify_md_directory_is_not_absent() {
  # Found by sweeping the absent-vs-unreadable class across every legal-absence file rather than
  # waiting for the next review (v0.5.1). verify.md may legitimately not exist, so a DIRECTORY
  # wearing its name folded into "never verified" and validate stayed green over records in an
  # unknown state. (chmod-unreadable already blocked — the empty read fails FM-MISSING — so the
  # directory was the one silent spelling.)
  rm -f "$W/truths/verify.md"; mkdir "$W/truths/verify.md"
  vrun validate
  expect_block "not a readable file"
}
block_ledger_unreadable_is_not_absent() {
  # v0.5.1 external review P0-2, in the spelling every platform and every user can test: a DIRECTORY
  # wearing the ledger's name (the chmod-000 shape takes an unprivileged user, which the harness is
  # not in the container — measured there by hand instead, same branch, EACCES for EISDIR). A file
  # that exists but cannot be read is evidence in an UNKNOWN state: the last rows could be failures.
  # It used to fold into "no ledger" — validate skipped the section (isFileAt false), scope read []
  # and opened the v1 fallbacks over whatever the real bytes said.
  sed -i 's/^status: converted$/status: verified/' "$W/materials/m001/converted.md"
  vrun attest failed 1 std m001
  rm -f "$W/truths/verify-ledger.tsv"; mkdir "$W/truths/verify-ledger.tsv"
  vrun validate
  expect_block "[LEDGER-UNREADABLE]"
  vrun scope
  expect_has "CANNOT BE READ"
  expect_has "1 unverified"
  expect_hasnt "legacy-unbound: m001"
  vrun upgrade --check
  expect_block "cannot be read"
}
acct_ledger_crlf_reads_as_verified() {
  # ONE READER (§11 2026-08-05). A git checkout with core.autocrlf=true — the Windows default —
  # turns the ledger CRLF, and the two readers then disagreed about the same file: `scope` stripped
  # the CR and reported the material fully verified, `validate` kept it (so the date column read
  # `2026-07-01\r`) and blocked every row as LEDGER-MALFORMED. A verdict that depends on which
  # command asked is not a verdict. Now a trailing CRLF is a line ending, in both.
  vrun attest verified 2 standard m001
  # Rewritten in bash, not sed/awk: those are the tools whose CR handling differs by platform, so
  # building the fixture with them would make the case prove nothing on one of them.
  { while IFS= read -r l || [ -n "$l" ]; do printf '%s\r\n' "${l%$'\r'}"; done < "$W/truths/verify-ledger.tsv"; } > "$W/l.crlf"
  mv "$W/l.crlf" "$W/truths/verify-ledger.tsv"
  IFS= read -r l0 < "$W/truths/verify-ledger.tsv"
  case "$l0" in *$'\r') ;; *) bad "fixture did not become CRLF — the case would prove nothing"; return ;; esac
  vrun scope
  expect_has "materials  1 converted · 1 verified (digest-bound)"
  vrun validate; expect_pass
}
acct_ledger_unterminated_last_row_blocks() {
  # The signature of an `attest` that died mid-write: a final row with no newline. `scope` READ it
  # and `validate` DISCARDED it, so a half-written verification either counted or vanished
  # depending on who asked — and vanishing is the dangerous half, since it looks exactly like a
  # ledger that had simply not got there yet. It is now named.
  vrun attest verified 2 standard m001
  printf 't001\t-\tverified\t1\tstandard\t2026-07-01' >> "$W/truths/verify-ledger.tsv"
  [ -n "$(tail -c 1 "$W/truths/verify-ledger.tsv")" ] || { bad "fixture ends in a newline — the case would prove nothing"; return; }
  vrun validate
  expect_block "no line terminator"
}
acct_ledger_malformed_last_row_quarantines_id() {
  # `LAST row per id wins` is the published contract, and this is what it means when that last row
  # is unreadable: the id carries NO evidence — not the earlier valid row, and not the v1
  # frontmatter fallback. Reading it as "last VALID row wins" instead means a verification that
  # broke while being written RESURRECTS the previous `verified`, and scope then describes a state
  # the mine is not in. Same ruling as the unknown-verdict quarantine above, one layer down.
  vrun attest verified 2 standard m001
  vrun scope; expect_has "materials  1 converted · 1 verified (digest-bound)"   # the row really landed
  printf 'm001\tbroken\n' >> "$W/truths/verify-ledger.tsv"
  vrun scope
  expect_has "materials  1 converted · 0 verified (digest-bound) · 0 legacy-unbound · 0 stale · 0 failed · 1 unverified"
  vrun validate; expect_block "[LEDGER-MALFORMED]"
}
acct_ledger_malformed_then_valid_row_wins() {
  # The OTHER direction, and it must not be quarantined: a malformed row followed by a good one for
  # the same id is a repaired ledger. The good row wins — while the malformed one is still reported,
  # because a row that vanished silently would look identical to a ledger that never held it.
  printf 'm001\tbroken\n' >> "$W/truths/verify-ledger.tsv"
  vrun attest verified 2 standard m001
  vrun scope
  expect_has "materials  1 converted · 1 verified (digest-bound)"
  expect_has "[LEDGER-MALFORMED]"
  vrun validate; expect_block "[LEDGER-MALFORMED]"
}
acct_ledger_control_byte_in_standard_blocks() {
  # A control byte inside a field corrupts the row for the NEXT reader — the same fact then reads
  # two ways on two surfaces, which is the class this parser exists to end. Structure, not display:
  # the row fails the strict filter, so it covers nothing and blocks.
  vrun attest verified 2 standard m001
  printf 'm001\t-\tverified\t1\tstd\rwith-cr\t2026-07-01\n' >> "$W/truths/verify-ledger.tsv"
  vrun scope
  expect_has "materials  1 converted · 0 verified (digest-bound)"
  vrun validate; expect_block "[LEDGER-MALFORMED]"
}
acct_scope_ledger_unknown_verdict() {
  # The fail-open the cold review found: a typo'd verdict fell through to the digest compare and
  # counted as digest-bound. Now it is quarantined, named, and validate blocks on it.
  vrun attest verified 2 standard t001
  sed -i 's/\tverified\t/\tverifed\t/' "$W/truths/verify-ledger.tsv"
  vrun scope
  expect_has "0 verified (digest-bound)"
  expect_has "[LEDGER-VERDICT]"
  vrun validate
  expect_block "[LEDGER-VERDICT]"
}
acct_scope_ledger_unknown_verdict_material() {
  # The m-lane TWIN of the case above (v0.3.6). The truth lane slices the FILTERED ledger, but the
  # material lane read a bash map built BEFORE the quarantine — so the very same typo that covered
  # nothing for a truth counted digest-bound for a material. One quarantine, two lanes, one exempt.
  vrun attest verified 2 standard m001
  sed -i 's/\tverified\t/\tverifed\t/' "$W/truths/verify-ledger.tsv"
  vrun scope
  expect_has "materials  1 converted · 0 verified (digest-bound) · 0 legacy-unbound · 0 stale · 0 failed · 1 unverified"
  expect_has "[LEDGER-VERDICT]"
  vrun validate
  expect_block "[LEDGER-VERDICT]"
}
acct_scope_unknown_verdict_material_never_falls_back() {
  # Ruled 2026-08-04: quarantine is NOT the same as absence. An unreadable row must not open the
  # weaker v1 `status: verified` fallback, because that fallback (legacy-unbound) is not counted in
  # `owed` — so the fallback would let one typo REDUCE what a verify round owes. Unreadable
  # evidence is no evidence, and no evidence is owed.
  sed -i 's/^status: converted$/status: verified/' "$W/materials/m001/converted.md"
  vrun attest verified 2 standard m001
  sed -i 's/\tverified\t/\tverifed\t/' "$W/truths/verify-ledger.tsv"
  vrun scope
  expect_has "materials  1 converted · 0 verified (digest-bound) · 0 legacy-unbound · 0 stale · 0 failed · 1 unverified"
  expect_has "[LEDGER-VERDICT]"
}
acct_scope_unknown_verdict_material_stale_digest() {
  # The sharpest shape of the same rule, and the one the cold review used to attack the fix: the
  # material's BYTES demonstrably moved after its last attest. Reading the v1 frontmatter here
  # reported "nothing unverified" for a material anyone can see has changed. `owed` is monotone in
  # garbage — an unreadable row can only ever GROW a round, never shrink it.
  sed -i 's/^status: converted$/status: verified/' "$W/materials/m001/converted.md"
  vrun attest verified 2 standard m001
  printf '\n제9조 추가 조항.\n' >> "$W/materials/m001/converted.md"
  sed -i 's/\tverified\t/\tverifed\t/' "$W/truths/verify-ledger.tsv"
  vrun scope
  expect_has "materials  1 converted · 0 verified (digest-bound) · 0 legacy-unbound · 0 stale · 0 failed · 1 unverified"
  expect_hasnt "→ nothing unverified"
}
acct_scope_unknown_verdict_truth_never_falls_back() {
  # The TRUTH twin — the same rule, the other lane (the asymmetry that started this whole item).
  # t001 is named in the markdown '## Verified units', so a quarantined sidecar row used to be
  # rescued into legacy-unbound (not owed) by that mention. It must land owed instead.
  vrun attest verified 2 standard t001
  sed -i 's/\tverified\t/\tverifed\t/' "$W/truths/verify-ledger.tsv"
  vrun scope
  expect_has "truths     1 live · 0 verified (digest-bound) · 0 legacy-unbound · 0 stale · 0 failed · 1 unverified"
  expect_has "[LEDGER-VERDICT]"
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
acct_json_scope() {
  vrun scope --json
  expect_pass
  expect_has '"command":"scope"'
  expect_has '"owed":["m001"]'
  expect_has '"legacy_unbound":1'
}
acct_json_version() {
  vrun version --json
  expect_pass
  expect_has '"fingerprint"'
  expect_has '"schema_version":2'
}
meta_diag_code_table() {
  # FORMATS documents every code the runtime can emit, and documents no code it cannot — the table
  # is the contract's published half, so drift in EITHER direction is a defect. One emission shape:
  # `prob('CODE', …)` / `warn('CODE', …)`. Comment lines are skipped so a doc-comment quoting a code
  # is not mistaken for an emitted one — this runtime's comments quote codes constantly.
  #
  # THE ORPHAN DIRECTION IS BACK ON. While the port was partial it was checked only on the bash arm,
  # because a documented code whose only site was an unported command would have read as an orphan —
  # an assertion about how far the port had got, not about the contract. The port is complete and
  # the bash arm is gone, so leaving it off would mean nobody checks it at all, which is the
  # "a check that quietly stopped running" class this suite exists to prevent.
  local F="$REPO/.weavedoc/FORMATS.md" bad="" c emitted ne
  local -a SRC; mapfile -t SRC < <(node_sources)
  emitted=$(grep -hv "^[[:space:]]*//" "${SRC[@]}" | grep -oE "\b(prob|warn)\('[A-Z][A-Z0-9-]+'" \
            | sed -E "s/.*'([A-Z][A-Z0-9-]+)'/\1/" | LC_ALL=C sort -u)
  # VACUITY GUARD. An earlier draft of this line lost its escapes and `emitted` came out EMPTY,
  # which reported all 93 documented codes as orphans — loud, so it was caught. The quiet direction
  # is what this guards: an empty set makes the UNDOCUMENTED loop run zero times and pass.
  ne=$(printf '%s\n' "$emitted" | grep -c . || true)
  [ "${ne:-0}" -ge 50 ] || bad="$bad EXTRACTED-ONLY-${ne:-0}-CODES(the parse is broken, not the table)"
  for c in $emitted; do
    grep -q "\`$c\`" "$F" || bad="$bad UNDOCUMENTED:$c"
  done
  for c in $(grep -oE '^\| `[A-Z][A-Z0-9-]+`' "$F" | tr -d '|` ' | LC_ALL=C sort -u); do
    printf '%s\n' "$emitted" | grep -qx "$c" || bad="$bad ORPHAN:$c"
  done
  OUT="${bad:-all codes documented and all documented codes exist}"; RC=0
  if [ -z "$bad" ]; then ok; else bad "diagnostic code table drift:$bad"; fi
}
meta_uncoded_ratchet() {
  # Every diagnostic carries a code. The runtime makes the code a REQUIRED first parameter, so an
  # uncoded site cannot be written by accident — but "cannot happen" is what the bash runtime
  # believed too, and it was carrying uncoded sites. Counted, not assumed.
  local n coded
  local -a SRC; mapfile -t SRC < <(node_sources)
  n=$(grep -hv "^[[:space:]]*//" "${SRC[@]}" | grep -oE "\b(prob|warn)\(" | wc -l)
  coded=$(grep -hv "^[[:space:]]*//" "${SRC[@]}" | grep -oE "\b(prob|warn)\('[A-Z][A-Z0-9-]+'" | wc -l)
  OUT="prob/warn call sites: $n · carrying a code: $coded"
  RC=0
  if [ "${n:-0}" -eq "${coded:-0}" ]; then ok; else bad "prob/warn sites without a code: $(( n - coded ))"; fi
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
acct_golden_outputs_current() {
  # tests/baseline/golden/ is the record of what each command PRINTS on a clean minimal mine, and
  # until now NOTHING read it — it sat a whole release out of date (bundle 2026-08-05.1 next to a
  # 2026-08-05.2 runtime) while the suite stayed green. A snapshot nobody compares is a file, not a
  # record. Found by a cold review, 2026-08-05.
  #
  # This makes an intentional output change SHOW UP: the case fails until `bash tests/refresh-golden.sh`
  # is run, and the change then appears in that directory's diff where a reviewer can see it.
  #
  # version.txt is compared on its LABEL LINE ONLY. The fingerprint hashes the whole runtime, so
  # asserting it would demand a golden refresh on every lib edit — friction with no signal, since
  # what this case is for is OUTPUT drift, and doccheck already ties the label to the CHANGELOG.
  local G="$REPO/tests/baseline/golden" c bad=""
  for c in validate census scope status gaps; do
    [ -f "$G/$c.txt" ] || { bad="$bad MISSING:$c.txt"; continue; }
    ( cd "$W" && $TO "${WDRUN[@]}" "$c" ) > "$W/.g.$c" 2>&1
    cmp -s "$W/.g.$c" "$G/$c.txt" || bad="$bad DRIFT:$c"
  done
  ( cd "$W" && $TO "${WDRUN[@]}" version ) > "$W/.g.version" 2>&1
  local now golden
  now=$(head -1 "$W/.g.version"); golden=$(head -1 "$G/version.txt")
  [ "$now" = "$golden" ] || bad="$bad LABEL:golden='$golden' runtime='$now'"
  OUT="${bad:-golden snapshots match the current runtime}"; RC=0
  if [ -z "$bad" ]; then ok; else bad "golden drift —$bad (run 'bash tests/refresh-golden.sh' and review the diff)"; fi
}
acct_fingerprint_covers_lib() {
  # The fingerprint is the ONE spelling of "are these two installs the same runtime", and the Node
  # runtime is a dispatcher plus the modules under lib/ — an entrypoint-only hash reported
  # IDENTICAL for commit pairs differing solely in lib/ (v0.4.0 external review; f3b05f2 and
  # ef48366 are such commits). Proven on a COPY of the runtime: the shipped one must not be edited
  # by a test, and a copy is exactly what an install is. Runs the node runtime directly on both
  # arms — the bash fingerprint hashes its own single file and was never blind this way.
  cp -r "$REPO/.weavedoc/bin" "$W/.weavedoc/bin"
  cp "$REPO/.weavedoc/VERSION" "$W/.weavedoc/VERSION"
  local f1 f2 f3
  f1=$( cd "$W" && node .weavedoc/bin/weavedoc.mjs version 2>/dev/null | grep -m1 'fingerprint:' )
  [ -n "$f1" ] || { bad "no fingerprint line from the copied runtime — the fixture is broken, not the hash"; return; }
  printf '\n' >> "$W/.weavedoc/bin/lib/core.mjs"
  f2=$( cd "$W" && node .weavedoc/bin/weavedoc.mjs version 2>/dev/null | grep -m1 'fingerprint:' )
  [ "$f1" != "$f2" ] || { bad "a lib byte change did not change the fingerprint — the hash does not cover lib/"; return; }
  # ...including a SUBDIRECTORY (v0.5.1): the flat listing skipped lib/subdir/, and the manifest
  # globs the whole directory — the fingerprint must see exactly what ships.
  mkdir -p "$W/.weavedoc/bin/lib/subprobe"
  printf '// probe\n' > "$W/.weavedoc/bin/lib/subprobe/x.mjs"
  local f2b
  f2b=$( cd "$W" && node .weavedoc/bin/weavedoc.mjs version 2>/dev/null | grep -m1 'fingerprint:' )
  [ "$f2" != "$f2b" ] || { bad "a file in a lib SUBDIRECTORY did not change the fingerprint — the walk is not recursive"; return; }
  printf '\n' >> "$W/.weavedoc/bin/weavedoc.mjs"
  f3=$( cd "$W" && node .weavedoc/bin/weavedoc.mjs version 2>/dev/null | grep -m1 'fingerprint:' )
  [ "$f2" != "$f3" ] || { bad "an entrypoint byte change did not change the fingerprint"; return; }
  ok
}
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
  ( cd "$W" && "${WDRUN[@]}" reindex >/dev/null 2>&1 )
  vrun validate; expect_pass
  ( cd "$W" && "${WDRUN[@]}" retag 위약 벌칙 >/dev/null 2>&1 )
  OUT=$(cat "$W/truths/t002.md")
  expect_has "tags: [위약, 대금]"      # the BODY quote is untouched
  expect_hasnt "tags: [벌칙, 대금]"    # nothing rewrote it
  vrun validate; expect_pass           # and the seal still holds
}
pass_retag_still_rewrites_frontmatter() {
  ( cd "$W" && "${WDRUN[@]}" retag 위약 벌칙 >/dev/null 2>&1 )
  OUT=$(grep '^tags:' "$W/truths/t001.md"); expect_has "벌칙"
}
pass_crlf_retag() {
  # The fixture holds an INTERIOR BLANK LINE on purpose, and the assertion counts CRs instead of
  # detecting one (v0.5.1, external review P1-5): the old writer skipped empty lines when
  # re-attaching CRs, so a CRLF file came back MIXED — one bare LF in the middle — and this case
  # passed because "a CR survived somewhere" is true of a mangled file too. Command success is
  # asserted as well: it was not, and a failing rename would have passed the old spelling.
  printf -- '---\r\nid: t002\r\nclaim: "대금은 5천만원이다"\r\nsource: m001\r\ntags: [대금]\r\nstatus: ok\r\n---\r\n\r\n제3조 대금은 5천만원으로 한다.\r\n' > "$W/truths/t002.md"
  # ...and t002 must be a truth the mine ACCEPTS, or retag's post-validate rejects and rolls back —
  # at which point this case measures the ROLLBACK's byte preservation, not the writer's. That is
  # exactly what the pre-v0.5.1 spelling had been doing without saying so: the old fixture failed
  # validation (t002 missing from coverage), every run rolled back, and "CR survived" was true of
  # the RESTORED file. The success assertion below is what forced this to the surface.
  sed -i 's/^- 대금 조항: (아직 추출 안 함)$/- 대금 조항: t002/' "$W/truths/coverage.md"
  # Counted with tr|wc -c, not grep (MSYS grep reads files in text mode, so CR patterns never fire)
  # and not od (the od-token spelling miscounted on the macOS leg — cr=7 for a 9-CR file — and the
  # fixture guard then failed the case for its own counter's sake). tr -cd is byte-exact on all
  # three platforms; the redirect keeps MSYS text-mode out of the path.
  crcount() { tr -cd '\r' < "$1" | wc -c | tr -d ' '; }
  lfcount() { tr -cd '\n' < "$1" | wc -c | tr -d ' '; }
  local crb lfb; crb=$(crcount "$W/truths/t002.md"); lfb=$(lfcount "$W/truths/t002.md")
  [ "$crb" = "$lfb" ] || { bad "fixture is not uniformly CRLF (cr=$crb lf=$lfb) — the case would prove nothing"; return; }
  vrun retag 대금 금액
  expect_pass
  local cra lfa; cra=$(crcount "$W/truths/t002.md"); lfa=$(lfcount "$W/truths/t002.md")
  [ "$cra" = "$crb" ] && [ "$lfa" = "$lfb" ] || { OUT="$(cat -A "$W/truths/t002.md" | head -6)"; bad "line endings changed: cr $crb->$cra lf $lfb->$lfa — a mixed-EOL file is a whole-file diff waiting to happen"; return; }
  [ "$(crcount "$W/truths/t001.md")" = 0 ] || { OUT="$(cat -A "$W/truths/t001.md" | head -4)"; bad "retag introduced CR into an LF file"; return; }
  OUT="(line endings preserved both ways: cr=$cra lf=$lfa)"; ok
}
pass_space_in_path() {
  # Lives under the per-run mktemp workspace like every other fixture — the trap cleans it, and
  # `set -u` is why a stale variable here dies loudly instead of writing into a shared /tmp path.
  local sw="$WORK/space-$$/with space/proj"
  rm -rf "$WORK/space-$$" 2>/dev/null; mkdir -p "$WORK/space-$$/with space"
  cp -r "$PRISTINE" "$sw"
  OUT=$( ( cd "$sw" && $TO "${WDRUN[@]}" validate ) 2>&1 ); RC=$?
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
  ( cd "$p" && "${WDRUN[@]}" reindex >/dev/null 2>&1 )
  OUT=$( ( cd "$p" && $TO "${WDRUN[@]}" validate ) 2>&1 ); RC=$?
  expect_pass
}

# ---------------------------------------------------------------- accounting (examined:)

acct_clean() { vrun validate; expect_has "truths 1 (1 sealed)"; }
acct_sealfail() {
  printf -- '---\nid: t002\nclaim: "지체상금은 일 0.1%%다"\nsource: m001\ntags: [위약]\nstatus: ok\n---\n\n제9조 지체상금은 일 0.1%%로 한다.\n' > "$W/truths/t002.md"
  ( cd "$W" && "${WDRUN[@]}" reindex >/dev/null 2>&1 )
  vrun validate; expect_has "1 sealed · 1 seal FAILED"
}
acct_tombstone() {
  printf -- '---\nid: t002\nclaim: "지체상금 조항이 있다"\nsource: m001\ntags: [위약]\nstatus: retracted\n---\n' > "$W/truths/t002.md"
  printf -- '- removed: t002 (2026-07-30) — 원문에 없었다\n' >> "$W/truths/changelog.md"
  ( cd "$W" && "${WDRUN[@]}" reindex >/dev/null 2>&1 )
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
acct_diag_paths_are_relative() {
  # Decision ② (2026-08-04), the half that was missed. Diagnostics print PROJECT-RELATIVE paths —
  # every one of them, not just the truths awk's. An absolute path in a message makes the message
  # depend on WHERE the mine sits, which is how the same diagnostic reads /d/repo/x under MSYS and
  # D:/repo/x under a native runtime: one directory, two spellings, and stdout parity broken on
  # exactly the lines a broken mine prints.
  #
  # Deliberately a MINE, not a grep of the source: the first round of this fix hunted by reading and
  # found "2 kinds" where a broken mine found 4, and this case exists because measuring 345 mines
  # afterwards found 20 more. So the assertion is on OUTPUT, and the mine is made broken in several
  # unrelated ways at once — a shell-side material check, a catalog cross-check and a plan check —
  # so that fixing one family cannot make this go quiet about the others.
  mkdir -p "$W/materials/m002"                                   # MAT-NO-CONVERTED  (shell, $MATERIALS)
  printf -- '- t999\n' >> "$W/documents/d1/plan.md"               # (keeps plan.md a file)
  sed -i 's/^cited_truths: .*/cited_truths: [t001, t999]/' "$W/documents/d1/plan.md"   # PLAN-CITED-DANGLING ($p)
  vrun validate
  expect_block "no converted.md"
  expect_has "materials/m002/"
  expect_has "documents/d1/plan.md"
  # THE assertion. `$W` is the mine root; no diagnostic may name it. Checked on the whole output so
  # a code nobody thought to list is covered too.
  case "$OUT" in
    *"$W"*) bad "a diagnostic printed the absolute mine root: $(printf '%s\n' "$OUT" | grep -F "$W" | head -1)" ;;
    *) ok ;;
  esac
}
acct_diag_order_is_specified() {
  # The ORDER of the truths pass's diagnostics is part of what this tool promises, not a by-product
  # of gawk's hash. Nine families come out of `for (k in array)`, and gawk leaves that order
  # unspecified — measured 2026-08-04, it is not sorted at any real scale, so these five printed as
  # `status source claim tags id`. Nothing but gawk can reproduce that, and it is not a promise the
  # tool ever meant to make.
  #
  # The mine is a truth carrying NONE of the required fields, which is the ordinary broken state
  # (not a contrived one) — and the assertion is the whole run of five in one string, so a change to
  # any single position fails. Asserting each id separately would pass on any permutation.
  printf -- '---\nnothing: here\n---\n\n제7조 위약금은 계약금액의 10%%로 한다.\n' > "$W/truths/t002.md"
  vrun validate
  local seen
  seen=$(printf '%s\n' "$OUT" | grep -F "[FM-MISSING] truths/t002.md" \
         | sed -E "s/.*frontmatter '([a-z_]+)' missing.*/\1/" | tr '\n' ' ')
  seen=${seen% }
  if [ "$seen" = "claim id source status tags" ]; then ok
  else bad "truth FM-MISSING order is '$seen', want 'claim id source status tags' (schema order sorted; an unspecified order cannot be ported)"; fi
}
acct_retag_paths_are_relative() {
  # The third and last surface that printed an absolute path, found by sweeping EVERY remaining
  # command over the corpus rather than by fixing the one in front of me — which is how the first
  # two rounds of this missed `impact` and then `retag`. All four of retag's print sites are
  # exercised: a truth file, project.md, a plan, and the free-text list.
  # The pristine's required_tags is empty, so the project.md site is UNREACHABLE without this line —
  # asserting on it unchanged would have been an assertion about a branch that never ran.
  sed -i 's/^required_tags: \[\]$/required_tags: [위약]/' "$W/project.md"
  printf -- '\n위약 이야기\n' >> "$W/gaps.md"
  vrun retag 위약 벌칙 --dry
  expect_pass
  expect_has "truths/t001.md (tags)"
  expect_has "documents/d1/plan.md (scope_tags)"
  expect_has "project.md (required_tags)"
  case "$OUT" in
    *"$W"*) bad "retag printed the absolute mine root: $(printf '%s\n' "$OUT" | grep -F "$W" | head -1)" ;;
    *) ok ;;
  esac
}
acct_impact_paths_are_relative() {
  # The same rule one door over, and the reason this is a SECOND case: `impact` prints its file
  # lists DIRECTLY, so the diagnostic-side fix cannot reach them and a case that only ran validate
  # reported "no absolute paths" while impact was absolute in 326 of the 345 case mines. All three
  # of its lists are exercised — the id grep, the title grep, and the cited_truths chain — because
  # they are three separate print sites and fixing one says nothing about the others.
  vrun impact m001
  expect_pass
  expect_has "documents/d1/plan.md"
  case "$OUT" in
    *"$W"*) bad "impact printed the absolute mine root: $(printf '%s\n' "$OUT" | grep -F "$W" | head -1)" ;;
    *) ok ;;
  esac
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
# Syntax-check the entrypoint before building a fixture: a runtime that does not parse fails every
# case identically and buries the one line that says why.
node --check "$REPO/$WD_ENTRY" || { echo "!! $WD_ENTRY does not parse"; exit 2; }
mkpristine
OUT=$( ( cd "$PRISTINE" && "${WDRUN[@]}" validate ) 2>&1 ) || {
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
