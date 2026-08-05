# WeaveDoc 통합 개선 계획

> 상태: 실행 중 — §11 전 항목 결정 완료(2026-08-02) · Phase 0 완료(2026-08-02) · **Phase 1 완료(2026-08-02: COR-001~004 구현·회귀 통과, v1/v2 dual-reader, 내부 milestone — 공개 release 없음)** · **Phase 2 완료(2026-08-02: mktemp 격리 + keyed resume cache · CI 신설·green — 4개 run에 걸쳐 실결함 5건 수리)** · **Phase 3 완료(2026-08-02: schema v2 협상(미래 fail-closed·v1 공지·양 기록 일치) · config 전 계약(section-aware cfg2) · `upgrade --check/--dry-run/--apply` — staged·rollback(트리 해시로 증명)·멱등·golden v0.1 광산 clean validate · 244-unit 실광산 --check 실측 · digest 소급 없음)** · **Phase 5 완료(2026-08-02: 문서정합+doccheck · E2E 8시퀀스 · diagnostic 계약(코드 86종+양방향 드리프트 차단)+validate/scope/version --json · SEC-001 init 고지 · release 자동화 — notes는 dispatch diff에서 기계 생성, tag는 full matrix green 후에만 publish. 명시 잔여: 스킬 주도 실전 문서 1회, upgrade --json)** · **migration train 해제 — 태그 가능** · **Phase 4 완료(2026-08-02: 성능 — 실광산 validate 497.9→106.2초(−78.7%, 최소 fixture는 −65%로 기록상 병기) · retag 트랜잭션+rollback · reindex atomic staging · write workspace/symlink guard · CLI 경계 8종+실달력 날짜+audience 계약. 예외 1: §10 단위 9의 "모듈 분리+단일 파일 빌드"는 성능 목표가 단일 파일 안에서 달성되어 필요성 재평가 대상으로 보류 — 조용한 탈락이 아니라 §11 재상정 후보)** · **v0.3.0 태그 → 1차 cold review 6건 전부 수리 = v0.3.1(2026-08-02: seal 강제·인용 파싱·dual-final validate·consecrate 중단 감지·gaps/ledger fail-closed·passes N==N — CI Linux/Windows 284/284, macOS 280/284 non-blocking)** · **v0.3.2(2026-08-03: 2차 cold review 8단계 합의안 — upgrade v1 전용(seal 세탁 근원 차단)·review_legacy 수명주기·seal tuple all-or-none·dual-final consecrate 사전 거부·gaps 문법 fail-closed·fm-less v0.1 review migration·내구 .consecrate.inflight(CONSEC-INTERRUPTED)·이관 축 교정+출처 토큰(기-이관 광산 런타임 교정)·ledger 6열 형식·macOS best-effort 결정(§11)·trust boundary 명문화 — 회귀 310/310, 신규 26 전부 red-first. 이연 기록: candidate-aware validate 전면 재설계 · failed 행 바이트 변경 시 stale 재라벨)** · **필드 리포트 2026-08-03 반영 완료(2026-08-04: P1 단일 패스 접기 — 실광산 validate 155→32s(−79%)·합성 47→8s, 검사 규칙 무변경 · D1 index/tree 라벨(truth_labels 공유) · D4 부분폐기 라벨 · D3 reason 인용 강제+RES-REASON-UNQUOTED 경고(§11 결정) · D2 표 미리보기 — 회귀 331/331, 신규 8 red-first)** · **v0.3.3(2026-08-03: 3차 cold review)** · **v0.3.4(2026-08-04: 필드 리포트 5건)** · **v0.3.5(2026-08-04: P1 phase 2 — 실광산 validate 32→13~18s · 로케일 독립 verdict(콘텐츠 파싱 awk 바이트 고정) · macOS required 승격(§11) — 회귀 332/332, 3-OS required 전부 green)** · **v0.3.6 진행 중(2026-08-04: 4차 cold review 잔여 = 반나절 위생 패치. 유닛 1 scope 격리 대칭 — 콜드 diff 리뷰가 찾은 부작용까지 수리(격리 행은 폴백을 열지 않는다, §11 결정) · 유닛 2 gaps noise를 논리 entry 단위로 · 유닛 3 consecrate validate-실패 분기 postcondition · 유닛 4 FM 값 규칙 단일화 + 로케일 핀(scope·census·mat_digest·공유 마크다운 리더) · 유닛 5 문서·CI 정합)** · 다음: v0.3.6 태그(full matrix, 사용자 승인 후) · 잔여: 스킬 주도 실전 문서 1회 · upgrade --json · 모듈 분리 재평가(§11 후보) · **테스트 스윕 가속(§10 후보: 지배 항은 호출당 고정 floor ×~500회 × MSYS fork 직렬화 — 하네스 상주화·케이스 배칭·Windows -j 하향; P1 범위 밖으로 실측 확인)**
>
> 비교 기준: `v0.1.0` (`ff0b726`, runtime `2026-07-27.7`) → 현재 HEAD `7c199e6` (`v0.2.0` tag 이후 2개 commit, `git describe: v0.2.0-2-g7c199e6`, runtime `2026-08-02.2`)
>
> 목적: 현재판의 fidelity 강점을 보존하면서 정확성, 마이그레이션, 테스트, 성능, 배포 계약을 제품 수준으로 끌어올린다.

## 1. 요약

현재판은 `v0.1.0`보다 잘못된 초록불을 막는 능력이 크게 좋아졌다. 경로·schema 누락, 읽히지 않은 truth, 인용 봉인 실패, 충돌·철회·resolution 불일치, 숨겨진 fidelity violation을 더 넓게 차단하고, 실제 검사 범위를 `examined:`로 드러낸다.

반면 다음 문제가 남아 있다.

1. 새 `scope`가 `status: used`를 검증 완료로 간주해, verify를 건너뛴 자료가 영구히 verified로 오계수될 수 있다.
2. clean review가 어느 draft/final 바이트를 검토했는지 연결하는 digest가 없다.
3. `v0.1.0` 광산에 적용되는 breaking format 변경은 많지만 자동 migration과 실제 schema version 협상이 없다.
4. 182개 회귀 테스트는 로컬 `notes/`에만 있고 배포·CI에는 없다.
5. 검사기가 약 762줄에서 약 2,000줄로 커졌고, 동일한 최소 정상 픽스처의 Git Bash `validate`는 약 10초에서 약 35초로 느려졌다.
6. Git tag, runtime 날짜, project/config `version: 1`, 부분 fingerprint가 서로 다른 버전 체계를 이룬다.
7. document half는 아직 실제 end-to-end 근거가 부족하다.

따라서 다음 구현 순서를 고정한다.

1. **정확성** — 상태축 분리와 artifact digest
2. **재현성** — 테스트 추적·CI·진단 코드
3. **업그레이드 가능성** — schema v2와 migration
4. **구조·성능·쓰기 안전성** — 파서 통합, 캐시, atomic write
5. **제품 계약** — 버전·JSON·문서·E2E·릴리스 게이트

## 2. 기준선과 검증된 사실

| 항목 | `v0.1.0` | 현재 HEAD | 판정 |
|---|---:|---:|---|
| 실행 스크립트 | 762줄, 약 41KB | 약 2,000줄, 약 136KB | 기능은 증가했지만 유지보수 부담 증가 |
| 함수 수 | 26 | 48 | 구조 분리 필요 |
| `validate` 본체 | 약 255줄 | 약 851줄 | 단일 책임 한계 초과 |
| schema key | 23 | 37 | 계약은 풍부해졌으나 migration 필요 |
| 회귀 케이스 | 배포 트리 0 | 로컬 182 | 개발 QA 개선, 릴리스 재현성 없음 |
| 최소 정상 fixture `validate` | 약 10.0초 | 약 35.1초 | 약 3.5배 느림 |

Git diff 기준으로는 24개 파일에 2,629줄이 추가되고 338줄이 삭제되었다. 성능 숫자는 동일 환경에서 수행한 단일 측정이므로 확정 benchmark가 아니라 회귀의 크기를 보여주는 기준선으로 사용한다. 정식 성능 판정은 동일 fixture를 3회 이상 실행한 median으로 대체한다.

현재 로컬 suite는 182개 케이스를 보유하며 CHANGELOG에는 182/182 통과가 기록돼 있다. harness 자체 분류 기준 구성은 block 101개, pass 54개, accounting 26개, meta 1개로 합계 182개다. 181개로 보이는 수동 계수는 단일 `meta_single_judges` 케이스를 빠뜨린 결과다. 이번 분석에서 독립 재실행한 범위는 30/182 PASS, 0 FAIL이고 나머지는 미실행이다. 따라서 문서의 전체 통과 기록과 이번 세션에서 직접 재현한 범위를 구분한다.

현재 검사기는 다음 과거 silent pass를 실제로 차단한다.

- 자료가 있는데 `catalog.md`가 없는 경우: `v0.1.0`은 성공했지만 현재판은 실패한다.
- bracketed violation을 `Fidelity violations` 밖에 둔 경우: `v0.1.0`은 성공했지만 현재판은 실패한다.
- schema 또는 설정 경로가 읽히지 않는 경우: 현재판은 검사 0회를 성공으로 표시하지 않는다.

관련 구현은 [.weavedoc/bin/weavedoc](.weavedoc/bin/weavedoc), 형식 계약은 [.weavedoc/FORMATS.md](.weavedoc/FORMATS.md), 현재 QA 기록은 [CHANGELOG.md](CHANGELOG.md)에 있다.

## 3. 반드시 보존할 현재판의 강점

리팩터링은 다음 불변식을 약화해서는 안 된다.

### 3.1 Fail-closed 검증

