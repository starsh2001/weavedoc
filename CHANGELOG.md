# WeaveDoc — 변경 내역

번들 버전은 `.weavedoc/VERSION`에 있습니다. **날짜만으로는 설치본을 구분할 수 없으므로**(같은 날짜 라벨로 다른 `bin/weavedoc`이 돌 수 있음) `weavedoc version`이 함께 찍는 **fingerprint**(bin+schema 해시)로 비교하세요.

---

## 2026-08-02.15

**진단이 계약이 됩니다 — 안정 diagnostic code + `validate --json` (WD-CLI-002/QA-003, 단위 11a).**

- **코드 체계**: `AREA-SLUG`(예: `GATE-FINAL-DIGEST`, `SEAL-QUOTE-MISSING`, `VER-DISAGREE`) — **코드가 계약이고 영문 산문은 표현**입니다. 사람 출력엔 `[CODE]` 프리픽스(인용·grep 가능), 이번 웨이브로 shell 측 진단 71/73곳 코드화(잔여 2는 라우터 내부 = 실질 0). `meta_uncoded_ratchet`이 shell 측 0을 고정 — 코드 없는 prob는 이제 suite가 거부합니다.
- **`validate --json`**: stdout에 JSON 객체만 — `output_schema_version:1`, bundle, schema_version, result, problems, `examined`(seal/tombstone/gate/review-seal 카운트 전부), `diagnostics:[{code,message}]`, `warnings`. exit 규약 불변(0 pass · 1 fail). config unknown-key 경고도 `warn()` 수집기로 승격(`CFG-UNKNOWN-KEY`).
- awk 벌크 경로(truths·coverage awk)는 `emit_probs` 라우터로 합류 — 대표 진단 `SEAL-QUOTE-MISSING`은 1차에 포함, 나머지 awk 내부 타입과 scope/version/upgrade의 `--json`, FORMATS 코드표는 **단위 11b**로 명시 잔여.

검증: json 2 · ratchet 1 · human-code 1 · **gate 88/88**(프리픽스가 기존 단언 무손상) 로컬 · 전수는 CI.

## 2026-08-02.14

**document half의 E2E 척추 (WD-E2E-001).** `e2e_` 카테고리 신설 — 개별 판정이 아니라 **시퀀스**를 검증합니다: 문서 하나가 plan → draft → clean review → seal → consecrate를 실제 명령 흐름으로 통과하고, 관절마다 단언이 붙습니다.

- `e2e_single_document` / `e2e_multi_document` — 단일 파일과 draft/ 트리 각각 탄생부터 봉인된 validate까지.
- `e2e_stale_context_recovery` — 봉헌된 초록 → 인용 truth의 claim 변경 → hard red("review no longer describes this mine") → 재-seal → 다시 초록. 신선도의 왕복 전체.
- `e2e_block_repair_{contradiction,unsupported,missing-required}` — 세 kind 각각: gate가 이름으로 거부 → **거부가 final을 남기지 않음을 단언** → 수리 → 재-seal → 봉헌.
- `e2e_user_answer_chain` — ask 루프의 산출물 사슬(사용자 답변 → user-answer material → truth → 인용)이 통째로 validate·consecrate를 통과.
- `e2e_open_queue_consecrates` — 2026-08-01 재정을 시퀀스로 고정: 열린 Human queue는 기계의 봉헌을 막지 않는다(고지·go-ahead는 스킬의 의무, 한 층 위).

이 케이스들이 커버하지 **못하는** 것도 명시합니다: AI가 무엇을 쓸지 결정하는 절반 — 스킬 주도 실전 1회는 남은 과제로 플랜에 기록.

검증: e2e 8/8 첫 실행 GREEN · 전수는 CI.

## 2026-08-02.13

**Phase 5 개시 — preflight와 "문서≠코드"의 기계 검사.**

- **preflight (WD-CLI-001 마지막 항목)** — bash ≥ 4를 **첫 `declare -A` 이전에** 검사합니다: 3.2에서는 그 줄이 에러를 내고도 실행이 계속되어 배열이 스칼라처럼 조용히 굴러가는데, 정확히 그 은닉 실패를 끝냅니다. GNU sed/awk 검사는 validate와 쓰기 명령에서만(fork 2개 — 가벼운 읽기에 쓰지 않음; BSD 도구는 실패하지 않고 **조용히 다르게** 동작하므로 더 나쁨).
- **`tests/doccheck.sh` 신설 + `meta_doc_sync` 케이스** — dispatch ↔ README ↔ bin 헤더 주석, VERSION ↔ CHANGELOG 최신 항목이 한 사실인지 기계 검사. 첫 실행에서 곧장 lang·locale 미문서화(WD-DOC-001 잔여)를 잡았고, 두 번째 실행에서 이 번들의 VERSION/CHANGELOG 불일치를 잡았습니다 — 자기 일을 두 번 증명한 셈입니다.
- **문서 정합(WD-DOC-001)** — README 상단 요약을 dispatch 전체(16 명령)와 동기화, VERSION의 "날짜 비교" 안내를 fingerprint·schema 기준으로 교체, lang·locale 문서화, WORKFLOW에 bash≥4+GNU 요구사항 명시, "~220-truth" 시점성 숫자를 무시점 표현으로.

검증: doccheck GREEN · 신규 meta 케이스 포함 그룹 로컬 · 전수는 CI.

## 2026-08-02.12

**경계가 단단해졌습니다 — Phase 4 종료 (WD-IO-001 + WD-CLI-001).** 쓰기는 트랜잭션이 됐고, 입력의 가장자리는 추측을 멈췄습니다.

- **retag가 트랜잭션입니다** — 대상 경로 guard → 첫 수정 전 파일별 스냅샷 → 적용 → reindex → **full validation** → 실패 시 전량 원복 + 인덱스 재동기("rolled back"까지 케이스가 원문 tags로 증명). 미지의 3번째 플래그(`--forcee`)가 무시된 채 **실제 쓰기로 흐르던 결함**도 여기서 닫혔습니다 — 쓰기 명령은 추측하지 않습니다.
- **reindex는 same-filesystem staging + atomic rename** — mktemp가 다른 마운트라 cp 중단 시 반쪽 인덱스가 남을 수 있던 창을 닫고, 실패는 exit code로 전파됩니다.
- **write 명령의 workspace guard** — 리다이렉트된 경로는 어디든 **읽을** 수 있지만, 프로젝트 루트 밖으로 해석되거나 symlink를 통과하는 **쓰기**는 거부합니다(retag·reindex). symlink 케이스는 플랫폼 이중 판정: 진짜 symlink가 생기는 곳(Linux/CI)에선 거부를, MSYS처럼 복사로 degrade하는 곳에선 정상 동작을 각각 검증합니다.
- **실달력 날짜** — `2026-02-31`, `2023-02-29`(비윤년)를 거부하고 `2024-02-29`는 통과합니다(그레고리력 윤년 규칙, 순수 셸 산술).
- **truth 이름을 쓴 디렉터리**는 이름이 찍히고 세어지지 않습니다(gawk가 조용히 건너뛰어 검사가 안 돌던 자리).
- **Verified units의 역방향·거대 range**(`t009-t002`, `t001-t99999`)는 전개 전에 판정되어 그 줄 전체가 "covers nothing"으로 이름 찍힙니다 — 오타 하나가 수만 id의 커버리지를 주조하지 못합니다.
- **dispatch 전 명령 인자 엄격화** — 초과 인자·미지 flag는 usage+exit 2 (`validate --verbose`, `pull` 무인자, `reindex --check unexpected` 전부 케이스로 고정).
- **`C:\…`는 절대경로로 인식**되어 루트 밑에 접합되지 않습니다.
- **`audience: external`은 `publication_labels`를 요구**합니다(enum `internal|external` 신설, WD-CFG-001 마지막 조각).

검증: 신규 17케이스 그룹 GREEN 로컬 · 전수는 CI · 케이스 자신이 잡은 설계 결함 1(범위 행을 절 밖에 붙여 스캐너가 못 보던 픽스처 — attest 미러와 같은 함정).

## 2026-08-02.11

**실광산 `validate`가 8분 18초 → 1분 46초 (−78.7%).** 최소 fixture만으로는 실사용을 대표할 수 없어, 같은 광산(자료 28 · truth 264)의 사본 두 벌에 구·신 번들을 놓고 각각 측정했습니다. **검사 범위·판정·`examined:` 수치가 완전히 동일합니다** — 빨라진 것이지 덜 검사하는 것이 아닙니다.

- 호출 횟수 계측(내장 카운터 — `bash -x`는 MSYS에서 왜곡)이 다음 계층을 지목했습니다: `cfg2` 14회 · `cfgval` 5회(각각 awk 또는 grep+sed를 `$()` 안에서) · `nocomment` 15회(10회는 `dup_section` 뒤).
- **config를 한 번만 파싱**해 두 관점으로 캐시합니다 — `CFGFLAT`(파일 전체 첫 매치 = cfgval의 의미), `CFG`(section.key = cfg2의 의미). 섹션 벽은 유지되어 `verify.strength`와 `review.strength`는 여전히 별개입니다.
- **파일별 raw/주석제거 내용을 캐시**하고 `dup_section`은 그 위에서 내장으로 heading을 셉니다. Human queue 항목은 항목당 3 fork(grep+sed 2개) → 파라미터 확장.
- 값 의미론 불변: 따옴표 밖 주석만 제거, 값 없는 콜론은 여전히 부재.

최소 fixture 기준으로는 39.658초 → 14.06초(−65%)로 플랜의 −70%에 미달하지만, **실사용 기준으로는 −78.7%로 초과 달성**입니다. 개선폭 차이는 구조적입니다: 이번 최적화는 파일당·항목당 반복 fork를 없앤 것이라 대상 수에 비례해 이득이 커집니다. 두 수치를 모두 [perf-baseline.md](tests/baseline/perf-baseline.md)에 남겼습니다.

검증: 회귀 **241/241 CI green** · 실광산 재검증에서 구·신 판정 동일.

## 2026-08-02.10

**성능 —39.7초에서 16.4초로 (−59%).** Phase 4의 본 작업. 블록별 실측이 범인을 정확히 지목했습니다: 자료 1개·문서 1개짜리 최소 fixture인데 **materials 블록 12.7초 · documents 8.0초**. 원인은 로직이 아니라 **키마다 파일을 다시 파싱**한 것이었습니다 — `fm()`이 필드마다 awk를 띄우고 `req_value()`가 그걸 또 불러서, 자료 하나에 fork 30개.

- **frontmatter는 파일당 한 번만 파싱합니다** — 1회 파싱으로 캐시를 채우고, 이후 조회는 배열 참조(`fmv`는 `REPLY`에 담아 **fork 0**). 값 규칙(따옴표 밖 주석 제거·따옴표 벗기기·첫 철자 우선)은 그대로.
- **`listfield`가 내장이 됐습니다** — `echo|tr|tr|sed|grep` 5개 프로세스 → 순수 파라미터 확장. `IFS=','`라서 **공백이 든 항목이 쪼개지지 않습니다**(word splitting이었으면 깨졌을 부분).
- **`has_fm`**은 `head|tr|grep` 3 fork → 내장 read 한 줄. **`is_placeholder`**는 schema의 brace 패턴을 glob으로 판정(스키마는 여전히 의미의 SoT).
- **zone rule의 상수 3개**가 문서마다 파이프 11개로 재계산되던 것을 파라미터 확장으로 — 문서가 많은 광산일수록 이득이 커집니다.

측정(3회 median, 동일 fixture·머신): **39.658초 → 16.36초**. 목표 −70%(≤11.9초)에는 4.5초 남았고, 남은 분포는 [perf-baseline.md](tests/baseline/perf-baseline.md)에 기록했습니다.

시도했다가 **되돌린 것**: `dup_section` 뒤에 파일별 heading 인구조사 캐시 — 호출자가 묻는 횟수보다 인구조사 비용이 커서 오히려 documents 블록이 5.17→6.30초가 됐습니다. 캐시가 항상 이긴다는 가정이 틀린 사례라 기록해 둡니다.

측정 방법도 교정했습니다: `bash -x` 트레이스는 MSYS에서 stderr 쓰기 비용 때문에 라인당 ~12ms의 **가짜 균등 분포**를 만듭니다 — 블록 경계에 `EPOCHREALTIME`을 찍는 내장 마커만 신뢰합니다.

검증: 회귀 **241/241 CI green**(브랜치 run) · `bash -n` 통과 · 형식 무변경.

## 2026-08-02.9

**Phase 4 착수 — 병목의 정체를 숫자로 확정하고, 첫 fork 절감.** 추측 대신 계측부터 했습니다: **MSYS에서 `echo | tr` 100회 = 38초, 같은 횟수의 내장 루프 = 0.07초.** fork 하나가 약 190ms입니다. 즉 Windows에서 `validate`의 실행시간은 로직이 아니라 **프로세스 수**입니다. 이 사실이 남은 성능 작업의 방향을 결정합니다.

- **schema를 한 번만 읽습니다** — `sch()`가 조회마다 grep+head+sed 3개를 띄우던 것을 프로세스 시작 시 1회 로드 + 연관 배열 조회로. 호출부 40곳의 `$(sch …)` 명령 치환(각각 fork 1개)도 `${SCH[key]}` 직접 참조로 바꿔 fork 자체를 없앴습니다. **덤으로 잠복 버그 수정**: 옛 구현은 키를 정규식으로 보간해 `verify.sections`가 `verifyXsections`에도 매치됐습니다 — 이제 정확 일치입니다.
- **runtime의 자기 소스 grep 제거 (WD-ARC-001)** — validate가 자기 파일을 grep해 schema 키 로스터를 유도하던 것을 선언 상수 `SCH_KEYS`로. 파일명이 바뀌거나 읽기 권한이 없으면 조용히 4개 키로 축소되던 경로가 사라졌습니다(로스터가 잘리면 여전히 소리내어 실패).
- **enum 검사가 fork를 안 씁니다** — `pipes "$(sch X)" | grep -qx "$v"`(3 fork) 14곳을 순수 문자열 `in_list`(0 fork)로.

측정: 최소 fixture median **39.658초 → 35.96초 (약 10% 단축)**. 목표(70%, ≤11.9초)에는 크게 못 미칩니다 — 남은 fork는 `cmd_validate` 한 함수에만 명령 치환 101개·파이프 28개로 퍼져 있어, 다음 조각인 **metadata 단일 AWK pass 통합**이 실제 승부처입니다. 이번 번들은 그 전제(캐시·상수 로스터·fork 없는 enum)를 놓은 것입니다.

검증: `bash -n` 통과 · 로컬 85케이스 GREEN(치환이 광범위해 동작 보존을 우선 확인) · 전수 241은 CI Ubuntu.

## 2026-08-02.8

**Schema v2와 migration — Phase 3 종료, migration train 해제.** 이제 v1 광산이 스스로 v2가 되는 길이 있습니다: 검사와 적용이 분리된 `upgrade`, 그리고 버전이 실제 계약이 되는 협상.

- **schema 협상 (WD-MIG-002)** — `.weavedoc/schema`가 `schema.version: 2`를 선언. project.md·config.yaml의 `version:`은 한 사실의 두 기록으로 일치를 검사하고, **미래 버전은 fail-closed**, v1은 dual-reader로 읽되 `upgrade --check`를 가리키는 공지 한 줄. `version` 명령이 schema 줄을 함께 찍습니다.
- **config 전 계약 (WD-CFG-001, 조기)** — section-aware `cfg2` 신설: 평면 첫-매치 파서는 verify.strength 뒤의 review.strength를 영원히 못 봅니다. strength(1-3)·max_rounds(양의 정수)·scale(enum)·repeat(스케일별 비음수)를 verify/review 양쪽에서 검사, unknown top-level key는 **이름 찍는 경고**(확장인지 오타인지 기계가 못 가르므로 차단하지 않음).
- **`upgrade --check | --dry-run | --apply` (WD-MIG-001)** — 기본은 read-only. apply는 §8 원칙 그대로: rename 충돌 전수 사전검사(하나면 0 byte) → 원본 스냅샷+manifest → canonicalize(m5→m005; strict 참조 필드·catalog·coverage·cited_truths까지, **산문·changelog·consecrated 바이트는 불변**) → 성공 증거(`passes N/N`) 있는 행만 verdict 부여(기계는 장부가 안 한 인증을 안 함) → 절 보강 → gate 밖 괄호 kind 기록의 괄호 제거 → scalar repeat→scale map → **digest-less 이력을 `legacy-unbound` 사이드카 행으로 실체화(digest 소급 날인 없음, §11)** → 버전 스탬프 → **full validation, 실패 시 전량 자동 원복**(회귀 케이스가 트리 해시 동일성으로 증명). 멱등: 두 번째 실행은 "nothing to do".
- scope가 사이드카의 `legacy-unbound` verdict 행을 legacy로 집계(절대 stale 오분류 없음), 구 schema 프로젝트에서 새 키는 코드 기본값으로 degrade(`schema_ver`).
- **UPGRADING.md 신설** — 사용자 절차서.
- 실광산 `--check` 실측(read-only): 항목 4개 — 버전 스탬프 2 · scalar repeat · **244개 검증 unit의 legacy-unbound 실체화**. id는 이미 canonical이라 rename 0.

검증: `bash -n` 통과 · 신규 15케이스 그룹 GREEN 로컬(schema 3 · config 6 · upgrade/rollback 6) · 전수 241은 CI Ubuntu가 검증 · 개발 중 스스로 찾은 결함 2 — rollback이 생성 파일을 재백업해 원복을 오염(bkup이 created 목록을 건너뛰도록 수정), 그리고 **CI가 잡은 제품 결함**: 배포 템플릿 project.md가 `version: 1`로 남아 init 직후의 새 프로젝트가 버전 불일치로 차단될 뻔(`pass_shipped_templates`가 정확히 그 조합을 지킴).

## 2026-08-02.7

**CI 첫 실행이 잡은 3건 수리.** Phase 2에서 신설한 GitHub Actions의 첫 run이 곧바로 값을 했습니다 — ShellCheck 오류 1건(`$k[[:space:]]`가 배열 확장으로 오독되는 SC1087, 중괄호로 수정 — 동작 무변경), ko_KR 로케일 없는 runner에서의 케이스 실패 2건(`locale`은 빈 출력이 설계상 정상인데 smoke가 개발 머신을 단정하고 있었음 → 계약만 검증하도록 수정(정확한 계약은 "코드+exit 0 **또는** 빈 출력+exit 1" — run 2가 후자를 가르쳐줘서 두 라운드 걸림) · `pass_locales`는 CI에 locale-gen을 추가해 진짜 로케일 비교로 유지). 부수 실측: **같은 226케이스가 Ubuntu에서 65초, Windows Git Bash에서 ~35분** — WD-PERF-001의 "MSYS process spawn 비용이 주범" 진단이 CI로 입증됐습니다.

검증: `bash -n` 통과 · 영향 케이스 로컬(locale 2 · verify_section 1 · smoke 6) · 전수는 CI Ubuntu run이 push마다 65초로 수행.

## 2026-08-02.6

**완전성 보증이 문구가 아니라 배선이 됩니다 (WD-COR-004) — Phase 1 종료.** gaps.md는 지금까지 "never a hard failure"였고, README는 조건 없이 "no silent gaps"를 약속했습니다 — 배선과 문구가 서로 달랐습니다. 이제 둘이 일치합니다.

- **`fidelity.completeness: required`가 gap 레지스터를 gate 입력으로 만듭니다** — consecrated 출력이 있는데 gaps.md의 `# Open`에 항목이 남아 있으면 validate가 차단합니다. gaps.md 자체가 없어도 차단합니다: 한 번도 돌지 않은 워런티는 워런티가 아닙니다(게이트 기록 부재와 같은 fail-closed 규칙). `# Accepted`는 결정이므로 차단하지 않습니다.
- **기본값(off)은 그대로** — fill-or-accept, 비차단. 대신 침묵하지 않습니다: `status`가 "completeness: off — omissions are not checked"를 찍고, `consecrate` 성공 출력에도 같은 한계가 붙습니다. "보고된 갭 0"이 "갭 없음"으로 읽히는 것을 막습니다.
- **보증 문구 통일** — README 태그라인과 METHODOLOGY §7 워런티가 "검출된 contradiction은 조용히 출하되지 않는다"로 조여졌고, 완전성 보증은 required일 때만 주장합니다. FORMATS의 gaps.md 항목도 "Non-blocking by default"로 정정.

