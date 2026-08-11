# tests/ — 추적되는 회귀 suite

[IMPROVEMENT_PLAN.md](../IMPROVEMENT_PLAN.md) Phase 0에서 이관, Phase 2에서 격리·CI 완성. 원본은 gitignore된 `notes/`의 개발 suite였다 (byte-identical 이관, bundle `2026-08-02.2` 기준 — 이후 케이스는 각 작업 단위가 추가).

## 실행

```bash
bash tests/regress.sh            # 전체 케이스 (병렬 -j6)
bash tests/regress.sh gate       # 이름에 "gate"가 들어간 케이스만
bash tests/regress.sh --resume   # 같은 구성의 이전 결과 재사용, 남은 것만
bash tests/regress.sh --one NAME # 케이스 하나, 출력 인라인 (pristine 자동 생성)
#   ↑ 결과를 찍은 뒤 KEY seal도 건다: 실행 중 트리가 바뀌면 케이스가 PASS여도 rc 2로 끝난다
#     (키를 한 번 더 계산하므로 케이스당 ~40% 느리다)
```

기본 러너는 **배포되는 런타임**(`node .weavedoc/bin/weavedoc.mjs`)이다. bash 판이 함께 배포되던 동안 기본값이 그쪽이어서 **로컬에서 그냥 돌리면 제품이 아니라 기준을 채점**하고 있었다(v0.4.0 외부 리뷰 지적, 번들 2026-08-05.3에서 수정). 다른 대상을 채점하려면 `WD_BIN="<인터프리터> <진입점>"`.

MSYS는 프로세스 생성을 전역 직렬화한다 — Windows에서 이 suite가 느린 이유는 런타임(Node)이 아니라 **프로세스를 몇 번 띄우느냐**다. 실측(2026-08-07; 케이스당은 v0.5.12 시점 직렬 측정, sweep은 507케이스 -j6 실측):

| | 케이스당 | 전체 sweep |
|---|---|---|
| Windows 네이티브 (v0.5.11까지) | 5.2s | **30분+** |
| Windows 네이티브 (현재) | 1.76s | **4분 29초** |
| Linux 컨테이너 | — | **33초** |

**케이스당 남은 1.76s는 픽스처 복사 706ms + CLI 1회 833ms**가 거의 전부다(50개 파일 복사와 black-box 실행 — 둘 다 설계상 줄일 수 없다). 케이스당 수치는 직렬 측정이고 sweep 열은 `-j6` 실측이라 단순 곱셈으로는 맞지 않는다. 그 위에 있던 3.4s는 케이스마다 **캐시 KEY를 다시 계산하고**(git·find·sha256sum·각종 `--version` 등 ~25개 프로세스) **bash를 새로 띄워 이 스크립트를 다시 파싱**한 비용이었고, v0.5.12에서 없앴다: 드라이버가 `WD_REG_RES`/`WD_REG_KEY`를 물려주고 `--batch`로 워커 하나가 8케이스를 처리한다. 기각된 대안도 실측으로 적어 둔다 — **robocopy는 `cp -r`보다 느렸고**(828ms vs 639ms), **`-j`를 12로 올려도 이득이 없었다**(436→416s, 게다가 잠금 타이밍 케이스가 흔들린다 — 변경 전 하네스도 동일하게 흔들렸다).

여전히 **컨테이너가 8배 빠르므로 태그 전 검증은 컨테이너로 한다**:

```bash
bash tests/in-container.sh regress          # 전체 suite
bash tests/in-container.sh sh '<셸 명령>'    # 그 외, /work가 트리
```

## 격리 모델 (Phase 2, WD-QA-002)

