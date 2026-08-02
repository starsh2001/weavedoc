#!/usr/bin/env bash
# Bundle manifest — SHA-256 over every file that decides WeaveDoc behavior (WD-REL-001 scope).
# Hashes git-stored blob bytes (LF-normalized), not working-tree bytes, so the result does not
# depend on the running machine's core.autocrlf. Deterministic: same committed tree, same output.
# Usage: bash tests/make-manifest.sh   (prints manifest to stdout)
set -u
cd "$(dirname "$0")/.." || exit 2
export LC_ALL=C
git ls-files -- \
  '.weavedoc/bin/weavedoc' \
  '.weavedoc/schema' \
  '.weavedoc/READ.md' \
  '.weavedoc/FORMATS.md' \
  '.weavedoc/templates' \
  '.claude/skills/weavedoc-*' \
| sort | while IFS= read -r p; do
  h=$(git cat-file blob ":$p" | sha256sum | awk '{print $1}')
  printf '%s  %s\n' "$h" "$p"
done
