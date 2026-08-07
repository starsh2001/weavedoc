#!/usr/bin/env bash
# Docs ↔ code consistency (Phase 5, WD-DOC-001 완료 조건: 문서에 기재된 명령이 자동 검사된다).
# Runs as the suite's meta_doc_sync case and stays green only while three surfaces agree:
# dispatch ↔ README ↔ the bin header comment, and VERSION ↔ CHANGELOG's top bundle.
set -u
REPO=$(cd "$(dirname "$0")/.." >/dev/null 2>&1 && pwd)
BIN="$REPO/.weavedoc/bin/weavedoc.mjs"
fail=0
say() { echo "doccheck: $*"; fail=1; }

# 1. Every dispatch command is documented in README and in the entrypoint's header comment.
# The dispatch is a JS `switch` — `case 'name':`, one per line, some opening a block. The bash
# spelling this replaces read `  name)` out of a `case ... esac`; the surface changed, the rule did
# not. VACUITY GUARD: an extraction that silently returned nothing would make every loop below run
# zero times and this whole file print "docs and code agree" — the failure mode a check like this
# has to refuse, since its own emptiness looks exactly like success.
cmds=$(grep -oE "^  case '[a-z-]+':" "$BIN" | sed -E "s/.*'([a-z-]+)'.*/\1/" | LC_ALL=C sort -u)
n=$(printf '%s\n' "$cmds" | grep -c . || true)
[ "${n:-0}" -ge 10 ] || say "dispatch extraction found only ${n:-0} command(s) in $BIN — the parse is broken, not the docs"
for c in $cmds; do
  grep -q "\`$c" "$REPO/README.md" || say "command '$c' is in dispatch but not in README"
  grep -qE "^//   $c( |\$)" "$BIN" || say "command '$c' is in dispatch but not in the entrypoint header comment"
done

# 2. Every token the README summary block names is a real command — the REVERSE direction, and the
# only one there is: check 1 asks "is every command documented", this asks "is everything documented
# a command". The anchor is a prose line, so it broke the moment the summary was rewritten for the
# Node entrypoint (2026-08-05.3): the sed range matched nothing, `toks` came out empty, the loop ran
# ZERO times, and doccheck printed "docs and code agree" over a check that had stopped existing.
# Found by a cold review. Hence the anchor is now loose about spacing, and — the actual lesson —
# THIS EXTRACTION HAS ITS OWN VACUITY GUARD. A check whose emptiness is indistinguishable from its
# success has to refuse to be empty.
toks=$(sed -n '/bin\/weavedoc\(\.mjs\)\? \+deterministic/,+3p' "$REPO/README.md" \
  | grep -oE '[a-z][a-z-]+' \
  | grep -vE '^(weavedoc|bin|lib|deterministic|checks|md|mjs|the|runtime|s|modules|behavior|lives|here|not|in|entrypoint)$' | LC_ALL=C sort -u)
nt=$(printf '%s\n' "$toks" | grep -c . || true)
[ "${nt:-0}" -ge 10 ] || say "README summary-block extraction found only ${nt:-0} token(s) — the anchor no longer matches the block, so this check is measuring nothing"
for t in $toks; do
  printf '%s\n' "$cmds" | grep -qx "$t" || say "README summary names '$t' but dispatch has no such command"
done

# 4. The no-command USAGE line names every dispatch command. It is a fourth surface that can drift
# — and it had: `upgrade` was in the dispatch, the README, and the header roster, and missing from
# the one line a user actually sees on a typo (v0.5.1 external review). Same vacuity rule as the
# others: an extraction that comes back empty is a broken parse, not agreeing docs.
usage=$(sed -n "/^const USAGE = /,/^$/p" "$BIN" | grep -oE "'[^']*'" | tr -d "'" | tr -d '\n')
[ -n "$usage" ] || say "USAGE extraction found nothing in $BIN — the parse is broken, not the docs"
for c in $cmds; do
  case "$usage" in *"$c"*) ;; *) say "command '$c' is in dispatch but not in the USAGE line" ;; esac
done

# 5. Every path validate treats as configured is a path weavedoc-init promises a marker for. These
# two are the halves of one guarantee — "git stores no empty directories, so a configured path that
# is still empty must carry a tracked file" — and they live in different kinds of artifact: one in
# JS, one in a markdown skill nobody can execute. A test can run the first half (the suite's
# configured-path matrix does); the second half is instructions, and the only mechanism available
# for instructions is to check that they still say it. That is a TEXT check and it is named as one:
# it cannot prove the skill is followed, only that the sentence a follower would read is there.
# Deleting the `.gitkeep` instruction turned the clone case green through v0.5.20 because the case
# created the marker itself (external review, v0.5.21); this is the link that goes red instead.
init="$REPO/.claude/skills/weavedoc-init/SKILL.md"
paths=$(grep -oE "for \(const k of \[[^]]*\]\) \{" "$REPO/.weavedoc/bin/lib/cmd-validate.mjs"   | grep -oE "'[a-z]+'" | tr -d "'" | LC_ALL=C sort -u)
np=$(printf '%s
' "$paths" | grep -c . || true)
[ "${np:-0}" -ge 4 ] || say "configured-path extraction found only ${np:-0} key(s) in cmd-validate.mjs — the parse is broken, not the docs"
grep -q '`.gitkeep`' "$init" || say "weavedoc-init no longer instructs a .gitkeep marker — an empty configured directory will not survive a clone"
for k in $paths; do
  grep -q "\`$k/\`" "$init" || say "validate treats '$k' as a configured path but weavedoc-init never names \`$k/\`"
done

# 3. The VERSION label and CHANGELOG's newest entry are one fact.
v=$(cat "$REPO/.weavedoc/VERSION" 2>/dev/null)
top=$(grep -m1 '^## ' "$REPO/CHANGELOG.md" | sed 's/^## *//')
[ "$v" = "$top" ] || say "VERSION ($v) != CHANGELOG top entry ($top)"

[ "$fail" -eq 0 ] && echo "doccheck: docs and code agree"
exit "$fail"
