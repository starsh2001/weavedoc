#!/usr/bin/env bash
# Bundle manifest — SHA-256 over every file that decides WeaveDoc behavior (WD-REL-001 scope).
# Hashes git-stored blob bytes (LF-normalized), not working-tree bytes, so the result does not
# depend on the running machine's core.autocrlf. Deterministic: same committed tree, same output.
# Usage: bash tests/make-manifest.sh   (prints manifest to stdout)
set -u
cd "$(dirname "$0")/.." || exit 2
export LC_ALL=C
# `bin/lib/` is globbed, never enumerated — a module added later must not be able to ship outside
# the manifest, which is precisely what the manifest exists to prevent. The bash runtime was in
# this list for one release as the parity reference; it was deleted in bundle 2026-08-05.3 and its
# last comparison is pinned in tests/baseline/parity-final-2026-08-05.md.
git ls-files -- \
  '.weavedoc/bin/weavedoc.mjs' \
  '.weavedoc/bin/lib' \
  '.weavedoc/schema' \
  '.weavedoc/READ.md' \
  '.weavedoc/FORMATS.md' \
  '.weavedoc/templates' \
  '.claude/skills/weavedoc-*' \
| sort | while IFS= read -r p; do
  h=$(git cat-file blob ":$p" | sha256sum | awk '{print $1}')
  printf '%s  %s\n' "$h" "$p"
done
