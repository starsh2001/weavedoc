#!/usr/bin/env bash
# Bundle manifest — SHA-256 over every file that decides WeaveDoc behavior (WD-REL-001 scope).
# Hashes git-stored blob bytes (LF-normalized), not working-tree bytes, so the result does not
# depend on the running machine's core.autocrlf. Deterministic: same committed tree, same output.
# Usage: bash tests/make-manifest.sh   (prints manifest to stdout)
set -u
# shellcheck source=tests/git-env.sh
. "$(dirname "$0")/git-env.sh" || { echo "tests/git-env.sh could not be sourced — refusing to hash an ambient git context" >&2; exit 2; }
cd "$(dirname "$0")/.." || exit 2
export LC_ALL=C
# `bin/lib/` is globbed, never enumerated — a module added later must not be able to ship outside
# the manifest, which is precisely what the manifest exists to prevent. The bash runtime was in
# this list for one release as the parity reference; it was deleted in bundle 2026-08-05.3 and its
# last comparison is pinned in tests/baseline/parity-final-2026-08-05.md.
#
# BOTH CALLS RUN IN A CLEANED ENVIRONMENT (external review, v0.5.17). This script used to run git
# with whatever it inherited, while regress.sh's key unset GIT_INDEX_FILE — so under a hook (which
# exports it) the key described the default index and this manifest described the alternate one.
# Same key, different manifest: `--resume` replays a PASS that a fresh run fails. Measured on
# v0.5.16 — and this script is also the release artifact, where an ambient index signs wrong bytes.
git ls-files -- \
  '.weavedoc/VERSION' \
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