실광산 영향 없음(documents 비어 있음 → 검사 미발동; status에 off 고지 한 줄 추가).

검증: `bash -n` 통과 · 회귀 **217/217**(신규 6) · schema 불변.

## 2026-08-02.5

**Review가 검토한 바이트에 결속됩니다 — seal-review · consecrate · gate digest (WD-COR-002).** 지금까지 gate는 "clean review가 존재한다"까지만 봤고, 그 review가 **지금 이 final의 바이트**를 검토했다는 증거는 없었습니다. clean review 뒤에 draft를 고쳐 final로 복사해도, final을 직접 고쳐도, 인용된 truth·source·config가 바뀌어도 gate는 초록불이었습니다. 이제 전부 잡힙니다.

- **`weavedoc seal-review <doc-id> [draft|final]` 신설** — 라운드가 검토한 바이트(`reviewed_digest`: 단일 파일 raw bytes, 트리는 정렬 relpath `path\0sha256\n` manifest 재해시)와 판정의 지반(`review_context_digest`: cited truths · source materials · config · schema)을 review.md frontmatter에 고정합니다. 계산은 도구가, 손으로는 절대.
- **`weavedoc consecrate <doc-id>` 신설 — final의 유일한 쓰기 경로.** gate 비움을 validate와 같은 reader로 재확인 → seal·draft·context 대조 → 같은 filesystem에 candidate staging → **candidate를 final 자리에 둔 채 full validation 정확히 1회** → 성공 시 atomic promote, 실패 시 원본 final 바이트 그대로 보존. 수동 복사와 사전 validate(2회 실행 bridge)는 스킬에서 금지로 명시.
- **validate가 결속을 강제합니다** — sealed review의 digest와 final 바이트가 다르면 hard fail("Nobody reviewed the bytes that are about to ship"), context가 움직였어도 hard fail. digest 없는 v1 review는 `legacy-unbound`: `review seals:` 줄로 세어 보이되 차단하지 않습니다(migration train — v2 강제는 Phase 3에서).
- **context의 material은 status-제외 digest로** 해시합니다 — consecration 직후 refine이 찍는 `used` 스탬프가 방금 통과한 review를 소급으로 stale로 만들면 정상 흐름이 자폭하기 때문입니다(`pass_gate_context_survives_used_stamp`가 고정).
- 다중 파일 final/은 내용 변경·추가·삭제·rename 네 방향 전부 한 digest로 잡힙니다.
- review 스킬은 매 라운드 후 seal, refine 스킬 step 9는 consecrate 호출로 바뀌었습니다.

실광산 영향 없음 — documents가 비어 있어 결속 대상 final이 없습니다.

검증: `bash -n` 통과 · 회귀 **211/211**(신규 17 · meta 로스터 +4 판정자 · 세션 강제종료로 오염된 1건은 단독 재실행 PASS) · 형식 추가는 review frontmatter 선택 필드 3종과 examined 아래 `review seals:` 줄.

## 2026-08-02.4

**검증에 digest가 생겼습니다 — `verify-ledger.tsv` 사이드카와 `attest` (WD-COR-003).** 지금까지 "verified"는 장부에 이름이 있다는 뜻이었지, 그때 검증한 바이트가 지금의 바이트라는 뜻이 아니었습니다. verified truth를 한 글자 고쳐도 장부는 몰랐습니다. 이제 검증 기록이 내용에 결속됩니다.

- **`truths/verify-ledger.tsv` 신설** — machine-owned 사이드카. append-only TSV(id·sha256·verdict·round·standard·date), **id당 마지막 행이 이깁니다** — 재검증은 append고 라운드 이력은 남습니다. 쓰는 손은 `weavedoc attest` 하나뿐입니다.
- **`weavedoc attest <verified|failed> <round> <standard> <id...>` 신설** — digest 계산의 단일 철자. all-or-nothing(해석 안 되는 id 하나면 0 byte 기록), tombstone 거부, verified verdict는 `## Verified units`에 사람용 미러 줄을 함께 삽입.
- **digest 규칙** — truth는 파일 raw bytes 전체. material은 converted.md에서 **frontmatter `status:` 줄만 제외** — refine의 `used` 스탬프가 검증을 무효화하면 COR-001이 가른 두 축이 도로 붙기 때문입니다. 수동 수정·에이전트 실수·정상 re-map이 digest에는 전부 똑같이 보입니다.
- **`scope`가 5개 증거 등급으로 집계합니다** — verified(digest-bound) · legacy-unbound · stale · failed · unverified. **라운드의 부채 = unverified + stale + failed.** digest 없는 v1 기록(자료 frontmatter `verified`, markdown 장부 행)은 `legacy-unbound`: 보존되는 이력이되 바이트를 묶지 않으므로 verified로 세지 않습니다(§11 결정 — blind stamp 금지). 위험도순 재검증 대상입니다.
- **tombstone(retracted/discarded) truth가 모집단에서 빠집니다** — retracted material과 같은 규칙. 구 scope는 tombstone 3건을 갚을 수 없는 부채로, tombstone 커버리지를 verified로 각각 오계수하고 있었습니다.
- 구버전 schema 프로젝트(테스트베드 혼용)에서는 새 schema 키가 코드 기본값으로 degrade합니다.
- 스모크에서 MSYS `sha256sum`의 binary-mode 출력(`hash *file`)이 배치 digest 파서를 침묵 무력화하는 결함을 발견·수정했습니다 — 별표가 id에 붙어 모든 truth가 전 bucket에서 사라지는 형태였습니다.

실광산(238 live): 자료 22 verified → **legacy-unbound**, truth 224 verified → **201 legacy-unbound**(23은 tombstone/ghost 커버리지 정정), 미검증 40 → **37**(3건이 tombstone), ghost 2건(t083·t211) 지목 유지. 부채가 늘어난 게 아니라 **이제 정직하게 분류**된 것입니다.

검증: `bash -n` 통과 · 회귀 **194/194**(신규 10 · 갱신 3 · meta 로스터 +5 판정자) · 실광산 scope 재실행 ✓ · validate는 사이드카 옆에서 clean(`pass_attest_validate_clean`).

## 2026-08-02.3

**`used`는 검증이 아닙니다 — `scope` 상태축 수정 (IMPROVEMENT_PLAN WD-COR-001, Phase 1 착수).** material의 한 축 `status`에 lifecycle(`used`)과 검증 판정(`verified`)이 같이 살면서 `scope`가 `verified|used`를 한 묶음으로 세고 있었습니다. refine의 consecration은 `verified`를 `used`로 **덮어쓰므로**, verify를 건너뛴 자료도 문서에 한 번 인용되는 순간 검증 부채가 영구히 사라지는 구조였습니다.

- `scope`는 material 검증을 이제 **자료 자신의 `status: verified`에서만** 읽습니다. `used`는 부채로 계산되고, 부채 목록 아래 `(N of them status:used — \`used\` records citation, not verification; a verify round still owes them)` 한 줄이 이유를 찍습니다.
- `## Verified units`의 m-id는 material 검증의 근거가 되지 않습니다 — 그 장부는 truths 레인(추출 검증, converted↔truths)이고, material 검증(원본↔converted)의 v1 기록은 자료 frontmatter가 유일합니다(verify 스킬 §State). 신규 케이스가 이 구분까지 고정합니다: pristine 장부가 m001을 이름하지만 used 자료는 그래도 부채입니다.
- 검증 판정이 `used` 스탬프를 살아남는 구조(별도 verification 기록 + content digest + `legacy-unbound`)는 다음 작업 단위(WD-COR-003)입니다 — 이 번들은 잘못된 초록불만 먼저 끕니다.
- FORMATS의 material `status` enum에 `used` 뜻풀이를 추가했습니다(lifecycle이며 판정이 아님).

검증: `bash -n` 통과 · 회귀 **184/184**(신규 2: `acct_scope_used_unverified` · `acct_scope_verified_evidence_only`) · 실광산 scope 출력 불변 — used 자료 0건(문서 절반 미가동)이라 첫 consecration부터 물었을 버그를 그 전에 제거 · schema 불변.

## 2026-08-02.2

**주석 정리 — 코드 무변경.** `bin/weavedoc`의 주석이 40%(950줄)까지 불어 있었고, 그 대부분이 "이 줄을 간단히 고치려다 뭐가 깨졌다"는 회귀-방지 서사였습니다. 그런데 산문 경고는 실제로 회귀를 못 막았고(통일 지시 주석이 있었는데도 감사 라운드마다 재발), 막은 건 테스트였습니다 — 즉 가장 약한 매체로 회귀 방지를 하고 있었던 셈입니다. 그 서사를 걷어내고 **불변식 한두 줄 + KNOWN LIMIT**만 남겼습니다.

- 주석 **950 → 567줄**(40% → 28%). **코드는 1400줄 그대로** — 각 편집이 코드 줄은 건드리지 않고 주석 줄만 교체했으므로 코드 무변경은 기계적으로 보장됩니다.
- 원칙: 블록마다 "무엇을 하는가/어떤 불변식인가" 한두 줄과, 코드가 의도적으로 불완전한 지점(`KNOWN LIMIT`)만 유지. `in a real run …`·`used to …` 같은 재현 서사는 삭제. 명령 doc·게이트 구역 규칙 설명·재정 근거는 남김.
- awk 프로그램 내부 주석은 전체가 작은따옴표(`'…'`) 안이라 아포스트로피 하나로 문자열이 깨지므로, 그 규칙을 지켜 압축.

검증: `bash -n` 통과 · 회귀 **182/182** · 실광산 재검증 불변(scope·validate 출력 동일). 형식 변경 없음(스킬·schema·FORMATS 불변).

## 2026-08-02.1

**검증 범위를 기계가 정합니다 — `weavedoc scope` 신설.** 이 번들은 결함 수정이 아니라 **운용 실패 한 건**에서 나왔습니다. 실광산 재검증에서 "이 라운드가 갚아야 할 truth가 무엇인가"에 기계가 답했어야 했는데 판단으로 답해서, **264건 전체에 콜드 리뷰어 5명을 세 라운드** 돌렸습니다. 실제 미검증은 40건이었고, 규격 §8의 재확인 등급표가 이미 같은 말을 하고 있었으나 열리지 않았습니다. 산문은 건너뛸 수 있고 명령은 못 건너뜁니다 — 그 차이가 이 번들입니다.

- **`weavedoc scope` 신설** — 미검증 집합을 계산해서 찍습니다. 자료는 각 자료 자신의 `status`에서, truth는 `truths/verify.md`의 `## Verified units`에서 읽습니다. verify 스킬은 이제 라운드 범위를 여기서 **읽고**, 이미 덮인 단위를 다시 검증하려면 이유를 먼저 `verify.md`에 적어야 합니다("확실하게 하려고"는 이유가 아님).
- **`## Verified units`는 줄 모양이 아니라 판정으로 읽습니다.** 실광산은 이 절을 표로, 배포 견본은 불릿으로 씁니다 — 표만 읽는 파서였다면 불릿 광산이 "전부 미검증"으로 나와, 이 명령이 막으려던 전수 라운드가 뒷문으로 조용히 되돌아왔을 것입니다. 항목은 **판정 단어 `verified`로 끝나야** 하고(schema `verify.units.verified`), 그 밖으로 끝나는 항목(`**미통과**`·`R3 미실행`·판정 없는 레거시 줄)은 **아무것도 덮지 않으며 이름이 찍힙니다** — 단어 하나 빠진 줄이 "아직 거기까지 못 간 장부"와 똑같이 보이면 안 되기 때문입니다. 부분 문자열 비교는 반대 방향으로 틀립니다(`unverified`가 `verified`를 품음). 게이트 구역 규칙이 이미 배운 것과 같은 교훈 — 줄이 아니라 토큰을 봅니다.
- **리뷰어 수는 하한이자 상한입니다.** 레벨의 수 + 필요 시 방어자, 그 밖은 없음. **적으면** 두 렌즈를 한 명이 겸해 판정표에 아무도 따로 안 본 줄이 PASS로 올라오고(PARTIAL이 PASS 옷을 입음), **많거나 단위별로 뿌리면** 비용만 범위 크기만큼 곱해집니다 — 수는 라운드당이지 truth당이 아닙니다. 현행 모델 계층이 양방향으로 어긋나므로(한 쪽은 서브에이전트를 덜 부르고 다음 쪽은 더 부름) 해석 대상이 아니라 수치로 못박습니다.
- verify 스킬의 대상이 "all truths"에서 `scope`가 지목한 집합으로 바뀌었습니다. T2(자료 단위 coverage)·T5(소비자 시점)는 본래 광산 전체를 보는 렌즈라 예외로 명시했습니다. **레벨은 여전히 광산 전체 부피에서** 읽습니다 — 범위 부피로 읽으면 작은 배치로 자라는 광산이 T5를 한 번도 못 돌립니다. 범위는 *어느 단위*를, 부피는 *렌즈 몇 개*를 정합니다.

검증: 회귀 **182/182**(신규 케이스 4 포함) · 실광산 ✓ `자료 28 · truth 264 (264 sealed)`, `scope`가 미검증 truth 40건·자료 6건과 파일 없는 장부 id 2건을 지목.

## 2026-08-01.6

**Round 7 (부분 라운드) — critical 1 + 2건.** 리뷰어 4명 중 3명이 API 한도로 중도 종료, 방어자 미실행. 완주한 적대적 리뷰어(②)의 발견만 처리했고 그 사실을 여기 남깁니다.

- **C1 — `.5`가 만든 `section_all`이 레벨 인자를 받아, 레벨1 리더가 *더 깊은* 제목에서도 절을 끝냈습니다.** 장부는 라운드를 소제목으로 묶는 것이 정상 모양인데(실광산 verify.md가 그렇게 씁니다), `# Human queue` 아래 `## 라운드 2`를 두면 본문이 빈 채로 나와 **소유권 검사가 0회 실행되고 `✓ all checks passed`**가 났습니다. `### Human queue`는 두 리더 어느 쪽도 못 읽었습니다. 이제 **레벨 무관**으로 제목을 찾고 **같거나 얕은 제목에서만** 절을 끝냅니다(소제목은 안에 남음). R6-C2를 고친 함수 안에서 같은 부류가 한 축 남아 있었던 것 — "통일했는데 한 자리" 형상의 재발입니다.
- **`impact`가 관대한 id 철자에서 blast radius를 비웠습니다.** `source: m1`(폴더 m001)이면 네 절 전부 빈 결과 — 철회 직전 확인 지점입니다. `source`와 `cited_truths` 양쪽을 canon 비교로 맞췄습니다.
- **census가 `## legacy`를 첫 절만 읽었습니다**(validate는 전부 읽음) → 두 번째 블록의 면제가 영구 미반영. `section_all`로 통일.

검증: 전체 **178/178** 클린 와이프 · 실광산 ✓ `255 sealed` · census·status 전부 불변.

## 2026-08-01.5

**Round 6 전체 (확인 17건) — critical 2 깊게, 나머지 15 가볍게 한 판.**

- **C1 게이트, 철자 축**: 구역 규칙의 토큰 비교를 **정규화**(대괄호 안을 소문자 영숫자로 접어 비교) — `[missing required]`·제로폭 공백 등 철자 변형 전부가 규칙 하나로 수렴. **어휘 경계 재정**: kind는 고정 영어 토큰 3개뿐이고, `[모순]` 같은 어휘 밖 괄호는 산문(보증 밖, claim-vs-body와 같은 재정) — 절 안에서는 여전히 fail-closed. FORMATS 명문화, 케이스 3.
- **C2 Human queue**: 반복 절이 적법한 장부인데 첫 절만 읽혀 뒤 라운드의 열린 항목이 status·validate 양쪽에서 동시에 안 보였음 → `section_all`로 전 절 읽기 + `section_body`의 인접-반복 재진입 버그 수정. 케이스 1.
- **메타 가드 소생**: `meta_` 접두가 케이스 선택기에 없어 `.2`의 가드가 한 번도 실행된 적 없었음(그동안의 "170/170"은 그만큼 과장) → 선택기에 추가, 이제 돕니다.
- **census 셋**: legacy 차감을 분자와 같은 모집단으로 · retracted 판정을 양변 모두 `fm` 하나로 · 0-truth 분기도 distinct id 계수로.
- **가볍게 처리한 나머지**: 게이트 차단 메시지가 첫 항목을 지목(S3) · `impact`가 `cited_truths`를 경유해 발행 라벨 문서도 blast radius에 잡힘(S8) · `audience`/`publication_labels`(plan)·`gap_density`(project)에 주소 부여 — schema optional + 템플릿 + 스킬 필드명(S9) · 봉헌 go-ahead는 Human queue 아래 HTML 주석으로 기록(S10) · refine이 catalog.md status 열도 갱신(S11) · 반쯤 쓴 견본 한계 서술을 실제(꺾쇠+중괄호)로 정정(S2) · `- (없음)` 오계수 제거(N1) · plan 즉답 라우팅(N2) · Trigger A의 충돌 수리 1라운드 비용 명문화(N3) · required_tag 메시지에 ask 루프 경로 추가(N4).
- `.2`의 실광산 근거 문구 정정: eclypse는 documents/가 비어 게이트 계열이 실행되지 않으므로 그 러닝은 truths 절반의 무회귀 근거만 됨(아래 `.2`에 표기). `.4`는 VERSION만 올라갔던 것 — 내용은 두 재정(verify.md 부재 적법+status 보고 / untagged 어휘 단일화)이며 이 항목이 그 기록임.

검증: 직접 영향 케이스 17/17. (전수·실광산은 다음 큰 경계에서 1회.)

## 2026-08-01.3

**Round 5의 나머지 전부 — 문서 6 · nice 5 · 재정 1.** 이로써 R5 확인 19건이 모두 닫혔습니다.

### 재정 — 쓰다 만 견본 줄은 위반입니다 (사용자 재정)

kind 슬롯만 `{kind}`로 남고 **나머지는 다 작성된** 줄(`- [{kind}] 3장 — 초안 30% vs t001 10%`)이 "아직 안 쓴 견본"으로 조용히 버려지고, 절 안에 있는데도 `final.md`가 나갔습니다. `.12`가 프런트매터에 대해 내린 판정("미작성 자리표시자는 지시문이지 값이 아니다")과 정반대였고, 게이트가 마지막 남은 반대편이었습니다.

판별은 **나머지가 결정합니다**: 견본의 나머지는 그 자체가 자리표시자(`{where} — {what}`, gaps의 `scope:`·`recheck:` 라벨 포함)이므로, 나머지에 자리표시자가 없고 실내용이 있으면 쓰다 만 항목입니다. 슬롯 뒤에 아무것도 없으면 여전히 견본. 닫는 `]`가 없는 경우 슬롯 자신의 `}`가 "아직 견본"으로 오독되던 것도 같이 막았습니다. **좁게 한정**: 슬롯에 kind 흔적이 있는 근사 오타(`<Contradiction>`·`<contradiction / unsupported>`)는 건드리지 않습니다 — 그건 근사 안내 루프의 관할이고 그쪽 메시지가 더 낫습니다. 명시된 한계: 산문이 스스로 각괄호 토큰을 품으면(`값이 <10%>다`) 옛 판정으로 낙하합니다(새 거짓 차단 방향으로는 절대 안 갑니다).

### 문서 6건