- schema를 읽지 못하면 판정을 내리지 않는다.
- 설정된 materials/truths/documents 경로가 없으면 실패한다.
- 존재하지 않는 경로를 순회한 0회 검사를 clean으로 취급하지 않는다.
- 결과에는 examined, sealed, seal failed, tombstone, not checked, consecrated, gate-checked를 구분해 표시한다.

### 3.2 Fidelity gate

- `final.md`와 `final/` 모두 같은 게이트를 통과해야 한다.
- final이 있는데 review가 없거나 읽을 수 있는 `Fidelity violations` 절이 없으면 실패한다.
- fidelity violation은 advisory finding으로 낮추거나 review 산문으로 지울 수 없다.
- violation kind가 gate 절 밖에 주차된 경우 형태와 관계없이 실패한다.
- comment·heading·Markdown 표면형으로 gate reader를 우회할 수 없어야 한다.

### 3.3 Truth·출처 무결성

- canonical material/truth ID는 디스크에서 하나의 철자만 가진다.
- 관대한 reference 해소는 유지하되 ambiguous disk identity는 거부한다.
- truth body의 verbatim seal, 연속 블록 검사, 빈 본문·지나치게 짧은 fragment 차단을 유지한다.
- conflict reciprocity, resolution winner, derived references, retracted source/truth 규칙을 유지한다.
- `origin: research`는 `url`·`retrieved_at`과 비-`stated` provenance를 요구한다.
- `corrects`, `dated`, `retracted`, `removed:`의 의미를 보존한다.

### 3.4 운영 가시성

- `census`는 raw total과 legacy exemption을 함께 보여준다.
- Human queue는 `user-only`, `recommended`, `machine`으로 나눈다.
- `pull`은 conflict·unsupported·retracted 상태를 숨기지 않는다.
- `scope`의 목표인 불필요한 전체 재검증 방지는 유지한다. 단, 계산 근거는 아래 설계대로 고친다.

## 4. 문제 목록

### P0 — 정확성·보증

#### WD-COR-001 — `used`와 `verified` 상태축 충돌

현재 material `status`는 `collected`, `converted`, `verified`, `used`, `retracted`를 한 축에 담는다. 그러나 `used`는 lifecycle이고 `verified`는 검증 verdict다. refine은 final 생성 시 material을 `used`로 바꾸며, `scope`는 `verified|used`를 모두 검증 완료로 센다.

결과적으로 verify를 생략한 material도 한 번 사용되면 이후 scope에서 검증 부채가 사라질 수 있다.

**해결 방향**

- material lifecycle과 verification을 분리한다.
- lifecycle은 `collected | converted | used | retracted`로 둔다.
- verification은 별도 ledger 또는 frontmatter object로 `unverified | verified | legacy-unbound | stale | failed`를 기록한다.
- `scope`는 lifecycle을 추론하지 않고 verification ledger와 현재 content digest만 읽는다.
- `used`는 절대 verified의 대체 신호가 되지 않는다.

#### WD-COR-002 — review와 final의 내용 결속 부재

현재 gate는 clean review artifact의 존재와 빈 violation 절을 확인하지만, 그 review가 현재 final의 정확한 bytes를 검토했다는 증거는 없다. refine 흐름도 `validate` 뒤에 final을 작성한다.

**해결 방향**

- review frontmatter에 `reviewed_digest`와 `reviewed_kind: draft|final`을 기록한다.
- review가 판정에 사용한 cited truth, source material, relevant config, schema의 정렬된 manifest를 `review_context_digest`로 함께 기록한다.
- 단일 파일 digest는 SHA-256(raw bytes)로 계산한다.
- 다중 파일은 상대경로 오름차순의 `path\0sha256\n` manifest를 다시 SHA-256한다.
- clean review 이후 draft가 바뀌면 review는 자동 stale이다.
- cited truth, 해당 source, gate에 영향을 주는 config/schema가 바뀌어도 review는 자동 stale이다.
- consecration은 검토된 draft로 final candidate를 기존 final과 같은 filesystem의 staging 위치에 먼저 쓴다.
- candidate digest와 clean review digest를 대조하고, candidate를 최종 상태로 간주하는 full validation을 정확히 한 번 실행한다.
- validation이 성공하면 candidate를 atomic promote하고, 실패하면 기존 final은 그대로 보존한다.
- 기존의 pre-write full validation은 staging 이후의 candidate-aware validation으로 이동하며 같은 경로에서 두 번 실행하지 않는다.

Phase 1은 성능 최적화보다 정확성을 먼저 적용하지만, 위 candidate-aware 경로로 full validation 2회 상시 실행은 피한다. 내부 전환용 구현이 부득이하게 pre/post validation을 모두 수행하면 Windows 최소 fixture 기준 약 70초가 걸릴 수 있다. 이 상태는 명시적인 임시 bridge로만 허용하며 release-ready로 판정하지 않는다.

#### WD-COR-003 — verified unit의 freshness 결속 부재

현재 `scope`는 `Verified units`에 ID가 있는지를 보지만, 그 ID의 현재 내용이 당시 검증한 내용과 같은지는 계산하지 않는다. 이미 verified인 truth/material을 수정하고 ledger를 갱신하지 않으면 scope가 변화를 알아낼 수 없다.

**해결 방향**

- material과 truth verified-unit마다 `content_digest`, `verified_at`, `standard`, `round`를 기록한다.
- `scope`는 disk population과 ledger ID뿐 아니라 digest를 비교한다.
- digest 불일치는 `stale`로 계산한다.
- 수동 수정, agent 실수, 정상 map/gather 흐름 모두 같은 방식으로 감지한다.
- 기존 digest 없는 검증 기록은 현재 bytes에 digest를 소급 날인하지 않고 `legacy-unbound`로 보존한다.
- 감사 기록이 검증 실행을 특정 Git revision, tree 또는 artifact manifest와 명시적으로 결속하고 그 bytes를 재구성할 수 있을 때만 digest를 소급 결속한다. 비슷한 시점의 revision을 찾았다는 사실만으로는 검증 증거가 아니다. 입증된 digest가 현재 bytes와 다르면 `stale`이다.
- `scope`는 digest-bound verified, legacy-unbound, stale, unverified, failed를 별도 집계하며 `legacy-unbound`를 fully verified 수치에 포함하지 않는다.
- legacy-unbound 자산은 final에서 인용되는 항목, high-risk truth/material, research/adopted/derived 항목 순으로 재검증한다.

#### WD-COR-004 — completeness 보증 문구와 실제 차단력 불일치

gaps는 on-demand이며 open gap이 final을 막는지는 아직 배선되지 않았다. semantic contradiction도 모든 경우를 기계적으로 발견할 수 없다. 그런데 일부 소개 문구는 조건 없이 “no contradiction”, “no silent gaps”, “any conflict surfaced”를 보증한다.

**해결 방향**

- 보증 문구를 “검출된 contradiction은 조용히 출하되지 않는다”로 통일한다.
- completeness가 `required`일 때 어떤 gap ledger 상태가 final을 막는지 명시하고 기계적으로 연결한다.
- completeness가 `off`이면 해당 한계를 status와 final confirmation에 표시한다.

### P0 — 테스트·릴리스 재현성

#### WD-QA-001 — 회귀 suite가 배포되지 않음

현재 182개 suite는 `notes/regress.sh`에 있으며 `notes/`는 gitignore 대상이다. 별도의 `notes/fidtest.sh`에는 두 `fid_body`(`Fidelity violations` 절 body) reader의 side-by-side 비교 실험 11개가 있으며 이 fixture는 182개 합계에 포함되지 않는다. 또한 저장소에 `.github/`가 없어 CI는 기존 설정의 보강이 아니라 0에서 신설해야 한다. fresh clone, PR, tag, downstream install에서 현재와 같은 테스트를 실행할 수 없다.

**해결 방향**

- `notes/regress.sh`의 182개 케이스를 `tests/regress.sh`와 `tests/fixtures/`로 이관한다.
- `notes/fidtest.sh`의 고유 케이스는 회귀·meta/property 테스트로 통합하고, 중복 실험은 근거를 기록한 뒤 폐기한다. 파일을 검토 없이 그대로 복사하지 않는다.
- `notes/`의 검토 기록과 테스트 코드를 분리한다.
- 모든 release는 추적된 suite의 결과로만 182/182 또는 후속 개수를 주장한다.

#### WD-QA-002 — harness 격리·resume 신뢰성 부족

suite는 고정 `$TMPDIR/wd-reg`를 사용한다. 동시 실행과 중단된 worker가 충돌할 수 있고, `--resume`은 commit 또는 bundle digest가 달라도 과거 결과를 재사용한다.

**해결 방향**

- 실행마다 `mktemp -d`를 사용하고 `trap`으로 정리한다.
- resume cache key에 Git commit, bundle manifest digest, OS, Bash/awk/sed 버전을 포함한다.
- 다른 key의 결과는 재사용하지 않는다.
- 중단 시 child process와 fixture를 회수한다.

#### WD-QA-003 — 테스트 편중과 느슨한 assertion

현재 suite는 `validate`와 gate에 집중되어 있고 `impact`, `gaps`, `version`, `lang`, `locale` 및 9개 skill의 E2E 증거가 부족하다. block 테스트도 기대 문자열 하나만 있으면 예상하지 못한 추가 오류가 있어도 PASS가 될 수 있다.

**해결 방향**

- 각 진단에 안정된 diagnostic code를 부여한다.
- 테스트는 exit code와 정확한 diagnostic code 집합을 검증한다.
- 모든 명령에 success, invalid input, empty project, non-trivial project 케이스를 둔다.
- skill workflow는 golden project를 통해 artifact diff를 검증한다.

### P1 — 호환성·마이그레이션·버전

#### WD-MIG-001 — `v0.1.0` breaking change 자동화 부재

마이그레이션 대상은 최소 다음과 같다.

