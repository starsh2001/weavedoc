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

## 실광산 재기준선 (2026-08-03) — 필드 리포트 P1 착수 전

`notes/FIELD-2026-08-03-eclypse-defects-and-perf.md`의 단일 패스 접기 작업 전 기준선. eclypse **자료 30 · truth 268**, dev 번들 `2026-08-03.2`(v0.3.3), 같은 방법(연속 3회, 광산 원본에서 읽기 전용 실행).

| run | real |
|---|---:|
| 1 | 163s |
| 2 | 152s |
| 3 | 155s |

**median = 155s** (배포본 `2026-08-02.17`의 필드 관측치는 149s — 리포트 §2). 같은 광산을 awk 1회로 읽는 프로브(`notes/probe-singlepass.awk`)는 **1.81s** — 실제 계산은 ~2s(봉인 부분문자열)이고 나머지는 전부 스폰이라는 리포트 진단을 재확인.

합성 fixture는 `tests/regress.sh`의 **`mkscale`**(자료 8 · truth 60, 전 truth가 출처 줄을 축자 인용) + `acct_scale_snapshot` — 위 "250-truth benchmark fixture 추가 예정" 과제를 이것으로 닫는다. 60-truth로도 스폰 회귀는 즉시 보인다: 접기 전 케이스 1개가 ~79s(sys 78s)다.

## P1 접기 후 (2026-08-04) — 항목당 fork 제거

같은 두 축을 같은 방법(3회 median)으로 재측정. 검사 규칙 무변경, 회귀 **324/324**, `examined:` 수치·종료 코드 동일.

| 대상 | before | after | 감소 |
|---|---:|---:|---:|
| 합성 fixture `mkscale` (자료 8 · truth 60) | 47s (46·47·47) | **8s** (8·8·8) | **−83.0%** |
| 실광산 eclypse (자료 30 · truth 268) | 155s (163·152·155) | **32s** (32·31·33) | **−79.4%** |
| (하한) 같은 광산 awk 1회 프로브 | — | 1.8s | — |

접은 것(전부 "항목 수에 비례하던 spawn"): truth당 `basename`+`canon_id`+fm-미종결 awk 3-fork → **배치 awk 1회** · 재료당 `$(fm)` ~12회 → `fmv`(REPLY) · 전 파일 frontmatter **일괄 프리로드**(`fm_preload`, 값 규칙은 `FM_KV_AWK` 한 벌 공유) · `$(sch)`×34 → `SCH[]` 직접 · `$(cfg2)`×14 → `CFG[]` 직접 · index↔파일 대조의 `ls|sed`+`grep|sed`+`comm`×2 → bash 맵 · `catalog_ids` 재료당 재실행 → 1회 · verify 섹션 `nocomment|grep`×N → 캐시된 `count_headings`.

측정 중 실물 결함 둘을 잡았다: **`pipes()`가 이중 정의**되어 fork-free판을 `echo|tr`판이 덮고 있었고(모든 호출이 3 fork였다), 프로파일 앵커 하나가 존재하지 않는 주석 문자열이라 첫 프로파일이 왜곡돼 있었다 — 두 번째 EPOCHREALTIME 계측에서 드러났다.

남은 32s의 분포(eclypse): truths 대형 awk ~15s(봉인 부분문자열 = 유일한 진짜 계산) · 인터프리터 기동/스크립트 파싱 ~2.4s · 나머지는 고정 파이프라인 수십 회. **항목당 fork는 0이 되었으므로 광산이 커져도 기울기가 완만하다** — 리포트 §2가 절대 속도보다 중요하다고 한 성질이 이것이다.

### P1 2단계 (2026-08-04) — 잔여 접기 + 로케일 핀

- eclypse validate **32s → 13~18s**: coverage용 (id,source) 쌍을 fm 캐시에서(268파일 재독 awk 제거) · verify 필수 절 검사 8회 bash 전체 순회 → awk 1회 · Human queue 항목 검사 bash 루프+행당 sed → awk 1회.
- 같은 라운드에서 **로케일 의존 판정 잠복 결함** 발견·수정: gawk 5.0이 UTF-8 로케일에서 이모지 든 claim 줄을 오독해 같은 광산이 ko_KR.UTF-8에서만 FM-MISSING 5건(C에서는 통과). 콘텐츠 파싱 awk 전부 `LC_ALL=C`(바이트 의미론) 핀 — retag의 재작성 awk만 문서화된 예외. 세 로케일(C · ko_KR.UTF-8 · C.UTF-8) 판정 동일 실측.
- 스윕 병렬 실험: 332케이스 **-j6 ≈33분 vs -j3 ≈31.5분** — 병렬도가 결과를 바꾸지 못함 = MSYS fork 전역 직렬화 지배 확증. 스윕 가속의 유효 수단은 호출 수/파스 floor 축소 또는 Linux CI 위임뿐(§10 후보).

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