- **S7** `templates/plan.md:13`이 아직 옛 어휘 — `.10` S10의 "세 곳 통일"이 **반쪽 거짓**이었습니다(예시 줄만 고치고 **지시하는** 설명 줄을 놓쳤고, 사용자가 읽는 건 설명 줄입니다). `.10`에 정정 표기를 달았습니다. regress의 pristine 노트도 동반 수정.
- **S8** 자기 write-scope가 금지한 쓰기를 지시하는 스킬이 셋이 아니라 **넷**이었고, `.10`이 그중 하나(refine의 `status: done`)를 넓혔습니다. 저장소가 이미 쓰는 괄호 예외 관용구를 네 자리(map·gaps·refine·review)에 붙여 한 판에 닫았습니다.
- **S9** `supersedes`가 "더 최신 날짜"로 해소하는데 **자료 자신의 날짜 필드가 없었습니다** — `added`는 입고 순서라 일괄 입고면 전부 같습니다. 그래서 한 독자는 사용자에게 묻고 다른 독자는 본문에서 날짜를 읽어 자동 해소해 **반대 승자**를 냈습니다. `dated`(선택, 자료 자신의 날짜)를 신설하고 **`supersedes`가 정렬할 수 있는 유일한 필드**로 못박았습니다. 없으면 그 규칙은 적용 불가 → authority → 질문으로 내려갑니다. validate가 날짜 형식을 검사합니다(이 값이 충돌 승자를 정하므로).
- **S10** 열린 Human queue 항목이 봉헌을 막는지 **어느 문서도 안 말했습니다**(두 사용자가 문서 출하 여부 자체를 다르게 결정). 재정: **막지 않습니다**(게이트가 유일한 차단 막) — 대신 **refine이 봉헌 직전에 열린 항목을 나열하고 명시적 동의를 받습니다.** 안 읽고 넘어가는 것이야말로 큐가 가로채려던 기계 판단이 한 층 위에서 반복되는 것입니다.
- **S11** ask 루프가 **자기 문서를 stale로** 만들어 질문 하나당 콜드 라운드 하나가 강제됐습니다(아무도 안 적음). 좁은 예외 신설: 문서 D의 ask 루프가 만든 `user-answer` 자료에서 나온 truth는 D를 stale로 만들지 않습니다(구성상 D의 scope 안이고, 같은 판에서 초안에 써 넣는 중이라 밖에서 온 드리프트가 아님). 다른 문서는 정상 전파, 그 답이 나중에 바뀌면 D도 정상 stale. 연결은 `questions.md`가 기록한 "어느 문서가 물었나"로 추적하고, 연결이 없으면 예외 없음.
- **S12** 인용의 사람용 절반이 **내부 자료 제목을 외부 문서에 강제**했습니다(문자 그대로 "user answer"까지). 계약 안에 탈출로가 없었습니다 — 지우면 문서화된 요구가 깨지고, 두면 광산 내부가 새어나갑니다. 재정: 외부 독자용일 때 **발행 라벨**을 쓸 수 있습니다. `plan`이 이미 묻는 audience에 걸어 두고, 기계 마커 `<!-- t:id -->`는 불변이라 게이트·`cited_truths`·전파는 무영향입니다. 라벨은 같은 출처를 출판 가능한 말로 부르는 것이지 다른 출처를 가리키면 안 됩니다.

### nice 5건

- **N1** `catalog.md` 부재가 자료↔카탈로그 고아 검사를 **양방향으로 조용히 끔** → 자료가 있는데 카탈로그가 없으면 이름을 부릅니다. **`verify.md`는 일부러 안 넣었습니다** — verify는 온디맨드 레인이라 부재가 적법하고, 막으면 첫 검증 전의 모든 광산이 실패합니다(부재를 **보고**할지는 형식 결정이라 Human queue에 남김).
- **N2** 인쇄되는 색인 수는 **줄**을 세는데 새 집합 대조는 `sort -u` — 중복 줄이 두 숫자를 어긋나게 하고 ✗는 없었습니다. 이제 distinct id로 세고, 중복이면 진짜 원인(같은 `id:`를 든 파일 둘)을 지목합니다.
- **N3** Human queue의 **하위 불릿**이 untagged 항목으로 보고돼, 따르면 항목 구조가 부서지는 처방이 나왔습니다. validate의 술어(열 0에서 시작하는 `- [`)를 그대로 재사용 — `- (없음)` 건과 같은 뿌리라 한 줄로 둘이 닫힙니다.
- **N4** 자리표시자 거부 규칙이 schema 주석에만 있고 **FORMATS(스스로를 사람용 거울이라 선언)에 0건** → 규약 절에 명문화.
- **N5** `decision_kind`에 standing-precedence(lazy authority)의 읽기가 없었습니다 — 기계가 기제를, 사용자가 순위를 발원하고 값 자체는 아무도 제안하지 않은 경우. **`ratified`로 확정**(우선 재검증 집합에 들어가는 것이 맞습니다 — 한 번 정한 규칙이 사용자가 못 보는 충돌들을 계속 결정하므로).

**회귀**: 신규 14케이스, 전체 **170/170** 클린 와이프. 실광산 ✓ `255 sealed` · census · status 전부 불변.

## 2026-08-01.2

**게이트 반전 — 구조 수정입니다.** 세 라운드 연속 같은 함수가 뚫린 원인은 개별 실수가 아니라 설계였습니다: "위반 항목처럼 생긴 줄"을 화이트리스트로 **인식**하려 했는데, 마크다운의 표면형은 무한해서 콜드 리뷰어가 올 때마다 새 변장이 하나씩 나오는 게 보장돼 있었습니다. 사용자 재정(2026-08-01)으로 부담을 뒤집습니다.

### 구역 규칙 — 모양은 더 이상 판정 대상이 아닙니다

> **kind 토큰(`contradiction`·`unsupported`·`missing-required`)이 대괄호 안에 있으면, 그 줄은 'Fidelity violations' 절 안에만 있을 수 있다. 절 밖이면 모양이 뭐든 차단.**

탐지 대상이 "무한한 항목 모양"에서 **schema가 소유한 단어 3개**로 바뀌었습니다 — 유한하고, 구성상 완전합니다. 대괄호 친 kind는 게이트가 행동하는 항목의 서명이고, 게이트 구역 밖의 그 서명은 주차된 위반이거나 잘못 쓴 기록이라 둘 다 정지가 맞습니다. 구현은 정규식 하나(`\[[^]]*(kind)`, 대소문자 무시)입니다. 강조·번호·인용·체크박스·표 — 어떤 옷을 입혀도 판정이 같으며, **표 행(`| [contradiction] | …`)처럼 아직 아무 라운드도 못 찾았던 모양까지 소급해서 닫힙니다.**

**경계 판정자는 하나입니다.** `fid_body`를 `fid_mark`(전 줄 안/밖 표시)로 리팩터링해 게이트가 읽는 안쪽과 구역 규칙이 검사하는 바깥쪽이 **같은 한 판정의 보수**가 되게 했습니다 — 제3의 상태가 생길 수 없습니다. `gate_entry()`(3라운드 연속 뚫린 그 함수)는 호출자가 없어져 삭제. 근사-kind 안내는 절 안으로 스코프(밖은 구역 규칙이 더 강한 메시지로 말함), 화살표 인계철선의 계수도 같은 정규식으로 통일.

**형식 변경 — 기록은 kind를 괄호 없이 씁니다.** adjudications·Findings 산문·Human queue가 위반을 *언급*할 때는 `- fixed: contradiction — …`처럼 맨 단어로 씁니다. 괄호 친 형태는 이제 차단되고, 메시지가 적법 철자를 가르칩니다. FORMATS와 review 템플릿에 명문화.

**은퇴한 한계**: "대괄호 앞에 단어가 있으면 안 센다"(`.9`의 명시된 한계와 그 대괄호 쌍둥이)는 조용한 통과에서 **시끄러운 차단**으로 은퇴 — `.9`에 은퇴 표기를 달았습니다. 수용된 거짓 양성 하나를 명시합니다: 미닫힘 대괄호 안의 kind 언급(`- [TODO contradiction 처리…`)은 `]`를 안 친 항목과 구분 불가라 차단됩니다. 탈출은 한 타(괄호 제거)이고 메시지가 말합니다.

### 메타 가드 — "통일했다는데 한 자리가 빠졌다"를 스위트가 감시합니다

키 철자 세 물결·fence 두 자리·게이트 세 라운드의 공통 뿌리는 bash/awk 2,000줄에서 같은 규칙의 복제를 막을 장치가 없다는 것이었습니다. 이제 회귀 스위트에 **바이너리 자체를 검사하는** 케이스가 있습니다: 공유 판정자 8종(is_noise·has_fm·fid_mark·fid_body·nocomment·canon_id·is_placeholder·req_value)이 정확히 한 번씩 정의되어 있는지, 인라인 fence 판정이 0개인지, 엄격 키 철자 패턴(`^key:`)이 되살아나지 않았는지. 드리프트가 생기면 콜드 리뷰어가 찾기 전에 스위트가 먼저 실패합니다.

**회귀**: 케이스 전면 개편 — 주차 차단 케이스 15곳이 구역 메시지로, 옛 "명시된 한계" 케이스 5개가 차단으로 뒤집힘(각각 괄호 없는 적법 철자의 통과 케이스 동반), 신규 7(표 행·미선언 제목·맨 단어 통과·TODO 수용 오탐·화살표 안/밖 분리·메타 가드). 전체 **158/158** 클린 와이프. 실광산 ✓ `255 sealed`·census 불변 (`fid_body` 리팩터링 무회귀).

## 2026-08-01.1

**Round 5의 critical 2건 + 코드 should-fix 5건.** 4관점 리뷰어 + 방어자 완주 결과는 FAIL(확인 19건)이었고, 기계 쪽을 여기서 닫습니다. 문서 쪽 7건은 다음 판입니다.

### C1 — 게이트가 세 번째 라운드 연속 같은 함수에서 뚫렸습니다

`gate_entry`가 못 세는 모양이 네 개 더 있었습니다: **강조**(`- **[contradiction]**`)·**인라인 코드**(`` - `[contradiction]` ``)·**태스크 체크박스**(`- [ ] [contradiction] …`, `- [x] …`). 넷 다 마크다운이 **평범한 위반 목록으로 렌더링**하고 `is_noise`가 항목이라 판정하는데, 절 밖에 주차하면 아무도 못 봐서 `열린 위반 + final.md + ✓ EXIT=0`. 두 자리를 고쳤습니다 — 접두 화이트리스트에 강조/인라인코드 마크업을 넣고, 첫 슬롯이 **체크박스 어휘**(빈칸·공백·x·X)일 때만 대괄호 하나를 전진합니다.

**방어자가 경고한 함정 둘을 다 피했습니다**: (a) 접두를 그냥 느슨하게 하면 명시된 한계(`- 3장 [contradiction]`·`- fixed: [contradiction]`)가 거짓 차단되고, (b) **마지막** 대괄호를 읽으면 Findings(`- [critical] … [contradiction] …`)와 Human queue(`- [open] [recommended] … contradiction`)가 주차된 위반으로 계수되어 이 프로젝트의 리뷰 파일 자신이 게이트를 막습니다. 22개 모양을 양방향 실측해 둘 다 안 밟았음을 확인했습니다.

**한계 문장을 넓혔습니다**: `- [3장] [contradiction] …`는 이미 명시된 한계 `- 3장 [contradiction] …`의 **대괄호 쌍둥이**라 계속 미계수입니다 — 둘을 다르게 판정하면 한계가 스스로 모순합니다.

### C2 — 마지막 truth 파일을 지우면 검사 넷이 통째로 꺼졌습니다

`ls truths/t[0-9]*.md`가 실패하면 그 안의 모든 것이 건너뛰어져, `index.md`와 `coverage.md`가 **지워진 truth를 계속 지목하는 채로** `✓ all checks passed` EXIT=0. "truth가 0"은 검사할 게 없다는 뜻이 아니라 **그 검사들이 할 수 있는 가장 강한 말**입니다. 큰 awk 한 판(봉인 포함)은 그대로 가드 안에 두고 — truth가 없으면 봉인할 것이 없는 게 맞습니다 — truth 개수와 논리적 의존이 없는 셋을 밖으로 뺐습니다: `required_tags` 커버리지 · index/tree 존재 + 집합 대조 · coverage 교차검사. census 쪽 조기 return도 같이 고쳤습니다(방어자가 **바로 이 상태를 위해 쓰인 도달 불가 arm**을 코드에서 찾아냈습니다 — 미완성이라는 코드 자신의 증언).

부수로 `tsrcpairs` awk가 빈 글롭을 리터럴 파일명으로 받아 **fatal로 죽던 것**도 막았습니다.

### census 셋 — 반드시 한 판에

- **S5 분자/분모가 서로 다른 모집단**을 셌습니다. 존재하지 않는 자료의 절(`## m099`)이 분자에 들어가 `2/2`(손계수 1/2), 반대로 밀면 `2/1`. 이제 **한 모집단**(실존 `converted.md` − retracted) 위에서만 셉니다.
- **S4 `## legacy`의 관대 철자**(`- m3` for `m003`)가 canon을 안 거쳐 retracted 스킵이 발화할 수 없었고, 분모가 **애초에 들어있지도 않은 자료를 두 번 차감**했습니다. 장부는 닫혔다고 읽히는데 살아있는 자료가 기록을 하나도 안 갖고 있었습니다.
- **S6 지울 수 없는 ✗**: `n_legacy == 0`이 "하나도 파싱 못 함"과 "전부 파싱된 뒤 retracted라 스킵됨" 두 상태에서 똑같이 나와, 규정 서식 그대로 쓴 줄을 "malformed"라고 했습니다. 처방은 "이미 쓴 대로 쓰라"였습니다. 파싱 개수(`n_legparsed`)를 따로 셉니다.
- **`numerator exceeds denominator` ✗의 서술도 다시 썼습니다** — 두 원인 중 하나는 이제 발생 불가(그 절은 아예 안 세어짐)라, 있을 수 없는 원인을 대는 문장이 두 독자를 없는 문제 찾기로 보냈습니다.

### S2 — 도구의 유일한 쓰기가 파일을 훼손하면서 성공을 보고했습니다

`.11`이 넣은 행미 보존이 **닫는 `]`가 없을 때** `sub()`가 아무것도 못 벗겨 `tail`에 원본 줄 전체가 남았고, `tags: [위약` → **`tags: [벌칙]tags: [위약`**. 이제 `sub()`의 **반환값**을 봅니다 — 미닫힘이면 줄을 **그대로 둡니다**(건너뛰면 줄이 삭제되어 더 나쁩니다). 수리 경로는 validate에 새로 넣었습니다: 리스트꼴 필드의 대괄호가 그 줄에서 안 닫히면 이름을 부릅니다. (리뷰어 ②가 적은 "`pull`이 죽는다"는 방어자가 실측으로 정정했습니다 — 죽지 않습니다.)

### S3 — 여덟 번째 자리

`resolution` flow 객체의 `scope:`가 `.7`/`.9`의 키 철자 통일에서 빠진 마지막 한 자리였습니다. `scope : [금액]`이면 scope가 조용히 사라져 **READ.md를 따르는 소비자가 부분 대체를 전면 대체로** 읽습니다 — 반대 사실입니다. R4-C3가 이 객체의 일곱 자리를 닫았고 이것이 여덟 번째입니다.

**회귀**: 신규 16케이스(C1 차단 4 + 함정 대조 3 / C2 차단 2 / census 5 / S2 1 / S3 1), 전체 **151/151** 클린 와이프. 실광산 ✓ `255 sealed` · `coverage records 17/27` **둘 다 불변**.

## 2026-07-31.12

**Round 4 Human queue의 정책 결정 4건 — 사용자 재정.** 방어자가 "기계가 정할 수 없다"고 올린 것들이고, 넷 다 확정됐습니다. 이로써 R3·R4의 장부가 완전히 비었습니다.

### ① 판정줄이 계약입니다 (C2 등급 규칙 — 규칙 기록)

같은 모양을 두 라운드가 다르게 판정했습니다: R3-H1(`source :`)은 계정 줄이 `0 sealed ← 1 NOT checked`로 정직하다는 이유로 **high**, R4-C2(`--- `)는 전용 알람이 꺼졌다는 이유로 **critical**. 재정: **돌았어야 할 검사가 안 돌았는데 도구가 깨끗한 판정(`✓`, exit 0)을 찍으면 critical** — 옆의 계정이 아무리 정직해도. 근거는 소비자입니다. 스크립트는 exit code를, 지친 사람은 체크표시를 읽습니다. 계정 줄은 **정보**이지 보증이 아니라, 안 돈 막 위에 찍힌 초록을 낮춰 주지 않습니다. 특히 **막**(봉인·게이트)이 조용히 안 돈 경우는 무조건 critical. 양방향입니다 — 실제로 돌고 정확히 보고한 검사는 메시지가 불친절하다는 이유만으로 critical이 되지 않습니다(should-fix). `reviewers.md`의 등급 정의 바로 아래에 못박아 다음 방어자가 재론하지 않습니다.

### ② coverage는 장부 개수이지 완전성 보증이 아닙니다 (S4 — 라벨·문서)

`coverage 17/27`은 "17개 자료를 다 캤다"가 아니라 "17개 자료가 coverage.md에 기록을 최소 한 줄 갖는다"입니다 — 요소 50개 중 1개만 적어도 그 자료는 셉니다. 추출이 **완전한가**는 다른 축(gaps 스킬의 enumeration·symmetry, truths verify 레인)이 이미 소유하고 있고, 그 판정을 census에 중복시키면 **한 질문에 판사 둘** — 이번 두 콜드 라운드가 계속 잡아낸 그 모양을 새로 만드는 셈입니다. 그래서 검사를 늘리는 대신 **오독할 수 없게 이름을 붙였습니다**: `coverage records 17/27 material(s)`. FORMATS·README에 "장부 개수이지 보증이 아니다"와 완전성의 소유자를 명시했습니다.

### ③ 미치환 자리표시자를 거부합니다 (좁게)

`tone: {the project tone, copied here, …}`가 "값이 있음"으로 통과하고 **write가 그 안내 문장을 문서의 톤으로 읽었습니다**. review.md 항목은 처음부터 미터치 템플릿 규칙(`is_noise`)이 있었는데 frontmatter 필드에는 없었습니다. 이제 필수 필드의 값이 **통째로 중괄호 한 덩어리**면 거부합니다.

- **좁습니다**: 값이 중괄호를 *포함*만 하는 것은 실제 내용이라 안 건드립니다(`tone: {담백} 유지` 통과). 자리표시자 **목록**(`tags: [{tag1}, {tag2}]`)은 `[`로 열려 대상이 아닙니다. 탈출로는 메시지가 말합니다 — 중괄호 밖에 아무 문자나 두면 됩니다.
- **판사는 하나**: 패턴이 schema(`fm.placeholder`)에 있고 셸 쪽 `req_value()`와 truth를 읽는 awk가 **같은 값을 읽습니다**. R4가 세 번 연속 잡아낸 "규칙은 통일했다는데 자리가 빠졌다"를 이번엔 만들지 않았습니다. 적용은 project·material·truth·plan 네 종 전부.

### ④ 인계철선 관할은 kind를 품은 내용까지 (S1 — 현행 유지, 근거 기록)

"주석 안은 설계상 안 보인다"의 예외인 중간-화살표 인계철선의 관할을 **kind를 품은 내용**으로 확정했습니다. 산문 메모만 삼킨 중간-닫힘은 계속 침묵합니다 — 게이트의 보증 대상은 위반이고, 메모 손실은 보증을 깨지 않습니다. 모든 중간-닫힘으로 넓히면 보관 노트 속 `-->` 하나하나가 오류가 되어 그 소음이 이 검사가 존재하는 단 하나의 신호를 흐립니다. 코드 주석에 재정과 근거를 남겼습니다.

**회귀**: 신규 5케이스(자리표시자 3종 차단 + 중괄호 포함 값 통과 + 자리표시자 목록 무영향), 전체 **135/135** 클린 와이프. 실광산 ✓ `255 sealed` 불변 — **자리표시자 검사의 거짓 차단 0건**, coverage는 라벨만 `coverage records 17/27`로 바뀜.

## 2026-07-31.11

**nice급 잔여 12건 전부 — 콜드 라운드 3·4의 확인 목록이 이것으로 비었습니다.** 남은 것은 Human queue의 정책 결정 4건(사용자 몫)뿐입니다.

### 숫자의 정직 (R3-N1·N2, R4-N3·N4·N5)