- material/truth ID를 3자리 이상 zero-padding으로 canonicalize
- 파일·폴더명과 각 파일의 `id:` 갱신
- 필요 시 strict reference 필드 갱신
- `Verified units`의 성공 행 끝에 `verified` verdict 추가
- `verify.md`의 `Verified units`, `Human queue`, `Adjudications` 절 보강
- review의 bracketed kind 기록을 zone rule에 맞는 비-bracket history로 변환
- config scalar `repeat: 1`을 scale map으로 변환
- 새 schema version 기록
- multi-line truth의 전체 seal 재검사
- digest 없는 기존 verified 기록을 `legacy-unbound`로 보존하고 bound verified와 구분
- 감사 기록이 검증 실행과 정확한 revision/tree/manifest의 결속을 입증하고 해당 bytes를 재구성할 수 있는 항목만 digest-bound 상태로 승격

**해결 방향**

다음 인터페이스를 제공한다.

```text
weavedoc upgrade --check
weavedoc upgrade --from 0.1 --dry-run
weavedoc upgrade --from 0.1 --apply
```

- 기본 동작은 read-only check다.
- `--dry-run`은 변경 파일, rename, 예상 validate 결과를 출력한다.
- `--apply`는 사전검사를 모두 통과한 뒤 같은 filesystem의 staging에서 반영한다.
- 변경 전 manifest와 복구 절차를 남긴다.
- 이미 최신인 프로젝트에는 idempotent하게 0 change를 보고한다.

#### WD-MIG-002 — format version이 실제 계약을 나타내지 않음

project/config `version: 1`은 breaking change 이후에도 그대로이며 validator가 version negotiation에 사용하지 않는다.

**해결 방향**

- artifact schema를 `schema_version: 2`로 명시한다.
- runtime SemVer와 artifact schema version을 분리한다.
- validator는 지원하지 않는 미래 schema를 fail-closed한다.
- 과거 schema는 migration 필요 여부와 정확한 명령을 출력한다.

#### WD-REL-001 — 여러 버전 체계와 부분 fingerprint

현재 Git tag, `.weavedoc/VERSION` 날짜, project/config `version`, bin+schema fingerprint가 별도로 움직인다. fingerprint는 behavior를 결정하는 skills/templates를 포함하지 않는다.

**해결 방향**

- 사용자용 제품 버전은 SemVer 하나로 둔다.
- artifact schema version은 별도 정수로 둔다.
- exact install identity는 bundle manifest SHA-256으로 둔다.
- manifest는 다음을 포함한다.
  - `.weavedoc/bin/weavedoc`
  - `.weavedoc/schema`
  - `.weavedoc/templates/**`
  - `.weavedoc/READ.md`
  - `.weavedoc/FORMATS.md`
  - `.claude/skills/weavedoc-*/**`
- SemVer는 behavior compatibility를, manifest digest는 exact bytes를 식별한다.
- tag와 manifest는 release job이 자동 생성·검증한다.

### P1 — 구조·성능·쓰기 안전성

#### WD-ARC-001 — 단일 거대 소스와 파서 복제

frontmatter value reader가 여러 AWK 블록에 복제되어 있으며, 수정 시 다섯 자리를 함께 바꿔야 한다. validator는 실행 중 자기 소스를 grep해 schema key roster를 유도하고, schema 값마다 외부 프로세스를 반복 실행한다.

**해결 방향**

- 개발 소스를 다음 모듈로 분리한다.
  - `lib/schema.sh`
  - `lib/frontmatter.awk`
  - `lib/markdown.awk`
  - `lib/ids.sh`
  - `commands/validate.sh`
  - 명령별 command module
- release build가 모듈을 단일 `.weavedoc/bin/weavedoc`으로 결합한다.
- frontmatter와 schema는 프로세스 시작 시 한 번 읽어 캐시한다.
- source-code grep에 의존하는 runtime behavior를 제거한다.
- 배포 단일 파일의 편의는 유지하되 개발 seam과 단위 테스트를 확보한다.
- 같은 source revision을 두 번 build하면 byte-identical artifact와 같은 SHA-256이 나오는 reproducible build를 요구한다.

#### WD-PERF-001 — Git Bash 성능 회귀

최소 정상 fixture에서 최신 `validate`는 약 35.1초로 측정되었고 `v0.1.0`은 약 10.0초였다. 주요 원인은 MSYS filesystem/process spawn 비용과 반복 parser 실행이다.

**해결 방향과 성능 예산**

- 외부 프로세스 호출 수를 계측한다.
- material/truth metadata는 가능한 한 한 번의 AWK pass에서 읽는다.
- schema/config는 한 번 파싱한다.
- Windows Git Bash 최소 fixture를 현재 대비 70% 이상 단축한다.
- 250-truth benchmark fixture를 추가하고 기준선을 저장한다.
- 성능 숫자는 OS별 CI artifact로 남기며, 안정화 후 허용 회귀 한도를 설정한다.
- staged final 경로는 candidate를 포함한 full validation 1회를 목표로 한다. 전환 bridge가 2회를 요구해 약 70초가 되면 임시 측정치를 공개하고 release gate를 통과시키지 않는다.

#### WD-IO-001 — 비원자적·부분 적용 가능한 쓰기

`reindex`는 두 생성 파일을, `retag`는 여러 원본 파일을 순차적으로 갱신한다. AWK/copy 실패 또는 중단 시 부분 적용될 수 있다.

**해결 방향**

- 모든 출력은 대상과 같은 filesystem의 staging directory에 먼저 쓴다.
- parse·write·post-validate가 모두 성공한 뒤 rename한다.
- 단일 파일은 atomic rename을 사용한다.
- 다중 파일 operation은 before/after manifest와 commit marker를 사용하고 실패 시 rollback한다.
- symlink target과 workspace 밖 resolved path를 거부한다.
- 모든 AWK, copy, rename 실패를 상위 exit code로 전파한다.

#### WD-CLI-001 — 구체적인 입력·경계 결함

다음 quick fix를 별도 회귀 케이스와 함께 처리한다.

- 일반 파일이 아닌 `t001.md` 디렉터리를 truth로 세지 않는다.
- `2026-02-31` 같은 실제로 존재하지 않는 날짜를 거부한다.
- `scope`의 거대·역방향 range를 거부하고 expansion 상한을 둔다.
- 모든 명령이 초과 인자와 알 수 없는 flag를 거부한다.
- `reindex --check unexpected`가 성공하지 않도록 dispatch 전체 인자를 검증한다.
- `retag`의 알 수 없는 세 번째 flag가 실제 write로 흐르지 않게 한다.
- Windows `C:\...` absolute path를 상대경로로 오인하지 않는다.
- Bash, GNU awk, GNU sed 요구사항을 시작 시 preflight한다.

### P1/P2 — Config·CLI·문서·제품 검증

#### WD-CFG-001 — config 일부만 검증

현재 validator는 completeness, detection, attribution만 검사한다. `strength`, `scale`, `repeat`, `max_rounds`의 타입·범위·중첩 구조는 검증하지 않는다.

**해결 방향**

- config schema에 모든 필수·선택 키, 타입, enum, 범위를 선언한다.
- verify/review의 nested key를 section-aware parser로 읽는다.
- `strength`는 허용 정수, `max_rounds`는 양의 정수, repeat는 scale별 비음수 정수로 검사한다.
- unknown key는 error 또는 명시적 warning 정책 중 하나로 통일한다.
- `audience: external`이면 publication label 누락·오타를 검증한다.
- YAML 전체를 지원하지 않는다면 지원 subset을 FORMATS에 정확히 선언한다.

#### WD-CLI-002 — 안정된 machine-readable output 부재

사람용 출력은 개선됐지만 stdout 문자열에 의존하는 자동화는 버전마다 깨질 수 있다.

**해결 방향**

- 모든 read/check 명령에 `--json`을 추가한다.
- JSON에는 `output_schema_version`, `command`, `bundle_version`, `diagnostics`, `examined`, `result`를 포함한다.
- 사람용 기본 출력은 유지한다.
- JSON mode의 stdout에는 JSON만 출력하고 진행·환경 경고가 필요하면 stderr를 사용한다.
- exit code는 `0=success`, `1=validation failure`, `2=usage/runtime failure`로 통일한다.
- diagnostic code는 안정 계약으로, 영문 설명은 변경 가능한 presentation으로 취급한다.

#### WD-DOC-001 — 문서 드리프트와 과장된 보증

정리 대상은 다음과 같다.

- README 상단 artifact 명령 요약에는 `scope`, `version`, `lang`, `locale`를 반영하고, 상세 명령 목록에는 빠진 `lang`, `locale`를 추가해 두 목록을 동기화
- README와 WORKFLOW의 Bash/GNU/macOS 요구사항 통일
- runtime date 비교 안내를 SemVer+manifest digest 안내로 변경
- `final.md`와 `final/`을 모든 gate 설명에 함께 표기
- supersedes가 양쪽 material의 `dated`를 필요로 한다는 규칙 통일
- 실광산 truth 개수 등 시점성 숫자는 자동 생성하거나 제거
- “모든 충돌” 표현을 “검출된 충돌”로 축소
- gaps의 non-blocking/required 정책을 보증 문구와 일치시킴
- `UPGRADING.md` 신설
- `v0.2.0` tag가 `scope` 외에도 이미 `v0.1.0`에 있던 `census`, `reindex`, `retag`, `impact`, `gaps`, `pull`을 신규 명령으로 적은 기록을 정정
- 이후 tag release note의 “신규 명령” 목록을 Git diff에서 자동 생성

#### WD-E2E-001 — document half의 증거 부족

현재 README도 plan·write·review·refine 절반이 충분히 end-to-end 검증되지 않았음을 인정한다.

**해결 방향**

