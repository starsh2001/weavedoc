# 성능 baseline — Phase 0 (2026-08-02)

WD-PERF-001의 기준선. 계획서 §2의 방법대로 동일 fixture를 3회 실행한 median을 기준으로 삼는다 (계획서 본문의 ~35.1초는 단일 측정이었고, 이 문서가 그것을 대체하는 정식 기준선이다).

## 측정

- fixture: 최소 정상 프로젝트 (1 material · 1 truth · 1 document · final.md, `tests/regress.sh`의 `mkpristine` 정의 그대로)
- 명령: `bash .weavedoc/bin/weavedoc validate`
- 조건: 다른 부하 없는 상태에서 연속 3회

| run | real |
|---|---:|
| 1 | 42.258s |
| 2 | 39.658s |
| 3 | 37.757s |

**median = 39.658s** (min 37.757 · max 42.258)

## 환경

| 항목 | 값 |
|---|---|
| commit | 0486329 (improve/phase0) |
| bundle | 2026-08-02.2 · manifest digest `795fdda02fb4…` |
| OS | Windows 10 Pro 19045, MINGW64 (Git Bash / MSYS) |
| bash | 5.2.26 |
| gawk | 5.0.0 |
| sed | 4.9 |

## 사용

- Phase 4 완료 조건 "현재 대비 70% 이상 단축"의 "현재" = **이 median 39.658s** → 목표 ≤ **11.9s** (같은 fixture · 같은 머신 계열 기준).
- 원인 진단(계획서 WD-PERF-001): MSYS process spawn 비용 × 반복 parser 실행이 지배적. 절대시간은 머신 의존이므로 교차 비교는 Phase 2 CI의 OS별 baseline으로 대체한다.
- 250-truth benchmark fixture는 Phase 4에서 추가 예정 (아직 없음).
