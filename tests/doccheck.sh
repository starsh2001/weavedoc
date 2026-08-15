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

# 6. The bar-crossing reset rule is one contract with five owners. The rule ("a ticket-downgrade
# that crosses the blocking bar leaves the round not clean", bundle 2026-08-08.16) lives in the
# engine and the two SKILLs that OPERATE the convergence count — and in the two documents that
# DESCRIBE that count (FORMATS' verify.md field contract, the shipped review.md template comment),
# which is exactly where .17 found it missing after .16 synced only the operating owners. A cold
# session resumes a loop from whichever document it opens first, so one describer still saying
# "resets only on a failing round" un-teaches the rule (the two-documents-two-answers class, twice
# in two days across .15–.17; the census that closed .17 was manual and one-shot — this makes it
# standing). Same honesty as check 5: a TEXT check — it proves the sentence is present in all five
# places, never that a reader follows it. The token is the rule's own vocabulary; renaming the
# concept legitimately moves this list too. No extraction step, so no separate vacuity guard: a
# missing file fails grep the same as a missing sentence.
for f in \
  ".claude/skills/weavedoc-review/references/reviewers.md" \
  ".claude/skills/weavedoc-review/SKILL.md" \
  ".claude/skills/weavedoc-verify/SKILL.md" \
  ".weavedoc/FORMATS.md" \
  ".weavedoc/templates/review.md"; do
  grep -qE 'bar-cross|crosses the blocking bar' "$REPO/$f" \
    || say "the bar-crossing reset rule is missing from $f — five owners share this contract (engine, both counting SKILLs, FORMATS field contract, review template); one silent absence re-opens the two-documents-two-answers split (.15-.17)"
done

# 7. The tag discipline is map's to carry — four sentences, text-checked (acceptance test 19 of
# the v3 plan). Same honesty as checks 5 and 6: a TEXT check proves the sentence a follower would
# read is present, never that it is followed — skills cannot be executed, so the sentence's
# presence IS the whole mechanical purchase available. The tokens are the rules' own vocabulary
# (§3: read tree.md's list first · reuse similar tags · ask when ambiguous · re-check on edit);
# rewording the discipline legitimately moves this list too. No extraction step, so no separate
# vacuity guard: a missing file fails grep the same as a missing sentence.
map="$REPO/.claude/skills/weavedoc-map/SKILL.md"
for s in \
  "read the existing tag list first" \
  "Reuse similar tags" \
  "tag choice is ambiguous, ask the user" \
  "re-check that its tags still fit"; do
  grep -qF "$s" "$map" || say "map's tag discipline lost a rule: '$s' — the tag vocabulary is the machine's whole search net (§3), and this text check is acceptance test 19's teeth"
done

# 8. The CLAUDE.md pointer block has ONE copy, it is a pointer, and the command it names exists.
# The block is planted by init into a downstream project's CLAUDE.md, where it is injected into
# every session BEFORE any file is read — so a wrong line there does not just mislead, it primes.
# Measured (eclypse, 2026-08-13): the block still said "(status filtering, as_of, provenance)" after
# migration had moved READ.md and 271 cards to v3, and it told the reader to run a bash script that
# had been deleted three months earlier. Both survived because the text lived only in SKILL.md prose
# and nothing compared it to anything. Now the bundle ships the block as a file and `validate`
# byte-compares it; these are the checks a shipped FILE makes possible.
blk="$REPO/.weavedoc/templates/claude-block.md"
if [ ! -f "$blk" ]; then
  say "the shipped CLAUDE.md block ($blk) is missing — validate's CLAUDE-BLOCK-STALE check has no other half and every planted block goes unchecked"
else
  grep -q '<!-- weavedoc:begin -->' "$blk" || say "the shipped CLAUDE.md block has no begin marker — init copies this file verbatim, so the markers must be IN it"
  grep -q '<!-- weavedoc:end -->' "$blk"   || say "the shipped CLAUDE.md block has no end marker — init copies this file verbatim, so the markers must be IN it"
  grep -qF '.weavedoc/READ.md' "$blk"      || say "the shipped CLAUDE.md block no longer names .weavedoc/READ.md — a pointer that points nowhere is the whole artifact gone"
  # A TEXT check, and named as one (same honesty as checks 5-7): it cannot prove the block avoids
  # every summary, only that it has stopped carrying the ONE piece of versioned vocabulary that
  # caused the incident. `status` is the v2 card axis v3 deleted; a block that mentions it is
  # describing READ.md's contents rather than pointing at them.
  grep -q 'status' "$blk" && say "the shipped CLAUDE.md block names 'status' — the block is a POINTER and may not restate READ.md's rules; a summary in CLAUDE.md is read before the file it summarises and wins against it"
fi
grep -qF 'claude-block.md' "$init" || say "weavedoc-init no longer points at .weavedoc/templates/claude-block.md — the block would be retyped from prose again, which is how it drifted out of the schema's vocabulary the first time"

# 9. No live surface spells the runtime as an executable that does not exist. The bash entrypoint
# `.weavedoc/bin/weavedoc` was deleted in bundle 2026-08-05.3; every call is `node …weavedoc.mjs`.
# Matched with a trailing space, which is what makes it a COMMAND — README's prose mentions the
# deleted file by name (`.weavedoc/bin/weavedoc`, backtick-closed) as history and must stay legal.
# notes/ and CHANGELOG.md are excluded on purpose: they record runs that really did use bash, and
# rewriting a measurement to satisfy a grep is falsifying the record.
stale_cmd=$(grep -rnE '\.weavedoc/bin/weavedoc[[:space:]]' \
  "$REPO/.weavedoc" "$REPO/.claude/skills" \
  "$REPO/README.md" "$REPO/WORKFLOW.md" "$REPO/METHODOLOGY.md" "$REPO/UPGRADING.md" 2>/dev/null || true)
[ -z "$stale_cmd" ] || say "a live surface invokes the deleted bash entrypoint (it is 'node .weavedoc/bin/weavedoc.mjs <cmd>'): $stale_cmd"

# 3. The VERSION label and CHANGELOG's newest entry are one fact.
v=$(cat "$REPO/.weavedoc/VERSION" 2>/dev/null)
top=$(grep -m1 '^## ' "$REPO/CHANGELOG.md" | sed 's/^## *//')
[ "$v" = "$top" ] || say "VERSION ($v) != CHANGELOG top entry ($top)"

[ "$fail" -eq 0 ] && echo "doccheck: docs and code agree"
exit "$fail"
