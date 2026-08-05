#!/usr/bin/env bash
# Whole-corpus parity: run ONE read command under both runtimes over EVERY mine the regression
# suite builds, and compare stdout bytes and exit codes.
#
# WHY THIS EXISTS, next to parity.sh and regress.sh.
#   parity.sh grades one command on one mine. That is the right shape for `census` on eclypse, and
#   the wrong shape for `validate`: a clean mine exercises the PASS path and almost none of the 92
#   diagnostics. eclypse's validate prints four lines.
#   regress.sh grades 345 cases, but each case asserts a SUBSTRING (`expect_has "materials 2"`).
#   A diagnostic whose wording, ordering, count or accompanying lines changed still passes it. The
#   rewrite's contract is output BYTES, so a substring suite cannot be the scale for the rewrite.
#
# This is the missing scale: the 345 cases' own mines — every deliberately broken shape the suite
# knows how to build — graded on the whole output instead of one substring of it. It reports which
# mine differs and which line, which a substring assertion never can.
#
#   bash tests/parity-corpus.sh <corpus-dir> [command...]   # default: every command the port claims
#   bash tests/parity-corpus.sh /d/wd-corpus/w validate "validate --json"
#
# BUILDING THE CORPUS. `runone` leaves each case's mutated mine at $WD_REG_WORK/w/<case>, so one
# bash sweep with a persistent workspace harvests all of them:
#   mkdir -p /tmp/wk && WD_REG_WORK=/tmp/wk bash tests/regress.sh
#   bash tests/parity-corpus.sh /tmp/wk/w
# Do this in the Linux container (§7 of the handoff): a full MSYS sweep starves the machine, and
# grading both runtimes on ONE platform removes the platform from the comparison entirely.
#
# READ-ONLY commands only, for the same reason parity.sh is: this runs each command twice against
# one directory. Everything in the default list writes nothing (`reindex --check` is the read-only
# form); a write command belongs in tests/parity-write.sh, which copies the mine first.
set -u
REPO=$(cd "$(dirname "$0")/.." >/dev/null 2>&1 && pwd)
BASH_BIN=${WD_BASH_BIN:-".weavedoc/bin/weavedoc"}
NODE_BIN=${WD_NODE_BIN:-".weavedoc/bin/weavedoc.mjs"}

CORPUS=${1:-}
[ -n "$CORPUS" ] || { echo "usage: bash tests/parity-corpus.sh <corpus-dir> [command...]" >&2; exit 2; }
shift
[ -d "$CORPUS" ] || { echo "parity-corpus: no such corpus: $CORPUS" >&2; exit 2; }
# The default is the set of commands the port CLAIMS, not the one it is aiming at. Defaulting to
# `validate` while it is unported made every run report all 346 mines as DIFF, which is a scale that
# says the same thing whatever the code does. Add `validate` to this list in the same commit that
# removes it from weavedoc.mjs's NOT_PORTED.
CMDS=("$@")
[ "${#CMDS[@]}" -gt 0 ] || CMDS=(validate "validate --json" census scope status gaps "impact m001" "pull 위약" "reindex --check")

# Show at most this many differing lines per mine — enough to see the shape, not so much that one
# systematic difference buries the other 300 mines.
CTX=${WD_PC_CTX:-12}
# Stop after this many differing mines. A port mid-flight differs everywhere; the first few are
# the ones being worked on. 0 = no limit.
MAXDIFF=${WD_PC_MAXDIFF:-0}
ONLY=${WD_PC_ONLY:-}

