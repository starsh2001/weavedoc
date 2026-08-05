#!/usr/bin/env bash
# Bundle manifest — SHA-256 over every file that decides WeaveDoc behavior (WD-REL-001 scope).
# Hashes git-stored blob bytes (LF-normalized), not working-tree bytes, so the result does not
# depend on the running machine's core.autocrlf. Deterministic: same committed tree, same output.
# Usage: bash tests/make-manifest.sh   (prints manifest to stdout)
set -u
cd "$(dirname "$0")/.." || exit 2
export LC_ALL=C
# STAGE 6: the Node runtime joins the bundle, which is a WD-REL-001 scope change and the reason
# this release is one tag rather than two. `bin/lib/` is globbed, never enumerated — a module added
# later must not be able to ship outside the manifest, which is precisely what the manifest exists
# to prevent. The bash runtime stays listed for one release: it is the parity reference the whole
# rewrite was graded against, and dropping it in the same release that promotes its replacement
# would leave nothing to compare against if a report comes in.
git ls-files -- \
  '.weavedoc/bin/weavedoc' \
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