- **픽스처**: 실행마다 `mktemp -d` workspace — trap으로 종료 시 제거. 병렬/중복 실행이 충돌할 수 없고, 중단돼도 workspace가 남지 않는다.
- **결과 캐시**: `$TMPDIR/wd-reg-<key>/res` — key는 `compute_key()`가 이 순서로 해시한다 — **commit · `.weavedoc/VERSION` · WD_BIN · schema · `.weavedoc/schemas` 트리 전체 · `.weavedoc/bin` 트리 전체 · `$WD_ENTRY` · `tests/**`의 `*.sh`+`*.mjs`(baseline 제외) · README·CHANGELOG·FORMATS · golden·templates · READ.md·baseline manifest 2개 · `.claude/skills` 내용 · git 인덱스(`ls-files -s`) · 경로 목록(`key_paths`) · node/OS/bash/awk/sed 버전 · `WD_REG_KEY_SALT`**. 런타임 전체를 넣는 이유: 진입점만 해시하면 **커밋 안 된 lib 수정 뒤 `--resume`이 이전 결과를 재사용**한다(HEAD는 커밋된 변경만 덮는다 — 같은 외부 리뷰가 지적). `--resume`은 정확히 같은 구성의 결과만 재사용할 수 있다: 다른 구성은 다른 디렉터리라서, 오래된 결과는 걸러지는 게 아니라 **도달 불가능**하다. (`WD_REG_KEY_SALT` 환경변수로 강제 새 키 가능. 쌓인 `wd-reg-*` 디렉터리는 언제든 지워도 된다.)
- 워커는 부모의 workspace를 env로 상속하며, mktemp를 **만든** 호출만 제거를 담당한다.
- **git 환경**: `tests/git-env.sh`가 `git rev-parse --local-env-vars`가 세는 변수를 **전부 unset**하고, 거기에 없는 **pathspec 4종**(`GIT_LITERAL_PATHSPECS`·`GIT_NOGLOB_PATHSPECS`·`GIT_GLOB_PATHSPECS`·`GIT_ICASE_PATHSPECS`)도 함께 지운다 (`regress.sh`·`make-manifest.sh`·`release-notes.sh`가 소싱). 훅·`rebase --exec`·`bisect run`·`submodule foreach`는 `GIT_DIR`과 `GIT_INDEX_FILE`을 내보내고 `git -c`는 `GIT_CONFIG_PARAMETERS`로 전파되므로, "커밋 전에 스윕"이 바로 그 환경이다. v0.5.16은 셋만, 그것도 찾은 호출 지점에서만 지웠고 — 상속된 `GIT_OBJECT_DIRECTORY`에서 임시 저장소가 **무관한 저장소에 object 79개를 썼으며**(케이스는 PASS), 상속된 `GIT_INDEX_FILE`에서 **키와 매니페스트가 서로 다른 인덱스를 읽었다**(false-green). 호출 지점을 열거하는 대신 프로세스 환경을 정리하므로 앞으로 추가되는 git 호출도 자동으로 격리된다.

## Parser/state property matrix

`node tests/markdown-model-properties.mjs` runs the fast, deterministic Cartesian model checks without creating a mine. It covers lexical context precedence, EOLs, fence forms, slot/body states, continuation hierarchy, section boundaries and writer postconditions. `regress.sh` also runs it as a black-box meta case; an empty or shortened matrix is a failure, not a vacuous pass.

`node tests/raw-source-properties.mjs` covers the shared raw-source model — known SHA-256 vectors, the manifest's detection of add/delete/rename/byte-change, the five model states, root aliases and hardlinks, snapshot bytes, injected read races, and address resolution. It builds fixtures in a temp directory, never in the repository. Its output ends with `nonregular=`, `rootalias=` and `hardlink=`, which record which fixture form each branch actually used. Only the symlink form has a fallback (a directory), and only on Windows, where creating one needs a privilege the host may not grant; on POSIX a failure raises, so CI's Linux and macOS legs are the evidence that the symlink branch ran. The alias and hardlink fixtures are mandatory everywhere — a skipped fixture is a check that never ran, and it would vary the assertion total by host.

`node tests/quote-marker-properties.mjs` covers the v3 quote marker — grammar (fail-closed on unknown, duplicate, empty and truth-sourced attributes), marker↔quote-block association, the unmarked-blockquote population rule, fence precedence through the shared scanner, resolution through the raw-source model, byte-domain comparison, and the binary / not-checkable boundary. It was written **before** the module, as the plan requires, and every assertion first failed with "Cannot find module".

