#!/usr/bin/env bash
# Command-level parity for WRITE commands: run the SAME sequence under both runtimes, from the SAME
# starting mine, and compare stdout, exit codes, AND the bytes each one left on disk.
#
# WHY THIS IS SEPARATE FROM parity.sh. parity.sh runs a command twice against one directory, which is
# sound only while the command reads. A write command's second run sees the first run's output, so
# comparing them measures nothing. And stdout parity alone is the wrong scale here anyway: attest's
# whole job is a row in a file, retag's is a rewritten list. A write command that printed the right
# sentence and wrote the wrong bytes would pass a stdout-only check — which is the exact failure this
# stage has to catch, so the on-disk result is compared too.
#
#   bash tests/parity-write.sh <template-mine> <command>...
#   bash tests/parity-write.sh /tmp/wk/pristine "attest verified 2 standard m001 t001" scope
#
# The commands run as a SEQUENCE on one scratch copy (so `attest …` then `scope` measures what the
# write did downstream, not just what it printed). Each command's stdout and exit code go into a
# transcript; the transcript is compared line for line and the resulting trees file for file.
#
# The template is never touched — every run works on a throwaway copy at a FIXED path, so the two
# runtimes see identical absolute paths and a path difference in the output is a real difference.
set -u
REPO=$(cd "$(dirname "$0")/.." >/dev/null 2>&1 && pwd)
BASH_BIN=${WD_BASH_BIN:-".weavedoc/bin/weavedoc"}
NODE_BIN=${WD_NODE_BIN:-".weavedoc/bin/weavedoc.mjs"}

