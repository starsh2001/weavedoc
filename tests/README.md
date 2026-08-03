# tests/ — 추적되는 회귀 suite

[IMPROVEMENT_PLAN.md](../IMPROVEMENT_PLAN.md) Phase 0에서 이관, Phase 2에서 격리·CI 완성. 원본은 gitignore된 `notes/`의 개발 suite였다 (byte-identical 이관, bundle `2026-08-02.2` 기준 — 이후 케이스는 각 작업 단위가 추가).

## 실행

```bash
bash tests/regress.sh            # 전체 케이스 (병렬 -j6)
bash tests/regress.sh gate       # 이름에 "gate"가 들어간 케이스만
bash tests/regress.sh --resume   # 같은 구성의 이전 결과 재사용, 남은 것만
bash tests/regress.sh --one NAME # 케이스 하나, 출력 인라인 (pristine 자동 생성)
```

Windows Git Bash에서 `validate` 1회 ≈ 40초라 전체 sweep은 수십 분 걸린다 (Phase 4의 성능 작업이 이를 줄인다).

## 격리 모델 (Phase 2, WD-QA-002)

- **픽스처**: 실행마다 `mktemp -d` workspace — trap으로 종료 시 제거. 병렬/중복 실행이 충돌할 수 없고, 중단돼도 workspace가 남지 않는다.
- **결과 캐시**: `$TMPDIR/wd-reg-<key>/res` — key는 **commit + bundle 바이트 + OS + bash/awk/sed 버전**의 해시. `--resume`은 정확히 같은 구성의 결과만 재사용할 수 있다: 다른 구성은 다른 디렉터리라서, 오래된 결과는 걸러지는 게 아니라 **도달 불가능**하다. (`WD_REG_KEY_SALT` 환경변수로 강제 새 키 가능. 쌓인 `wd-reg-*` 디렉터리는 언제든 지워도 된다.)
- 워커는 부모의 workspace를 env로 상속하며, mktemp를 **만든** 호출만 제거를 담당한다.

## CI

[.github/workflows/ci.yml](../.github/workflows/ci.yml) — push(main·improve/**)·PR·tag에서: `bash -n` + ShellCheck(오류 등급), Ubuntu·Windows(required)/macOS(non-blocking — **best-effort 결정 2026-08-03**, 알려진 4건은 census index-parsing 계열로 macOS 셸 확보 후 해결) matrix에서 전체 suite, §7.3 계약대로 실행 케이스 ID·환경을 artifact로 게시, 종료 후 clean worktree 확인, bundle manifest 2회 재현 검증.

## baseline/ 산출물

| 파일 | 내용 |
|---|---|
| `case-manifest.txt` | Phase 0 시점 182개 케이스 ID (기준선 — 이후 케이스는 suite가 자체 열거) |
| `bundle.manifest` (+`.sha256`) | Phase 0 시점 21개 동작 결정 파일의 SHA-256 (git blob 기준). 재생성: `bash tests/make-manifest.sh` |
| `fidtest-inventory.md` | 구 fidtest.sh 11개 실험의 판정 기록 — Phase 2에서 흡수 3 · 폐기 8로 완결, 파일 자체 제거 |
| `golden/` | 최소 정상 fixture에 대한 각 명령의 human output 스냅샷 (동작 변경 시 커밋 단위로 갱신) |
| `perf-baseline.md` | validate 3회 median 39.658s (Phase 4의 70% 목표 기준점) |
| `run-2026-08-02.md` | Phase 0 이관 직후 182/182 독립 재실행 기록 |

## 남은 부채

- 기대 문자열 assertion → diagnostic code 기반 exact assertion: **code 체계 도입(§10 단위 11)과 동시에** 진행한다 — 코드가 없는데 코드 기반 assertion을 먼저 쓸 수는 없다.