`node tests/artifact-contract-properties.mjs` does the same for the versioned artifact-role contract (schema v3 Phase 1) — version negotiation, v2↔production equivalence, fail-closed role sets, positional shift, and the declared schema domain. **Nothing in the runtime consumes that model yet** (production consumers switch in Phase 2), so its meta case is the only thing executing it and the exact assertion total is pinned for that reason.

## CI

[.github/workflows/ci.yml](../.github/workflows/ci.yml) — **트리거마다 도는 OS가 다르다.**

- **push(main·improve/**)·PR**: `bash -n` + ShellCheck(오류 등급), **Ubuntu에서만** 전체 suite, bundle manifest 2회 재현 검증.
- **tag(`v*`)·workflow_dispatch**: 위에 더해 **Windows·macOS** matrix에서 전체 suite. 셋 다 **required**(macOS는 census 4건이 v0.3.4에서 해소되어 2026-08-04 승격). Windows는 분당요금 2배, macOS는 10배라 계약이 걸리는 지점 — 태그 — 에서만 돈다. (CI sweep 실측 2026-08-07, 같은 축끼리: Windows **2m28s** — 같은 CI에서 v0.5.12 직전 트리는 **5m18s**였다. macOS 49s · Linux 41s. 로컬 Windows 네이티브는 별개 축이다 — 위 표의 4분 29초. 이 CI 숫자는 493케이스 시점 측정이며, 케이스가 늘면 함께 늘어난다.)

**CI는 선언된 바닥인 node 18로 돈다** (`.github/workflows/ci.yml`의 `node-version: '18'`) — 로컬은 22, 컨테이너 이미지는 20이다. 즉 **18에서만 깨지는 문법은 로컬 스윕에도 컨테이너에도 안 잡히고 태그에서 처음 드러난다**(v0.5.18 실측: `--input-type=module` 없는 `node -e` 안의 top-level await가 로컬·컨테이너 green, CI 3-OS 전부 red). 런타임 자체는 `node:fs/path/crypto`만 쓰고 18 이후 문법을 쓰지 않는다; 하네스 안의 node 프로브를 새로 쓸 땐 기존 셋처럼 **`--input-type=module`을 반드시 붙일 것**. 컨테이너 이미지를 18로 내리는 것은 미결이다.

두 경로 모두 §7.3 계약대로 실행 케이스 ID·환경을 artifact로 게시하고, suite 성패와 무관하게(`if: always()`) 종료 후 clean worktree를 확인한다.

## baseline/ 산출물

| 파일 | 내용 |
|---|---|
| `case-manifest.txt` | Phase 0 시점 182개 케이스 ID (기준선 — 이후 케이스는 suite가 자체 열거) |
| `bundle.manifest` (+`.sha256`) | Phase 0 시점 21개 동작 결정 파일의 SHA-256 (git blob 기준). 재생성: `bash tests/make-manifest.sh` (현재 57개 — VERSION·`.weavedoc/.gitattributes`·공유 scanner/state adapters·`PARSER-MODEL.md`·versioned `schemas/`·templates 포함). 생성기는 **fail-closed**: 저장소가 없거나 필수 경로가 빠지면 빈 매니페스트에 rc 0이 아니라 **rc 2로 거부**한다(v0.5.18) |
| `parity-final-2026-08-05.md` | **bash 판 삭제 직전의 마지막 대조** — 회귀·코퍼스·쓰기 명령 전수·실광산·장애 주입. 삭제하면 다시 잴 수단이 없으므로 이력에 고정했다 |
| `fidtest-inventory.md` | 구 fidtest.sh 11개 실험의 판정 기록 — Phase 2에서 흡수 3 · 폐기 8로 완결, 파일 자체 제거 |
| `golden/` | 최소 정상 fixture에 대한 각 명령의 human output 스냅샷 (동작 변경 시 커밋 단위로 갱신) |
| `perf-baseline.md` | validate 3회 median 39.658s (Phase 4의 70% 목표 기준점) |
| `run-2026-08-02.md` | Phase 0 이관 직후 182/182 독립 재실행 기록 |

## 남은 부채

- 기대 문자열 assertion → diagnostic code 기반 exact assertion: **code 체계 도입(§10 단위 11)과 동시에** 진행한다 — 코드가 없는데 코드 기반 assertion을 먼저 쓸 수는 없다.