- `status`의 materials가 **폴더 수**, validate가 **converted.md 수**를 세서 같은 광산에서 2 vs 1 → 한 정의(디스크의 converted.md)로 통일하고, 폴더 수가 다르면 그 차이를 **보여줍니다**("N folder(s) without converted.md — validate names them").
- 소유권 태그 없는 `- [open]`이 총계엔 들고 3버킷·untagged 어디에도 없어 `open 5 — 2·1·1`처럼 합이 조용히 어긋남 → 나머지를 "N missing an ownership tag (validate rejects these)"로 표시.
- census의 index 교차검사가 **개수만** 비교해 매달린 항목과 미색인 파일이 상쇄 → **집합 비교**로: 양쪽을 각각 id로 지목합니다.
- 같은 자리의 처방이 해소 불가 루프였던 것(frontmatter 없는 파일은 reindex가 영원히 못 봄)도 함께: "돌아오면 validate가 거부하는 파일이다 — validate를 돌려라"로 안내가 이어집니다.
- 합계 가드 메시지에 가장 흔한 셋째 원인(enum 밖 status) 병기.

### 도구의 손버릇 (R4-N2, R3-N3·N6)

- `retag`가 재작성 줄의 **행미 YAML 주석을 말없이 지움** → 닫는 대괄호 뒤는 그대로 태웁니다.
- 봉헌 멤브레인 실패 메시지에만 복구 처방이 없던 것 → kind별 수리(refine)→재review, 또는 final 제거; "review.md에서 위반을 지워서 닫지 않는다"까지 명시.
- 편측 충돌 처방이 계단식(따르면 다음 오류가 한 단계 더) → 두 요건(상호 conflict_with + 양쪽 status conflict)을 한 메시지에.

### 문서가 비운 자리 (R3-N4·N5·N8, R4-N6)

- plan status `done`에 도달하는 지시가 어디에도 없던 것 → refine 9단계가 유일한 작성자로 명시.
- refine의 "fixed" 기록 vs adjudications enum `{dropped|accepted}` → enum을 `{fixed|dropped|accepted}`로(fixed는 역사, 나머지는 억제).
- final의 prior-doc 재진입 **주체·시점** 불명 → refine은 봉헌만; 등록은 **그것을 잇는 다음 문서의 plan**(continues 단계)이 gather로 라우팅. 아무도 안 잇는 final은 등록되지 않는 것이 정상.
- `corroborated_by` 합의를 인용할 손잡이가 없던 것 → 손잡이는 **truth id 자신**임을 명문화: 문서는 truth를 인용하고 가시 인용에 합의 자료들을 병기, 게이트는 그 주장이 인용된 truth의 claim이므로 통과. "m003도 동의한다"를 **별도 무인용 문장**으로 쓰는 것이 게이트가 정당하게 잡는 형태.

부수: 회귀 하네스의 무동작 tone 치환(R4-N1)도 고쳐 `pass_shipped_templates`가 tone 항목을 실제로 덮습니다(치환 발화를 grep으로 강제).

**회귀**: 신규 4케이스, 전체 **130/130** 클린 와이프. 실광산 ✓ `255 sealed`·census 255/255·status `materials: 27`(validate와 동일 정의) 전부 불변.

## 2026-07-31.10

**Round 4의 should-fix 13건 전부.** 코드 6건(S1~S6) + 문서·스킬 7건(S7~S13). 이로써 R4 확인 22건 중 남은 것은 nice 6건뿐입니다.

### 코드

- **S1 — 중간-화살표 인계철선의 실제 한계가 명시보다 넓었습니다.** 편집 둘: (1) 계수 술어가 `gate_entry`(정확한 항목)만 세서, 근사 안내가 "위반을 쓰려던 줄"이라 부르는 근사-kind·`#`번호 모양은 삼켜져도 0으로 침묵 → kind를 품은 모양 전부를 세도록 확장. (2) awk가 닫는 줄의 화살표 **앞** 조각을 내부(`I`)로 방출하지 않아 항목이 닫는 줄 자체에 있으면 계수 0인 채 C 이벤트를 만남 → 방출 추가. `.6`의 한계 문장에 정정 표기를 달았습니다.
- **S2 — 따를 수 없는 처방.** `-->`로 시작하는 줄은 kind가 정확해도 "kind를 고치라"로 차단됐습니다 — 고칠 것이 없는 처방. 이제 화살표가 원인임을 말하는 전용 분기가 있습니다.
- **S3 — `source:`가 관대한 해소를 안 거치는 유일한 참조였습니다.** `.2`의 마이그레이션 안내("폴더만 정규화, 참조는 그대로")가 이 필드에 대해 거짓이었고, 안내대로 하면 truth마다 실패하며 **그동안 봉인이 돌지 않았습니다**. `source`(와 coverage의 자료·truth id 키 전부)를 다른 참조와 같은 관대함으로 맞췄고, `.2`에 정정 표기를 달았습니다. 관대해져도 봉인은 약해지지 않습니다 — 해소된 자료의 본문 대조는 그대로입니다(`block_source_unpadded_dishonest`).
- **S4 — census coverage 분자가 기록이 아니라 제목을 셌습니다.** 빈 `## m002` 제목이 +1 — `## legacy`는 항목마다 ruled 날짜+인용 발화를 요구하는데 빈 제목은 아무 가드도 없이 같은 효과였습니다. 이제 절은 **본문 줄이 하나라도 있어야**(매핑이든 사유 있는 스킵이든 — map의 감사 기록) 셉니다. 절 id도 참조라 canon 후 중복 제거합니다.
- **S5 — census coverage 분모가 frontmatter 안 닫힌 자료를 조용히 뺐습니다.** `coverage 1/1`(ls는 2) 또는 원인 서술 둘 다 거짓인 `2/1` ✗. 이제 분모는 **디스크에서** 셉니다(존재하는 converted.md − retracted) — N_TRUTH·census 파일 수와 같은 규칙이고, 파싱 못 하는 파일은 스스로 retracted를 선언할 수 없으므로 자료로 남습니다. 파싱 문제 자체는 validate가 크게 빨갛습니다.
- **S6 — retracted 묘비가 `required_tag`를 충족시켰습니다.** 필수 주제의 마지막 실추출을 철회해도 광산이 그 주제에 대해 초록이었습니다. 이제 gaps 교리 그대로 **live truth만**(discarded도 retracted도 아님) 태그를 덮고, 메시지가 그 교리를 인용합니다("a tombstone is an extraction that never had standing").

### 문서·스킬

- **S7** — README 폴더 지도·map 스킬(truth 파일을 **만드는** 파일)이 아직 `t<N>` 무패딩 표기 → `t<NNN>`+예시로. material 템플릿의 `corrects: [{m<N> …}]`도 동반 정리. 전 배포 문서 무패딩 잔재 0 확인.
- **S8** — init §2의 reconfigure 분기가 검색 방패를 빠뜨림(§3 불릿은 "reconfigure에도"라 주장하는데 §2가 거기로 안 보냄) → §2가 두 멱등 가드(방패+CLAUDE.md 블록) 모두로 라우팅.
- **S9** — 입고가 MOVE가 된 지금 `source_path`의 정의가 빔 → origin별로 못박음: `file`은 **이동 전** 경로(중복 검사가 비교하는 값), 외부 복사는 원 경로, 비파일 origin은 비경로 핸들. gather 4단계에 "2단계가 옮기기 **전에** 기록하라" 병기.
- **S10** — plan 템플릿·FORMATS는 절 노트에 `materials: role·topics`, plan 스킬은 `truths by tags` — 그리고 `scope_tags`를 노트에서 수확하므로 템플릿을 따르면 **staleness가 영원히 안 발화**. 세 곳을 truth `tags` 어휘로 통일하고 이유(어휘가 다르면 트리거가 조용히 꺼짐)를 각 자리에 적음.
  > **정정 (2026-08-01.3, R5-S7)**: "세 곳 통일"은 **반쪽 거짓**이었습니다. plan 템플릿에서 고친 것은 예시 줄(`:20`)뿐이고, 같은 파일이 **지시하는** 설명 줄(`:13`, "materials by role and topics")은 옛 어휘로 남았습니다 — 그리고 사용자가 실제로 읽고 따르는 것은 그 설명 줄입니다. `.3`에서 닫았습니다.
- **S11** — reviewers.md에 severity 충돌 병합 규칙만 있고 **kind 충돌** 규칙이 없음(refine이 kind로 수리를 라우팅) → 증거 많은 진단 우선(contradiction > unsupported > missing-required), 밀려난 kind는 항목 산문에 남김.
- **S12** — 의미 기반 **DOWNGRADE**가 Human queue를 빠져나감(라우팅이 DROP에만 걸려 있는데 판정 집합은 KEEP/DOWNGRADE/DROP, strength 1에서 critical→should-fix 강등은 기능상 드롭) → reviewers.md·verify 스킬 둘 다 "drop **or downgrade**"로 확장. 이 규칙은 방어자 자신을 지배하는 메타 규칙입니다.
- **S13** — init이 자료가 0개인 시점에 `required_tags`를 채우라고 지시 → 지금 알면 묻고, 모르면 **명시적으로 유예**(빈 목록이면 completeness 설정이 기계적으로 무동작임을 사용자에게 말하고, gather/map이 후보를 제안·plan이 교차 확인). 침묵 유예가 문제지 유예 자체는 적법.

**회귀**: 신규 12케이스, 전체 **126/126** 클린 와이프. 실광산 ✓ `255 sealed` 불변 · coverage 17/27 불변(모든 절에 기록 있음 — S4가 실광산에서 아무것도 안 떨어뜨림을 확인) · required_tags 빈 목록이라 S6 무영향.

## 2026-07-31.9

**Round 4 콜드 라운드의 critical 3건.** 4관점 리뷰어 + 방어자 완주 결과는 FAIL(확인 22건)이었고, 그중 critical 셋을 여기서 닫습니다. 셋 다 같은 모양의 결함입니다 — **"판정 규칙을 하나로 합쳤다"는 이전 번들의 주장이 미완성**이었습니다.

### C1 — 게이트의 "유일한 판사"가 부르는 항목을 센서스가 안 셌습니다

`.5`가 `gate_entry`를 `is_noise` **위에** 쌓아 판정자를 통일했다고 했지만, 그 위의 entry-position 필터가 불릿을 `-`·`*`·`+` 한 글자로만 읽었습니다. 그래서 `is_noise`가 항목이라 판정하는 네 모양 — 마크다운 **번호 목록**(`1. [contradiction] …`), **인용문**(`> - […]`), 불릿 뒤 **비분리 공백**(워드프로세서에서 붙여넣으면 남는 것), **닫는 대괄호를 안 친 항목** — 이 절 밖에 주차되면 아무도 안 셌습니다. 같은 줄이 절 안에서는 차단, 절 밖에서는 무존재 — 번들이 자기 자신과 모순했습니다. 이제 기준은 "대괄호 앞은 목록/인용 뼈대여야 한다"이고, 닫는 대괄호가 없으면 슬롯을 첫 공백에서 끊어 읽습니다.

**명시된 한계**: 대괄호 앞에 **단어**가 있는 줄(`- 3장 [contradiction] …`)은 여전히 안 셉니다. `- fixed: [contradiction] …`(닫힌 건의 기록)과 문자열 모양이 같아서 세면 후자가 거짓 차단됩니다. 이 한계는 `pass_gate_labelled_entry_outside` 케이스로 가시화해 두었습니다 — 절 안에서는 게이트가 둘 다 위반으로 잡으므로, 모호성은 절 밖에만 존재합니다.

> **은퇴 (2026-08-01.2, 구역 규칙)**: 이 한계와 그 아래 문단의 확장은 게이트 반전으로 **은퇴**했습니다. 구역 규칙 아래에서는 라벨 항목과 기록이 **둘 다 시끄럽게 차단**되고(메시지가 기록의 적법 철자 — 괄호 없는 kind — 를 가르칩니다), "모양을 세는" 판정 자체가 사라져 이 문단이 지키던 모호성이 존재하지 않습니다.

### C2 — 여는 `---` 뒤 공백 한 칸이 봉인 전체를 껐습니다

frontmatter가 **존재하는지** 묻는 두 자리(자료·truth)만 문자열 완전일치(`= "---"`)로 남아 있었고, **안을 읽는** 리더 전부는 `^---[[:space:]]*$`였습니다. `--- `(뒤 공백)로 연 자료는 "never closed" 전용 경보가 꺼지고 → 봉인이 0회 실행 → 날조 본문이 `✓ all checks passed`. truth 쪽 쌍둥이는 반대로 **멀쩡히 파싱되는 파일**을 "not read as a truth at all"이라는 세 절이 전부 거짓인 메시지로 차단했습니다. 이제 `has_fm()` 하나가 여는 fence의 유일한 판정자입니다.

### C3 — flow 객체 안 키가 `.7` 통일에서 빠졌습니다

`.7`이 frontmatter 키의 콜론 앞 공백을 관대화했는데 `resolution: {…}` **안의** 키 4종(type·decision_kind·decided_by·winner)을 읽는 일곱 자리는 그대로였습니다. `{type : pick}`처럼 쓰면(적법 YAML) 보이는 반쪽은 거짓 메시지("resolution has no 'decided_by'" — 있는데)였고, 숨은 반쪽이 더 나빴습니다: `decided_by:`만 정규형이면 **enum 밖 type + enum 밖 decision_kind + 실재하지 않는 truth를 가리키는 winner가 전부 `✓`로 통과** — winner 실재 검사를 만든 이유였던 바로 그 사고의 복원이었습니다. 일곱 자리 전부(`match` 5곳 + pull의 `grep -oE` 2곳) 같은 관대화로 맞췄습니다.

**회귀**: 신규 13케이스(C1 차단 4 + 통과 2 + 절-안 대조 1 / C2 차단 2 + 통과 2 / C3 차단 1 + 통과 1, 기존 `block_resolution_by`의 핀도 거짓 분기와 구분되게 좁힘). 전체 **114/114** 클린 와이프. 실광산 ✓ `255 sealed` · census 255/255 · pull의 winner 경로(`winner: t063` 실물) 정상.

## 2026-07-31.8

**S1·S2·S3 — Round 3의 should-fix 세 건.** 이로써 R3의 critical 4 · high 2 · should-fix 3이 전부 닫혔고, 남은 것은 nice 7건뿐입니다.

### S1 — 유일한 쓰기 명령이 봉인된 데이터를 훼손하고, 그 결과로 사람을 지목했습니다

`retag`의 치환 패턴이 **프런트매터 경계를 안 봤습니다.** 그래서 본문이 리스트 필드 모양의 줄(`tags: [위약, 대금]`)을 인용한 truth — FORMATS가 "정확한 문구 자체가 사실인 경우"(코드·설정·YAML 조각)에 권장하는 바로 그 형태 — 는 그 **인용문이 말없이 재작성**됐습니다. 다음 validate는 도구 자신의 편집을 보고 `quote not found … (laundering risk)`라며 사용자를 날조 위험으로 지목했습니다. 이제 선행 `--- … ---` 블록 안에서만 치환합니다. 키 철자는 `.7`에서 통일한 관대한 규칙을 그대로 씁니다.

### S2 — 자료가 안 읽힌 것을 truth의 날조로 보고했습니다

converted.md의 frontmatter가 안 닫히면 그 자료의 body가 통째로 비고, 거기서 뽑은 truth 전부가 `laundering risk` + `seal FAILED`로 계수됐습니다. **추출은 멀쩡했고 자료가 안 읽힌 것**입니다. 이제 봉인은 그 자료가 실제로 파싱됐을 때(`mfmok`)만 돌고, 아니면 그 truth들은 **NOT checked**로 떨어집니다 — "봉인이 돌지 않았다"가 정확히 그 뜻입니다. 원인은 자료 자신의 prob이 지목합니다.

### S3 — 0바이트 truth 파일이 분모에서 증발했습니다

awk는 빈 파일에 레코드를 만들지 않으므로 `ntruthfile`이 그것을 세지 못했고, 파일이 **미검사로 뜨는 대신 모수에서 사라졌습니다** — 두 개짜리 광산에서 `truths 1 (1 sealed)`, 같은 순간 census는 `truth files 2`. 내용은 있고 frontmatter만 없는 파일은 세어져 NOT checked로 떴으니, **같은 결함 부류를 두 가지로 계수**하고 있었습니다. 이제 파일 수를 디스크에서 셉니다 — census와 같은 표현이라 두 명령이 truth 파일 개수를 두고 다시는 다른 답을 낼 수 없습니다.

**회귀**: 신규 3케이스(본문 인용 불변 + 프런트매터는 여전히 치환 / 자료 미닫힘에 laundering 부재·NOT checked / 0바이트 파일이 분모에 잡히고 census와 일치). 전체 **101/101**(쓰기 경로·계정 변경이라 전량 재실행). 실광산 재확인 ✓ `255 sealed`, validate·census의 파일 수 255 일치.

## 2026-07-31.7

**H1 — 적법한 YAML 철자 하나가 봉인을 통째로 끄던 것을 닫았습니다.** Round 3의 마지막 high입니다.

프런트매터 필드 리더들은 `^key:[[:space:]]`로 키를 알아봤습니다 — 콜론 **앞** 공백을 금지하고 **뒤** 공백을 요구하는 모양입니다. 그래서 YAML이 적법이라 부르는 두 철자(`source : m001`, `source:m001`)가 **키 census와 `fm()`은 통과하고 리더만 못 읽었습니다.** `source`에서 그 결과는 조용하고 전면적이었습니다: 봉인이 `tsrc!=""`로 감싸여 있으니 **0회 실행**되고, 날조 본문이 `status: ok`로 들어가고, 판정은 ✓였습니다. 게다가 독자가 갈렸습니다 — `fm`·`impact`는 같은 파일을 `m001`로 읽고, 큰 awk·reindex·pull·coverage는 빈 값으로 읽어 index.md에 `- t001: … []`를 썼습니다. 다른 키들은 시끄럽게 실패했기 때문에(안 읽힌 `status`는 빈 enum으로 뜹니다) **조용했던 건 `source` 하나**였습니다.

이제 다섯 개 awk의 필드 패턴 30줄 전부가 `^key[[:space:]]*:` — **키 census와 `fm()`이 원래 쓰던 바로 그 모양**입니다. 한 개념(프런트매터 키를 알아보는 법)에 철자 규칙 하나.

**회귀**: 신규 3케이스 — `source : m001`·`source:m001`에 날조 본문 → 봉인이 돌아 `quote not found` 차단, 정직한 truth에 세 키(`source :`·`status:ok`·`tags :`) 혼합 철자 → 통과 + census `live 1`. 전체 **98/98**(리더 변경이라 전량 재실행). 실광산 재확인 ✓ `255 sealed` 불변.

**인접 미수정(기록)**: 같은 부류가 한 층 아래에도 있습니다 — `resolution: {type : pick}`처럼 **flow 객체 안**의 키는 `match(rv,/type:[[:space:]]*…/)`가 못 찾아 enum 검사가 조용히 건너뜁니다. 파서가 여럿(awk match 3벌 + pull의 셸 grep)이고 프런트매터와 다른 표면이라 별도 판으로 둡니다.

## 2026-07-31.6

**C2 — 마지막 게이트 우회를 닫았습니다. Round 3의 critical 4건이 전부 닫혔습니다.**

사고의 모양: 보관용 `<!--`를 열고 닫는 걸 잊었는데, 한참 아래 산문의 화살표(`정정 흐름: 초안 --> 검토`)가 그것을 우연히 닫습니다. 사이의 **완전 정규형** 위반 항목들이 통째로 사라지는데 — 선언절 생존검사는 **제목**이 안 삼켜져서 침묵하고, comment_balanced는 파일이 주석 *밖에서* 끝나서 침묵하고, 센서스와 fid_body는 둘 다 nocomment를 거치므로 항목이 이미 없습니다. 특수 서식이 하나도 필요 없는 우회였습니다.

**판별자는 닫는 화살표의 모양입니다.** 내부만 봐서는 구분이 원리적으로 불가능합니다 — 적법한 보관이란 게 바로 "raw엔 있고 strip 후엔 없는" 상태이기 때문입니다. 갈리는 것은 닫는 쪽입니다: 의도된 보관은 `-->`가 줄을 끝내고, 사고의 닫힘은 산문이라 화살표 **뒤에 글이 이어집니다**. 그래서 규칙이 이렇게 명시됩니다 — **항목을 담은 주석 보관은 닫는 `-->`를 줄 끝에 둔다** — 그리고 그 규칙이 오류 메시지의 후반부입니다("보관이 의도라면 닫는 화살표를 제 줄에 두라"). 항목 판정은 C1의 `gate_entry`를 그대로 재사용해 판사를 늘리지 않았고, 주석 구역 해부는 nocomment와 같은 상태기계를 씁니다.

