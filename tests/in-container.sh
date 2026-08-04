#!/usr/bin/env bash
# Run a test command inside the Linux container, against the working tree as it stands.
#
# WHY. Windows is where this is developed and Linux is where it is graded. MSYS serialises process
# creation globally, so a full sweep there starves the machine it is running on (36m47s measured);
# the same sweep in a container is 31 seconds. And grading both runtimes on ONE platform removes the
# platform from the comparison — a difference the driver reports is then a difference in the port.
#
#   bash tests/in-container.sh regress                    # the 345-case suite, bash judging Node
#   bash tests/in-container.sh regress-bash               # the same suite judging bash (the baseline)
#   bash tests/in-container.sh corpus validate            # whole-output parity over the case mines
#   bash tests/in-container.sh build-corpus               # (re)harvest the case mines into $CORPUS
#   bash tests/in-container.sh sh '<any shell>'           # anything else, /work is the tree
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
CORPUS=${WD_CORPUS:-/d/wd-corpus}
IMG=${WD_IMG:-wd-test}

mode=${1:-}; shift || true
case "$mode" in
  regress)      inner='WD_BIN="node .weavedoc/bin/weavedoc.mjs" bash tests/regress.sh '"$*" ;;
  regress-bash) inner='bash tests/regress.sh '"$*" ;;
  # `$(printf '%q ' "$@")` with ZERO arguments still runs the format once and yields `'' ` — one
  # EMPTY argument. That made the driver see one command (the empty string) instead of falling back
  # to its default list, and comparing "no command" agrees trivially on both runtimes: a green run
  # that measured nothing. Only append when there is something to append.
  corpus)       inner='bash tests/parity-corpus.sh /corpus/w'
                [ "$#" -gt 0 ] && inner="$inner $(printf '%q ' "$@")" ;;
  build-corpus) inner='mkdir -p /work/rw && WD_REG_WORK=/work/rw bash tests/regress.sh '"$*"' ; echo "=== harvest ===" ; rm -rf /corpus/w /corpus/pristine && cp -r /work/rw/w /corpus/w && cp -r /work/rw/pristine /corpus/pristine && ls /corpus/w | wc -l' ;;
  sh)           inner="$*" ;;
  *) echo "usage: bash tests/in-container.sh {regress|regress-bash|corpus|build-corpus|sh} [args...]" >&2; exit 2 ;;
esac

mkdir -p "$CORPUS"
# build-corpus is the one mode that writes to the corpus mount; everything else gets it read-only.
case "$mode" in build-corpus) CMNT="/${CORPUS}:/corpus" ;; *) CMNT="/${CORPUS}:/corpus:ro" ;; esac

# The driver's knobs ride in, or `WD_PC_ONLY=x bash tests/in-container.sh corpus …` silently grades
# the whole corpus and the caller reads someone else's 300 mines as the answer to their one.
ENVS=()
for v in WD_PC_ONLY WD_PC_CTX WD_PC_MAXDIFF WD_BASH_BIN WD_NODE_BIN; do
  [ -n "${!v:-}" ] && ENVS+=(-e "$v=${!v}")
done

exec docker run --rm \
  "${ENVS[@]+"${ENVS[@]}"}" \
  -v "/${REPO}:/src:ro" \
  -v "${CMNT}" \
  "$IMG" bash -c 'cp -r /src /work && cd /work && '"$inner"
