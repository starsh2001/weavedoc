#!/usr/bin/env bash
# Bundle manifest — SHA-256 over every file that decides WeaveDoc behavior (WD-REL-001 scope).
# Hashes git-stored blob bytes (LF-normalized), not working-tree bytes, so the result does not
# depend on the running machine's core.autocrlf. Deterministic: same committed tree, same output.
# Usage: bash tests/make-manifest.sh   (prints manifest to stdout)
#
# FAIL-CLOSED (external review, v0.5.18). This script used to absorb every git failure into an empty
# manifest and exit 0 — measured: a corrupt index, a missing `.git`, and an unreadable blob each
# produced a clean rc 0, the last one recording the sha256 of EMPTY INPUT (`e3b0c442…`) as if that
# were the file. This is the release warranty; a warranty generator that reports success when it
# read nothing is the "zero checks, green" class this repo keeps a name for. Now: pipefail, every
# blob read promoted to a failure, and a required-path check that an empty manifest cannot pass.
set -u
set -o pipefail
# shellcheck source=tests/git-env.sh
. "$(dirname "$0")/git-env.sh" || { echo "tests/git-env.sh could not be sourced — refusing to hash an ambient git context" >&2; exit 2; }
cd "$(dirname "$0")/.." || exit 2
export LC_ALL=C

# DIRECTORIES, NEVER GLOBS (external review, v0.5.18). `.claude/skills/weavedoc-*` was a pathspec
# glob, and `GIT_LITERAL_PATHSPECS`/`GIT_NOGLOB_PATHSPECS`/`GIT_GLOB_PATHSPECS` — which are NOT in
# `git rev-parse --local-env-vars`, so git-env.sh's derived list did not cover them — turn it into a
# literal name that matches nothing: measured, 46 rows and `fb6a96eb…` became 36 rows and
# `09c403ef…` while the suite's cache key did not move at all, so `--resume` replayed PASSes that a
# fresh run fails. git-env.sh clears those four now as well; this list additionally stops depending
# on pathspec semantics, so the selection is the same under any of them. `bin/` is the whole tree
# for the reason the cache key hashes the whole tree: a module added later must not be able to ship
# outside the manifest, which is precisely what the manifest exists to prevent. The bash runtime was
# in this list for one release as the parity reference; it was deleted in bundle 2026-08-05.3 and
# its last comparison is pinned in tests/baseline/parity-final-2026-08-05.md.
files=$(git ls-files -- \
  '.weavedoc/VERSION' \
  '.weavedoc/.gitattributes' \
  '.weavedoc/bin' \
  '.weavedoc/schema' \
  '.weavedoc/READ.md' \
  '.weavedoc/FORMATS.md' \
  '.weavedoc/PARSER-MODEL.md' \
  '.weavedoc/templates' \
  '.claude/skills' \
| sort) || { echo "make-manifest: git ls-files failed — no manifest" >&2; exit 2; }

# The skills half of that listing is everything under .claude/skills; only this project's skills
# ship. Filtering HERE rather than in the pathspec is what removes the glob dependency above.
out=$(printf '%s\n' "$files" | while IFS= read -r p; do
  [ -n "$p" ] || continue
  case "$p" in
    .claude/skills/weavedoc-*) ;;
    .claude/skills/*) continue ;;
  esac
  h=$(git cat-file blob ":$p" | sha256sum | awk '{print $1}') || exit 3
  # A 64-hex digest or nothing: a silently empty read hashes to e3b0c442… and looks like a file.
  case "$h" in
    [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]*) [ "${#h}" -eq 64 ] || exit 3 ;;
    *) exit 3 ;;
  esac
  printf '%s  %s\n' "$h" "$p"
done) || { echo "make-manifest: a staged blob could not be read — no manifest" >&2; exit 2; }

# THE VACUITY GUARD. Every one of these exists in any tree this script is meant to describe, so a
# manifest without them was built from something else — an empty index, the wrong directory, a
# pathspec that matched nothing. Named, not counted: a threshold would drift with the file count.
# EXACT, not a prefix (external review, v0.5.21). `case "$out" in *"  $r"*)` is satisfied by any row
# whose path merely STARTS with the required one, so a tree holding `weavedoc.mjs.bak` and no
# `weavedoc.mjs` passed the guard that exists to catch exactly that. The path is the second
# whitespace-separated field of a row; compare it as a field.
for r in .weavedoc/VERSION .weavedoc/bin/weavedoc.mjs .weavedoc/schema .weavedoc/READ.md \
         .weavedoc/FORMATS.md .weavedoc/PARSER-MODEL.md .weavedoc/.gitattributes; do
  printf '%s\n' "$out" | awk -v p="$r" 'NF == 2 && $2 == p { found = 1 } END { exit !found }' \
    || { echo "make-manifest: required path missing from the manifest: $r" >&2; exit 2; }
done
printf '%s\n' "$out"
