#!/usr/bin/env bash
# Docs ↔ code consistency (Phase 5, WD-DOC-001 완료 조건: 문서에 기재된 명령이 자동 검사된다).
# Runs as the suite's meta_doc_sync case and stays green only while three surfaces agree:
# dispatch ↔ README ↔ the bin header comment, and VERSION ↔ CHANGELOG's top bundle.
set -u
REPO=$(cd "$(dirname "$0")/.." >/dev/null 2>&1 && pwd)
BIN="$REPO/.weavedoc/bin/weavedoc"
fail=0
say() { echo "doccheck: $*"; fail=1; }

# 1. Every dispatch command is documented in README and in the bin header comment.
cmds=$(sed -n '/^case "\${1:-}" in/,/^esac/p' "$BIN" | grep -oE '^  [a-z-]+\)' | tr -d ' )')
for c in $cmds; do
  grep -q "\`$c" "$REPO/README.md" || say "command '$c' is in dispatch but not in README"
  grep -qE "^#   $c( |\$)" "$BIN" || say "command '$c' is in dispatch but not in the bin header comment"
done

# 2. Every token the README summary block names is a real command.
toks=$(sed -n '/bin\/weavedoc   deterministic/,+2p' "$REPO/README.md" \
  | grep -oE '[a-z][a-z-]+' \
  | grep -vE '^(weavedoc|bin|deterministic|checks|md)$' | LC_ALL=C sort -u)
for t in $toks; do
  printf '%s\n' "$cmds" | grep -qx "$t" || say "README summary names '$t' but dispatch has no such command"
done

# 3. The VERSION label and CHANGELOG's newest entry are one fact.
v=$(cat "$REPO/.weavedoc/VERSION" 2>/dev/null)
top=$(grep -m1 '^## ' "$REPO/CHANGELOG.md" | sed 's/^## *//')
[ "$v" = "$top" ] || say "VERSION ($v) != CHANGELOG top entry ($top)"

[ "$fail" -eq 0 ] && echo "doccheck: docs and code agree"
exit "$fail"