- 단일 파일 문서 golden project
- 다중 파일 문서 golden project
- contradiction, unsupported, missing-required 각각의 block→repair→re-review→final 흐름
- ask loop와 user-answer material 흐름
- 외부 audience publication label 흐름
- truth 변경 후 document stale→recovery 흐름
- clean review 뒤 draft/final 변경이 digest로 차단되는 흐름
- clean review 뒤 cited truth/source/config/schema 변경이 context digest로 차단되는 흐름
- open Human queue 위 explicit go-ahead 기록 흐름

#### WD-SEC-001 — raw source 저장 정책의 사용자 가시성

raw originals는 audit를 위해 versioned 상태로 남지만, 민감 자료 프로젝트에서는 의도치 않은 commit 위험이 있다. `.ignore`는 검색 방패이지 접근 제어나 Git 보호가 아니다.

**해결 방향**

- init에서 raw source가 Git에 포함된다는 사실을 명시한다.
- `raw_source_vcs: track | ignore` 정책을 제공할지 결정한다.
- `ignore` 선택 시 audit 보존 책임과 백업 한계를 경고한다.
- `.ignore`를 security boundary로 표현하지 않는다.

## 5. 목표 상태 모델

### 5.1 Material

권장 frontmatter 예시:

```yaml
id: m001
status: used
verification:
  status: verified
  digest: sha256:...
  verified_at: 2026-08-02
  standard: full
  round: 2
```

- 최상위 `status`는 lifecycle만 표현한다.
- verification은 검증 verdict와 freshness만 표현한다.
- content digest가 다르면 표시값과 관계없이 effective status는 `stale`이다.
- digest가 없는 과거 검증 기록의 effective status는 `legacy-unbound`다. 과거 검증 이력은 보존하지만 현재 bytes의 검증 완료로 간주하지 않는다.
- retracted lifecycle은 scope 모집단에서 제외하지만 audit record는 유지한다.

### 5.2 Truth verified unit

권장 ledger entry 예시:

```yaml
- ids: [t001, t002]
  digest: sha256:...
  standard: standard
  round: 3
  verified_at: 2026-08-02
  verdict: verified
```

Markdown 자유 형식을 계속 지원해야 한다면 동일 데이터를 machine-owned sidecar에 저장하고 Markdown은 생성 view로 둔다. 장기적으로는 검증 상태를 자유 산문에서 분리하는 쪽을 권장한다.

기존 `Verified units` 행에 digest가 없으면 migration은 `verdict: legacy-unbound`로 옮기고 현재 파일의 digest를 자동 생성하지 않는다. 감사 기록이 과거 검증 실행을 정확한 revision/tree/manifest와 결속하고 해당 bytes를 재구성할 수 있거나, 해당 unit을 다시 verify한 뒤에만 위 예시의 `verdict: verified`와 digest를 기록한다.

### 5.3 Review·final

```yaml
# 구현 확정 필드(v0.3.1~): seal은 3필드 tuple — seal-review가 쓰고 validate가 all-or-none으로 읽는다
reviewed_kind: draft
reviewed_digest: sha256:...
review_context_digest: sha256:...
```

최종화 순서는 다음과 같다.

```text
draft 작성
  → review가 draft digest를 고정
  → refine 수정
  → digest 변경 시 review stale
  → clean review가 고정한 draft를 같은 filesystem의 final candidate로 staging
  → candidate와 review/context digest 대조
  → candidate를 포함한 전체 상태를 full validate 1회
  → 성공 시 atomic promote, 실패 시 기존 final 보존
  → consecrated
```

## 6. 구현 단계

### 릴리스 경계 — Phase 0~3은 하나의 migration train

Phase 1의 새 verification/review 필드와 Phase 3의 upgrade 도구 사이에는 공개 release를 만들지 않는다. 개발 commit과 내부 pre-release는 가능하지만, Phase 1 또는 Phase 2만 반영한 tag·배포 artifact는 금지한다. 기존 v1 광산을 읽는 dual-reader와 `legacy-unbound` 판정은 Phase 1부터 제공하고, schema v2 필수 강제는 Phase 3의 upgrade·rollback·golden test가 준비된 뒤 한 release에서 함께 활성화한다. Phase 3 완료는 이 migration train의 gate를 해제할 뿐이며, 최종 release-ready 판정에는 §9의 나머지 조건도 적용한다.

### Phase 0 — 기준선 고정

- 현재 bin·schema·skills·templates manifest 생성
- `notes/regress.sh`의 기존 182개 suite를 변경 없이 추적 가능한 위치로 복사하고 block 101 + pass 54 + accounting 26 + meta 1의 case manifest를 저장
- `notes/fidtest.sh`를 별도 inventory하고 고유 coverage와 중복 실험을 표시
- 현재 human output golden과 성능 baseline 저장
- 알려진 current behavior를 snapshot으로 고정

**완료 조건**

- fresh clone에서 현재 suite를 실행할 수 있다.
- baseline 결과와 bundle digest가 추적 가능한 artifact 형식으로 남고 Phase 2 CI가 같은 형식을 게시할 수 있다.
- 동일 source를 두 번 build한 결과가 byte-identical인지 확인한다.
- 이 단계에서는 제품 동작을 변경하지 않는다.

### Phase 1 — 정확성 hotfix (내부 milestone)

- `used != verified` 수정
- material/truth verification digest 도입
- digest 없는 기존 verified 기록을 `legacy-unbound`로 읽는 v1/v2 dual-reader 도입
- review/draft/final digest 결속, staged final candidate, candidate-aware full validation 1회와 atomic promote 도입
- completeness 보증 문구·차단 정책 결정
- COR-001~004 회귀 케이스 추가
- Phase 3 전까지 새 v2 필드를 기존 광산에 hard-required로 강제하지 않음

**완료 조건**

- verify하지 않고 사용한 material은 scope에서 unverified다.
- verified material/truth를 한 글자 수정하면 scope에서 stale이다.
- legacy digest 없는 검증 기록은 scope에서 bound verified와 분리된 `legacy-unbound` 부채로 보인다.
- clean review 뒤 draft/final을 한 글자 수정하면 final gate가 실패한다.
- clean review 뒤 cited truth, source, relevant config/schema를 한 글자 수정해도 review가 stale이다.
- single/multi-file final 모두 같은 digest 규칙을 적용한다.
- full validation 실패 시 기존 final은 바뀌지 않으며 성공 경로의 full validation은 1회다.

### Phase 2 — 테스트·CI 신설

- Phase 0에서 추적한 suite를 정식 `tests/` 구조로 정리하고 `fidtest.sh`의 고유 케이스를 통합
- unique temp/trap/cache key 적용
- diagnostic code 기반 exact assertions *(2026-08-02 기록: §10 단위 11의 diagnostic code 도입과 동시로 이동 — 코드 체계가 없는 상태의 code 기반 assertion은 성립하지 않고, 전 진단 메시지에 code를 붙이는 변경은 Phase 2의 behavior-neutral 원칙과 충돌한다)*
- 현재 없는 `.github/workflows/`를 신설하고 PR·tag trigger를 구성
- Ubuntu·Windows Git Bash를 required matrix로, macOS Bash 5 + GNU toolchain을 우선 non-blocking matrix로 구성
- `bash -n`, ShellCheck, regression, migration, smoke jobs 분리
- 각 job 종료 시 clean worktree 확인

**완료 조건**

- PR과 tag에서 같은 suite가 돈다.
- 병렬·중단·재실행이 다른 run을 오염시키지 않는다.
- 모든 CLI 명령에 최소 smoke coverage가 있다.
- 테스트 종료 뒤 worktree가 깨끗하다.
- ~~README가 macOS 지원을 계속 주장하면 macOS job을 release 전 required로 승격한다.~~ → **완료**(2026-08-04, §11): census 4건이 v0.3.4에서 해소되어 macOS job이 required로 승격됐다 — 문서·matrix 동시 전환.

### Phase 3 — schema v2와 migration

- schema version 2 확정
- `upgrade --check|--dry-run|--apply` 구현
- `v0.1.0` fixture와 이미 최신 fixture 제공
- legacy digest 없는 verified 기록을 blind stamp하지 않는 `legacy-unbound` migration 구현
- config 전체 검증
- SemVer·schema version·bundle manifest 분리
- upgrade가 배포 artifact에 포함된 뒤에만 schema v2 필수 필드 강제 활성화

**완료 조건**

- `v0.1.0` golden mine이 자동 migration 후 clean validate된다.
- dry-run은 write 0건이다.
- 중간 실패 후 원본이 부분 변경되지 않는다.
- migration을 두 번 실행하면 두 번째는 0 change다.
- migration 직후 bound verified, legacy-unbound, stale, unverified, failed 수치가 분리되며 기존 검증 이력은 유실되지 않는다.
- Phase 0~3의 동일 release artifact에서 reader, writer, upgrade, schema enforcement가 함께 제공된다.

### Phase 4 — 구조·성능·atomic write

- parser 단일화
- schema/config 캐시
- command module 분리와 single-file build
- reindex/retag transaction
- CLI 경계 버그 수정
- Windows 성능 최적화

**완료 조건**

- parser behavior는 하나의 test suite로 검증된다.
- 배포 artifact는 여전히 단일 실행 파일이다.
- Windows 최소 fixture 시간이 현재 대비 70% 이상 줄어든다.
- write failure injection에서 원본 또는 완전한 새 상태 중 하나만 남는다.

### Phase 5 — 제품화·E2E·문서

- `--json`과 diagnostic schema
- 전체 bundle manifest fingerprint
- document-half E2E golden projects
- README·WORKFLOW·METHODOLOGY·FORMATS·UPGRADING 정합화
- release note 자동 생성·검증
- raw source VCS 정책 안내

**완료 조건**

