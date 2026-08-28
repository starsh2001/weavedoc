#!/usr/bin/env bash
# Docs ↔ code consistency (Phase 5, WD-DOC-001 완료 조건: 문서에 기재된 명령이 자동 검사된다).
# Runs as the suite's meta_doc_sync case and stays green only while three surfaces agree:
# dispatch ↔ README ↔ the bin header comment, and VERSION ↔ CHANGELOG's top section.
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

# 8b. The hooks template is the pointer block's twin — the second planted artifact the bundle checks.
# Same three pins: the template FILE exists (HOOKS-STALE has no other half without it), init names it
# (or the entries get retyped from prose, which is how the CLAUDE block drifted the first time), and
# the template carries the marker substring init identifies our entries by — an entry without it can
# never be recognised as ours, so it would survive every upgrade unreplaced.
hjson="$REPO/.weavedoc/templates/hooks.json"
if [ ! -f "$hjson" ]; then
  say "the shipped hooks template ($hjson) is missing — validate's HOOKS-STALE check has no other half, and every planted gate goes unchecked"
else
  grep -qF '.weavedoc/bin/hooks/' "$hjson" \
    || say "the hooks template carries no '.weavedoc/bin/hooks/' marker — init and validate both identify our entries by that substring, so these could never be recognised as ours nor replaced on upgrade"
fi
grep -qF 'hooks.json' "$init" \
  || say "weavedoc-init no longer points at .weavedoc/templates/hooks.json — the hook entries would be retyped from prose, which is the drift this pin exists to stop"

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

# 10. The step report has ONE owner and every skill points at it. The report is the surface a human
# reads to decide what happens next, and before it was fixed each skill improvised its own opening
# and closing — so the user re-learned the shape every run (measured in the sibling project
# GroveSpec, whose skeleton this mirrors). A shape that only SOME skills carry is worse than none:
# the reader cannot tell a skill with nothing open from a skill that never had the slot. Hence both
# directions — the contract exists in FORMATS, and no skill is missing its pointer. Same honesty as
# checks 5-7: a TEXT check. It proves the sentence a follower would read is present, never that the
# run obeyed it — skills are not executable, so presence is the whole mechanical purchase there is.
# VACUITY GUARD on the skill enumeration: an empty glob would run this loop zero times and print
# agreement over nine unchecked files.
grep -q '^## The step report' "$REPO/.weavedoc/FORMATS.md" \
  || say "FORMATS.md has no '## The step report' section — the nine skills point at a contract that is not there"
skills=$(ls -d "$REPO"/.claude/skills/weavedoc-*/ 2>/dev/null)
ns=$(printf '%s\n' "$skills" | grep -c . || true)
[ "${ns:-0}" -ge 9 ] || say "skill enumeration found only ${ns:-0} skill(s) — the glob is broken, not the docs"
for s in $skills; do
  grep -qF 'The step report' "$s/SKILL.md" \
    || say "$(basename "$s") does not point at the step report contract — its run would open and close in a shape of its own, which is the drift FORMATS' skeleton exists to end"
  grep -qE '\[weavedoc-[a-z]+( <[a-z-]+>| [a-z]+)?\] starting' "$s/SKILL.md" \
    || say "$(basename "$s") never spells its own '[weavedoc-… ] starting' anchor — the anchor is per-skill and cannot be inherited from the contract"
done

# 3. VERSION and CHANGELOG's newest entry are one fact. VERSION is SemVer now and moves every
# bundle (patch bump), so it IS the section heading. The git tag follows it too — the release job
# refuses to publish a tag that disagrees.
rv=$(tr -d ' \r\n' < "$REPO/.weavedoc/VERSION" 2>/dev/null)
top=$(grep -m1 '^## ' "$REPO/CHANGELOG.md" | sed 's/^## *//')
[ "$rv" = "$top" ] || say "VERSION ($rv) != CHANGELOG top entry ($top)"
printf '%s\n' "$rv" | grep -qE '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' \
  || say "VERSION ('$rv') is not MAJOR.MINOR.PATCH — the date-stamp era is over"

