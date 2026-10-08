<!-- weavedoc:begin -->
This repo contains a WeaveDoc data mine (truths/, materials/). Before reading ANY data
from it — for any purpose, including creative work — read and follow `.weavedoc/READ.md`.
Read it fresh, never from memory: its rules have changed between schema versions, so a
remembered WeaveDoc protocol is probably an old one.
When `WEAVEDOC_ROOT` is set (a git worktree sharing the original checkout's mine), the
mine is that folder: READ.md and every mine path are under it, not the working directory.
For lookups, prefer: `node "${WEAVEDOC_ROOT:+$WEAVEDOC_ROOT/}.weavedoc/bin/weavedoc.mjs" pull <tag-or-keyword>`.
Raw originals (inbox/, materials/*/source.*) are search-shielded by the root .ignore —
they are the audit layer. Never quote them as current fact; open one only deliberately,
by path, when auditing a conversion or a retraction.
<!-- weavedoc:end -->