- 문서에 기재된 명령·필드·dependency가 자동 검사된다.
- 단일·다중 파일 document workflow가 E2E로 통과한다.
- 릴리스 artifact, tag, SemVer, manifest가 서로 일치한다.

## 7. 테스트 전략

### 7.1 필수 새 회귀 케이스

#### 상태·digest

- material `used` + verification 없음 → scope unverified
- material verified digest 일치 → scope verified
- digest 없는 legacy verified 기록 → scope legacy-unbound, fully verified 합계에서 제외
- scope가 bound verified, legacy-unbound, stale, unverified, failed를 각각 보고
- legacy-unbound unit 재검증 → 새 digest와 함께 bound verified로 승격
- verified material 본문 수정 → stale
- verified truth claim/body/frontmatter 수정 → stale
- ledger에 없는 truth → unverified
- retracted material의 scope 모집단 제외
- retracted truth 처리 정책 명시 및 테스트

#### final gate

- clean review와 동일한 single-file final → pass
- clean review 뒤 final 변경 → block
- clean review 뒤 draft 변경 → stale/block
- multi-file path 추가·삭제·rename·내용 변경 → block
- review digest 누락 → legacy migration 또는 block을 명확히 판정
- staged single/multi-file candidate를 포함한 full validation이 성공 경로에서 정확히 1회 실행됨
- candidate validation 실패 → 기존 final byte 보존, candidate 미승격

#### migration

- `m5`/`t5` rename
- short reference의 관대한 해소 보존
- legacy Verified units verdict 변환
- legacy verify sections 추가
- digest 없는 legacy verified를 current bytes로 blind stamp하지 않고 legacy-unbound로 변환
- 검증 실행과 특정 revision/manifest의 결속이 입증된 항목만 digest-bound로 변환
- 비슷한 시점의 Git revision만 있고 검증 실행과의 결속 증거가 없음 → legacy-unbound 유지
- legacy-unbound 재검증 후 digest-bound 승격
- review history kind 변환
- scalar repeat 변환
- multi-line truth seal 실패 보고
- apply 중 failure rollback

#### CLI·parser

- invalid real date와 leap year
- truth처럼 생긴 directory
- giant/reversed scope range
- unknown/extra arguments
- Windows absolute path
- CRLF 보존
- malformed schema/config/frontmatter
- unknown config key 정책
- external audience의 publication label 누락

### 7.2 CI matrix

| OS | Shell/toolchain | 목적 | Phase 2 정책 |
|---|---|---|---|
| Ubuntu | Bash 5 + GNU awk/sed | 기준 기능·성능 | required |
| Windows | Git Bash | 주 사용자 성능·경로·CRLF | required |
| macOS | 설치된 Bash 5 + GNU awk/sed | 문서화된 지원 환경 검증 | **required**(승격 2026-08-04, §11): census 4건이 v0.3.4에서 해소되어 차단 게이트로 전환 |

macOS 기본 Bash 3.2/BSD 도구를 지원하지 않는다면 preflight가 명확한 설치 안내와 non-zero exit를 반환해야 한다. macOS는 **required로 승격됐다**(2026-08-04, §11): census 4건이 v0.3.4에서 해소되어 되돌림 조건이 발동했고 사용자가 승격을 결정 — README·WORKFLOW·tests/README·release matrix가 같은 변경에서 전환됐다.

### 7.3 테스트 결과 계약

- 모든 run은 Git commit, SemVer, schema version, bundle digest, OS/tool versions를 출력한다.
- PASS 수만 기록하지 않고 실행된 case ID 목록을 artifact로 남긴다.
- skipped/not-run은 PASS에 포함하지 않는다.
- release note의 숫자는 CI artifact에서 자동 주입한다.

### 7.4 요구사항과 테스트 추적

| 요구사항 | 핵심 테스트 ID | 구현 단계 |
|---|---|---|
| WD-COR-001 | `acct_scope_used_unverified`, `acct_scope_verified_evidence_only` | Phase 1 — 구현·통과 2026-08-02 |
| WD-COR-002 | `block_gate_final_digest_single`, `block_gate_tree_{content,added,removed,renamed}`, `block_gate_context_{truth,source,config}_changed`, `pass_gate_context_survives_used_stamp`, `pass_consecrate_promotes`, `acct_consecrate_failure_preserves_final`, `block_consecrate_{stale_draft,unsealed,open_gate}`, `pass_gate_{seal_and_match,tree_seal_match,legacy_review_unbound}` | Phase 1 — 구현·통과 2026-08-02 |
| WD-COR-003 | `acct_scope_material_digest_stale`, `acct_scope_truth_digest_stale`, `acct_scope_legacy_unbound`, `acct_legacy_reverify_binds_digest` (+`acct_scope_bound_verified`, `acct_scope_lifecycle_not_stale`, `acct_scope_failed_recorded`, `acct_scope_retracted_truth_excluded`, `pass_attest_validate_clean`, `block_attest_bad_target`) | Phase 1 — 구현·통과 2026-08-02 |
| WD-COR-004 | `block_completeness_required_{open_gap,no_register}`, `pass_completeness_{required_accepted_only,off_register_ignored}`, `acct_status_completeness_off`, `acct_consecrate_completeness_off_note` | Phase 1 — 구현·통과 2026-08-02 |
| WD-QA-001~003 | mktemp 격리 + keyed cache(구현으로 충족) · `acct_smoke_*` 전 명령 | Phase 2 — 완료 2026-08-02 |
| WD-MIG-001~002 | `acct_upgrade_apply_golden`(golden+idempotent+legacy 분리), `acct_upgrade_dryrun_readonly`, `acct_upgrade_rollback`, `block_upgrade_apply_collision`, `block_schema_future_version`, `acct_schema_v1_notice` | Phase 3 — 구현·통과 2026-08-02 (digest 소급 승격은 §11대로 재검증=attest 경로만) |
| WD-ARC/PERF/IO | 성능: 실광산 −78.7% 실측(케이스 아닌 [perf-baseline.md](tests/baseline/perf-baseline.md) 기록) · IO: `acct_retag_rollback`, `block_retag_outside_root`, `acct_retag_symlink_guard`, reindex staged+atomic · `reproducible_build`는 manifest 2회 재현이 CI에서 상시 수행 | Phase 4 — 완료 2026-08-02 (모듈 분리+단일 파일 빌드는 보류 — 아래 상태 참조) |
| WD-CFG/CLI | config contract → `block_config_*`, `acct_config_unknown_key_warned` (Phase 3에서 조기 구현·통과 2026-08-02) · `cli_argument_contract`, `json_contract` | Phase 4~5 |
| WD-E2E-001 | `e2e_single_document`, `e2e_multi_document`, `e2e_stale_context_recovery`, `e2e_block_repair_{contradiction,unsupported,missing_required}`, `e2e_user_answer_chain`, `e2e_open_queue_consecrates` | Phase 5 — 기계적 척추 구현·통과 2026-08-02 (스킬 주도 실전 1회는 별도 잔여) |

## 8. 마이그레이션 안전 원칙

1. 검사와 적용을 분리한다.
2. 기본 명령은 read-only다.
3. 모든 rename target 충돌을 적용 전에 탐지한다.
4. 사용자가 수정한 unknown field와 자유 산문은 보존한다.
5. generated view와 authored record를 구분한다.
6. 변경 전후 manifest를 남긴다.
7. 적용 후 최신 validator를 자동 실행한다.
8. validator 실패 시 migration 성공을 보고하지 않는다.
9. 복구 가능한 backup 또는 rollback staging 없이는 apply하지 않는다.
10. migration은 idempotent해야 한다.
11. digest 없는 과거 verified 기록에 현재 bytes의 digest를 자동 날인하지 않는다.
12. 과거 verification을 digest-bound로 소급 변환하려면 검증 실행과 정확한 revision/tree/manifest의 결속을 감사 근거로 남긴다.

## 9. 릴리스 완료 조건

다음이 모두 참일 때만 개선판을 release-ready로 판정한다.

- [ ] P0 correctness 케이스 전부 통과
- [ ] 기존 회귀 suite 전부 통과
- [ ] 모든 테스트가 tracked tree와 CI에 존재
- [ ] Phase 0~3 reader·writer·upgrade·schema enforcement가 같은 release artifact에 존재하며 Phase 1/2 단독 공개 release가 없음
- [ ] `v0.1.0` migration golden 통과
- [ ] legacy digest migration이 blind stamp 없이 이력을 보존하고 bound/unbound 부채를 분리
- [ ] single-file document E2E 통과
- [ ] multi-file document E2E 통과
- [ ] Linux·Windows·macOS matrix 통과 — **셋 다 required**(§11 결정 2026-08-04: census 4건이 v0.3.4에서 해소되어 best-effort 되돌림 조건이 발동·소비됨). Windows·macOS는 tag·workflow_dispatch에서만 도는 게이트다(§7.2)
- [ ] `bash -n`·ShellCheck 통과
- [ ] test run 뒤 clean worktree 확인
- [ ] write failure injection에서 partial state 없음
- [ ] 같은 source의 반복 build가 byte-identical
- [ ] SemVer·schema version·manifest·tag 일치
- [ ] README·WORKFLOW·METHODOLOGY·FORMATS·UPGRADING 정합 검사 통과
- [ ] 현재 대비 Windows 최소 fixture 성능 70% 이상 개선
- [ ] 알려진 limitation이 문서와 diagnostic에 동일하게 표현됨

## 10. 권장 작업 단위

작은 검토 단위를 유지하기 위해 다음 순서로 PR 또는 commit series를 나눈다.