# 11. The skill-handoff rule is ONE block with NINE copies, byte-identical — like "One writer per
# mine" before it. A DRIFTED copy is worse than a missing one: the reader of the drifted file learns
# a different rule and can cite the file to prove it. Shape borrowed from check 10 (its $skills
# enumeration and >=9 vacuity guard already ran above), plus a byte-compare: the block is extracted
# from its opening line through the contiguous '>' lines and every copy compared to the first.
# TEXT, never obedience — the same honesty checks 5-7 state about themselves.
# VACUITY GUARD: if no file carried the block, g4ref stays empty and the last line fails; an empty
# extraction must not read as nine agreeing copies.
g4ref=""; g4refname=""
for s in $skills; do
  g4blk=$(awk '/^> \*\*The work.s owner is the skill/{f=1} f{ if ($0 ~ /^>/) print; else exit }' "$s/SKILL.md")
  if [ -z "$g4blk" ]; then
    say "$(basename "$s") is missing the skill-handoff block — the rule has nine owners and this one dropped it"
    continue
  fi
  if [ -z "$g4ref" ]; then g4ref="$g4blk"; g4refname=$(basename "$s")
  elif [ "$g4blk" != "$g4ref" ]; then
    say "$(basename "$s")'s skill-handoff block differs from $g4refname's — nine byte-identical copies is the contract, and this copy has drifted"
  fi
done
[ -n "$g4ref" ] || say "no skill carries the skill-handoff block at all — nine missing copies must not read as nine agreeing ones"

# 12. The ratified-summary principle is ONE rule with THREE owners — gather writes the
# `[기계 제안값]` mark into the ratified original, map reads it back as `adopted`, FORMATS defines it
# in the body contract (ruled 2026-08-28: the owner replaced raw-exchange snapshots with
# user-ratified summaries as gather's base behavior for conversation sources). A rule taught to one
# consumer is the defect class this repo keeps re-erasing ("two spellings of one question" —
# 0.6.8's correctsRefs), and the mark is exactly the vocabulary that drifts: it lives in prose,
# nothing executes it, and a copy that loses it silently re-teaches the old behavior. Same honesty
# as checks 5-7: a TEXT check — it proves the sentence a follower would read is present, never that
# it is followed. The tokens are the rules' own vocabulary; rewording the principle legitimately
# moves this list too. No extraction step, so no separate vacuity guard: a missing file fails grep
# the same as a missing sentence.
gat="$REPO/.claude/skills/weavedoc-gather/SKILL.md"
for f in "$gat" "$map" "$REPO/.weavedoc/FORMATS.md"; do
  grep -qF '[기계 제안값]' "$f" \
    || say "$(basename "$(dirname "$f")")/$(basename "$f") lost the '[기계 제안값]' mark — the ratified-summary rule has three owners (gather writes it, map reads it, FORMATS defines it) and this copy dropped the shared vocabulary"
done
for s in \
  "never register the user's utterances as they arrive" \
  "the ratified summary IS the original" \
  "이대로 원본으로 올려도 됩니까" \
  "so the user signs it knowingly" \
  'ratification makes every sentence `stated`' \
  "the intake note is where the approving utterance becomes a record" \
  "This section governs new registrations only"; do
  grep -qF "$s" "$gat" \
    || say "gather's ratified-summary rule lost a spine sentence: '$s' — conversation intake's base behavior (ruled 2026-08-28) is carried by these sentences and nothing else"
done
grep -qF 'the marked value reads as `adopted`' "$map" \
  || say "map no longer reads the ratified mark as adopted — the reading half of the rule is gone, so a marked machine proposal would land as stated"
grep -qF 'provenance annotation, not content' "$REPO/.weavedoc/FORMATS.md" \
  || say "FORMATS no longer says the mark is annotation-not-content — a claim could carry the mark as if it were part of the fact"

# 13. The verify cycle (collect → triage → repair → prove) is ONE redesign carried by three files —
# the cycle itself in weavedoc-verify, the defender's closing/priority rules in reviewers.md, and
# the relocated counter semantics in FORMATS' field contract. The redesign moved the consecutive-
# clean gate to the repair-proof phase because a real cycle measured 11 of 19 blocking findings
# born in repairs; a copy that silently reverts to the alternating loop re-opens exactly that. The
# repair protocol's fourth clause is pinned INCLUDING its unmeasured-option admission — the spec
# marking its own inference as unmeasured is content, and losing the mark quietly upgrades an
# inference to doctrine. Same honesty as checks 5-7: a TEXT check — it proves the sentence a
# follower would read is present, never that a cycle obeyed it. The tokens are the rules' own
# vocabulary; rewording the redesign legitimately moves this list too. No extraction step, so no
# separate vacuity guard: a missing file fails grep the same as a missing sentence.
vfy="$REPO/.claude/skills/weavedoc-verify/SKILL.md"
rev="$REPO/.claude/skills/weavedoc-review/references/reviewers.md"
for s in \
  "then prove the repair" \
  "Collect — no fixes" \
  "nothing new twice in a row" \
  "Triage once, with the full set" \
  "Repair once per class" \
  'Prove the repair — `repeat` lives here' \
  "never where to stop reading" \
  "Subtract first" \
  "an unmeasured option, and stated as one" \
  "meaning relocated" \
  "about the TAG, not about the entry"; do
  grep -qF "$s" "$vfy" \
    || say "verify's One cycle lost a spine sentence: '$s' — the collect→triage→repair→prove order and its gates (owner-initiated 2026-08-28) are carried by these sentences and nothing else"
