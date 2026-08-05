#!/usr/bin/env bash
# Regenerate tests/baseline/golden/ from the current runtime against the minimal clean fixture.
#
# WHY THIS EXISTS. The golden snapshots are the suite's record of what each command PRINTS, and
# `acct_golden_outputs_current` asserts them. So an intentional output change fails that case until
# the snapshots are regenerated — which is the point: the change then shows up in the diff of this
# directory, where a reviewer can see the before and after, instead of being invisible.
#
# Before this was wired, nothing read golden/ at all and it sat a whole release out of date while
# the suite stayed green (found by a cold review, 2026-08-05).
#
#   bash tests/refresh-golden.sh          # rewrite the snapshots, then `git diff` them
set -u
REPO=$(cd "$(dirname "$0")/.." >/dev/null 2>&1 && pwd)
G="$REPO/tests/baseline/golden"
WD_BIN=${WD_BIN:-"node .weavedoc/bin/weavedoc.mjs"}
read -r -a WDRUN <<< "$WD_BIN"

# The suite's own fixture builder, so the snapshot is of the SAME mine the cases run against — a
# hand-made fixture here would drift from the one being graded and nobody would notice.
WORK=$(mktemp -d "${TMPDIR:-/tmp}/wd-golden.XXXXXX")
trap 'rm -rf "$WORK"' EXIT
WD_REG_WORK="$WORK" bash "$REPO/tests/regress.sh" acct_smoke_version >/dev/null 2>&1 || true
P="$WORK/pristine"
[ -d "$P" ] || { echo "refresh-golden: the harness did not build a pristine fixture at $P" >&2; exit 2; }

for c in validate census scope status gaps; do
  ( cd "$P" && "${WDRUN[@]}" "$c" ) > "$G/$c.txt" 2>&1
done
( cd "$P" && "${WDRUN[@]}" version ) > "$G/version.txt" 2>&1
echo "refresh-golden: rewrote $G — review with 'git diff tests/baseline/golden/'"