1. `tests/` 이관만 수행하는 behavior-neutral 변경
2. `used != verified` hotfix와 회귀 케이스
3. verification/content digest
4. review/final digest, same-filesystem candidate staging, candidate-aware full validation 1회와 atomic promote
5. unique test workspace와 CI
6. schema v2 선언과 config validator
7. read-only upgrade checker
8. atomic upgrade apply
9. parser/schema cache 리팩터링
10. reindex/retag transaction
11. CLI diagnostic code와 JSON
12. 문서 E2E와 문서 정합화
13. SemVer·bundle manifest·release automation

각 단위는 다음 원칙을 따른다.

- behavior 변경과 대규모 구조 변경을 같은 commit에 섞지 않는다.
- 먼저 실패하는 회귀 케이스를 추가하고 구현 후 통과시킨다.
- 성능 변경은 기능 diff와 benchmark를 함께 남긴다.
- format 변경은 migration을 같은 release에 포함한다.
- Phase 1·2는 내부 milestone으로만 유지하고 Phase 3 upgrade와 schema enforcement가 함께 준비되기 전 tag·공개 artifact를 만들지 않는다.
- 새로운 보증 문구는 그 보증을 실행하는 test가 있을 때만 추가한다.

## 11. 구현 전 결정 기록

다음 항목은 구현자가 조용히 선택하지 않는다. 결정과 근거를 이 절에 기록한 뒤 관련 작업을 Ready로 옮긴다.

본문의 `legacy-unbound` 흐름은 권장 기본안을 실행 가능한 수준으로 구체화한 것이다. 아래 전 항목은 2026-08-02 결정 로그로 확정되었다. 이후 다른 대안으로 바꾸려면 관련 상태 모델, migration, scope, 테스트, 릴리스 조건을 한 변경에서 함께 갱신한다.