**한계 명시**: 우연히 `-->`로 *끝나는* 산문 줄은 보관 닫힘과 구분 불가라 여전히 조용히 삼킵니다. 주석 내부 불가시는 다른 모든 곳에서 여전히 설계이고, 이것은 실제로 뚫린 그 한 모양에 놓은 인계철선입니다.

> **정정 (2026-07-31.10, R4-S1)**: 위 한계 서술은 당시 실제 한계보다 좁았습니다. (1) 계수 술어가 `gate_entry`뿐이라 근사-kind·`#`번호 모양 — 근사 안내가 "위반을 쓰려던 줄"이라 부르는 바로 그것 — 은 삼켜져도 0으로 세어져 침묵했고, (2) 닫는 줄의 화살표 **앞** 조각을 내부로 방출하지 않아 항목이 닫는 줄 자체에 있으면 계수가 0인 채 C 이벤트를 만났습니다. 둘 다 `.10`에서 닫혔습니다.

**회귀**: 신규 2케이스 — R3 재현 픽스처 그대로(정규형 항목 2건 + 산문 화살표) 차단, 주석 없는 산문 화살표 통과. 기존 보관 통과 3케이스(`-->`가 제 줄) 불변. 전체 **95/95**.

## 2026-07-31.5

**C1 — 항목 센서스가 게이트 자신의 판사로 셉니다.** Round 3의 남은 critical 두 건 중 하나를 닫습니다.

파일 전역 센서스는 "게이트가 못 보는 자리에 주차된 위반"을 잡는 바닥인데, 자기만의 정규식(`- \[` 정확히 한 칸)으로 세고 있었습니다. 게이트의 판사 is_noise는 **불릿 모양과 무관하게** 대괄호 줄을 항목으로 판정하므로 두 판사가 어긋났고, 그 틈으로 `* [contradiction]`·두 칸 불릿·탭·불릿 생략이 절 밖에서 `✓`와 공존했습니다 — 렌더링은 정규형과 똑같은데도. "shape-independent floor"라고 주석에 썼던 검사가 실은 모양 의존이었던 것입니다.

이제 정규식이 없습니다. `gate_entry()`가 **is_noise를 그대로 호출**하고, 파일 전역 계수가 다른 원장을 합병하지 않도록 스코프 필터 둘만 얹습니다:

- **kind-보유** — 첫 대괄호 슬롯에 실제 kind가 있어야 셉니다. 없으면 권고절(`- [critical]`)과 Human queue(`- [open]`)가 위반으로 세어집니다.
- **항목 위치** — 대괄호가 줄을 열어야 합니다(불릿 허용). 아니면 adjudication 기록(`- fixed: [contradiction] …`)이나 kind를 **언급만** 하는 산문이 세어집니다. 줄 중간의 kind는 위반에 *대한* 말이지 위반이 아닙니다.

절 안 계수(vin)도 같은 판사를 쓰므로 두 계수가 "항목이란 무엇인가"에 대해 다시는 다른 답을 낼 수 없습니다. `.1`에서 소속을 잘못 잡았다가 바로잡은 `* [<Contradiction>]`(is_noise 항목인데 템플릿 규칙이 `- [<`만 봐서)도 이번에 실제로 닫혔습니다.

**회귀**: 신규 7케이스 — 별표·두 칸·탭·불릿 생략 각각 차단, `* [<Contradiction>]` 차단, adjudication의 kind 언급 통과, HQ 산문의 kind 언급 통과. 전체 **93/93**. eclypse는 documents/가 비어 있어 이 경로가 발동하지 않습니다.

**문서 정정(코덱스 외부 평가 채택분)**: README가 "git이 모든 OS에 제공하는 bash면 충분"이라 썼으나 `pull`의 `declare -A`는 **Bash 4+**를 요구합니다(macOS 기본 bash는 3.2이고, git이 bash를 제공하지도 않습니다). 요구 사항을 사실대로 좁혔습니다: Bash 4+ · GNU awk/sed — Git for Windows·리눅스가 기본 제공, macOS는 새 bash 설치 필요.

## 2026-07-31.4

**원시층에 검색 방패를 씌웠습니다** — 스킬을 거치지 않는 일반 세션의 content 검색이 `inbox/`와 `materials/*/source.*`를 **아예 검출하지 못합니다**.

`.3`의 이동은 재검출 문제를 풀었지만 원본은 여전히 `materials/` 안에 날것으로 있고, READ.md가 경고하는 바로 그 사고 — "raw grep은 폐기된 값과 미해결 충돌의 한쪽을 건네준다" — 는 프로토콜을 **읽은** 세션만 피할 수 있었습니다. 사용자 지적(2026-07-31): 스킬 없는 단순 질의에서도 원본이 검출 자체가 안 되게 하라.

**기제는 프로젝트 루트의 `.ignore` 한 파일입니다.** ripgrep 계열 검색(AI 세션의 기본 검색 도구 포함)이 git 여부와 무관하게 기본으로 존중합니다. `.gitignore`가 아닙니다 — 원본은 광산 기록의 일부라 **버전 관리에는 그대로 남습니다**. 의도적 경로 열람(verify의 원본 대조, 철회 감사)은 그대로 됩니다 — 그게 감사 경로니까요. 두 층이 이제 짝을 이룹니다: CLAUDE.md 블록은 "읽지 말라"고 **말하고**, `.ignore`는 블록을 안 읽은 세션조차 **찾을 수 없게** 만듭니다.

실증으로 확인했습니다: 방패 없는 픽스처에서 마커 검색 → 3파일 검출(source·inbox·converted), `.ignore` 추가 → **converted.md만** 검출, 하위 폴더에서 시작한 검색에도 상위 `.ignore`가 적용됨.

배선: init §3에 생성 단계(reconfigure에도 재보증, 설정된 `paths` 값 사용) · gather가 방패 부재 시 자가 치유(구식 광산이 다음 gather에서 자동 획득) · CLAUDE.md 블록에 원시층 취급 규칙 한 줄 · READ.md 규칙 1에 방패와 그 경계(`.ignore`를 무시하는 도구가 물어온 경우의 취급) 명시. CLI 무변경(bin md5 불변) — validate·census·gaps는 원래 inbox·source를 안 읽고, 셸 글롭·직접 경로는 `.ignore`의 영향을 받지 않습니다. 기존 광산 마이그레이션 = 파일 하나 추가가 전부.

## 2026-07-31.3

**inbox는 이제 대기열입니다** — gather가 inbox 파일을 자료 폴더로 **이동**합니다(복사도, 삭제도 아님). Round 3의 N7을 닫습니다.

문제는 "지울 것인가 남길 것인가"의 양자택일처럼 보였습니다: 지우면 흔적이 사라지고, 남기면 다음 gather가 같은 파일을 매번 새 입고로 재검출해 update-or-new 문답을 반복합니다. **결정(2026-07-31, 사용자): 둘 다 아니다 — 이동한다.** 원본은 바이트 그대로 `materials/<id>/source.<ext>`가 되어 converted.md 옆에 남고(철회 흐름이 보존을 전제하는 바로 그 감사 사본), inbox에는 **대기 중인 것만** 남습니다. 빈 inbox = 처리 대기 없음. 처리된 파일이 재검출될 길이 구조적으로 사라지고, 중복 검사는 이제 "지난 실행의 잔재"가 아니라 **같은 파일을 나중에 다시 떨어뜨린 의도적 재투입**만 잡습니다 — 물어볼 가치가 있는 경우만.

한 가지 경계를 같이 못박았습니다: 이동은 **inbox 안의 파일에만** 적용됩니다. 사용자가 가리킨 프로젝트 밖 원본은 계속 **복사**합니다 — 광산 바깥의 사용자 파일시스템을 옮기는 일은 없습니다.

CLI 변경 없음(gather는 스킬 지시문이고, validate·census·gaps는 inbox를 애초에 스캔하지 않습니다). 문서 세 곳(gather 스킬·README 폴더 다이어그램·WORKFLOW 표) 정합 갱신. 회귀 86/86 불변.

## 2026-07-31.2

**형식 변경입니다** — id는 이제 **세 자리 이상 0채움**이어야 합니다(`t001`·`t042`·`t1000`, 자료도 동일). Round 3의 H2를 닫습니다.

### 한 숫자에 철자는 하나

`t5.md`와 `t005.md`가 한 광산에 같이 있으면, 큰 awk의 id 색인들(상호성 `cwofn`/`rawof`, `norm2raw`, `retracted`)이 **정규화한 키 하나로 둘을 합쳐** 버립니다. 그래서 한 파일을 읽고 다른 파일을 보고하고, `pull`은 아무 말도 안 한 쪽을 usable로 내보냅니다 — `:757`의 메시지가 스스로 적어 둔 실패("pull reports the silent side as usable")가 그대로 일어납니다. 리뷰어가 재현한 광산은 `truths 3 (3 sealed)` / `✓ all checks passed`였습니다.

정규화 자체는 버그가 아닙니다 — `conflict_with: [t5]`라고 쓴 참조가 `t005.md`로 해소되게 하려고 일부러 넣은 관대함입니다. 진짜 문제는 **두 파일이 공존하면 그 참조가 원리적으로 답이 없는데 아무도 막지 않는다**는 것이었습니다.

**결정(2026-07-31, 사용자): 형식에 못박는다.** FORMATS가 id를 `t<N>`라고만 규정해 `t5`가 적법했던 자리를 `t<NNN>`(세 자리 이상 0채움)으로 좁혔고, `validate`가 파일명·폴더명을 정규형과 대조해 거부합니다. 그 대가로 **참조의 관대함은 그대로 둡니다** — 디스크에 철자가 하나뿐이면 `t5`가 가리킬 수 있는 파일도 하나뿐이므로, 관대함이 비로소 건전해집니다. FORMATS에 그 인과를 적었습니다.

규칙을 두 벌 만들지 않았습니다. `canon_id()` 하나가 "이 숫자의 정규 철자"를 정의하고, 해소기(`tfile_for`·`mdir_for`)와 검사기가 **같은 함수**를 씁니다 — 이름 규칙과 조회가 드리프트할 수 없습니다. 각 해소기에 흩어져 있던 `printf 't%03d'`/`printf 'm%03d'` 중복도 이 참에 접었습니다.

### 역호환 — 실광산 마이그레이션 비용 0

eclypse의 진실 255개·자료 27개가 **전부 이미 정규형**이라 이름을 바꿀 대상이 없습니다. 패치 바이너리로 돌려 id 관련 불평 0건·`255 sealed` 불변을 확인했습니다. 짧은 id를 쓰던 광산이 있다면 **파일명과 `id:` 필드만** 바꾸면 되고 참조는 손댈 필요가 없습니다(해소가 관대하므로).

> **정정 (2026-07-31.10, R4-S3)**: 위 마이그레이션 안내는 이 시점엔 `source:` 필드에 대해 거짓이었습니다. `source`는 관대한 해소기를 안 거치고 원시 문자열로 폴더명과 대조되는 유일한 참조여서, 안내대로 폴더만 정규화하면 truth마다 실패하고 **그동안 봉인이 돌지 않았습니다**. `.10`이 `source`(와 coverage의 id 키들)를 다른 참조와 같은 관대함으로 맞춰 이 안내가 그때부터 참이 됩니다.

`index.md`/`tree.md` 같은 생성 파일은 글롭(`t[0-9]*.md`)이 애초에 배제하고, 숫자가 아닌 이름(`t1abc.md`)은 이 검사의 대상이 아닙니다 — 이름 규칙 전반의 강제는 별개 사안입니다.

### 회귀

신규 5케이스(`t5` 차단 / `t0001` 과다패딩 차단 / 자료 `m5` 차단 / `t1000` 통과 / 생성 파일 오판 없음) + 기존 짧은 참조 케이스 2개(`winner: [t5]`·`cited_truths: [t5]`가 `t005.md`로 해소되어 통과)로 관대함 보존 확인. 전체 **86/86**.

이 판에서 도구가 제 실수도 하나 잡았습니다 — 템플릿 자리표시자를 `t{N}`→`t{NNN}`로 바꾸자, 템플릿을 **문자 그대로 채우는** 회귀 케이스가 즉시 실패했습니다. 배포 템플릿을 그대로 쓰는 사용자가 겪을 일을 그 케이스가 대신 겪은 것이라, 테스트를 새 자리표시자에 맞췄습니다.

## 2026-07-31.1

**Round 3 콜드 검토(4관점 + 방어자)는 FAIL입니다** — 확인 17건(critical 4 · high 2 · should-fix 3 · nice 8), `consecutive_passes 0/2`. 계정 축은 critical 0, 문서 축은 코드 0회 열람 완주, 봉인 막은 20여 각도 전부 방어. 뚫린 것은 게이트 4건입니다. 이 판은 그중 **C3·C4 둘**을 닫습니다 — 둘은 뿌리가 같아(is_noise가 잡음이라 부른 줄 안의 실패한 위반) 한 검사로 묶이고, 각각 사용자 결정을 받은 뒤 순서대로 처리했습니다. **C1·C2는 아직 열려 있습니다.** C1은 세 번째 판정자(항목 census)의 문제라 별도 판으로 가고, C2는 독립입니다. 한 판에 여러 뿌리를 동시에 건드리다 새 결함을 넣은 이력이 이 저장소에 두 번 있습니다.

### C3·C4 — 위반을 쓰려다 실패한 줄이 조용히 사라지던 두 경로를, 이름으로 불러 세웁니다

두 결함의 증상은 같습니다: **사람 눈에는 위반 목록이 그대로 보이는데 게이트는 빈 절을 읽습니다.** 뿌리도 하나로 묶입니다 — `is_noise`가 "항목이 아니다"라고 판정한 줄 중에, **대괄호 슬롯에 실제 kind가 들어 있는** 것이 있습니다. 그건 누군가 위반을 쓰려 했다는 증거입니다.

`is_noise`는 **건드리지 않았습니다.** 게이트의 항목 판정은 불변이고, 새 검사는 그 판정이 "잡음"이라 부른 줄만 들여다보며 더 좁은 질문 하나를 던집니다. 판정자를 늘리지 않으려고 두 검사를 한 루프로 합쳤습니다.

**C4 — `#`로 시작하는 줄은 무조건 버려졌습니다.** `is_noise`의 첫 규칙이 `#`로 시작하는 모든 줄을 잡음으로 처리하는데, 그 규칙의 목적은 **제목** 걸러내기입니다. 그런데 `fid_body`가 진짜 제목을 이미 버리고 넘기므로, 그 규칙이 실제로 먹는 것은 `#1 [contradiction] …` 같은 **번호 매긴 항목**뿐입니다. 마크다운은 `#` 뒤에 공백이 없으면 제목으로 렌더링하지 않습니다 — 읽는 사람에게는 번호 붙은 위반 목록이 그대로 보입니다.

**C3 — 근사-kind가 "미작성 템플릿"으로 침몰했습니다.** kind 판정은 열거값과 **정확히** 일치할 때만 항목이고, `- [<`/`- [{`로 시작하는 나머지는 전부 미작성 템플릿이었습니다. FORMATS가 문자 그대로 인쇄하는 꺾쇠 서식에서 대문자 하나(`- [<Contradiction>]`)·공백 하나(`- [<missing-required >]`)·kind 병기(`- [<contradiction / unsupported>]`)가 **차단을 침묵으로** 뒤집었습니다. 대조군이 결정적입니다 — 꺾쇠만 떼면(`- [Contradiction]`) 정상 차단됐습니다.

**결정(2026-07-31, 사용자): 짐작하지도, 조용히 버리지도 않는다 — 무엇을 쓰라고 말한다.** 슬롯을 소문자로 접고 다듬었을 때 실제 kind가 *들어 있으면*, 실패한 방식에 따라 각각 지시합니다 — `#` 줄에는 "`- `로 시작하라", 근사-kind에는 "정확한 kind 하나로 고쳐라". 봉헌 전에도 잡고, 절 밖에 주차돼 있어도 잡습니다(파일 전체, nocomment 경유 — 주석 보관은 침묵). 미작성 템플릿·권고절 항목·kind 없는 `#` 산문은 슬롯에 kind 문자열이 없어 그대로 통과합니다.

**한계 명시**: 슬롯에 kind가 부분 문자열로도 없는 완전 오타(`- [<contradicton>]`)는 여전히 템플릿으로 낙하합니다 — 판별자가 "kind를 쓰려 했다"는 증거를 요구하기 때문입니다.

### 회귀·확인

신규 9케이스 — C3: 대문자·공백·병기 차단 / 절 밖 변형 차단 / 주석 보관 통과. C4: 번호 항목 차단 / 절 밖 변형 차단 / 주석 보관 통과 / kind 없는 `#` 산문 통과. 전체 **81/81**. Round 3 리뷰어의 원래 재현 픽스처(`#1 [contradiction]` 두 줄)를 패치 바이너리로 다시 돌려 두 줄 모두 이름으로 불러 세우는 것까지 확인했습니다.

이 과정에서 제 테스트 1개의 설계 오류도 잡았습니다 — `* [<Contradiction>]`(별표 불릿)은 is_noise가 **항목**으로 판정하는 모양이라 C3가 아니라 **C1(census 불릿 의존)의 잔여 통로**이며, C1 수정에서 닫혀야 합니다. 처음엔 이 케이스를 C3 테스트로 넣었다가, 실패를 보고 소속을 바로잡았습니다.

eclypse는 `documents/`가 비어 있어 이 검사가 발동하지 않습니다(문서 루프 안의 추가 검사).

## 2026-07-30.14

**Round 2가 남긴 것을 닫았습니다 — 직전 다섯 판이 스스로 넣은 critical 3건과, 선재 critical 6건.** 열 자리를 고쳤고 **한 번에 하나씩** 고친 뒤 각각 양방향으로 확인했습니다. 이번 판의 전제는 하나입니다: 확인 없는 "고쳤다"를 쓰지 않는다.

### 회귀 스위트를 먼저 만들었습니다 (그리고 이번엔 살아남습니다)

지난 두 라운드의 하네스는 `/tmp`에 있다가 세션마다 사라졌고, 그래서 매 라운드가 같은 표를 다시 만드는 값을 치렀습니다. 이번 것은 `notes/regress.sh`(gitignore, 배포 제외)에 있습니다. **72 케이스** — 막아야 하는 것 43, 통과해야 하는 것 22, 계정(`examined:`) 7. 케이스마다 자기 픽스처 사본에서 돌고, 마지막에 결과를 전부 지운 뒤 최종 코드로 처음부터 다시 돌렸습니다: **72/72.**

만들자마자 **제 케이스 3개가 틀렸다는 것부터 드러났습니다.** 주석 안 제목 케이스는 `<!-- # 제목 -->`을 한 줄로 써서 정작 재현하려던 결함(여러 줄 주석 안의 제목)을 재현하지 못했고, 짧은 본문·이어붙인 인용 케이스는 **coverage 미등록이라는 엉뚱한 이유로** 차단되면서 "막혔다"를 참으로 만들고 있었습니다. 기대 문자열을 실제 진단 문구로 좁히고 나서야 baseline이 정직해졌습니다 — **58 통과 · 12 실패**, 그 12건이 전부 실재하는 결함이었습니다.

### 게이트 — 제목 모양으로 우회하는 길을 형태와 무관하게 닫았습니다

