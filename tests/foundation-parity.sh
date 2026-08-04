#!/usr/bin/env bash
# Foundation differential: run the SAME table of inputs through the bash runtime's own judges and
# through the Node ports, and diff the answers.
#
# WHY. parity.sh compares COMMANDS; these are the rules underneath them, and they are exactly where
# bash drifted. On 2026-08-04 "how a frontmatter value is read" had three spellings in one file, and
# the one in scope never peeled quotes — `status: "retracted"` was a tombstone to validate and a
# live truth to scope. A rewrite that re-derives these rules by reading them is how that happens
# again; this measures agreement instead.
#
# HOW. The bash runtime splits cleanly at the dispatch table, so everything above it can be sourced
# and its real functions called. No reimplementation on either side of the comparison.
#
#   bash tests/foundation-parity.sh
set -u
REPO=$(cd "$(dirname "$0")/.." >/dev/null 2>&1 && pwd)
BIN="$REPO/.weavedoc/bin/weavedoc"
TABLE="$REPO/tests/foundation-cases.tsv"
[ -f "$BIN" ] && [ -f "$TABLE" ] || { echo "foundation-parity: missing $BIN or $TABLE" >&2; exit 2; }

# Source the runtime WITHOUT its dispatch: the dispatch runs a command and exits, which would end
# this script instead of lending it the judges.
LIB=$(mktemp "${TMPDIR:-/tmp}/wd-lib.XXXXXX.sh")
trap 'rm -f "$LIB" "$LIB.bash.out" "$LIB.node.out"' EXIT
sed '/^# ===================== dispatch/,$d' "$BIN" > "$LIB"
# shellcheck disable=SC1090
source "$LIB" || { echo "foundation-parity: could not source the bash judges" >&2; exit 2; }

# Pure bash, deliberately: `$(printf … | sed …)` strips TRAILING newlines, and the trailing newline
# is part of what these rules return — REPLY ends with one. Escaping through a subshell reported a
# difference that did not exist and would have hidden one that did.
esc() { local s=$1; s=${s//\\/\\\\}; s=${s//$'\n'/\\n}; s=${s//$'\t'/\\t}; printf '%s' "$s"; }
un()  { [ "$1" = "<E>" ] && printf '' || printf '%s' "$1"; }

while IFS=$'\t' read -r rule f1 f2 || [ -n "${rule:-}" ]; do
  case "${rule:-}" in ''|'#'*) continue ;; esac
  a=$(un "${f1:-}"); b=$(un "${f2:-}")
  rc=0; outp=""
  case "$rule" in
    canon_id)       canon_id "$a" >/dev/null 2>&1; rc=$?; outp=$REPLY ;;
    is_date)        is_date "$a"; rc=$? ;;
    listfield)      listfield "$a" >/dev/null 2>&1; rc=$?; outp=$REPLY ;;
    pipes)          pipes "$a" >/dev/null 2>&1; rc=$?; outp=$REPLY ;;
    in_list)        in_list "$a" "$b"; rc=$? ;;
    is_placeholder) is_placeholder "$a"; rc=$? ;;
    fmval)          outp=$(printf '%s\n' "$a" | LC_ALL=C awk "$FM_KV_AWK"'{ printf "%s", fmval($0) }') ;;
    fmkey)          outp=$(printf '%s\n' "$a" | LC_ALL=C awk "$FM_KV_AWK"'{ printf "%s", fmkey($0) }') ;;
    *)              rc=99; outp="UNKNOWN-RULE" ;;
  esac
  printf '%s\t%s\t%s\t%s\t%s\n' "$rule" "${f1:-}" "${f2:-}" "$rc" "$(esc "$outp")"
done < "$TABLE" > "$LIB.bash.out"

node "$REPO/tests/foundation-node.mjs" > "$LIB.node.out" || { echo "foundation-parity: node side failed" >&2; exit 2; }

n=$(grep -c . "$LIB.bash.out" || true)
if diff -u "$LIB.bash.out" "$LIB.node.out" > "$LIB.diff"; then
  echo "foundation-parity: $n rule case(s) agree — bash and Node answer identically"
  exit 0
fi
echo "foundation-parity: DISAGREEMENT (bash is the left side, Node the right)"
sed -n '1,80p' "$LIB.diff"
d=$(grep -c '^-[a-z]' "$LIB.diff" || true)
echo "  disagreeing rows: $d of $n"
exit 1