| 결정 | 권장 기본안 | 고려할 대안·영향 | 상태 |
|---|---|---|---|
| 진단 메시지의 절대경로 | **truths 진단의 절대경로를 프로젝트 상대경로로 바꾼다.** bash 판에서 red-first로 먼저 고치고 Node는 따라간다 | 계획 착수 시점에는 "진단 2종"으로 알려져 있었으나 **실측하니 4종**이었다(`FM-MISSING`·`SEAL-QUOTE-MISSING`·`FM-DUPLICATE-KEY`·`TRUTH-BODY-FRAGMENT`, 그리고 `SEAL-RETRACTED`·`SEAL-SPLIT-BLOCK`이 자료 경로를 함께 인쇄). 나머지 진단은 전부 상대경로를 쓰므로 **설계가 아니라 런타임 내부의 불일치**였고, 원인은 truths awk가 `FILENAME`을 그대로 쓴 것. 절대경로는 메시지를 광산 위치에 종속시켜 같은 결함이 머신마다 다른 문장으로 보고되고, MSYS(`/d/repo/x`)와 네이티브 Node(`D:/repo/x`)의 표기 차이 때문에 Node 포트가 이 줄들에서만 바이트 파리티에 도달할 수 없었다. **주의**: `tfile`은 메시지용인 동시에 frontmatter 키 census(`kcount`)의 **키**라, 한쪽만 상대화하면 필수 키 조회가 조용히 전부 빗나간다 — 같은 문자열로 함께 바꿨다. 기각: ① Node가 Windows에서 MSYS 표기를 흉내낸다(네이티브 도구로서 틀린 방향 — PowerShell 사용자에게 POSIX 경로를 보여주게 된다) ② 이 줄들만 파리티 예외로 선언한다(validate 채점에 영구 구멍) | 결정 2026-08-04 — "출력 바이트 불변" 계약의 **의도된 예외**. 되돌림 조건: 상대경로가 광산 밖으로 리다이렉트된 `paths:` 설정에서 파일을 특정하지 못한다는 실사용 보고가 나오면, 루트 밖 경로만 절대로 되돌린다(`rel()`이 이미 그 형태다 — 접두사가 안 맞으면 원본을 반환) |
| attest `standard` 값의 이스케이프 | **bash가 미러 줄을 `awk -v`가 아니라 ENVIRON으로 넘긴다** | gawk는 `-v` 값의 이스케이프를 확장한다. `standard`는 사용자가 주는 자유 텍스트라 `C:\tools\std`가 verify.md에 `C:<TAB>oolsstd`로 박혔고, `a\nb`는 미러 항목을 **두 줄로 쪼개** 항목이 아니게 만들었다. 장부 행은 `printf -v`로 만들어 멀쩡했으므로 **같은 사실의 두 표면이 어긋났고**, stdout도 멀쩡해서 stdout만 보는 검사로는 잡히지 않았다. retag은 같은 이유로 이미 ENVIRON을 쓰고 코드에 그 이유가 적혀 있다 — attest만 안 고쳐져 있었다. 기각: Node가 gawk의 이스케이프 처리를 흉내낸다(바이트 파리티는 완벽해지나 마크다운을 깨뜨리는 결함을 충실히 재현) | 결정 2026-08-04 — red-first 케이스 2건(`pass_attest_standard_verbatim_in_mirror`·`pass_attest_standard_newline_stays_one_line`). 되돌림 조건: 없음(결함 수정) |
| retag의 이식 시점 | **4단계가 아니라 5단계, validate 직후** | `cmd_retag`이 부르는 다른 명령은 정확히 둘 — `cmd_reindex`(이식됨)와 `cmd_validate`(5단계). 쓰기 경로가 사후 전체 validate에 답하고 실패 시 전량 롤백하는 구조라 validate 없이는 커밋 경로가 성립하지 않는다(실측: `--dry` 2.5초 / 커밋 경로 17.7초). 회귀 케이스 6건 중 3건이 이 경로다. 기각: ① dry·무적중 경로만 부분 이식(같은 명령이 인자에 따라 되기도 하고 exit 3이기도 한 상태 — "부분 이식이 통과처럼 보이면 안 된다"에 정면 위배) ② 임시로 bash validate를 서브프로세스 호출(프로세스 1개·플랫폼 독립이라는 재작성 목적을 정면으로 깬다) | 결정 2026-08-04 — 계획서 §5의 순서 오류 정정. 5단계 순서: validate → **retag** → consecrate |
| verification 저장 위치 | machine-owned structured sidecar + Markdown generated view | frontmatter object는 읽기 쉽지만 기존 단순 parser와 충돌 | 결정 2026-08-02 |
| legacy verification digest 소급 정책 | blind stamp 금지, digest 없는 기록은 `legacy-unbound`로 보존, 검증 실행과 정확한 revision/tree/manifest의 결속이 입증될 때만 bind, 나머지는 위험도 순 재검증 | 현재 bytes에 일괄 digest를 찍으면 migration 시점의 내용을 과거에 검증한 것처럼 오인하고, 전부 stale로 강등하면 기존 검증 이력을 잃음 | 결정 2026-08-02 |
| review context digest 범위 | draft/final + cited truths + source materials + gate 관련 config/schema | 전체 mine hash는 안전하지만 작은 무관 변경도 모든 review를 stale 처리 | 결정 2026-08-02 |
| content hash 정규화 | artifact는 raw bytes, multi-file은 정렬 manifest | LF 정규화는 cross-OS에 유리하지만 실제 byte 변조를 숨길 수 있음 | 결정 2026-08-02 |
| bundle identity | release artifact의 전체 manifest SHA-256 | working-tree hash는 checkout line-ending에 따라 달라질 수 있음 | 결정 2026-08-02 |
| 구현 언어 | Bash CLI 유지, 개발 모듈을 build로 결합 | Python/Go/Rust 전환은 parser·성능에 유리하나 배포 의존성·전환 비용 증가 | 결정 2026-08-02 |
| 지원 migration 범위 | `v0.1.0`부터 최신까지 | 더 오래된 pre-release 지원은 fixture와 정책 비용 증가 | 결정 2026-08-02 |
| 성능 목표 | 우선 현재 대비 70% 단축, baseline 안정화 후 절대 예산 확정 | v0.1 절대시간 회복 또는 대형 mine 중심 예산 | 결정 2026-08-02 — 단계적 확정 유지 |
| JSON 호환 정책 | versioned schema + additive minor change | command별 독립 schema는 유연하지만 소비자 복잡도 증가 | 결정 2026-08-02 |
| completeness final 정책 | `required`일 때 unresolved blocking gap 차단 | 모든 gap 차단은 advisory/semantic 영역까지 과도하게 봉쇄할 수 있음 | 결정 2026-08-02 |
| raw source VCS 정책 | 현재 `track` 유지 + init 명시 경고 | `ignore` 옵션은 privacy에 유리하지만 audit·backup 보증 약화 | 결정 2026-08-02 |
| macOS 지원 범위 | ~~best-effort(2026-08-03)~~ → **required 승격**(사용자 결정 2026-08-04): matrix 차단 게이트 전환, 지원 문구 완전화 | census 4건이 v0.3.4에서 해소(P1 index 대조 재작성의 부수효과, 태그 run 331/331 실측)되어 되돌림 조건이 발동·소비됨. 비용(×10 분당요금, 태그 한정)과 macOS-전용 회귀의 릴리스 차단 위험을 수용 | 결정 2026-08-04 — **되돌림 조건**: macOS 러너 비용/불안정이 릴리스 흐름을 반복 차단하면 best-effort 재상정 |
| ledger 출처 토큰 | legacy-unbound 행의 standard 열에 origin 기록, m-id는 material origin일 때만 증거(비대칭: t-id `-`는 grandfather) | 별도 열 추가는 6열 계약을 깨고, 무출처 유지는 이미 배포된 v0.3.1 오이관을 교정 불가로 남김 | 결정 2026-08-03 |
| consecrate 내구 marker | `.consecrate.inflight`를 첫 write 전 생성·최후 삭제, validate도 fail-closed(예외는 동적 스코프 doc 한정) | trap-only는 SIGKILL/전원에 무력, candidate-aware validate 전면 재설계는 v0.3.2 범위 초과(이연) | 결정 2026-08-03 |
| flow mapping 자유 텍스트 규격 (D3) | **(a) 인용부호 강제** — `map`이 `reason` 값을 항상 `"…"`로 쓰고 validate가 무인용 위험 문자를 잡는다 | (b) `·` 구분자 규약 성문화는 현행 관행이라 파일 변화가 최소지만, 규약은 손으로 쓰는 순간 깨지고 쉼표 외 문자(콜론·중괄호)는 계속 열려 있다. (a)는 flow mapping을 깨는 문자 클래스 전체를 한 번에 닫고 사람이 규약을 외울 필요가 없다 | 결정 2026-08-04 — **되돌림 조건**: 인용 강제가 한글 본문에서 이중 이스케이프 문제를 일으키면 (b)로 재상정 |
| D3 기존 위반 이행 | **경고로 시작**(비차단 warn) — 신규 쓰기는 map이 즉시 새 규격을 따르고, 기존 위반은 표시만 | 즉시 차단은 eclypse 포함 배포 광산을 다음 validate에서 red로 만들고 수리 전까지 게이트를 막는다. upgrade는 v1→2 전용으로 닫혀 있어(v0.3.2) 자동 재작성 경로가 없으므로 사용자 수리 창이 필요하다 | 결정 2026-08-04 — **되돌림 조건**: 배포 광산들이 정리되면 schema 3에서 차단 승격 재상정 |
| 구현 언어 (재상정) | ~~Bash 유지(2026-08-02)~~ → ~~Go(같은 날 오전)~~ → **Node.js 전면 재작성**(사용자 결정 2026-08-04). 계획: [REWRITE_PLAN.md](REWRITE_PLAN.md). CLI 표면·종료 코드·출력 바이트·온디스크 형식·**배포 방식(폴더 복사)**은 불변 계약 | 2026-08-02의 되돌림 조건("Phase 4 후에도 Windows 70% 미달")은 발동하지 않았다 — **다른 근거로 재상정됐다.** ① 프로세스 생성 비용 실측: MSYS 319~384ms vs 네이티브 49~51ms(같은 머신). 호출 1회 floor 2,980ms = 13 프로세스 × ~230ms. 스윕 342케이스 MSYS 36분47초 vs 같은 머신 WSL2 컨테이너 **9초**(245배) — 하드웨어가 아니라 POSIX 에뮬레이션이 비용. ② **결함 클래스**: v0.3.5(awk 로케일)·v0.3.6(grep이 ko에서 `Binary file matches`)·v0.3.7(bash `read`가 멀티바이트 로케일에서 줄을 통째로 버림 — 3-OS 중 Linux만 실패)이 전부 "텍스트 처리를 외부 도구에 위임 → 도구가 플랫폼·로케일마다 다르게 행동"의 같은 클래스. 단일 바이너리에서는 존재하지 않는다. ③ 342 케이스가 전부 CLI 블랙박스라 **케이스를 그대로 두고 실행 대상만 바꿔** 재작성을 검증할 수 있다. **언어 선택 정정**: 같은 날 오전 Go로 정했다가 Node로 바꿨다 — 오전 근거였던 "Node 443ms"가 **MSYS bash 안에서 잰 값**이라 MSYS의 프로세스 생성세(~320ms)가 섞인 오측이었다. 네이티브 재측정: Node 기동 86.6ms, eclypse 268 truth 전체 처리 98.9ms(작업분 ~12ms). Go(~50ms)와의 차이 30ms를 벌자고 플랫폼별 빌드·macOS arm64 ad-hoc 서명·코드 서명·바이너리 커밋 불가를 떠안는 거래가 성립하지 않는다. Python 기각: 기동은 같으나 작업이 6배 느리고(12ms vs 71ms) 설치 보장이 없다(Windows에서 `python`이 Store를 연다). 기각: Windows 전용 별도 구현(구현이 둘이면 3,779줄 전체가 드리프트 표면 — v0.3.3 ledger 이원화·v0.3.6 FM 값 규칙 3벌이 그 대가를 이미 보여줬다) | 결정 2026-08-04 — **되돌림 조건**: 2단계(바닥) 종료 시점에 파리티 계약(stdout 바이트 동일·종료 코드 동일)을 유지하는 비용이 bash 판 유지 비용을 넘으면 중단하고 bash + `cfg()` 최적화로 복귀 |
| 호출 방식 (Node 전환에 딸림) | **Windows는 PowerShell, 그 외는 bash.** 스킬에 플랫폼 분기를 넣는다 | node 1회 실행 실측: Linux bash **17ms** · Windows PowerShell **80ms** · Windows Git Bash **373ms**. Git Bash는 Unix 흉내 비용으로 프로세스마다 ~290ms를 더 낸다. 기각: 분기 없이 bash로 통일(단순하지만 Windows에서 4.7배 손해 — 사용자 판단 "빠른 게 최고"). **실행 정책 문제 없음을 시험으로 확인**: `.mjs`에 Mark-of-the-Web(`ZoneId=3`)을 붙여도 PowerShell에서 그대로 실행된다. ExecutionPolicy는 `.ps1`에만 적용되고 `node script.mjs`는 그 대상이 아니다 | 결정 2026-08-04 — **불변 규칙**: `.ps1` 래퍼를 만들어 배포하지 않는다(만드는 순간 실행 정책 대상이 되고 다운로드된 `.ps1`은 `RemoteSigned`에서 막힌다) |
| 격리된 ledger 행의 증거값 | **(a) 격리 = 증거 없음** — 읽을 수 없는 verdict를 가진 행은 유닛을 곧장 unverified(빚)로 보내고, 더 약한 v1 `status: verified` 폴백을 열지 않는다. m·t 두 레인 동일 | (b) 자체 frontmatter 폴백("그 행이 없었던 것과 같은 상태")은 규칙이 단순하지만, 폴백 목적지인 legacy-unbound가 `owed` 산술에서 빠져 **오타 한 개가 빚을 줄인다** — 픽스처 실측: 바이트가 바뀐 자료가 `1 stale`(빚)에서 `1 legacy-unbound`(빚 아님)로 내려갔다. (c) verdict만 불신하고 digest는 유지하면 신호는 가장 정확하지만, "covers nothing"이라 선언한 행의 절반을 계속 쓰게 되어 격리의 뜻이 둘이 된다 | 결정 2026-08-04(사용자) — **되돌림 조건**: 실광산에 legacy 오타 행이 많아 재검증 부채가 실무를 반복적으로 막으면 (b) 재상정 |
| 진단 경로 상대화의 **범위** (결정 ②의 미완분) | **결정 ②를 끝까지 적용한다 — bash에서도 나머지 20종을 상대경로로.** 구현은 메시지 구성 지점 ~30군데가 아니라 `prob`/`warn` **한 곳**(`relmsg`)에서 완성된 메시지에 대해 한다 | 2026-08-04 오전의 상대화는 truths awk만 고쳤고 셸 쪽(`FM-MISSING`·`MAT-*`·`CAT-*`·`PLAN-*`·`CFG-PATH-*`·`TRUTH-DIR`·`DATE-INVALID` 등 **20종**)은 그대로였다. 안 보였던 이유: **통과하는 광산은 진단을 한 줄도 안 찍는다** — eclypse가 깨끗해서 "절대경로 0줄"이 성립했고, §5-2를 "없어졌다"로 지웠던 근거가 그것이었다. 345개 케이스 광산 전체에 validate를 돌려 재측정해 20종을 확정했다(읽어서 센 게 아니다 — 오전의 "2종" 오산이 그렇게 나왔다). **구성 지점이 아니라 `prob`에서 하는 이유**: `relf`는 메시지인 동시에 frontmatter 키 census의 키였고, 한쪽만 상대화해 필수 키 조회가 전부 빗나간 것이 오전의 수리 항목이었다. 완성된 메시지는 아무도 소비하지 않으므로 이 자리에서는 그 클래스가 발생할 수 없고, 철자가 하나라 이후 추가되는 진단도 저자가 몰라도 상대경로가 된다. 기각: (b) 20군데 개별 수정 — 빠뜨림이 이 결함을 몇 달 유지시킨 바로 그 모양이다. (c) Windows 한정 파리티 예외로 §5-2 복원 — 포트가 가장 위험한 자리에서 Windows 저울이 없어진다 | 결정 2026-08-04(사용자) — **알려진 한계(콜드 리뷰가 더 날카롭게 만듦)**: 광산 **값**이 프로젝트 절대 루트를 담고 있으면 그 값이 짧게 인용되는데, **짧아진 형태가 실재하는 이름일 수 있다.** 실측: `source: <ROOT>/m001`인 truth 옆에 진짜 `materials/m001`이 있으면 `[TRUTH-SOURCE-DANGLING] truths/t001.md  source 'm001' → no material folder` — 판정은 옳지만(그 값은 자료 폴더를 가리키지 않는다) 메시지가 **파일에 없는 문자열을 인용하고 멀쩡한 id를 지목한다.** 인용부호 인식 규칙은 시도 후 기각(`CFG-PATH-MISSING`이 경로를 따옴표 안에 찍어 정작 고쳐야 할 경우가 빠진다). **되돌림 조건**: 값 오인용이 실사용에서 혼란을 반복하면 구성 지점 상대화 + 누락 감시 케이스로 재상정 |
| 진단 아닌 **경로 출력**의 상대화 (`impact`) | **같이 상대화한다.** `impact`의 세 목록(id grep · title grep · cited_truths 체인)이 프로젝트 상대경로를 찍는다 | 결정 ②를 진단에만 적용하고 나면 `impact`가 **유일하게 남은 절대경로 출력**이 된다 — 실측: 345개 케이스 광산 중 **326개**에서 절대경로. `prob`/`warn`을 안 거치고 직접 인쇄하므로 `relmsg`가 닿지 않는다. Windows에서 두 런타임이 같은 파일을 `/d/repo/x`와 `D:/repo/x`로 달리 적어 이 명령 전체가 바이트 대조 불가로 남는다. 상대경로는 사용자가 실제로 타이핑할 형태이기도 하다. 기각: 진단만 고치고 `impact`는 Windows 한정 예외로 선언 — 결정 ②를 반쯤 적용한 상태를 두 번째로 만드는 것이고, 그게 이번에 발견된 결함의 모양 자체다 | 결정 2026-08-04 — 회귀 케이스 `acct_impact_paths_are_relative`가 **세 목록 전부** 못 박는다(별개 인쇄 지점 셋이라 하나를 고쳐도 나머지를 보증하지 않는다) |
| truth 파일명을 쓴 **디렉터리**의 census 표기 | **포트가 낫다 — §5 "bash가 깨져 있고 포트가 나은 자리"의 4번째 항목.** Node는 `t009`로 찍고 numbering-holes도 정상 계산한다 | bash는 `ls "$TRUTHS"/t[0-9]*.md`에 디렉터리가 섞이면 `ls`가 그것을 `<경로>:` 헤더로 나열해, 진단에 `t009.md:`(앞 공백 2개 + `.md:` 꼬리)를 흘린다. 그리고 그 망가진 줄이 `sort -n`에서 0으로 읽혀 numbering-holes 줄이 **통째로** 사라진다 — 설계가 아니라 `ls`의 부작용이 사용자에게 보이는 진단 문구 안까지 새어 들어온 것이다. 양쪽 다 validate는 `TRUTH-DIR`로 막으므로 판정은 동일하고, 갈리는 것은 census의 표기뿐이다. 기각: (b) Node가 `ls`의 디렉터리 헤더 동작을 흉내낸다 — 예외는 0건이 되지만 명백한 부작용을 코드에 영구 인코딩하고 그 자리만 문구가 깨진 채 남는다. (c) bash를 고쳐 디렉터리를 목록에서 배제 — 배포된 bash 출력을 한 군데 더 바꾸는데, 이 경로는 곧 은퇴한다 | 결정 2026-08-04(사용자) — **되돌림 조건**: 6단계 전에 bash 판이 계속 쓰이고 이 표기가 실사용에서 혼동을 일으키면 (c)로 재상정 |
| 릴리스 경계 — 중간 태그 vs 0.4.0 하나 | **0.4.0 하나로 간다.** 5단계 종료 시점에 태그하지 않는다 | 5단계가 끝났을 때 태그하자고 제안했다가 **사용자 반문("중간에 태그한다고 의미가 있나?")에 확인해 보니 근거가 틀렸다**: 배포 번들을 정의하는 `tests/make-manifest.sh`가 `bin/weavedoc`(bash)만 담고 있어서, 그 시점에 태그하면 **설치본은 예전 그대로 bash**이고 이번 작업의 본체가 릴리스 아티팩트에 **없다.** 게다가 CI가 태그 ref에서 릴리스 노트를 뽑으므로 헤드라인이 번들에 없는 릴리스 노트가 나간다. 내가 든 "되돌릴 지점" 근거도 약했다 — 커밋마다 스위트가 green이라 `git checkout <sha>`로 충분하고 태그가 더해 주는 게 없다. 6단계에서 번들 **모양 자체**가 바뀌므로(WD-REL-001 범위) 거기서 한 번 끊는 게 맞다 | 결정 2026-08-05(사용자) — **사용자 반문이 옳았던 사례.** 기록해 두는 이유: "안전하니까 중간에 한 번" 같은 판단은 배포물이 실제로 무엇인지 확인하지 않으면 근거 없이 나온다 |
| 6단계에서 bash 판을 `legacy/`로 옮길 것인가 | **옮기지 않는다.** 경로 그대로 두고 파일 머리에 역할·삭제 예정을 명시한다 | 계획서 §5는 "한 릴리스 동안 `legacy/`에 남긴다"고 썼지만, 옮기는 순간 기존 `bash .weavedoc/bin/weavedoc` 호출이 전부 깨진다 — **런타임을 바꾸는 바로 그 릴리스에서** 호출 경로까지 깨뜨릴 이유가 없다. 계획의 실제 의도("파리티 검증용으로 한 릴리스 남긴다")는 옮기지 않아도 지켜지고, 오히려 파리티 도구(`parity-corpus.sh`·`parity-write.sh`·`regress.sh`의 기본값)가 그대로 돌아 **일치를 계속 잴 수 있다** — 그게 이 파일의 유일한 남은 역할이다. 기각: 계획대로 `legacy/` 이동(신호는 분명해지지만 사용자 호출을 깨고 도구 경로 6군데를 흔든다) | 결정 2026-08-05 — **되돌림 조건**: 0.4.0 다음 릴리스에서 삭제한다. 그때까지 bash 판에 **동작을 추가하지 않는다**(한쪽에만 들어간 변경이 이 재작성이 끝내려던 드리프트 클래스 그 자체) |
| 배포 번들에 Node 런타임을 넣는 방식 | **`bin/lib`를 글로브로** 넣는다(`bin/weavedoc.mjs` + `bin/lib`), 파일 열거가 아니라 | 나중에 추가되는 모듈이 manifest **밖으로** 배포될 수 있으면 manifest가 존재할 이유가 없다 — 열거는 그 구멍을 만든다. 21개 → 44개 파일, 2회 실행 바이트 동일 확인 | 결정 2026-08-05 |

