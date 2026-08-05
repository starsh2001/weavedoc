#!/usr/bin/env bash
# Release notes, generated — never hand-written (Phase 5 unit 13, WD-DOC-001/REL-001).
# The v0.2.0 tag listed six commands as "new" that v0.1.0 already had; a hand-written list can
# say anything. This one is derived: the "new commands" section is the DIFF of the two dispatch
# tables, the numbers come from the tracked suite, and the manifest digest is computed here.
#
#   bash tests/release-notes.sh <prev-tag> <this-tag-or-ref>
set -u
REPO=$(cd "$(dirname "$0")/.." >/dev/null 2>&1 && pwd)
PREV=${1:?usage: release-notes.sh <prev-tag> <this-tag>}
THIS=${2:?usage: release-notes.sh <prev-tag> <this-tag>}
cd "$REPO"

bundle=$(cat .weavedoc/VERSION)
prevbundle=$(git show "$PREV:.weavedoc/VERSION" 2>/dev/null | head -1)
schema=$(grep -m1 '^schema.version:' .weavedoc/schema | sed 's/.*:[[:space:]]*//')
manifest_sha=$(bash tests/make-manifest.sh | sha256sum | awk '{print $1}')
cases=$(grep -cE '^(block|pass|acct|meta|e2e)_[a-z0-9_]*\(\)' tests/regress.sh)

# The "new commands" list is the DISPATCH DIFF, never hand-written (the v0.2.0 tag hand-listed six
# commands its predecessor already had). Reads the Node entrypoint's `case 'name':` — the bash
# spelling it replaces (`  name)` inside a case/esac) went with that runtime in bundle 2026-08-05.3.
# A tag older than the Node runtime yields an empty previous side, which reads every command as new;
# that is honest for the tag that introduced the runtime and cannot recur.
dispatch() { grep -oE "^  case '[a-z-]+':" | sed -E "s/.*'([a-z-]+)'.*/\1/" | LC_ALL=C sort -u; }
newcmds=$(comm -13 <(git show "$PREV:.weavedoc/bin/weavedoc.mjs" 2>/dev/null | dispatch) \
                   <(dispatch < .weavedoc/bin/weavedoc.mjs) | tr '\n' ' ')

printf '# WeaveDoc %s\n\n' "$THIS"
printf -- '- **runtime bundle**: `%s` (previous tag: `%s` = bundle `%s`)\n' "$bundle" "$PREV" "${prevbundle:-?}"
printf -- '- **artifact schema**: `%s`\n' "$schema"
printf -- '- **bundle manifest sha256**: `%s` — every behavior-deciding file (bin · schema · templates · READ · FORMATS · skills), hashed from git blob bytes; the attached `bundle.manifest` lists them\n' "$manifest_sha"
printf -- '- **regression suite**: %s cases, tracked in `tests/` — the tallies for THIS tag are in this workflow'"'"'s regression jobs (Ubuntu, Windows and macOS, all three required)\n' "$cases"
if [ -n "${newcmds% }" ]; then
  printf -- '- **new commands since %s** *(generated from the dispatch diff — mechanically true)*: %s\n' "$PREV" "$newcmds"
else
  printf -- '- **new commands since %s**: none\n' "$PREV"
fi
printf '\n## Changes since %s (from CHANGELOG, newest first)\n\n' "$PREV"
if [ -n "${prevbundle:-}" ]; then
  awk -v stop="## $prevbundle" 'BEGIN { go = 0 } $0 == stop { exit } /^## / { go = 1 } go { print }' CHANGELOG.md
else
  echo "(previous bundle unknown — see CHANGELOG.md)"
fi
