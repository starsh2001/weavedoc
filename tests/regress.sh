#!/usr/bin/env bash
# WeaveDoc regression suite — tracked in tests/ since Phase 0 (IMPROVEMENT_PLAN WD-QA-001).
#
# Fixtures: a per-run mktemp workspace, removed on exit — parallel runs cannot collide.
# Results: a keyed cache dir under $TMPDIR (key = commit + bundle bytes + OS + tool versions),
# which is what makes --resume safe across exactly one thing: the same configuration.
#
#   bash tests/regress.sh            # every case (parallel)
#   bash tests/regress.sh gate       # only cases whose name contains "gate"
#   bash tests/regress.sh -j1 gate   # serially, for debugging
#   bash tests/regress.sh --one NAME # exactly one case, output inline — SEALS after printing:
#                                    # rc 2 if the tree moved mid-run, even on a PASS (+~40%,
#                                    # it computes the key a second time)
#
# (The paths said `notes/` — where this suite lived before Phase 0 moved it here, years of edits
# ago in this file's terms. Corrected 2026-08-07 with the timing below, which was equally stale.)
#
# On MSYS/Windows a case costs ~1.8s — a fixture copy plus one CLI run — and the whole sweep ~7min
# at -j6; the same sweep is ~30s in the Linux container, which is why the pre-tag rule uses it.
# Cases run in parallel, each in its own copy of the fixture. Each case starts from a pristine minimal project (1 material ·
# 1 truth · 1 document · final.md) that validates clean, mutates it, and asserts on the output.
# A case named block_* must be REJECTED for a named reason; pass_* must not be rejected at all;
# acct_* asserts on the `examined:` accounting line.

set -u
REPO=$(cd "$(dirname "$0")/.." >/dev/null 2>&1 && pwd)

# A CLEAN GIT ENVIRONMENT FOR THE WHOLE PROCESS — sourced above the key, so every git call in this
# file and in every case is isolated without carrying flags of its own. Two of them read this
# repository and two build throwaway ones, and an inherited git environment corrupts both halves
# (tests/git-env.sh records what leaked before, measured).
# shellcheck source=tests/git-env.sh
. "$REPO/tests/git-env.sh" || { echo "tests/git-env.sh could not be sourced — refusing to run git half-isolated"; exit 2; }

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
# `.claude/skills` was briefly added here and is OUT again (cold review, v0.5.14): the reason
# given — "renaming a skill file to identical bytes moves the manifest but not the key" — does
# not reproduce. make-manifest.sh reads the INDEX (`git ls-files` + `git cat-file blob :<path>`),
# which a working-tree rename does not touch, and a STAGED rename moves the key through the index
# hash anyway. Keeping it only widened the surface on which a stray untracked file fires the seal.
key_paths() { ( cd "$1" && find tests .weavedoc/templates .weavedoc/bin .weavedoc/schemas -type f -print0 2>/dev/null | sort -z | tr '\0' '\n' ); }

# WORKERS INHERIT THE KEY — they do not recompute it (v0.5.12). The block below spawns ~25
# processes (git, find, sort, xargs, sha256sum ×6, node/uname/bash/awk/sed --version …), which is
# free on Linux and is the single largest per-case cost on Windows, where MSYS emulates fork at
# ~0.4s per spawn: measured 5.2s per case end to end, most of it here, for a key the PARENT already
# computed and that cannot differ (same commit, same bytes, same tools — the worker is the same
# process tree). The parent exports WD_REG_RES; a worker takes it and skips straight to the run.
# Set only by this script for its own children, so a human running `--one` still keys normally.
if [ -n "${WD_REG_RES:-}" ]; then
  RES="$WD_REG_RES"
  CACHE=$(dirname "$RES")
  KEY="${WD_REG_KEY:-inherited}"
else
# A FUNCTION, because the key is computed TWICE (v0.5.13): once to name the cache, and once when
# the workers are done, to prove the tree did not move under them. Two spellings would be two
# answers about the same bytes — the class this repo keeps closing — so there is one.
compute_key() { { git -C "$REPO" rev-parse HEAD 2>/dev/null
         cat "$REPO/.weavedoc/VERSION" 2>/dev/null
         # WD_BIN itself: two different invocations of the same commit are different configurations
         # and must not share a result cache, or `--resume` would hand one implementation's results
         # to the other and call the run green.
         printf '%s\n' "$WD_BIN"
         # The WHOLE runtime's bytes, not just the entrypoint. The entrypoint is a thin dispatcher
         # whose behavior lives in bin/lib/, so a key that hashed only $WD_ENTRY let a dirty lib
         # edit reuse the previous run's results under --resume (the v0.4.0 external review's
         # finding; HEAD only covers COMMITTED edits).
         # THE WHOLE bin/ TREE, never named files (cold review, v0.5.14). Naming weavedoc.mjs and
           # bin/lib left anything else under bin/ CONTENT-blind while key_paths kept only its path,
           # so editing a `bin/extra.mjs` moved nothing — measured: `--resume` replays the old PASS
           # and a fresh run fails. The invariant cases police "whatever .mjs sits under bin/", so
           # the key must cover the same set. It does NOT subsume the $WD_ENTRY hash below — this
           # comment said it did, and v0.5.15 deleted that line on the strength of the sentence
           # before measuring it (WD_BIN takes any project-relative path, and one outside bin/ went
           # unkeyed). Corrected with the line, v0.5.17.
           { sha256sum "$REPO/.weavedoc/schema"
           # THE VERSIONED CONTRACTS TOO (bundle 2026-08-08.4). `schema` is one file and from v3 the
           # bundle ships more beside it; keying only the old path meant a dirty `schemas/v3` edit
           # was invisible to `--resume`, which replayed the previous PASS while a fresh key failed
           # — measured, and the same class v0.5.14/.15 closed for `bin/`. A whole tree, never named
           # files, for the same reason: a contract added later must not be able to ship unkeyed.
           find "$REPO/.weavedoc/schemas" -type f -print0 2>/dev/null | sort -z | xargs -0 -r sha256sum
           find "$REPO/.weavedoc/bin" -type f -print0 | sort -z | xargs -0 sha256sum
           # EVERYTHING a case consumes is configuration (v0.5.2 keyed the faultinject drivers;
           # review #6 named the rest of the class): doccheck.sh and ctlscan.mjs are RUN by cases,
           # the golden files are COMPARED by one, and the pristine fixture copies a template out
           # of .weavedoc/templates — a dirty edit to any of them changes what a case measures
           # without changing the case, and --resume would hand back the stale result. The *.sh
           # glob keys this harness's own bytes too (v0.5.1), so the separate self-hash is gone.
           # THE ENTRYPOINT UNDER TEST, wherever it lives (external review, v0.5.16). v0.5.15 dropped
           # this line as "redundant with the bin/ tree" — but WD_BIN takes any project-relative
           # path, and `.weavedoc/alt-entry.mjs` is not under bin/: measured, editing it left the key
           # still and `--resume` replayed a PASS for a runtime that now exits 9. Cheap and exact.
           sha256sum "$REPO/$WD_ENTRY"
           # RECURSIVE for the same reason: a future tests/helpers/x.sh is content-blind to a
           # top-level glob. baseline/ is pruned — only its two manifest files are read by a case
           # and they are hashed by name below.
           find "$REPO/tests" -path "$REPO/tests/baseline" -prune -o -type f -name "*.sh" -print0 -o -type f -name "*.mjs" -print0 | sort -z | xargs -0 sha256sum
           # ...and the DOCS those scripts read (review #7): the doccheck case greps README,
           # CHANGELOG and FORMATS — a dirty edit there changes what it measures too.
           sha256sum "$REPO/README.md" "$REPO/CHANGELOG.md" "$REPO/.weavedoc/FORMATS.md"
           find "$REPO/tests/baseline/golden" "$REPO/.weavedoc/templates" -type f -print0 | sort -z | xargs -0 sha256sum
           # EVERY FILE A CASE READS LIVE, or the seal below cannot mean what it says (cold review,
           # v0.5.13): meta_manifest_baseline_current reads the baseline manifest pair, and the
           # manifest it regenerates covers READ.md and the shipped skills — none of which were
           # keyed, so those three could move mid-run under an unchanged key and the run would
           # still print a total. Measured: appending a row to bundle.manifest mid-run failed the
           # case with no refusal at all.
           sha256sum "$REPO/.weavedoc/READ.md" "$REPO/tests/baseline/bundle.manifest" "$REPO/tests/baseline/bundle.manifest.sha256"
           find "$REPO/.claude/skills" -type f -print0 | sort -z | xargs -0 sha256sum
           : ; } 2>/dev/null | awk '{print $1}'
         # …and the INDEX, hashed WHOLE and OUTSIDE that awk (external review, v0.5.14). It was
         # inside, where `awk '{print $1}'` keeps only the first field — for `git ls-files -s` that
         # is the file MODE, so the blob SHAs and paths were discarded and the index was never
         # really in the key. Measured: edit a file, start a sweep, `git add` it mid-run — 491/491
         # and `--resume` reuses the stale PASSes, while a fresh-salt run fails on manifest drift.
         # make-manifest.sh hashes `git cat-file blob :<path>`, i.e. STAGED bytes, so the index is
         # configuration for every case that reads that manifest.
         # No -u flags here any more (external review, v0.5.17): the three this line carried were
         # unset HERE and left standing in make-manifest.sh, so the key read the default index while
         # the manifest the key is supposed to cover read the alternate one — same key, different
         # manifest, `--resume` replaying a PASS that the fresh run fails. tests/git-env.sh, sourced
         # at the top, now clears the whole set for the process, so no git call carries its own.
         git -C "$REPO" ls-files -s -z 2>/dev/null | sha256sum
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
       } | sha256sum | awk '{print $1}' | cut -c1-12 ; }
KEY=$(compute_key)

