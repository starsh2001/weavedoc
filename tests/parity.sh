#!/usr/bin/env bash
# Command-level parity: run ONE command under both runtimes on the SAME mine and compare.
#
# WHY THIS EXISTS. regress.sh grades a whole mine: it refuses to start unless the pristine fixture
# validates, which is right — a broken fixture makes every case below it meaningless. But that means
# the suite cannot grade a PARTIAL port: until `validate` lands (stage 5), stages 1-4 would have no
# automated scale at all. This is that scale, one command wide instead of one mine wide.
#
#   bash tests/parity.sh <mine-dir> <command>...
#   bash tests/parity.sh . version "version --json" lang locale
#   bash tests/parity.sh /d/repo/eclypse version lang       # a real mine, richer than the fixture
#
# The contract it checks is the one REWRITE_PLAN §4 states: same mine, same command ->
# byte-identical stdout, identical exit code. stderr is not compared (implementations word their
# warnings differently, and v0.3.7 already settled that stdout carries the verdict).
#
# READ-ONLY commands only. This runs each command twice against a real directory; do not point it
# at commands that write until the port has a scratch mine to write into.
set -u
REPO=$(cd "$(dirname "$0")/.." >/dev/null 2>&1 && pwd)
BASH_BIN=${WD_BASH_BIN:-".weavedoc/bin/weavedoc"}
NODE_BIN=${WD_NODE_BIN:-".weavedoc/bin/weavedoc.mjs"}

MINE=${1:-}
[ -n "$MINE" ] || { echo "usage: bash tests/parity.sh <mine-dir> <command>..." >&2; exit 2; }
shift
[ $# -gt 0 ] || { echo "usage: bash tests/parity.sh <mine-dir> <command>..." >&2; exit 2; }
[ -d "$MINE" ] || { echo "parity: no such mine: $MINE" >&2; exit 2; }

# KNOWN, DECLARED DIVERGENCE — never a silent one.
# The fingerprint hashes the runtime's own bytes, so two different runtimes MUST report different
# fingerprints; that is the field doing its job, not drift. It is normalised away here and the
# normalisation is announced on every run, because a comparison that quietly forgives a difference
# is how a real difference gets forgiven too.
# Second declared divergence: the mine root. MSYS bash sees /d/repo/x, native Node sees D:/repo/x —
# one directory, two spellings. Commands that print ABSOLUTE paths (impact, and two of validate's
# diagnostics) therefore cannot reach byte parity on Windows until those outputs are made relative,
# which REWRITE_PLAN §4 records as a decision still to take. Folding it here keeps the rest
# comparable; it does not settle that.
MINE_ABS=$(cd "$MINE" >/dev/null 2>&1 && pwd)
# Windows spells one directory three ways: the MSYS path, the mixed path, and the mixed path with
# 8.3 short components. cygpath -m can return either name form depending on the input, and Node
# always reports the long one — so all of them are folded, or the comparison reports a difference
# that is only a spelling.
MINE_WIN=$(cygpath -m "$MINE_ABS" 2>/dev/null || printf '%s' "$MINE_ABS")
MINE_WINL=$(cygpath -ml "$MINE_ABS" 2>/dev/null || printf '%s' "$MINE_WIN")
normalise() { sed -E -e 's/^fingerprint: [0-9a-f]+ /fingerprint: <RUNTIME-SPECIFIC> /' \
                     -e 's/"fingerprint":"[0-9a-f]*"/"fingerprint":"<RUNTIME-SPECIFIC>"/' \
                     -e "s|$MINE_WINL|<MINE>|g" -e "s|$MINE_WIN|<MINE>|g" -e "s|$MINE_ABS|<MINE>|g"; }

echo "parity — mine: $MINE"
echo "  bash: $BASH_BIN"
echo "  node: $NODE_BIN"
echo "  normalised (declared divergence): the version fingerprint — it hashes the runtime itself"
echo

# The exit code comes from PIPESTATUS[0], never from `$?` after the assignment (found 2026-08-04,
# before stage 5 wrote a line). `x=$(cmd | sed)` reports SED's status, so `brc`/`nrc` were both
# always 0 and the exit-code half of the contract had never once been compared — `impact m999`
# (rc 2 on both runtimes) printed "rc 0" and passed. For validate that half IS the verdict: 0 is
# a clean mine and 1 is a blocked one, and the entire suite below rides on which one comes back.
# The assignment must therefore be its own statement, after the pipeline has run.
fail=0
for c in "$@"; do
  # shellcheck disable=SC2086 — commands are given as space-separated argv, on purpose
  bo=$( ( cd "$MINE" && bash "$REPO/$BASH_BIN" $c; printf '\001%s' "$?" ) 2>/dev/null | normalise )
  brc=${bo##*$'\001'}; bo=${bo%$'\001'*}
  no=$( ( cd "$MINE" && node "$REPO/$NODE_BIN" $c; printf '\001%s' "$?" ) 2>/dev/null | normalise )
  nrc=${no##*$'\001'}; no=${no%$'\001'*}
  if [ "$bo" = "$no" ] && [ "$brc" = "$nrc" ]; then
    printf '  PASS  %-24s (rc %s)\n' "$c" "$brc"
  else
    fail=$((fail+1))
    printf '  DIFF  %-24s (bash rc %s · node rc %s)\n' "$c" "$brc" "$nrc"
    # printf '%s', not '%s\n': the captured text now keeps its OWN trailing newline (the rc marker
    # sits after it), so adding one would report a difference in every comparison.
    diff <(printf '%s' "$bo") <(printf '%s' "$no") | sed 's/^/        /'
  fi
done

echo
if [ "$fail" -eq 0 ]; then echo "parity: all $# command(s) agree"; else echo "parity: $fail of $# command(s) DIFFER"; fi
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