- **형제 절 이름이 더 깊은 레벨에 있으면 절이 거기서 끊겼습니다.** `.11`이 넣은 종료자가 이름을 **레벨과 무관하게** 존중해서, `# Fidelity violations` 다음에 `## Findings` 한 줄만 넣으면 그 아래 열린 위반이 게이트가 읽는 범위 밖으로 나가고 `final.md`과 함께 `✓`가 나왔습니다. 이제 **그 파일이 형제 절을 쓰는 레벨**(형제 이름이 나타나는 가장 얕은 레벨)을 먼저 재고, 그보다 깊은 형제 이름은 하위 헤딩으로 절 안에 남깁니다. `.11`이 고쳤던 모양(형제가 전부 `##`)은 그대로 끊깁니다 — 그 파일의 형제 레벨이 2이기 때문입니다.
- **레벨로는 판정 불가능한 경우가 남습니다**: 형제가 `##`인 파일이 `#` 위반절 **안에** `## Findings`를 심으면 정상 배치와 **문자열이 동일**합니다. 그래서 절을 읽지 않는 **파일 전체 항목 계수**를 넣었습니다 — 주석을 제거한 파일 전체에서 실제 kind를 가진 항목 수와, 절 리더가 본 수를 비교해 다르면 하드 실패입니다. 지금까지 제목 모양으로 우회하던 길(하위 헤딩·두 번째 제목·읽을 수 없는 제목)이 **한 자리에서** 걸립니다. 권고 `- [critical]`과 미작성 `- [{kind}]`는 항목이 아니므로 세지 않습니다 — `is_noise`의 판정과 같습니다.
- **두 독자가 서로 다른 파일을 읽고 있었습니다.** `dup_section`은 원문을, `fid_body`는 `nocomment`를 거쳐 읽었습니다. 그래서 제목이 **닫힌 주석 안에만** 있으면 앞은 "게이트를 돌릴 수 있다"고 하고 뒤는 빈 절을 읽어 **통과**했고, 반대로 지난 라운드를 제목째 주석에 보관하면 "제목이 둘"이라 **영구 차단**되면서 안내대로 합치면 닫힌 위반이 되살아나 또 막혔습니다 — 적법한 파일에 탈출로가 없었습니다. 이제 둘 다 `nocomment`를 거칩니다. `verify.sections`의 존재 확인도 같은 이유로 같이 옮겼습니다(주석 처리한 절이 요구를 충족시키고 있었습니다).
- **늦게 닫히는 주석.** `comment_balanced`는 파일이 주석 안에서 *끝나는지*만 봅니다. 산문의 화살표(`초안 2장 --> 3장`)가 뒤에서 우연히 닫아주면 균형은 맞고 그 사이만 사라집니다. 주석 안의 보관 이력은 **적법하고 앞으로도 적법해야 하므로** 판정 기준은 "무엇이 주석 처리됐나"가 아니라 **"이 파일이 선언한 절이 주석 제거 후에도 살아 있나"** 입니다 — 원문에 있는 `review.sections` 제목이 제거 후 사라지면 지적합니다.

### 봉인 — 두 구멍

- **한 토큰짜리 본문은 인용이 아닙니다.** `f8c2801`이 길이 게이트를 없애며 적은 근거("짧은 문자열 검사는 통과 쪽으로 틀리므로 잃을 게 없다")가 정확히 거꾸로였습니다. **통과 쪽으로 틀리는 것이 구멍입니다** — 본문이 `#`이나 `5천만원`이면 `index()`가 거의 아무 자료에서나 찾아내 통과하고 `sealed`로 계수되며, 그 위의 claim은 무엇이든 쓸 수 있었습니다. 대체물은 재는 것이 아니라 **세는 것**입니다: 공백으로 나뉜 **토큰 수**는 로케일이 달라도 같은 값입니다(길이 게이트를 없앤 원인이 `length()`의 로케일 의존이었습니다). 줄별이 아니라 **본문 전체**로 판정합니다 — 표를 축자 인용하면 `|---|---|` 같은 한 토큰 줄이 정당하게 들어갑니다.
- **줄마다 축자인데 붙여 놓으면 원문에 없는 문장이 됩니다.** 봉인이 줄 단위 substring이라, 원문에서 멀리 떨어진 두 줄을 각각 통과시킵니다. 마크다운은 그것을 한 문단으로 렌더링합니다. 악의가 필요 없습니다 — 흔한 사고는 **중간 한정 줄을 빼먹은 인용**입니다. 본문 전체를 블록으로 한 번 더 대조하되 **공백을 접어서** 비교합니다(빈 줄 하나 더 넣은 인용까지 실패시키지 않으려고). 인접한 줄을 그대로 옮긴 정상 다중 줄 인용은 통과합니다.

### 나머지 넷

- **`paths` 비교가 문자열이었습니다.** `./materials`·`materials/./`·같은 폴더의 절대경로가 전부 "다른 위치"로 읽혔고, **같은 실행이 그 폴더의 자료를 전부 검사하고 있는데도** "여기 있는 것은 검사되지 않는다"고 exit 1로 말했습니다. 확인 가능하게 거짓인 차단 메시지는 없느니만 못합니다 — 스킬이 blocking으로 취급해 파이프라인이 유령 앞에서 멈춥니다. 실경로로 비교합니다.
- **자료 frontmatter가 안 닫히면 그 자료의 모든 truth가 "laundering risk"로 오진됐습니다.** truths awk는 frontmatter가 **닫힌 뒤에야** 자료 본문을 모으므로 본문이 통째로 비고, 그러면 그 자료에서 뽑은 truth가 전부 "인용이 원문에 없다"로 나옵니다 — 자료가 파싱되지 않았을 뿐인데 추출이 날조라고 말한 셈입니다. truth 쪽에는 전용 검사가 있었고 자료 쪽에는 없었습니다.
- **`resolution.winner`가 실재하는지 아무도 안 봤습니다.** id를 실은 필드 중 유일하게 존재 확인에서 빠져 있었고, 하필 **소비자가 따라가라고 지시받는** 필드입니다 — `pull`은 discarded truth의 독자를 전부 winner로 보냅니다. 오타 하나면 프로토콜 전체가 없는 truth를 가리켰습니다. 다섯 번째 필드로 같은 검사에 태웠습니다(`reason:` 산문 안의 id는 세지 않도록 winner 절만 훑습니다).
- **`pull`이 claim만 보여줬습니다.** 봉인은 body에 걸리는데 `index.md`·`tree.md`·`pull`은 claim을 렌더하고 READ.md는 소비자를 정확히 그 셋으로 보냅니다. 그래서 진짜 축자인 본문 위에 정반대의 claim이 앉아 있어도 소비자가 보는 모든 면이 claim에 동의합니다. 이제 usable 행에 **봉인된 본문 첫 줄**을 같이 찍습니다.

  **claim을 기계가 막을 수는 없다는 것도 확인했습니다.** 유일한 기계적 대리 검사(claim의 숫자가 본문에 있어야 한다)를 실제 광산 255개에 돌려보니 **21건(8%)이 거짓 실패**였습니다 — `4인`·`Phase 2`·`m001` 같은 정당한 조직 번호입니다. claim은 설계상 요약이므로 축자 검사 대상이 아닙니다. 그래서 기계는 **막지 않고 보여줍니다.**

### 문서 — 없는 명령을 시키던 자리

`README`·`WORKFLOW`·`FORMATS`·verify/map 스킬이 `.6`에서 되돌린 `audit` 레인을 여전히 지시하고 있었습니다(진입 순서, "세 개의 on-demand 레인", A2/A4/A6·A7 참조). 전부 걷어냈고 `WORKFLOW`의 "ten skills"도 실제 개수인 아홉으로 맞췄습니다.

**`examined:`를 설명하는 문서가 0줄이었습니다.** `sealed`·`tombstone`·`← NOT checked`·`gate-checked`가 무슨 뜻인지, 어느 숫자가 나쁜 것인지 사용자가 알 방법이 없었습니다 — 그 줄을 읽고 판단하라고 지시하는 문서는 있는데. README에 뜻과 읽는 법을 적었습니다.

**`tone`은 문서가 지시하는 기본 경로가 곧바로 validate 실패였습니다.** init·plan·plan 템플릿이 "비워라/상속하라"고 하고 schema는 필수입니다. 상속은 **plan 시점에 해소해서 값을 적는 것**으로 정리했습니다 — 적히지 않은 상속은 콜드 독자가 해소할 수 없습니다.

### 역호환

형식 변경 없음. **실제 광산(eclypse: 진실 255 · 자료 27)을 이 번들로 두 번 돌려 `✓ all checks passed`를 확인했습니다** — 255/255 sealed, 새 검사 어느 것도 거짓 실패를 만들지 않습니다. 새 검사가 실데이터와 만나는 지점을 미리 재봤습니다: 본문 토큰 최소 3(경계 2), 블록 대조 통과 255/255, `resolution` 45건의 winner 전부 해소, 자료 27개 전부 frontmatter 닫힘. `documents/`가 비어 있어 게이트 계열은 여전히 미발동입니다.

### 남긴 것 — 알면서 남긴 한계

- **두 토큰짜리 조각은 여전히 통과합니다.** 바닥을 "인용인가 아닌가"의 최소선에 뒀습니다(실제 광산 최소가 3토큰).
- **주석 안은 설계상 보이지 않습니다.** 늦게 닫히는 주석에서 잡아내는 것은 *선언된 절*이 사라진 경우뿐이고, 불릿만 삼킨 경우는 의도한 보관과 구분할 수 없습니다.
- **claim↔body 불일치는 사람이 보는 것으로 남습니다**(위 8% 측정).
- 수렴 루프 배선(`consecutive_passes` 검사 계층, 기준선 핀 저장 위치, `verify.md`를 `stale`로 만드는 주체 등)은 이번 판에서 건드리지 않았습니다.

## 2026-07-30.13

**채워진 위반 항목이 게이트에서 삭제되던 것을 고쳤습니다.** `.7`이 넣은 "두 번째 자리표시자" 규칙의 산물입니다.

그 규칙은 줄 어딘가에 `{…}`/`<…>` 쌍이 **두 번** 있으면 미작성 템플릿으로 판정했습니다. 그런데 실제 위반이 두 번째 쌍을 공짜로 제공합니다 — `- [<unsupported>] 2장 <각주 3> — 인용된 수치가 없다`, `- [<contradiction>] 3장 — 초안 <12%>는 t004(<10%>)와 모순`. 각주·수치·태그 이름을 각괄호로 감싸는 순간 완전히 작성된 위반이 사라지고 게이트가 통과했습니다. review 스킬이 지시하는 서식이 `- [<kind>] <where> — <what>`이라 각괄호를 남기는 습관 자체가 그 스킬에서 나옵니다.

**판별자는 대괄호 안이 실제 kind인가입니다.** 토큰 개수로는 두 경우를 가를 수 없습니다. `review.enum.kind`를 schema에 추가하고(`contradiction|unsupported|missing-required`) `is_noise`가 그것을 읽습니다 — 대괄호에 실제 kind가 있으면 각괄호를 남겼든 아니든 무조건 항목이고, 자리표시자 **이름**(`kind`)이 남아 있으면 템플릿입니다. kind는 게이트가 실제로 작동하는 대상이므로, 실제 kind가 없는 줄은 게이트가 처리할 수 있는 항목이 아니라는 판단이기도 합니다.

### 이 수정 안에서 두 번 틀렸습니다

둘 다 돌려봐서 잡았고, 둘 다 **읽어서는 맞아 보였습니다.**

- **처음엔 "자리표시자를 다 지우면 잔여물이 비어야 템플릿"으로 만들었습니다.** 게이트 13케이스는 전부 맞았는데, 배포 `gaps.md` 템플릿의 Accepted 줄이 자리표시자 사이에 리터럴 라벨(`scope:` · `recheck:` · `as-of:`)을 갖고 있어서 잔여물이 비지 않았습니다 → 그 템플릿이 항목으로 세어져 `gaps`가 `records 0` → `records 1`로 회귀했습니다. 두 판정자를 같은 줄 목록에 나란히 먹이는 대조표를 만들고서야 보였습니다.
- **`sed`의 줄 연결 `\`가 또 `
`으로 먹혀** sed가 `n`을 파일명으로 읽고 실패했습니다. 실패하면 잔여물이 빈 문자열이 되고, 그 규칙에서 빈 문자열은 "템플릿"이므로 **모든 줄이 삭제되고 게이트가 통째로 열렸습니다.** 이 세션에서 백슬래시가 먹힌 게 다섯 번째입니다. 한 줄로 다시 쓰고, 그와 별개로 이 자리는 실패 시 **항목 쪽으로** 떨어지게 했습니다 — 게이트의 판정자가 오류로 침묵하면 안 됩니다.

### `countlines`의 한계를 숨기지 않고 적었습니다

`is_noise`와 `countlines`는 기본 판정(대괄호가 자리표시자를 열면 템플릿)을 공유하지만, kind enum 재정의는 `is_noise`에만 있습니다. `countlines`는 호출자가 준 패턴으로 서로 다른 원장을 세고(coverage `## legacy` 항목은 대괄호가 아예 없고, gaps와 Human queue는 enum이 다릅니다) 읽을 절 컨텍스트가 없기 때문입니다. **결과를 명시합니다**: 실제 kind를 각괄호로 감싼 gaps 항목(`- [<reference>] t001 — …`)은 여기서 과소 계수됩니다. 닫으려면 호출자가 자기 enum을 넘겨야 하고, 그때까지는 공유 규칙이 아니라 알려진 한계입니다.

### 역호환

형식 변경 없음(`review.enum.kind`는 schema 추가이고 기존 값을 바꾸지 않습니다). eclypse에는 자리표시자 불릿이 `gaps.md`의 HTML 주석 안에만 있고 `nocomment`가 지우므로 출력이 동일하며, `documents/`가 비어 있어 게이트는 발동하지 않습니다.

## 2026-07-30.12

**Round 2 콜드 검토(4 관점)를 돌렸고 FAIL입니다.** `consecutive_passes` 0/2. 원시 발견은 56 → 19로 줄었지만 구성이 바뀌었습니다 — **critical 8건 중 6건이 직전 다섯 판이 넣은 것**이고, 그중 4건이 **그 판들이 만든 안전장치 자체**였습니다. 이번 판은 그중 계정 두 건만 고칩니다. 계정이 거짓이면 그 위의 모든 판정을 믿을 수 없고, Round 2 결과를 읽은 판단부터 흔들립니다.

### `sealed`가 "통과"라고 말하면서 "실행"을 셌습니다

`sealsrc`가 `index()`의 판정 **앞에서** 세팅되므로, 인용이 원문에 **없다고 확인된** truth가 `sealed`에 들어갔습니다. 묘비도 들어갔습니다.

이게 왜 심각한가 — WORKFLOW와 verify 스킬이 확인 화면에 이 문장을 쓰라고 **지시합니다**: *"축자 인용 존재는 validate가 N/N 확인 — 오탈자 검토는 불필요합니다."* validate가 내놓는 유일한 N/N이 이 줄입니다. 즉 계정이 **자기가 막으려던 거짓 기록을 생산**하고 있었습니다. 리뷰어 픽스처에서 실제 통과 9건인데 `11 sealed`가 찍혔습니다.

네 갈래로 쪼갰습니다: **통과 · 봉인 FAILED · 묘비(면제) · 미검사.**

```
truths 2 (1 sealed · 1 seal FAILED)        ← 실패가 통과에 섞이지 않습니다
truths 2 (1 sealed · 1 tombstone)          ← 묘비는 어느 쪽도 아닙니다
truths 2 (1 sealed ← 1 NOT checked)        ← 이제 이 표시는 "안 봤다"만 뜻합니다
```

묘비를 면제로 둔 것은 규격 때문입니다 — 철회된 truth의 인용은 원문에 **없는 것이 정상**이고(그 부재가 철회 사유입니다) 본문이 없는 stub도 적법합니다. 전에는 정상 묘비 하나가 깨끗한 광산에서 `← 1 NOT sealed`를 영구히 켰고, 그 표시를 설명하는 유일한 문서(이 CHANGELOG)는 그것을 "0으로 떨어뜨려야 하는 결함"으로 가르쳤습니다. 0으로 만드는 방법은 묘비를 지우는 것뿐이고 map 스킬이 그것을 금지합니다.

### `materials`가 진실 파일에 매달려 있었습니다

`N_MAT`이 truths awk의 부산물이었고 그 awk는 `t*.md`가 하나도 없으면 통째로 건너뜁니다. 그래서 **gather 완료 ~ map 시작 사이 — 모든 프로젝트가 반드시 지나는 구간 — 에서 자료를 전부 검사하고도 `materials 0`을 찍었습니다.** 같은 프로젝트에서 `status`는 `materials: 3`이라고 말했고, verify 스킬은 두 숫자를 **모두 인용하라**고 지시합니다. 리뷰어 셋이 독립적으로 찾았습니다.

이제 자료를 **검사하는 루프 안에서** 셉니다. `converted.md`가 없는 폴더는 세지 않고(그 자체가 별도 지적), `paths.materials`를 딴 곳으로 돌리면 정직하게 0입니다.

### 역호환

형식 변경 없음. eclypse는 묘비가 0개이므로 출력이 이전과 동일합니다.

### 남은 것 — 직전 다섯 판이 넣은 critical 4건

`is_noise`의 "두 번째 자리표시자" 규칙이 **채워진 항목**을 삭제(각괄호 토큰이 하나 더 있으면) · `fid_body`의 형제 절 종료자가 **더 깊은 레벨**에서도 발동 · `paths` 문자열 비교가 `./materials`를 거짓 차단 · 길이 게이트 제거로 `#` 한 글자 본문이 봉인 통과. 한 번에 하나씩 고칩니다.

## 2026-07-30.11

**봉헌 게이트의 마지막 알려진 우회를 닫았습니다.** Round 2 콜드 검토를 걸기 직전에 확인해 보니 B2가 열려 있었습니다 — `# Fidelity violations` 아래에 `## round 2` 같은 하위 헤딩 하나만 있으면, 그 아래 열린 위반과 `final.md`이 공존하는데 `✓ all checks passed`가 나왔습니다. 계정은 `1 gate-checked`라고 정직하게 말했습니다: 게이트가 **돌았고**, 절을 비었다고 읽었습니다.

원인은 종료 조건이었고, **양쪽 다 틀렸습니다.** 이 파일은 두 선택지를 각각 한 번씩 실어봤습니다:

- **자기 레벨에서만 끊기**(`^#`) → 다른 절을 `##`로 쓴 파일에서 위반절이 EOF까지 흘러, 권고 findings가 위반으로 세어지고 **깨끗한 문서가 막혔습니다.**
- **모든 헤딩에서 끊기**(`^#+`) → 절 **안의** 하위 헤딩이 절을 끝내, `## unsupported`로 묶은 위반이 절 밖으로 나가고 **게이트가 빈 절을 읽었습니다.**

레벨만으로는 가를 수 없습니다 — 규격이 레벨을 정하지 않았기 때문입니다. 두 경우를 가르는 것은 **그 헤딩이 review.md의 다른 절 이름인가**이고, `review.sections`가 이미 그 목록을 갖고 있었습니다. 그래서 읽습니다. 형제 절 이름이면 어느 레벨이든 절을 끝내고, 아니면 하위 헤딩이므로 절 안에 남습니다. 네 방향 전부 확인했습니다.

부수 효과로 **`review.sections`가 처음으로 소비자를 얻었습니다.** 존재 강제는 여전히 off입니다 — 그건 마이그레이션 비용이 있는 별개 결정이고 사용자 몫입니다. schema 주석을 그 구분에 맞게 고쳤습니다("읽지만 존재를 강제하지는 않는다", 그리고 그 목록이 없으면 왜 두 종료 조건이 양방향으로 틀리는지).

### 역호환

형식 변경 없음. 배포 `review.md` 템플릿(네 절 전부 `#` 레벨)은 그대로 통과합니다.

## 2026-07-30.10

**뿌리 C 마무리.** 같은 개념을 읽는 코드가 여러 벌 있고 그 벌들이 서로 다르게 답하던 다섯 자리를 하나씩 합쳤습니다.