TEMPLATE=${1:-}
[ -n "$TEMPLATE" ] || { echo "usage: bash tests/parity-write.sh <template-mine> <command>..." >&2; exit 2; }
shift
[ $# -gt 0 ] || { echo "usage: bash tests/parity-write.sh <template-mine> <command>..." >&2; exit 2; }
[ -d "$TEMPLATE" ] || { echo "parity-write: no such template mine: $TEMPLATE" >&2; exit 2; }
TEMPLATE=$(cd "$TEMPLATE" >/dev/null 2>&1 && pwd)

WORK=$(mktemp -d "${TMPDIR:-/tmp}/wd-pw.XXXXXX")
SCRATCH="$WORK/mine"
KEEP=${WD_PW_KEEP:-}
trap '[ -n "$KEEP" ] || rm -rf "$WORK"' EXIT

# Same declared divergences as parity.sh — announced on every run, never silently forgiven.
# 1. `version`'s fingerprint hashes the runtime's own bytes, so two runtimes MUST differ there.
# 2. The mine root: MSYS bash spells it /tmp/x, native Node spells it C:/…/tmp/x. One directory,
#    two spellings. Folding it keeps everything else comparable; it does not settle REWRITE_PLAN §4.
SCRATCH_WIN=$(cygpath -m "$SCRATCH" 2>/dev/null || printf '%s' "$SCRATCH")
SCRATCH_WINL=$(cygpath -ml "$SCRATCH" 2>/dev/null || printf '%s' "$SCRATCH_WIN")
# 3. `upgrade --apply` names its backup directory `.upgrade-backup-<date>.<PID>`. Two runs are two
#    processes, so the suffix ALWAYS differs — verified by running bash against BASH, which reports
#    the same divergence and nothing else. Folding it is not forgiving a port difference; leaving it
#    would make this command permanently red and train the reader to skim past red.
normalise() { sed -E -e 's/^fingerprint: [0-9a-f]+ /fingerprint: <RUNTIME-SPECIFIC> /' \
                     -e 's/"fingerprint":"[0-9a-f]*"/"fingerprint":"<RUNTIME-SPECIFIC>"/' \
                     -e 's/(\.upgrade-backup-[0-9]{4}-[0-9]{2}-[0-9]{2})\.[0-9]+/\1.<PID>/g' \
                     -e "s|$SCRATCH_WINL|<MINE>|g" -e "s|$SCRATCH_WIN|<MINE>|g" -e "s|$SCRATCH|<MINE>|g"; }

# The tree as bytes: every file's path and sha256, sorted. Computed with one sha256sum process for
# the whole tree — a per-file fork costs minutes on MSYS over a real mine.
# Temp files the runtimes stage and rename are gone by the time this runs; anything still here that
# looks like one is a leak, and showing it is the point.
snapshot() {
  # The backup directory's PID suffix is folded in the PATH column for the same reason it is folded
  # in the transcript: two runs are two processes. Its CONTENTS are still compared, so a difference
  # in WHAT was backed up is still caught — only the directory's name is normalised.
  ( cd "$1" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum 2>/dev/null \
      | sed -E 's|^([0-9a-f]+) [ *]| \1  |; s|(\.upgrade-backup-[0-9]{4}-[0-9]{2}-[0-9]{2})\.[0-9]+|\1.<PID>|g' ) | LC_ALL=C sort -k2
}

# Run the whole sequence on a fresh copy of the template and leave the tree at $2 for diffing.
run_side() { # $1=invocation prefix (argv, space-separated on purpose) $2=where to park the tree
  rm -rf "$SCRATCH"; mkdir -p "$SCRATCH"
  cp -r "$TEMPLATE"/. "$SCRATCH"/
  local c rc
  for c in "${CMDS[@]}"; do
    printf '$ weavedoc %s\n' "$c"
    # shellcheck disable=SC2086 — both the prefix and the command are argv given as words
    ( cd "$SCRATCH" && $1 $c ) 2>/dev/null | normalise
    rc=${PIPESTATUS[0]}
    printf '[rc %s]\n' "$rc"
  done
  rm -rf "$2"; mv "$SCRATCH" "$2"
}

CMDS=("$@")
echo "parity-write — template: $TEMPLATE"
echo "  scratch: $SCRATCH"
echo "  bash: $BASH_BIN"
echo "  node: $NODE_BIN"
echo "  normalised (declared divergence): the version fingerprint · the mine root spelling"
echo "  commands (run as one sequence):"
for c in "${CMDS[@]}"; do echo "    weavedoc $c"; done
echo

run_side "bash $REPO/$BASH_BIN" "$WORK/after-bash" > "$WORK/t.bash"
run_side "node $REPO/$NODE_BIN" "$WORK/after-node" > "$WORK/t.node"
( cd "$WORK/after-bash" && snapshot . ) > "$WORK/s.bash"
( cd "$WORK/after-node" && snapshot . ) > "$WORK/s.node"

fail=0
if diff -u "$WORK/t.bash" "$WORK/t.node" > "$WORK/d.t"; then
  echo "  TRANSCRIPT  agree — stdout bytes and exit codes identical"
else
  fail=1
  echo "  TRANSCRIPT  DIFFER (bash left, node right):"
  sed -n '1,60p' "$WORK/d.t" | sed 's/^/      /'
fi

if diff -u "$WORK/s.bash" "$WORK/s.node" > "$WORK/d.s"; then
  echo "  TREE        agree — $(grep -c . "$WORK/s.bash") file(s), byte-identical"
else
  fail=1
  echo "  TREE        DIFFER:"
  sed -n '1,40p' "$WORK/d.s" | sed 's/^/      /'
  # A digest line says WHICH file, never WHAT changed. Diff the differing files themselves — that
  # is the line the port is actually wrong about.
  awk '/^[-+] / { print $NF }' "$WORK/d.s" | LC_ALL=C sort -u | while IFS= read -r f; do
    [ -n "$f" ] || continue
    echo "      --- $f"
    diff -u "$WORK/after-bash/$f" "$WORK/after-node/$f" 2>&1 | sed -n '3,30p' | sed 's/^/        /'
  done
fi

echo
if [ "$fail" -eq 0 ]; then echo "parity-write: the two runtimes agree on stdout, exit codes and disk"
else echo "parity-write: DIVERGENCE — see above"; fi
[ -n "$KEEP" ] && echo "  kept: $WORK"
exit "$fail"
