#!/usr/bin/env bash
# Differential for lib/diff.mjs against the REAL `diff`.
#
# WHY. `reindex --check` prints a diff, and that text is stdout — which the port's contract says must
# be byte-identical to what the bash runtime produced by forking GNU diff. The port stopped forking,
# so the claim "our diff prints what GNU diff prints" needs measuring rather than asserting. This
# feeds both implementations the same pairs of files and compares their output byte for byte.
#
#   bash tests/diff-parity.sh            # randomised pairs + the real mine's generated views
#   bash tests/diff-parity.sh 500        # more pairs
#
# The pairs are deliberately nasty in the ways that matter here: missing trailing newlines on either
# side, empty files, pure insertions and deletions, whole-file replacement, edits at the very first
# and very last line, and a tiny alphabet so identical lines repeat — which is where two
# implementations of "the shortest edit script" pick different, equally short answers.
#
# ONE fork for the whole sweep: `diff -r` walks both trees in a single process. Per-case forking cost
# seven minutes on MSYS, which is enough to stop anyone from running it.
set -u
REPO=$(cd "$(dirname "$0")/.." >/dev/null 2>&1 && pwd)
N=${1:-200}
WORK=$(mktemp -d "${TMPDIR:-/tmp}/wd-dp.XXXXXX")
trap '[ -n "${WD_DP_KEEP:-}" ] || rm -rf "$WORK"' EXIT
mkdir -p "$WORK/A" "$WORK/B" "$WORK/N"

node "$REPO/tests/diff-parity-gen.mjs" "$WORK" "$N" || { echo "diff-parity: generator failed" >&2; exit 2; }
# `diff -r` prints a `diff -r A/x B/x` header before each differing file and nothing for identical
# ones — so one process yields every case's expected output, keyed by name.
( cd "$WORK" && diff -r A B ) > "$WORK/all.gnu" 2>/dev/null
node "$REPO/tests/diff-parity-cmp.mjs" "$WORK"