결정 기록에는 날짜, 결정자, 선택, 기각한 대안, migration 영향, 되돌림 조건을 남긴다.

### 결정 로그

**2026-08-02 — 결정자: 사용자 (권장 기본안 일괄 채택 지시)**

- **선택**: 위 표의 11개 항목 전부 권장 기본안을 채택한다. 성능 목표는 "70% 우선 단축, baseline 안정화 후 절대 예산 확정"이라는 단계적 구조 자체를 결정으로 승격한다.
- **기각한 대안**: 각 행 "고려할 대안·영향" 열에 기재된 안들. 별도 근거가 필요한 항목은 없었다 — 각 대안의 비용이 표에 이미 기록되어 있다.
- **migration 영향**: legacy digest 소급 정책(blind stamp 금지 · `legacy-unbound` 보존 · 증거 결속 시에만 bind)이 WD-MIG-001의 변환 규칙을 확정하고, schema v2 · bundle manifest 분리가 WD-MIG-002 · WD-REL-001의 계약을 확정한다.
- **되돌림 조건**:
  - verification 저장 위치 — sidecar 구현이 Phase 1 회귀 케이스(COR-001~003)를 Bash 파서로 통과시키지 못하면 frontmatter object로 회귀하고, §5 모델과 migration을 같은 변경에서 갱신한다.
  - content hash 정규화(raw bytes) — CRLF checkout 차이로 인한 가짜 stale이 실사용에서 반복 확인되면 LF 정규화로 전환하되, 전환을 schema version 변경으로 취급한다.
  - 구현 언어(Bash 유지) — Phase 4 최적화 후에도 Windows 최소 fixture 70% 단축 미달이면 언어 전환을 별도 계획으로 재상정한다.
  - 나머지 항목 — 해당 정책이 Phase 5 E2E에서 실사용과 충돌하면 §11에 새 행으로 재상정한다. 조용한 변경은 금지된다.

### 미해결 — Windows·bash 레그의 간헐 실패 (2026-08-05, 1회, 고치지 않기로 함)

v0.4.0 태그 런의 Windows 레그에서 **bash 참조** 쪽만 `block_gate_hash_outside`에 실패했다("차단 기대, 통과"). **같은 커밋의 30분 전 Windows 스윕은 green**이었고, 로컬 단독 5회 전부 green, **재실행 즉시 green**이었다(그 재실행으로 릴리스가 발행됐다). Node 레그는 두 번 다 349/349.

기제 후보는 `file_stripped`(`bin/weavedoc`, `FILESTRIP` 캐시)다: `FILESTRIP[$f]=$(nocomment < "$f" 2>/dev/null)`에 **실패 확인이 없다.** 포크가 한 번이라도 실패하면 그 파일이 **빈 문서로 캐시되고**, 이후 그 파일을 읽는 모든 검사가 "문제 없음"을 낸다 — **fail-open이고, 재작성이 없애려던 클래스 그 자체다.** 349케이스 × `-j6`의 MSYS 부하에서만 나오고 단독 실행에서는 안 나온다는 관측과 맞는다. **Node 판에는 이 자리가 없다**(fs로 읽고 포크하지 않는다).

**고치지 않는다**: bash 판은 0.4.0 다음 릴리스에서 삭제되고, 레거시 참조 런타임에 동작을 추가하지 않는다는 규칙이 우선한다. 다시 나오면 재실행하고, **두 번 이상 나오면 여기 행을 추가**할 것 — 그때는 간헐이 아니다.

## 12. 최종 판정

현재판은 신규 프로젝트에서 `v0.1.0`보다 안전한 선택이다. 특히 fail-closed 검증, gate zone rule, provenance, retraction, canonical ID, scope/status 가시성은 보존해야 할 자산이다.

다음 단계의 핵심은 검사 규칙을 더 늘리는 것이 아니다. 먼저 현재 규칙을 다음 기반 위에 다시 세워야 한다.

- 분리된 상태축
- 검토 대상과 verdict를 묶는 digest
- 추적·배포되는 테스트
- 자동 migration
- 단일 parser와 빠른 실행 경로
- atomic write
- 일관된 버전·CLI·문서 계약

이 기반이 완성된 뒤에야 WeaveDoc의 “fidelity gate”를 개발 철학이 아니라 재현 가능한 제품 보증으로 말할 수 있다.
