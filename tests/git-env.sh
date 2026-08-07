#!/usr/bin/env bash
# ONE clean Git environment for every script in tests/ — sourced, never re-spelled.
#
# WHY. A script here runs git for two purposes: to read this repository (the cache key's commit and
# index, the manifest's staged blobs) and to build throwaway repositories under the workspace. Both
# break when the caller's environment already points git somewhere else, and the callers that do
# that are ordinary: every hook, `rebase --exec`, `bisect run` and `submodule foreach` export
# GIT_DIR and GIT_INDEX_FILE, and `git -c x=y` reaches subprocesses through GIT_CONFIG_PARAMETERS.
# That is exactly the "run the suite before committing" wiring.
#
# WHAT LEAKED WITHOUT IT. v0.5.16 unset three variables — GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE —
# at the four call sites it had found, and the other twelve went on leaking (external review,
# v0.5.17). Measured on v0.5.16:
#   * with an inherited GIT_OBJECT_DIRECTORY, the scratch repo the index case builds wrote 79
#     objects into an UNRELATED repository, and the case still reported PASS;
#   * with an inherited GIT_INDEX_FILE, compute_key read the default index (it unset the variable)
#     while make-manifest.sh read the alternate one (it did not) — same key, different manifest, so
#     `--resume` replays a PASS that a fresh run fails: a false green;
#   * GIT_OBJECT_DIRECTORY, GIT_COMMON_DIR and GIT_CONFIG_PARAMETERS each moved the cache key.
#
# THE FIX IS THE ENVIRONMENT, NOT THE CALL SITES. v0.5.16 fixed the two calls it could see, and the
# review found the third and fourth. Enumerating call sites is the mistake this repo has now made in
# four shapes (v0.5.13-15 chased cache-key inputs by name for three releases); a git call added
# tomorrow would be wrong again. So this file UNSETS the variables in the sourcing shell: every git
# call in the script, present and future, is clean with no per-call prefix — and no `env` process
# per call, which matters where the manifest spawns one git per file.
#
# THE LIST COMES FROM GIT. `git rev-parse --local-env-vars` prints exactly the variables that bind
# git to one repository, and it answers without a repository and under a poisoned environment (both
# checked). The hardcoded list below is the FALLBACK for a git that cannot answer at all — not a
# second spelling of the rule.
_wd_gn=0
for _wd_gv in $(git rev-parse --local-env-vars 2>/dev/null); do
  unset "$_wd_gv"
  _wd_gn=$((_wd_gn + 1))
done
if [ "$_wd_gn" -lt 8 ]; then
  # git is absent, or too old for the option. A HALF-cleaned environment is the failure mode this
  # file exists to prevent, so fall back to the whole list as git 2.x prints it rather than to the
  # three names the call sites happened to know about.
  unset GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_CONFIG GIT_CONFIG_PARAMETERS GIT_CONFIG_COUNT \
        GIT_OBJECT_DIRECTORY GIT_DIR GIT_WORK_TREE GIT_IMPLICIT_WORK_TREE GIT_GRAFT_FILE \
        GIT_INDEX_FILE GIT_NO_REPLACE_OBJECTS GIT_REPLACE_REF_BASE GIT_PREFIX GIT_SHALLOW_FILE \
        GIT_COMMON_DIR
fi
unset _wd_gv _wd_gn
# The vacuity guard, loud and once. Both branches above are meant to leave nothing behind; reaching
# here with one still set means the construction broke, and a broken cleanup does not fail — it just
# stops isolating, which looks exactly like success (the class this suite keeps a name for). These
# four are named because each has a measured consequence above, not because the rule is a list.
for _wd_gv in GIT_DIR GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR; do
  if [ -n "${!_wd_gv+set}" ]; then
    echo "tests/git-env.sh: $_wd_gv survived the cleanup — git calls would run half-isolated" >&2
    exit 2
  fi
done
unset _wd_gv
