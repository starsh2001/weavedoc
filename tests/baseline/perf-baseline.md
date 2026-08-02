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

## 진행 (Phase 4)

같은 fixture · 같은 머신 · 같은 방법(3회 median)으로 추적한다.

| 시점 | median | baseline 대비 |
|---|---:|---:|
| Phase 0 기준선 (bundle 2026-08-02.2) | 39.658s | — |
| schema 캐시 · 선언 로스터 · fork 없는 enum (`.9`) | 35.96s | −9% |
| **frontmatter 파일당 1회 파싱 · 내장 listfield/has_fm/placeholder** | **17.41s** | **−56%** |
| **+ zone-rule 상수 내장화** | **16.36s** | **−59%** |

Phase 4 목표는 −70% (≤11.9s). 남은 분포(문서 1·자료 1 fixture 기준): documents 약 4s · truths-awk 2.2s · ledgers 1.4s · materials 1.4s · verify.md 1.1s.

**측정 방법 메모.** `bash -x` 트레이스는 MSYS에서 stderr 쓰기 비용이 커서 결과를 왜곡한다(라인당 ~12ms의 가짜 균등 분포). 블록 경계에 `EPOCHREALTIME`을 찍는 내장 마커가 정확하다 — Phase 4의 진단은 전부 그 방식이다.

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