done
for s in \
  "closable — but only when the showing is complete" \
  "with its non-zero count" \
  "never outranks a spec rule that leaves no discretion" \
  "hands off a found-list, not classifications"; do
  grep -qF "$s" "$rev" \
    || say "reviewers.md lost a triage-authority sentence: '$s' — the evidence-bar closes and the collection hand-off exception are the engine's half of the cycle redesign"
done
grep -qF 'repair-proof phase' "$REPO/.weavedoc/FORMATS.md" \
  || say "FORMATS no longer says repeat is counted in the repair-proof phase — the field contract would describe the retired alternating loop"

# 14. The authority axis has NINE owners and one shared opening, byte-identical — the shape check 11
# uses for the skill-handoff block, for the same reason: a drifted copy teaches a different rule AND
# can be cited to prove it. What must not drift is the READ rule (which key, which file, absence =
# standard, the document override's scope) and the FALLBACK (an unnamed decision goes to the user);
# each skill's own ROW is per-skill by design and is not compared. A skill missing the section
# entirely would silently run at whatever level its author assumed, which is the state this axis
# exists to end. TEXT, never obedience — the honesty checks 5-7 state about themselves.
# VACUITY GUARD: $skills and its >=9 floor already ran in check 10; g14ref empty fails the last line,
# so an extraction that found nothing cannot read as nine agreeing copies.
g14ref=""; g14refname=""
for s in $skills; do
  g14blk=$(awk '/^## Authority — who decides, at this mine.s level$/{f=1;next} f{ if ($0 ~ /^\*\*This skill.s row/) exit; if ($0 != "") print }' "$s/SKILL.md")
  if [ -z "$g14blk" ]; then
    say "$(basename "$s") has no '## Authority' section (or no shared opening before its row) — the axis has nine owners and this one would run at whatever level its reader assumes"
    continue
  fi
  if [ -z "$g14ref" ]; then g14ref="$g14blk"; g14refname=$(basename "$s")
  elif [ "$g14blk" != "$g14ref" ]; then
    say "$(basename "$s")'s Authority opening differs from $g14refname's — nine byte-identical copies is the contract (which key, absence = standard, the override's scope, the fallback), and this copy has drifted"
  fi
done
[ -n "$g14ref" ] || say "no skill carries the Authority opening at all — nine missing copies must not read as nine agreeing ones"
# The three level words are the axis's vocabulary and must be the schema's own, in every direction:
# a skill offering a level `validate` rejects, or a schema value no skill has a row for, is the same
# split this repo keeps closing between a questionnaire and its validator.
for lv in strict standard delegated; do
  grep -qE "^config\.enum\.authority_level:.*\b$lv\b" "$REPO/.weavedoc/schema" \
    || say "the schema's config.enum.authority_level does not offer '$lv' — the skills carry a row for a level validate would reject"
done
grep -qF 'authority_level' "$REPO/.weavedoc/templates/config.yaml" \
  || say "the shipped config template no longer carries authority_level — a fresh mine would be born without the axis while every skill reads it"
grep -qF 'authority_level' "$REPO/.weavedoc/templates/plan.md" \
  || say "the shipped plan template no longer carries the authority_level override — plan is told to elicit a field the template never shows"
# The id ruling (2026-08-28) and the audit-layer reading rule, one pin each: both are output/lookup
# disciplines with no mechanical enforcement anywhere, so the sentence IS the whole artifact.
grep -qF 'an id is a machine handle' "$gat" \
  || say "the 'surface it in words, not by id' rule is gone from gather — a handoff keyed by ids is a list the user must open files to read"
grep -qF 'The audit layer is wider than the raw one' "$REPO/.weavedoc/READ.md" \
  || say "READ.md no longer widens the audit layer past the raw one — changelog and the ledgers would read as ordinary lookup surface, which is how a thousand-line record floods a judgment"

[ "$fail" -eq 0 ] && echo "doccheck: docs and code agree"
exit "$fail"
