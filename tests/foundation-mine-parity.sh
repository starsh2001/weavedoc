#!/usr/bin/env bash
# Mine-level foundation differential: run the bash runtime's own readers and the Node ports over a
# REAL mine and diff everything they can see — every config lookup, every frontmatter key/value.
#
# The table in foundation-parity.sh pins the rules; this pins them against data nobody designed for
# a test. eclypse alone is ~300 files: Korean values, quoted strings holding '#', flow mappings,
# emoji claims, keys with dots. That is where a reader disagrees in ways a table would not think to
# ask about.
#
#   bash tests/foundation-mine-parity.sh /d/repo/eclypse
#   bash tests/foundation-mine-parity.sh .              # the repo itself is a (tiny) mine
set -u
REPO=$(cd "$(dirname "$0")/.." >/dev/null 2>&1 && pwd)
BIN="$REPO/.weavedoc/bin/weavedoc"
MINE=${1:-}
[ -n "$MINE" ] && [ -d "$MINE" ] || { echo "usage: bash tests/foundation-mine-parity.sh <mine-dir>" >&2; exit 2; }
MINE=$(cd "$MINE" >/dev/null 2>&1 && pwd)

LIB=$(mktemp "${TMPDIR:-/tmp}/wd-mlib.XXXXXX.sh")
BOUT="$LIB.bash.out"; NOUT="$LIB.node.out"
trap 'rm -f "$LIB" "$BOUT" "$NOUT" "$LIB.diff"' EXIT
sed '/^# ===================== dispatch/,$d' "$BIN" > "$LIB"

esc() { local s=$1; s=${s//\\/\\\\}; s=${s//$'\n'/\\n}; s=${s//$'\t'/\\t}; printf '%s' "$s"; }

# The lib computes ROOT from $PWD when sourced, so it is sourced INSIDE the mine — the readers then
# address the mine exactly as a real command run from there would.
(
  cd "$MINE" || exit 2
  # shellcheck disable=SC1090
  source "$LIB" || exit 2
  cfg_load
  for k in "${!CFGFLAT[@]}"; do printf 'cfgval\t%s\t\t%s\n' "$k" "$(esc "${CFGFLAT[$k]}")"; done
  for k in "${!CFG[@]}"; do printf 'cfg2\t%s\t%s\t%s\n' "${k%%.*}" "${k#*.}" "$(esc "${CFG[$k]}")"; done
  for k in inbox materials truths documents; do printf 'cfgpath\t%s\t\t%s\n' "$k" "$(esc "$(cfg "$k" "$k")")"; done

  files=()
  for f in project.md catalog.md gaps.md; do [ -f "$f" ] && files+=("$f"); done
  for f in materials/*/converted.md;  do [ -f "$f" ] && files+=("$f"); done
  for f in truths/*.md;               do [ -f "$f" ] && files+=("$f"); done
  for f in documents/*/*.md;          do [ -f "$f" ] && files+=("$f"); done
  [ "${#files[@]}" -gt 0 ] && fm_preload "${files[@]}"
  for f in "${files[@]}"; do
    has_fm "$f"; printf 'hasfm\t%s\t\t%s\n' "$f" "$?"
  done
  for kk in "${!FMV[@]}"; do
    printf 'fm\t%s\t%s\t%s\n' "${kk%%$'\037'*}" "${kk#*$'\037'}" "$(esc "${FMV[$kk]}")"
  done
) | LC_ALL=C sort > "$BOUT"

node "$REPO/tests/foundation-mine-node.mjs" "$MINE" | LC_ALL=C sort > "$NOUT" \
  || { echo "foundation-mine-parity: node side failed" >&2; exit 2; }

# DECLARED DIVERGENCE — announced, never silent.
# The two runtimes spell the SAME directory differently on Windows: bash runs under MSYS and sees
# /d/repo/x, Node is native and sees D:/repo/x. That is presentation, not a rule — every path here
# resolves to one directory. Both spellings are folded to <MINE> so the readers can be compared on
# what they actually decide.
# NOT harmless elsewhere: the truths diagnostics embed an ABSOLUTE path in their message (every
# other diagnostic uses a relative one — an inconsistency inside the bash runtime, not a design),
# so stage 5 cannot reach byte parity on those lines until that is settled. Recorded in
# REWRITE_PLAN §4; do not let this normalisation quietly stand in for that decision.
MINE_WIN=$(cygpath -m "$MINE" 2>/dev/null || printf '%s' "$MINE")
norm() { sed -e "s|$MINE_WIN|<MINE>|g" -e "s|$MINE|<MINE>|g" "$1" > "$1.n" && mv "$1.n" "$1"; }
norm "$BOUT"; norm "$NOUT"

nb=$(grep -c . "$BOUT" || true); nn=$(grep -c . "$NOUT" || true)
echo "foundation-mine-parity — mine: $MINE"
echo "  bash rows: $nb · node rows: $nn"
echo "  normalised (declared): the mine root — MSYS spells it $MINE, native Node spells it $MINE_WIN"
if diff -u "$BOUT" "$NOUT" > "$LIB.diff"; then
  echo "  AGREE — every config lookup and frontmatter value matches"
  exit 0
fi
echo "  DISAGREEMENT (bash left, Node right):"
sed -n '1,60p' "$LIB.diff" | sed 's/^/    /'
echo "    ... disagreeing rows: $(grep -cE '^[-+][a-z]' "$LIB.diff" || true)"
exit 1
