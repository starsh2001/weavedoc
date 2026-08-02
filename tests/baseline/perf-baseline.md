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

## 실광산 측정 (2026-08-02) — 목표 초과 달성

최소 fixture는 고정비 비중이 커서 실사용을 대표하지 못한다. 같은 광산(eclypse: **자료 28 · truth 264**)의 사본 두 벌에 각각 구·신 번들을 놓고 `validate`를 1회씩 측정했다.

| 번들 | wall | 판정 |
|---|---:|---|
| `2026-08-02.2` (Phase 4 이전) | **497.9초** | ✓ 통과 · 자료 28 · truth 264 (264 sealed) |
| `2026-08-02.11` (현재) | **106.2초** | ✓ 통과 · 자료 28 · truth 264 (264 sealed) |

**−78.7%.** 검사 범위·판정·`examined:` 수치가 완전히 동일하다 — 빨라진 것이지 덜 검사하는 것이 아니다.

최소 fixture(−65%)보다 실광산(−79%)에서 개선폭이 큰 이유는 구조적이다: 이번 최적화는 **파일당·항목당** 반복 fork를 없앤 것이라 대상 수에 비례해 이득이 커지고, 남은 고정비(schema·config 1회 로드)는 광산이 클수록 묻힌다.

- **Phase 4 완료 조건 판정**: 실사용 기준 **달성**(−78.7%), 최소 fixture 기준 **미달**(−65%). 플랜의 문구는 최소 fixture이므로, 판정 근거를 실광산으로 옮길지는 §11 결정 절차를 따른다.
- 플랜이 요구한 250-truth benchmark는 이 264-truth 실측이 실질적으로 대신한다. 재현 가능한 공개 fixture는 아직 없다(광산이 비공개) — 합성 fixture 생성은 남은 과제.

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
