#!/usr/bin/env bash
# Run a test command inside the Linux container, against the working tree as it stands.
#
# WHY. Windows is where this is developed and Linux is where it is graded. MSYS serialises process
# creation globally, so a full sweep there starves the machine it is running on (36m47s measured);
# the same sweep in a container is ~30s (487 cases -j6: 32·33s measured 2026-08-07 — the figure
# tracks the case count, so re-measure it here and in tests/README.md when that grows).
#
#   bash tests/in-container.sh regress                    # the whole suite against the runtime
#   bash tests/in-container.sh sh '<any shell>'           # anything else, /work is the tree
#
# The `regress-bash`, `corpus` and `build-corpus` modes went with the bash runtime in bundle
# 2026-08-05.3 — all three existed to compare two runtimes, and there is one now. The last
# comparison they produced is pinned in tests/baseline/parity-final-2026-08-05.md.
#
# ASCII ARGUMENTS ONLY. A non-ASCII argument does not survive the trip from MSYS bash into docker's
# argv — it reaches the inner command as mojibake. Measured, after exactly that produced a
# 341-of-349 red run that was entirely the invocation.
#
# The image is built once by:
#   docker build -t wd-test - <<'EOF'
#   FROM debian:stable-slim
#   RUN apt-get -qq update && apt-get -qq install -y gawk git locales nodejs >/dev/null \
#    && sed -i "s/^# *ko_KR.UTF-8/ko_KR.UTF-8/;s/^# *en_US.UTF-8/en_US.UTF-8/" /etc/locale.gen \
#    && locale-gen >/dev/null 2>&1
#   EOF
# BOTH locales must exist or pass_locales reports failures that are the image's, not the code's.
#
# The tree is mounted READ-ONLY and copied to /work inside: a test that writes cannot reach the
# working tree, and the copy makes the container's git state irrelevant.
set -u
# The MSYS spelling (/d/repo/x) with ONE extra leading slash, which is what docker on Windows via
# Git Bash wants: MSYS rewrites a lone /d/... argument into a Windows path and the extra slash stops
# it, while a `cygpath -m` spelling (D:/repo/x) is rejected outright ("too many colons").
REPO=$(cd "$(dirname "$0")/.." >/dev/null 2>&1 && pwd)
IMG=${WD_IMG:-wd-test}

mode=${1:-}; shift || true
case "$mode" in
  regress)      inner='bash tests/regress.sh '"$*" ;;
  sh)           inner="$*" ;;
  *) echo "usage: bash tests/in-container.sh {regress|sh} [args...]" >&2; exit 2 ;;
esac

# The harness's knobs ride in rather than being silently dropped at the container boundary.
ENVS=()
for v in WD_BIN WD_REG_KEY_SALT; do
  [ -n "${!v:-}" ] && ENVS+=(-e "$v=${!v}")
done

exec docker run --rm \
  "${ENVS[@]+"${ENVS[@]}"}" \
  -v "/${REPO}:/src:ro" \
  "$IMG" bash -c 'cp -r /src /work && cd /work && '"$inner"