# THE SEAL, as a function so the REFUSAL ITSELF can be exercised (cold review, v0.5.13). The first
# version was a bare `if` at the tally and a source-shape case that counted its text — and text is
# not behaviour: mutating `exit 2` to `exit 0`, or making the condition unreachable, left the case
# green while the seal was dead. `--seal-check <key>` runs exactly this, so a case can hand it a
# key that cannot match and assert the whole outcome — message, cache deletion, exit code.
seal_or_refuse() {
  local started="$1" now
  now=$(compute_key)
  [ "$now" = "$started" ] && return 0
  rm -rf "$RES" 2>/dev/null
  echo
  echo "!! the tree changed while the suite was running — key $started at start, $now now."
  echo "   Results describe a mix of two source states, so there is no total to report."
  echo "   The result cache was discarded; re-run on a quiet tree."
  exit 2
}
# The key's own vacuity guard: the path half runs inside 2>/dev/null, so a broken key_paths would
# not fail — it would just leave the key path-blind again. Checked loudly, once, here.
[ -n "$(key_paths "$REPO" 2>/dev/null)" ] || { echo "key_paths produced nothing — the resume key lost its path half"; exit 2; }
CACHE="${TMPDIR:-/tmp}/wd-reg-$KEY"
RES="$CACHE/res"
fi
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
BATCH=""
SEALCHECK=""
RESUME=0
LIMIT=0
while [ $# -gt 0 ]; do
  case "$1" in
    -j*) JOBS=${1#-j} ;;
    -n*) LIMIT=${1#-n} ;;
    --one) ONE="$2"; shift ;;
    # --batch takes EVERY remaining argument as a case name: one bash process runs the whole chunk
    # instead of one per case (v0.5.12). Internal — the driver's fan-out uses it; humans use --one.
    --batch) shift; BATCH="$*"; break ;;
    # Runs the seal against a key you supply and nothing else — so the refusal path itself is
    # testable (see meta_key_seal_refuses_and_clears).
    --seal-check) SEALCHECK="$2"; shift ;;
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
    printf 'review_legacy: 2026-07-30\n'
    printf -- '---\n\n'
    printf '%s\n\n' "$head"
    [ -n "$body" ] && printf '%s\n\n' "$body"
    printf '# Findings\n\n'
    printf '# Adjudications\n\n'
    printf '# Human queue\n'
  } > "$root/documents/d1/review.md"
  # NOT auto-sealed: a sealed review enforces its digests on ANY mine, so sealing here would
  # stale the context under every case that touches a truth or the config (a real 29-case pileup
  # taught this). The pristine carries review_legacy instead (schema v3): the marker is the ONE
  # legitimate digest-less state next to a final — migrated v1 history — so 250+ cases mutate
  # freely while the gate stays honest. Seal-needing cases run mk_sealed AFTER their mutations,
  # which strips the marker and seals for real (a sealed review and the marker cannot coexist).
}
strip_seal() { # $1=review.md — remove the seal fields (the tamper the v2 gate must catch)
  sed -i '/^reviewed_kind:/d; /^reviewed_digest:/d; /^review_context_digest:/d' "$1"
}
mk_sealed() { # give the workspace a REAL review seal — the state where seal enforcement applies.
  # (Before schema v3 this promoted the v1 pristine to v2; the version axis is gone — the
  # pristine is v3 from birth and what varies is only whether d1's review is sealed or rides
  # the review_legacy marker.) seal-review must not run under the marker — a sealed review and
  # v1-history are contradictory states — so the marker goes first, exactly the order a real
  # migrated mine follows.
  sed -i '/^review_legacy:/d' "$W/documents/d1/review.md"
  # The suite is not `set -e`: a silent seal-review failure here would hand every v2 case an
  # UNSEALED mine, and the strip_seal block cases would then pass for the wrong reason (never
  # sealed is observably identical to stripped). A helper failure is a case failure, loudly.
  ( cd "$W" && "${WDRUN[@]}" seal-review d1 draft >/dev/null 2>&1 ) \
    || bad "mk_sealed: seal-review failed — the case would assert against an unsealed mine"
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
    printf -- '---\nid: %s\nclaim: "자료%d의 조항 %d이 유효하다"\nsource: %s\nlocation: "제%d조"\ntags: [스케일, 조항%d]\nprovenance: stated\n---\n\n제%d조 자료%d의 조항 %d은 유효하다.\n' \
      "$tid" "$mi" "$line" "$mid" "$line" "$line" "$line" "$mi" "$line" > "$W/truths/$tid.md"
    printf -- '- added: %s (2026-07-30)\n' "$tid" >> "$W/truths/changelog.md"
  done
  printf -- '---\nstatus: passed\nround: 1\nverified_at: 2026-07-30\n---\n\n## Verified units\n\n## Adjudications\n\n## Human queue\n' > "$W/truths/verify.md"
  ( cd "$W" && "${WDRUN[@]}" reindex >/dev/null 2>&1 ) || bad "mkscale: reindex failed"
  mint
}
pass_locale_emoji_claim() {
  # gawk 5.0's multibyte machinery misread emoji-bearing claim lines under UTF-8 locales: five
  # valid truths on a real mine reported FM-MISSING under ko_KR.UTF-8 while passing under C —
  # the verdict depended on which locale the shell happened to inherit (v0.3.4 latent, found by
  # a session-locale change). Content-parsing awks are byte-pinned (LC_ALL=C) now; the same
  # mine must validate identically under both locales. A missing ko_KR locale degrades to C
  # behaviour, so the case cannot false-fail where the locale is not generated.
  printf -- '---\nid: t002\nclaim: "품질 심사 — 🔴 즉시 수정, 🟡 확인 필요, 🟢 통과"\nsource: m001\ntags: [위약]\nprovenance: stated\n---\n\n제7조 위약금은 계약금액의 10%%로 한다.\n' > "$W/truths/t002.md"
  printf -- '\n- 심사: t002\n' >> "$W/truths/coverage.md"
  printf -- '- added: t002 (2026-07-30)\n' >> "$W/truths/changelog.md"
  ( cd "$W" && "${WDRUN[@]}" reindex >/dev/null 2>&1 )
  mint
  OUT=$( ( cd "$W" && LC_ALL= LANG=ko_KR.UTF-8 $TO "${WDRUN[@]}" validate ) 2>&1 ); RC=$?
  expect_pass
  OUT=$( ( cd "$W" && LC_ALL=C $TO "${WDRUN[@]}" validate ) 2>&1 ); RC=$?
  expect_pass
}
pass_locale_scope_census_match() {
  # The locale pin, extended to the two commands the sweep missed (2026-08-04). scope classified
  # truths with an unpinned awk and SLICED THE LEDGER WITH AN UNPINNED GREP: GNU grep calls a
  # stream holding invalid UTF-8 "binary" under a multibyte locale and prints one sentence instead
  # of the matching rows, so scope reported different verify debt — and fabricated a ghost id out
  # of the sentence — depending on which locale the shell happened to inherit. The `standard`
  # column is free-form text a Korean console can easily fill with CP949 bytes. Byte semantics,
  # one verdict. A missing ko_KR locale degrades to C, so this cannot false-fail where it is absent.
  printf -- '---\nid: t002\nclaim: "품질 심사 — 🔴 즉시 수정, 🟡 확인 필요, 🟢 통과"\nsource: m001\ntags: [위약]\nprovenance: stated\n---\n\n제7조 위약금은 계약금액의 10%%로 한다.\n' > "$W/truths/t002.md"
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
acct_pull_table_preview_counts() {
  # D2 (field report): a table-bodied truth previewed as its header row alone — a reviewer
  # decided "the mine has no runtime lengths" while every length sat in the table body. The
  # preview now says it is a table and how big.
  printf -- '---\nid: t002\nclaim: "수록곡 길이 표"\nsource: m001\ntags: [위약]\nprovenance: stated\n---\n\n| # | 곡 | 길이 |\n|---|---|---|\n| 1 | 서곡 | 3:10 |\n| 2 | 종곡 | 4:02 |\n' > "$W/truths/t002.md"
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
  printf -- '---\nid: t002\nclaim: "앨범은 6곡으로 계획되었다"\nsource: m002\ntags: [음악]\nprovenance: derived\nderived_from: [m002]\nassumptions: [발매 전 변경 가능]\nas_of: 2026-07-01\n---\n\n6곡 앨범을 계획한다.\n' > "$W/truths/t002.md"
  printf '\n## m002\n\n- 계획: t002\n' >> "$W/truths/coverage.md"
  printf -- '- added: t002 (2026-07-30)\n' >> "$W/truths/changelog.md"
  mint
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
  expect_has "truth(s)"
}

mkpristine() {
  rm -rf "$PRISTINE" 2>/dev/null
  mkdir -p "$PRISTINE"
  cp -r "$REPO/.weavedoc" "$PRISTINE/.weavedoc"
  cp "$REPO/.weavedoc/templates/config.yaml" "$PRISTINE/.weavedoc/config.yaml"
  mkdir -p "$PRISTINE/inbox" "$PRISTINE/materials/m001" "$PRISTINE/truths" "$PRISTINE/documents/d1"

  cat > "$PRISTINE/project.md" <<'EOF'
---
version: 3
language: ko
roles: [계약서]
tone: 담백
required_tags: []
---

최소 픽스처 프로젝트.
EOF
  # The pristine mine is v3 from birth (the template config already says version: 3), and its
  # two machine-owned state files exist in the canonical form init promises — the allocator's
  # next counters sit ABOVE t001/m001, or the very first grant would collide.
  mkdir -p "$PRISTINE/.weavedoc-state"
  printf '{\n  "version": 1,\n  "open": []\n}\n' > "$PRISTINE/.weavedoc-state/conflicts.json"
  printf '{\n  "version": 1,\n  "next": {\n    "conflict": 1,\n    "material": 2,\n    "truth": 2\n  }\n}\n' > "$PRISTINE/.weavedoc-state/id-sequences.json"

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

# SUBSTRING TESTS RUN IN THE SHELL, not in a grep (v0.5.12). These three fire 613 times across the
# suite and each `printf | grep -qF` was two processes — free on Linux, ~330ms on Windows, where
# MSYS emulates fork and serialises process creation globally. `case` with a QUOTED variable is a
# literal match (no globbing of $1) over the whole string, which is what `grep -qF` did line by
# line: identical for the single-line needles every caller passes, and the suite's own results are
# the proof — 487/487 unchanged, byte for byte, before and after.
has() { case "$OUT" in *"$1"*) return 0 ;; *) return 1 ;; esac; }
expect_block() { # $1 = substring the rejection must name
  if [ "$RC" -eq 0 ]; then bad "expected rejection, got a pass"
  elif ! has "$1"; then bad "rejected, but not for [$1]"
  else ok; fi
}
expect_pass() { if [ "$RC" -ne 0 ]; then bad "expected a pass, got rejection"; else ok; fi; }
expect_has()   { has "$1" || bad "output lacks [$1]"; ok; }
expect_hasnt() { has "$1" && bad "output must not contain [$1]"; ok; }

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
    printf -- '---\nround: 1\nreview_legacy: 2026-07-30\n---\n\n'
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
  vrun status --open
  expect_has "comment that swallows"
  expect_hasnt "nothing is waiting on you"
  vrun consecrate d1
  expect_block "comment structure that hides"
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
block_gate_single_line_archive_before_comment() {
  # THE SUFFIX IS SOURCE TEXT, NOT PROSE (external review, bundle 2026-08-08.2). Every swallow case
  # above writes the MULTI-LINE shape, so the single-line form that 2026-08-08.1 declared as a
  # behaviour change shipped with no case at all — and the suffix a writer is most likely to reach
  # for, an adjacent comment, is exactly the one the old "live prose" wording implied was fine.
  # All three surfaces are asserted because all three carried that wording.
  REV ''
  printf -- '\n<!-- 라운드 1 보관 - [contradiction] 3장 — 해소됨 --><!-- 감사 -->\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_block "closing '-->' is followed by"
  vrun status --open
  expect_has "comment that swallows"
  expect_has "more source text after the '-->'"
  vrun consecrate d1
  expect_block "followed by more source text on the same line"
}
pass_gate_single_line_archive_arrow_eol() {
  # THE MIRROR, without which the case above passes against a reader that blocks every single-line
  # comment: the same archive whose closer ENDS its line stays legal, and trailing horizontal
  # blanks are trimmed rather than counted as a suffix. Blank-vs-suffix is the whole boundary.
  # MUTATION NOTE: the blank rule is carried by a PAIR of trims (leading and trailing) and either
  # one alone collapses an all-blank suffix to '', so removing just one is survivable by design.
  # The mutations this case actually kills are dropping `suffix !== ''` or dropping both trims.
  REV ''
  printf -- '\n<!-- 라운드 1 보관 - [contradiction] 3장 — 해소됨 -->   \n' >> "$W/documents/d1/review.md"
  vrun validate; expect_pass
  vrun status --open
  expect_hasnt "comment that swallows"
  vrun consecrate d1
  expect_hasnt "more source text on the same line"
}
block_review_unterminated_fence() {
  # 2026-08-08.1 added this check and shipped it with NO case. It also narrowed
  # HQ-UNTERMINATED-FENCE to truths/verify.md (`hqf === vmd`), handing review.md to this diagnostic
  # instead — a handoff nothing counted. Both halves are pinned: the new code fires, and the queue
  # code no longer answers for this file.
  REV ''
  printf -- '\n```md\n- [open] [user-only] BEHIND-AN-OPEN-FENCE\n' >> "$W/documents/d1/review.md"
  vrun validate
  expect_block "REVIEW-UNTERMINATED-FENCE"
  expect_hasnt "HQ-UNTERMINATED-FENCE"
  vrun status --open
  expect_has "unterminated code fence"
}
block_review_unterminated_frontmatter() {
  # Frontmatter is an explicit capability of review.md, and an unclosed block parses the WHOLE file
  # as metadata — the gate heading is then not a heading at all. Shipped in 2026-08-08.1 with no
  # case; verify.md's twin (block_hq_unterminated_frontmatter) has had one since that bundle.
  REV ''
  # line 5 is the closing fence now (review_legacy rides inside the frontmatter)
  sed -i '5d' "$W/documents/d1/review.md"
  vrun validate
  expect_block "REVIEW-UNTERMINATED-FRONTMATTER"
  vrun status --open
  expect_has "unterminated frontmatter"
}
block_hq_unterminated_comment() {
  # The truths side of the same silence. review.md had REVIEW-UNTERMINATED-COMMENT already;
  # truths/verify.md had nothing, so its Human queue could vanish behind a forgotten opener while
  # validate stayed green. 2026-08-08.1 closed it and did not execute it.
  printf -- '\n<!-- 보관 시작\n- [open] [user-only] BEHIND-AN-OPEN-COMMENT\n' >> "$W/truths/verify.md"
  vrun validate
  expect_block "HQ-UNTERMINATED-COMMENT"
  vrun status --open
  expect_has "unterminated '<!--'"
}
block_gate_stray_arrow() {
  # `-->` in ordinary prose LATER in the file rebalances the count, so the file does not end inside
  # a comment — and everything between the two markers, violations included, is blanked out.
  REV '<!-- 보관
- [contradiction] 3장 — t001과 모순'
  printf '\n초안 2장 --> 3장 순서로 읽는다.\n' >> "$W/documents/d1/review.md"
  vrun status --open
  expect_has "declared review section hidden"
  expect_hasnt "nothing is waiting on you"
  vrun consecrate d1
  expect_block "comment structure that hides"
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
    printf -- '---\nround: 2\nreview_legacy: 2026-07-30\n---\n\n'
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
block_review_directory_is_unknown_not_absent() {
  rm -f "$W/documents/d1/review.md"
  mkdir "$W/documents/d1/review.md"
  vrun validate
  expect_block "[REVIEW-UNREADABLE]"
  expect_hasnt "[GATE-NO-REVIEW]"
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
block_gate_unknown_kind_deep_heading() {
  # A heading is not an escape hatch for an unknown, non-placeholder gate slot.
  REV '## [typo] OPEN'
  vrun validate; expect_block "[REVIEW-KIND-UNKNOWN]"
}
block_gate_unknown_kind_boundary_heading() {
  # This same-level heading ends the zone for following lines, but it was encountered while the
  # gate was live and must be classified before the boundary takes effect.
  REV '# [typo] OPEN'
  vrun validate; expect_block "[REVIEW-KIND-UNKNOWN]"
}
block_gate_template_boundary_cannot_close_clean() {
  # A pure placeholder is template noise only inside the gate. At the gate's heading tier it also
  # closes the Markdown section, so accepting it as noise would launder the real record after it.
  REV '# [<kind>] <where> — <what>'
  sed -i '/^# Findings$/i - [typo] REAL-VIOLATION-AFTER-TEMPLATE-BOUNDARY' "$W/documents/d1/review.md"
  vrun status --open
  expect_has "fidelity violations (1):"
  expect_has "[<kind>]"
  expect_hasnt "nothing is waiting on you"
  vrun validate; expect_block "consecrated through an open gate"
  vrun consecrate d1
  expect_block "open gate"
  expect_has "[<kind>]"
}
block_gate_boundary_heading_kind_not_laundered() {
  # A boundary line was encountered while the gate was live, so a known kind on that line remains
  # a gate blocker even though the heading owns subsequent lines as outside-zone history.
  REV '# Section [contradiction] OPEN'
  vrun status --open
  expect_has "[contradiction] OPEN"
  vrun validate; expect_block "consecrated through an open gate"
}
block_gate_unknown_kind_after_arrow() {
  REV '--> [typo] OPEN'
  vrun validate; expect_block "[REVIEW-KIND-UNKNOWN]"
}
acct_openlist_unknown_gate_shape_surfaces() {
  REV '## [typo] OPEN'
  vrun status --open
  expect_has "fidelity violations (1):"
  expect_has "[typo] OPEN"
  expect_hasnt "nothing is waiting on you"
}
block_consecrate_unknown_gate_shape() {
  REV '## [typo] OPEN'
  vrun consecrate d1
  expect_block "open gate"
  expect_has "[typo] OPEN"
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
block_gate_kind_in_frontmatter() {
  # Frontmatter is not a Markdown heading context, but it is still outside the fidelity gate. A
  # bracketed violation kind cannot be parked in metadata to escape the review-wide zone rule.
  sed -i '1a note: [contradiction] PARKED' "$W/documents/d1/review.md"
  vrun validate; expect_block "outside the 'Fidelity violations' section"
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
  for fn in isNoise hasFm scanMarkdown parseReview parseCoverage parseHumanQueues parseQuestions parseGapText parseVerifiedUnits parseTaggedBullet walkLedgerSections canonId isPlaceholder isFence \
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
  # validate/status use review.md for both fidelity and Human queue policy. A private readReview
  # call there creates a second source generation inside one command; both adapters must receive
  # the command-local document already cached by the HQ pass. Consecrate reads review only once and
  # may keep its dedicated readReview convenience wrapper.
  n=$(grep -hcE '\breadReview\b' "$REPO/.weavedoc/bin/lib/cmd-validate.mjs" "$REPO/.weavedoc/bin/lib/cmd-status.mjs" 2>/dev/null | awk '{s+=$1} END{print s+0}')
  [ "${n:-0}" -eq 0 ] || bad="$bad duplicate-review-snapshots=${n};"
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
meta_markdown_state_model_properties() {
  # One cheap Node process grades the whole Cartesian model. The exact total is a vacuity guard:
  # deleting an axis or a loop is a failure even when every remaining assertion stays green.
  OUT=$(node "$REPO/tests/markdown-model-properties.mjs" 2>&1); RC=$?
  expect_pass
  expect_has "groups=15 cases=1844 cartesian=complete"
}
meta_quote_marker_properties() {
  # The v3 quote marker grammar, scanner and direct raw-source resolver (Phase 1). Written red-first
  # against a module that did not exist yet, which is what the plan asks for. Nothing in the runtime
  # consumes it and it is NOT connected to the v2 gate, so this case is the only thing executing it
  # — hence the pinned total.
  OUT=$(node "$REPO/tests/quote-marker-properties.mjs" 2>&1); RC=$?
  expect_pass
  expect_has "groups=18 cases=168"
}
meta_raw_source_properties() {
  # The shared raw-source model (schema v3, Phase 1). Same vacuity guard as its siblings: the exact
  # total is pinned, and nothing in the runtime consumes this model yet, so this case is the only
  # thing executing it. The `nonregular=` field is NOT part of the assertion — it records whether
  # this host could create a symlink, so a run where the directory fallback stood in says so out
  # loud instead of quietly covering one branch less.
  OUT=$(node "$REPO/tests/raw-source-properties.mjs" 2>&1); RC=$?
  expect_pass
  expect_has "groups=8 cases=86"
  expect_has "nonregular="
  expect_has "rootalias="
  expect_has "hardlink="
}
meta_id_sequences_properties() {
  # The typed monotonic allocator (schema v3, slice 1, bundle A). Written red-first against a module
  # that did not exist yet. Nothing in the runtime consumes it until bundle B2 wires the tripwires,
  # so this case is the only thing executing it — hence the pinned totals.
  OUT=$(node "$REPO/tests/id-sequences-properties.mjs" 2>&1); RC=$?
  expect_pass
  expect_has "groups=9 cases=141"
}
meta_conflict_store_properties() {
  # The temporary conflict store (schema v3, slice 1, bundle A). Same standing as its sibling above:
  # red-first, unwired until B2, exact totals as the vacuity guard.
  OUT=$(node "$REPO/tests/conflict-store-properties.mjs" 2>&1); RC=$?
  expect_pass
  expect_has "groups=9 cases=138"
}
meta_bundled_contracts_have_no_control_chars() {
  # CI had this for runtime modules only, so four 0x14 bytes rode into `.weavedoc/schemas/v3` and
  # shipped green (2026-08-08.6): a comment rewrite wrote U+2014 through a latin1 writer, which
  # keeps the low byte. They were in comments, so the parser never noticed — but these files ARE
  # the format. The check belongs in the local sweep as well as in CI: a bundled contract edited
  # here should go red HERE, not one push later.
  local f bad="" n
  for f in "$REPO/.weavedoc/schema" "$REPO/.weavedoc/schemas"/*; do
    [ -f "$f" ] || continue
    n=$(node "$REPO/tests/ctlscan.mjs" "$f" | tail -1 | sed 's/[^0-9]//g')
    [ "${n:-1}" = 0 ] || bad="$bad ${f#$REPO/}($n)"
  done
  # VACUITY GUARD: a glob that matched nothing would make this pass while checking zero files.
  [ -f "$REPO/.weavedoc/schemas/v3" ] || { bad "no bundled versioned contract to scan — the check would be vacuous"; return; }
  OUT="control-chars:${bad:- none}"; RC=0
  if [ -n "$bad" ]; then bad "bundled contract holds literal control characters:$bad"; else ok; fi
}
meta_artifact_contract_properties() {
  # The versioned role contract (schema v3, Phase 1). Same vacuity guard as above: the exact total
  # is asserted, so deleting an axis is a failure even when every remaining assertion is green.
  # Nothing in the runtime consumes this model yet — switching production consumers is Phase 2 —
  # so this case is the ONLY thing executing it, which is precisely why the count is pinned.
  OUT=$(node "$REPO/tests/artifact-contract-properties.mjs" 2>&1); RC=$?
  expect_pass
  expect_has "groups=9 cases=212"
}
pass_hq_kind_mention() {
  # a Human-queue entry whose prose mentions a kind — first slot is [open], not a kind (kind-bearing filter)
  REV ''
  printf -- '\n- [open] [user-only] contradiction 처리 방침 — 병기 허용 여부\n' >> "$W/documents/d1/review.md"
  vrun validate; expect_pass
}
block_review_comment_cannot_manufacture_gate_heading() {
  # Deleting an inline comment joined two source spans and manufactured this heading in the old
  # review reader. The shared scanner keeps columns/provenance, so a final cannot ship through a
  # gate heading that never existed in the source.
  sed -i 's/^# Fidelity violations$/<!--x--># Fidelity violations/' "$W/documents/d1/review.md"
  vrun validate
  expect_block "GATE-NO-HEADING"
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
  # the same spellings on a HONEST truth: readers accept them, the seal runs and passes.
  # (The third axis was `status:ok` until schema v3 removed the field; `provenance:stated`
  # keeps the no-space-after-colon spelling exercised on a truth key that still exists.)
  sed -i 's/^source: m001$/source : m001/; s/^provenance: stated$/provenance:stated/; s/^tags: \[위약\]$/tags :[위약]/' "$W/truths/t001.md"
  vrun validate; expect_pass
  vrun census; expect_has "truth files 1"
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
pass_coverage_fenced_example_is_inert() {
  # validate and census consume one coverage model. A fenced tutorial may spell a real material
  # heading and dangling truth id, but it is evidence text: it neither creates a section nor a
  # dangling reference, and it cannot inflate the census numerator.
  addm2 m002
  cat >> "$W/truths/coverage.md" <<'EOF'

```md
## m002
- example: t999
```
EOF
  vrun validate; expect_pass
  vrun census; expect_has "coverage records 1/2"
}
block_coverage_unterminated_comment() {
  printf '\n<!--\n## m999\n- hidden: t999\n' >> "$W/truths/coverage.md"
  vrun validate; expect_block "COVERAGE-MALFORMED"
  expect_has "unterminated '<!--'"
}
block_coverage_unterminated_fence() {
  printf '\n```md\n## m999\n- hidden: t999\n' >> "$W/truths/coverage.md"
  vrun validate; expect_block "COVERAGE-MALFORMED"
  expect_has "unterminated code fence"
}
block_coverage_unreadable_object() {
  # Present-but-unreadable is unknown evidence, not the same state as an absent optional register.
  rm -f "$W/truths/coverage.md"
  mkdir "$W/truths/coverage.md"
  vrun validate; expect_block "COVERAGE-MALFORMED"
  expect_has "exists but cannot be read"
}
acct_census_coverage_unterminated_fence_warns() {
  printf '\n```md\n## m999\n- hidden: t999\n' >> "$W/truths/coverage.md"
  vrun census; expect_has "unterminated code fence"
  expect_has "validate blocks this file"
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
acct_census_unreadable_coverage_warns() {
  # A present-but-unreadable register is unknown, not an empty register. A directory wearing the
  # file's name produces that state deterministically on every supported OS.
  rm -f "$W/truths/coverage.md"
  mkdir "$W/truths/coverage.md"
  vrun census
  expect_has "coverage records are unknown, not zero"
  expect_has "validate blocks this path"
}
addm2() { # $1=id — a second material, in catalog, sourced from m001's shape
  mkdir -p "$W/materials/$1"
  sed "s/^id: m001/id: $1/" "$W/materials/m001/converted.md" > "$W/materials/$1/converted.md"
  printf '| %s | 추가자료 | 계약서 |\n' "$1" >> "$W/catalog.md"
  mint
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
  printf -- '---\nid: t002\nclaim: "지체상금은 일 0.1%%다"\nsource: m001\ntags: [위약]\n---\n\n제9조 지체상금은 일 0.1%%로 한다.\n그 상한은 계약금액의 10%%다.\n' > "$W/truths/t002.md"
  vrun validate; expect_block "quote not found"
}
block_dup_key() {
  sed -i 's/^provenance: stated$/provenance: stated\nprovenance: adopted/' "$W/truths/t001.md"
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
  mint
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
mint() { # recompute .weavedoc-state/id-sequences.json from the fixture's hand-minted ids.
  # Tests mint by hand — that is what makes them fixtures; real writers go through `alloc`.
  # IDSEQ-BEHIND exists to catch exactly the hand-mint-without-bumping shape, so a fixture
  # that hand-mints must also carry a consistent allocator — computed from the tree, never a
  # per-case constant that drifts the day someone adds a t003.
  local tmax mmax cmax
  tmax=$(ls "$W/truths" 2>/dev/null | sed -n 's/^t0*\([0-9]\{1,\}\)\.md$/\1/p' | sort -n | tail -1); tmax=${tmax:-0}
  mmax=$(ls "$W/materials" 2>/dev/null | sed -n 's/^m0*\([0-9]\{1,\}\)$/\1/p' | sort -n | tail -1); mmax=${mmax:-0}
  cmax=$(sed -n 's/.*"id": "c0*\([0-9]\{1,\}\)".*/\1/p' "$W/.weavedoc-state/conflicts.json" 2>/dev/null | sort -n | tail -1); cmax=${cmax:-0}
  printf '{\n  "version": 1,\n  "next": {\n    "conflict": %d,\n    "material": %d,\n    "truth": %d\n  }\n}\n' "$((cmax+1))" "$((mmax+1))" "$((tmax+1))" > "$W/.weavedoc-state/id-sequences.json"
}
addt2() { # register t002 in the ledgers so the only thing left to complain about is the seal
  printf -- '- 대금 조항: t002\n' >> "$W/truths/coverage.md"
  printf -- '- added: t002 (2026-07-30)\n' >> "$W/truths/changelog.md"
  ( cd "$W" && "${WDRUN[@]}" reindex >/dev/null 2>&1 )
  mint
}
block_short_body_seal() {
  # A body too small to be evidence of anything: index() finds it inside almost any material.
  printf -- '---\nid: t002\nclaim: "대금은 5천만원이다"\nsource: m001\ntags: [대금]\n---\n\n5천만원\n' > "$W/truths/t002.md"
  addt2
  vrun validate; expect_block "fragment"
}
block_spliced_quote() {
  # Each line is verbatim; the two skip 제5조, which sits between them in the source. Markdown
  # renders soft-wrapped lines as one paragraph, so the result is a sentence the source never had —
  # and the realistic accident is a quote that drops the qualifying middle line.
  printf -- '---\nid: t002\nclaim: "대금 5천만원의 위약금은 10%%다"\nsource: m001\ntags: [대금]\n---\n\n제3조 대금은 5천만원으로 한다.\n제7조 위약금은 계약금액의 10%%로 한다.\n' > "$W/truths/t002.md"
  addt2
  vrun validate; expect_block "NOT adjacent"
}
pass_multiline_verbatim() {
  # A genuine multi-line verbatim quote — adjacent lines copied as a block. Must stay clean, or the
  # spliced-quote check has bought a false failure on the shape FORMATS explicitly encourages.
  printf -- '---\nid: t002\nclaim: "대금과 납품 기한"\nsource: m001\ntags: [대금]\n---\n\n제3조 대금은 5천만원으로 한다.\n제5조 납품 기한은 2026년 12월 31일로 한다.\n' > "$W/truths/t002.md"
  addt2
  mint
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
  # the advisory findings. (review_legacy rides in the frontmatter — a hand-written review next to
  # a consecrated final needs the marker to stand, same as every fixture review since schema v3.)
  {
    printf -- '---\nround: 1\nreview_legacy: 2026-07-30\n---\n\n'
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
  # (exercised on provenance since schema v3 removed status — the rule under test is the
  # comment stripping, not the key)
  sed -i 's/^provenance: stated$/provenance: stated  # 확인함/' "$W/truths/t001.md"
  vrun validate; expect_pass
}
pass_hash_in_quoted_claim() {
  sed -i 's/^claim: .*$/claim: "위약금은 계약금액의 10%다 — 3월 회의 #3 결과"/' "$W/truths/t001.md"
  ( cd "$W" && "${WDRUN[@]}" reindex >/dev/null 2>&1 )
  vrun validate; expect_pass
  OUT=$(cat "$W/truths/index.md"); expect_has '3월 회의 #3 결과'
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
pass_cited_short_id() {
  mv "$W/truths/t001.md" "$W/truths/t005.md"
  sed -i 's/^id: t001$/id: t005/' "$W/truths/t005.md"
  sed -i 's/^- 위약금 조항: t001$/- 위약금 조항: t005/' "$W/truths/coverage.md"
  sed -i 's/^cited_truths: \[t001\]$/cited_truths: [t5]/' "$W/documents/d1/plan.md"
  printf -- '- added: t005 (2026-07-30)\n' >> "$W/truths/changelog.md"
  ( cd "$W" && "${WDRUN[@]}" reindex >/dev/null 2>&1 )
  mint
  vrun validate; expect_pass
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
  printf -- '---\nid: t002\nclaim: "대금은 5천만원이다"\nsource: m001\ntags: [대금]\n---\n\n제3조 대금은 5천만원으로 한다.\n' > "$W/truths/t002.md"
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
acct_scope_uncovered_row_preserves_source_bytes() {
  # Verified-units is parsed in the byte domain. A raw uncovered row must be emitted as those same
  # bytes, not handed to a string writer that UTF-8-encodes the latin1 projection into mojibake.
  sed -i '/^## Verified units$/a - t001 · 검증 실패 · no-verdict' "$W/truths/verify.md"
  vrun scope
  expect_has "검증 실패"
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
acct_scope_fenced_verified_heading_covers_nothing() {
  # A heading-looking line inside a code fence is payload, not the verification register. The
  # shared Markdown model must not let it mint legacy coverage merely because it has the right
  # spelling. There is deliberately no live Verified-units heading in this fixture.
  printf -- '---\nstatus: passed\nround: 1\nverified_at: 2026-07-30\n---\n\n```md\n## Verified units\n- m001 · t001 — R1 2026-07-30 · verified\n```\n\n## Adjudications\n\n## Human queue\n' > "$W/truths/verify.md"
  vrun scope
  expect_has "truths     1 live · 0 verified (digest-bound) · 0 legacy-unbound"
  expect_has "1 unverified"
}
acct_scope_known_verify_sibling_is_boundary() {
  # A schema-known sibling is a real section boundary even when it is deeper than Verified units.
  # Otherwise Human-queue text is harvested as verification evidence and silently pays truth debt.
  printf -- '# Verified units\n\n## Human queue\n- [open] [user-only] Is t001 verified\n\n## Adjudications\n' > "$W/truths/verify.md"
  vrun scope
  expect_has "truths     1 live"
  expect_has "0 legacy-unbound"
  expect_has "1 unverified"
}
block_schema_verify_sections_are_positional() {
  # Empty positional roles never shift Human queue into the evidence lane. Scope fails safe, the
  # validator names the schema contract, and migration refuses before its first write.
  sed -i 's/^verify.sections:.*/verify.sections: |Human queue|Adjudications/' "$W/.weavedoc/schema"
  printf -- '# Human queue\n- [open] [user-only] Is t001 verified\n# Adjudications\n' > "$W/truths/verify.md"
  vrun scope
  expect_has "0 legacy-unbound"
  expect_has "1 unverified"
  vrun validate; expect_block "[SCHEMA-VERIFY-SECTIONS]"
  # (the upgrade leg retired with the v1→v2 migrator; the version axis is the gate's now)
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
acct_attest_fenced_verified_heading_is_not_a_write_target() {
  # The append-only sidecar remains the source of truth, but its human mirror may only be spliced
  # after a LIVE register heading. A fenced lookalike must neither receive the row nor make the
  # disagreement silent.
  printf -- '---\nstatus: passed\nround: 1\nverified_at: 2026-07-30\n---\n\n```md\n## Verified units\n```\n\n## Adjudications\n\n## Human queue\n' > "$W/truths/verify.md"
  vrun attest verified 2 standard t001
  expect_pass
  expect_has "human mirror"
  OUT=$(cat "$W/truths/verify.md"); RC=0
  expect_hasnt "R2"
  OUT=$(grep -c $'t001\t' "$W/truths/verify-ledger.tsv"); RC=0
  expect_has "1"
}
acct_attest_comment_spanning_heading_is_not_a_write_target() {
  # A heading can be live while opening a comment that closes later. Inserting after the physical
  # heading would place the mirror inside that comment. The sidecar remains authoritative, but the
  # optional mirror must prove that its exact row became live or report that it skipped the write.
  printf -- '## Verified units <!--\narchived note\n-->\n\n## Human queue\n' > "$W/truths/verify.md"
  vrun attest verified 2 standard t001
  expect_pass
  expect_has "human mirror"
  OUT=$(cat "$W/truths/verify.md"); RC=0
  expect_hasnt "R2"
  OUT=$(grep -c $'t001\t' "$W/truths/verify-ledger.tsv"); RC=0
  expect_has "1"
}
acct_attest_unreadable_verify_names_skipped_mirror() {
  # The authoritative sidecar can still accept the verdict, but a present unreadable human view is
  # not the same as an absent optional mirror. Name the disagreement instead of silently skipping it.
  rm -f "$W/truths/verify.md"
  mkdir "$W/truths/verify.md"
  vrun attest verified 2 standard t001
  expect_pass
  expect_has "human mirror"
  expect_has "could not be read"
  OUT=$(grep -c $'t001\t' "$W/truths/verify-ledger.tsv"); RC=0
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
  sed -i 's/^version: 3$/version: 4/' "$W/project.md"
  sed -i 's/^version: 3/version: 4/' "$W/.weavedoc/config.yaml"
  vrun validate; expect_block "newer than this runtime"
}
block_schema_version_disagreement() {
  # project.md and config.yaml each carry a version; two records of one fact must agree.
  sed -i 's/^version: 3$/version: 2/' "$W/project.md"
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
acct_upgrade_deep_verified_heading_does_not_mint_evidence() {
  # Readers, writers and the required-section gate admit only level 1/2. A v1 `###` lookalike must
  # not receive a verdict or mint a legacy sidecar row before upgrade adds the missing real section.
  mkv1
  sed -i 's/^## Verified units$/### Verified units/' "$W/truths/verify.md"
  vrun upgrade --apply
  expect_pass
  vrun scope
  expect_has "truths     1 live · 0 verified (digest-bound) · 0 legacy-unbound"
  expect_has "1 unverified"
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
block_cfg_every_configured_path_checked() {
  # ALL FOUR, not three (external review, v0.5.21). `inbox` was missing from the checked list, so a
  # mine whose landing zone had vanished — the shape a clone takes, since git stores no empty
  # directories — reported "all checks passed". Measured on a real clone. The matrix runs every
  # configured path, so leaving one out cannot pass again.
  # Remove any key from the list in cmd-validate -> this goes red for that key.
  local miss=""
  for k in inbox materials truths documents; do
    rm -rf "$W/$k.hold"; mv "$W/$k" "$W/$k.hold"
    vrun validate
    case "$OUT" in *"config paths.$k"*) ;; *) miss="$miss $k" ;; esac
    mv "$W/$k.hold" "$W/$k"
  done
  OUT="unchecked:${miss:- none}"; RC=0
  if [ -n "$miss" ]; then bad "a configured path can vanish unnoticed:$miss"; else ok; fi
}
e2e_empty_dir_survives_a_clone() {
  # GIT STORES FILES, NEVER DIRECTORIES (external review, v0.5.18). A configured directory that is
  # still empty — `documents/` in any mine before its first document — is simply absent from a
  # clone, and `validate` then blocks with CFG-PATH-MISSING. Measured on a fresh clone of a real
  # mine: rc 1, on a mine that is clean where it stands. The answer is a tracked marker, not a
  # leniency in validate: "the directory is missing" and "the directory is empty" must stay
  # distinguishable, because a check that walks a missing directory runs zero times and that looks
  # exactly like passing. weavedoc-init writes `.gitkeep` into each configured path since v0.5.18.
  # Delete the .gitkeep line below → this goes red, which is what the skill's instruction buys.
  # Siblings of the mine inside the case's own workspace ($WORK/w/<case> is $W), never inside it:
  # copying a directory into itself is what the first spelling did, and it failed for that reason.
  # EVERY configured path, emptied and marked (external review, v0.5.21). Only documents/ was
  # exercised, so the guarantee was pinned for one quarter of the paths it is about — and `inbox`
  # turned out to be the one validate did not even check.
  local up="$W-clonesrc" dn="$W-clonedst" out rc k
  rm -rf "$up" "$dn"; mkdir -p "$up"
  cp -r "$W"/. "$up"/ 2>/dev/null || { bad "could not copy the mine"; return; }
  for k in inbox documents; do
    rm -rf "$up/$k"; mkdir -p "$up/$k" && printf '' > "$up/$k/.gitkeep"
  done
  ( cd "$up" && git init -q . && git add -A >/dev/null 2>&1 && git -c user.email=t@t -c user.name=t commit -q -m mine ) \
    || { bad "could not build the source repository"; return; }
  git clone -q "$up" "$dn" 2>/dev/null || { bad "could not clone"; return; }
  for k in inbox documents; do
    [ -d "$dn/$k" ] || { bad "$k/ did not survive the clone even with a marker"; rm -rf "$up" "$dn"; return; }
  done
  out=$( cd "$dn" && $WD_BIN validate 2>&1 ); rc=$?
  OUT="clone rc=$rc"
  case "$out" in *CFG-PATH-MISSING*) bad "the clone still reports CFG-PATH-MISSING"; return ;; esac
  [ "$rc" = 0 ] || { OUT="clone rc=$rc :: $out"; bad "the cloned mine does not validate"; rm -rf "$up" "$dn"; return; }
  rm -rf "$up" "$dn"
  ok
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
  printf -- '---\nid: t002\nclaim: "지연 배상 한도는 계약금액의 20%%다"\nsource: m002\ntags: [지연]\nprovenance: stated\n---\n\n지연 배상 한도는 계약금액의 20%%다.\n' > "$W/truths/t002.md"
  ( cd "$W" && "${WDRUN[@]}" reindex >/dev/null 2>&1 )
  mkdoc2
  sed -i 's/^cited_truths: \[t001\]$/cited_truths: [t001, t002]/' "$W/documents/d2/plan.md"
  printf -- '\n지연 배상 한도는 계약금액의 20%%다. <!-- t:t002 -->\n' >> "$W/documents/d2/draft.md"
  mint
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
  mk_sealed; strip_seal "$W/documents/d1/review.md"
  printf '몰래 한 줄.\n' >> "$W/documents/d1/final.md"
  vrun validate; expect_block "[GATE-UNSEALED]"
}
block_gate_v2_context_seal_stripped() {
  # Deleting ONLY review_context_digest then moving a source must not slip through either.
  mk_sealed
  sed -i '/^review_context_digest:/d' "$W/documents/d1/review.md"
  printf '\n제12조 신설.\n' >> "$W/materials/m001/converted.md"
  vrun validate; expect_block "[GATE-UNSEALED]"
}
pass_gate_v2_sealed_clean() {
  # The v2 happy path pinned from the pass side: a properly sealed schema-2 mine validates
  # clean and counts its seal digest-bound — the block cases above only prove rejection.
  mk_sealed
  vrun validate; expect_pass
  expect_has "1 digest-bound"
}
pass_consecrate_v2_e2e() {
  # The v2 consecration spine: sealed draft → consecrate → one full validation → promoted, no
  # transaction residue, and the sealed validate stays green afterwards.
  mk_sealed
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
  mk_sealed
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
  mk_sealed
  sed -i '/^reviewed_kind:/d' "$W/documents/d1/review.md"
  vrun validate; expect_block "[GATE-UNSEALED]"
}
block_gate_v2_kind_invalid() {
  # reviewed_kind outside draft|final is a seal validate cannot interpret — malformed, not green.
  mk_sealed
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
block_gate_draft_partial_tuple() {
  # Structural seal invariants hold for ANY review, not only next to a final: a draft-stage
  # review with a partial tuple is the same tamper shape one consecration earlier.
  mk_sealed
  mkdoc2
  ( cd "$W" && "${WDRUN[@]}" seal-review d2 draft >/dev/null 2>&1 )
  sed -i '/^reviewed_kind:/d' "$W/documents/d2/review.md"
  vrun validate; expect_block "[GATE-UNSEALED]"
}
block_gate_draft_seal_marker() {
  # Marker-next-to-seal is tamper at draft stage too — waiting for the consecration to notice
  # hands the demotion a whole review round to sit undetected.
  mk_sealed
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
pass_upgrade_resume_mixed() {
  # A crashed apply stamps project before config (stamps are LAST, in that order) — the rescan
  # of that half-stamped mine must still read as a v1 migration, or a crash is unrecoverable.
  sed -i 's/^version: 1$/version: 2/' "$W/project.md"
  vrun upgrade --apply
  expect_pass
  vrun validate; expect_pass
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
block_gaps_fenced_fake_register() {
  # Review #11 blocker 1: the WHOLE register lived inside a code fence — real Markdown has no
  # register at all — and validate passed it, because only ONE of the four gaps readers knew
  # fences (the heading counter and the register scanner counted the fenced lines, and the
  # 2-space-indented closing fence even read as the fake entry's continuation). One lexical
  # scanner now feeds every reader. Red vs 942ccdc: rc 0.
  req_completeness
  printf '```text\n# Open\n# Accepted\n- [declared] fake accepted decision — reason\n  ```\n' > "$W/gaps.md"
  vrun validate
  expect_block "no readable '# Open' section"
}
pass_gaps_fenced_heading_example() {
  # Review #11 blocker 1, the reverse: a VALID register plus a fenced example that shows the
  # headings — the duplicate-heading check counted the example and blocked a fine file. Red vs
  # 942ccdc: rc 1 "repeats a register section heading".
  req_completeness
  printf '# Open\n\n# Accepted\n\n- [declared] real — reason\n\n# Notes\n\n```\n# Open\n# Accepted\n- [declared] just an example — reason\n```\n' > "$W/gaps.md"
  vrun validate
  expect_pass
  # ...and the gaps CLI agrees: the fenced example's bullet is not an accepted entry.
  vrun gaps
  expect_has "records 1 already accepted"
}
block_gaps_backtick_info_not_a_fence() {
  # Review #11 blocker 2: a backtick opener whose info string contains a backtick is NOT a fence
  # in CommonMark — reading it as one hid a REAL stray entry inside a fence that does not exist
  # (rc 0, measured; the CHANGELOG's "fail-closed" note held only for the unterminated variant).
  # Red vs 942ccdc: rc 0.
  req_completeness
  printf '# Open\n\n# Accepted\n\n# Notes\n\n```foo`bar\n- [declared] real stray entry — reason\n```\n' > "$W/gaps.md"
  vrun validate
  expect_block "outside '# Open' and '# Accepted'"
}
acct_mine_lock_admits_one_writer() {
  # THE SINGLE-WRITER GATE (v0.5.4, review #9). Every mutating command takes .weavedoc/mine.lock
  # at the dispatcher, before any command-specific judgment (one openMine resolves the root first
  # — the lock lives under it); a second one is REFUSED, not queued. Simulated
  # with a planted lock (a real second process would need a hold seam in every command, and the
  # gate is one code path for all of them). Red vs the pre-gate runtime (4121109): every command
  # below runs and writes.
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
  # Passes on the pre-gate runtime (4121109) too — no gate there, so nothing to be gated by; said
  # plainly: it is the guard that keeps the gate from spreading, not evidence for it.
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
block_completeness_sections_leading_empty_role() {
  # The section roster is positional. Removing its first value must not shift Accepted into Open
  # in validate, status or the non-blocking tally.
  req_completeness
  cp -r "$REPO/.weavedoc/bin" "$W/.weavedoc/bin"
  cp "$REPO/.weavedoc/schema" "$W/.weavedoc/schema"
  cp "$REPO/.weavedoc/VERSION" "$W/.weavedoc/VERSION"
  sed -i 's/^gaps.sections: Open|Accepted$/gaps.sections: |Accepted/' "$W/.weavedoc/schema"
  grep -q '^gaps.sections: |Accepted$' "$W/.weavedoc/schema" || { bad "fixture no-op: leading-empty roster swap missed"; return; }
  printf '# Accepted\n\n- [declared] MUST-NOT-BECOME-OPEN\n' > "$W/gaps.md"
  OUT=$( ( cd "$W" && $TO node .weavedoc/bin/weavedoc.mjs validate ) 2>&1 ); RC=$?
  expect_block "SCHEMA-UNREADABLE"
  OUT=$( ( cd "$W" && $TO node .weavedoc/bin/weavedoc.mjs status --open ) 2>&1 ); RC=$?
  expect_has "gaps register contract is invalid"
  expect_hasnt "nothing is waiting on you"
  OUT=$( ( cd "$W" && $TO node .weavedoc/bin/weavedoc.mjs gaps ) 2>&1 ); RC=$?
  expect_has "accepted tally is disabled"
  expect_hasnt "records 0 already accepted"
}
block_completeness_sections_extra_positional_role() {
  # Extra roles are not ignored. All three consumers disable the register instead of choosing the
  # first two values and creating a hidden fourth interpretation of the schema.
  req_completeness
  cp -r "$REPO/.weavedoc/bin" "$W/.weavedoc/bin"
  cp "$REPO/.weavedoc/schema" "$W/.weavedoc/schema"
  cp "$REPO/.weavedoc/VERSION" "$W/.weavedoc/VERSION"
  sed -i 's/^gaps.sections: Open|Accepted$/gaps.sections: Open|Accepted|Archive/' "$W/.weavedoc/schema"
  grep -q '^gaps.sections: Open|Accepted|Archive$' "$W/.weavedoc/schema" || { bad "fixture no-op: extra-role roster swap missed"; return; }
  printf '# Open\n\n- [declared] MUST-NOT-ROUTE\n# Accepted\n# Archive\n' > "$W/gaps.md"
  OUT=$( ( cd "$W" && $TO node .weavedoc/bin/weavedoc.mjs validate ) 2>&1 ); RC=$?
  expect_block "SCHEMA-UNREADABLE"
  OUT=$( ( cd "$W" && $TO node .weavedoc/bin/weavedoc.mjs status --open ) 2>&1 ); RC=$?
  expect_has "gaps register contract is invalid"
  expect_hasnt "nothing is waiting on you"
  OUT=$( ( cd "$W" && $TO node .weavedoc/bin/weavedoc.mjs gaps ) 2>&1 ); RC=$?
  expect_has "accepted tally is disabled"
  expect_hasnt "records 0 already accepted"
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
  # (the `upgrade --check` leg retired with the v1→v2 migrator — the slice-1 stub reads no
  # ledger; the v2→v3 migrator's own refusal cases arrive with it in slice 2)
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
acct_schema_crlf_reads_like_lf() {
  # THE SHIPPED RUNTIME'S OWN FILE, CRLF (external review, v0.5.18). `loadSchema` kept a trailing CR
  # on purpose — parity with a bash reader that was DELETED in bundle 2026-08-05.3 — while every
  # other reader in this codebase treats it as a line ending. The cost is not theoretical: a
  # consumer who follows the documented install (copy `.weavedoc/` into their repo) on Windows
  # default settings gets `core.autocrlf=true`, and then EVERY schema list ends in `…|roles\r`, so
  # no frontmatter key matches and no enum member matches. Measured on a fresh clone of the eclypse
  # testbed: 372 problems — 300 FM-MISSING, 61 RESOLUTION-ENUM, 8 PROV-ENUM — on a mine that is
  # clean. The mine's own bytes are NOT the problem (a CRLF mine under an LF runtime validates);
  # the runtime reading its own schema is. Same ruling as acct_ledger_crlf_reads_as_verified: one
  # reader. Revert loadSchema to its private schemaLines → this goes red.
  { while IFS= read -r l || [ -n "$l" ]; do printf '%s\r\n' "${l%$'\r'}"; done < "$W/.weavedoc/schema"; } > "$W/s.crlf"
  mv "$W/s.crlf" "$W/.weavedoc/schema"
  IFS= read -r l0 < "$W/.weavedoc/schema"
  case "$l0" in *$'\r') ;; *) bad "fixture did not become CRLF — the case would prove nothing"; return ;; esac
  vrun validate; expect_pass
  expect_hasnt "FM-MISSING"
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
  expect_has '"schema_version":3'
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
  # status --open is a MODE, not a command word — compared outside the loop for the same reason
  # refresh-golden.sh writes it outside its loop.
  if [ -f "$G/status-open.txt" ]; then
    ( cd "$W" && $TO "${WDRUN[@]}" status --open ) > "$W/.g.status-open" 2>&1
    cmp -s "$W/.g.status-open" "$G/status-open.txt" || bad="$bad DRIFT:status-open"
  else
    bad="$bad MISSING:status-open.txt"
  fi
  ( cd "$W" && $TO "${WDRUN[@]}" version ) > "$W/.g.version" 2>&1
  local now golden
  now=$(head -1 "$W/.g.version"); golden=$(head -1 "$G/version.txt")
  [ "$now" = "$golden" ] || bad="$bad LABEL:golden='$golden' runtime='$now'"
  OUT="${bad:-golden snapshots match the current runtime}"; RC=0
  if [ -z "$bad" ]; then ok; else bad "golden drift —$bad (run 'bash tests/refresh-golden.sh' and review the diff)"; fi
}
acct_gaps_accepted_tally_counts_filled_placeholder() {
  # THE THIRD ANSWER, closed (v0.5.8). `weavedoc gaps`' accepted tally still ran the placeholder
  # PREFIX rule validate abandoned in v0.5.4 review #9 — the same retired rule that made
  # `status --open` report a blocking gap as "nothing is waiting" in v0.5.5. Here it under-counts
  # accepted decisions instead: an entry whose kind slot kept its template but whose body is
  # written out is a real decision (FORMATS: the remainder decides) and was tallied as nothing.
  # Revert cmd-gaps.mjs to a raw entry-pattern count instead of parseGapRegister → this goes red.
  cat > "$W/gaps.md" <<'EOF'
# Open

# Accepted

- [symmetry] 정상 항목 — 의도적 공백 — scope: [x] — recheck: y — as-of: t001
- [<kind>] 실제로 수용된 결정 — scope: [x] — recheck: y — as-of: t001
- [<kind>] <where> — <what>
EOF
  vrun gaps
  expect_pass
  # 2, not 3: the pure stub stays template noise in every reader.
  expect_has "records 2 already accepted"
}
acct_gaps_accepted_malformed_is_named() {
  # Typed syntax cannot disappear at the final consumer. Keep the historical record tally, but say
  # explicitly that an unknown kind is not a valid routed acceptance.
  printf '# Open\n\n# Accepted\n\n- [typo] decision\n' > "$W/gaps.md"
  vrun gaps
  expect_pass
  expect_has "records 1 already accepted (0 valid, 1 malformed)"
  expect_has "malformed entry"
}
acct_gaps_same_section_cannot_hold_both_roles() {
  # Model-level contract closure: status/gaps consume the register without validate's schema
  # preflight, so they too must refuse to treat one physical row as both open and accepted.
  sed -i 's/^gaps\.sections:.*/gaps.sections: Same|Same/' "$W/.weavedoc/schema"
  printf '# Same\n\n- [symmetry] ONE-ROLE\n' > "$W/gaps.md"
  vrun status --open
  expect_has "one section cannot hold both roles"
  vrun gaps
  expect_has "accepted tally is disabled"
  expect_hasnt "records 0 already accepted"
}
acct_gaps_unterminated_fence_named() {
  # A fence nobody closed makes everything after it invisible to the tally, and this command said
  # nothing — it took `defence(...).text` and dropped the `.open` flag beside it. Recorded as a
  # known issue in v0.5.4 and walked past again in v0.5.8, which edited this very line. Its twin
  # reader (`status --open`) has warned since v0.5.6; silence here is the same "reader cannot see
  # it, so say so" rule, unapplied.
  # Revert the `if (df.open) out(…)` line in cmd-gaps.mjs → this goes red.
  printf '# Open\n\n# Accepted\n\n```\n- [symmetry] 펜스 안 — 세어지지 않음\n' > "$W/gaps.md"
  vrun gaps
  expect_pass
  expect_has "unterminated code fence"
}
acct_gaps_accepted_tally_localized_section() {
  # An OVER-BLOCKING GUARD (passes before and after — no red-first for this shape): the tally moves
  # to the byte domain to share validate's scanner, and the section name must move WITH it. Reading
  # a non-ASCII section name from the utf8 schema map against latin1 text is exactly how v0.5.6
  # re-introduced the defect it was repairing, one command over.
  sed -i 's/^gaps\.sections:.*/gaps.sections: 미해결|수용/' "$W/.weavedoc/schema"
  printf '# 미해결\n\n# 수용\n\n- [symmetry] 정상 — 의도적 공백 — scope: [x] — recheck: y — as-of: t001\n' > "$W/gaps.md"
  vrun gaps
  expect_has "records 1 already accepted"
}
meta_key_covers_every_live_input() {
  # THE KEY'S COVERAGE, exercised (external review, v0.5.16). Reverting the recursive bin/ and
  # tests/ hashes, or the index hash, left the whole suite at 493/493 — three mechanisms added over
  # three releases, none of them pinned. This asks the key itself: change each input the way a
  # developer actually changes it, and the key must move. It runs against an ISOLATED COPY, so the
  # real tree is never touched (the lesson the probe case learned the hard way).
  local copy="$W/keyrepo" k0 k1 fails=""
  mkdir -p "$copy" && cp -r "$REPO/tests" "$REPO/.weavedoc" "$copy"/ 2>/dev/null
  mkdir -p "$copy/.claude" && cp -r "$REPO/.claude/skills" "$copy/.claude"/ 2>/dev/null
  cp "$REPO/README.md" "$REPO/CHANGELOG.md" "$copy"/ 2>/dev/null
  # WD_REG_RES/WD_REG_KEY CLEARED — inside a --batch worker they are exported and --seal-check
  # refuses in that branch, so this returned no key and the case failed only under the real
  # fan-out while passing under --one. The same trap v0.5.14 recorded, repeated here.
  key_of() { ( cd "$copy" && WD_REG_RES= WD_REG_KEY= TMPDIR="$W" bash tests/regress.sh --seal-check zzzzzzzzzzzz 2>&1 | sed -n 's/.*, \([0-9a-f]*\) now\..*/\1/p' ); }
  probe_moves() { # $1 = label, $2 = file to append to
    local before after
    before=$(key_of); printf '\n// %s\n' "$1" >> "$2"; after=$(key_of)
    # BOTH keys checked (cold review): an empty second key made "before != after" true and
    # the probe reported "covered" while measuring nothing.
    [ -n "$before" ] && [ -n "$after" ] && [ "$before" != "$after" ] || fails="$fails $1"
  }
  # bin/ top level (not the entrypoint, not under lib/) — the v0.5.15 hole
  printf 'export const x = 1\n' > "$copy/.weavedoc/bin/extra.mjs"; probe_moves bin-toplevel "$copy/.weavedoc/bin/extra.mjs"
  # the VERSIONED CONTRACTS beside the schema (bundle 2026-08-08.6). `.weavedoc/schema` was keyed by
  # name and `schemas/` not at all, so a dirty `schemas/v3` edit was invisible to `--resume`, which
  # replayed the previous PASS while a fresh key failed — the v0.5.14/.15 hole one directory over.
  # It belongs HERE, in the isolated copy: the first spelling of this probe edited $REPO itself and
  # restored it, which a SIGKILL in the window leaves dirty, lets a concurrent edit be clobbered by
  # the restore, and hides from the final seal anyway because A→B→A is no net change.
  probe_moves schemas-v3 "$copy/.weavedoc/schemas/v3"
  # a nested lib module, and a tests/ helper below the top level — the recursive halves
  mkdir -p "$copy/.weavedoc/bin/lib/sub" && printf 'export const y = 1\n' > "$copy/.weavedoc/bin/lib/sub/m.mjs"
  probe_moves bin-nested "$copy/.weavedoc/bin/lib/sub/m.mjs"
  mkdir -p "$copy/tests/helpers" && printf '#!/usr/bin/env bash\n' > "$copy/tests/helpers/h.sh"
  probe_moves tests-nested "$copy/tests/helpers/h.sh"
  # the entrypoint under a WD_BIN that lives OUTSIDE bin/ — the v0.5.16 hole
  cp "$copy/.weavedoc/bin/weavedoc.mjs" "$copy/.weavedoc/alt-entry.mjs"
  k0=$( cd "$copy" && WD_REG_RES= WD_REG_KEY= TMPDIR="$W" WD_BIN="node .weavedoc/alt-entry.mjs" bash tests/regress.sh --seal-check zzzzzzzzzzzz 2>&1 | sed -n 's/.*, \([0-9a-f]*\) now\..*/\1/p' )
  printf '\n// edited\n' >> "$copy/.weavedoc/alt-entry.mjs"
  k1=$( cd "$copy" && WD_REG_RES= WD_REG_KEY= TMPDIR="$W" WD_BIN="node .weavedoc/alt-entry.mjs" bash tests/regress.sh --seal-check zzzzzzzzzzzz 2>&1 | sed -n 's/.*, \([0-9a-f]*\) now\..*/\1/p' )
  [ -n "$k0" ] && [ -n "$k1" ] && [ "$k0" != "$k1" ] || fails="$fails wd-entry"
  OUT="uncovered:${fails:- none}"; RC=0
  if [ -n "$fails" ]; then bad "the key does not move for:$fails"; else ok; fi
}
meta_key_covers_the_git_index() {
  # The index half, in its own case because it needs a git repo (the copy above has none). Uses a
  # throwaway repo under $W — never $REPO, whose index is shared with the developer's own work.
  # Revert `git ls-files -s -z | sha256sum` (or move it back inside the awk) → this goes red.
  local repo="$W/gitrepo" before after
  mkdir -p "$repo" && cp -r "$REPO/tests" "$REPO/.weavedoc" "$repo"/ 2>/dev/null
  mkdir -p "$repo/.claude" && cp -r "$REPO/.claude/skills" "$repo/.claude"/ 2>/dev/null
  cp "$REPO/README.md" "$REPO/CHANGELOG.md" "$repo"/ 2>/dev/null
  # `git init` HONOURS an inherited GIT_DIR — it re-initialises THAT dir instead of making
  # one here, and the `git add -A` then stages this scratch tree into the REAL repository's index,
  # marking every real entry deleted (measured; the case still reported PASS). GIT_DIR is set inside
  # every hook, `rebase --exec`, `bisect run` and `submodule foreach` — i.e. the ordinary
  # run-the-suite-before-committing wiring. Data loss, in the release that moved a probe out of the
  # live tree for the same reason (cold review, v0.5.16). The local `env -u` copy that stood here
  # is gone (external review, v0.5.17): it named three variables and left GIT_OBJECT_DIRECTORY
  # standing, so these two calls wrote 79 objects of this scratch repo into whatever repository that
  # variable named — measured, with the case still reporting PASS. tests/git-env.sh clears the whole
  # set for the process instead, which is what meta_git_env_writes_stay_inside exercises.
  ( cd "$repo" && git init -q . && git add -A >/dev/null 2>&1 ) || { bad "could not build a scratch git repo"; return; }
  before=$( cd "$repo" && WD_REG_RES= WD_REG_KEY= TMPDIR="$W" bash tests/regress.sh --seal-check zzzzzzzzzzzz 2>&1 | sed -n 's/.*, \([0-9a-f]*\) now\..*/\1/p' )
  # A STAGED-ONLY change: the file on disk is edited AND staged, so a key that ignored the index
  # would still move — stage a change and then restore the worktree copy, leaving only the index.
  printf '\n// staged only\n' >> "$repo/.weavedoc/bin/lib/core.mjs"
  ( cd "$repo" && git add .weavedoc/bin/lib/core.mjs >/dev/null 2>&1 )
  sed -i '$ d' "$repo/.weavedoc/bin/lib/core.mjs"; sed -i '$ d' "$repo/.weavedoc/bin/lib/core.mjs"
  after=$( cd "$repo" && WD_REG_RES= WD_REG_KEY= TMPDIR="$W" bash tests/regress.sh --seal-check zzzzzzzzzzzz 2>&1 | sed -n 's/.*, \([0-9a-f]*\) now\..*/\1/p' )
  OUT="before=$before after=$after"
  if [ -z "$before" ]; then bad "no key from the scratch repo — the comparison would be vacuous"
  elif [ "$before" = "$after" ]; then bad "a staged-only change did not move the key — the index is not in it"
  else ok; fi
}
meta_git_env_ignored_by_key_and_manifest() {
  # NO GIT-LOCAL ENVIRONMENT VARIABLE MAY REACH THIS SUITE (external review, v0.5.17). v0.5.16 unset
  # three of the fifteen `git rev-parse --local-env-vars` names, at the call sites it had found:
  #   * GIT_OBJECT_DIRECTORY, GIT_COMMON_DIR and GIT_CONFIG_PARAMETERS each MOVED the cache key
  #     (measured — the key became the one a git-less tree produces);
  #   * GIT_INDEX_FILE was unset in compute_key and NOT in make-manifest.sh, so the key described
  #     the default index while the manifest it is supposed to cover described the alternate one:
  #     same key, different manifest, `--resume` replaying a PASS the fresh run fails.
  # Both halves run here. Delete the `. tests/git-env.sh` line from either script → this goes red.
  local sc="$W/gitenv" alt="$W/gitenv-altidx" fails="" pois="" v k0 kp m0 m1 m2 blob
  for v in $(git rev-parse --local-env-vars 2>/dev/null); do
    case "$v" in GIT_CONFIG_COUNT) pois="$pois $v=0" ;; *) pois="$pois $v=/nonexistent-wd-gitenv" ;; esac
  done
  [ -n "$pois" ] || { bad "git named no local env vars — the poison would be vacuous"; return; }
  # (1) THE KEY. Poison every one of them at once: a partial cleanup shows up as a moved key.
  k0=$( WD_REG_RES= WD_REG_KEY= TMPDIR="$W" bash "$REPO/tests/regress.sh" --seal-check zzzzzzzzzzzz 2>&1 | sed -n 's/.*, \([0-9a-f]*\) now\..*/\1/p' )
  # shellcheck disable=SC2086  # $pois is a list of NAME=VALUE words, built here — splitting is the point
  kp=$( env $pois WD_REG_RES= WD_REG_KEY= TMPDIR="$W" bash "$REPO/tests/regress.sh" --seal-check zzzzzzzzzzzz 2>&1 | sed -n 's/.*, \([0-9a-f]*\) now\..*/\1/p' )
  [ -n "$k0" ] || { bad "no key from a clean run — the comparison would be vacuous"; return; }
  [ "$k0" = "$kp" ] || fails="$fails key($k0!=$kp)"
  # (2) THE MANIFEST, in a throwaway repo so this works where $REPO has no .git (the container copy
  # does not). Two tracked files are enough: what is asserted is that both runs answer alike, not
  # what they answer. The alternate index restages VERSION with schema's blob — a difference the
  # unfixed script reported and the key never saw.
  # THIS LIST IS make-manifest.sh's REQUIRED-PATH GUARD, and the two move together: adding a path
  # there without adding it here makes the generator refuse this scratch repo, which is what the
  # vacuity guard below then reports (measured when `.weavedoc/schemas/v3` was added). The guard
  # catching it loudly is the design; keeping the two lists in step is the maintenance.
  mkdir -p "$sc/.weavedoc/schemas" "$sc/tests" "$sc/.claude/skills/weavedoc-x"
  cp "$REPO/.weavedoc/VERSION" "$REPO/.weavedoc/schema" "$REPO/.weavedoc/READ.md" \
     "$REPO/.weavedoc/FORMATS.md" "$REPO/.weavedoc/PARSER-MODEL.md" \
     "$REPO/.weavedoc/.gitattributes" "$sc/.weavedoc"/ 2>/dev/null
  cp "$REPO/.weavedoc/schemas/v3" "$sc/.weavedoc/schemas"/ 2>/dev/null
  mkdir -p "$sc/.weavedoc/bin" && cp "$REPO/.weavedoc/bin/weavedoc.mjs" "$sc/.weavedoc/bin"/ 2>/dev/null
  printf 'skill
' > "$sc/.claude/skills/weavedoc-x/SKILL.md"
  printf 'other
' > "$sc/.claude/skills/not-ours.md"
  cp "$REPO/tests/make-manifest.sh" "$REPO/tests/git-env.sh" "$sc/tests"/ 2>/dev/null
  ( cd "$sc" && git init -q . && git add -A >/dev/null 2>&1 ) || { bad "could not build a scratch git repo"; return; }
  cp "$sc/.git/index" "$alt" 2>/dev/null
  blob=$( cd "$sc" && git rev-parse :.weavedoc/schema 2>/dev/null )
  ( cd "$sc" && GIT_INDEX_FILE="$alt" git update-index --cacheinfo 100644,"$blob",.weavedoc/VERSION >/dev/null 2>&1 ) \
    || { bad "could not stage into the alternate index"; return; }
  m0=$( cd "$sc" && bash tests/make-manifest.sh 2>/dev/null )
  m1=$( cd "$sc" && GIT_INDEX_FILE="$alt" bash tests/make-manifest.sh 2>/dev/null )
  case "$m0" in *.weavedoc/VERSION*) ;; *) bad "the scratch manifest is empty — the comparison would be vacuous"; return ;; esac
  case "$m0" in *weavedoc-x/SKILL.md*) ;; *) bad "the scratch manifest has no skill row — the pathspec half would be vacuous"; return ;; esac
  case "$m0" in *not-ours.md*) bad "the manifest picked up a skill that is not ours"; return ;; esac
  [ "$m0" = "$m1" ] || fails="$fails manifest"
  # (3) THE PATHSPEC FAMILY, which `git rev-parse --local-env-vars` does not name (external review,
  # v0.5.18). With GIT_LITERAL_PATHSPECS set, the glob that used to select the skills matched
  # nothing: 46 rows became 36 and the digest changed while the suite's cache key did not move at
  # all. Both halves of the fix are exercised — git-env.sh clears these four, and make-manifest.sh
  # no longer selects through a glob — so either alone keeps this green and removing both is red.
  for v in GIT_LITERAL_PATHSPECS GIT_NOGLOB_PATHSPECS GIT_GLOB_PATHSPECS GIT_ICASE_PATHSPECS; do
    m2=$( cd "$sc" && env "$v=1" bash tests/make-manifest.sh 2>/dev/null )
    [ "$m0" = "$m2" ] || fails="$fails pathspec($v)"
  done
  OUT="leaks:${fails:- none}"; RC=0
  if [ -n "$fails" ]; then bad "an inherited git environment still reaches:$fails"; else ok; fi
}
meta_manifest_generator_fails_closed() {
  # THE RELEASE WARRANTY MAY NOT REPORT SUCCESS ON NOTHING (external review, v0.5.18). This script
  # absorbed every git failure into an empty manifest and rc 0 — measured on v0.5.17: run outside a
  # repository, run in a repository that stages none of these files, or hit an unreadable blob, and
  # all three printed nothing and exited 0. The last one was the worst: `git cat-file` failing left
  # the pipeline hashing EMPTY INPUT, so the manifest recorded `e3b0c442…` — the sha256 of nothing —
  # as though it were the file's digest. Revert pipefail, the per-blob promotion, or the
  # required-path guard → this goes red.
  local sc="$W/mmfc" out rc fails=""
  mkdir -p "$sc/tests"
  cp "$REPO/tests/make-manifest.sh" "$REPO/tests/git-env.sh" "$sc/tests"/ 2>/dev/null
  # (1) no repository at all
  out=$( cd "$sc" && bash tests/make-manifest.sh 2>/dev/null ); rc=$?
  [ "$rc" != 0 ] || fails="$fails no-repo-rc0"
  [ -z "$out" ] || fails="$fails no-repo-output"
  # (2) a repository that holds none of the required paths
  ( cd "$sc" && git init -q . && git add -A >/dev/null 2>&1 ) || { bad "could not build a scratch git repo"; return; }
  out=$( cd "$sc" && bash tests/make-manifest.sh 2>/dev/null ); rc=$?
  [ "$rc" != 0 ] || fails="$fails empty-rc0"
  [ -z "$out" ] || fails="$fails empty-output"
  # (3) and the sha256 of empty input must never appear as a row
  case "$out" in *e3b0c44298fc1c14*) fails="$fails empty-blob-digest" ;; esac
  # (4) A STAGED BLOB THAT CANNOT BE READ. This is the worst of the three: `git cat-file` failing
  # left the pipeline hashing EMPTY INPUT, so the row recorded `e3b0c442…` — the sha256 of nothing —
  # as though it were the file's digest, and the script exited 0. Built by staging the required
  # paths and then deleting one loose object out from under the index.
  local sc2="$W/mmfc2" obj
  mkdir -p "$sc2/tests" "$sc2/.weavedoc/bin" "$sc2/.weavedoc/schemas"
  cp "$REPO/tests/make-manifest.sh" "$REPO/tests/git-env.sh" "$sc2/tests"/ 2>/dev/null
  # Same coupling to make-manifest.sh's required-path guard as the case above.
  cp "$REPO/.weavedoc/VERSION" "$REPO/.weavedoc/schema" "$REPO/.weavedoc/READ.md" \
     "$REPO/.weavedoc/FORMATS.md" "$REPO/.weavedoc/PARSER-MODEL.md" \
     "$REPO/.weavedoc/.gitattributes" "$sc2/.weavedoc"/ 2>/dev/null
  cp "$REPO/.weavedoc/schemas/v3" "$sc2/.weavedoc/schemas"/ 2>/dev/null
  cp "$REPO/.weavedoc/bin/weavedoc.mjs" "$sc2/.weavedoc/bin"/ 2>/dev/null
  ( cd "$sc2" && git init -q . && git add -A >/dev/null 2>&1 ) || { bad "could not build the second scratch repo"; return; }
  out=$( cd "$sc2" && bash tests/make-manifest.sh 2>/dev/null ); rc=$?
  [ "$rc" = 0 ] || { OUT="the intact scratch repo already failed: rc=$rc"; bad "the unreadable-blob probe would be vacuous"; return; }
  obj=$( cd "$sc2" && git rev-parse ":.weavedoc/schema" 2>/dev/null )
  rm -f "$sc2/.git/objects/${obj:0:2}/${obj:2}" 2>/dev/null
  [ -f "$sc2/.git/objects/${obj:0:2}/${obj:2}" ] && { bad "could not remove the object — the probe would be vacuous"; return; }
  out=$( cd "$sc2" && bash tests/make-manifest.sh 2>/dev/null ); rc=$?
  [ "$rc" != 0 ] || fails="$fails unreadable-blob-rc0"
  case "$out" in *e3b0c44298fc1c14*) fails="$fails unreadable-blob-digest" ;; esac
  OUT="fails:${fails:- none}"; RC=0
  if [ -n "$fails" ]; then bad "the manifest generator is not fail-closed:$fails"; else ok; fi
}
meta_manifest_required_path_is_exact() {
  # THE GUARD MUST COMPARE A PATH, NOT A PREFIX (external review, v0.5.21). The required-path check
  # was `case "$out" in *"  $r"*`, which any row whose path merely STARTS with the required one
  # satisfies — so a tree holding `weavedoc.mjs.bak` and no `weavedoc.mjs` passed the guard that
  # exists to catch exactly that shape. Built here by staging the .bak and nothing else.
  # Revert the awk field comparison to the substring case → this goes red.
  local sc="$W/mmex" out rc
  mkdir -p "$sc/tests" "$sc/.weavedoc/bin"
  cp "$REPO/tests/make-manifest.sh" "$REPO/tests/git-env.sh" "$sc/tests"/ 2>/dev/null
  cp "$REPO/.weavedoc/VERSION" "$REPO/.weavedoc/schema" "$REPO/.weavedoc/READ.md" \
     "$REPO/.weavedoc/FORMATS.md" "$REPO/.weavedoc/PARSER-MODEL.md" \
     "$REPO/.weavedoc/.gitattributes" "$sc/.weavedoc"/ 2>/dev/null
  cp "$REPO/.weavedoc/bin/weavedoc.mjs" "$sc/.weavedoc/bin/weavedoc.mjs.bak" 2>/dev/null
  ( cd "$sc" && git init -q . && git add -A >/dev/null 2>&1 ) || { bad "could not build a scratch git repo"; return; }
  # The vacuity check reads the INDEX, not the manifest: on refusal the generator prints nothing,
  # so asserting the .bak's presence in stdout would be vacuous exactly when the case matters.
  ( cd "$sc" && git ls-files | grep -q 'weavedoc[.]mjs[.]bak' ) || { bad "the .bak was not staged — the probe would be vacuous"; return; }
  ( cd "$sc" && git ls-files | grep -qx '.weavedoc/bin/weavedoc.mjs' ) && { bad "the real entrypoint is staged too — the probe would prove nothing"; return; }
  out=$( cd "$sc" && bash tests/make-manifest.sh 2>/dev/null ); rc=$?
  OUT="rc=$rc rows=$(printf '%s
' "$out" | grep -c . || true)"
  if [ "$rc" = 0 ]; then bad "a '.bak' row satisfied the required-path guard for weavedoc.mjs"; else ok; fi
}
meta_git_env_writes_stay_inside() {
  # THE WRITE HALF (external review, v0.5.17). With an inherited GIT_OBJECT_DIRECTORY, the scratch
  # repo meta_key_covers_the_git_index builds wrote 79 objects into an UNRELATED repository — and
  # the case reported PASS, in the release whose own lesson was that a test may not touch a tree it
  # is not grading. Runs that case as a CHILD under a poisoned environment and reads the victim.
  # Isolated copy, never $REPO: the child computes the key twice and a live tree would make this
  # case fail on someone else's edit rather than on the leak (v0.5.16's lesson, applied).
  # GIT_DIR and GIT_INDEX_FILE are poisoned alongside it. Those two were ALREADY handled in v0.5.16,
  # so that part of this case passes before and after — it is here so a future cleanup cannot be
  # narrowed back to "the object dir only" without going red.
  local copy="$W/gitwrite" vic="$W/gitwrite-victim" before after vidx0 vidx1 out
  mkdir -p "$copy/.claude" "$vic"
  cp -r "$REPO/tests" "$REPO/.weavedoc" "$copy"/ 2>/dev/null
  cp -r "$REPO/.claude/skills" "$copy/.claude"/ 2>/dev/null
  cp "$REPO/README.md" "$REPO/CHANGELOG.md" "$copy"/ 2>/dev/null
  ( cd "$vic" && git init -q . && printf 'victim\n' > v.txt && git add v.txt >/dev/null 2>&1 ) \
    || { bad "could not build the victim repo"; return; }
  before=$( find "$vic/.git/objects" -type f 2>/dev/null | wc -l | tr -d ' ' )
  vidx0=$( sha256sum "$vic/.git/index" 2>/dev/null | awk '{print $1}' )
  [ "$before" -gt 0 ] || { bad "the victim has no objects to compare against"; return; }
  out=$( cd "$copy" && env GIT_OBJECT_DIRECTORY="$vic/.git/objects" GIT_DIR="$vic/.git" GIT_INDEX_FILE="$vic/.git/index" \
         WD_REG_RES= WD_REG_KEY= TMPDIR="$W" bash tests/regress.sh --one meta_key_covers_the_git_index 2>&1 )
  after=$( find "$vic/.git/objects" -type f 2>/dev/null | wc -l | tr -d ' ' )
  vidx1=$( sha256sum "$vic/.git/index" 2>/dev/null | awk '{print $1}' )
  OUT="victim objects $before->$after :: $out"
  case "$out" in *meta_key_covers_the_git_index*) ;; *) bad "the child never ran the case"; return ;; esac
  if [ "$before" != "$after" ]; then bad "the child wrote $((after - before)) objects into the victim repository"
  elif [ "$vidx0" != "$vidx1" ]; then bad "the child rewrote the victim's index"
  else ok; fi
}
meta_key_seal_covers_one_and_worker_branch() {
  # THE TWO MECHANISMS v0.5.14 ADDED, exercised (cold review, v0.5.14). Deleting `--one`'s seal
  # call, or the worker-branch refusal on `--seal-check`, left every case green — two new gate
  # mechanisms with zero coverage, in the release whose own lesson is "text is not behaviour".
  #   Revert either guard → this goes red.
  local out rc copy="$W/repo"
  # (1) --one seals — AGAINST AN ISOLATED COPY, never the live tree (external review, v0.5.16).
  # The first version ran the probe in $REPO: it overwrote `.weavedoc/bin/lib/.seal-probe.mjs` and
  # then deleted it, so a real file at that path was DESTROYED (measured), and the A→B→A shape it
  # created was invisible to the seal while other workers could read state B mid-sweep. A test may
  # not mutate the tree it is grading. The copy carries exactly what compute_key and the harness
  # read; `git` is absent there, which compute_key already tolerates (its own `2>/dev/null`).
  mkdir -p "$copy"
  cp -r "$REPO/tests" "$REPO/.weavedoc" "$copy"/ 2>/dev/null
  mkdir -p "$copy/.claude"
  cp -r "$REPO/.claude/skills" "$copy/.claude"/ 2>/dev/null
  cp "$REPO/README.md" "$REPO/CHANGELOG.md" "$copy"/ 2>/dev/null
  out=$( cd "$copy" && WD_REG_RES= WD_REG_KEY= TMPDIR="$W" bash tests/regress.sh --one sealprobe_writes_keyed_file 2>&1 ); rc=$?
  OUT="one: rc=$rc :: $out"
  case "$out" in *"the tree changed while the suite was running"*) ;; *) bad "--one did not seal"; return ;; esac
  [ "$rc" = 2 ] || { bad "--one sealed but exited $rc"; return; }
  # (1b) --one refuses in the worker branch too — BEFORE running anything, so it cannot leave a
  # result in the parent's shared cache. Replacing it with v0.5.15's silent skip left the whole
  # sweep green (cold review, v0.5.16): the branch was unreachable from any in-repo caller.
  local fake="$W/fake-res"
  mkdir -p "$fake"
  out=$( cd "$REPO" && WD_REG_RES="$fake" WD_REG_KEY=abc TMPDIR="$W" bash tests/regress.sh --one acct_smoke_version 2>&1 ); rc=$?
  OUT="$OUT || one-worker: rc=$rc left=$(ls "$fake" | wc -l) :: $out"
  case "$out" in *"that is the worker branch"*) ;; *) bad "--one did not refuse in the worker branch"; return ;; esac
  [ "$rc" = 2 ] || { bad "--one worker refusal exited $rc"; return; }
  [ "$(ls "$fake" | wc -l)" = 0 ] || { bad "--one wrote into the parent's cache before refusing"; return; }
  # (2) --seal-check refuses to run in the worker branch instead of dying on an undefined function.
  out=$( cd "$REPO" && WD_REG_RES="$W/fake-res" WD_REG_KEY=abc TMPDIR="$W" bash tests/regress.sh --seal-check zzz 2>&1 ); rc=$?
  OUT="$OUT || worker: rc=$rc :: $out"
  case "$out" in
    *"command not found"*) bad "--seal-check died on the undefined function instead of refusing" ;;
    *"that is the worker branch"*) [ "$rc" = 2 ] && ok || bad "worker-branch refusal exited $rc" ;;
    *) bad "--seal-check gave no worker-branch refusal" ;;
  esac
}
sealprobe_writes_keyed_file() {
  # A PROBE, not an assertion — the ONLY case that writes inside $REPO, and it does so on purpose:
  # meta_key_seal_covers_one_and_worker_branch runs it through `--one` INSIDE AN ISOLATED COPY of
  # the repo, so that run's own seal has something to catch and no real file is ever touched. Run
  # by name against a live tree it leaves the file behind and that run's seal refuses — honest, but
  # it is yours to delete (v0.5.16: the caller's `rm` went away with the copy).
  #
  # NAMED `sealprobe_`, NOT `acct_`, and that is the point: the selector takes
  # ^(block|pass|acct|meta|e2e)_, so this is unreachable from a plain sweep and can only be summoned
  # by name. Scheduled like a case it would leave the file behind mid-sweep, the sweep's own seal
  # would refuse — correctly — and every run would fail. The suite already keeps `nodeshape_`
  # outside the selector for exactly this reason.
  printf 'export const probe = 1\n' > "$REPO/.weavedoc/bin/lib/.seal-probe.mjs"
  OUT="seal probe: wrote .weavedoc/bin/lib/.seal-probe.mjs (its caller removes it)"; RC=0; ok
}
meta_key_seal_refuses_and_clears() {
  # THE SEAL'S BEHAVIOUR, not its text (cold review, v0.5.13). The first version of this guard
  # counted four strings in the source, and text is not behaviour: mutating `exit 2` to `exit 0`,
  # or making the `if` unreachable, left it GREEN with the seal dead — this suite's oldest class,
  # one level up. `--seal-check <key>` runs the real `seal_or_refuse`, so the refusal is exercised:
  # message, exit code, and the cache actually being discarded.
  # THE SENTINEL GOES IN THE CHILD'S OWN CACHE (external review, v0.5.14). The first version made
  # `$W/.sealres` and then counted `$RES` — this case's own dir, not the child's — so the deletion
  # half asserted nothing: replacing the real `rm -rf` with `:` left it green. The child's cache is
  # `$TMPDIR/wd-reg-<key>/res`, and TMPDIR is pointed at this case's workspace so nothing outside
  # it is touched; the key is read from the child's own refusal message.
  local out rc key child
  # WD_REG_RES/WD_REG_KEY are CLEARED for the child: inside a --batch worker they are exported, and
  # a child that inherits them takes the "worker" branch where `compute_key` is never defined — so
  # the seal could not run and this case failed only under the real fan-out, never under `--one`
  # (found by the container sweep, v0.5.14).
  out=$( cd "$REPO" && WD_REG_RES= WD_REG_KEY= TMPDIR="$W" bash tests/regress.sh --seal-check deadbeefcafe 2>&1 ); rc=$?
  key=$(printf '%s\n' "$out" | sed -n 's/.*, \([0-9a-f]*\) now\..*/\1/p')
  child="$W/wd-reg-$key/res"
  OUT="rc=$rc key=$key child=$child :: $out"
  case "$out" in
    *"the tree changed while the suite was running"*) ;;
    *) bad "the seal did not refuse on a key that cannot match"; return ;;
  esac
  if [ "$rc" != 2 ]; then bad "the seal refused but exited $rc — CI reads anything but 2 as a pass"; return; fi
  if [ -z "$key" ]; then bad "could not read the child's key from its refusal — the sentinel check would be vacuous"; return; fi
  # Now prove the DELETION: plant a result in the child's real cache, refuse again, require it gone.
  mkdir -p "$child"; : > "$child/planted-result"
  # WD_REG_RES/WD_REG_KEY are CLEARED for the child: inside a --batch worker they are exported, and
  # a child that inherits them takes the "worker" branch where `compute_key` is never defined — so
  # the seal could not run and this case failed only under the real fan-out, never under `--one`
  # (found by the container sweep, v0.5.14).
  out=$( cd "$REPO" && WD_REG_RES= WD_REG_KEY= TMPDIR="$W" bash tests/regress.sh --seal-check deadbeefcafe 2>&1 ); rc=$?
  if [ -e "$child/planted-result" ]; then bad "the seal said the cache was discarded but $child/planted-result survived"
  elif [ "$rc" != 2 ]; then bad "second refusal exited $rc"
  else ok; fi
}
meta_key_seal_is_one_function_called_twice() {
  # THE SEAL'S STRUCTURE, pinned in source (v0.5.13). The behavioural proof is a race — start a
  # sweep, edit a keyed file mid-run, watch it refuse with rc 2 — which is measured by hand and
  # recorded in the CHANGELOG rather than automated here, because a case that edits $REPO while
  # other cases read it would be the very hazard it is testing. What CAN be pinned cheaply is the
  # shape: ONE `compute_key` definition, called at the start AND after the workers. Re-inlining
  # either call site is how the snapshot-only key came back the first time.
  # The patterns are ANCHORED at column 0 / its exact indent, so this case does not count its own
  # grep arguments — the vacuity trap one layer in (a self-matching source check reports 3 and 2
  # and looks like a real drift).
  local src="$REPO/tests/regress.sh" defs start tally
  defs=$(grep -c '^compute_key() {' "$src")
  start=$(grep -c '^KEY=\$(compute_key)$' "$src")
  tally=$(grep -c '^if \[ -z "\${WD_REG_RES:-}" \]; then seal_or_refuse "\$KEY"; fi$' "$src")
  OUT="defs=$defs start=$start tally=$tally"; RC=0
  if [ "$defs" != 1 ]; then bad "compute_key must be defined exactly once, found $defs"
  elif [ "$start" != 1 ]; then bad "the start-of-run key must be \$(compute_key), found $start"
  elif [ "$tally" != 1 ]; then bad "the tally must be preceded by an unconditional seal_or_refuse, found $tally"
  else ok; fi
}
meta_manifest_baseline_current() {
  # tests/baseline/bundle.manifest is the release's own identity record, and NOTHING read it: CI
  # only checks that two consecutive GENERATIONS agree, which is true of a baseline a year stale.
  # Two releases in a row refreshed it by hand and a third nearly shipped without (cold review,
  # v0.5.7) — a record nobody compares is a file, not a record (the same finding golden/ drew).
  # Compares the COMMITTED tree, not the working tree: make-manifest hashes git blobs, so an
  # uncommitted edit is legitimately absent until it is staged.
  # THREE-WAY, not two (external review, v0.5.10): comparing the fresh digest to .sha256 alone
  # never reads the committed manifest BODY — a hand-edited bundle.manifest with an untouched
  # .sha256 passed while describing files that do not exist. The body is compared to the fresh
  # generation, and .sha256 is checked as the hash OF that body, so each of the three artifacts
  # is pinned to the other two.
  local fresh="$W/.fresh.manifest"
  ( cd "$REPO" && bash tests/make-manifest.sh 2>/dev/null ) > "$fresh"
  local now rec bodysha
  now=$(sha256sum "$fresh" | awk '{print $1}')
  rec=$(cd "$REPO" && cat tests/baseline/bundle.manifest.sha256 2>/dev/null | tr -d '[:space:]')
  bodysha=$(cd "$REPO" && sha256sum tests/baseline/bundle.manifest 2>/dev/null | awk '{print $1}')
  OUT="manifest now=$now recorded=$rec body=$bodysha"; RC=0
  if [ ! -s "$fresh" ] || [ -z "$rec" ] || [ -z "$bodysha" ]; then
    bad "manifest artifact missing (fresh=$([ -s "$fresh" ] && echo ok || echo EMPTY) recorded='$rec' body='$bodysha') — the comparison would be vacuous"
  elif ! cmp -s "$fresh" "$REPO/tests/baseline/bundle.manifest"; then
    bad "tests/baseline/bundle.manifest BODY differs from a fresh generation — regenerate it ('bash tests/make-manifest.sh > tests/baseline/bundle.manifest' + its .sha256) and commit"
  elif [ "$bodysha" != "$rec" ]; then
    bad "bundle.manifest.sha256 is not the hash of bundle.manifest — the two artifacts drifted apart; regenerate both"
  else ok; fi
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
  expect_has "— 1 truth(s)"
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
  printf -- '---\nid: t002\nclaim: "자료가 선언한 태그 줄"\nsource: m001\ntags: [대금]\n---\n\ntags: [위약, 대금]\n' > "$W/truths/t002.md"
  printf -- '- 태그 선언 줄: t002\n' >> "$W/truths/coverage.md"
  printf -- '- added: t002 (2026-07-30)\n' >> "$W/truths/changelog.md"
  ( cd "$W" && "${WDRUN[@]}" reindex >/dev/null 2>&1 )
  mint
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
  printf -- '---\r\nid: t002\r\nclaim: "대금은 5천만원이다"\r\nsource: m001\r\ntags: [대금]\r\n---\r\n\r\n제3조 대금은 5천만원으로 한다.\r\n' > "$W/truths/t002.md"
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
  mint
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
  # inbox/ is one of the four configured paths and weavedoc-init creates it, so a mine built from
  # the shipped templates has one — it was missing here only because validate did not look (v0.5.21).
  local p="$W-tmpl"; rm -rf "$p" 2>/dev/null; mkdir -p "$p/inbox" "$p/materials/m001" "$p/truths" "$p/documents/d1"
  mkdir -p "$p/.weavedoc-state"
  printf '{\n  "version": 1,\n  "open": []\n}\n' > "$p/.weavedoc-state/conflicts.json"
  printf '{\n  "version": 1,\n  "next": {\n    "conflict": 1,\n    "material": 2,\n    "truth": 2\n  }\n}\n' > "$p/.weavedoc-state/id-sequences.json"
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
  printf -- '---\nid: t002\nclaim: "지체상금은 일 0.1%%다"\nsource: m001\ntags: [위약]\n---\n\n제9조 지체상금은 일 0.1%%로 한다.\n' > "$W/truths/t002.md"
  ( cd "$W" && "${WDRUN[@]}" reindex >/dev/null 2>&1 )
  vrun validate; expect_has "1 sealed · 1 seal FAILED"
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
  if [ "$seen" = "claim id source tags" ]; then ok
  else bad "truth FM-MISSING order is '$seen', want 'claim id source tags' (schema order sorted; an unspecified order cannot be ported)"; fi
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

# ---- status --open: the open-item listing (v0.5.5, "Surface, don't point") ----
# The skill rule says a run's closing message must carry every item waiting on the user; this mode
# is its mechanical source. What the cases pin: the listing and `status`'s counters are ONE walk
# (a count the listing disagrees with is the two-readers drift class), closed states stay out, and
# content a ledger reader cannot see is NAMED as invisible rather than silently absent.

acct_openlist_hq_counts_agree() {
  # The listing derives from the same collector as the `status` counter — both surfaces asserted
  # on one fixture, so a drift between them is a red case here and not a discovery in the field.
  printf -- '\n- [open] [user-only] 병기 허용 여부\n- [open] [machine] 재색인 필요\n- [ruled] [user-only] 지난 라운드 처리\n' >> "$W/truths/verify.md"
  vrun status; expect_has "open 2"
  vrun status --open
  expect_pass
  expect_has "human queue (2):"
  expect_has "truths/verify.md: - [open] [user-only] 병기 허용 여부"
  expect_has "truths/verify.md: - [open] [machine] 재색인 필요"
  expect_hasnt "지난 라운드 처리"
}
acct_openlist_untagged_shown() {
  # An entry with no state tag is outside the open count (validate rejects it), but a
  # what-is-waiting listing that silently omits it hides exactly the debt the counter names.
  printf -- '\n- [open] [user-only] 실제 열린 항목\n- 상태 태그가 없는 항목\n' >> "$W/truths/verify.md"
  vrun status --open
  expect_has "human queue (1 open, 1 untagged):"
  expect_has "truths/verify.md (untagged): - 상태 태그가 없는 항목"
}
acct_openlist_questions_states() {
  # open + proposed are both waiting (proposed = candidates on the table, nothing confirmed);
  # answered is closed and stays out of a listing of what is waiting.
  cat > "$W/questions.md" <<'EOF'
# 질문

- [open] d1 §2 — 지체상금 상한 — 작성에 필요
- [proposed] 학교명 — 후보 3안 제시됨
- [answered] 위약금 요율 — 10% (사용자: "10%로 확정")
EOF
  vrun status --open
  expect_has "questions (2):"
  expect_has "- [open] d1 §2 — 지체상금 상한"
  expect_has "- [proposed] 학교명"
  expect_hasnt "위약금 요율"
}
acct_openlist_gaps_open_only() {
  # Open entries list; Accepted entries are DECISIONS and stay out. A bullet that is placeholders
  # THROUGHOUT is template noise. A bullet whose kind slot kept its placeholder but whose BODY is
  # written out is a real gap (FORMATS: the remainder decides) — this case carried only the pure
  # stub in v0.5.5 and so LOCKED the defect below in place; both shapes are pinned now.
  cat > "$W/gaps.md" <<'EOF'
# Open

- [enumeration] 앨범 — 6곡 계획 vs 5곡 수록 — m002 대비
- [<kind>] <where> — <what>

# Accepted

- [symmetry] 멤버 프로필 — 의도적 공백 — scope: [멤버] — recheck: 새 자료 — as-of: t001
EOF
  vrun status --open
  expect_has "gaps (1):"
  expect_has "- [enumeration] 앨범 — 6곡 계획 vs 5곡 수록"
  expect_hasnt "의도적 공백"
  expect_hasnt "<where>"
}
acct_openlist_gaps_structure_warns_when_off() {
  # The typed register owns headings and stray records even when completeness enforcement is off.
  # A likely section-name typo must not end an agent run with "nothing is waiting".
  printf '# Oepn\n- [declared] ORPHANED-BY-TYPO\n# Accepted\n' > "$W/gaps.md"
  vrun status --open
  expect_has "must have exactly one '# Open'"
  expect_has "outside its Open/Accepted sections"
  expect_hasnt "nothing is waiting on you"
  vrun gaps
  expect_has "must have exactly one '# Open'"
  expect_has "ORPHANED-BY-TYPO"
}
acct_openlist_gaps_filled_placeholder() {
  # P1 (external review, v0.5.5): the listing dropped every bullet whose kind slot opened with a
  # placeholder — the PREFIX rule validate abandoned in v0.5.4 review #9 — so a gap validate counts
  # and blocks on read as "nothing is waiting". FORMATS: only a line that is placeholders
  # throughout is noise; the remainder decides.
  printf '# Open\n\n- [<kind>] album — six-vs-five\n\n# Accepted\n' > "$W/gaps.md"
  vrun status --open
  expect_has "gaps (1):"
  expect_has "album — six-vs-five"
  expect_hasnt "nothing is waiting on you"
}
acct_openlist_gaps_continuation_realized() {
  # The other half of the same rule: a held-back placeholder bullet is REALIZED by a continuation
  # with real content. validate counts it as one open gap, so the listing must show one.
  printf '# Open\n\n- [{kind}]\n  실제 내용이 이어짐 — 6곡 vs 5곡\n\n# Accepted\n' > "$W/gaps.md"
  vrun status --open
  expect_has "gaps (1):"
  expect_hasnt "nothing is waiting on you"
}
acct_openlist_gaps_arrays_agree() {
  # THE THREE RETURNS MUST DESCRIBE ONE SCAN. `n` is what validate counts, `entries` is what the
  # listing prints, and `kinds` (v0.5.18) is what tells the listing WHICH of them names a kind. They
  # are parallel arrays, so a push the other branch forgets does not fail loudly — it shifts every
  # label by one and puts "malformed" on the wrong line. Asserted through the CLI like every other
  # case here: a realization comes FIRST, so a missing push at that branch moves the label off
  # `- (없음)` and onto the realized entry above it. Drop either `kinds.push` → this goes red.
  #   (The first spelling imported the module in `node -e` with a top-level await — and WITHOUT
  #   `--input-type=module`, which the three fault-injection probes in this file all carry. Node 20
  #   and 22 detect the module syntax and ran it; node 18, the declared floor, does not, and only
  #   the TAG run uses 18 — so it was green locally, green in the container, and a SyntaxError on
  #   all three CI platforms. Two lessons in one line: the floor is not what a local sweep grades,
  #   and a case that reaches inside the runtime pays for it in ways a CLI case cannot.)
  cat > "$W/gaps.md" <<'EOF'
# Open

- [{kind}]
  실제 내용이 이어짐
- (없음)
- [reference] 라온고 — 정의하는 truth 없음 — t001 언급

# Accepted

- [declared] 3장 — 의도적으로 남김 — scope: a — recheck: b — as-of: t001
EOF
  vrun status --open
  expect_has "gaps (2 open, 1 malformed):"
  expect_has "(malformed register entry — no [kind] slot): - (없음)"
  # …and NOT on the entry above it, which is where a shifted `kinds` array puts it.
  expect_hasnt "no [kind] slot): - [{kind}] 실제 내용이 이어짐"
}
acct_openlist_gaps_count_matches_validate() {
  # THE ANTI-DRIFT GUARD, and the case this release exists for: one gaps.md, two readers, one
  # answer. Every shape that ever split them rides in the same file — plain entry, filled
  # placeholder, pure stub, realized continuation, sub-bullet, accepted entry — and the two counts
  # are compared to EACH OTHER, so a future reader that drifts either way goes red without anyone
  # having to predict which shape it will drift on.
  sed -i 's/^  completeness: off/  completeness: required/' "$W/.weavedoc/config.yaml"
  cat > "$W/gaps.md" <<'EOF'
# Open

- [enumeration] 앨범 — 6곡 계획 vs 5곡 수록 — m002 대비
- [<kind>] album — six-vs-five
- [<kind>] <where> — <what>
- [{kind}]
  실제 내용이 이어짐
- [reference] 라온고 — 정의하는 truth 없음 — t001 언급
  - 근거: 하위 불릿은 항목이 아니다

# Accepted

- [symmetry] 멤버 프로필 — 의도적 공백 — scope: [멤버] — recheck: 새 자료 — as-of: t001
EOF
  local vn ln
  vrun validate
  vn=$(printf '%s\n' "$OUT" | sed -n 's/.*holds \([0-9]*\) open gap(s).*/\1/p' | head -1)
  vrun status --open
  ln=$(printf '%s\n' "$OUT" | sed -n 's/^gaps (\([0-9]*\)):$/\1/p' | head -1)
  # Neither may be empty: two blank strings compare equal, which is this suite's named vacuity trap.
  if [ -z "$vn" ] || [ -z "$ln" ]; then
    bad "one of the readers printed no count (validate='$vn' listing='$ln') — the comparison would be vacuous"
  elif [ "$vn" != "$ln" ]; then
    bad "validate counts $vn open gap(s), status --open lists $ln — one file, two answers"
  else ok; fi
}
acct_openlist_gaps_continuation_shown() {
  # A gap's CONTENT can live entirely on its continuation lines — FORMATS makes an indented line
  # under a bullet part of the entry — and the listing showed only the bullet, so the reader got
  # `- [declared]` and had to open the file: the exact "Surface, don't point" failure this command
  # exists to end (external review, v0.5.6). The count was right, which is why a count-only
  # assertion could not see it; this case asserts the CONTENT.
  # Revert the `else if (last >= 0)` fold arm in gaps-register.mjs → this goes red.
  printf '# Open\n\n- [declared]\n  penalty cap의 근거가 필요함\n\n# Accepted\n' > "$W/gaps.md"
  vrun status --open
  expect_has "gaps (1):"
  expect_has "- [declared] penalty cap의 근거가 필요함"
}
acct_openlist_gaps_continuation_multi() {
  # Several continuation lines fold into the one line the entry gets — "one line per item" is the
  # rule the whole listing is built on, so an entry does not get to break it by being long.
  # Revert the `else if (last >= 0)` fold arm in gaps-register.mjs → this goes red.
  printf '# Open\n\n- [reference]\n  라온고 — 정의하는 truth 없음\n  t001에서만 언급됨\n\n# Accepted\n' > "$W/gaps.md"
  vrun status --open
  expect_has "gaps (1):"
  expect_has "- [reference] 라온고 — 정의하는 truth 없음 t001에서만 언급됨"
}
acct_openlist_fold_only_when_empty() {
  # THE NARROWING (cold review, v0.5.7): the first fix folded EVERY continuation, so an entry that
  # already carried its content swallowed its sub-bullets and rendered as one line wearing two
  # entry tokens. Folding happens only when the entry's own line is nothing but its tags.
  # Revert `emptyRemainder(gl, ENTRY_TAG) ? … : -1` to an unconditional index → this goes red.
  printf '# Open\n\n- [enumeration] 앨범 — 6곡 계획 vs 5곡 수록\n  - [declared] 하위 항목처럼 보이는 부연\n\n# Accepted\n' > "$W/gaps.md"
  vrun status --open
  expect_has "gaps (1):"
  expect_hasnt "부연"
}
acct_openlist_hq_continuation_shown() {
  # The same defect in the twin ledger. v0.5.7 first fixed only gaps.md while the CHANGELOG headline
  # read repo-wide (cold review) — a Human-queue entry whose content lives on its continuation was
  # still listed as a bare `- [open] [user-only]`.
  # Revert the `last`/emptyRemainder block in hqEntries → this goes red.
  printf -- '\n- [open] [user-only]\n  병기 허용 여부를 정해 주세요\n' >> "$W/truths/verify.md"
  vrun status --open
  expect_has "human queue (1):"
  expect_has "- [open] [user-only] 병기 허용 여부를 정해 주세요"
}
acct_openlist_question_continuation_shown() {
  # …and the third ledger. Same rule, same narrowing (an entry WITH content keeps its sub-bullets
  # as dropped detail — acct_openlist_subbullets_stay_detail pins that side).
  # Drop questions-ledger's structural detail from itemBodyFacts → this goes red.
  printf -- '# 질문\n\n- [open]\n  지체상금 상한 값이 필요합니다\n' > "$W/questions.md"
  vrun status --open
  expect_has "questions (1):"
  expect_has "- [open] 지체상금 상한 값이 필요합니다"
}
acct_openlist_inert_context_suspends_parent_state() {
  # Closed comments and fences are inert lexical nodes, not structural resets. A placeholder stays
  # held across them and real source-authentic detail after/interrupted by them materialises it.
  printf -- '\n- [{state}] [{ownership}]\n  <!-- audit -->REAL-HQ-AFTER-COMMENT\n' >> "$W/truths/verify.md"
  printf -- '- [{state}]\n  ```md\n  TEMPLATE EXAMPLE\n  ```\n  REAL-QUESTION-AFTER-FENCE\n' > "$W/questions.md"
  vrun status --open
  expect_has "REAL-HQ-AFTER-COMMENT"
  expect_has "REAL-QUESTION-AFTER-FENCE"
  expect_hasnt "nothing is waiting on you"
}
acct_openlist_none_idiom_anchored() {
  # `- (없음)` / `- (none)` is the EMPTY-ledger idiom; the pattern was not anchored, so a real entry
  # that merely opened with those words was swallowed and the ledger read as empty (external
  # review, v0.5.6). Revert the `[ \t\r]*$` anchor in NONE_IDIOM (cmd-status.mjs) → this goes red.
  printf -- '# 질문\n\n- (none) 실제로는 질문임\n' > "$W/questions.md"
  vrun status --open
  expect_has "실제로는 질문임"
  expect_hasnt "nothing is waiting on you"
}
acct_openlist_none_idiom_still_empty() {
  # AN OVER-BLOCKING GUARD: it passes before AND after the anchor fix, by design (there is no
  # red-first for this shape — it exists so the fix cannot be "achieved" by dropping the idiom).
  # The other direction, so the anchor cannot be "fixed" by deleting the idiom: a bare idiom line
  # is still an empty ledger in BOTH spellings and in both ledgers. The Human-queue arm carries
  # trailing whitespace (what an editor leaves); the questions arm is bare.
  printf -- '\n- (없음)  \n' >> "$W/truths/verify.md"
  printf -- '# 질문\n\n- (none)\n' > "$W/questions.md"
  vrun status --open
  expect_has "nothing is waiting on you"
}
acct_openlist_none_idiom_continuation_surfaces() {
  # Explicit empty is a typed sentinel, not `continue`. Real content below it materializes one
  # malformed record in each ledger and is shown instead of disappearing behind the idiom.
  printf -- '\n- (none)\n  REAL-HQ-BELOW-EMPTY\n' >> "$W/truths/verify.md"
  printf -- '- (none)\n  REAL-QUESTION-BELOW-EMPTY\n' > "$W/questions.md"
  vrun status --open
  expect_has "REAL-HQ-BELOW-EMPTY"
  expect_has "REAL-QUESTION-BELOW-EMPTY"
  expect_has "real content continued under"
  expect_hasnt "nothing is waiting on you"
}
acct_openlist_gaps_none_idiom_is_malformed() {
  # THE REGISTER HAS NO EMPTY-LEDGER IDIOM (ruled 2026-08-07, after an external review measured the
  # consequence). `- (없음)` / `- (none)` is the Human queue's and questions.md's way of writing "no
  # entries"; gaps.md is fail-closed and every bullet in it is a kind-tagged record, so the same
  # line here is a bullet with no routable kind. A real mine had one, and `status --open` reported
  # ONE WAITING GAP whose entire text was the word "none". The ruling keeps the invariant and names
  # the line instead of inventing a sentinel for it. Empty means zero bullets.
  # Drop the per-entry typed kind diagnostics from parseGapRegister (or the label below) → red.
  printf -- '# Open

- (없음)
- [declared] 3장 — 값이 미정 — 표에 TBD

# Accepted

' > "$W/gaps.md"
  vrun status --open
  # OPEN AND MALFORMED ARE DIFFERENT NUMBERS, and FORMATS says which: "a malformed register entry,
  # not a gap". v0.5.18 made this line print the TOTAL because validate counted the malformed entry
  # among the open gaps — one file, two numbers. The right repair was the other direction (external
  # review, v0.5.21): neither surface counts it as a gap, and it goes on blocking as COMP-MALFORMED.
  expect_has "gaps (1 open, 1 malformed):"
  expect_has "(malformed register entry — no [kind] slot): - (없음)"
  # …and that agreement is asserted, not left to a reader to notice: the same file, the same scan,
  # the same number on both surfaces, with the malformed line still blocking by its own name.
  sed -i 's/^  completeness: off.*$/  completeness: required/' "$W/.weavedoc/config.yaml"
  vrun validate
  expect_has "holds 1 open gap(s)"
  expect_block "no '[<kind>]' slot at all"
}
acct_openlist_gaps_none_idiom_malformed_in_accepted() {
  # BOTH SECTIONS, one grammar. `# Accepted` was the looser half of this register until §11
  # 2026-08-05 gave it the same scanner; the idiom ruling applies there for the same reason — an
  # accepted decision without a kind is a decision about nothing nameable. Under `required` the
  # gate names it; the listing only ever reads `# Open`, so this half is validate's to prove.
  printf -- '# Open

# Accepted

- (none)
' > "$W/gaps.md"
  sed -i 's/^  completeness: off.*$/  completeness: required/' "$W/.weavedoc/config.yaml"
  vrun validate
  expect_block "no '[<kind>]' slot at all"
}
acct_gaps_empty_register_is_zero_bullets() {
  # …and the form that IS empty: no bullets at all in either section, with the explanation in a
  # comment. This is the shape weavedoc-gaps writes and the shape a clean mine keeps; it must stay
  # green under `required`, or the ruling above would have no legal way to say "nothing is open".
  # Passes before and after — an over-blocking guard for the ruling, not a repro.
  printf -- '# Open

<!-- 열린 갭 없음 -->

# Accepted

' > "$W/gaps.md"
  sed -i 's/^  completeness: off.*$/  completeness: required/' "$W/.weavedoc/config.yaml"
  vrun validate; expect_pass
  vrun status --open
  expect_hasnt "gaps ("
}
acct_openlist_gaps_localized_section() {
  # THE DOMAIN DOOR (cold review, v0.5.6). The register section name is matched against the file's
  # BYTES, so reading it out of the utf8 schema map found no heading at all and the listing went
  # empty — the very "nothing is waiting over a blocking gap" this release repairs, re-entering
  # sideways. gaps.sections is documented as project-configurable and this is a Korean-first
  # product, so the non-ASCII spelling is a normal path, not a pathological one.
  sed -i 's/^gaps\.sections:.*/gaps.sections: 미해결|수용/' "$W/.weavedoc/schema"
  sed -i 's/^  completeness: off/  completeness: required/' "$W/.weavedoc/config.yaml"
  printf '# 미해결\n\n- [enumeration] 앨범 — 6곡 계획 vs 5곡 수록\n\n# 수용\n' > "$W/gaps.md"
  local vn ln
  vrun validate
  vn=$(printf '%s\n' "$OUT" | sed -n 's/.*holds \([0-9]*\) open gap(s).*/\1/p' | head -1)
  vrun status --open
  ln=$(printf '%s\n' "$OUT" | sed -n 's/^gaps (\([0-9]*\)):$/\1/p' | head -1)
  if [ -z "$vn" ] || [ -z "$ln" ]; then
    bad "one of the readers printed no count (validate='$vn' listing='$ln') — the comparison would be vacuous"
  elif [ "$vn" != "$ln" ]; then
    bad "localized section: validate counts $vn, status --open lists $ln — the schema-domain split"
  else ok; fi
}
acct_openlist_paths_survive_encoding() {
  # A path is TEXT and an entry is BYTES; encoding the two together truncates every code point
  # above 255, and a redirected documents/ came out as bytes that were no longer a path.
  # The label is only printed for a file that HAS an item, so the violation goes in before the
  # move (review4 writes to documents/, which is about to become 산출물/).
  REV '- [contradiction] §2 — 경로 라벨 확인'
  sed -i 's|^  documents: documents|  documents: 산출물|' "$W/.weavedoc/config.yaml"
  mv "$W/documents" "$W/산출물"
  printf -- '\n- [open] [user-only] 경로 인코딩 확인\n' >> "$W/truths/verify.md"
  vrun status --open
  expect_has "산출물/d1/review.md: - [contradiction] §2 — 경로 라벨 확인"
  expect_has "truths/verify.md: - [open] [user-only] 경로 인코딩 확인"
}
acct_openlist_gaps_badline_warns() {
  # scanRegister stops at the first line the grammar cannot read, so everything after it is
  # missing from the listing. Silence would print a short list as if it were the whole one.
  # `-<TAB>[declared]` — the bullet marker is a hyphen followed by a TAB, so it is neither a
  # column-0 `- ` entry nor an indented continuation: the grammar cannot read it and stops there.
  printf '# Open\n\n- [declared] 첫 항목 — 실제 갭\n-\t[declared] 탭 불릿\n- [reference] 셋째 항목 — 안 보임\n\n# Accepted\n' > "$W/gaps.md"
  vrun status --open
  expect_has "the register grammar cannot read"
  expect_hasnt "셋째 항목"
}
acct_openlist_gaps_accepted_badline_warns() {
  # Accepted is the same fail-closed register. With completeness off validate is not the immediate
  # user surface, so status must not print "nothing is waiting" after truncating this half silently.
  printf '# Open\n\n# Accepted\n\nprose no register owns\n- [declared] hidden after prose\n' > "$W/gaps.md"
  vrun status --open
  expect_has "'# Accepted' holds a line the register grammar cannot read"
  expect_hasnt "nothing is waiting on you"
}
acct_openlist_question_pure_stub_silent() {
  # The other side of the question rule, and the line that had ZERO coverage: a bullet that is
  # placeholders THROUGHOUT is an untouched template and must stay silent — while a real question
  # that merely MENTIONS a `<…>` token must not (isNoise's known limit, which is why the register's
  # own stub test is used here instead).
  printf -- '# 질문\n\n- [<status>] <where> — <what>\n' > "$W/questions.md"
  vrun status --open
  expect_has "nothing is waiting on you"
  printf -- '# 질문\n\n- [<status>] d1 §2 — <미정> 값을 확정해 주세요\n' > "$W/questions.md"
  vrun status --open
  expect_hasnt "nothing is waiting on you"
  expect_has "값을 확정해 주세요"
}
# ---- the placeholder × continuation matrix (v0.5.10, external review P1) ----
# The two axes were each tested alone — placeholder+inline and tagged+continuation — and their
# COMBINATION vanished: a placeholder bullet was dropped before any hold state existed, so the
# continuation carrying the actual content had nothing to realize. gaps.md had the hold-and-realize
# machine all along (scanRegister's gnoise); the twin ledgers lacked it.

acct_openlist_q_stub_realized() {
  # questions.md: a pure template stub is HELD, and an indented line with real content REALIZES it
  # — same machine as gaps. Unrealized, it stays template noise (the case below pins that side).
  # Disable placeholder holding in questions-ledger → this goes red.
  printf -- '# 질문\n\n- [<status>]\n  실제 질문이 필요함\n' > "$W/questions.md"
  vrun status --open
  expect_has "실제 질문이 필요함"
  expect_hasnt "nothing is waiting on you"
}
acct_openlist_hq_stub_realized() {
  # Human queue: same shape, same machine. Revert the `held` hold in hqEntries → this goes red.
  printf -- '\n- [{state}] [{ownership}]\n  실제 결정이 필요함\n' >> "$W/truths/verify.md"
  vrun status --open
  expect_has "실제 결정이 필요함"
  expect_hasnt "nothing is waiting on you"
}
acct_openlist_hq_placeholder_inline() {
  # The v0.5.5 prefix rule was still alive in the untagged filter: a placeholder-opening bullet
  # with REAL content after its tags was dropped wholesale. The remainder decides (FORMATS) — this
  # is an entry with no valid state tag, and it surfaces as one.
  # Revert the stubLine branch in hqEntries to the bare /^- \[[<{]/ drop → this goes red.
  printf -- '\n- [{state}] [{ownership}] 실제 결정이 필요함\n' >> "$W/truths/verify.md"
  vrun status --open
  expect_has "human queue (0 open, 1 untagged):"
  expect_has "실제 결정이 필요함"
}
acct_openlist_placeholder_cont_stays_noise() {
  # A PLACEHOLDER CONTINUATION IS NOT CONTENT (external review, v0.5.11). Q/HQ realized a held stub
  # on ANY non-blank continuation, so the shipped template's own second line turned a template into
  # a reported waiting item — a false "someone is waiting on you", in both ledgers. gaps has always
  # asked the right question (strip the template tokens; is anything left?); the twins now ask it
  # too. Revert `hasContent(cont)` in the realization branches → this goes red.
  printf -- '# 질문\n\n- [<status>]\n  <where> — <what>\n' > "$W/questions.md"
  printf -- '\n- [{state}] [{ownership}]\n  <where> — <what>\n' >> "$W/truths/verify.md"
  vrun status --open
  expect_has "nothing is waiting on you"
}
acct_openlist_placeholder_cont_then_real() {
  # …and the hold SURVIVES a placeholder-only continuation: a real one below still realizes it,
  # exactly as gaps behaves (the realizing line is the one that carries the content).
  # AN OVER-BLOCKING GUARD — it passes before AND after (before: realized by the placeholder line,
  # then the real line folds on; after: held past the placeholder, realized by the real line), so
  # there is no red-first for it. It exists so the fix above cannot be "achieved" by making a held
  # stub unrealizable.
  printf -- '# 질문\n\n- [<status>]\n  <where> — <what>\n  지체상금 상한 값이 필요합니다\n' > "$W/questions.md"
  vrun status --open
  expect_has "지체상금 상한 값이 필요합니다"
  expect_hasnt "nothing is waiting on you"
}
acct_status_hq_tag_separator_is_one_class() {
  # ONE SPELLING OF "the whitespace between an entry's two tags" (external review, v0.5.11). It had
  # three: validate stripped [ \t\n\v\f\r], the buckets took [ \t\v\f], HQ_TAG (which decides
  # folding) took [ \t] only. Consequences measured, both directions: a \v-separated entry folded
  # nothing, so `status --open` printed the tag line and DROPPED the decision body; and a mid-line
  # \r entry was counted "missing an ownership tag (validate rejects these)" while validate passed
  # it — the false-claim class again. Revert TAG_SEP in HQ_TAG or the buckets → this goes red.
  printf -- '\n- [open]\v[user-only]\n  세로탭 뒤 본문\n- [open]\r[recommended] 캐리지리턴 항목\n' >> "$W/truths/verify.md"
  vrun validate; expect_pass
  vrun status
  expect_has "you decide 1 · recommendation ready 1"
  expect_hasnt "missing an ownership tag"
  vrun status --open
  expect_has "세로탭 뒤 본문"
}
acct_openlist_hq_orphan_placeholder_surfaces() {
  # DETAIL NEEDS A PARENT (external review, v0.5.16). v0.5.15 made every space/tab-indented
  # placeholder detail, so one with NOTHING above it disappeared — "nothing is waiting on you" with
  # validate green beside it, because validate skips a placeholder state too. Nobody named it.
  # Revert the `|| !parent` arm → this goes red.
  printf -- '\n  - [{state}] [{ownership}] REAL-DECISION\n' >> "$W/truths/verify.md"
  vrun status --open
  expect_has "REAL-DECISION"
  expect_hasnt "nothing is waiting on you"
}
acct_openlist_hq_every_orphan_surfaces() {
  # ONE ORPHAN IS NOT THE RULE (cold review, v0.5.16). The first spelling set `parent` when it
  # surfaced an orphan, so sibling orphans became detail-of-a-placeholder: three in a row listed
  # ONE — the same silent drop the rule exists to stop, invisible to the single-orphan case above.
  # A surfaced placeholder is not a parent; only a real entry can have detail.
  # Revert the removal of `parent = true` in the placeholder branch → this goes red.
  printf -- '\n  - [{state}] [{ownership}] DEC-ONE\n  - [{state}] [{ownership}] DEC-TWO\n  - [{state}] [{ownership}] DEC-THREE\n' >> "$W/truths/verify.md"
  vrun status; expect_has "3 entry(s) with no"
  vrun status --open
  expect_has "DEC-ONE"; expect_has "DEC-TWO"; expect_has "DEC-THREE"
}
acct_openlist_hq_ruled_entry_is_a_parent() {
  # `- [ruled]` is a real entry, so its nested placeholder is DETAIL. v0.5.16's first spelling let
  # the column-0 reset erase the flag a separate line had just set, and the sub-bullet surfaced as
  # a waiting item — contradicting FORMATS and this file's own comment. One place decides now.
  # Revert `parent = /^- \[ruled\]/.test(l)` to a flat `parent = false` → this goes red.
  printf -- '\n- [ruled] [user-only] RULED-DECISION\n  - [{state}] [{ownership}] RULED-DETAIL\n' >> "$W/truths/verify.md"
  vrun status; expect_has "human queue: 0"
  vrun status --open; expect_hasnt "RULED-DETAIL"
}
acct_openlist_hq_nested_open_is_detail() {
  # THE LEAD RULE IS FOR EVERY BULLET, NOT ONLY PLACEHOLDERS (external review, v0.5.18). v0.5.17
  # taught the placeholder branch that a strictly deeper bullet is DETAIL, and left `- [open]` in
  # front of it, so a nested open bullet stayed an entry: `status` counted two waiting decisions
  # where FORMATS names one, and `validate` failed the mine with HQ-UNTAGGED over a line that is
  # not an entry — rc 1 on a legal file. Both surfaces read one walk now.
  # Move the HQ_OPEN test back in front of the lead comparison → this goes red.
  printf -- '
- [open] [user-only] PARENT
  - [open] CHILD-DETAIL
' >> "$W/truths/verify.md"
  vrun validate; expect_pass
  vrun status
  expect_has "you decide 1"
  expect_hasnt "missing an ownership tag"
  vrun status --open
  expect_has "human queue (1):"
}
acct_openlist_hq_nested_open_tagged_is_still_detail() {
  # …and adding the ownership tag validate used to demand does not turn detail into a decision.
  # That was the other half of the trap: the only way to make v0.5.17's validate pass was to tag
  # the sub-bullet, and then `status --open` reported a waiting decision that does not exist.
  printf -- '
- [open] [user-only] PARENT-B
  - [open] [recommended] CHILD-WITH-OWNERSHIP
' >> "$W/truths/verify.md"
  vrun validate; expect_pass
  vrun status
  expect_has "you decide 1 · recommendation ready 0"
  vrun status --open
  expect_has "human queue (1):"
  expect_hasnt "CHILD-WITH-OWNERSHIP"
}
acct_openlist_hq_indented_ruled_is_a_parent() {
  # An indented `[ruled]` is an ENTRY at its own lead, so its sub-bullet is detail. Before v0.5.18
  # only a COLUMN-0 `- [ruled]` set the parent, so the same two lines one indent over reported the
  # sub-bullet as a waiting item — the over-count twin of the drop above.
  # Revert the ruled arm to a column-0 test → this goes red.
  printf -- '
  - [ruled] [user-only] RULED-INDENTED
    - [{state}] [{ownership}] RULED-SUB
' >> "$W/truths/verify.md"
  vrun status; expect_has "human queue: 0"
  vrun status --open; expect_hasnt "RULED-SUB"
}
acct_openlist_hq_untagged_peer_surfaces() {
  # A PLAIN BULLET AT THE PARENT'S OWN LEAD IS A PEER, not detail (external review, v0.5.18). The
  # untagged rule demanded column 0, so an indented pair — the shape a nested Human queue actually
  # takes — kept the first and silently dropped the second. Only STRICTLY deeper is detail.
  printf -- '
  - 태그 없는 항목 하나
  - 태그 없는 항목 둘
    - 이건 진짜 하위
' >> "$W/truths/verify.md"
  vrun status; expect_has "2 entry(s) with no"
  vrun status --open
  expect_has "태그 없는 항목 하나"; expect_has "태그 없는 항목 둘"
  expect_hasnt "이건 진짜 하위"
}
acct_openlist_hq_fenced_example_is_not_an_entry() {
  # A FENCED EXAMPLE IS NOT A DECISION (external review, v0.5.21). This ledger was read through the
  # comment stripper and nothing else, so the way documentation shows an entry — inside a code
  # fence — was a real waiting decision to `status` and a real entry to the gate. gaps.md has read
  # through `defence` since v0.5.4; the twin ledger never got it.
  # Reintroduce sequential comment deletion before fence scanning -> this goes red.
  printf -- '\n\n```md\n- [open] [user-only] FENCED-EXAMPLE\n```\n' >> "$W/truths/verify.md"
  vrun status; expect_has "human queue: 0"
  vrun status --open; expect_has "nothing is waiting on you"
  vrun validate; expect_pass
}
block_hq_fenced_example_does_not_block() {
  # THE SAME BLINDNESS IN THE OTHER DIRECTION, and this half FAILED A LEGAL MINE: a fenced example
  # written without an ownership tag — which is what an example of the untagged shape looks like —
  # was rejected as HQ-UNTAGGED, rc 1. A pass_ case would be the right prefix, but the shape it
  # guards is a block, so it asserts the absence of that block by name.
  printf -- '\n\n```md\n- [open] FENCED-NO-OWNERSHIP\n```\n' >> "$W/truths/verify.md"
  vrun validate
  expect_pass
  expect_hasnt "HQ-UNTAGGED"
}
acct_openlist_hq_comment_fence_precedence() {
  # A comment marker inside a fence is literal; a fence marker inside a comment is literal. Both
  # status and validate consume the one scanner result rather than erasing the constructs in order.
  cat >> "$W/truths/verify.md" <<'EOF'

```md
<!-- COMMENT-MARKER-IS-LITERAL
- [open] [user-only] HIDDEN-IN-FENCE
```
<!--
```md
- [open] [user-only] HIDDEN-IN-COMMENT
-->
- [open] [user-only] REAL-AFTER-CONTEXTS
EOF
  vrun validate; expect_pass
  expect_hasnt "HQ-UNTERMINATED"
  vrun status --open
  expect_has "human queue (1):"
  expect_has "REAL-AFTER-CONTEXTS"
  expect_hasnt "HIDDEN-IN-FENCE"
  expect_hasnt "HIDDEN-IN-COMMENT"
  expect_hasnt "unterminated"
}
acct_openlist_hq_comment_mask_preserves_columns() {
  # Deleting this inline comment manufactures a column-zero fence opener. Column-preserving masks
  # retain the source position, and provenance prevents a mask itself from supplying grammar space.
  cat >> "$W/truths/verify.md" <<'EOF'

<!--x-->```md
- [open] [user-only] REAL-AFTER-INLINE-COMMENT
EOF
  vrun validate; expect_pass
  expect_hasnt "HQ-UNTERMINATED-FENCE"
  vrun status --open
  expect_has "human queue (1):"
  expect_has "REAL-AFTER-INLINE-COMMENT"
  expect_hasnt "unterminated code fence"
}
block_hq_unterminated_frontmatter() {
  # Frontmatter is an explicit capability of verify/review, not a heuristic enabled for every
  # ledger. When enabled, an unclosed block cannot hide the queue without a named gate and warning.
  sed -i '5d' "$W/truths/verify.md"
  vrun validate
  expect_block "HQ-UNTERMINATED-FRONTMATTER"
  vrun status --open
  expect_has "unterminated frontmatter"
}
block_verify_fenced_section_is_not_a_section() {
  # …AND A FENCED HEADING IS NOT A SECTION. Replacing the real `## Human queue` with a fenced copy
  # left the mine with no queue at all and validate green (measured) — the required-section check
  # read the file with the comment stripper only, so the fence satisfied it. It reads through the
  # same scanned document the walk uses now: one file, one idea of what is in it.
  # Reintroduce a comment-only required-section reader -> this goes red.
  { printf '```md\n'; cat "$W/truths/verify.md"; } > "$W/v.tmp"
  printf '\n```\n' >> "$W/v.tmp"
  # The real section is now INSIDE the fence, so the file has none the reader can see.
  mv "$W/v.tmp" "$W/truths/verify.md"
  vrun validate
  expect_block "required section 'Human queue' missing"
}
block_hq_unterminated_fence() {
  # THE COST OF READING THROUGH FENCES, named rather than absorbed: an opener nobody closed blanks
  # everything after it, so entries below vanish from the counter, the listing and the gate at once
  # — the same shape gaps.md and an unterminated `<!--` already block on.
  printf -- '\n\n```md\n- [open] [user-only] BEHIND-AN-OPEN-FENCE\n' >> "$W/truths/verify.md"
  vrun validate
  expect_block "unterminated code fence"
  vrun status --open
  expect_has "unterminated code fence"
}
acct_openlist_hq_loose_list_stub_realizes() {
  # A BLANK LINE IS NOT A TERMINATOR (external review, v0.5.21). A LOOSE LIST — the item, a blank
  # line, then its indented content — is ordinary markdown and ordinary typing, and the walk threw
  # away the held stub when it saw the blank: the decision VANISHED from every surface at once
  # (`human queue: 0`, "nothing is waiting on you", validate rc 0, measured).
  # Restore the reset on a blank line -> this goes red.
  printf -- '\n- [{state}] [{ownership}]\n\n  LOOSE-LIST-DECISION\n' >> "$W/truths/verify.md"
  vrun status; expect_has "1 entry(s) with no"
  vrun status --open
  expect_has "human queue (0 open, 1 untagged):"
  expect_has "LOOSE-LIST-DECISION"
}
acct_openlist_hq_mixed_lead_continuation_surfaces() {
  # Literal-prefix structure cannot prove that a TAB continuation belongs under a two-space item.
  # The typed model records that ambiguity, but the safe display direction is to retain the text:
  # an agent decision must not disappear merely because its whitespace styles differ.
  printf -- '\n  - [{state}] [{ownership}]\n\tMIXED-LEAD-DECISION\n' >> "$W/truths/verify.md"
  vrun status --open
  expect_has "MIXED-LEAD-DECISION"
  expect_has "normalize the indentation"
  expect_hasnt "nothing is waiting on you"
}
acct_openlist_hq_blank_then_nested_is_detail() {
  # …and the mirror defect, which BLOCKED instead of dropping: the blank line made the nested
  # `- [open]` a peer, so status counted two waiting decisions and validate demanded an ownership
  # tag on a line that is detail — rc 1 on a legal file. Structure is the lead, not the blank line.
  printf -- '\n- [open] [user-only] PARENT\n\n  - [open] NESTED-AFTER-BLANK\n' >> "$W/truths/verify.md"
  vrun validate; expect_pass
  vrun status
  expect_has "you decide 1"
  expect_hasnt "missing an ownership tag"
}
acct_openlist_hq_realized_stub_siblings() {
  # A BOOLEAN CANNOT SAY *WHAT* THE DETAIL IS DETAIL OF (external review, v0.5.17). v0.5.16 kept
  # `parent` as a flag, so the moment a continuation REALIZED a held stub the flag went up and the
  # next sibling stub — same indentation, a peer, not detail — was folded into the entry above it:
  # two waiting decisions reported as one, measured. `parentLead` holds the parent's indentation
  # instead, and a line is detail only when it is nested STRICTLY DEEPER.
  # Revert parentLead to a boolean (or set it from anything but the held stub's own lead) → red.
  printf -- '\n  - [{state}] [{ownership}]\n    BODY-ONE\n  - [{state}] [{ownership}]\n    BODY-TWO\n' >> "$W/truths/verify.md"
  vrun status; expect_has "2 entry(s) with no"
  vrun status --open
  expect_has "human queue (0 open, 2 untagged):"
  expect_has "BODY-ONE"; expect_has "BODY-TWO"
}
acct_openlist_hq_orphan_beside_open_entry() {
  # THE SAME BOOLEAN, WORSE (external review, v0.5.17): a placeholder peer of a real `[open]` entry
  # did not merge — it VANISHED. `- [open] …` set the flag, the peer became "detail" of an entry
  # that already had content, and detail of a contentful entry is dropped, so status reported one
  # waiting item and `--open` never named the second. Peers share a lead; only deeper is detail.
  printf -- '\n  - [open] [user-only] OPEN-FIRST\n  - [{state}] [{ownership}] ORPHAN-SIBLING\n' >> "$W/truths/verify.md"
  vrun status
  expect_has "you decide 1"
  expect_has "1 entry(s) with no"
  vrun status --open
  expect_has "OPEN-FIRST"; expect_has "ORPHAN-SIBLING"
}
acct_openlist_hq_deeper_placeholder_under_orphan() {
  # THE OTHER DIRECTION OF THE SAME RULE (external review, v0.5.17). With a boolean that a surfaced
  # placeholder deliberately did NOT set, a sub-bullet UNDER an orphan had no parent either, so it
  # was counted as a second waiting item — the over-count twin of the two drops above, and against
  # FORMATS' "an indented line under an entry belongs to it". A surfaced placeholder IS a parent;
  # what stops it from swallowing its peers is the lead comparison, not the absence of a parent.
  printf -- '\n  - [{state}] [{ownership}] ORPHAN\n    - [{state}] [{ownership}] DEEPER-DETAIL\n' >> "$W/truths/verify.md"
  vrun status; expect_has "1 entry(s) with no"
  vrun status --open
  expect_has "ORPHAN"
  expect_hasnt "DEEPER-DETAIL"
}
acct_openlist_hq_detail_under_realized_stub() {
  # A REALIZED STUB'S ENTRY LIVES WHERE THE STUB WAS, not where the continuation that realized it
  # was (v0.5.17). Taking the parent's indentation from the continuation line puts it one level too
  # deep, and then a genuine sub-bullet — at the continuation's own indentation — stops being
  # "deeper" and surfaces as a SECOND waiting item. The peer case above cannot see this: peers are
  # shallower than the continuation either way. Change `parentLead = held.lead` to the continuation
  # line's lead → this goes red (one entry becomes two).
  # What is asserted is the COUNT, not the absence of the text: the realized entry's own line is
  # tags-only, so every continuation under it folds into the display — the documented behaviour
  # for an empty-remainder entry (acct_openlist_gaps_continuation_multi pins the same fold).
  # Being part of one entry's text and being a second entry are different things; only the
  # second is a defect, and the count is what says which happened.
  printf -- '\n  - [{state}] [{ownership}]\n    REALIZED-BODY\n    - [{state}] [{ownership}] DEEP-DETAIL\n' >> "$W/truths/verify.md"
  vrun status; expect_has "1 entry(s) with no"
  vrun status --open
  expect_has "human queue (0 open, 1 untagged):"
  expect_has "REALIZED-BODY"
}
acct_openlist_hq_section_boundary_resets() {
  # STATE MUST NOT CROSS A SECTION BOUNDARY (external review, v0.5.17). A Human queue is an
  # append-per-round log, so one file legitimately carries several `## Human queue` sections; the
  # reader concatenated their bodies with nothing between them, so when a section ENDED with an
  # entry and the next BEGAN with an indented one, the second round's first item became detail of
  # the first round's last — and disappeared. Each section is walked with fresh state now.
  # Revert hqEntries to one walk over the joined body → this goes red.
  printf -- '\n## Human queue\n- [open] [user-only] ROUND-ONE\n## Human queue\n  - [{state}] [{ownership}] ROUND-TWO\n' >> "$W/truths/verify.md"
  vrun status --open
  expect_has "ROUND-ONE"; expect_has "ROUND-TWO"
}
acct_openlist_hq_ctrl_placeholder_under_parent_is_entry() {
  # THE CONTRACT THE MATRIX BELOW CLAIMED TO COVER AND DID NOT (external review, v0.5.17). Its
  # comment said "EVERY lead… (or FF/CR)", but it only ever pinned space and tab — and for the
  # control leads the answer is the OPPOSITE one: HQ_STUB_ENTRY makes a control-led placeholder an
  # entry wherever it sits, parent or no parent, because a control character is not indentation the
  # gate recognises. This case PASSES BEFORE AND AFTER the v0.5.17 fix — it is an over-blocking
  # guard, not a red-first repro: the contract was simply never pinned, so the lead comparison
  # could have been widened to swallow control leads with nothing going red. Dropping
  # HQ_STUB_ENTRY's arm from the condition does make it red (checked by mutation).
  printf -- '\n- [open] [user-only] CTRL-PARENT\n\f- [{state}] [{ownership}] FF-ENTRY\n' >> "$W/truths/verify.md"
  vrun status
  expect_has "you decide 1"
  expect_has "1 entry(s) with no"
  vrun status --open; expect_has "FF-ENTRY"
}
acct_openlist_hq_nested_placeholder_whitespace_matrix() {
  # The detail side for the two leads that ARE indentation — space and tab. The control leads are
  # not on this axis at all: HQ_STUB_ENTRY makes them entries under a parent too, which is pinned
  # by acct_openlist_hq_ctrl_placeholder_under_parent_is_entry (this comment claimed to cover
  # "EVERY lead … or FF/CR" through v0.5.16 and never did — external review, v0.5.17).
  printf -- '\n- [open] [user-only] PARENT-A\n  - [{state}] [{ownership}] SPACE-DETAIL\n' >> "$W/truths/verify.md"
  printf -- '\n- [open] [user-only] PARENT-B\n\t- [{state}] [{ownership}] TAB-DETAIL\n' >> "$W/truths/verify.md"
  vrun status
  expect_has "you decide 2"
  expect_hasnt "with no '[open]'/'[ruled]' state tag"
  vrun status --open
  expect_has "human queue (2):"
  expect_hasnt "SPACE-DETAIL"
  expect_hasnt "TAB-DETAIL"
}
acct_openlist_hq_nested_placeholder_is_detail() {
  # THE v0.5.13 FIX OVERSHOT (external review, v0.5.14). Widening the stub branch to HQ_STUB_OPENER
  # let it swallow ORDINARY space/tab indentation too, so a nested placeholder sub-bullet under a
  # real entry became a second waiting item — v0.5.12 reported one entry here, v0.5.13 reported two.
  # Space/tab indentation is a continuation (detail); only a CONTROL-character lead is an entry the
  # gate accepts, so the two are separated now.
  # Revert to the un-split HQ_STUB_OPENER branch → this goes red.
  printf -- '\n- [open] [user-only] PARENT\n  - [{state}] [{ownership}] NESTED-DETAIL\n' >> "$W/truths/verify.md"
  vrun status
  expect_has "you decide 1"
  expect_hasnt "with no '[open]'/'[ruled]' state tag"
  vrun status --open
  expect_has "human queue (1):"
  expect_hasnt "NESTED-DETAIL"
}
acct_openlist_hq_leading_ctrl_stub_realizes() {
  # THE WORSE HALF of the same shape (cold review, v0.5.13): a control-indented PLACEHOLDER stub
  # was excluded from the `[open]` branch by HQ_STUB_OPENER and then not matched by the stub branch
  # (column-0 anchored), so nobody handled it — the item disappeared and the run said "nothing is
  # waiting on you". Its column-0 twin surfaces as untagged with the body.
  # Revert the stub branch to /^- \[[<{]/ → this goes red.
  printf -- '\v- [{state}] [{ownership}]\n  진짜 결정 내용\n' >> "$W/truths/verify.md"
  vrun status --open
  expect_has "진짜 결정 내용"
  expect_hasnt "nothing is waiting on you"
}
acct_openlist_hq_leading_ctrl_keeps_body() {
  # THE SAME CLASS, ONE LAYER DEEPER (external review, v0.5.13). v0.5.11 widened the ENTRY tests to
  # TAG_SEP but left the fold test's own leading strip at [ \t], so a control-indented entry was
  # counted (status), accepted (validate) — and then listed WITHOUT its body, because
  # `emptyRemainder` did not recognise the line as "tags only" and nothing folded.
  # Revert the TAG_SEP leading strip in gaps-register.mjs → this goes red.
  printf -- '\v- [open] [user-only]\n  실제 결정 본문\n' >> "$W/truths/verify.md"
  vrun status; expect_has "you decide 1"
  vrun validate; expect_pass
  vrun status --open; expect_has "- [open] [user-only] 실제 결정 본문"
}
acct_status_hq_leading_whitespace_is_one_class_too() {
  # THE SAME UNIFICATION, ONE POSITION EARLIER (cold review, v0.5.11). TAG_SEP closed the class
  # BETWEEN the two tags while the whitespace BEFORE the bullet still had two spellings: validate
  # strips [ \t\n\v\f\r] before testing, status tolerated [ \t] — so a \v-indented `- [open]` was
  # an entry to the gate and invisible to both status surfaces (rc 1 with "nothing is waiting on
  # you" beside it). Pre-existing, and exactly the disagreement this release says it closed.
  # Revert the leading TAG_SEP in the open/placeholder tests → this goes red.
  printf -- '\v- [open] 세로탭으로 들여쓴 항목\n' >> "$W/truths/verify.md"
  vrun validate; expect_block "has no valid ownership tag"
  vrun status; expect_has "missing an ownership tag"
  vrun status --open; expect_has "세로탭으로 들여쓴 항목"
}
acct_status_hq_ownership_is_judged_on_the_entry_line() {
  # THE FOLD IS DISPLAY, THE CONTRACT IS THE ENTRY LINE (cold review, v0.5.10 — critical). Folding
  # a continuation into an empty-remainder `- [open]` made the bucket regexes see
  # `- [open] [machine] …` and classify the entry as OWNED, while validate judges the physical
  # line and rejects it — one entry, "machine can just do 1" on one surface and HQ-UNTAGGED on the
  # other. Ownership lives on the entry line (FORMATS: two fixed tags, then prose; the defender
  # writes both tags as it writes the entry), so classification runs on the RAW line and the two
  # surfaces agree: this entry is missing its tag, and validate really does reject it.
  # Revert the raw-line classification (buckets over e.raw) → this goes red.
  printf -- '\n- [open]\n  [machine] 소유권이 다음 줄에 온 항목\n' >> "$W/truths/verify.md"
  vrun status
  expect_has "1 missing an ownership tag"
  expect_hasnt "machine can just do 1"
  vrun validate; expect_block "has no valid ownership tag"
}
acct_status_hq_vtab_separator_agrees_with_validate() {
  # The separator latitude between the two tags must be ONE class on both surfaces: validate strips
  # [ \t\n\v\f\r] between [open] and the ownership bracket, the buckets tolerated only [ \t] — so a
  # \v-separated entry landed in "missing an ownership tag (validate rejects these)" while validate
  # passed it (the same false-claim class P1-2 closed, one whitespace over). Pathological input,
  # fixed because the alignment is three characters.
  # Revert the [ \t\v\f]* separator in the bucket regexes → this goes red.
  printf -- '\n- [open]\v[user-only] 수직탭 구분 항목\n' >> "$W/truths/verify.md"
  vrun validate; expect_pass
  vrun status
  expect_has "you decide 1"
  expect_hasnt "missing an ownership tag"
}
acct_gaps_localized_badline_bytes() {
  # The new badline warning interpolated the latin1-domain section name into a UTF-8 template —
  # the two-encoders trap this codebase documents, sprung again in the line that was added to fix
  # a different silence (cold review, v0.5.10). The warning must carry the section name's own
  # bytes. Revert the byte-domain emit in cmd-gaps → this goes red (mojibake).
  sed -i 's/^gaps\.sections:.*/gaps.sections: 미해결|수용/' "$W/.weavedoc/schema"
  printf '# 미해결\n\n# 수용\n\n- [symmetry] 첫 항목 — 의도적 공백 — scope: [x] — recheck: y — as-of: t001\n등록부가 읽을 수 없는 산문\n' > "$W/gaps.md"
  vrun gaps
  expect_has "'# 수용'"
  expect_has "records 1 already accepted"
}
acct_openlist_hq_unclosed_placeholder_surfaces() {
  # PINNING a surfacing the fix introduced (cold review #4): an unclosed placeholder bracket is not
  # a stub (stubLine requires the bracket to close) and not droppable prose — it lists as untagged,
  # where v0.5.9 silently dropped it. Surface-don't-drop is the direction; this case makes it a
  # decision instead of an accident.
  printf -- '\n- [{state\n' >> "$W/truths/verify.md"
  vrun status --open
  expect_has "(untagged): - [{state"
  expect_hasnt "nothing is waiting on you"
}
acct_openlist_hq_full_template_silent() {
  # AN OVER-BLOCKING GUARD (passes before and after — no red-first): the SHIPPED template line is
  # placeholders throughout and must stay silent, or a freshly-initialised mine reports a waiting
  # item that does not exist. This is the boundary the realized-stub cases sit on the other side of.
  # …and a template STATE over a real ownership tag with nothing after it (cold review #5): the
  # tags are all the line carries, so it is held — and unrealized, it stays silent too.
  printf -- '\n- [<state>] [<ownership>] <where> — <what the machine wanted to dismiss + its reason> — <what breaks if the dismissal is wrong>\n- [{state}] [user-only]\n' >> "$W/truths/verify.md"
  vrun status --open
  expect_has "nothing is waiting on you"
}
block_hq_open_continuation_needs_ownership() {
  # THE OWNERSHIP CONTRACT OVER LOGICAL ENTRIES (external review P1-2): `- [open]` with its content
  # on a continuation line is a legal entry, and validate skipped it — `what === '' → continue`, an
  # uncommented guard — while plain `status` counted it as "missing an ownership tag (validate
  # rejects these)". One entry, one command saying validate rejects it, validate passing it.
  # Revert the `what === ''` skip removal in checkHqTags → this goes red.
  printf -- '\n- [open]\n  실제 결정이 필요함\n' >> "$W/truths/verify.md"
  vrun validate; expect_block "has no valid ownership tag"
}
acct_gaps_accepted_badline_named() {
  # The accepted tally stops at a line the register grammar cannot read, so entries after it are
  # missing from the count — and the CLI said nothing (status --open has warned since v0.5.7; this
  # command got the shared scanner in v0.5.8 and dropped its badline on the floor).
  # Revert the `reg.badline` warning in cmd-gaps.mjs → this goes red.
  printf '# Open\n\n# Accepted\n\n- [symmetry] 첫 항목 — 의도적 공백 — scope: [x] — recheck: y — as-of: t001\n등록부가 읽을 수 없는 산문\n- [declared] 안 세어지는 항목 — 이유 — scope: [y] — recheck: z — as-of: t002\n' > "$W/gaps.md"
  vrun gaps
  expect_pass
  expect_has "cannot read"
  expect_has "records 1 already accepted"
}
block_gaps_accepted_blank_orphan_is_not_continuation() {
  # Human queues explicitly allow loose-list continuation across a blank line. The completeness
  # register does not: prose after a blank has no attributable acceptance and must fail closed,
  # never inherit the preceding decision merely because both ledgers share structural primitives.
  req_completeness
  printf '# Open\n\n# Accepted\n\n- [symmetry] DECISION\n\n  ORPHAN-ACCEPTANCE-PROSE\n' > "$W/gaps.md"
  vrun validate
  expect_block "ORPHAN-ACCEPTANCE-PROSE"
}
block_gaps_directory_is_unknown_not_absent() {
  rm -f "$W/gaps.md"
  mkdir "$W/gaps.md"
  req_completeness
  vrun validate
  expect_block "[COMP-MALFORMED]"
  expect_hasnt "[COMP-NO-REGISTER]"
  vrun status --open
  expect_has "gaps.md exists but cannot be read"
  expect_hasnt "nothing is waiting on you"
  vrun gaps
  expect_has "accepted tally is unknown"
  expect_hasnt "gaps.md records 0 already accepted"
}
acct_openlist_question_stateless() {
  # A question bullet with no state tag at all: validate never reads questions.md, so nothing else
  # catches it, and dropping it silently prints "nothing is waiting" over a visibly open question.
  printf -- '# 질문\n\n- 상태 태그가 없는 질문 — 지체상금 상한\n' > "$W/questions.md"
  vrun status --open
  expect_has "상태 태그가 없는 질문"
  expect_hasnt "nothing is waiting on you"
}
acct_openlist_question_filled_placeholder() {
  # The question-side twin of the gaps P1: a template state slot over a written-out body.
  printf -- '# 질문\n\n- [<status>] d1 §2 — 지체상금 상한 — 작성에 필요\n' > "$W/questions.md"
  vrun status --open
  expect_has "지체상금 상한"
  expect_hasnt "nothing is waiting on you"
}
block_schema_roster_questions_enum() {
  # `questions.enum.status` decides which question states `status --open` treats as waiting, but it
  # was not in SCH_KEYS — so deleting it passed validate while switching the classification over to
  # a hardcoded fallback. The roster is the list of keys whose ABSENCE must be reported.
  sed -i '/^questions\.enum\.status:/d' "$W/.weavedoc/schema"
  vrun validate; expect_block "cannot read 'questions.enum.status'"
}
acct_openlist_fidelity_violation() {
  # Violations are the gate's entries — listed through the gate's own readers (fidBody + isNoise),
  # never a second parser, so the listing and the gate cannot answer differently about one file.
  REV '- [contradiction] §2 — t001과 t002가 충돌'
  vrun status --open
  expect_has "fidelity violations (1):"
  expect_has "documents/d1/review.md: - [contradiction] §2 — t001과 t002가 충돌"
}
acct_openlist_nothing_waiting() {
  # The pristine mine has empty queues and no questions.md/gaps.md — the listing must say so
  # PLAINLY rather than print nothing (emptiness that looks like success is the vacuity class).
  vrun status --open
  expect_pass
  expect_has "nothing is waiting on you"
}
block_status_open_typo() {
  # WD-CLI-001: an unknown flag is a typo'd intention, refused — not ignored.
  vrun status --opne
  expect_block "usage: weavedoc status [--open]"
}
acct_openlist_comment_hides_entry() {
  # The same nocomment the counter uses: an entry archived inside <!-- --> is history, not waiting.
  printf -- '\n<!--\n- [open] [user-only] 보관된 항목\n-->\n' >> "$W/truths/verify.md"
  vrun status --open
  expect_hasnt "보관된 항목"
  expect_has "nothing is waiting on you"
}
acct_openlist_second_hq_section() {
  # A Human queue is append-per-round: entries under a SECOND `## Human queue` are as open as the
  # first's — reading only the first once hid every later round from the counter (R6-C2). The
  # decoy under `## 다른 절` is what separates "reads both sections" from "never closes a section":
  # a run-to-EOF reader would count 3 and print the decoy.
  printf -- '\n- [open] [user-only] 라운드 1 항목\n\n## 다른 절\n\n- [open] [user-only] 미끼 항목\n\n## Human queue\n\n- [open] [recommended] 라운드 2 항목\n' >> "$W/truths/verify.md"
  vrun status --open
  expect_has "human queue (2):"
  expect_has "라운드 1 항목"
  expect_has "라운드 2 항목"
  expect_hasnt "미끼 항목"
}
acct_openlist_subbullets_stay_detail() {
  # One line per item: an entry's UNTAGGED indented sub-bullets are its detail, not entries of
  # their own (R5-N3's counter rule, applied to the listing). The second half of this comment used
  # to read "an indented `- [open]` sub-bullet DOES list — counter parity"; that was true of the
  # code and false of the contract, and acct_openlist_hq_nested_open_is_detail now pins the other
  # answer (external review, v0.5.18). Nothing here ever tested it — the claim lived only in prose.
  printf -- '\n- [open] [user-only] 병기 허용 여부\n  - 근거: 두 자료가 다른 값\n' >> "$W/truths/verify.md"
  vrun status --open
  expect_has "human queue (1):"
  expect_hasnt "근거: 두 자료가"
}
acct_openlist_question_unknown_state() {
  # questions.md is the one ledger no validator reads, so a state outside the enum has no check to
  # fail — a listing that silently dropped it would print the nothing-waiting line over a visibly
  # open question. The untagged-entry rule, applied to this ledger.
  printf -- '# 질문\n\n- [Open] 대문자 상태 — 지체상금 상한\n' > "$W/questions.md"
  vrun status --open
  expect_has "questions (0 waiting, 1 unrecognized):"
  expect_has "(unrecognized state — the enum is open|proposed|answered): - [Open] 대문자 상태"
  expect_hasnt "nothing is waiting on you"
}
acct_openlist_question_blank_continuation_materializes() {
  # A physical blank does not invent a new parent, but neither does it erase the only structural
  # parent of a later indented continuation. The placeholder is held until the real line arrives.
  printf -- '- [{state}]\n\n  REAL-QUESTION-AFTER-BLANK\n' > "$W/questions.md"
  vrun status --open
  expect_has "questions (0 waiting, 1 unrecognized):"
  expect_has "REAL-QUESTION-AFTER-BLANK"
  expect_hasnt "nothing is waiting on you"
}
acct_openlist_question_misindented_entry_is_named() {
  # Column zero remains the admission rule. An attempted root below it is a typed orphan rather
  # than a valid waiting question or invisible prose, and status names the actual structural fault.
  printf -- '  - [open] MISINDENTED-QUESTION\n' > "$W/questions.md"
  vrun status --open
  expect_has "questions (0 waiting, 1 unrecognized):"
  expect_has "misindented entry (must start at column 0)"
  expect_has "MISINDENTED-QUESTION"
  expect_hasnt "nothing is waiting on you"
}
acct_openlist_unterminated_fence_warns() {
  # gaps.md's readers share ONE fence judgment (defence); a fence nobody closed makes the tail
  # invisible, and a listing that stays silent about that reads as "covered everything". The
  # hidden entry must not print — and the silence must be named, which also forbids the
  # nothing-waiting line (it would be a claim the reader cannot honestly make).
  cat > "$W/gaps.md" <<'EOF'
# Open

```
- [declared] 펜스 안 — 예시일 뿐
EOF
  vrun status --open
  expect_has "unterminated code fence"
  expect_hasnt "펜스 안"
  expect_hasnt "nothing is waiting on you"
}
acct_openlist_unterminated_comment_warns() {
  # The unterminated '<!--' blanks everything after it before any reader sees a line — same rule,
  # named the same way.
  printf -- '# 질문\n\n<!--\n- [open] 숨은 항목\n' > "$W/questions.md"
  vrun status --open
  expect_has "unterminated '<!--'"
  expect_hasnt "숨은 항목"
}

# ---- schema v3 flip contracts (slice 1, B1): the gate, the upgrade stub, the state files --------
block_gate_v2_mine_general_commands() {
  # A v2 mine gets ONE answer from every ordinary command — which migration path — and no verdict
  # about anything else: judging v2 bytes with v3 rules is the false green in miniature (a v2 card
  # satisfies every v3 required key while its whole state machinery stays invisible to v3 checks).
  sed -i 's/^version: 3$/version: 2/' "$W/project.md"
  sed -i 's/^version: 3/version: 2/' "$W/.weavedoc/config.yaml"
  vrun pull 위약
  expect_block "v3-only"
  vrun census
  expect_block "v2→v3 migrator"
  vrun validate
  expect_block "VER-V2-UPGRADE"
  expect_hasnt "examined:"
}
block_gate_v1_mine_names_the_bridge() {
  # A v1 user needs the PINNED bridge runtime, not this one's migrator — directions to the wrong
  # door are worse than a refusal, so the commit hash itself is the contract.
  sed -i 's/^version: 3$/version: 1/' "$W/project.md"
  sed -i 's/^version: 3/version: 1/' "$W/.weavedoc/config.yaml"
  vrun status
  expect_block "0257167"
  vrun validate
  expect_block "VER-V1-BRIDGE"
}
acct_upgrade_stub_uptodate() {
  vrun upgrade --check
  expect_pass
  expect_has "already schema v3"
}
block_upgrade_v2_without_git_refuses() {
  # (Until slice 2 this asserted the stub's "slice 2" refusal; the migrator is real now.) The
  # clean git worktree IS the backup, and $W is not a repository — apply must refuse rather than
  # migrate an unrecoverable mine. Direction matters: --check still reports (read-only).
  sed -i 's/^version: 3$/version: 2/' "$W/project.md"
  sed -i 's/^version: 3/version: 2/' "$W/.weavedoc/config.yaml"
  vrun upgrade --apply
  expect_block "not inside a git repository"
}
block_upgrade_stub_bad_flag() {
  # Restored from the retired v1-migrator suite: unknown-argument refusal is a living contract
  # (deleted together with that suite in this bundle, which was one case too many).
  vrun upgrade --frobnicate
  expect_block "unknown argument"
}
block_state_missing_is_not_empty() {
  # A conflicts store that cannot be read must never read as "no conflicts" — that silence would
  # unblock shipping over the exact thing the file exists to block.
  rm -f "$W/.weavedoc-state/conflicts.json"
  vrun validate
  expect_block "STATE-MISSING"
}
block_state_malformed_is_not_empty() {
  # The umbrella code is the surface; the model's own finer code rides in the message where the
  # repair needs it (and the diagnostic table stays a table of literals).
  printf 'not json' > "$W/.weavedoc-state/id-sequences.json"
  vrun validate
  expect_block "STATE-MALFORMED"
  expect_has "IDSEQ-JSON"
}
block_conflict_open_blocks_shipping() {
  # An undecided disagreement blocks shipping; resolution is DELETION of the entry, and the empty
  # store passes again — no archive section grows anywhere (§2.2: the two zeros differ — an open
  # targets=[] blocks, a user-ruled empty store passes).
  printf '{\n  "version": 1,\n  "open": [\n    {\n      "id": "c001",\n      "targets": ["t001"],\n      "candidates": [\n        {\n          "claim": "위약금은 20%%다",\n          "source": "m001"\n        }\n      ],\n      "created": "2026-08-13"\n    }\n  ]\n}\n' > "$W/.weavedoc-state/conflicts.json"
  vrun validate
  expect_block "CONFLICT-OPEN"
  vrun status --open
  expect_has "conflicts (1):"
  expect_has "c001"
  expect_has "위약금은 20%다"
  printf '{\n  "version": 1,\n  "open": []\n}\n' > "$W/.weavedoc-state/conflicts.json"
  vrun validate
  expect_pass
}
acct_status_open_malformed_store_is_unknown() {
  # The lane must not absorb a malformed store into "no conflicts" — UNKNOWN is the honest word,
  # and validate (not this listing) is where it hard-fails.
  printf '{"version":1,"open":{}}' > "$W/.weavedoc-state/conflicts.json"
  vrun status --open
  expect_has "open conflicts are UNKNOWN, not zero"
}
block_truth_v2_field_is_structural() {
  # The optional-key list is descriptive, so the four dead v2 fields need their own tripwire — a
  # card wearing `status:` again is discarded machinery growing back, not an ignorable extra.
  sed -i 's/^provenance: stated$/provenance: stated\nstatus: ok/' "$W/truths/t001.md"
  vrun validate
  expect_block "TRUTH-V2-FIELD"
}

# ---- schema v3 state-file write surfaces (slice 1, B2): alloc + conflict CLI, tripwires ---------
pass_alloc_grants_monotonic_ids() {
  # The allocator is the only minting path, and numbers move one way — a deleted card's number
  # never comes back, because an old citation would then name a different fact.
  vrun alloc truth
  expect_pass
  expect_has "t002"
  vrun alloc truth
  expect_has "t003"
  rm -f "$W/truths/t001.md"
  vrun alloc truth
  expect_has "t004"
  OUT=$(cat "$W/.weavedoc-state/id-sequences.json"); RC=0
  expect_has '"truth": 5'
}
block_alloc_unknown_namespace() {
  # `locus` was discarded by the 2026-08-12 rescope; a namespace the closed set does not name must
  # be a refusal, never a lazily-created counter.
  vrun alloc locus
  expect_block "usage: weavedoc alloc"
}
pass_conflict_add_remove_roundtrip() {
  # The ledger's whole life: add (id granted here, from the allocator) → blocks shipping and shows
  # on the lane → remove (resolution IS deletion) → clean again → a NEW disagreement gets a NEW
  # number, never the old one back.
  printf '{\n  "targets": ["t001"],\n  "candidates": [\n    {\n      "claim": "위약금은 20%%다",\n      "source": "m001"\n    }\n  ],\n  "created": "2026-08-13"\n}\n' > "$W/entry.json"
  vrun conflict add entry.json
  expect_pass
  expect_has "c001 recorded"
  vrun validate
  expect_block "CONFLICT-OPEN"
  vrun conflict list
  expect_has "c001 targets t001"
  expect_has "위약금은 20%다"
  vrun conflict remove c001
  expect_pass
  vrun validate
  expect_pass
  vrun conflict add entry.json
  expect_has "c002 recorded"
}
block_conflict_add_rejects_caller_ids() {
  # A caller that picks its own id is a second minting path — the reuse hole wearing a flag.
  printf '{\n  "id": "c001",\n  "targets": [],\n  "candidates": [\n    {\n      "claim": "x",\n      "source": "m001"\n    }\n  ],\n  "created": "2026-08-13"\n}\n' > "$W/entry.json"
  vrun conflict add entry.json
  expect_block "granted here, from the allocator"
}
block_conflict_add_runs_the_store_contract() {
  # add validates with the same parser validate trusts — an unpadded source is refused at the
  # door, with the model's code named, and nothing is written.
  printf '{\n  "targets": [],\n  "candidates": [\n    {\n      "claim": "x",\n      "source": "m1"\n    }\n  ],\n  "created": "2026-08-13"\n}\n' > "$W/entry.json"
  vrun conflict add entry.json
  expect_block "CONF-CANDIDATE"
  OUT=$(cat "$W/.weavedoc-state/conflicts.json"); RC=0
  expect_has '"open": []'
}
block_idseq_behind_observed_ids() {
  # An allocator left behind by an out-of-band write: the next grant would collide with a card
  # that already exists, and validate names it before the collision can happen.
  printf '{\n  "version": 1,\n  "next": {\n    "conflict": 1,\n    "material": 2,\n    "truth": 1\n  }\n}\n' > "$W/.weavedoc-state/id-sequences.json"
  vrun validate
  expect_block "IDSEQ-BEHIND"
}
block_conflict_store_dangling_references() {
  # A store entry pointing at a card or material the mine no longer holds is a reference the
  # resolve flow would trip over — both directions named, per entry.
  printf '{\n  "version": 1,\n  "open": [\n    {\n      "id": "c001",\n      "targets": ["t099"],\n      "candidates": [\n        {\n          "claim": "x",\n          "source": "m099"\n        }\n      ],\n      "created": "2026-08-13"\n    }\n  ]\n}\n' > "$W/.weavedoc-state/conflicts.json"
  vrun validate
  expect_block "CONF-TARGET-DANGLING"
  expect_has "CONF-SOURCE-DANGLING"
  expect_has "t099"
  expect_has "m099"
}

# ---- schema v3 slice 2: the v2→v3 migrator ------------------------------------------------------
mk_v2mine() { # rebuild $W as a REAL v2 mine under git — the migrator's whole input surface:
  # an ok winner carrying resolution(decided_by: machine)+superseded, a discarded loser, a
  # reciprocal conflict pair, a retracted card, ledger rows for a survivor and a casualty, a
  # changelog id token ABOVE every card (the high-water evidence), and a document citing only
  # survivors. The clean git worktree is the backup the migrator demands.
  sed -i 's/^version: 3$/version: 2/' "$W/project.md"
  sed -i 's/^version: 3/version: 2/' "$W/.weavedoc/config.yaml"
  sed -i 's/^required_tags: \[\]$/required_tags: [위약]/' "$W/project.md"
  rm -rf "$W/.weavedoc-state"
  rm -f "$W/truths"/t*.md
  printf -- '---\nid: m001\ntitle: 용역 계약서\norigin: file\nrole: 계약서\ntopics: [대금, 위약]\nformat: md\nsource_path: inbox/contract.md\nadded: 2026-07-01\nstatus: converted\nsummary: 대금과 위약금을 정한 최소 계약서.\n---\n\n# 용역 계약서\n\n제3조 대금은 5천만원으로 한다.\n제7조 위약금은 계약금액의 10%%로 한다.\n제8조 위약금은 계약금액의 20%%로 한다.\n' > "$W/materials/m001/converted.md"
  printf -- '---\nid: t001\nclaim: "위약금은 계약금액의 10%%다"\nsource: m001\nlocation: "제7조"\ntags: [위약]\nstatus: ok\nprovenance: stated\nresolution: {type: pick, winner: t001, decided_by: machine, reason: "v2 기계 선택"}\nsuperseded: [t002]\n---\n\n제7조 위약금은 계약금액의 10%%로 한다.\n' > "$W/truths/t001.md"
  printf -- '---\nid: t002\nclaim: "위약금은 계약금액의 15%%다"\nsource: m001\ntags: [위약]\nstatus: discarded\nprovenance: stated\nresolution: {type: pick, winner: t001, decided_by: user, decision_kind: supplied}\n---\n\n제7조 위약금은 계약금액의 10%%로 한다.\n' > "$W/truths/t002.md"
  printf -- '---\nid: t003\nclaim: "위약금은 계약금액의 10%%다 (7조)"\nsource: m001\nlocation: "제7조"\ntags: [위약]\nstatus: conflict\nconflict_with: [t004]\nprovenance: stated\n---\n\n제7조 위약금은 계약금액의 10%%로 한다.\n' > "$W/truths/t003.md"
  printf -- '---\nid: t004\nclaim: "위약금은 계약금액의 20%%다 (8조)"\nsource: m001\nlocation: "제8조"\ntags: [위약]\nstatus: conflict\nconflict_with: [t003]\nprovenance: stated\n---\n\n제8조 위약금은 계약금액의 20%%로 한다.\n' > "$W/truths/t004.md"
  printf -- '---\nid: t005\nclaim: "없는 조항"\nsource: m001\ntags: [해지]\nstatus: retracted\nprovenance: stated\n---\n\n제99조 없는 문장.\n' > "$W/truths/t005.md"
  printf '# Coverage\n\n## m001\n\n- 위약: t001\n- 위약 15%%: t002\n' > "$W/truths/coverage.md"
  printf '# 변경 로그\n\n- added: t001 (2026-07-30)\n- removed: t073 (v2 이력 토큰 — high-water 근거)\n' > "$W/truths/changelog.md"
  UD=$(printf 'x' | sha256sum | cut -d' ' -f1)
  printf 't001\t%s\tverified\t1\tstd\t2026-07-30\nt005\t%s\tverified\t1\tstd\t2026-07-30\n' "$UD" "$UD" > "$W/truths/verify-ledger.tsv"
  printf -- '---\ndoc_id: d1\ndoc_type: report\ntone: 담백\nstatus: planned\ncontinues: []\ncited_truths: [t001]\nscope_tags: [위약]\n---\n\n# 개요\n' > "$W/documents/d1/plan.md"
  printf '# 개요\n\n위약금은 계약금액의 10%%다. <!-- t:t001 -->\n' > "$W/documents/d1/draft.md"
  rm -f "$W/documents/d1/final.md" "$W/documents/d1/review.md"
  ( cd "$W" && git init -q && git add -A >/dev/null 2>&1 && git -c user.email=x@x -c user.name=x commit -qm base ) \
    || bad "mk_v2mine: git setup failed — the migrator's backup precondition cannot be built"
}
acct_upgrade_v2_to_v3_end_to_end() {
  # The whole §2.4 pipe on one real v2 mine: classify → delete → move → strip → state files →
  # version flip → reindex → conservation + EXACT validate (red only by the moved entry).
  # KNOWN SURVIVING MUTATION (2026-08-13 pass, 10/11 killed): removing the conservation equation
  # survives — it re-counts the transform's own loop, so no legal input reaches its failure
  # branch. It stays because it is the tripwire for the day an edit breaks that loop, which is
  # exactly when nobody is looking (the not-killable-by-any-fixture class, said out loud).
  mk_v2mine
  vrun upgrade --check
  expect_pass
  expect_has "keep 1 · delete 2 (discarded/retracted) · move 2"
  expect_has "decided_by: machine resolution (t001)"
  expect_has "high water: truth 73"
  vrun upgrade --apply
  expect_pass
  expect_has "✓ migrated — kept 1 (1 stripped) · deleted 2 · moved 2 into 1 open entr(ies)"
  expect_has "allocator next t74/m2/c2"
  # the machine ledgers travel with the deletion: the casualty's coverage row is scrubbed
  # (measured on the real mine — 26 deletions left 12 dangling mentions before this existed).
  expect_has "coverage rows scrubbed (1 dropped"
  OUT=$(cat "$W/truths/coverage.md"); RC=0
  expect_has "t001"
  expect_hasnt "t002"
  # the winner card SURVIVES its superseded field (deleting it would delete the current fact),
  # and loses exactly the v2 lines — nothing else in the file moves.
  OUT=$(cat "$W/truths/t001.md"); RC=0
  expect_has 'claim: "위약금은 계약금액의 10%다"'
  expect_hasnt "status:"
  expect_hasnt "resolution:"
  expect_hasnt "superseded:"
  OUT=$(ls "$W/truths"); RC=0
  expect_hasnt "t002.md"
  expect_hasnt "t005.md"
  expect_hasnt "t003.md"
  # the moved entry is lossless and undecided: both candidates, no target, Korean intact.
  OUT=$(cat "$W/.weavedoc-state/conflicts.json"); RC=0
  expect_has '"targets": []'
  expect_has '위약금은 계약금액의 20%다 (8조)'
  expect_has 'v2 card t003, moved by migration'
  # the casualty's ledger row went with it; the survivor's row is untouched.
  OUT=$(cat "$W/truths/verify-ledger.tsv"); RC=0
  expect_has "t001"
  expect_hasnt "t005"
  OUT=$(grep -h '^version:' "$W/project.md" "$W/.weavedoc/config.yaml" | tr '\n' ' '); RC=0
  expect_has "version: 3 version: 3"
  # post-migration validate is red by design — the moved disagreement, and ONLY that.
  vrun validate
  expect_block "CONFLICT-OPEN"
  vrun status --open
  expect_has "c001 targets (no current card — undecided)"
}
block_upgrade_dirty_worktree_refuses() {
  mk_v2mine
  printf 'dirt\n' >> "$W/catalog.md"
  vrun upgrade --apply
  expect_block "DIRTY"
  OUT=$(ls "$W/truths"); RC=0
  expect_has "t002.md"
}
block_upgrade_unsupported_card_blocks() {
  # §2.4 step 0: in v3 a card that exists IS canonical, so migrating an unsupported card would
  # silently promote broken grounding. Resolve in v2 form, re-run — and nothing is written.
  mk_v2mine
  printf -- '---\nid: t006\nclaim: "근거 잃은 주장"\nsource: m001\ntags: [위약]\nstatus: unsupported\nprovenance: stated\n---\n\n제7조 위약금은 계약금액의 10%%로 한다.\n' > "$W/truths/t006.md"
  ( cd "$W" && git add -A >/dev/null 2>&1 && git -c user.email=x@x -c user.name=x commit -qm u )
  vrun upgrade --apply
  expect_block "status: unsupported"
  OUT=$( cd "$W" && git status --porcelain | grep -v 'mine.lock' | wc -l ); RC=0
  expect_has "0"
}
block_upgrade_attribute_pair_blocks() {
  # §2.4 step 0: user-authorized 병기 must not be stripped into two bare cards — "both are right"
  # always names a hidden axis; write it into the claims in v2, then re-run.
  mk_v2mine
  sed -i 's/^resolution: {type: pick, winner: t001, decided_by: machine, reason: "v2 기계 선택"}$/resolution: {type: attribute, winner: t001, decided_by: user}/' "$W/truths/t001.md"
  ( cd "$W" && git add -A >/dev/null 2>&1 && git -c user.email=x@x -c user.name=x commit -qm a )
  vrun upgrade --apply
  expect_block "resolution.type: attribute"
  OUT=$(ls "$W/truths"); RC=0
  expect_has "t002.md"
}
block_upgrade_cited_leaving_card_blocks() {
  # A document citing a card this migration would delete or move must be repaired FIRST — a
  # dangling citation is the exact corruption the id discipline exists to prevent.
  mk_v2mine
  sed -i 's/^cited_truths: \[t001\]$/cited_truths: [t001, t002]/' "$W/documents/d1/plan.md"
  ( cd "$W" && git add -A >/dev/null 2>&1 && git -c user.email=x@x -c user.name=x commit -qm c )
  vrun upgrade --apply
  expect_block "cite card(s) this migration would delete or move"
  expect_has "d1/plan.md: t002"
  OUT=$(ls "$W/truths"); RC=0
  expect_has "t002.md"
}
acct_upgrade_ok_partner_becomes_target() {
  # §2.4's other branch: a component holding a surviving ok card makes that card the entry's
  # TARGET. v2's reciprocity rule means legal mines rarely carry this shape (both sides conflict),
  # but the migrator's totality covers it — it never runs v2 validate and must not guess.
  mk_v2mine
  sed -i 's/^status: conflict$/status: ok/' "$W/truths/t003.md"
  sed -i '/^conflict_with: \[t004\]$/d' "$W/truths/t003.md"
  printf -- '- 위약 7조: t003\n' >> "$W/truths/coverage.md"
  ( cd "$W" && git add -A >/dev/null 2>&1 && git -c user.email=x@x -c user.name=x commit -qm p )
  vrun upgrade --apply
  local AOUT="$OUT" ARC="$RC"
  OUT=$(cat "$W/.weavedoc-state/conflicts.json"); RC=0
  expect_has '"t003"'
  expect_hasnt '"targets": []'
  OUT=$(ls "$W/truths"); RC=0
  expect_has "t003.md"
  expect_hasnt "t004.md"
  # judged LAST so a failing apply leaves ITS output on the record, not the file dumps above.
  OUT="$AOUT"; RC="$ARC"
  expect_pass
}
acct_upgrade_verify_names_the_unexpected() {
  # The verify layer is the migration's warranty: a migrated mine that validates to anything
  # OTHER than the predicted CONFLICT-OPEN fails the migration and prints the restore words.
  # (The fixture's coverage ledger is quietly broken in v2 — the migrator does not re-validate
  # v2, so the breakage surfaces exactly here, as the unexpected line it is.)
  mk_v2mine
  sed -i 's/^- 위약: t001$/- 위약: t999/' "$W/truths/coverage.md"
  ( cd "$W" && git add -A >/dev/null 2>&1 && git -c user.email=x@x -c user.name=x commit -qm v )
  vrun upgrade --apply
  expect_block "does not validate to the EXACT expected state"
  expect_has "restore with: git restore ."
}
acct_upgrade_check_is_readonly() {
  mk_v2mine
  vrun upgrade --check
  expect_pass
  OUT=$( cd "$W" && git status --porcelain | grep -v 'mine.lock' | wc -l ); RC=0
  expect_has "0"
}
acct_upgrade_orphaned_reqtag_refuses_apply() {
  # A required tag whose last bearer leaves would fail the exact-validate verify as REQTAG-EMPTY —
  # predicted in preflight, enforced at apply, repaired in v2 (extract the topic or drop the tag).
  mk_v2mine
  sed -i 's/^required_tags: \[위약\]$/required_tags: [해지]/' "$W/project.md"
  ( cd "$W" && git add -A >/dev/null 2>&1 && git -c user.email=x@x -c user.name=x commit -qm t )
  vrun upgrade --apply
  expect_block "required_tags above would be orphaned"
  OUT=$(ls "$W/truths"); RC=0
  expect_has "t005.md"
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

if [ -n "$SEALCHECK" ]; then
  # A WORKER CANNOT SEAL: it inherits the key instead of computing one, so `compute_key` does not
  # exist in that branch and the seal would die with a shell error instead of a verdict. Said out
  # loud rather than left to fail obscurely (v0.5.14 — a case hit exactly this).
  if [ -n "${WD_REG_RES:-}" ]; then
    echo "--seal-check cannot run with WD_REG_RES set: that is the worker branch, which inherits the key rather than computing it" >&2
    exit 2
  fi
  mkdir -p "$RES"
  seal_or_refuse "$SEALCHECK"
  echo "seal: key unchanged ($KEY)"
  exit 0
fi

if [ -n "$BATCH" ]; then
  # A WORKER: many cases, ONE bash. The startup this amortises is not small on Windows — MSYS
  # emulates fork at ~0.4s a spawn, and every case used to pay a fresh bash + a re-parse of this
  # 5,000-line script on top of the key block above. Results go to files exactly as --one writes
  # them, so the driver's tally, --resume and the report are unchanged; only the process count is.
  mkdir -p "$RES"
  [ -d "$PRISTINE" ] || mkpristine
  for CASE_NAME in $BATCH; do runone "$CASE_NAME"; done
  exit 0
fi

if [ -n "$ONE" ]; then
  # REFUSED BEFORE ANYTHING RUNS (cold review, v0.5.16). `--one` under WD_REG_RES is the worker
  # branch: `seal_or_refuse` is not even defined there, so the seal used to die with
  # `command not found` and silently no-op. The refusal was added at the END of this block, which
  # meant the case had already run and written its PASS into the PARENT's shared result cache —
  # a result the parent's tally would then count. Its twin at --seal-check refuses first; so does
  # this now.
  if [ -n "${WD_REG_RES:-}" ]; then
    echo "--one cannot run with WD_REG_RES set: that is the worker branch, which inherits the key rather than computing it" >&2
    exit 2
  fi
  mkdir -p "$RES"
  # Standalone --one with no inherited workspace: build the fixture instead of failing on a
  # missing pristine (a stale shared pristine once ran an OLD bin against a new case — the keyed
  # per-run workspace removes that class entirely).
  [ -d "$PRISTINE" ] || mkpristine
  runone "$ONE"
  cat "$RES/$ONE"
  # `--one` seals too (external review, v0.5.14): it is a PUBLIC entry point that runs a case
  # against the live tree, so its verdict carries the same claim the full run's total does. The
  # seal comes after the result is printed — a refusal must not hide what the case actually said.
  seal_or_refuse "$KEY"
  # THE VERDICT LINE, not the whole file (external review, v0.5.16). `runone` writes the verdict on
  # line 1 and the case's OUTPUT below it — and a case whose output quotes a nested "	PASS" (the
  # seal cases print another run's result) made a FAILING case exit 0. The tally already reads
  # `head -1`; this is the same rule at the other exit.
  head -1 "$RES/$ONE" | grep -q "	PASS"
  exit $?
fi

# `meta_` is in the selector because it was NOT, and the guard added in 2026-08-01.2 as the
# structural answer to three rounds of duplicate-judge criticals sat unselected while the suite
# printed a clean total. A case that cannot be selected is a case that does not exist.
CASES=$(declare -F | awk '{print $3}' | grep -E '^(block|pass|acct|meta|e2e)_' | LC_ALL=C sort)
if [ -n "$FILTER" ]; then CASES=$(printf '%s\n' "$CASES" | grep -F "$FILTER" || true); fi
[ -z "$CASES" ] && { echo "no cases match [$FILTER]"; exit 2; }

echo "weavedoc regression — $(git -C "$REPO" rev-parse --short HEAD 2>/dev/null) / bundle $(cat "$REPO/.weavedoc/VERSION") / $(printf '%s\n' "$CASES" | wc -l | tr -d ' ') cases, -j$JOBS"
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
# --resume keeps results already in THIS key's cache and runs only what is missing. A sweep is minutes
# on MSYS (one `validate` is ~1s on the pristine fixture — the "~40s" this line used to claim
# predates the Node runtime), so it outlives a single foreground command; without
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
  # CHUNKED fan-out (v0.5.12): `-n 8` hands each worker eight cases, so 487 cases cost ~61 bash
  # startups instead of 487, and the key block runs zero times in workers (WD_REG_RES/-KEY below).
  # Eight is a balance point, not a magic number: large enough to amortise startup, small enough
  # that the last worker cannot hold the run open for long. The children inherit the workspace the
  # same way they always did (WD_REG_WORK) — this adds the result dir and the key label beside it.
  WD_REG_RES="$RES" WD_REG_KEY="$KEY" \
    xargs -P "$JOBS" -n 8 bash "$0" --batch < <(printf '%s\n' $TODO) >/dev/null 2>&1
fi

# THE KEY SEAL (v0.5.13, external review P1). The key names the cache, and until now it was a
# SNAPSHOT taken before the first case ran — nothing checked it afterwards. Cases do not all read
# the fixture: golden, doccheck, the source-shape checks and the fault-injection drivers re-read
# $REPO live, so an edit landing mid-run splits the suite across two source states and the summary
# reports one verdict for a tree that never existed as a whole. Measured on v0.5.12: edit a keyed
# runtime file 18s into a sweep, the sweep still prints its green total, and the very next
# fresh-key run of `acct_golden_outputs_current` fails with DRIFT — the same tree, two answers.
#
# So the key is recomputed here and the run REFUSES to report a total if it moved. The results are
# deleted rather than kept: they describe a mix, and a mix under a valid-looking key is exactly
# what `--resume` would hand back as "already passed" (this suite's oldest named class — a check
# that reports green while measuring nothing).
if [ -z "${WD_REG_RES:-}" ]; then seal_or_refuse "$KEY"; fi

NPASS=0; NFAIL=0; NMISS=0
for CASE in $CASES; do
  if [ ! -f "$RES/$CASE" ]; then NMISS=$((NMISS+1)); continue; fi
  if head -1 "$RES/$CASE" | grep -q "	PASS"; then NPASS=$((NPASS+1))
  else NFAIL=$((NFAIL+1)); sed 's/^/  /' "$RES/$CASE"; fi
done

echo
echo "passed $NPASS · failed $NFAIL · not yet run $NMISS"
[ "$NFAIL" -eq 0 ] && [ "$NMISS" -eq 0 ]