# DECLARED divergences, named one by one and ANNOUNCED on every run. A mine that is permanently red
# for a settled reason trains the reader to skim past red, which is how a real difference gets
# skimmed past too — so it is counted and named as an exception, never quietly skipped.
#
# Scoped to a (mine, command) PAIR, not a mine. Holding out a whole mine would hide every other
# command on it: `pass_placeholder_shaped_tag_list` diverges only on `reindex --check` (declared
# exception 4, diff-hunk grouping), and blanketing the mine would have silently excused `validate`
# there too — on the one mine most likely to exercise a placeholder-shaped tag.
# Each entry: <mine-name>|<command>|<why>. See REWRITE_PLAN.md §4.
EXCEPT=(
  "block_truth_shaped_directory|census|a directory wearing a truth filename: bash's ls prints it as a '<path>:' header, leaking 't009.md:' into the diagnostic and killing the numbering-holes line; the port prints 't009'. validate blocks on TRUTH-DIR either way"
  "block_truth_shaped_directory|gaps|the same census block, which gaps prints first — one cause, and it is listed twice rather than blanketing the mine, so every OTHER command on it is still graded"
  "pass_placeholder_shaped_tag_list|reindex --check|GNU diff's hunk grouping when several minimal edit scripts tie — the verdict (in sync/DIFFERS, the counts, the exit code) always agrees; 97.9% of 864 synthetic cases match byte for byte and no real-mine case diverges"
  "pass_crlf_retag|validate --json|the same CRLF cause as the line below, through the machine surface. Listed SEPARATELY rather than by mine, and that is the scoping doing its job: the first full run held out the human form and correctly still reported the --json one as differing. NOTE for whoever edits this array: it is a DOUBLE-quoted bash string, so a backtick in the prose is command substitution — this entry ran 'validate' as a command on its first draft"
  "pass_crlf_retag|validate|a CRLF truth quoting an LF material. bash's own answer here depends on the platform — MSYS gawk strips the CR and seals, Linux gawk keeps it and reports SEAL-QUOTE-MISSING (measured, same mine, both ways) — so there is no single bash answer to match. The port strips, which is the MSYS answer and the one already ruled on in REWRITE_PLAN §4; the point of the rewrite is that this verdict stops depending on which OS ran it. Only 2 of 349 corpus mines mix line endings at all"
)
is_declared () { # $1=mine $2=command
  local e
  for e in "${EXCEPT[@]}"; do
    [ "${e%%|*}" = "$1" ] || continue
    local r=${e#*|}
    [ "${r%%|*}" = "$2" ] && return 0
  done
  return 1
}

# The mine root is spelled differently by the two runtimes on Windows (MSYS /d/x vs native D:/x).
# Diagnostics were made project-relative in 2026-08-04, so this should now fold NOTHING — it stays
# as a tripwire, and the count of folds is REPORTED. A normalisation nobody watches is a
# normalisation that starts forgiving real differences.
FOLDED=0

echo "parity-corpus — $CORPUS"
echo "  bash: $BASH_BIN"
echo "  node: $NODE_BIN"
echo "  commands: ${CMDS[*]}"
for e in "${EXCEPT[@]}"; do r=${e#*|}; echo "  DECLARED DIVERGENCE — ${e%%|*} / ${r%%|*}: ${r#*|}"; done
echo

pass=0; fail=0; nmine=0; ndiffshown=0; nexc=0
FAILED=""
for d in "$CORPUS"/*/; do
  [ -d "$d" ] || continue
  mine=${d%/}; name=${mine##*/}
  [ -n "$ONLY" ] && case "$name" in *"$ONLY"*) ;; *) continue ;; esac
  # A harvested mine that is not a mine (a case that removed .weavedoc) has nothing to compare.
  [ -d "$mine/.weavedoc" ] || continue
  nmine=$((nmine+1))
  mineabs=$(cd "$mine" >/dev/null 2>&1 && pwd)
  minewin=$(cygpath -m "$mineabs" 2>/dev/null || printf '%s' "$mineabs")
  bad=0; detail=""; held=0
  for c in "${CMDS[@]}"; do
    # rc via PIPESTATUS, never `$?` after a pipeline-valued assignment — see tests/parity.sh.
    # shellcheck disable=SC2086 — the command is argv given as words, on purpose
    bo=$( ( cd "$mine" && bash "$REPO/$BASH_BIN" $c; printf '\001%s' "$?" ) 2>/dev/null )
    brc=${bo##*$'\001'}; bo=${bo%$'\001'*}
    no=$( ( cd "$mine" && node "$REPO/$NODE_BIN" $c; printf '\001%s' "$?" ) 2>/dev/null )
    nrc=${no##*$'\001'}; no=${no%$'\001'*}
    if [ "$bo" != "$no" ]; then
      b2=${bo//"$mineabs"/<MINE>}; b2=${b2//"$minewin"/<MINE>}
      n2=${no//"$mineabs"/<MINE>}; n2=${n2//"$minewin"/<MINE>}
      [ "$b2" = "$n2" ] && { FOLDED=$((FOLDED+1)); bo=$b2; no=$n2; }
    fi
    agree=0; { [ "$bo" = "$no" ] && [ "$brc" = "$nrc" ]; } && agree=1
    # A declared exception is RUN and compared like everything else — it is only excused from the
    # verdict. Skipping it outright would make a stale declaration undetectable, and an exception
    # nobody re-checks outlives the reason it was written for.
    if is_declared "$name" "$c"; then
      held=1
      [ "$agree" -eq 1 ] && echo "  STALE EXCEPTION  $name / $c now AGREES — delete the EXCEPT entry"
      continue
    fi
    [ "$agree" -eq 1 ] && continue
    bad=1
    detail="$detail$(printf '    %s  (bash rc %s · node rc %s)\n' "$c" "$brc" "$nrc")"
    detail="$detail$(diff <(printf '%s' "$bo") <(printf '%s' "$no") | head -"$CTX" | sed 's/^/      /')"$'\n'
  done
  [ "$held" -eq 1 ] && nexc=$((nexc+1))
  if [ "$bad" -eq 0 ]; then pass=$((pass+1)); else
    fail=$((fail+1)); FAILED="$FAILED $name"
    if [ "$MAXDIFF" -eq 0 ] || [ "$ndiffshown" -lt "$MAXDIFF" ]; then
      ndiffshown=$((ndiffshown+1))
      printf '  DIFF  %s\n%s' "$name" "$detail"
    fi
  fi
done

echo
[ "$FOLDED" -gt 0 ] && echo "  NOTE: the mine-root spelling was folded on $FOLDED comparison(s) — diagnostics are supposed to be project-relative, so this should be 0"
[ "$nexc" -gt 0 ] && echo "  ($nexc mine(s) had a (mine, command) pair held out as a declared divergence — listed at the top)"
# The count reported is the count COMPARED — held-out mines are named on their own line above and
# are never folded into a total that would read as "everything agreed".
if [ "$fail" -eq 0 ]; then
  echo "parity-corpus: all $pass compared mine(s) agree on: ${CMDS[*]}"
else
  echo "parity-corpus: $fail of $((pass+fail)) compared mine(s) DIFFER"
  echo "  failing:$FAILED" | fold -sw 110 | sed '2,$s/^/    /'
fi
[ "$fail" -eq 0 ]
