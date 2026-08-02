# tests/ — 추적되는 회귀 suite (Phase 0 이관본)

[IMPROVEMENT_PLAN.md](../IMPROVEMENT_PLAN.md) Phase 0의 산출물. gitignore된 `notes/`에만 있던 개발 suite를 **변경 없이** 추적 트리로 복사했다 (`cmp`로 byte-identical 확인, bundle `2026-08-02.2`).

## 실행

```bash
bash tests/regress.sh            # 전체 182 케이스 (병렬 -j6)
bash tests/regress.sh gate       # 이름에 "gate"가 들어간 케이스만
bash tests/regress.sh --resume   # 이전 실행 결과 재사용, 남은 것만
bash tests/regress.sh --one NAME # 케이스 하나, 출력 인라인
```

Windows Git Bash에서 `validate` 1회 ≈ 35~40초라서 전체 sweep은 수십 분 걸린다. 케이스 구성: block 101 · pass 54 · acct 26 · meta 1 = **182** ([baseline/case-manifest.txt](baseline/case-manifest.txt)).

## baseline/ 산출물

| 파일 | 내용 |
|---|---|
| `case-manifest.txt` | 182개 케이스 ID 전수 (LC_ALL=C 정렬) |
| `bundle.manifest` | 동작을 결정하는 21개 파일(bin·schema·READ·FORMATS·templates·skills)의 SHA-256. **git blob 바이트 기준**이라 checkout의 autocrlf 설정과 무관 |
| `bundle.manifest.sha256` | 위 manifest 파일 자체의 digest = 이 bundle의 단일 식별자 |
| `fidtest-inventory.md` | `fidtest.sh` 11개 실험의 커버리지 판정 (중복 7 · 확인 3 · 변형 1) |
| `golden/` | 최소 정상 fixture에 대한 각 명령의 현재 human output 스냅샷 |
| `perf-baseline.md` | 최소 fixture `validate` 3회 실행 median (WD-PERF-001 기준선) |
| `run-2026-08-02.md` | 이관 직후 tests/ 위치에서의 독립 재실행 기록 (실행된 케이스 ID 명시) |

manifest 재생성: `bash tests/make-manifest.sh` — 같은 커밋 트리에서 몇 번을 돌려도 byte-identical해야 한다 (Phase 0 완료 조건).

## 알려진 부채 — 여기서 고치지 않는다

Phase 0은 behavior-neutral 이관이다. 다음은 계획서에 등재된 Phase 2 작업이며 이 복사본에 선반영하지 않는다.

- 고정 workspace `$TMPDIR/wd-reg` — 동시 실행 충돌 가능 (WD-QA-002)
- `--resume`이 commit/bundle 변경을 cache key에 반영하지 않음 (WD-QA-002)
- 기대 문자열 1개짜리 느슨한 assertion → diagnostic code 기반 exact assertion (WD-QA-003)
- `fidtest.sh` 고유 케이스의 회귀 통합 (WD-QA-001, 근거는 `baseline/fidtest-inventory.md`)