- **두 낱말 태그가 영구 거짓 실패였습니다.** `required_tags`는 공백으로 이어붙여 공백으로 쪼갰고 truth의 `tags`는 콤마로 쪼갰습니다. 그래서 `required_tags: [계약 범위]`가 태그 **둘**(`계약`·`범위`)이 되어 둘 다 "no truths"로 뜨고, **정작 실제 태그는 한 번도 검사되지 않았습니다.** FORMATS는 required_tag 0건을 missing-required 충실성 위반으로 규정하므로, 광산이 해소 불가능한 위반 두 개를 달고 있으면서 요청한 검사 하나를 잃은 상태였습니다. 이제 한 줄에 하나씩 ENVIRON으로 넘겨 `tags`와 같은 방식으로 쪼갭니다.
- **`resolution.winner`의 자기판정만 0패딩을 정규화하지 않았습니다.** `t005.md`에 `winner: [t5]`라고 쓰면 "남이 이겼다"로 읽어 **승자를 `discarded`로 바꾸라고** 지시했고, 그 지시를 따르면 사용자가 고른 값이 광산에서 사라집니다(`pull`이 usable 0). 같은 함수의 `winnerof`·`reflist`는 처음부터 정규화했고 `tidn3`도 이미 계산돼 있었습니다.
- **날짜를 판정하는 곳이 하나뿐이고 그 하나가 값을 안 봤습니다.** `is_date()` 하나로 합쳤습니다 — 형태(`YYYY-MM-DD`, 0패딩)와 값(월 1–12, 일 1–31). 이제 `added`·`retrieved_at`·`verified_at`이 실제로 날짜인지 확인받습니다. 전에는 `retrieved_at: (미정)`이 FORMATS가 "재확인 가능성의 앵커"라 부르는 필드를 충족했습니다. coverage의 `ruled:`도 같은 기준이 됩니다 — 전에는 `2026-99-99`를 기록된 판정으로 인정하고 `2026-7-3`을 "날짜가 없다"고 했습니다. 귀속 요구도 따옴표 **한 개**가 아니라 내용 있는 짝(`"[^"]+"`)을 요구합니다.
- **참조 필드가 절반만 정규화됐습니다.** `conflict_with`·`superseded`·`derived_from`·`corroborated_by`는 `t5`를 `t005`로 해소했고 `corrects`·`cited_truths`는 "그런 것 없음"으로 답했습니다 — 그래서 존재하는 truth를 두고 "이 문서는 staleness 감지에서 면제된다"고 겁을 줬습니다. `tfile_for()`·`mdir_for()` 하나씩으로 합쳤습니다(어느 패딩이든 해소, 표시는 사용자가 쓴 그대로).

### 역호환

형식 변경 없음. eclypse(진실 256개)를 읽기로 확인했습니다 — `added`/`retrieved_at`/`verified_at`이 전부 `YYYY-MM-DD`이고 참조 필드의 짧은 id가 0개이므로 새 검사 넷이 거짓 실패를 만들지 않습니다.

### 남은 뿌리 C 한 건

`census`·`status`·`pull`이 schema의 enum을 awk/case로 베껴 쓰는 것(B9)은 넣지 않았습니다. 세 명령의 출력을 동시에 건드리는 유일한 항목이라 별도 판으로 둡니다 — 한 판에 여러 벌을 고치다 새 구멍을 낸 이력이 두 번 있습니다.

## 2026-07-30.9

뿌리 B의 마지막 한 건과 **뿌리 C**를 닫았습니다. 둘 다 같은 축입니다 — "규격을 읽는다고 적혀 있는데 실제로 읽는가".

### A1 — 명부를 기억하는 대신 유도합니다

schema를 못 읽으면 멈추는 가드가 키 **4개**만 지키고 있었습니다. 실제로 읽는 키는 **22개**입니다. 그래서 `material.fm.required_when.research` 한 줄이 없으면 url·retrieved_at 없는 fetched 값이 통과했고, v0.1.0 schema(27줄)를 그대로 두고 bin만 갱신한 설치에서 실제로 발생합니다.

명부를 **소스에서 뽑습니다** — `grep -oE 'sch [a-z][a-z_.]+'`. 손으로 관리하는 목록은 드리프트하고, 그 드리프트는 이 가드가 막으려는 방식으로 정확히 안 보입니다. 유도 자체가 실패하면(10개 미만) 조용히 4개로 후퇴하지 않고 **그 사실을 지적한 뒤** 후퇴합니다 — 말 없는 후퇴는 같은 침묵-0을 한 층 위에서 반복하는 것입니다.

### 뿌리 C — 값 리더 네 벌이 이제 같은 값을 봅니다

`census`의 `val()`만 **인용부호를 벗기지 않았습니다.** 나머지 셋(validate·reindex·pull)은 벗겼습니다. 결과:

- `status: "ok"` 로 쓴 truth가 상태 집계에서 빠져 `live 0`이 되고, `✗ status tallies sum to 0 but there are 2 truth file(s)`가 뜨고, **그 진단이 대는 두 원인이 둘 다 거짓**이며 지시받은 `validate`는 `✓`였습니다. 이제 `live 2`입니다.
- `material` status를 읽는 census의 인라인 리더도 같아서 `status: "retracted"` 자료가 분모에는 들어가고 분자에서는 빠져 `coverage 1/2`였습니다. 이제 `1/1`입니다.
- `coverage`의 `source` 추출기는 인용·주석 **둘 다** 안 벗겼습니다. `source: "m001"` 로 쓴 truth는 coverage 섹션에 없어도 통과했습니다 — FORMATS의 "adding a truth without updating coverage fails"가 거짓이었습니다. 이제 잡힙니다.

덤으로 `pull`의 `val()`에 리터럴 SOH 바이트가 박혀 있던 것을 `reindex`가 이미 쓰는 `` 이스케이프로 바꿨습니다. 소스에 보이지 않는 제어문자가 남아 있는 것은 다음 사람이 읽을 때의 함정입니다.

### 역호환

형식 변경 없음. eclypse(진실 256개)를 읽기로 확인했습니다 — 인용된 `status`/`source` 값이 0개이므로 census·coverage 판정이 달라지지 않습니다.

## 2026-07-30.8

**Round 1 콜드 검토(5 관점) + 방어자 triage 결과, 47건이 살아남았습니다.** 그 47건을 뿌리로 묶으면 세 개가 26건을 만들고 critical 11건 중 10건을 만듭니다. 이번 판은 그중 **가장 큰 뿌리 하나**만 다룹니다 — 한 번에 여러 뿌리를 건드린 지난 판이 스스로 5개의 새 결함을 만들었기 때문입니다.

### 뿌리 B — "검사 0회"와 "통과"가 같은 출력이었다

critical 8건이 전부 같은 모양이었습니다. schema 키가 없어서 · `source:`가 비어서 · 본문에 검사할 줄이 없어서 · frontmatter가 안 닫혀서 · `paths`가 딴 곳이어서 · 문서 폴더가 glob에 안 걸려서 — **검사가 한 번도 돌지 않았고, 출력은 `✓`였습니다.** 개별 수정으로는 닫히지 않습니다: 검사를 추가할수록 0회 실행될 경로가 늘어납니다.

**계정(accounting)을 넣었습니다.** `validate`가 판정 앞에서 **무엇을 몇 개 실제로 검사했는지** 항상 찍습니다:

```
  examined: materials 1 · truths 2 (1 sealed ← 1 NOT sealed) · documents 1 (1 consecrated, 0 gate-checked ← 1 NOT gate-checked)
```

계정은 아무것도 판정하지 않습니다. **"안 봤다"가 "보고 아무것도 못 찾았다"와 닮는 것을 끝냅니다.** 이제 `source:` 빈값(아직 미수정)은 `✓` 옆에 `1 NOT sealed`를 달고 나오고, 다음에 어느 방향으로 새든 같은 자리에서 드러납니다.

같은 판에서 이 뿌리의 두 건을 닫았습니다:

- **게이트가 읽을 수 있는 제목이 없으면 그것 자체가 위반입니다.** `fid_body`는 절이 **비었을 때**(정상)와 **제목을 못 찾았을 때**(구멍) 똑같이 빈 값을 돌려주고, 게이트는 후자를 전자로 읽었습니다. 일곱 모양이 그렇게 통과했습니다 — `(2건)` 접미어 · 꼬리 콜론 · `1.` 번호(배포 `review.md` 템플릿 주석이 네 절에 직접 번호를 붙여 유도합니다) · 대소문자 · 병기 제목 · 꼬리 NBSP · 들여쓴 헤딩. 제목 부재는 이제 파일 부재와 같은 실패입니다. 같은 이유로요 — **게이트가 침묵한 것이지 통과시킨 것이 아닙니다.**
- **`paths`가 가리키는 폴더가 없거나, 광산 내용이 그 밖에 있으면 지적합니다.** FORMATS가 `paths` 변경을 명시적으로 허용하므로, 폴더를 옮기다 오타 하나로 두 막이 조용히 꺼지고 `✓`가 나왔습니다.

### 이 판에서 내가 만든 버그 3개 (전부 잡음)

계정을 넣으면서 awk 배열 이름을 충돌시켰고(`_t`가 이미 split 대상), `printf` 형식 문자열의 `
`이 실제 개행이 돼 인자가 밀렸고(요약이 두 줄로 쪼개져 엉뚱한 값이 찍혔습니다), `N_GATED` 증가를 `continue`/`break`가 건너뛰는 자리에 뒀습니다. 셋 다 **돌려봐서** 나왔습니다 — 읽어서는 세 개 다 맞아 보였습니다.

### 뿌리 B의 나머지 세 건 — 계정이 가리킨 자리를 닫았습니다

계정을 넣은 직후 `1 NOT sealed`로 드러난 셋입니다. 고친 뒤 그 숫자가 0으로 떨어지는 것으로 확인했습니다 — 고쳤다고 주장할 필요가 없었습니다.

- **`source:`가 비면 봉인이 0회 돌았습니다.** truth의 필수 필드 검사가 **키의 존재만** 봤습니다(`for(rk in reqkey) ... in kcount`). 봉인은 `tsrc!=""`로 감싸여 있으니 값이 비면 통째로 건너뛰고, 날조 본문이 `status: ok`로 들어가 `pull`에서 usable로 나왔습니다. 다른 네 artifact(project·material·plan·verify)는 처음부터 값을 봤습니다(`[ -n "$(fm ...)" ]`) — **봉인을 지닌 유일한 artifact만** 키 존재 검사였습니다.
- **본문에 검사할 줄이 없으면 봉인 대상이 0줄이었습니다.** 봉인은 줄 단위라 0줄이면 0회입니다. FORMATS는 축자 본문을 필수로 규정하는데 본문이 있는지 확인하는 코드가 없었습니다. 묘비(`retracted`)는 면제입니다 — 정당하게 stub일 수 있습니다.
- **frontmatter가 닫히지 않으면 그 파일의 모든 검사가 0회였습니다.** `tf_done()`이 **닫는** `---`에서 실행되므로, 없으면 파서가 EOF까지 frontmatter로 삼켜 id-파일명 대조·source 존재·status enum·resolution enum·봉인이 전부 실행되지 않았습니다. 직전 판에 넣은 가드는 **1행만** 봤습니다.

이 판에서도 내가 두 개를 만들었고 둘 다 돌려봐서 잡았습니다: awk 배열 이름을 또 충돌시켰고(`_a`가 이미 split 대상 — 직전 판의 `_t`와 같은 실수), `if`를 빠뜨린 조건절을 넣었습니다. 그 뒤 BEGIN의 split 배열 이름 10개(`_a _b _c _d _k _p _r _s _t _y`)를 전수 확인해 새로 쓴 두 이름(`_bt _st`)과 겹치지 않음을 확인했습니다.

### 역호환

형식 변경 없음. 기존 광산은 그대로 통과하고 `examined:` 한 줄이 추가될 뿐입니다. eclypse(진실 256개)를 읽기로 확인했습니다 — 빈 필수키 0 · 본문 0줄 0 · frontmatter 미닫힘 0이므로 세 검사 모두 거짓 실패를 만들지 않습니다.

## 2026-07-30.6

전수검사(5개 관점 콜드 검토, 저장소 스냅샷 고정 후 병렬)를 돌려 51건을 받았습니다. 판정 기준은 "결함이 고쳐졌나"가 아니라 **"고친 것이 안 고친 것만 못하지 않은가"** 였습니다. 결과에 따라 **새 쓰기·감사 명령을 이번 번들에서 되돌리고**, 확인된 순손해 4건을 고쳤습니다.

### 되돌린 것

**`weavedoc audit` · `weavedoc new-truth` · `weavedoc supersede` 세 명령과 `weavedoc-audit` 스킬을 뺐습니다.** 검토가 찾은 결함 중 대부분이 이 표면에 몰려 있었습니다 — `audit` A2의 stale 검사는 awk 문자열 안에 리터럴 개행이 들어가 **출하 이후 한 번도 실행된 적이 없고**(`2>/dev/null`이 문법 오류를 삼켰습니다), `supersede --type attribute`는 규격이 양쪽 `ok`로 남기라고 한 병기를 한쪽 `discarded`로 파괴했으며, `new-truth`는 `--status conflict`로 validate가 곧바로 거부할 파일을 쓰고 `> [machine-note]` 줄을 진실로 승격했습니다.

설계 자체를 버린 것은 아닙니다. 되돌린 것은 **구현**이고, 각 명령은 자기 검토 라운드를 거친 뒤 다시 들어옵니다. 규격 추가분(`origin: research` · truth `retracted` · material `corrects` · truth `superseded` · Human queue `[state] [ownership]` · coverage `## legacy` · `verify.fm.*`)과 그에 대한 `validate` 검사는 **그대로 남습니다** — 이미 그 형식으로 기록된 광산이 계속 검사받아야 하기 때문입니다.

### 고친 것 — 순손해 4건

- **봉헌 게이트의 자리표시자 판정이 앵커 없이 매칭**되어, 템플릿 모양을 그대로 쓴 진짜 위반(`- [<contradiction>] 3장 — …`)이 게이트를 통과했습니다. 되돌리기 전 버전이 막던 입력입니다. 이제 **줄 시작에 앵커**되고, **두 번째 자리표시자가 남아 있을 때만** 미작성 템플릿으로 봅니다 — 절반만 채운 줄은 실제 항목으로 세어 막습니다. 판정이 갈리면 안 되는 짝인 `countlines`도 같은 두 조건으로 맞췄습니다.
- **닫히지 않은 `<!--`가 게이트를 무력화**했습니다. 게이트는 주석을 지우고 읽는데, 끝까지 닫히지 않은 주석은 그 아래 전부를 지웁니다. 보관용 주석을 닫는 걸 잊으면 열린 위반이 통째로 사라진 채 "깨끗함"이 나왔습니다. 이제 `review.md`의 주석 균형을 게이트와 같은 자리에서 검사합니다.
- **census의 coverage 분자가 철회된 자료의 섹션을 셌습니다.** 분모는 빼는데 분자는 세어 `2/1`이 나왔고, 진단문이 대는 두 원인이 **둘 다 거짓**이었으며, 문서가 처방한 탈출구(`## legacy`)를 따르면 validate가 빨개졌습니다. 자료는 보통 **매핑된 뒤에** 철회되므로 두 집합에 다 들어갑니다 — 분자에 같은 규칙을 적용했습니다.
- **`status`가 `documents/*/review.md`의 Human queue를 안 읽어 "0"을 단언**했습니다(`validate`는 같은 파일을 읽고 있었습니다). 두 소비자가 쓰는 파일 목록을 `hq_files()` 하나로 합쳤고, 그 과정에서 **경로에 공백이 있으면 소유권 검사가 통째로 꺼지던 문제**(목록이 공백으로 이어붙인 문자열이었습니다)도 같이 닫혔습니다. 읽는 헤딩 레벨도 `validate`와 동일하게 맞췄습니다 — `verify.md`는 `##`, `review.md`는 `#`을 씁니다.

### 고친 것 — 선재 결함, 1차: 게이트 3구멍 + 템플릿 (4)

봉인을 본문 전 줄로 넓힌 이득이 **게이트의 문이 열려 있어서** 문서에 도달하지 못하고 있었습니다. 네 군데 다 새 규격 없이 닫았습니다.

- **`final/` 디렉터리가 게이트 검사 대상이 아니었습니다.** FORMATS는 다중 파일 출력을 1급 형태로 규정하는데 게이트는 `final.md`만 찾았으므로, **다중 파일 문서는 한 번도 게이트를 거친 적이 없습니다.** `cmd_status`도 같은 짝이라 함께 고쳤습니다 — 다중 파일 문서를 계속 "→ write"로 보고하면 이미 끝낸 단계로 되돌립니다.
- **`review.md`가 없으면 게이트를 건너뛰었습니다.** 조건이 두 파일의 존재를 모두 요구했기 때문에, 리뷰 파일을 지우면 불변식이 실패하는 대신 **꺼졌습니다.** 게이트 자신의 기록이 없다는 것은 게이트가 돌지 않았다는 가장 강한 신호이므로 이제 그 자체를 위반으로 봅니다.
- **`## Fidelity violations`(레벨 2)로 쓴 위반은 읽히지 않았습니다.** 규격이 이 절의 레벨을 정하지 않았는데 게이트는 레벨 1만 읽었습니다. `hq_body`와 같은 이유로 `fid_body`를 두어 양쪽 레벨을 읽고, 제목 사본 검사도 레벨 무관으로 셉니다. 같은 수정으로 반대 방향 결함도 닫혔습니다 — 레벨 1 절 추출기가 `##` 제목에서 멈추지 않아 **위반절이 비어 있는데도** 그 뒤 권고 findings 전부를 위반으로 세어 깨끗한 문서를 막고 있었습니다.
- **`fm()`이 YAML 꼬리 주석을 안 벗겼습니다.** 배포 템플릿이 열거값을 인라인 주석으로 설명하므로(`provenance: stated  # stated | adopted | derived`), **문서대로 템플릿에서 프로젝트를 만들면 첫 걸음에서 `validate`가 17건 실패**했습니다(`plan.md`·`truth.md`까지 합치면 46건). 인용된 값은 그대로 둡니다 — 인용 안의 `#`는 리터럴이고 템플릿이 `claim`·`location`을 인용합니다. **값 리더가 다섯 개**(`fm` + `validate`·`census`·`reindex`·`pull`의 `val()`)라서 다섯 곳을 함께 고쳤습니다. `fm()`만 고쳤을 때는 truth 파일이 여전히 실패했습니다 — 이 되돌리기가 막으려던 바로 그 "한쪽만 고침"입니다.

### 고친 것 — 선재 결함, 2차: 나머지 전부 (19)

앞 절에 "아직 열려 있는 것"으로 6건만 적었는데 그것은 전체가 아니라 눈에 띄던 부분이었습니다. **부분 기록을 총계로 인용한 것** — 이 도구가 막으려는 동작 그대로입니다. 실제 잔여는 19건이었고 아래가 전부입니다.

**잘못된 데이터를 쓰거나 검사가 조용히 통과하던 것 (6)**

- `retag`이 백슬래시 든 태그로 frontmatter를 두 줄로 쪼개놓고 `validate`가 통과했습니다. `awk -v`가 값에 이스케이프 처리를 하기 때문입니다. `fm_set`·`pull`은 이미 ENVIRON을 쓰고 있었고 **파일을 쓰는 쪽만 마지막까지 `-v`로** 남아 있었습니다.
- 인용 봉인의 **길이 임계값을 없앴습니다.** awk의 `length()`는 UTF-8 로케일에서 문자를, C에서 바이트를 세므로 "10"이 기계마다 한국어 3자와 10자로 갈렸습니다 — 같은 광산이 다른 판정을 받았고, 임계값 미달인 줄은 **아예 검사되지 않았습니다.** 짧은 문자열의 부분일치는 값이 싸고 통과 쪽으로 기울므로 건너뛸 이유가 없습니다. (로케일 4종에서 동일 결과 확인.)
- 같은 자리에서 묘비 판정이 **본문 줄 순서에 의존**하던 것도 고쳤습니다. 첫 일치 줄에서 판정해 같은 파일이 줄 순서에 따라 통과/실패했습니다. 이제 본문을 다 읽은 뒤 판정합니다 — 한 줄이라도 원문에 없으면 철회 사유가 성립합니다.
- `conflict_with` **상호성**을 강제합니다. 한쪽만 선언하면 READ.md 규칙 2("양쪽 다 사용 불가")를 어느 소비자도 적용할 수 없어 `pull`이 침묵한 쪽을 usable로 내보냈습니다. 0패딩 표기 차이(`t1` ↔ `t002`)도 상호로 인정합니다.
- `config`의 `gaps.markers`가 잘못된 정규식이면 grep이 exit 2를 내는데 `2>/dev/null`이 삼켜 **"0건"으로 보고**했습니다. 이제 스캔 전에 패턴을 검사하고, 갭이 아니라 도구 설정 오류이므로 유일하게 non-zero로 끝냅니다.
- **frontmatter 키 중복**을 잡습니다. `fm`은 첫 값, validate/reindex는 마지막 값, census는 둘 다 세어 한 필드에 세 답이 나왔습니다. census에 "상태 합계가 파일 수와 맞는가" 산술 검사도 넣었습니다.

**should-fix (8)**

- `validate`가 **frontmatter 없는 truth 파일의 원인을 말합니다.** 전에는 "reindex를 돌려라"만 반복하고 reindex는 성공을 보고하는 무한 루프였고, 진짜 원인은 `reindex --check`만 알고 있었습니다. 그 경우 인덱스 탓을 하지 않도록 메시지도 억제합니다.
- 폴더 이름에 **공백**이 있으면 `$(doc_ids)`/`$(material_ids)`가 단어 분할돼 실제 폴더는 검사되지 않고 유령 id 둘이 보고됐습니다. 8개 순회를 전부 줄 단위 읽기로 바꿨습니다(`< <(...)`로, `prob` 집계가 서브셸에서 사라지지 않게).
- `resolution`의 **enum 3종을 검사합니다.** 손으로 쓴 결정 기록은 전부 무검사였고 `decided_by`는 schema에 아예 없었습니다(추가함). 결정의 출처를 적지 않은 resolution도 지적합니다 — 사람이 판정했는지 기계가 골랐는지가 두 번째 막입니다.
- `pull`만 ``을 안 벗겨 소비자 조회에서 필드가 밀렸습니다.
- `truth.fm.required`/`enum.status`/`enum.provenance`와 resolution enum 3종을 **schema에서 읽습니다.** 전에는 awk에 하드코딩돼 FORMATS.md의 "schema가 이긴다"가 truth 파일에 대해 거짓이었습니다.
- census가 **최소 id보다 아래의 번호 구멍**을 보고합니다. id는 t001부터 할당되므로 가장 낮은 파일이 t011이면 t001–t010은 사라진 것인데, 살아있는 id 사이의 구멍만 보고 있었습니다.
- `plan.md`의 `cited_truths`가 실제 truth를 가리키는지 검사합니다. 이 목록이 Trigger A의 조회 키이므로 끊어진 id는 그 문서를 **영구히 staleness 대상에서 제외**시킵니다.
- review 스킬이 `status: escalated`를 지시하던 것을 고쳤습니다 — `plan.fm.enum.status`에 없는 값이라 지시대로 하면 `validate`가 깨졌습니다. 에스컬레이션은 `review.md`의 `# Human queue`에 둡니다.

**nice-to-have (5)**

- `reindex --chek` 같은 오타를 조용히 무시하고 **쓰기 모드로 실행**하던 것을 거부합니다.
- `retag`이 **CRLF을 보존**합니다. 태그 하나 바꾸는 명령이 전량 diff를 만들었습니다. CR 탐지는 `grep`이 아니라 bash `read`로 합니다 — MSYS의 grep은 입력에서 CR을 지우므로 `grep -q`는 한 번도 일치한 적이 없었습니다.
- 위반절의 **괄호 없는 산문은 항목이 아닙니다.** 빈 절에 "(없음)"이라 적으면 열린 위반으로 읽혀 문서를 막았습니다. `[kind]`가 있는 줄은 불릿이 없어도 계속 항목으로 셉니다.
- `gaps`가 **원시 스캔임을 명시**하고 `gaps.md`의 수용 건수를 함께 찍습니다. 줄어들지 않는 숫자는 읽히지 않게 됩니다.
- `templates/material.md`의 status 열거에 `retracted`를 넣었습니다.

### 검증 중에 스스로 만들어 잡은 것 (3)

이 세션의 수정 작업이 만든 결함입니다. 셋 다 검증 단계에서 드러났고 고쳤습니다 — 기록해 두는 이유는 warm 검증의 한계를 보여주기 때문입니다.

- `truth.fm.required`를 schema에서 읽는 배열(`reqkey`)을 **만들어놓고 읽지 않았습니다.** 필수 키 검사는 하드코딩된 채였고, 그런데 위 절에는 이미 "schema에서 읽습니다"라고 적어 놨습니다 — 배선이 생기기 전에 주장을 먼저 적은 것. 이제 실제로 읽습니다(schema에 `location`을 추가하면 validate가 따라오는 것으로 확인).
- 그 수정이 새 위험을 만들었습니다: **schema를 못 읽으면 검사가 실패하는 대신 꺼집니다.** 하드코딩일 때는 항상 돌았습니다. 그래서 `validate`가 이제 SoT를 **먼저** 확인하고, 읽을 수 없으면 다른 판정을 내리지 않고 그 자리에서 멈춥니다 — 침묵은 통과와 구분되지 않기 때문입니다.
- CRLF 보존이 **죽은 코드**였습니다. CR 탐지를 `grep -q`로 했는데 MSYS의 grep은 입력에서 CR을 지우므로 한 번도 일치한 적이 없습니다. 읽어서는 맞아 보이고 돌려봐야 드러나는 종류입니다. bash `read`로 바꿨습니다.

### 새로 생긴 것 — 검증 수렴 루프

`config.yaml`에 `repeat`("clean rounds in a row required to pass")이 **선언되어 있었지만 아무 스킬도 읽지 않았습니다.** 값도 `1`이라, 읽혔더라도 "한 번 깨끗하면 끝"이었습니다. 선언만 있고 배선이 없는 노브 — 이 세션이 찾아낸 결함 유형 그대로였고, 형제 저장소 GroveSpec은 같은 노브를 `consecutive_passes` 카운터로 끝까지 이어 놓았습니다.

이번 세션 자체가 `repeat: 1`이 부족하다는 실측입니다. 4라운드째 검토에서 선재 결함 20건이 나왔고, 그 수정 중 셋은 죽은 코드이거나 거짓 주장이었습니다. 한 번 깨끗한 라운드는 **그 라운드에 대한 증거이고 대상에 대한 증거가 아닙니다.**

- **`repeat`이 scale별로** 갈립니다 — `skip` 0 · `light`/`standard` 1 · **`full` 2**. 리뷰어 수가 이미 scale로 갈리던 것과 같은 축입니다. `max_rounds`는 3 → 5(루프가 두 번째 통과를 얻을 여유).
- **`consecutive_passes`** — `verify.fm.optional`(있으면 int, 없으면 0)과 `review.fm.optional`. 깨끗하면 +1, 실패하면 **0**, 그리고 **step 0의 기준선이 움직였으면 0**. 라운드마다 기록하므로 콜드 세션이 루프를 처음부터 다시 돌리지 않고 이어받습니다.
- **`status: in-progress`** 추가 — 깨끗했지만 카운트가 `repeat`에 못 미친 상태. `passed`는 카운트가 도달했을 때만 씁니다. 전에는 이 상태를 적을 값이 없어 한 번 통과가 곧 `passed`였습니다.
- **`## Verified units`가 통과 기준을 기록**합니다(`passes 2/2`). 나중에 `repeat`을 올렸을 때, 예전의 낮은 기준으로 통과한 단위가 새 기준을 조용히 물려받지 않고 드러납니다.
- **`escalated`는 도달한 연속 횟수로 보고**합니다(`2 rounds, 1/2 clean in a row`) — "passed"가 아니라.
- `review.md`에 frontmatter(`round`·`consecutive_passes`)와 **빠져 있던 `# Human queue` 절**이 들어갔습니다. `review.sections`가 요구하는데 템플릿에 없었습니다.

**대상은 루프 내내 얼려 있습니다.** verify step 0이 기준선을 고정하고 움직이면 그 라운드를 FAIL시킵니다 — 연속 통과가 의미를 갖는 이유가 그것이고, 없으면 움직이는 표적의 통과를 세게 됩니다. 광산이 자라는 문제는 이 카운터가 아니라 `stale` + `## Verified units` 단위 원장이 따로 처리합니다(두 축은 별개).

**역호환 — 정정.** 처음 이 문단에 "기존 `verify.md`는 그대로 통과합니다"라고 적었는데 **거짓입니다.** frontmatter만 보면 맞습니다(`consecutive_passes`는 optional, 없으면 0). 그러나 같은 번들이 `verify.sections`를 강제하게 됐으므로, `## Human queue`·`## Adjudications`가 생기기 전에 쓰인 `verify.md`는 **`validate`에서 2건 실패**합니다. eclypse(세 절을 모두 가진 광산) 하나만 확인하고 일반 주장을 쓴 것이 원인입니다.

**마이그레이션**: 기존 `truths/verify.md`에 빠진 절의 **빈 제목만 추가**하면 됩니다(`## Verified units` · `## Human queue` · `## Adjudications` — 헤딩 레벨은 `#`/`##` 아무 쪽이나). 오류 메시지가 빠진 절 이름을 정확히 말해 줍니다.

**왜 `verify.sections`는 강제하고 `review.sections`는 안 하는가** — 같은 판단을 두 곳에 다르게 적용한 것이 맞고, 이유는 이렇습니다. `verify.md`는 프로젝트당 한 파일이고, `## Verified units`가 없으면 전역 `passed`가 그 뒤에 태어난 단위를 조용히 덮습니다(단위별 정직성이 담기는 유일한 자리입니다). `review.md`는 문서당 한 파일이고, 게이트는 필요한 절을 헤딩 레벨 무관으로 이미 읽습니다. 그래도 비대칭이 불편하면 되돌릴 수 있습니다 — 강제를 빼는 쪽이 한 줄 더 쌉니다.

### 커밋 후 정적분석에서 나온 것 (1)

실기 콜드 라운드 전에 소스만 보는 검사를 한 번 더 돌렸습니다 — 이번 세션에 실제로 물렸던 결함 유형을 자동 검사로 만든 것(죽은 함수 · 채우고 안 읽는 배열 · schema 키 미독 · config 노브 미독 · 스킬이 쓰는 enum 값이 schema에 없는 것 · awk 단일인용 안의 아포스트로피 · 리터럴 제어문자 · schema 섹션 목록 ↔ 템플릿 헤딩).

- **`verify.sections`가 소비자를 잃었습니다.** 그 키를 읽는 유일한 곳이 감사 레인 A2였고, 그 레인을 되돌리면서 schema에 선언되고 FORMATS가 서술하는데 **아무도 강제하지 않는** 상태가 됐습니다. 특히 `## Verified units`는 단위별 정직성을 담는 절이라, 없으면 전역 `passed`가 그 뒤에 태어난 단위를 조용히 덮습니다. `validate`가 검사하게 복구했습니다(헤딩 레벨 무관 — 규격이 레벨을 정하지 않았고 게이트가 이미 그 교훈을 비싸게 배웠습니다).

같은 검사가 `review.sections`도 미독으로 잡았지만 **넣지 않았습니다.** 그건 한 번도 강제된 적이 없어서, 지금 넣으면 복구가 아니라 **새 형식 요구사항**이고 네 번째 절이 생기기 전에 쓰인 `review.md`를 깨뜨립니다. 마이그레이션 비용이 있는 결정은 정리 작업이 아니라 사용자 몫이라, schema에 왜 서술 전용으로 두는지 적어 두었습니다.

그리고 `*.fm.optional` 계열이 **의도적으로** 서술 전용이라는 것을 schema 머리말에 명시했습니다. 선언만 있고 안 읽히는 키는 강제되는 키와 구분되지 않고, `repeat`이 정확히 그렇게 방치돼 있었습니다 — 다음 정적분석이 "잊고 배선 안 한 것"과 "일부러 서술만 한 것"을 가를 수 있어야 합니다.

나머지 검사는 전부 깨끗했습니다: 죽은 함수 0 · 안 읽는 배열 0 · awk 안의 아포스트로피 0 · 리터럴 CR 0 · 스킬·템플릿이 쓰는 status 값 14개 전부 schema에 존재 · 템플릿 헤딩이 schema 섹션 목록과 일치.

### 아직 열려 있는 것

**이 번들에 대한 콜드 검토는 0회입니다.** 위 수정은 전부 warm 검증 — 고친 사람이 고른 케이스로 확인한 것이며, 이 저장소의 교리대로 warm은 cold을 대체하지 않습니다. 되돌린 세 명령(`audit`·`new-truth`·`supersede`)은 각자 검토 라운드를 거친 뒤 다시 들어옵니다.

## 2026-07-29.4

한 세션에서 실사용 로그를 검토해 두 가지를 만들고(감사 레인 · Human queue 소유권), 이어서 나머지 다섯 건을 마저 구현한 뒤, **4개 관점 콜드 검토**로 결함을 잡아 고쳤습니다.

### 새로 생긴 것

**감사(audit) 레인** — `validate`(형식)와 `verify`(충실성) 사이의 세 번째 레인. 묻는 것은 *"광산이 자기 자신에 대해 하는 말이 맞나"*입니다.
- `weavedoc audit` — 기계 판정 A1~A5(장부 카운트 · verify 상태 정합 · resolution 상호성 · 중복/과소 진실 · 잔여 파일). **출력이 항상 "안 본 것"으로 끝납니다.**
- `weavedoc-audit` 스킬 — 고정 차원 A1~A7. A6(`as_of` 값의 진위)·A7(파일 간 의미 표류)은 판단 몫.
- **루프가 없는 것은 의도**입니다. verify/review는 대상이 고정이고 발견이 열려 있어 반복하지만, 감사는 반대 모양(대상이 열려 있고 검사가 고정)이라 **목록이 루프를 대신합니다.** 대신 정직한 한계 두 가지를 규격에 적었습니다 — 목록은 커버가 아니라 표본이므로 **밖에서 온 발견에는 A8을 추가**하고, 런 중 수리는 앞선 판정을 무효화하므로 **끝나고 기계 절반을 다시 읽습니다.**
- 비용은 광산 크기가 아니라 **변경량**에 비례합니다(A6/A7을 `audited_at` 이후 변경분으로 한정).

**쓰기 경로** — `weavedoc new-truth` / `weavedoc supersede`. 읽기·검사는 오래전에 기계화됐는데 쓰기만 손이었고, 그래서 규격 위반이 *쓴 뒤에* 잡혔습니다. `new-truth`는 **파일이 생기기 전에 인용 봉인을 검사**하고, `supersede`는 **결정을 모든 당사자에게 한 번에** 기록합니다.

**T5 consumer-reader 렌즈**(verify) — READ.md와 `pull`만 가지고, 자료 없이 광산을 읽습니다. 다른 모든 렌즈는 광산의 맥락을 *가지고* 읽으므로 **없는 이정표는 이 렌즈만 볼 수 있습니다.** PASS는 절차로 정의(대조 기준이 없으므로).

**M4 reachability 렌즈**(verify) — `origin: research` 자료 전용. 나중에 같은 출처에 도달해 같은 값을 얻을 수 있는가.

### 규격 추가

| | |
|---|---|
| `origin: research` | 기계가 직접 가져온 자료. `url`·`retrieved_at` 필수, `source.md`는 **변환 전 원값** 보존, 그 truth는 `provenance: stated` 금지 |
| `status: retracted` (truth) | 애초에 성립하지 않았던 추출의 묘비. resolution 없음, `changelog`의 `removed:` 줄 필수, 충돌 한쪽만 철회 금지 |
| `corrects: [m011 §4]` (material) | 정정 자료가 무엇을 대체하는지 선언. resolution `scope`를 추론 대신 읽어오고, 본문만 읽는 소비자도 정정임을 앎 |
| Human queue 소유권 | `user-only` / `recommended` / `machine`. **콜드 defender가** 붙임 — 기각하려던 기계가 붙이면 기각이 한 층 위에서 부활 |
| `## legacy` (coverage) | 사용자 재정 면제 구획. 분모가 실제로 N/N에 도달 가능 |
| `truths/audit.md` | 감사 상태 파일. `## Scope`가 **필수**이고 `validate`가 강제 |

### ⚠️ 깨지는 변경 — 인용 봉인이 본문 전 줄로 확대

`validate`의 축자 인용 검사가 **본문 첫 줄만** 보던 것에서 **10자 이상인 모든 줄**로 넓어졌습니다.

FORMATS가 명시적으로 권장하는 **다행(多行) 전문 truth** — 가사 전문·계약 조항·코드 스니펫처럼 정확한 문구 자체가 사실인 것 — 은 예전 규칙에서 **1행 외 전부가 봉인 밖**이었습니다. 2행부터는 무엇으로 바꿔도 통과했습니다.

**기존 광산을 이 번들로 올리면 초록이던 것이 빨강이 될 수 있습니다.** 그건 새 결함이 아니라 그동안 검사되지 않던 줄이 이제 검사되는 것입니다. 업그레이드 후 첫 `validate`에서 다행 본문 truth를 확인하세요 — 어긋난 줄은 원문에서 다시 복사해야 합니다.

`new-truth`의 쓰기 시점 봉인도 같은 규칙으로 맞췄고, 비교 대상에서 자료의 frontmatter를 제외했습니다(기계가 쓴 `summary:`로 봉인이 충족되던 문제).

### 그 밖에 validate가 새로 차단하는 것

- `truths/verify.md`의 프론트매터·enum·필수 섹션 (형제 파일 `audit.md`와 같은 수준으로)
- `supersede`의 사전 검사 — 철회된 truth/자료를 승자나 패자로 지정하는 것
- id 참조가 실재하는지 — `conflict_with`·`superseded`·`derived_from`·`corroborated_by` (이전엔 `corrects`만)
- 봉헌 게이트에서 `# Fidelity violations` 제목이 중복된 문서

### 재검증 등급표

판단이 아니라 표로. frontmatter만 → 콜드 라운드 없음 / 진실 3건 이하 → diff 미니라운드 / 그 이상·critical → 전체 라운드. 레벨이 안 돌린 렌즈는 `— (level)`로 적습니다(PARTIAL 아님 — 그래야 `light`/`standard`가 통과 가능).

### 콜드 검토가 잡은 결함 (전부 수정됨)

기억해 둘 만한 유형:

- **자기 템플릿이 자기 설계를 무력화** — 감사 템플릿 주석을 프론트매터 앞에 둬서 `fm()`이 못 읽음. `audited_at`이 영영 안 읽혀 감사가 매번 전체 스윕으로 회귀. **규칙: 프론트매터는 1행, 주석은 그 뒤.**
- **규칙이 자기 처방을 도달 불가로 만듦** — `retracted` 묘비가 A4를 트립시켜, map이 시킨 대로 철회하면 닫을 수 없는 지적이 영구 발생.
- **필터가 너무 넓음** — `- [{kind}]` 잡으려던 placeholder 필터가 YAML flow map을 인용한 실제 항목까지 삼킴. **필터는 정확한 모양에 앵커.**
- **`awk -v`는 이스케이프를 해석함** — `--reason`의 윈도우 경로가 한 줄짜리 `resolution:`을 두 줄로 쪼개고 뒷줄이 소실, 그런데 `validate`는 통과. 사용자 값은 **ENVIRON 경유**.
- **`set -e` 없이 `shift 2`는 조용히 실패** — 값 없는 플래그에 무한 루프.
- **카운트 규칙이 계층마다 달라짐** — `validate`/`status`/`audit`이 "항목"의 정의를 달리 보면 열린 총계가 버킷 합과 안 맞음.
- 그 외: 날짜 zero-padding, `removed:` 한 줄에 여러 id, 주석 제거 순서, 중복 h2 재진입, hole당 grep 프로세스(990개 → 2분).

### 기타

- `census` — 홀을 "설명됨/미설명"으로 분리, `retracted` 별도 집계, `coverage N/M of TOTAL (K legacy-exempt)`로 원 총계 병기
- `pull` — `derived` 라벨이 **assumptions를 실제로 출력**(예전엔 "읽어보라"면서 안 보여줬음), `retracted` 전용 라벨·집계
- `status` — 열린 Human queue를 소유권별로 표시
- `weavedoc version` — fingerprint 병기
- `weavedoc-gaps`와 `weavedoc-audit` 역할 구분(트리거 문구 정리)

---

## 2026-07-27.7 이전

`notes/`의 세션 로그 참조.
