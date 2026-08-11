# WeaveDoc 다음 구현 통합 계획

> 상태: **Phase 0 완료 · Phase 1 진행 중(artifact-contracts 동결 + `raw-source-model` 완료, 번들 `2026-08-08.9`) · Phase 2부터 구현 전 확정 계획**<br>
> 작성 기준: 2026-08-09 · 검토 반영 2026-08-10 — derived 전수 이송, material `converted` 분류, 광산 로그 commit-후 경계, v1/v2 지원 수명, 계산 불능 dependent 처분, `LEDGER-ORPHAN` 출구 외 경미 확정 · 2차 보완 동일자 — §10.2 분류 우선순위, 처분 선택지 정밀화, §3.3 로그 순서, reconcile selector 3종, v1 bridge 고정 · 3차 보완 동일자 — migration 사례 정합, answer 재분류 전이, semantic/write 실패 분리, rederive 처분, absent-material inbound 가드, §2.8 로그 순서 명문화 · 4차 보완 동일자 — §2.3.2 고정 전이표, migration non-derived 한정·structural 입력, resolve 결과형 확장, stage/rename 실패 3분할, absent-`tNNN` cascade, `--drop-support` 표면 · 5차 보완 동일자 — 축 라벨 2글자화(MC·MQ·TD·TG·TL·SG), payload identity 4종·fan-out·absence terminal·`blocked_by`, 강제 이송의 `derivation_candidate` 변환, 첫 rename 전/후 실패 경계, `preparing`+manifest recovery, `CLEANUP`/`TRANSACTION` 진단 구분 · 6차 보완 동일자 — MC-remove cascade(교착 해소), 1→N 보존식+`candidate_id`, typed manifest(create/replace/delete·absent state), 방향별 guard·target vector 판정·진단 사다리 4단 · 7차 보완 동일자 — directory target은 consecrate 전용 transaction으로 명시 제외, 0-change abort 선-terminalize, MC cascade를 공용 inbound graph 전체로 정합, allocator·typed state·apply 문구 정리, fan-out `candidate_id` 결정성 · 8차 보완 동일자(동결) — MC cascade에 SG 처분+미열거 inbound catch-all, §2.2 write 실패 문구 vector 기준 정합<br>
> 목표 릴리스: schema v3 계열(정확한 버전 번호는 구현 완료 후 결정)<br>
> 범위: canonical-current 전환, 임시 충돌 상태, migration, source 봉인, 사람용 출력, 공통 작업 보고, 기존 gaps 이식, 선택적 enrichment 추가

## 0. 이 문서의 역할

이 문서는 다음 논의를 하나의 실행 기준으로 합친다.

- 실제 광산 32개 자료·274개 사실·10회 검증에서 발견된 다섯 결함
- 과거를 광산에 계속 보존하지 않고 **현재 맞는 사실 하나만 둔다**는 제품 결정
- 새 주장은 바로 덮어쓰지 않고, 충돌 해소 전까지만 임시 후보로 둔다는 결정
- 예외를 더 붙이지 않고 공통 Markdown scanner와 typed state model을 쓰는 현재 parser 리팩터링
- 이미 구현된 `weavedoc-gaps` A를 새 상태 모델에 이식하는 계획
- 아직 없는 선택적 보강 자문 B를 후속 기능으로 추가하는 계획

이 문서와 예전 보고서가 다르면 **이 문서가 우선한다**. 특히 예전 보고서의 `history: keep | discard`, `corrects:` 렌더 확장, `voided_premise`, 영구 폐기 기록 제안은 이후 대화에서 폐기됐다.

### 요구사항 추적표

| 출발점 | 이 문서의 최종 처리 |
|---|---|
| 보고서 결함 1 · 쓰기 전용 `corrects` | 렌더를 늘리지 않고 canonical 직접 갱신으로 문제를 대체 (§1–4, §10) |
| 보고서 결함 2 · 영어·내부어·기계 조어 | structured result + 언어별 renderer + 통용어 계약 (§6) |
| 보고서 결함 3 · 시작/종료 보고 부재 | 9개 스킬 공통 interaction protocol (§6.3) |
| 보고서 결함 4 · source 봉인 부재 | explicit quote marker와 source→converted seal (§5) |
| 보고서 결함 5 · 과거를 버릴 수 없음 | history mode 없이 단일 canonical-current 모델 (§1–4, §10) |
| verify가 광산 로그 tail을 운영 입력으로 사용 | current confirmation projection map으로 분리 (§2.6, Phase 1–3) |
| 사례별 예외 조합 폭발 | 고정된 parser/state model(`bcf804d`)을 기준선으로 보존·확장 (§7) |
| 고정된 parser의 남은 recognition↔role 분리 | v3 explicit artifact-role contract와 전 consumer 공유 adapter (§7.1, Phase 1–3) |
| completeness 제안 A | 기존 gaps를 v3 current reader에 이식 (§8) |
| enrichment 제안 B | v3 이후 명시 호출형 read-only MVP (§9) |
| 남은 v0.6 mutation-lock 후보 | conflict writer와 함께 transaction boundary 완결 (§2.8, Phase 2) |

### 현재 기준선

- 공개(발행) 기준선은 v0.5.21이다. Phase 0 이후로도 태그는 나가지 않았다.
- parser/state 리팩터링은 **커밋으로 고정됐다**: 번들 `2026-08-08.1` = `e524511`, 후속 번들 `2026-08-08.2` = `bcf804d`. 둘 다 미발행(Unreleased)이며 `origin/main`에 있다.
- 해당 작업은 한 번의 byte-domain Markdown scan, typed ledger state, source-offset writer postcondition을 도입한다.
- 검증 기준선은 **회귀 580/580 · parser 속성 1,844건 · 3-OS CI green**이다(`2026-08-08.1` 시점에는 575 케이스였고, `.2`가 커버리지 0건이던 차단 진단 4개에 케이스를 붙여 580이 됐다). manifest 54행·fingerprint·doccheck·실광산 read-only 무변동도 두 번들에서 각각 확인했다.
- 이 계획은 고정된 parser 리팩터링을 대체하지 않는다. 그 위에 truth 상태 모델을 얹는다.

## 1. 최종 제품 원칙

### 1.1 광산에는 현재 정본만 둔다

`truths/t*.md` truth-card population에는 지금 사용할 수 있는 canonical truth만 둔다. `index.md`·`coverage.md`·`verify.md` 같은 view/workflow sidecar는 별도이며 truth population으로 세지 않는다. 같은 의미 범위와 시점의 사실은 하나만 존재한다.

- 파란 눈 설정을 초록 눈으로 바꾸면 canonical truth를 제자리에서 초록 눈으로 갱신한다.
- 다시 파란 눈으로 바꾸면 같은 canonical truth를 제자리에서 파란 눈으로 갱신한다.
- 이전 파란 눈·초록 눈 카드, 승패 기록, 폐기 tombstone을 운영 광산에 남기지 않는다.
- 과거 상태가 필요하면 Git에서 확인한다.

시간 범위가 실제로 다른 사실은 예외가 아니다. `2020년에는 파란 눈`, `2021년에는 초록 눈`이 둘 다 현재 설정이면 `as_of`가 다른 두 canonical truth다. 설정 개정(retcon)이라면 이전 값은 제거한다.

### 1.2 새 주장과 충돌은 구분한다

새 자료가 들어왔을 때 기계는 다음 세 가지만 판정한다.

1. 현재 truth와 충돌하지 않는 새 사실 → 새 canonical truth로 추가
2. 현재 truth와 같은 사실 → 새 truth를 만들지 않고 현재 truth의 근거에 합침
3. 현재 truth와 충돌하는 주장 → 임시 conflict candidate로 기록하고 사용자에게 질문

기계는 권위 순위, 자료 날짜, 최신성, 이전 사용자 선택을 이용해 winner를 자동으로 고르지 않는다. 추천 winner도 제시하지 않는다. 사용자가 선택한 뒤에만 canonical을 바꾼다.

### 1.3 충돌은 임시 작업 상태다

충돌 중에도 기존 canonical 파일은 그대로 둔다. 다만 외부 conflict overlay가 해당 truth의 소비를 일시 중단하고 `validate`, `pull`, `status --open`이 사용자 결정을 요구한다.

해결 결과는 다섯 가지다.

- 현재값 유지: candidate와 conflict entry를 삭제한다.
- 현재 없음 유지/모든 후보 기각: `targets=[]` component의 candidates와 conflict entry를 삭제하고 canonical을 만들지 않는다. suppression을 남기지 않으므로 같은 주장이 다시 오면 다시 비교한다.
- 새값 채택: 기존 truth ID를 유지한 채 claim·source·location·quote 등 현재 내용을 원자적으로 교체하고 conflict entry를 삭제한다. derived-origin candidate의 채택만 예외로 canonical 직행 없이 `derivation-required` pending decision 생성으로 끝나며(§2.3.2), conflict 삭제와 pending 생성은 같은 transaction이다.
- 같은 사실로 확인: canonical claim은 유지하고 incoming evidence를 typed support edge로 바꾼 뒤 conflict entry를 삭제한다. 새 edge는 S1·attest·human confirmation 전까지 corroboration으로 쓰지 않는다.
- 범위 분리·병합: 사용자가 정한 현재 의미에 맞게 기존 truth를 편집하거나 여러 canonical truth로 나눈 뒤 conflict entry를 삭제한다.

분리에서는 사용자가 지정한 주 current 범위가 기존 truth ID를 유지하고 나머지는 allocator의 새 ID를 받는다. 병합에서는 사용자가 surviving ID를 고른다. 완전 동치 citation만 transaction이 자동 치환하고 부분 의미 citation은 stale로 남겨 사람 검토를 요구한다.

loser, rejected digest, resolution history, do-not-resurface 기록은 남기지 않는다. 같은 주장이 나중에 다시 들어오면 그 시점의 current truth와 다시 비교한다.

### 1.4 감사 기록은 판정자가 아니다

Git과 광산의 `truths/changelog.md`는 사람이 과거를 확인하기 위한 기록이다. 저장소 루트의 `CHANGELOG.md`는 WeaveDoc 자체의 릴리스 기록이며 광산 상태가 아니다. 이하에서 **광산 로그**는 `truths/changelog.md`, **릴리스 로그**는 루트 `CHANGELOG.md`를 뜻한다. 둘 다 다음 제품 판단의 입력이 될 수 없다.

- current truth 선정
- conflict winner 선정 또는 추천
- `validate` 통과 여부
- `census` 번호 구멍 해명
- gaps coverage
- 같은 주장 재등장 억제
- 문서 출하 가능 여부

광산 로그 한 줄은 사람이 읽기 위한 부수 산출물이다. 기록 실패는 분명히 보고하되 canonical update를 거부하거나 되돌리는 이유가 되지 않는다. 릴리스 로그는 runtime·format 변경을 설명하는 데만 쓰고 개별 광산의 사실 판정에는 관여하지 않는다.

### 1.5 감시는 유지하고 과거 관리만 제거한다

다음 장치는 현재 상태의 정확성과 데이터 손상을 막으므로 유지한다.

- 현재 truth와 source의 provenance 연결
- truth quote와 `converted.md`의 byte-domain 봉인
- source → converted 홉의 새 봉인
- extraction coverage의 현재 element→truth mapping
- digest-bound verification
- cold reviewer와 producer/judge 분리
- Human queue의 사용자 결정 소유권
- fail-closed validation
- exclusive operation lock, transaction manifest, rollback/recovery, writer postcondition
- final/review context digest와 consecration gate

이 장치들은 **현재 바이트와 현재 판단**을 검사한다. 과거 주장을 광산에 보존하는 근거로 사용하지 않는다.

신뢰 경계도 바꾸지 않는다. 저장소 작성자와 실행 runtime을 신뢰하며 digest는 변경 결속이지 작성자 인증이 아니다. 대신 지원 명령이 자동 downgrade·seal laundering·부분 commit 경로를 만들지 못하게 한다.

### 1.6 제안 권한은 명시 호출에만 있다

일반 `gather`, `map`, `validate`, `status`, `census`는 사용자가 요청하지 않은 개선안을 만들지 않는다.

제안은 다음처럼 사용자가 명시적으로 연 레인에서만 허용한다.

- `gaps`: 현재 광산의 구조적 빈칸
- `plan`: 만들 문서 범위의 구조 제안
- advisory `review`: 작성된 문서의 품질 제안
- 후속 `enrich`: 광산을 더 풍부하게 할 선택적 제안

채택 전 제안은 claim이 아니며 truth를 직접 쓰지 않는다. 채택된 내용만 `user-answer → gather → map`으로 들어간다.

## 2. 목표 구조

```text
source.* ── source/quote seal ──> converted.md ── truth quote seal ──> TruthStore
                                                                          │
새 주장 ── 비교 ──┬─ 새 사실 ─────────────────────────────────────────────┤
                  ├─ 같은 사실 ── typed current support edge ────────────┤
                  └─ 충돌 ──> temporary conflict overlay ──> 사용자 결정
                                                        │
                                                        └─ 원자적 적용 후 삭제

TruthStore ──> pull / index / tree / census / scope / gaps / documents
     │
     └─ 과거는 읽지 않음

Git + truths/changelog.md <── 사람용 수동 기록, 제품 판정에는 영향 없음
```

### 2.1 단일 TruthStore

고정된 parser 리팩터링(`bcf804d`)은 Markdown 장부 구조를 통합했지만 truth frontmatter는 여러 명령이 따로 읽는다. schema v3에는 `.weavedoc/bin/lib/truth-model.mjs` 또는 동등한 단일 모델을 추가한다.

이 모델이 한 번에 제공해야 하는 것은 다음이다.

- 모든 canonical truth
- id, locus, claim, source, location, tags, provenance, body quote
- 같은 사실의 검증된 current support edge
- 임시 conflict overlay와 영향받는 canonical truth
- 구조 오류와 source/quote 오류
- 각 truth의 현재 소비 가능 여부

`validate`, `pull`, `census`, `scope`, `status`, `reindex`, `impact`, `gaps`는 이 모델만 소비한다. 명령별 status 정규식과 private truth parser를 만들지 않는다.

### 2.2 schema v3 truth 계약

schema v3 기본 계약은 다음과 같다.

| 구분 | 필드 | 처리 |
|---|---|---|
| 유지 | `id`, `claim`, `source`, `location`, `tags` | canonical 주소와 grounding |
| 신설 | `locus` | `lNNN` 형식의 안정적인 semantic slot id |
| 유지 | `provenance`, `derived_from`, `assumptions`, `as_of` | 현재 claim의 의미·근거 |
| 신설(derived 전용) | `derivation` | fixed declarative operator·입력·단위; 임의 코드 실행 금지 |
| 제거 | `corroborated_by` | 독립 support는 current coverage edge에서 파생 |
| 제거 | `status` | truth 파일이 존재하면 canonical이므로 `ok` 상수도 필요 없음 |
| 제거 | `conflict_with` | 임시 conflict store로 이동 |
| 제거 | `resolution`, `superseded` | 과거 승패 기록 |
| 신설하지 않음 | `voided_premise`, rejected digest | 과거 관계·재제안 억제 장치 |

한 truth ID는 가능한 한 유지한다. 현재값이 바뀌어도 ID를 바꾸지 않는 것이 문서 citation과 관련 데이터의 연쇄 수정을 줄인다. truth ID는 파일 주소이고 `locus`는 의미 주소다. 둘을 대신 쓰지 않는다.

canonical identity key는 `(locus, as_of)`다. free-form ASCII slug를 쓰지 않는다. `초아`를 `choa`로 쓸지 `chowa`로 쓸지 같은 기계 조어가 conflict key를 갈라놓기 때문이다.

- `.weavedoc-state/loci.json`은 current locus만 `lNNN`으로 보관한다.
- entry에는 현재 subject·relation·context의 **source/user-grounded display label**과 exact-normalized aliases를 둔다. 번역·로마자화·새 분류명은 사용자 채택 없이 label/alias가 될 수 없다.
- exact alias가 맞으면 기존 locus를 재사용한다. 의미상 같지만 철자가 다른 alias를 추가하거나 여러 locus 후보가 나오면 사용자 확인 전에는 commit하지 않는다.
- 새 locus는 map이 검색한 current candidate set과 grounded subject/relation을 envelope에 담고, `map-commit`이 lock 안에서 다시 검색해 겹치는 후보가 없을 때만 typed allocator로 발급한다. 유일성을 판정할 수 없으면 Human queue다.
- 여러 값이 동시에 합법이면 같은 locus에 `as_of`/context 범위를 분리한다. 주체·관계 자체가 다르면 별도 locus다.
- 각 alias는 그것을 실제로 뒷받침하는 current truth/source/conflict reference를 가진다. source 교체·prune·conflict 해결 때 이 reference도 같은 transaction에서 갱신한다.
- reference가 0이 된 non-display alias는 즉시 제거한다. 사용자가 채택한 display label도 해당 locus가 current인 동안만 남고, rejected/historical alias를 재제안 억제용으로 보존하지 않는다.
- locus를 참조하는 current truth·open conflict·open pending decision이 모두 0개가 되면 registry entry를 제거하지만 `lNNN` 번호는 재사용하지 않는다.

이는 완전한 entity ontology가 아니다. 사람이 이미 쓰는 주체·관계 이름에 안정 주소를 부여하고, 기계가 새 이름으로 조용히 갈라놓는 것만 막는 최소 registry다.

분류는 보수적으로 total하게 만든다.

1. locus가 다름 → new
2. locus가 같고 `as_of` 범위가 명백히 disjoint → new
3. canonical key가 같고 normalized claim이 정확히 같음 → same/support
4. canonical key가 같고 claim이 다름 → conflict
5. locus는 같지만 시간 범위가 겹치거나 `null`과 dated 범위의 관계가 불명확함 → conflict로 열어 사용자 merge/split 결정
6. candidate의 locus를 하나로 정할 수 없거나 기존 여러 locus와 겹침 → truth·conflict·locus를 만들지 않고 truth·locus·conflict allocator도 올리지 않은 채(candidate namespace의 `candidate_id`만 발급) full candidate envelope를 current decision queue에 기록

의미가 같은 다른 표현도 자동 same으로 세탁하지 않는다. exact-normalized same이 아니면 conflict로 보여주고 사용자가 same/merge/split을 정한다. `map`이 locus를 제안할 수는 있지만 애매한 key를 조용히 발급할 수 없다.

`derived`는 다음으로 좁힌다.

- 결정론적 공식과 grounded premise만으로 계산되는 값만 기계-origin derived canonical이 될 수 있다.
- 해석·취향·추정은 proposal이며 사용자 채택 전에는 canonical이 아니다.
- derived truth는 `derivation`(operator key, typed parameters, input order, output unit), `derived_from` id, 각 premise semantic digest를 함께 결속한다.
- 공용 `derived-model`은 schema v3의 finite operator registry만 실행한다. 각 operator는 input type/unit, deterministic canonical serialization, overflow/divide-by-zero/error behavior를 선언하며 자유형 JS/shell 식이나 파일 경로를 평가하지 않는다.
- dependency graph는 DAG여야 한다. cycle·missing premise·unit mismatch·unknown operator는 total diagnostic이고 계산 결과를 current truth로 노출하지 않는다.
- 지원 premise writer는 lock 안에서 영향받는 derived DAG를 topological order로 **미리 계산**하고 premise+모든 derived truth+views를 한 transaction으로 stage한다. 하나라도 계산할 수 없으면 아래의 승인된 처분 없이는 premise write 전체를 commit하지 않고 원본을 유지한다.
- 계산 불능은 영구 차단이 아니라 처분 질문이다. premise가 남는 **값 변경**(conflict 새값 채택 포함)이 dependent derived를 계산 불능으로 만들면 처분 질문은 그 dependent에만 열리고, dependent별 선택지는 `삭제 | derivation-required pending decision으로 lossless 이송` 둘이다. `변경 취소`는 dependent별 처분이 아니라 operation 전체의 취소다. premise **삭제**는 이 규칙이 아니라 삭제 전용 규칙 — 모든 dependent의 rewire/delete 전수 열거 — 을 따른다.
- 이송된 derived는 canonical에서 빠져 §2.3.1 queue 규칙(supply/remap/remove)을 따르고, 기존 recipe는 `derivation_candidate`로 보존되며 installed `derivation` 슬롯은 비워진다(§2.3.2 TD). resolve 안에서 recipe를 인라인 편집하거나 재배선하지 않는다. 이송 transaction은 unit 이탈 규칙(§2.6)과 같게 그 unit의 active ledger row·confirmation baseline, 딸린 각 support edge와 그 edge의 `s:` ledger row·confirmation baseline, generated projection을 같은 lock 안에서 정리하고, edge가 담던 evidence address는 pending payload에 보존한다. 인용 문서는 공용 projection digest로 stale이 계산된다. 계산 불능 dependent 전부의 처분이 정해졌을 때만 premise 변경+처분이 한 transaction으로 적용되고 하나라도 미정이면 전체 no-write다. 이 no-write는 write 시작 전의 semantic 거부이며, write 실패는 §2.8 경계를 그대로 따른다 — target vector가 old state 그대로면 `rolled_back` terminalize 후 정리, 변경·혼합 상태가 하나라도 있으면 처분과 무관하게 rollback이다. 계산 가능한 dependent는 처분 질문 없이 자동 재계산되며, 그 결과도 write-set preview에는 함께 표시된다.
- 성공한 자동 재계산은 derived truth ID와 recipe를 유지하고 claim/premise digests만 current 값으로 교체한다. 기계가 계산한 새 projection은 cold verification과 human confirmation debt를 열며 스스로 confirmation을 발행하지 않는다.
- direct/out-of-band premise edit는 old derived를 usable로 두지 않고 `DERIVED-STALE`로 차단한다. `rederive --preview/--apply`가 expected premise digests를 재확인해 같은 calculator/transaction으로 복구한다. current premise에서 계산이 불가능해진 dependent는 rederive preview가 같은 처분 계약(`삭제 | derivation-required 이송`)을 열고 decision token으로 그 처분만 원자적으로 수행한다 — premise가 이미 current이므로 `변경 취소` 선택지는 없다.
- premise 삭제 decision preview는 dependent derived를 새 grounded premise로 재배선하거나 함께 삭제하는 결과를 반드시 열거한다. 사용자가 어느 쪽도 승인하지 않으면 premise 삭제를 거부해 stale derived가 영구 sink로 남지 않게 한다.
- material에 없는 assumption은 먼저 사용자 답변 또는 명시 채택으로 grounded되어야 한다. 자유 assumption 목록만으로 canonical을 만들지 않는다.

### 2.3 임시 conflict store

구현 기본안은 machine-owned `.weavedoc-state/conflicts.json`이다. Markdown 장부를 하나 더 만들지 않아 parser 상태공간을 넓히지 않는다.

각 open conflict는 최소한 다음을 보존한다.

- conflict id
- 겹침 connected component의 locus와 normalized `as_of`/context envelope, 관련 canonical identity key 목록
- `targets[]`: 영향받는 canonical truth 0개 이상 각각의 id·locus·normalized `as_of`/context·발견 당시 semantic/grounding digest. v2 open conflict처럼 확정 current가 없으면 빈 배열이다.
- `candidates[]`: incoming candidate 1개 이상 각각의 stable candidate id, locus proposal, normalized `as_of`/context, claim/source/location/quote, converted digest, raw-source digest
- target/candidate별 충돌·겹침 의미 범위와 component adjacency
- 생성 시각 또는 자료 id
- 정렬된 target ids/digests+candidates/evidence+range를 결속한 idempotency key

한 entry는 target 하나를 가정하지 않고 **서로 겹치는 connected component 하나**를 표현한다. 따라서 부분 기간 overlap, 여러 current truth의 병합, current가 아직 없는 v2 conflict를 payload 손실 없이 round-trip할 수 있다. 서로 독립적인 component는 별도 conflict다.

이 파일은 open conflict만 담는다. 해결된 entry는 삭제한다. archive 절, accepted 절, suppression 목록은 만들지 않는다.

정확한 JSON schema와 명령 이름은 Phase 1에서 고정하되 다음 불변식은 바꾸지 않는다.

- candidate는 `truths/`와 current index에 들어가지 않는다.
- open conflict는 모든 영향받는 target canonical truth의 소비와 출하를 차단한다. `targets=[]`인 pending component도 새 canonical 발행과 출하를 차단한다.
- conflict가 열린 뒤 target 집합·canonical digest·range가 바뀌면 stale conflict로 차단하고 다시 비교한다.
- candidate의 locus/`as_of`/context/material/converted/raw-source digest가 바뀌어도 stale conflict로 차단한다.
- 동일 connected component의 sorted target+candidates+evidence 재실행은 기존 open entry를 반환하고 중복 conflict를 만들지 않는다.
- 사용자 결정을 받지 않은 resolve는 불가능하다. 단, stale entry의 증거를 current bytes에 다시 결속하는 refresh는 winner 선택이 아니라 재분류다.
- resolve 성공은 사용자 선택의 적용 — canonical 갱신, `derivation-required` 등 pending decision 생성, 또는 absence — 과 파생 view 재생성, conflict 삭제까지 하나의 transaction이다.

target set/semantic/grounding digest나 candidate range/converted/raw digest가 바뀐 entry는 일반 resolve가 거부한다. `map-commit --refresh-conflict <id>`가 operation lock 안에서 모든 current targets·candidates·evidence·locus를 다시 읽고 connected-component 분류를 total하게 다시 실행한다.

- 여전히 겹치는 묶음 → current snapshot의 `targets[]`/`candidates[]`/digests/ranges를 가진 conflict component 1개 이상으로 replace
- exact same pair → conflict에서 제거 + 해당 target의 unverified support edge 생성
- disjoint new candidate → conflict에서 제거 + 새 unverified canonical 생성
- 원래 target 일부/전부 삭제 → 남은 candidates를 current TruthStore 전체와 다시 비교해 new/same/conflict/Human queue로 재분류
- candidate source만 사라짐 → 그 candidate를 제거하고 남은 component를 다시 분류; grounded target은 winner로 “선택”한 것이 아니라 기존 current로 계속 유지
- target source만 사라지고 grounded candidate가 남음 → candidate를 new로 승격하거나 버리지 않고 같은 conflict component를 유지한다. target의 missing-grounding은 conflict projection에서 `TARGET-FIDELITY-MISSING`으로 파생해 fidelity lane에도 같은 conflict id로 보이되 별도 payload 사본을 만들지 않는다. target re-ground/remove 또는 사용자의 candidate 채택을 한 decision transaction으로 처리하기 전 일반 resolve/current-keep은 거부한다.
- target과 candidates 모두 grounded evidence를 잃음 → conflict payload를 제거하되 dangling current truth는 공용 TruthStore가 fidelity incident로 계속 차단
- locus가 모호해짐 → 해당 candidate를 current Human queue로 이동

한 component가 여러 개로 갈라지면 canonical key 정렬상 첫 component가 old conflict id를 유지하고 나머지는 allocator의 새 conflict id를 받는다. refresh transaction은 모든 old target/candidate를 위 결과 중 정확히 하나에 배치하고 old entry와 새 conflict/support/truth/Human queue를 중복해 남기지 않는다. 같은 snapshot 재실행은 idempotent하다.

#### 2.3.1 current Human decision queue

locus를 정하지 못한 candidate나 migration 중 grounding/derivation/conversion 결정을 Markdown 질문 한 줄로 줄여 버리지 않는다. machine-owned `.weavedoc-state/pending-decisions.json`은 **아직 답이 필요한 current payload만** 보존한다.

- key는 canonical JSON의 `{kind, full payload, kind-specific current dependency projection}`을 정렬해 해시한 `q:<64-hex>` content address다. locus kind는 locus set/target digests, grounding은 source candidates/raw digests, derivation은 premise/recipe candidates, support는 target+evidence addresses, conversion은 material/raw digests, quote는 converted digest+exact range/source offset+candidate source-tree/raw digests를 결속한다. timestamp·표시 순서는 제외하며 질문 생성만으로 truth·locus·conflict allocator를 올리지 않는다 — payload 탄생 시 발급되는 것은 별도 candidate namespace의 `candidate_id`뿐이다.
- entry는 tagged kind, stable `candidate_id`, full candidate envelope 또는 lossless legacy payload, source-grounded locus/source candidates, 겹치는 current target ids/digests, 생성 이유와 kind-specific 선택을 가진다. `candidate_id`는 §2.4 allocator의 candidate namespace에서 payload 탄생 시 한 번 발급되어 kind 전이·blocked refresh에서 유지되고, split children은 새 id를 받으며, terminal에서 entry와 함께 제거되고 번호는 재사용하지 않는다 — `q:key`가 현재 질문의 주소라면 `candidate_id`는 payload의 연속 identity다. 최소 union은 `locus-assignment(existing locus | new user label | split | discard)`, `grounding-required(attach/choose grounding | remove)`, `derivation-required(supply typed recipe | remap as grounded ordinary claim | remove)`, `support-grounding-required(choose exact evidence address | drop support)`, `conversion-required(finish conversion | remove raw material)`, `quote-attribution-required(choose exact text source/location | classify as summary/paraphrase | mark binary not-checkable | remove span)`다. 기계 추천 winner/default는 없다.
- 같은 snapshot 재실행은 같은 key/entry를 반환한다. dependency bytes가 바뀌면 일반 answer가 거부되고 공용 refresh가 old entry의 full payload를 `pending decision | canonical truth | support edge | conflict component | converted material | absence | fidelity incident` typed 결과의 집합 — terminal 결과와 0..N child payload — 으로 배치한다. 보존식은 고정이다: parent payload = terminal 결과 + child payloads, 누락·중복 0건을 같은 transaction의 postcondition으로 증명한다. kind가 달라지면 key도 반드시 달라지고, 자동으로 의미 선택이 필요한 drop/remove/recipe/label을 고르지 않는다. answer 적용도 같은 total classifier를 거친다: 한 답변이 모든 축을 통과시키지 못하면 결과는 canonical이 아니라 다음으로 필요한 kind의 pending entry다(예: derivation `remap` 답변에 유효한 grounding이 없으면 `grounding-required`로 전이). 복합 debt의 첫 분류는 현재 활성 상태 하나일 뿐이며, 축의 판정 순서·전이·재개방은 §2.3.2의 고정 전이표가 결정하고, 모든 축이 통과할 때만 canonical commit이다.
- `map-commit --answer-decision <q:key>`는 full payload와 선택별 결과 projection/absence를 보여주는 decision token을 먼저 만든다. locus 답변은 locus 할당 또는 재분류→truth/support/conflict commit으로, grounding 답변은 supported gather 결과에 결속한 same-id re-ground 또는 pending candidate remove로, derivation 답변은 공용 calculator를 통과한 same-id derived truth·grounded ordinary candidate·remove로, support 답변은 exact typed edge 생성 또는 관계 drop으로 이어진다. conversion/quote 답변은 gather material writer의 expected raw/converted digest에 결속해 conversion 완료, exact marker 삽입, quote→summary 재작성, typed binary-not-checkable marker+cold debt, 또는 span 제거로 이어진다. 어느 branch든 결과 — commit, absence, 또는 §2.3.2 전이에 따른 다음 kind의 새 pending entry — 와 old entry 삭제는 한 transaction이며 중간 handoff 성공만으로 entry를 지우지 않는다.
- answer-decision도 §2.6의 decision-bearing writer 계약을 그대로 쓴다. token preview에서 full human projection/absence를 실제로 보여준 결과 unit만 같은 transaction에서 confirmed가 되고, gather/rederive 같은 후속 handoff가 나중에 만든 unit이나 요약만 보여준 material은 confirmation debt를 유지한다. cold debt는 어느 branch도 자동 해제하지 않는다.
- `new user label`은 답변에 사용자가 실제로 쓴 Unicode label을 저장하고 기계가 transliteration/번역하지 않는다. `discard`는 candidate와 queue entry를 삭제하며 suppression/history를 남기지 않는다.
- open entry는 `status --open`의 Human queue lane과 모든 core skill 종료 보고에 같은 identity로 보이고 `validate`/consecrate를 차단한다. resolve 전에는 truth population·coverage·gaps·document completeness에 들어가지 않는다.
- 해결된 entry는 즉시 삭제한다. answer transcript를 operational state로 보존하지 않으며 필요하면 Git/사람용 로그에서만 본다.

#### 2.3.2 복합 debt의 고정 전이표

한 payload의 현재 활성 kind는 아래 고정 축 순서에서 **처음 실패하는 축**이다. 구현이나 명령 경로가 아니라 이 표가 kind·`q:key`·질문 순서를 결정하므로, 같은 payload는 어디서 진입해도 같은 entry를 가진다. payload identity는 `material-conversion`(material당 1) · `quote-span`(exact span당 1) · `truth-candidate` · `support-edge` 네 가지이고, "open entry는 payload당 정확히 하나"는 이 identity 단위로 성립한다. 축 라벨은 reviewer lens 이름(T1/T5·S1)과 겹치지 않도록 두 글자로 쓴다.

| 순서 | payload | 축(kind) | 판정 입력 | 답변이 payload에 남기는 변환 | 통과 시 |
|---|---|---|---|---|---|
| MC | material-conversion | `conversion-required` | raw source 존재·판독과 valid `converted.md` 유무 | conversion 완료된 converted 또는 material 제거(absence) | active material + 미귀속 span당 quote-span payload 0..N 생성 |
| MQ | quote-span | `quote-attribution-required` | converted digest+exact offset의 미귀속 quote span | marker 삽입 · summary 재작성 · typed binary marker · span 제거 | 해당 span 종결 |
| TD | truth-candidate | `derivation-required` | `provenance: derived`인데 **installed** `derivation` 없음 | `supply`(candidate 재사용 포함)→calculator 통과 derivation 결속 / `remap`→`provenance: adopted`+derived 필드 제거 / `remove`→absence | TG |
| TG | truth-candidate | `grounding-required` | grounding이 current evidence로 resolve되지 않음(ordinary는 source·location·quote, derived는 premises·recipe 계산 가능성) | re-ground로 grounding 교체 / `remove`→absence | TL |
| TL | truth-candidate | `locus-assignment` | locus 미정·모호·다중 후보 | existing locus 선택 · new user label · split · discard | §2.2 분류(new/same/conflict) 후 commit |
| SG | support-edge | `support-grounding-required` | evidence address가 exact resolve되지 않음 | exact address 선택 / drop | typed edge 또는 absence |

- 답변은 축을 표시로 닫지 않고 **payload 자체를 변환**해 닫는다. 별도 해결-이력 memo는 없다 — remap된 payload는 더는 derived가 아니므로 TD가 다시 열릴 수 없고, 닫힌 축의 재개방은 그 축의 dependency bytes가 실제로 바뀌어 refresh가 전 축을 같은 순서로 재판정할 때뿐이다.
- 이송·채택으로 들어오는 derived payload는 갖고 있던 recipe를 `derivation_candidate`로 옮기고 installed `derivation` 슬롯을 비운다. installed derivation은 공용 calculator를 통과한 commit만 채울 수 있으므로, 유효한 recipe를 가진 계산 불능 이송분·conflict 채택분도 TG로 미끄러지지 않고 TD에서 멈춰 supply/remap/remove를 받는다.
- 전이는 one-to-one만이 아니다. TL `split`이나 MC 통과 후 quote-span 생성처럼 한 답변이 여러 결과를 낳으면 old entry 삭제와 0..N child payload 생성이 한 transaction이고, 각 child는 첫 축부터 다시 분류되며 old와 children이 동시에 열린 시점은 없다. children의 `candidate_id`는 child payload의 canonical 정렬 순서로 할당해 세 OS에서 결정적이다.
- MC의 `material 제거` 답변은 단독 absence가 아니라 cascade decision이고, 판정 입력은 §2.5 공용 dependency graph의 **전체 inbound**다. 처분 규칙이 정의된 open pending entry는 각각의 처분을 같은 preview에서 받는다 — truth-candidate·quote-span은 `다른 source로 re-ground | 함께 remove`, 그 material을 evidence candidate로 참조하는 SG entry는 `다른 exact evidence 선택 | support drop`. pending 밖 inbound — current truth/support/document grounding, 다른 material의 `source=mNNN` marker, conflict candidate evidence — 와 **여기 열거되지 않은 모든 inbound(미래의 새 pending kind 포함)** 는 하나라도 있으면 full impact를 보여주고 no-write하며 그 참조들의 결정을 먼저 요구한다. 처분 가능한 pending-only inbound에서 전 dependent의 처분이 정해졌을 때만 material absence+처분을 한 transaction으로 적용한다. 이것이 변환 불가 material과 그 pending truth를 함께 버리는 지원 경로다. blocked entry의 단독 답변 거부는 그대로다 — blocker에 행동하면 cascade 또는 refresh가 출구다.
- 어느 축에서든 `absence`(remove·discard·drop)가 선택되면 그 payload는 즉시 terminal이다 — 남은 축을 판정하지 않고 entry 삭제와 absence 결과가 한 transaction이다.
- 각 전이는 old entry 삭제 + 새 entry 생성(또는 commit/absence)이 한 transaction이며, 한 payload identity의 open entry는 어느 시점에도 정확히 하나다.
- truth-candidate의 TG는 참조 material이 material 축(MC·MQ)을 통과했을 때만 판정 가능하다. 이때 truth entry는 kind 없이 대기하지 않는다: 첫 실패 축의 kind를 유지한 채 `blocked_by: [의존 open entry의 q:key…]`를 명시하고, blocked 동안 답변은 거부되며 Human queue에는 기다리는 대상과 함께 표시된다. 의존 entry가 닫히면 dependency 변화가 refresh를 유발해 blocked_by를 재계산한다 — 별도 큐 순서 조정 장치를 두지 않는다.

### 2.4 ID 할당

삭제된 truth/locus ID의 번호 구멍은 정상이다. `census`는 경고하지 않는다. 그러나 과거 문서가 다른 사실을 가리키는 일을 막기 위해 삭제된 ID를 재사용하지 않는다.

채택안은 `.weavedoc-state/id-sequences.json`의 typed 단조 증가 allocator다. truth·locus·conflict·candidate namespace를 따로 올리며 과거 truth 기록이 아니라 현재 식별자 충돌을 막는 운영 상태다.

v2 migration은 어떤 truth를 지우기 **전에** truth filenames, index/tree, coverage, verification ledgers, document citations와 guaranteed-format truth-id references를 전수 스캔해 truth high-water를 만든다. 광산 로그의 id token은 winner 판단이 아니라 충돌 방지용 숫자 증거로만 이 one-time scan에 포함할 수 있다. locus는 v3에서 처음 생기므로 별도 namespace를 1부터 시작하되 dry-run assignment map을 apply와 결속한다. 신뢰할 truth high-water를 만들 수 없는 손상·부분 광산에서는 migration을 중단하거나 새 v3 truth namespace로 전환하며, 보증할 수 없는데 “재사용 없음”이라고 주장하지 않는다.

### 2.5 materials와 provenance

material은 source evidence이므로 단순히 오래됐다는 이유만으로 자동 삭제하지 않는다.

- current truth가 인용하는 material은 유지한다.
- 같은 사실을 독립적으로 확인한 material은 current support로 유지할 수 있다.
- 공용 material dependency graph는 모든 active converted quote marker의 `consumer material → source=mNNN provider material`, current truth/support/document grounding, open conflict candidate evidence, pending-decision payload/source candidates를 한 번 resolve한다. `validate`, `impact`, `prune`, source digest가 이 graph를 공유한다.
- 다른 material marker에서 inbound reference가 하나라도 있는 provider는 truth 직접 참조가 0이어도 prune/reference-zero가 아니다. provider raw source 변경·삭제는 모든 dependent material verification과 관련 document context를 stale로 만들고, re-ground 또는 dependent 삭제 전에는 provider 삭제를 거부한다.
- marker resolver는 provider의 raw `source.*`에서 직접 끝나므로 dependency edge를 따라 quote를 증명하지 않는다. graph cycle은 증거 세탁이 아니라 GC 연결성 문제로 다루며, current root가 없는 strongly connected component만 사용자에게 묶음 prune 후보로 보여준다.
- correction-only이며 공용 dependency graph의 current/open reference가 0인 material 또는 unrooted SCC는 명시적 prune 대상으로 보고한다.
- prune은 자동 실행하지 않으며, 사용자가 승인하면 삭제한다. 복구는 Git이 담당한다.
- 단 하나의 좁은 예외로, open conflict의 incoming loser만을 위해 생성됐고 **해결 중인 그 conflict edge를 제외한 공용 dependency graph의 current/open inbound reference가 0**임을 구조적으로 증명한 material은 resolve preview의 삭제 목록에 포함한다. 사용자의 exact conflict 결정을 그 삭제 승인으로 함께 받아 같은 transaction에서 제거한다. material marker·다른 conflict·pending decision·mixed/ambiguous reference가 하나라도 있으면 이 예외를 적용하지 않는다.
- `corrects`를 새 소비자 표면으로 확장하지 않는다. schema v3에서 제거한다.
- `dated`는 source metadata로 남길 수 있지만 conflict winner 권한을 갖지 않는다.
- `project.authority`는 conflict 자동 해소 외 소비자가 없으므로 schema v3에서 제거한다. material `role`과 project `roles`는 분류·출력용 current metadata로 남지만 winner 권한은 없다.

material `status`도 재검토한다.

- `verified`는 digest ledger에서 파생 가능하다.
- `used`는 문서 citation에서 파생 가능하고 원자료를 불필요하게 수정한다.
- `retracted`는 tombstone history다.
- `collected`는 `converted.md`가 존재하는 active material에서는 의미가 약하다.
- `converted`는 `converted.md`의 존재가 이미 말하는 사실의 중복 기록이다.

schema v3에서는 material `status`를 제거하고, 필요한 현재 workflow 상태를 파일 존재와 verification model에서 계산한다. `stage: plan | applied`, origin, source metadata는 의미를 바꾸므로 유지한다.

독립 support는 truth 파일의 느슨한 material-id 목록이 아니라 existing current coverage model의 typed edge로 기록한다. edge의 안정 주소는 `(truth id, material id, normalized location)`이고, unit key는 이 주소만 해시한 `s:<64-hex>`다. projection digest는 별도로 target semantic digest·quote·converted/raw-source digest까지 묶는다. location이 실제로 바뀌면 old edge 삭제+new edge 추가로 취급하고, 같은 주소의 내용 변경은 같은 key의 stale projection이다.

schema v3 verification-unit grammar는 `mNNN | tNNN | s:<64-hex>`를 명시한다. ledger parser, `attest`, `scope`, `status`, confirmation map은 이 grammar와 support-edge resolver를 공유한다. `attest`는 key가 current coverage edge로 정확히 resolve되지 않으면 거부한다. 최신 ledger row가 같은 주소의 current projection과 일치할 때만 verified이며 TruthStore는 verified edge만 corroboration으로 노출한다. support만 추가될 때 canonical truth 파일과 semantic digest는 바뀌지 않는다.

### 2.6 verification state

검증 장부는 과거 서사가 아니라 **현재 바이트가 검증됐는지**를 증명하는 기계 증거로 유지한다.

여기에는 서로 대체할 수 없는 두 축이 있다.

- **cold verification**: source→converted→truth 변환이 현재 증거에 충실한가
- **human confirmation**: 기계가 현재 기록한 claim·채택·계산·삭제가 사용자의 의도와 맞는가

둘은 각자 current projection digest에 결속한다. cold pass가 사용자 의도를 대신하지 않고, 사용자 확인이 source 대조를 대신하지 않는다.

support edge에는 별도 **S1 semantic-support lens**를 둔다. 한 cold reviewer가 target truth의 current claim/body와 source material의 converted/raw evidence를 보고 “이 근거가 같은 사실을 독립적으로 지지하는가, 귀속과 범위가 맞는가”를 판정한다. source quote 존재는 mechanical seal이 맡고 의미 동치는 S1이 맡는다. `scope`는 unverified/stale `s:` unit을 S1 batch로 라우팅하며 S1 PASS 없이 `attest verified`를 호출하지 않는다.

확정 기본값은 다음과 같다.

- v3 `.weavedoc-state/verification.tsv`는 active material·truth·support-edge verification unit별 최신 유효 row 하나만 운영 입력으로 유지한다. v2 `truths/verify-ledger.tsv`는 migrator 전용 reader가 읽어 이 파일로 compact한다.
- 재검증은 해당 row를 원자적으로 교체한다.
- unit 삭제 transaction은 그 unit과 딸린 support edge의 ledger row도 같은 lock 안에서 제거한다. v3 ledger의 non-active row는 `LEDGER-ORPHAN`으로 차단하며 ghost history로 두지 않는다. 이 차단에는 지원되는 출구가 있고 진단이 두 경로를 함께 안내한다: Git에서 unit을 복원한 뒤 정상 지원 삭제를 밟거나, absent-target reconcile을 쓴다. reconcile selector는 §2.5의 unit grammar(`mNNN | tNNN | s:<64-hex>`)를 공유하며 각 종류의 기존 지원 삭제 writer가 받는다 — `tNNN`은 `map-commit --remove-current`, `mNNN`은 승인형 `prune`, `s:` edge는 그 edge를 소유한 `map-commit`의 edge-drop 경로(`--drop-support <s:key>`, live/absent 동일 표면). 셋 다 **이미 부재한 target**을 받아 orphan ledger row·confirmation debt·딸린 support edge를 preview로 열거하고 같은 decision token으로 한 transaction에서 정리한다. 커밋된 적 없는 unit처럼 복원 불가능한 경우까지 이 경로가 덮으며, 새 명령을 만들지 않는다. 부재 `tNNN`의 reconcile은 정상 `remove-current`와 같은 dependency cascade를 거친다 — 그 truth가 derived의 premise면 dependent 처분(rewire/delete)을, document·conflict·pending payload가 참조하면 그 영향을 같은 preview에 열거하며, 승인 없이 ledger만 정리하지 않는다. 단, 부재 material에 current/open inbound reference(truth grounding·`source=mNNN` marker·conflict/pending payload·document)가 남아 있으면 absent-target `prune`은 ledger만 정리하지 않고 no-write하며, dependent의 re-ground/remove 결정을 먼저 요구한다 — dangling grounding을 장부 정리로 세탁하지 않는다.
- 이전 round 행은 Git에 남긴다.
- `legacy-unbound` 면제는 v3 migration이 끝난 뒤 제거한다.
- `verify.md`는 현재 round, 현재 open Human queue, 현재 convergence 상태와 `verification_context_digest`만 유지하고 닫힌 장기 서사는 Git으로 보낸다. "current model에서 재생성"(Phase 2)은 절 단위다: 기계 생성 절만 model에서 다시 쓰고, 사람 판단이 사는 내용(Adjudications, Human queue의 아직 처리되지 않은 ruling)은 그 판단을 소비하는 transaction 전까지 byte 보존한다. 전체 파일 덮어쓰기로 사람 판단을 지우는 구현은 이 계약 위반이다.
- verification adjudication과 do-not-raise는 해당 context digest가 current verification-unit 집합과 일치할 때만 유효하다. target bytes가 바뀌면 `consecutive_passes`와 suppression은 즉시 효력을 잃고, 다음 round 시작 writer가 current file을 새 baseline으로 교체한다.
- document review의 현재 adjudication/do-not-raise는 해당 review loop의 작업 상태이므로 이번 truth-history 제거와 별도로 다룬다.

현재 verify 스킬은 `truths/changelog.md`의 마지막 dated `confirmed:` 뒤를 읽어 “사용자가 아직 확인하지 않은 변경분”을 만든다. v3에서는 이 결합을 제거하고 machine-owned `.weavedoc-state/confirmations.json`의 **현재 확인 기준선**으로 대체한다.

- 이 파일은 마지막 사용자-confirmed baseline을 unit key별로 하나만 가진다. 각 entry는 projection digest와 삭제 항목도 식별할 수 있는 최소 descriptor만 가지며, 감사 이력이나 claim evidence가 아니다.
- descriptor는 truth=`{kind,id,locus}`, material=`{kind,id}`, support=`{kind,truth_id,material_id,location}`로 고정한다. 이는 안정 주소를 사람이 알아볼 수 있게 하는 identity metadata일 뿐이며 claim·quote·body·source bytes·과거 title을 저장하지 않는다.
- 삭제 unit의 descriptor는 사용자가 그 삭제를 확인할 때까지만 남는 current workflow debt이고 `confirm-current` 성공과 함께 제거된다. 장기 tombstone이나 재제안 억제 기록으로 승격하지 않는다.
- 확인 digest는 사람에게 의미 있는 current projection을 결속한다. truth는 id·locus·as_of·claim·provenance·derived 계약, material은 current conversion projection, support edge는 target·source·location·quote projection을 쓴다. 출력용 순서·mtime 같은 값은 제외한다.
- current unit이 map에 없으면 `add`, digest가 다르면 `edit`, map의 unit이 current set에서 사라졌으면 `delete`다. 따라서 별도 mutation event log 없이도 현재 미확인 집합을 total하게 계산한다.
- 같은 unit이 확인 전에 여러 번 바뀌어도 마지막 confirmed digest와 최신 current digest만 비교하므로 중간 버전은 쌓이지 않는다. 새 unit이 확인 전에 다시 삭제되면 양쪽 집합에 모두 없으므로 delta도 남지 않는다.
- 자동 `map-commit`, gather, migration 같은 비결정 writer는 이 map을 갱신하지 않는다. 그러므로 기계가 만든 current 변경은 직후 반드시 미확인으로 보인다.
- 공통 예외는 **decision-bearing writer**다. `resolve`, `map-commit --replace-grounding|--remove-current`, 승인형 `prune`처럼 명시적 사용자 결정을 요구하는 writer는 먼저 affected unit·결과 projection/absence·삭제 material을 담은 expected-snapshot preview와 decision token을 낸다. 사용자가 그 token을 승인해 실행하면 그 선택 자체가 preview 범위의 human confirmation이다. transaction은 active 결과 digest를 confirmation map에 기록하고 승인된 삭제 unit baseline을 제거한다. snapshot이 바뀌면 token은 무효이며 아무것도 쓰지 않는다.
- token이 확인하는 unit은 사용자가 **전체 human projection을 실제로 본 항목만** 명시적으로 열거한다. conflict claim을 골랐다는 사실이 관련 material 전체의 conversion이나 preview에 없던 support edge까지 확인한 것으로 확대되지 않는다. 그런 unit은 기존 confirmation debt를 유지한다.
- decision-bearing writer는 cold attestation을 발행하지 않으며 남은 cold debt는 그대로다. preview에 없던 side effect, 일반 `map-commit`, gather, migration, 에이전트의 “사용자가 원할 것”이라는 추정은 이 경로를 사용할 수 없다. 사용자가 이미 내린 결정을 다시 `confirm-current`로 묻지 않는다.
- decision token은 stale-choice 방지용 변경 결속이지 사용자 인증 서명이 아니다. runtime은 호출자와 스킬이 실제 사용자 답변을 정직하게 전달한다고 신뢰한다. 각 스킬의 user-only ownership·질문/답변 transcript·cold review가 이 경계를 감시하며 “기계가 token을 계산할 수 있으니 사용자 선택도 있었다”고 주장하지 않는다.
- verify 스킬은 계산된 **current unconfirmed snapshot**과 최신 truth/source를 함께 렌더하며 광산 로그를 다시 파싱하지 않는다. 각 항목은 add/edit/delete 구분과 descriptor를 보여주고, active add/edit에는 최신 current 내용과 근거를 붙인다. 확인 baseline은 폐기된 문구를 갖지 않으므로 v2의 `old → new` 전체 재현을 약속하지 않는다. delete는 descriptor로 삭제 대상을 식별하되 옛 문구나 정확한 과거 비교가 필요하면 Git 또는 사람이 남긴 광산 로그를 열어본다. 그 내용은 current 판정을 바꾸지 않는다.
- 그 밖의 current 변경을 사용자가 확인하면 신규 `confirm-current` command가 lock 안에서 expected current digest/absence를 다시 확인한 뒤 active unit은 최신 digest로 교체하고, 삭제 unit은 map에서 제거한다. human confirmation과 cold verification은 순서 독립인 별도 축이므로 matching cold row를 선행 조건으로 삼지 않는다. 대신 응답과 출하 gate는 남은 cold debt를 분명히 보여준다. snapshot이 달라졌다면 아무것도 쓰지 않고 최신 delta를 다시 보여준다.
- 유효한 empty map이면 모든 current unit이 unconfirmed다. configured v3 mine에서 파일이 없거나 읽을 수 없거나 malformed이면 fail-closed하며 empty map으로 흡수하지 않는다.
- unconfirmed delta는 `status --open`과 verify workflow에는 보이지만 truth population, conflict winner, gaps coverage, `census`, provenance에는 영향을 주지 않는다. 출하 가능성은 digest verification·human confirmation·review gate를 각각 명시적으로 계산한다.
- canonical을 바꾸는 순간 loser 내용은 truth와 machine state 어디에도 남지 않는다. confirmation map에는 digest·unit key·최소 identity descriptor만 있고 폐기된 claim·body·source byte는 없다.
- UI는 전체 snapshot 확인과 항목별 확인을 모두 제공하지만 저장 결과는 동일한 unit별 current digest다. `blanket`/`itemized` 등급, 과거 judgment 우선순위, 다음 delta 재노출 정책은 v3 상태에 보존하지 않는다. 아직 결정되지 않은 의미 문제는 confirmation metadata가 아니라 context-bound Human queue에 남는다.

이 구조는 `truths/changelog.md`를 없애야만 동작하는 설계가 아니다. 로그 파일을 계속 써도 되지만, 지우거나 편집하거나 쓰지 못해도 current truth·verification·confirmation 판정은 동일해야 한다.

### 2.7 문서 propagation은 쓰기 대신 계산한다

truth가 갱신될 때 관련 document 파일을 즉시 모두 고치지 않는다.

- canonical truth는 같은 ID로 제자리 갱신한다.
- `index.md`, `tree.md`처럼 명시된 generated view만 재생성한다.
- 문서 본문은 다음 review/refine 시점에 수정한다.
- 문서가 오래됐는지는 저장된 review context projection과 현재 projection을 비교해 계산한다.
- **semantic digest**는 locus·as_of·claim처럼 독자가 믿는 내용을 결속한다.
- **grounding digest**는 source·location·body quote·raw source를 결속한다.
- **completeness digest**는 `scope_tags`에 들어오는 current locus/id 집합을 결속한다.
- cited truth의 semantic/grounding 변경은 fidelity stale, scope 안 truth의 추가·삭제·locus 변경은 completeness stale이다.
- support-only edge 추가, 파일 순서, 출력용 metadata 변경은 document가 그 corroboration을 명시적으로 인용하지 않는 한 stale을 만들지 않는다.
- 이를 위해 모든 `plan.md`에 `status: stale`를 쓰는 eager propagation은 제거한다.
- 기존 final의 seal을 migration이 자동 재발행하지 않는다. 실제 재검토 없이 seal을 갱신하는 것은 laundering이다.

이 구조의 목표는 “세 파일만 쓴다”는 물리 개수 보증이 아니라 **사람이 쓴 관련 content를 연쇄 재작성하지 않는다**는 것이다. 정상 writer의 write set은 다음 역할로 제한하고 preview/postcondition이 실제 경로를 열거한다.

1. 해당 canonical truth와 고정 공식상 반드시 재계산되는 derived truth
2. generated index/tree
3. 그 operation에 직접 해당하는 conflict/pending-decision/coverage/confirmation/verification/locus transaction state — 중복 claim 사본이 아니라 current identity·digest·edge만
4. 선택적인 광산 로그 한 줄 — canonical transaction의 commit과 postcondition이 끝난 뒤 lock을 유지한 채 manifest 밖에서 best-effort append한다. 실패·부분 기록·누락은 경고만 내며 rollback·recovery·terminal root digest에 관여하지 않는다

관련 material 원문과 document 본문은 필요할 때 별도 지원 writer/review로만 수정하며, unrelated truth/material/document는 byte 불변이다. 그전에는 공용 projection digest가 정확하게 stale 상태를 보여준다.

### 2.8 mutation lock 완전판

현재 dispatcher 진입 잠금은 CLI 명령끼리의 동시 실행을 막지만, library driver가 명령 본체를 직접 부르거나 명령이 잠금 전에 의미 있는 snapshot을 읽는 경로까지 증명하지는 않는다. schema v3의 conflict resolver와 migration은 여러 current-state 파일을 한 번에 바꾸므로 남아 있던 mutation-lock 후보를 이때 함께 닫는다.

- 모든 지원 CLI·library operation은 읽기 전용과 `--dry-run`까지 같은 **exclusive operation lock**을 먼저 얻는다. v3에서는 동시 read 최적화보다 지원 reader가 transaction 중간 상태를 보지 않는 보증을 우선한다.
- lock owner record는 operation id·pid·command·started_at·`reading|preparing|manifested|committing|rolling_back|committed|rolled_back` phase와 terminal phase의 expected root digest를 가진다. 두 번째 operation은 대기하지 않고 현재 owner·lock 경로·복구 방법을 이해 가능한 문장으로 즉시 거부한다.
- 모든 mutating library entrypoint는 lock token과 transaction context 없이는 실행되지 않는다. 판단에 쓰는 mine snapshot은 lock 취득 뒤에 열고, 내부 `reindex`·`validate`도 같은 snapshot/context를 받는다.
- multi-file writer는 모든 새 파일과 rollback용 원본을 먼저 `.weavedoc-state/transactions/<operation-id>/`에 stage하고, 각 target을 `op: create | replace | delete`와 `old/new: {state: absent | regular-file, digest?}`로 typed하게 기록한 대상 목록·artifact version·operation id·per-target progress를 담은 durable `.weavedoc-state/transaction.json`을 **첫 적용 전에** 기록한다. rollback은 op별 역연산이다 — create는 생성물 제거로 absent를 복원하고, replace·delete는 backup을 복원한다. absent가 기대되는 자리의 파일 존재나 state 불일치는 corruption과 구분된 진단으로 manual recovery에 넘긴다. 공용 primitive의 target은 regular file뿐이며 directory target은 fail-closed로 거부한다 — `draft/`·`final/` 디렉터리 교체(consecrate promotion)는 검증된 기존 전용 transaction(`.consecrate.inflight` marker·`.final.bak` backup·restore postcondition·compare-first recovery·`CONSEC-INTERRUPTED`)이 그대로 담당한다. consecrate도 exclusive operation lock은 같은 경계로 얻지만 공용 manifest를 쓰지 않고, 두 evidence 계열은 파일이 분리되어(`transaction.json` vs `.consecrate.inflight`) 공용 진단 사다리가 consecrate 교체 중의 정상적인 `final/` absent 상태를 corruption으로 읽지 않는다. 공용 mutation primitive는 matching manifest 아래에서 방향별로 guard한다: forward target 적용은 owner `manifested|committing`에서만, rollback restore는 `rolling_back`(recover takeover 포함)에서만 허용한다. 실패·처리 가능한 예외·INT·TERM의 분류는 서사적 "첫 rename 전/후"가 아니라 manifest의 per-target progress와 fresh state/digest 대조로 판정한다 — 모든 target이 old state 그대로면 target 불변의 0-change abort이고, durable manifest가 이미 있으면 owner를 먼저 `rolled_back`+old root digest로 durable하게 terminalize한 뒤(전 target이 old state임을 확인했다는 `rolled_back` postcondition을 이미 만족한다) manifest/stage/lock을 정리해, 정리 중 crash 잔재도 manual이 아니라 terminal 사다리로 분류된다. 하나라도 적용됐거나 혼합이면 rollback state machine이다.
- 여기서 `durable`의 필수 보증은 **동기 write가 성공했다고 반환한 뒤의 process abort/SIGKILL**까지다. 공용 `writeDurable`은 stage·backup·manifest bytes를 file flush/fsync하고, manifest atomic replace 뒤 parent-directory sync가 지원되는 OS/filesystem에서는 그것까지 성공해야 owner phase를 `manifested`로 올린다. flush/sync 실패는 target 적용 전 no-write다.
- 실제 전원 차단·controller cache·network filesystem처럼 OS가 동기화 완료를 거짓으로 보고할 수 있는 경우까지 절대 보증하지 않는다. 세 OS의 필수 baseline은 `process_crash_durable=true`이며 parent-directory sync를 보증할 수 없는 환경은 `power_loss_durable=false`로 진단/JSON/release evidence에 명시한다. 이 경우에도 process-crash 범위의 multi-file mutation은 지원하지만 전원 차단 보증으로 확대해서 쓰지 않는다.
- rollback은 각 restore 뒤 manifest progress를 갱신하고 마지막에 모든 target의 old typed state(absent 포함)·digest를 fresh-read한다. 전부 일치하면 owner를 `rolled_back`+old root digest로 durable하게 바꾼 뒤 manifest/stage/lock 순서로 정리하고 원래 실패를 반환한다. rollback write/적용/postcheck 자체가 실패하면 `ROLLBACK-INCOMPLETE`를 반환하고 manifest·원본 backup·stage·crash lock을 보존한다. `recover --rollback`은 기록된 progress와 current state/digest에서 idempotently 이어간다.
- 정상 성공은 모든 target 적용(rename/unlink)과 fresh-read postcondition 뒤 owner를 `committed`+new root digest로 durable하게 바꾸고, 그다음에야 optional 광산 로그 한 줄을 manifest 밖에서 append하며(실패는 rc 0 + stable warning), 마지막으로 manifest/stage/lock 순서로 정리한다. terminal root digest는 광산 로그를 제외한 canonical target domain의 경로·존재 여부·bytes를 결속한다. 로그 append 중 SIGKILL은 committed 상태를 바꾸지 않고 recover가 잔재만 정리하며, 부분 로그 줄은 사람용 파일의 흠일 뿐 어떤 판정도 바꾸지 않는다. terminal ack 이후 cleanup 실패는 `CLEANUP-INCOMPLETE`로 보고하고 owner record·잔여 stage를 보존해 `recover --complete`가 잇는다. 따라서 성공 또는 처리된 실패에서는 외부에 원본 전체나 완전한 새 상태 중 하나만 남는다.
- SIGKILL과 감지 가능한 파일시스템 장애에서도 자동 원자성을 약속하지 않는다. manifest나 crash lock이 남으면 `validate`를 포함한 모든 일반 명령이 거부한다. 진단은 고정 우선순위 사다리로 구분한다: ① terminal owner(`committed|rolled_back`)+root exact → `CLEANUP-INCOMPLETE`(데이터 완전, `recover --complete`가 정리), ② rollback이 시작되거나 실패한 valid evidence(`rolling_back` phase 또는 `ROLLBACK-INCOMPLETE` 기록) → `ROLLBACK-INCOMPLETE`(umbrella에 흡수되지 않음), ③ 그 밖의 nonterminal 잔재 → `TRANSACTION-INCOMPLETE`, ④ malformed·mismatched evidence → 자동 진단 없이 manual only. 어느 쪽도 부분 상태를 정상 mine으로 읽지 않는다. 실제 전원/장치 손실은 위 capability 경계 밖일 수 있음을 숨기지 않는다.
- 별도 `recover --inspect|--rollback|--complete`만 crash owner의 process 부재와 operation id를 확인한 뒤 명시적 takeover로 lock 소유권을 바꿀 수 있다. manifest가 있으면 각 target의 old/new typed state(absent 포함)와 digest를 current와 전부 대조하고, 예상과 하나라도 다르면 자동 복구하지 않고 수동 비교를 요구한다. `upgrade --recover`는 이 공용 recovery를 호출하는 별칭이다.
- manifest 생성 전/cleanup 중 crash도 total하게 다룬다. owner phase가 `reading|preparing`이고 manifest가 없으면 mutation primitive 불변식상 첫 target 적용 전이므로 contained stage+lock만 정리한다. `reading|preparing`인데 valid manifest가 있으면 — manifest durable-ack와 owner 전이 사이의 crash — 적용 0회 불변식을 typed state로 확인한다: 모든 target이 manifest의 old state(absent 포함)·digest와 일치하면 manifest·stage·lock을 pre-commit 정리로 제거하고, 하나라도 다르면 자동 정리 없이 manual recovery로 멈춘다. `committed|rolled_back`에서 manifest가 없으면 terminal root digest를 exact 확인한 뒤 남은 stage+lock을 정리한다. `manifested|committing|rolling_back`인데 manifest가 없거나 owner record가 malformed면 안전을 추측하지 않고 manual recovery로 멈춘다.
- crash lock은 시각만 보고 자동 회수하지 않는다. PID 재사용을 owner 증거로 오인하지 않도록 operation id/command/start metadata와 실행 중 process를 함께 확인하고, 자동 판단이 불가능하면 경로·수동 확인 절차를 보여준다.
- 에이전트 스킬은 current 구조·목록·판정은 지원 CLI/library snapshot으로 받고, 지원 writer가 있는 상태를 여러 파일에 직접 손편집하지 않는다. 긴 대화 동안 원문 prose를 직접 읽어야 하면 그 read는 advisory snapshot이며 writer에 expected digest를 넘겨 lock 안에서 재검증한다. stale read로 만든 결론은 commit되지 않는다.
- editor, 다른 checkout, 공유 드라이브처럼 CLI 밖 writer와 직접 파일을 읽는 외부 프로그램은 제품 잠금 범위 밖임을 계속 명시한다. 스킬의 직접 원문 read도 transaction 중간 관찰 방지 자체를 보증하지 않으므로, supported snapshot과 commit-time digest recheck가 권한 경계다.

완전판의 목적은 새 잠금 종류를 늘리는 것이 아니라 **판단 snapshot, commit 권한, 지원 reader가 관찰하는 상태를 같은 operation 경계에 넣는 것**이다. 보증 문구도 “전원 차단에서도 항상 atomic”이 아니라 “정상·처리된 실패는 atomic, 동기화된 process-crash 중단은 감지·거부, hardware/filesystem durability는 측정한 capability 범위”로 제한한다.

## 3. 사용자 흐름

### 3.1 충돌 없는 새 사실

1. `gather`가 source와 converted material을 만든다.
2. `map`이 candidate envelope(locus proposal·normalized `as_of`/context·claim·source·location·quote와 converted/raw digests)를 만든다.
3. `map-commit` writer가 lock 안에서 current TruthStore와 다시 비교한다.
4. 충돌이 없으면 canonical truth를 추가한다. confirmation map은 건드리지 않으므로 새 truth는 계산상 unconfirmed가 된다.
5. quote/source seal과 structural writer postcondition을 통과한다.
6. generated views를 재생성하고 verification·confirmation debt를 명시적으로 연다. 이 예상 debt 때문에 canonical commit을 rollback하지 않는다.

### 3.2 같은 사실의 새 근거

1. 새 truth를 만들지 않는다.
2. `map-commit`이 exact same을 재확인하고 typed coverage support edge를 추가한다. 새 edge도 confirmation map에 없으므로 unconfirmed다.
3. canonical truth 파일, claim, ID, semantic digest는 그대로 둔다.
4. support edge가 실제로 같은 내용을 말하는지 quote digest, converted/source digest와 cold check가 확인한다.
5. 같은 edge address와 projection의 재실행은 기존 edge를 반환하고 confirmation/verification debt를 중복 생성하지 않는다.

### 3.3 충돌하는 새 주장

1. current truth는 수정하지 않는다.
2. `map-commit`이 candidate digests를 결속해 temporary conflict store에 넣는다.
3. `status --open`과 종료 보고가 양쪽 주장·source·결정해야 할 범위를 그대로 보여준다.
4. 사용자가 유지·채택·같은 사실·분리/병합·현재 없음 유지 중 하나를 선택한다.
5. resolver가 선택된 유지·갱신·support 전환·분리/병합을 한 transaction으로 적용하고, preview에서 사용자가 승인한 결과 unit의 projection을 human-confirmed baseline으로 함께 기록한다. 새/변경 unit의 cold verification debt는 별도로 남는다.
6. conflict entry와 loser candidate를 삭제한다.
7. loser claim만을 위해 생겼고 해결 중 conflict 외 공용 dependency graph inbound가 0인 conflict-candidate material은 resolve preview에 삭제 대상으로 열거하고 같은 사용자 승인으로 transaction 안에서 제거한다. 다른 material/conflict/pending decision/current fact가 참조하거나 용도를 단정할 수 없는 material은 byte 불변으로 보존하며 일반 `prune` 후보로만 보고한다.
8. structural postcondition, 새 cold-verification debt, 기존의 무관한 confirmation debt, document context staleness를 분리해 확인한다.
9. commit과 postcondition이 끝난 뒤 optional 광산 로그 한 줄을 manifest 밖에서 시도한다(§2.7 경계).

### 3.4 source 철회·삭제

source가 없어졌는데 truth를 tombstone으로 남기지 않는다.

- 삭제 전 `impact`가 current truth와 document 영향을 보여준다.
- 다른 current source로 재-ground할 수 있으면 사용자 요청을 받은 `map-commit --replace-grounding`이 source·location·quote를 원자적으로 교체하고 verification/context를 stale로 계산한다. exact-same 자료가 들어왔다는 이유만으로 primary grounding을 자동 교체하지 않는다.
- 재-ground할 수 없으면 `map-commit --remove-current <id>`가 current truth·딸린 support/ledger·document impact와 결과 absence를 preview한다. 사용자가 decision token으로 승인했을 때만 같은 transaction에서 truth를 삭제하고 deletion confirmation까지 완료한다.
- 예고 없이 source가 사라지면 dangling source로 fail-closed한다. 기계가 자동 삭제하지 않는다.
- 삭제된 ID는 재사용하지 않는다.

### 3.5 이전 값으로 되돌리기

이전 값이 Git에 있었다는 사실은 winner 근거가 아니다. 사용자가 다시 그 값을 선택하거나 새 source가 그 값을 주장하면 현재값과 같은 절차를 밟는다. 파란→초록→파란은 정상적인 두 번의 canonical 갱신이다.

## 4. 명령과 스킬의 책임 변경

| 표면 | schema v3 동작 |
|---|---|
| `gather` | source/converted 생성, source quote 규약 적용. 정정 전용 history material을 자동 만들지 않음 |
| `map` | candidate+locus를 준비하고 애매하면 질문. truth/index/conflict/allocator를 직접 손편집하지 않음 |
| `map-commit`(신설) | lock 안에서 same/new/conflict/pending-decision을 재분류하고 answer/refresh를 닫음; primary grounding 교체·current truth 삭제·absent-target reconcile(`--remove-current`, `--drop-support <s:key>`)은 decision preview/token 경로만 허용 |
| `resolve`(신설) | expected-snapshot preview/token으로 사용자 결정을 받아 canonical update+views+conflict delete+해당 human confirmation을 atomic transaction으로 적용 |
| `validate` | current truth 구조·grounding·quote seal·open conflict·pending decision·verification/confirmation·gaps/document gate 검사. 광산 로그와 릴리스 로그를 읽지 않음 |
| `pull` | usable current truth만 출력. open conflict가 덮는 truth는 값 대신 결정 필요를 표시 |
| `reindex` | current truth만 index/tree에 생성. status/successor label 없음 |
| `census` | current truth/material/coverage 수와 index 정합성만 집계. 번호 구멍·폐기 수·광산 로그 해명 제거 |
| `scope` | active current unit의 최신 digest verification만 계산. tombstone/legacy 분기 제거 |
| `status --open` | conflict, questions, Human queue, fidelity violation, Open gaps, verification/confirmation debt의 여섯 typed lane을 공통 모델에서 출력 |
| `impact` | 공용 dependency graph의 source/material→truth/support/conflict/pending-decision→document current 영향만 표시; 과거 로그는 읽지 않음 |
| `retag` | current truth와 현재 scope만 원자적으로 변경 |
| `rederive`(신설) | 공용 operator registry로 affected DAG를 preview/recompute하고 expected premise digests가 맞을 때 derived truth를 원자적으로 갱신; 계산 불능 dependent는 `삭제|이송` 처분 token으로만 정리(변경 취소 없음) |
| `attest` | active current verification unit만 cold-검증하고 최신 row를 교체 |
| `confirm-current`(신설) | 사용자 확인을 expected current digest/absence에 결속하고 confirmation map을 원자적으로 교체; cold verification과 순서 독립 |
| `prune`(신설) | unreferenced/correction-only material의 current 영향 preview/token 뒤 사용자 승인 범위만 원자적으로 삭제하고 해당 deletion confirmation까지 완료; absent-target reconcile은 inbound reference 0일 때만 orphan row 정리를 허용 |
| `upgrade` | v2→v3 preflight/migration/rollback/postcondition 담당 |
| `recover`(신설) | durable transaction manifest를 inspect하고 exact digest가 맞을 때만 rollback 또는 complete; 일반 명령의 incomplete-state 우회 수단이 아님 |
| `gaps-disposition`(신설) | expected register/context+decision token으로 stale Accepted를 re-accept/reopen하거나 실제 fill 뒤 제거; history를 쓰지 않음 |
| `report`(신설 helper) | skill start/progress/finish structured result의 필수 field·실측 count/list를 검사하고 project language로 렌더 |
| `gaps` skill | canonical coverage에 맞춰 이식. truth/material 직접 작성 금지 유지 |
| `verify` skill | current unit과 `confirmations.json`의 차이를 렌더하고 cold verification·사용자 확인·attest·confirm-current를 조율. 광산 로그를 delta source로 읽지 않음 |
| `review/refine` | 현재 문서 loop 상태와 fidelity gate 유지. truth conflict history를 읽지 않음 |

## 5. source → converted 봉인 연장

### 5.1 보증 범위

현재 `SEAL-QUOTE-MISSING`은 truth body가 `converted.md`에 실제로 있는지를 검사한다. 새 보증은 그 앞 홉을 추가한다.

```text
raw/text source ──> converted.md의 축자 인용 ──> truth body
       새 seal                기존 seal
```

전체 변환이 byte-identical하다고 주장하지 않는다. PDF·이미지 OCR, 표 변환, 정상적인 문단 정리는 의미 검증이 필요하다. 기계 보증은 **축자라고 표시한 span**에 한정한다.

### 5.2 축자와 요약을 분리한다

FORMATS에 하나의 machine-readable quote marker를 정의한다. 기본 형식은 인용 블록 바로 앞의 HTML marker다.

```markdown
<!-- wd:quote source=self location="§4" mode=verbatim -->
> 실제로 복사한 문장
```

- `source=self`는 현재 material 아래의 regular raw text `source.*`를 뜻하며 정상적인 자기 material 귀속이다. target에 raw source가 하나면 그 파일로, 여럿이면 필수 `file=` 상대경로로 직접 resolve한다.
- `source=mNNN`은 명시 귀속된 다른 material의 **regular raw text `source.*`**를 뜻한다. 이것도 해당 material의 raw-source root에서 직접 끝나며 marker를 따라 전이하지 않는다.
- `source=tNNN`은 허용하지 않는다. truth가 material을 증명하고 material이 다시 truth를 증명하는 순환 세탁을 만들 수 있기 때문이다. truth를 인용하려면 그 truth의 raw material source를 직접 지정한다.
- target material에 raw source가 여럿이면 marker가 `file=`로 정확한 `source.*` 상대 경로를 지정한다.
- marker가 붙은 span은 기존 quote seal의 byte-domain 비교 규칙으로 검증한다.
- `mode=verbatim`은 text source와 exact byte-domain match를 요구한다. `mode=not-checkable`은 resolver가 실제 binary/non-text로 판정한 source에만 허용하고 exact source/file 지정, 필수 `location` 표기(기계 검사 입력이 아니라 사람용 귀속이며 cold review 대상 — §15), current cold-fidelity row, human confirmation을 요구한다. text mismatch를 not-checkable로 낮출 수 없다.
- resolver는 언제나 material의 raw-source root 안 regular `source.*`에서 끝난다. `converted.md`, truth, 다른 marker, root 밖 경로, symlink/alias로 converted나 marker 자신에게 돌아오는 경로는 evidence root가 아니며 fail-closed한다. 따라서 금지 대상은 유효한 `source=self`나 direct material dependency cycle이 아니라 **converted-as-source·path escape·symlink alias·transitive marker chase**다.
- source를 읽을 수 없거나 span이 없으면 fail-closed한다.
- 이 계약의 모집단은 `converted.md`와 machine-authored material 기록이다: 그 안의 모든 machine-authored blockquote는 marker가 필요하다. truth body 인용은 기존 truth quote seal이 담당하므로 이 marker의 대상이 아니다. `[machine-note]` 안의 inline quote-shaped span(따옴표·낫표·code span)은 금지하고 marked quote block으로 옮긴다. marker를 빼서 검사 모집단에서 사라지는 경로도 차단한다.
- binary source라 기계 비교가 불가능하면 byte/content 판독 결과로 typed `not mechanically checkable`을 만들고 cold fidelity 검사를 요구한다. 확장자만으로 text/binary를 결정하지 않으며 통과한 것처럼 표현하지 않는다.
- binary/not-checkable material의 출하 경로는 raw-source tree+converted projection digest에 결속된 current cold-verification row와 human confirmation이 둘 다 있을 때뿐이다. 출력은 `cold verified`라고 말하고 `mechanically sealed`라고 말하지 않는다.
- 요약과 해석에는 marker와 축자 인용 표기를 쓰지 않는다.
- `[machine-note]`가 다른 기록을 정당화하는 자유형 “검증 대비” 주석을 만들지 않도록 gather/map 규격을 닫는다. 질문 문면, 선택지, 사용자 선택, 필요한 normalization만 기록한다.

정확한 marker 문법과 read-only scanner는 Phase 1 red-first fixture로 고정한다. Phase 4는 그 parser를 writer·migration·seal gate에 연결한다. 핵심은 “축자 주장만 기계적으로 판정하고, 요약은 축자처럼 쓰지 않는다”는 경계다.

### 5.3 digest 범위

- material verification digest에 자체 raw `source.*` tree, `converted.md`, 각 `source=mNNN` marker의 normalized address+direct provider raw-tree digest를 함께 포함한다. source tree manifest는 정렬된 상대경로+NUL+raw digest로 고정하고 regular file만 허용하며 symlink를 거부한다.
- cited material의 자체 raw source와 실제 인용 marker가 의존하는 direct provider raw-tree digest를 document review context에도 포함한다.
- source byte가 바뀌면 verification과 관련 document seal이 stale해진다.
- source seal 읽기 실패는 부재로 처리하지 않는다.

### 5.4 영구 do-not-write 장부는 만들지 않는다

과거 실패 문구를 계속 쌓는 생산자 history 목록 대신 다음으로 막는다.

- 고정된 작성 규약
- explicit quote marker
- source seal
- writer가 candidate를 재파싱하는 postcondition
- cold semantic verification

새 예외 문구나 rejected-text digest를 누적하지 않는다.

## 6. 사람이 이해하는 출력

### 6.1 CLI 출력 구조

명령은 먼저 language-neutral structured result와 stable diagnostic code를 만든다. renderer가 `config.language`에 맞는 문장을 출력한다.

- human output: `ko`, `en` message catalog 사용
- JSON output: key와 code가 언어에 따라 바뀌지 않음
- path, id, enum 원문은 보존하되 바로 옆에 쉬운 설명을 붙임
- 설정을 읽기 전 명령은 locale 또는 명시된 fallback 규칙을 사용
- 수치와 waiting item은 공통 모델 결과를 렌더하며 대화 기억으로 다시 세지 않음
- `digest-bound`, `legacy-unbound`, `tombstone`처럼 내부 구현어를 사용자 기본 출력에서 제거

최종 완료 조건은 `status`, `scope`, `census`, `gaps`, `pull`, `validate`, mutation command 성공·실패 문구까지 모든 사용자 대면 출력이 언어 설정을 따르는 것이다.

### 6.2 통용어와 기계 조어 금지

- 원본에 없는 명칭을 title, summary, claim, tag에 기계가 만들어 넣지 않는다.
- 이름이 필요하면 원본 표현을 쓰고 평이한 설명을 덧붙인다.
- machine-origin proposal은 채택 전 데이터에 들어가지 않는다.
- 채택되면 `provenance: adopted`와 사용자 확인 근거를 유지한다.
- 표기법이 대상 종류를 오독하게 만들면 스타일 문제가 아니라 의미 문제로 검토한다.
- machine-authored ledger/summary의 주 항목 한 줄은 Unicode code point 300자를 넘기지 않는다. 넘으면 판단 요약과 detail continuation으로 나눈다. 원문·축자 인용·사용자 입력·path/digest/code는 예외다.
- 지원 writer는 위 300자 계약을 postcondition으로 검사하고, `validate`는 작성 주체를 알 수 없는 손편집 파일에는 비차단 warning만 낸다.
- source/user에 없는 조어·번역·오독 표기는 기계 문자열 규칙으로 추측하지 않는다. truth 단계 T1/T5와 document review fidelity lens가 should-fix 이상으로 잡고, 실제 소설·보고서 fixture에서 잘못된 대상 종류/이름을 주입해 검증한다.

### 6.3 스킬 공통 시작·진행·종료 계약

공통 규약 파일과 machine-readable `interaction-result` schema/renderer를 하나 만들고 현재 core 9개 스킬이 반드시 사용하도록 한다. 각 스킬에 템플릿을 복제하거나 자유 문장만 요구하지 않는다. `weavedoc report start|progress|finish` 또는 동등한 helper가 project language로 렌더하고 필수 field, count/list equality, command result code를 검사한다. `doccheck`는 설치 roster의 참조와 호출 위치를 검사한다. Phase 8에서 `weavedoc-enrich`가 추가되면 같은 규약을 쓰는 열 번째 스킬이 된다.

시작 메시지는 다음을 포함한다.

- 지금 시작하는 일
- 대상과 실제 건수
- 왜 필요한지
- 바꿀 수 있는 범위
- 건드리지 않을 것
- 예상 검사·라운드
- 사용자 결정이 당장 필요한지

긴 작업의 진행 메시지는 완료한 것, 다음 것, 막힘을 같은 언어로 짧게 말한다.

종료 메시지는 다음을 포함한다.

- 통과·미통과·부분 결과와 쉬운 설명
- 실제로 바꾼 파일과 이유
- 일부러 바꾸지 않은 것과 이유
- 실행한 검증과 실제 수치
- 사용자가 정할 항목; 없으면 `없음`
- 가능한 다음 단계와 그것이 선택인지 필수인지
- `status --open`이 반환한 모든 대기 항목의 내용

바뀐 것이 없어도 시작·종료 메시지는 생략하지 않는다.

helper 입력은 임의의 성공 문구가 아니라 supported command의 structured result와 status snapshot이다. target/예상 범위처럼 에이전트만 아는 값은 typed input으로 받되, 실제 처리 수·검증 rc·waiting identity는 runtime 결과에서 가져온다. 필수 field 누락, 보고 수치와 result 불일치, waiting count/list 불일치는 renderer가 거부한다. 자연어 설명의 진실성 전체를 기계가 인증한다고 주장하지 않으며 실제 skill fixture와 cold review가 오분류·과장을 검사한다.

## 7. parser/state 리팩터링과의 관계

현재 미발행 리팩터링의 다음 계층은 그대로 보존한다.

```text
markdown-scan
    → ledger-structure
        → artifact typed adapter
            → validate / status / writer
```

새 구현 규칙은 다음과 같다.

- truth에는 `truth-model` adapter를 하나 추가한다.
- gaps A는 기존 `parseGapText`와 typed register를 계속 사용한다.
- conflict는 JSON machine state로 두어 새 Markdown 예외 문법을 만들지 않는다.
- 소비자는 parser/model 결과를 선택할 뿐 자체 정규식을 만들지 않는다.
- writer는 source offset 또는 structured state를 쓰고 fresh parse/read로 postcondition을 증명한다.
- 새 문법은 예제 몇 개가 아니라 context×EOL×slot×body×continuation 조합 속성 테스트로 추가한다.

현재 parser refactor는 별도 green checkpoint로 먼저 커밋한다. schema v3 변경과 섞지 않아 회귀 원인을 분리한다.

### 7.1 남은 recognition↔role 경계 완결

고정된 model은 line/slot/body/hierarchy 상태를 typed하게 만들었지만 다음 semantic role은 아직 consumer에 고정돼 있다.

- Human queue의 `open`=대기, `ruled`=닫힘
- ownership의 `user-only`·`recommended`·`machine` 세 역할
- questions의 `open`·`proposed`·`answered` 역할
- `verify.sections`와 `review.sections`의 각 위치 역할
- `Human queue`라는 literal heading을 찾는 일부 reader

이 상태에서는 schema가 단어를 “인식”해도 status·validate·writer가 그 단어의 역할을 다르게 해석할 수 있다. v3는 enum 목록을 더 늘리지 않고 explicit role key로 바꾼다.

```text
humanqueue.state.waiting: open
humanqueue.state.closed: ruled
humanqueue.ownership.user: user-only
humanqueue.ownership.recommended: recommended
humanqueue.ownership.machine: machine
questions.state.waiting: open
questions.state.proposed: proposed
questions.state.closed: answered
verify.section.units: Verified units
verify.section.human_queue: Human queue
verify.section.adjudications: Adjudications
verify.verdict.covered: verified
review.section.violations: Fidelity violations
review.section.findings: Findings
review.section.adjudications: Adjudications
review.section.human_queue: Human queue
gaps.section.open: Open
gaps.section.accepted: Accepted
```

정확한 key spelling은 Phase 1 fixture로 고정한다. 중요한 계약은 다음이다.

- `artifact-contracts` loader 하나가 role→token을 만들고 유효성·distinctness를 한 번 검사한다.
- parser는 lexical token과 source offset을, adapter는 semantic role을, policy consumer는 차단/표시 행동을 맡는다.
- status·validate·writer·doccheck는 각자 enum을 split하거나 literal English heading을 찾지 않는다.
- artifact token은 format의 고정 어휘이고 CLI 번역 표면이 아니다. 사용자 메시지만 renderer가 번역한다.
- invalid/missing/duplicate role contract는 영향을 받는 model 전체를 fail-closed하고 later member를 앞 역할로 shift하지 않는다.
- v2 adapter는 기존 positional/fixed vocabulary와 현재 end-to-end `gaps.sections` positional contract를 같은 typed role object로 번역한다. v3는 gaps 두 section도 explicit role key로 옮기되 `gaps.enum.kind`는 역할 순서가 아닌 distinct membership set으로 유지한다.
- 일반 consumer의 v2 branch 제거는 광산별 artifact flip이 아니라 §10.1 지원 수명표의 "v2 일반 명령 지원 종료 릴리스"에 속하는 코드 전역 변경이다. 그 전까지 v3 runtime은 v2 광산의 일반 명령을 계속 지원하며, `upgrade --check/--apply`용 isolated v2 reader는 수명표의 migrator 보존 종료 릴리스까지 유지한다.
- v3 `review.md`는 네 역할 절을 모두 요구한다. migration은 누락된 빈 절을 추가하되 seal을 재발행하지 않고 review debt를 남긴다.

이 작업은 예외 케이스 추가가 아니라 “한 토큰의 의미를 한 곳에서 정한다”는 구조 완결이다.

## 8. 기존 gaps A 이식

### 8.1 유지할 것

- `declared`, `reference`, `enumeration`, `symmetry`
- `gaps.md`의 `Open` / `Accepted`
- fill-or-accept
- `fidelity.completeness: off | required`
- fill은 사용자 답변 또는 자료를 거쳐 `gather → map`
- gaps는 truth와 material을 직접 만들지 않음
- 기본은 plan 비차단; 사용자가 `required`를 선택했을 때만 최종 출하 차단
- `status --open`, `validate`, `weavedoc gaps`가 같은 typed register를 사용
- 최초 명시 실행에서만 묻는 `gap_density: minimal | dense` 현재 선호

history/status/resolution에 직접 의존하는 규칙만 교체한다. 기존 gaps의 고정밀 reference 필터, symmetry 3/4 문턱, declared prose-noise triage, 개념 dedup, 부재의 세 의미 구분, count/grep 근거 요구, required_tags 연결, no-fabrication, 순차 질문·disposition, 제외 후보와 제외 이유 보고는 별도 결정 없이는 바꾸지 않는다.

초기 A 제안서의 “`required`면 plan 진입 자체 차단”은 현재 제품 결정으로 supersede한다. gaps를 채울 문서 계획조차 시작하지 못하는 순환을 피하기 위해 plan은 항상 열어두고, `required`의 강제점은 final/consecrate 직전 completeness gate다. `off`는 표면화만 한다.

### 8.2 제거할 old-state 의존

- `live = not discarded/retracted`
- resolution winner를 따라 coverage를 인정하는 처리
- tombstone이나 과거 truth를 읽는 처리
- 광산 로그의 `removed:`를 판정에 쓰는 처리

새 판정은 current canonical truth만 coverage로 인정한다.

- conflict candidate는 coverage가 아니다.
- 같은 개념이 open conflict에 있으면 별도 gap을 중복 생성하지 않고 `conflict가 먼저`라고 표시한다.
- conflict는 기존 Open entry를 닫거나 Accepted로 옮기지 않는다. conflict 해소 결과로 canonical truth가 실제 빈칸을 채웠을 때만 Open을 제거한다.
- gap과 conflict 사이에 영구 linkage나 새 `blocked` 상태를 만들지 않는다.
- conflict가 해결되면 선택된 current truth만 다음 scan에 반영한다.
- 과거 loser가 광산에 없으므로 제외 필터도 필요 없다.

### 8.3 Accepted의 의미

Accepted는 감사 이력이 아니라 현재 waiver다.

- “이 빈칸은 현재 의도적이다”라는 사용자 결정
- canonical truth로 채워지면 entry 삭제
- canonical truth가 실제 gap을 채우면 entry를 삭제한다. gap의 정의 대상 자체가 current project/schema에서 사라져 entry identity가 더는 성립하지 않는 경우도 공용 completeness model이 삭제 대상으로 판정한다.
- v3 Accepted는 machine-resolvable `scope`와 그 scope의 current completeness/semantic projection을 묶은 `acceptance_context_digest`를 필수로 가진다. stable ID 목록이나 날짜만으로 현재성을 주장하지 않는다.
- `scope`는 current locus/tag/query와 resolved truth ids/digests를 공용 completeness API로 계산한다. scope를 lossless하게 resolve할 수 없는 legacy Accepted는 migration manual queue이며 임의의 whole-mine waiver로 넓히지 않는다.
- gap identity는 여전히 성립하지만 scoped truth/locus/project completeness input이 변경·삭제되어 digest가 어긋나면 Accepted는 자동으로 효력을 잃고 `ACCEPTANCE-STALE`가 된다. entry를 조용히 삭제/Open 이동하지는 않지만 `required` final/consecrate gate를 더는 통과시키지 못하며 `status --open`과 gaps 종료 보고에 대기 항목으로 보인다.
- `recheck`는 사람이 이해하는 현재 조건으로 유지한다. 기계가 문장의 의미 충족을 추측하지 않으며, 명시적 gaps 실행이 stale/context와 recheck를 보여주고 사용자에게 `re-accept | reopen | fill`을 묻는다.
- 공용 `gaps-disposition` writer는 expected register/context preview와 decision token을 받아 re-accept면 digest/recheck를 현재값으로 교체하고, reopen이면 같은 entry identity를 Accepted에서 Open으로 원자 이동한다. fill 선택도 먼저 같은 entry를 Open으로 옮겨 required gate를 차단한 뒤 `user-answer → gather → map`으로 넘기며, canonical coverage가 실제 생긴 transaction만 Open entry를 제거한다.
- 기존 `as-of` 필드는 제거한다. `acceptance_context_digest`는 과거 snapshot이나 waiver history가 아니라 현재 효력 결속 하나이며 re-accept 때 제자리 교체되고 이전 digest는 Git에만 남는다.
- 광산 로그나 tombstone으로 옮기지 않음

runtime은 Open/Accepted 구조, context freshness, required gate를 기계 판정한다. 의미적 recheck와 disposition 선택은 명시 호출된 gaps skill과 사용자가 맡는다.

## 9. 선택적 enrichment B

### 9.1 위치와 가치

B는 아직 구현되지 않았다. A가 “명백히 비어 있는가”를 묻는다면 B는 “현재 내용이 틀리지는 않지만 어디를 보강하면 더 좋아지는가”를 묻는다.

소설·세계관에서는 다음을 찾는다.

- 인물·시기·집단 사이의 질적 불균형
- 설정은 있으나 사건·관계에 연결되지 않은 요소
- 반복 등장하지만 서사적 역할이 약한 장소·인물·장치
- 한 인물만 욕망·제약·변화가 깊고 동료는 신상 정보만 있는 상태

보고서·업무 문서 광산에서는 다음을 찾는다.

- 목표에 비해 근거가 얕은 주제
- 특정 이해관계자·시기·비교축만 빈약한 상태
- 여러 문서에서 재사용 가치가 큰 보강 후보

### 9.2 MVP 권한

가칭 `weavedoc-enrich`는 다음 경계를 지킨다.

- 사용자가 `enrich`, `보강점`, `더 풍부하게`처럼 명시적으로 요청할 때만 실행
- 읽기 전용
- nonblocking
- `validate`, `status`, completeness, consecrate와 연결하지 않음
- truth, material, conflict, gaps, questions, 광산 로그를 수정하지 않음
- 기본 출력은 대화이며 `suggestions.md`를 만들지 않음
- 관찰, 재현 가능한 근거, 선택적 제안, 예상 효과, 확신도를 구분
- 존재하는 전제는 canonical truth id로, 부재·불균형은 current query/count와 비교 집합으로, 품질 방향은 `project.md` 목표 또는 이번 호출에서 사용자가 지정한 축으로 근거를 댄다.
- 근거 있는 보강점이 없으면 `제안 없음`이 정상 성공이다.
- unresolved conflict에 의존하는 제안은 확정하지 않고 보류
- 거절 digest나 suppression register를 만들지 않음

사용자가 제안을 채택한 뒤에만 다음 경로로 보낸다.

- 광산의 새 사실·설정 → `user-answer → gather → map`
- 문서 구성 아이디어 → `plan`
- 추가 결정 필요 → 사용자 질문

B 실행 중 사용자가 제안을 마음에 들어 해도 B가 즉시 truth나 question을 쓰지 않는다. 적용 요청을 별도 행동으로 확인한 뒤 정식 스킬로 넘긴다.

### 9.3 A와 공유하는 것

A와 B는 current TruthStore 조회와 tag/entity scan을 공유할 수 있다. 하지만 판정·권한·출력은 분리한다.

- A: defensible gap, optional/required completeness 정책
- B: qualitative opportunity, 언제나 선택

B를 A나 validate에 합치지 않는다. B는 v3 core와 A 이식이 끝난 뒤 별도 후속 commit으로 추가한다.

## 10. v2 → v3 migration

### 10.1 원칙

- schema 변경과 migrator를 같은 release에 포함한다.
- 중간 schema 상태를 공개하지 않는다.
- v3 runtime bundle은 versioned contract를 함께 싣고 project/config의 artifact version으로 reader를 고른다. **v2 계약의 정본은 기존 `.weavedoc/schema` 한 장이고 `schemas/v3`만 그 옆에 추가한다**(구현 2026-08-08.3 — v2를 `schemas/v2`로 복제하면 같은 계약의 사본이 둘이 돼 표류한다; 설치된 광산도 깨지지 않는다). 어느 version이 어느 파일·adapter로 가는지는 floor 비교가 아니라 명시 표다. runtime max version과 mine artifact version을 한 값으로 취급하지 않는다.
- `project.md`와 `config.yaml`의 artifact version은 의도적으로 중복된 agreement field다. 둘 다 있어야 하고 같은 지원 version이어야 한다. missing·불일치·runtime-max 초과는 모든 일반 명령에서 `VERSION-MISMATCH`로 fail-closed하며 한쪽을 임의 권위로 선택하지 않는다.
- version 협상은 아래로도 total하다. 지원 하한 미만(v1)은 future와 뭉뚱그리지 않고 별도 진단으로 fail-closed하며, 고정 bridge runtime — v0.5.21(commit `0257167`) — 으로 v1→v2 upgrade를 먼저 수행하라고 안내한다. v3 출하 시점에 더 나중의 v2-max 릴리스가 있으면 UPGRADING.md의 bridge 표기만 그것으로 교체한다. v3 runtime bundle은 v1 reader를 싣지 않는다(디딤돌 방식). 근거: 알려진 실광산은 v2다(테스트베드 실측 `version: 2`). Phase 7 preflight의 실광산 census에서 v1 광산이 나오면 그때 v1→v2→v3 합성 transaction을 재론하되, 어느 방식이든 중간 version 상태를 commit하지 않는 원칙은 같다.
- v2 지원 수명은 릴리스 단위로 고정한다: ① 최초 v3 릴리스 — 일반 명령의 v2/v3 병행 + migrator, ② v2 일반 명령 지원 종료 릴리스 — 일반 consumer v2 branch 제거, isolated migrator만 잔존, ③ migrator 보존 종료 릴리스 — v2→v3 upgrade 경로 제거. ②·③의 구체 버전은 v3 출하 시 UPGRADING.md 지원 수명표에 명시한다. 이 계획의 구현 범위는 ①이다.
- init은 v3 contract와 template로 새 광산을 만들고, upgrade는 bundled v2 reader로 기존 광산을 읽어 v3 writer로 변환한다.
- migration transaction의 마지막 논리 단계는 mine의 `project.md`와 `config.yaml` artifact version을 함께 v3로 flip하는 것이다. 두 파일을 모두 stage하고 operation lock 안에서 process-crash-durable transaction manifest의 target version을 내부 authority로 사용한다. 두 번째 rename의 처리 가능한 실패는 둘 다 v2로 rollback하고, SIGKILL로 한쪽만 바뀌면 일반 명령은 `TRANSACTION-INCOMPLETE`/`VERSION-MISMATCH`로 거부한다. `upgrade --recover`만 manifest를 읽어 exact rollback/complete를 수행할 수 있다. 설치된 runtime/schema/templates/FORMATS를 upgrade가 자기 손으로 다시 쓰지 않는다.
- review context는 aggregate runtime 파일 전체가 아니라 **해당 광산이 선택한 versioned artifact contract bytes**를 결속한다. runtime update만으로 v2 seal이 stale해지지 않고, v2→v3 flip은 정당하게 stale을 만든다.
- preflight, dry-run report, Git checkpoint 또는 백업, atomic apply, post-validate를 모두 갖춘다.
- migration은 기존에 기록된 명시적 사용자 결정을 번역할 수는 있지만 새로운 winner를 선택할 수 없다.
- **결정 모호성**과 **변환 모호성**을 구분한다. parties·source·range·locus를 v3 conflict payload로 손실 없이 옮길 수 있지만 winner만 미정인 항목은 open conflict/Human queue로 이식하고 apply는 진행한다. 일반 validate와 출하는 사용자 결정 전까지 차단된다. 반대로 candidate 경계·source·scope·locus를 v3에 손실 없이 표현할 수 없는 변환 모호성은 dry-run manual queue에 올리고 apply를 중단한다.
- migration이 기존 review seal을 자동 재발행하지 않는다.
- v2 광산 로그는 current semantic projection이나 digest를 결속하지 않으므로 confirmation map을 소급 seed할 수 없다. migration은 모든 active unit을 안전하게 unconfirmed로 두고, 첫 v3 verify가 current snapshot 전체를 보여준 뒤 사용자가 한 번 확인하게 한다. 과거 `confirmed:`는 사람용 기록으로만 남는다.

선택된 artifact contract가 v2에서 v3로 바뀌면 기존 document review context는 정당하게 stale해진다. 모든 active unit도 정상적인 확인 debt가 된다. lossless ambiguity와 새 source/gaps 계약 역시 의도된 open work를 만들 수 있으므로 migration postcheck를 다음 층으로 나눈다.

1. **structural/data**: 새 truth/material/state, version agreement, reference graph가 v3에서 깨끗해야 함. 이 층의 오류는 apply 실패/rollback이다.
2. **current decision**: lossless open conflict와 모든 tagged pending decision(locus/grounding/derivation/support/conversion/quote)을 dry-run identity와 정확히 같은 목록으로 열거
3. **fidelity/calculation**: 결정이 끝난 unit의 source-marker/binary cold verification·derived recompute debt를 예상 unit과 정확히 같은 목록으로 열거
4. **document**: schema/source 변경으로 생긴 `review required` debt를 열거하고 consecration 차단
5. **human confirmation**: 모든 migrated active unit을 unconfirmed로 열거하고 첫 v3 current-snapshot 확인 전 출하 차단
6. **completeness waiver**: migrated null-context Accepted와 re-accept/reopen debt를 열거하고 required gate 차단

`upgrade --apply`는 1이 통과하고 2–6의 실제 identity/code 집합이 dry-run에서 승인한 **expected migration debt manifest**와 정확히 같을 때 migration 적용 성공으로 보고한다. expected가 아닌 debt, 누락 debt, 개수 불일치는 rollback한다. 성공 메시지도 `migration applied; not yet shippable`과 층별 남은 일을 보여준다. 일반 `validate`와 `status --open`은 실제 resolve·cold verify/rederive·re-review·confirmation·gaps disposition 전까지 이를 계속 nonzero로 보여준다. migration이 seal, attestation, confirmation, Accepted digest를 추측해 green으로 바꾸지 않는다.

### 10.2 자동 변환 가능한 항목

truth 분류는 아래 우선순위로 total하다. 분류의 입력은 구조적으로 유효한 v2 truth뿐이다 — malformed frontmatter·enum 밖 status·판독 불가 파일은 분류에 들어가지 않고 structural preflight가 apply를 중단한다. 한 truth는 처음 맞는 축 하나로만 배치되고, 뒤 축의 조건과 겹쳐도 다시 분류하지 않는다.

1. `retracted` → active 제거
2. 조건을 충족한 완전 `discarded` loser → 삭제
3. open `conflict`와 §10.3의 resolution 기반 manual queue 항목 → conflict component/manual queue. candidate payload는 `provenance: derived`·`derived_from`·`assumptions` 메타를 보존하고, derived-origin candidate의 채택은 canonical로 직행하지 않고 항상 `derivation-required` entry를 경유한다 — ordinary adopted 확정도 그 entry의 `grounded ordinary remap` 답변으로만 이뤄진다
4. `provenance: derived`인 남은 `ok`/`unsupported` → `derivation-required` pending decision(§10.3)
5. non-derived `unsupported` → `grounding-required` pending decision
6. 남은 non-derived `status: ok` → 아래 자동 변환. 자동 변환 조건(명백한 locus·grounded label)을 만족하지 못하면 §10.3 규칙대로 locus/label pending decision으로, lossless 표현이 불가능하면 apply 중단으로 배치돼 분류에 빈칸이 없다

- conflict/resolution 이력 없는 non-derived `status: ok` truth → source/user 표현으로 subject·relation을 그대로 label할 수 있고 다른 truth와 겹치지 않아 locus가 명백할 때 같은 truth id 유지 + 새 `lNNN` 할당
- `decided_by: user`이며 사용자가 **그 fact value 자체를** 고른 `pick`/`value` resolution → non-derived winner에 한해 일관성과 locus를 확인한 뒤 winner 유지; derived winner는 우선순위 4를 따라 `derivation-required`로 이식
- 위 조건을 만족하는 완전 `discarded` loser → 삭제하고 winner의 resolution/superseded 제거
- `retracted` truth → active set에서 제거
- non-derived `unsupported` truth → canonical로 이식하지 않고 original id·claim/body·available source candidates·document impact를 `grounding-required` pending decision에 lossless하게 이동; 사용자가 re-ground 또는 remove를 고를 때까지 차단. derived `unsupported`는 우선순위 4의 `derivation-required`가 첫 축이다(§2.3.2)
- material `corrects` → 제거하되 material이 current source로 필요한지는 별도 확인
- material `status: verified` → status 자체는 제거; current v2 ledger row의 covered byte set+algorithm+projection이 v3 unit과 exact-equivalent일 때만 verified row로 변환하고 status 단독으로 attestation을 만들지 않음
- material `status: used` → status 제거; 사용 여부는 current truth/support/document reference graph에서 다시 계산하며 verification으로 해석하지 않음
- material `status: collected | converted` → status 제거; valid `converted.md`가 있으면 active unverified material, 없으면 raw material을 보존한 `conversion-required` fidelity/Human queue로 이식. `converted.md`가 존재하는데 unreadable/malformed면 빈 상태나 conversion-required로 흡수하지 않고 structural 오류로 apply를 중단한다 — present-but-unreadable 입력은 migration을 거부한다는 기존 upgrade 규칙 그대로
- material `status: retracted` → current/open reference가 0이면 material을 active set에서 제거; inbound reference가 있으면 dependent truth/support/document의 re-ground/remove 결정 없이는 apply 중단하고 status만 strip해 active로 세탁하지 않음
- project `authority` → 제거; roles는 유지하되 기존 authority가 결정한 truth는 §10.3 manual queue
- config `conflicts.detection`(standard|deep) → 검출 강도 설정으로 유지. `conflicts.attribution`(ask|allow) → 제거; v3의 모든 conflict 해소는 per-conflict decision preview/token을 요구하므로 상시(standing) 병기 승인은 성립하지 않고, `allow`였다는 사실이 자동 attribute 권한으로 승계되지 않는다. `allow` 아래에서 이미 성립한 v2 attribute resolution의 처분은 §10.3을 따른다
- 살아남은 unit의 verification ledger → latest valid row 중 v3 projection과 exact-equivalent인 것만 current row로 compact; 나머지는 cold debt이며 `legacy-unbound`/status 면제를 만들지 않음
- v2 `corroborated_by` 각 항목 → primary source와 같으면 redundant로 제거; 별도 material의 exact single `(truth id, material id, normalized location)`와 quote/raw evidence가 v2 coverage에서 resolve되면 unverified/unconfirmed typed support edge로 변환
- `corroborated_by` material/location/evidence가 missing·ambiguous하면 필드를 조용히 버리거나 verified edge로 세탁하지 않고 original relation+candidate addresses를 `support-grounding-required` pending decision에 이식
- legacy Accepted의 scope를 lossless하게 resolve할 수 있으면 같은 entry를 `acceptance_context_digest: null`인 stale waiver로 이식해 사용자 re-accept 전 required gate 차단; scope 자체가 모호하면 apply 중단
- index/tree/catalog → 새 schema에서 전부 재생성
- 삭제 번호 구멍 → 정상으로 인정

### 10.3 자동 current로 확정하면 안 되는 항목

아래 항목을 곧바로 v3 canonical winner로 세탁하지 않는다. 각 party의 claim·source·normalized range·locus가 명백해 conflict component나 stale document로 **손실 없이 표현 가능하면** 그 상태로 이식하고 migration 자체는 완료한다. 목록의 의미 경계가 free-form이라 candidate를 나눌 수 없거나 source/locus를 복원할 수 없으면 apply를 중단한다.

- `decided_by: machine` resolution과 그 winner → parties가 명백하면 open conflict
- `authority`/`supersedes`처럼 사용자 fact 선택이 아니라 기계 규칙이 winner를 정한 resolution → parties가 명백하면 open conflict
- context 분리 없이 양쪽을 살린 `attribute` resolution → 범위를 typed하게 복원할 수 있으면 multi-target conflict, 아니면 apply 중단
- `resolution.scope` 부분 승계 → exact scope를 candidate별 normalized range로 옮길 수 있으면 multi-target conflict, free-form/겹침 손실이면 apply 중단
- 아직 열린 conflict → §10.4의 conflict component로 이식
- winner/loser가 일관되지 않은 resolution → parties가 보존돼 있으면 winner 없는 conflict, party 자체가 유실됐으면 apply 중단
- loser를 인용한 문서의 부분 범위 citation → citation을 추측하지 않고 document stale
- source가 없거나 quote가 맞지 않는 current 후보 → grounded candidate를 구성할 수 없으면 apply 중단
- §10.2 우선순위에서 삭제·conflict 축으로 먼저 배치되지 않은 모든 v2 derived truth → 자동 변환·재계산 없이 original id·claim/body·premises·documents를 `derivation-required` pending decision에 lossless하게 이식; payload 경계를 보존할 수 없으면 apply 중단. v2 계약에는 recipe 문법이 없으므로(정의된 필드는 `derived_from`·`assumptions`뿐) 사설 키가 물리적으로 있어도 "machine-readable recipe"의 exact lossless 판정 기준이 존재하지 않는다 — 추측 변환 분기를 두지 않는다
- 하나의 correction material이 current truth와 obsolete claim을 함께 담은 경우의 자동 GC → material byte를 보존하고 prune 제외
- locus를 한 개로 정할 수 없거나 여러 기존 truth가 같은 locus 후보가 되는 경우 → full candidate와 finite grounded locus set을 보존할 수 있으면 pending decision으로 이식, candidate 경계를 잃으면 apply 중단
- locus label에 번역·로마자화·새 분류어가 필요하거나 grounded 표현 없이 기계가 이름을 만들어야 하는 경우 → full candidate를 보존할 수 있으면 user-label pending decision, 그렇지 않으면 apply 중단

이 항목들은 dry-run에 양쪽 source, 영향 truth/document, 필요한 사용자 결정을 함께 보여준다. malformed·고아·current와 불일치한 광산 로그 기록은 winner migration을 막는 근거로 쓰지 않고 해당 current unit을 unconfirmed로 남긴다. 닫힌 과거 광산 로그 block은 v3 상태로 복사하지 않고 파일 자체만 사람용 기록으로 남긴다. migration이 끝난 뒤 runtime과 skill은 이 파일을 verification delta source로 다시 읽지 않는다.

`status: ok`라는 이유만으로 current를 확정하지 않는다. v2의 machine winner가 resolution 필드만 벗고 v3 canonical로 세탁되지 않도록, machine/authority/date 기반 winner는 current와 candidate를 함께 manual conflict queue에 올린다.

### 10.4 open conflict migration

기계가 winner를 선택하지 않는다.

- existing conflict parties를 candidate records로 임시 conflict store에 옮긴다.
- 마지막으로 확정된 canonical이 명백한 경우에만 그것을 current로 유지한다.
- 확정 current가 없으면 해당 locus는 pending으로 두고 소비를 차단한다.
- 사용자 해소 후 선택된 current 의미에 필요한 canonical id(0개 이상)를 정하고 나머지 candidate를 삭제한다. `targets=[]`에서 사용자가 모든 후보를 기각하면 canonical 0개가 정상 결과다. derived-origin candidate의 채택은 §10.2 우선순위 3에 따라 canonical 직행 없이 `derivation-required`를 경유한다.

### 10.5 citation과 ID

- winner ID를 가능한 한 canonical ID로 유지한다.
- 완전 동치 loser citation은 migration map으로 winner ID에 바꿀 수 있다.
- 부분 승계·의미 변화 citation은 stale 처리하고 사람이 검토한다.
- 삭제된 ID는 allocator가 재사용하지 않는다.
- allocator 초기값은 migration preflight가 삭제 전 전체 guaranteed reference에서 계산하고 postcondition으로 `next > observed max`를 확인한다.

### 10.6 source/material GC

migration 성공 직후 material을 자동 대량 삭제하지 않는다.

1. current truth가 참조하는 material을 고정한다.
2. corroboration에 쓰이는 material을 고정한다.
3. active material의 `source=mNNN` inbound edge, document grounding, open conflict와 pending-decision candidate evidence가 참조하는 material을 고정한다.
4. 그 밖의 correction-only/무참조 material과 unrooted dependency SCC를 prune report에 나열한다.
5. 사용자 승인 뒤 별도 atomic prune으로 삭제한다.

## 11. 단계별 구현 순서

### Phase 0 — parser 기준선 고정 **(완료 2026-08-10)**

- ~~현재 staged parser/state 리팩터링만 검토·검증~~ → 콜드 diff 리뷰 완료, truth model 변경 미혼입
- ~~회귀 재실행~~ → `2026-08-08.1`에서 575/575, `2026-08-08.2`에서 **580/580**(Windows 네이티브, KEY seal 유지)
- ~~property 1,844건 재실행~~ → 1,844 / 15 groups, 두 번들 모두
- ~~3-OS CI~~ → 둘 다 green: `2026-08-08.1`은 dispatch `31359492780`(`e524511`), `2026-08-08.2`는 dispatch `31370959951`(`cf99658`). lint·powershell-smoke·linux·manifest·windows·macos 전부 통과, release는 태그가 없어 skipped
- ~~manifest/fingerprint/doccheck~~ → 54행 재현 동일 · fingerprint golden 일치 · doccheck green
- ~~실제 광산 read-only 명령 무변동 확인~~ → eclypse 9개 명령 v0.5.21과 바이트 동일, 427파일 무변동
- ~~별도 commit으로 고정~~ → `e524511`(parser/state) · `bcf804d`(문구 정합 + 커버리지 0건 진단 4개 케이스). 둘 다 Unreleased

완료 조건 충족: parser 변경과 이후 truth model 변경의 diff·회귀 원인을 분리할 수 있다.

Phase 0에서 남긴 것(차단 등급 아님, Phase 1과 독립):

- `verifiedUnitsContract`는 utf8 schema map을, `gapRegisterContract`는 latin1 map을 받는다. 호출부는 현재 전부 정합하지만 규약이 서로 반대라 다음 편집이 밟기 쉬운 두-인코더 함정이다. v3에서 `artifact-contracts` loader를 만들 때 한 규약으로 합친다(§7.1).
- `cmd-upgrade`의 verdict postcondition throw 문구가 "after writing"인데 그 시점엔 아직 쓰지 않았다(롤백 경계 안이라 동작은 정상).
- `FORMATS.md`는 보관 주석의 닫는 `-->`를 "on its own line"이라고 쓰는데 런타임은 "줄 끝"이면 통과시킨다(문서가 더 엄격 = 안전한 방향이라 그대로 둔다).

### Phase 1 — versioned contract와 비활성 v3 모델

- bundled versioned contract(v2=기존 `.weavedoc/schema`, v3=`schemas/v3`), runtime-max/artifact-version dispatch와 v2/v3 병렬 `truth-model` reader 구현
- 기존 mine은 v2로 계속 읽고 새 v3 contract는 fixture/API에서만 활성화; 이 중간 상태를 release하지 않음
- temporary conflict JSON schema 구현
- current `pending-decisions.json` schema와 content-addressed candidate/refresh model 구현
- current confirmation map schema, unit projection, total delta 계산 구현
- Accepted `acceptance_context_digest` projection과 v3 gaps disposition schema 구현
- monotonic id allocator 구현
- v2 compatibility adapter와 v3 explicit `artifact-contracts` role loader 구현; 모든 새 consumer가 typed role object만 받도록 API 고정
- current truth fixture와 property tests 추가
- canonical key와 exact claim normalization을 코드 한 곳에 구현
- read-only `derived-model`의 finite operator registry, typed unit checker, DAG/topological calculator와 deterministic result fixture 구현
- read-only `raw-source-model`을 먼저 구현해 material별 regular `source.*` 열거, symlink/path-escape 거부, 정렬된 상대경로+NUL+raw digest manifest와 tree digest를 공용 API로 고정한다. conflict envelope·support projection·confirmation projection은 이 API만 사용한다.
- v3 quote marker grammar와 read-only marker scanner/direct raw-source resolver를 red-first fixture로 고정한다. 아직 v2 production gate에는 연결하지 않는다.
- read-only `material-dependency-model`이 공용 marker parser의 `source=mNNN` edge와 truth/support/document/conflict/pending-decision reference를 graph로 만들고 inbound roots·SCC·impact를 제공한다. prune과 source seal은 이 graph를 각자 다시 계산하지 않는다.
- 모든 새 API는 read-only부터 시작
- current v2 suite는 그대로 green

완료 조건: v2/v3 model adapter와 fixture가 version별 expected current truth·conflict identity를 재현하고, raw-source manifest가 파일 추가·삭제·rename·byte 변경을 결정론적으로 감지하며, 기존 v2 production consumer suite가 그대로 green이다. production consumer 전환은 Phase 2 완료 조건이다.

### Phase 2 — conflict writer와 current-state consumers

- `map`의 new/same/conflict 분류 계약 수정
- candidate envelope + `map-commit`(new/same/conflict/refresh/answer-decision/replace-grounding/remove-current) + conflict list/resolve atomic writer 구현
- premise-aware writer cascade와 `rederive --preview/--apply`를 공용 derived calculator/transaction에 연결
- `confirm-current`의 expected-digest/absence 검사와 atomic current-map 교체, 공용 decision-preview/token 계약과 decision-bearing writer의 동시 confirmation 구현; cold ledger와 순서 독립 보장
- `validate`, `pull`, `census`, `scope`, `status`, `reindex`, `impact`, `attest`에 v2/v3 versioned consumer를 연결
- verify skill과 `verify.mjs`에 schema-version별 workflow를 둔다. v2 branch는 현 status·legacy·append/mirror 계약을 migration 전까지 유지하고, v3 branch는 derived material state·latest-row ledger·S1 support units·context-bound adjudication·current confirmation snapshot을 사용한다.
- v3 verify의 prerequisite/auto-routing은 `converted.md` 존재, current ledger digest와 open debt로 계산하고 material `status`를 읽거나 쓰지 않는다. `legacy-unbound`와 attest의 `Verified units` append mirror는 v2 branch에만 남고, v3 `verify.md` human view는 current model에서 재생성한다.
- v3 verify가 finding을 고칠 때 truth를 직접 편집하지 않고 correction candidate를 `map-commit`/`resolve`로, converted material 수정을 gather의 supported writer로 보낸다.
- `status --open`에 verification/confirmation debt를 여섯 번째 typed lane으로 추가하고 공통 종료보고의 count/list equality를 갱신한다.
- gaps의 v3 canonical coverage adapter를 연결하고 old status/resolution reader는 v2 branch에만 격리해 artifact flip 전까지 유지
- `gaps-disposition`의 re-accept/reopen/fill expected-snapshot writer와 required-gate freshness 검사를 연결
- automatic authority/date winner 제거
- eager document stale writes 제거, scope digest 계산 도입
- 모든 지원 CLI/library operation에 exclusive operation lock을 강제하고 mutating entrypoint에는 transaction context까지 강제
- durable transaction manifest, all-target staging, 공용 recover inspect/rollback/complete 구현
- `writeDurable` file flush/fsync+atomic replace+가능한 parent sync와 OS capability report를 구현하고 write-order fault driver로 manifest-before-target 불변식 고정
- writer postcondition을 structural failure와 정상적으로 새로 열린 verification·confirmation·review debt로 분리
- current grounding/support가 없는 material prune report와 승인형 atomic `prune` 구현
- absent-target reconcile 경로(`remove-current`·`prune`·support edge-drop)와 orphan ledger row·confirmation baseline 정리를 같은 decision token 계약에 연결; inbound reference가 남은 부재 material은 no-write
- fault injection과 rollback 검사

완료 조건: new truth·same support·conflict 생성·유지·채택·현재값 유지·분할/병합 경로는 성공 또는 처리 가능한 실패에서 원본 전체나 완전한 새 상태 중 하나만 남긴다. 동기화 완료 뒤 SIGKILL fault에서는 incomplete 증거가 남고 모든 지원 reader/writer가 복구 전 상태 소비를 거부한다.

### Phase 3 — v2→v3 migrator

- dry-run inventory
- structural layer와 5개 expected-debt layer의 identity/code manifest를 생성하고 apply token에 결속
- 자동 변환과 manual queue 분리
- citation replacement map
- verification ledger compaction
- 모든 active v2 unit을 명시적 unconfirmed debt로 열고 과거 광산 로그는 import하지 않음
- v3 role contract 활성화와 함께 legacy `review.md`의 누락된 역할 절을 빈 절로 보강하고 review seal은 stale debt로 유지
- legacy Accepted는 lossless scope만 stale/null-context로 이식하고 re-accept/reopen debt를 열며 자동 current waiver digest를 발행하지 않음
- 설치 bundle에는 v2/v3 schema·template·FORMATS/READ를 함께 발행하고, apply transaction 마지막에는 mine project/config version과 data state만 v3로 flip
- structural postcheck와 expected document-review-stale postcheck 분리
- rollback/failure injection
- 실제 광산 사본 migration rehearsal

완료 조건: loser/tombstone/history field가 active worktree에 없고 current provenance·citation·grounding은 보존된다.

### Phase 4 — source seal

- Phase 3 migrator를 아직 release하지 않고 source-seal migration step까지 같은 v3 upgrade transaction에 편입
- Phase 1 marker grammar/scanner와 `raw-source-model`을 재사용한 byte-domain quote 비교·writer gate 구현; 여기서 별도 marker/raw tree reader를 만들지 않음
- v2 migrator를 source-marker 단계로 확장: unmarked blockquote가 단 하나의 regular raw text source와 exact byte match할 때만 `source=self`/`file=` marker를 기계적으로 추가
- 여러 source match·귀속 불명·missing·binary·요약 가능성이 있으면 marker를 추측하지 않고 converted digest+source offset+candidate sources를 결속한 `quote-attribution-required` pending decision으로 이식한다. validator는 그 exact range를 green으로 보지 않고 `QUOTE-DECISION-PENDING`으로 차단하며, unrelated unmarked quote에는 이 overlay를 적용하지 않는다.
- marker 추가로 바뀐 converted digest는 material verification과 document context를 stale로 두고 자동 attest/seal을 발행하지 않음
- Phase 1부터 projection에 들어간 raw-source digest를 material verification과 seal gate에 연결
- review context에 raw source 포함
- binary/not-checkable 정직한 상태
- gather/map/verify 작성 규약 갱신
- fabricated quote, wrong attribution, unreadable source, source drift cases

완료 조건: source에 없는 축자 주장이 기계적으로 통과하지 않고, 검사 불가능한 입력을 검사했다고 표현하지 않는다.

### Phase 5 — 사람용 출력과 interaction protocol

- structured result와 ko/en renderer 분리
- 사용자 대면 명령 전부 message catalog로 이동
- machine-readable `interaction-result` schema와 `report start|progress|finish` helper를 structured command/status result에 연결
- plain-language glossary
- machine-authored 300-code-point writer postcondition과 user-authored warning 경계
- T1/T5·document fidelity lens에 조어/번역/대상종류 오독 fixture 연결
- 9개 스킬 공통 start/progress/finish 규약
- doccheck 참조 검사
- ko/en snapshot + JSON invariance
- 실제 한국어 광산 UX 검토

완료 조건: `language: ko`에서 영어 내부어 중심 보고가 나오지 않고, 모든 스킬이 시작·변경·미변경·검증·사용자 결정·다음을 같은 골격으로 말한다.

### Phase 6 — gaps A의 의미·UX 이식 완결

- Phase 2에서 전환한 canonical adapter 재검증
- canonical coverage와 conflict ownership 적용
- Accepted를 current waiver로 문서화
- `as-of` 제거와 `gap_density` 유지 migration
- 기존 typed register와 completeness gate 유지
- 기존 회귀 fixture를 v3로 이관
- 광산 로그 mutation이 gaps 결과를 바꾸지 않는 검사

완료 조건: 세 consumer가 같은 gap entry 집합을 보고, 과거가 아니라 current truth만 coverage가 된다.

### Phase 7 — canonical-current release

- 전체 회귀·property·fault injection
- fresh init과 v2 migration 양쪽 검증
- v1 디딤돌 E2E: v1 fixture가 v3 runtime의 below-min 진단으로 거부되고, 고정 bridge runtime(v0.5.21)으로 v1→v2 후 새 runtime의 v2→v3 upgrade까지 green
- Windows/Linux/macOS required CI
- downstream fresh clone/autocrlf 양쪽
- 실제 광산 gather→map→conflict→resolve→verify→gaps→plan smoke
- release evidence block과 migration guide(UPGRADING.md v2 지원 수명표 포함)
- schema/format/migrator를 한 tag에 발행

완료 조건: enrichment B 없이도 canonical-current core, source seal, 사람용 출력, gaps A가 독립적으로 출하 가능하다.

### Phase 8 — enrichment B MVP와 후속 release

- `weavedoc-enrich` skill 추가
- current TruthStore read-only scan
- 의도적으로 불균형한 소설·보고서 positive fixture
- 균형 잡힌 negative fixture(`제안 없음`이 성공)
- conflict가 있는 영역만 보류하고 무관한 영역은 계속 보는 fixture
- 명시 호출/비차단/무변동 검사
- 공통 ko/en renderer와 start/progress/finish protocol 참조, doccheck roster를 10개로 갱신
- 채택 후 정상 pipeline handoff만 문서화
- core와 분리된 후속 release로 발행

완료 조건: 실행 전후 mine tree hash가 같고, 질적 제안을 gap·결함·truth로 오인하지 않으며, 제안할 것이 없는 광산에 억지 제안을 만들지 않는다. Tree hash는 write-scope 위반을 잡는 smoke test이며 sandbox 수준의 권한 보증이라고 표현하지 않는다.

## 12. 수용 테스트

### 12.1 canonical-current 핵심 사례

1. 파란→초록 채택 후 truths에는 같은 id의 초록 하나만 존재
2. 초록→파란 재채택이 과거 suppression 없이 정상 동작
3. 같은 claim의 새 source는 duplicate truth 대신 support로 합쳐짐
4. conflict candidate는 index/tree/census/required_tags/gaps coverage에 들어가지 않음
5. open conflict가 해당 current truth의 pull과 출하를 차단
6. authority, `dated`, `added`, 광산 로그를 바꿔도 winner가 자동 선택되지 않음
7. resolve 후 conflict entry와 loser가 남지 않음
8. 부분 충돌은 사용자 범위 결정 없이 apply 불가
9. ID 구멍은 경고하지 않지만 삭제 ID는 재사용하지 않음
10. truth 한 건 갱신 시 unrelated truth/material/document 바이트는 불변
11. current index/tree만 재생성되고 과거 label은 출력되지 않음
12. 광산 로그와 릴리스 로그 삭제·변경이 validate/census/pull 결과를 바꾸지 않음
13. dispatcher 우회 driver도 lock token 없이 mutation을 실행할 수 없음
14. resolve와 기존 writer의 동시 실행에서 둘 중 하나만 commit
15. 다른 locus의 비슷한 claim은 서로 다른 canonical truth로 생성
16. 같은 `(locus, as_of)`와 exact-normalized claim은 새 truth가 아니라 typed support edge로 생성
17. 같은 key의 paraphrase·대소문자·구두점 차이는 자동 same이 아니라 conflict
18. locus가 모호하거나 여러 기존 locus와 겹치면 truth/conflict를 만들지 않고 truth·locus·conflict allocator도 올리지 않으며(candidate namespace `candidate_id`만 발급) Human queue
19. 같은 locus라도 명시적 `as_of` 범위가 disjoint면 둘 다 current canonical로 유지
20. 겹치는 기간 또는 `null`↔dated 관계가 애매하면 조용히 new로 만들지 않고 conflict/Human queue
21. grounded premise의 semantic digest가 바뀌면 derived truth가 unusable해지고 재계산 전 출하 차단
22. 자유 assumption만 있는 derived candidate는 canonical commit 거부
23. `map` 산출물만 손편집해도 current state는 바뀌지 않고 `map-commit`만 commit 권한을 가짐
24. 자동 canonical/support writer는 confirmation map을 갱신하지 않아 commit 직후 반드시 unconfirmed이고, valid decision token을 받은 writer만 preview 범위의 결과 unit을 같은 transaction에서 confirmed로 기록
25. 같은 unit의 미확인 연속 편집은 `마지막 확인 digest ↔ 최신 digest` 차이 하나로 보이고 이전·중간 claim은 machine state에 남지 않음
26. `confirm-current`는 expected current/absence가 달라지면 confirmation map을 불변으로 두고 거부하며 cold row 유무는 human confirmation write 성공을 바꾸지 않음
27. active 확인 성공은 digest를 교체하고, 삭제 확인은 expected absence+명시적 사용자 확인 뒤 stale key를 제거하며 광산 로그 유무·내용은 결과에 영향 없음
28. valid empty confirmation map은 전 current unit unconfirmed, missing/unreadable/malformed는 fail-closed이며 empty로 오인하지 않음
29. 같은 new candidate의 동시 `map-commit`은 하나의 canonical truth만 만들고 같은 support 재실행은 no-change
30. `s:<64-hex>` 외 support key는 ledger/attest/confirmation 전부 거부하고 valid key는 같은 edge로 resolve
31. support quote/source byte 변경은 key를 유지한 채 stale, location 변경은 old-delete+new-add로 계산
32. S1 FAIL/PARTIAL edge는 human-confirmed일 수 있어도 cold-verified/corroboration에는 들어가지 않고 PASS+matching attest 뒤에만 근거로 노출
33. decision-bearing truth/material 삭제는 딸린 support edge·active ledger row·승인 범위 confirmation baseline을 같은 transaction에서 제거해 중복 delete debt를 남기지 않고, out-of-band 삭제만 digest+최소 descriptor의 확인 debt로 표면화
34. cold-unverified 또는 human-unconfirmed current가 있으면 `validate`가 stable diagnostic으로 nonzero이고 `consecrate`도 같은 이유로 거부
35. `attest → confirm-current`와 `confirm-current → attest` 순서가 같은 최종 gate 상태를 만들고 어느 쪽도 open conflict/Human queue/gap을 지우지 않음
36. verification context가 바뀌면 old adjudication과 `consecutive_passes`가 효력을 잃고 새 round 전 suppression으로 쓰이지 않음
37. `status --open` 여섯 lane의 총계·목록과 설치된 스킬(9개 core, B 이후 10개) 종료보고의 대기 항목이 정확히 동치
38. source의 `초아`를 machine slug `choa/chowa`로 만들어 locus를 발급하는 경로 0건; stable `lNNN`과 grounded label만 저장
39. exact alias는 기존 locus 재사용, 새 번역·동의어 alias는 사용자 확인 전 no-write
40. locus registry entry 삭제 뒤 allocator가 같은 `lNNN`을 재사용하지 않음
41. resolve preview가 conflict-loser-only·reference-zero material을 정확히 열거하고 사용자 선택 뒤 canonical/conflict와 같은 transaction에서 삭제
42. old claim과 current fact를 함께 담거나 용도가 모호한 material은 resolve 자동 삭제에서 제외되고 byte 불변
43. `.weavedoc/` runtime bundle 교체 전후 `.weavedoc-state/` tree hash가 byte-identical
44. 광산 state mutation은 bundle manifest/fingerprint를 바꾸지 않지만 state validator와 Git diff에는 보임
45. exact-same 새 source는 support만 추가하고 primary grounding은 명시적 replace 요청+impact 없이는 바뀌지 않음
46. 여섯 필수 state 파일 각각의 missing·directory masquerade·unreadable·malformed가 empty로 흡수되지 않고 writer도 원본을 보존
47. conflict에서 사용자가 `same`을 선택하면 canonical은 byte 불변, conflict는 삭제, incoming evidence는 human-confirmed지만 cold-unverified인 support edge가 됨
48. conflict 생성 뒤 target claim/source가 바뀌면 일반 resolve는 거부하고 refresh가 current snapshot에 대해 conflict를 같은 id로 교체
49. refresh evidence 행렬(candidate-only missing, target-only missing+grounded candidate, both missing)을 전수해 각각 candidate 제거+current 유지, conflict 유지+동일-id target-fidelity 차단, conflict 제거+current fidelity로 분류하며 grounded candidate를 무승인 winner로 올리거나 유실하지 않음
50. conflict refresh/resolve는 old entry와 새 conflict/support/truth/Human queue를 동시에 남기지 않고 같은 snapshot 재실행이 no-change
51. locus alias의 마지막 current grounding reference를 prune/교체하면 non-display alias가 제거되고 rejected/historical alias가 남지 않음
52. writer가 operation lock을 가진 동안 read-only command와 `--dry-run`도 대기하지 않고 명시적으로 거부되며 중간 파일을 읽지 않음
53. target vector에 적용된 변경이 하나라도 있는 실패·INT/TERM은 rollback이 성공하면 모든 target이 원본 state(absent 포함)로 돌아가고 transaction manifest·stage가 정리되며, 어느 target도 변경되지 않은 실패·INT/TERM은 restore 없이 owner를 `rolled_back`+old root digest로 terminalize한 뒤 정리로 끝남
54. SIGKILL fault 뒤 terminal+root exact 잔재는 `CLEANUP-INCOMPLETE`로, rollback evidence는 `ROLLBACK-INCOMPLETE`로, rollback evidence 없는 그 밖의 nonterminal 잔재만 `TRANSACTION-INCOMPLETE`로 validate·status·pull·writer가 구분해 거부하고 부분 상태를 정상 mine으로 읽지 않음
55. recover는 각 target의 old/new typed state(absent 포함)·digest가 manifest와 exact match일 때만 rollback/complete하고 외부 편집이 섞이면 자동 복구하지 않음
56. `reading|preparing` phase SIGKILL+manifest 없음은 target byte 불변이고 explicit recover takeover가 contained stage와 stale lock만 제거
57. `manifested|committing|rolling_back`인데 manifest가 없거나 lock owner record가 malformed면 recover가 자동 정리하지 않고 manual 상태로 거부
58. decision preview 뒤 target/candidate/current set이 바뀌면 token이 무효가 되어 writer와 confirmation map이 모두 byte 불변
59. resolve·replace-grounding·remove-current·prune의 승인 token은 preview 범위만 human-confirmed로 만들고 cold debt는 남기며, 자동 writer가 token을 자체 승인할 수 없음
60. agent skill이 advisory prose snapshot을 읽은 뒤 원문/current digest가 바뀌면 commit-time recheck가 stale expected digest를 거부하고 최신 snapshot을 다시 요구
61. 한 incoming range가 두 current target과 겹치면 target 둘을 가진 conflict component 하나로 round-trip하고 merge/split preview가 양쪽을 모두 열거
62. v2 winner 없는 open conflict는 `targets=[]`와 candidate 전부를 보존하며 migration 후에도 canonical population에 섞이지 않음
63. candidate의 normalized `as_of`/context·locus proposal은 envelope→conflict→refresh/resolve 전 구간에서 byte-stable typed 값으로 유지
64. refresh가 한 connected component를 둘로 나누면 정렬상 첫 component만 old id를 유지하고 나머지는 새 id를 받으며 candidate 누락·중복 0건
65. premise writer가 두 단계 derived DAG를 topological order로 재계산해 stable truth ids로 한 transaction에 commit하고 새 결과만 verification/confirmation debt
66. semantic 계산 불능(unknown operator·cycle·unit mismatch·divide-by-zero)은 승인된 처분이 없으면 어떤 write도 시작하지 않는 no-write이고, target 변경 0인 실패는 pre-commit 정리, target vector에 변경이 하나라도 적용된 실패는 처분 유무와 무관하게 §2.8 rollback으로 premise·derived·처분 전체를 원본으로 되돌림
67. out-of-band premise 변경은 `DERIVED-STALE`로 차단되고 `rederive`가 expected digests를 확인한 뒤 공용 calculator 결과로만 복구
68. premise 삭제 preview가 모든 dependent derived의 rewire/delete를 열거하며 미선택 dependent가 하나라도 있으면 no-write
69. ambiguous locus candidate는 full envelope와 finite grounded candidate set을 `q:<digest>` entry로 보존하고 truth/conflict/locus allocator를 쓰지 않음
70. answer-decision의 existing/new-label/split 선택은 current snapshot 재검증 뒤 각각 same/new/conflict로 재분류되고 queue entry가 같은 transaction에서 삭제
71. discard 선택은 candidate/queue만 삭제하고 rejected digest·suppression·answer history를 남기지 않아 같은 주장의 미래 재입력이 정상 비교됨
72. pending decision 생성 뒤 evidence/target이 바뀌면 old token이 no-write이고 refresh가 payload를 0..N typed 결과로 옮기되 보존식(parent = terminal 결과+child payloads) 아래 누락·중복 0건
73. pending decision은 status/Human queue에는 한 번, validate/consecrate에는 blocking identity로 보이지만 truth population·coverage·gaps·documents에는 0건
74. `targets=[]` conflict에서 사용자가 모든 후보 기각/현재 없음 유지를 고르면 canonical 0개·conflict 0개가 되고 미래 같은 후보가 suppression 없이 다시 열림
75. rollback의 N번째 restore 적용/postcheck 실패는 `ROLLBACK-INCOMPLETE`와 backup/manifest/lock을 보존하고 `recover --rollback` 재실행이 old typed state·digest 전체에서만 정리
76. migrated grounding-required decision은 old truth id/claim/body/impact를 잃지 않고 re-ground 선택은 같은 id current truth로, remove 선택은 canonical 0개로 닫힘
77. fresh clone에서 `transactions/.gitkeep`과 stage root가 존재하고 정상 writer/rollback/recover 뒤에도 sentinel byte가 보존되며 operation subdir만 0개
78. stage/backup/manifest flush 또는 manifest replace가 실패하면 target 적용 호출 0건·원본 state 불변
79. mutation primitive에서 owner phase/manifest check를 제거하거나 target 적용을 manifest durable-ack 앞으로 옮긴 mutation은 ordering fault suite에서 red
80. Linux/macOS/Windows release evidence가 `process_crash_durable`과 `power_loss_durable` capability를 실제 primitive 결과와 일치하게 보고하고 후자를 과장하지 않음
81. ordinary truth update write-set은 affected truth/generated views/direct state/log 역할만 포함하고 related document/material과 unrelated content는 byte 불변; derived cascade만 declared DAG 범위 추가
82. answer-decision은 preview에 full projection/absence가 있던 결과만 human-confirmed로 기록하고 후속 gather/rederive 산출물·cold debt·preview 밖 unit은 그대로 open
83. 같은 base payload의 locus/grounding/derivation/support/conversion/quote kinds는 서로 다른 q-key이고 각 kind dependency 변경만 해당 key를 stale로 만듦
84. 각 pending kind refresh/answer는 old entry를 0..N typed 결과(pending/truth/support/conflict/material/absence/fidelity)로 옮기되 보존식 `parent payload = terminal 결과 + child payloads`가 postcondition으로 성립하고, `candidate_id`는 같은 payload의 전이에서 유지되며 split children만 새 id를 받아 누락·중복 0건이 검증됨
85. terminal owner durable-ack 뒤 manifest/stage/lock cleanup 각 지점의 SIGKILL은 committed/rolled_back root digest 확인으로 잔재만 정리하고 target을 다시 적용하지 않음
86. premise 값 변경(conflict 채택 포함)이 dependent derived를 계산 불능으로 만들면 처분 질문은 그 dependent에만 열리고 선택지는 `삭제|derivation-required 이송`(`취소`는 operation 전체)이며, 전부 처분됐을 때만 한 transaction으로 적용하고 미처분이 하나라도 있으면 no-write; 이송은 해당 unit의 ledger row·support edge·confirmation baseline을 같은 transaction에서 정리하고, 계산 가능한 dependent는 질문 없이 자동 재계산되며 write-set preview에 표시됨
87. out-of-band로 삭제된 truth·material·support unit의 `LEDGER-ORPHAN`은 종류별 지원 출구를 가진다: `tNNN`은 absent-target `remove-current`, `mNNN`은 absent-target `prune`, `s:` edge는 `map-commit` edge-drop이 각각 orphan ledger row·confirmation debt·딸린 edge를 preview로 열거하고 승인 뒤 한 transaction에서 정리하며, Git 복원→정상 지원 삭제 경로와 최종 상태가 동치. 부재 `tNNN`은 정상 삭제와 같은 dependency cascade(derived premise 처분·document/conflict/pending 영향)를 preview에 포함하고, 부재 material에 current/open inbound reference가 남아 있으면 absent-target `prune`은 no-write하고 dependent re-ground/remove 결정을 먼저 요구함
88. 광산 로그 append 실패·부분 기록 fault에서도 canonical commit과 terminal root digest는 불변이고 rollback/recovery 잔재 0에 rc 0 + stable warning만 남음
89. current truth와 open conflict가 0이어도 open pending decision이 참조하는 locus registry entry는 유지되고, 마지막 참조 해소 뒤에만 제거되며 `lNNN`은 재사용되지 않음
90. v3 `verify.md` 재생성은 기계 생성 절만 다시 쓰고 미처리 Adjudications·Human queue ruling byte를 보존하며, 전체 파일 덮어쓰기 구현은 fixture red
91. 같은 payload는 어떤 명령 경로로 진입해도 §2.3.2 고정 축 순서로 같은 kind·`q:key`·질문 순서를 가지며, 답변으로 닫힌 축은 payload 변환으로 보존돼 dependency bytes 변화 없이는 재개방되지 않음
92. out-of-band premise 변경으로 계산 불능이 된 dependent는 `rederive` preview의 `삭제|이송` token으로만 정리되고(취소 없음) 처분 없이는 어떤 write도 없으며, token 승인 시 처분과 `DERIVED-STALE` 해소가 한 transaction
93. 로그 append 중 SIGKILL과 terminal ack 이후 cleanup 실패는 committed 상태와 target byte를 바꾸지 않으며, 전자는 recover의 잔재 정리, 후자는 `CLEANUP-INCOMPLETE`+복구 증거 보존으로 끝남
94. 유효한 recipe를 가진 derived의 계산 불능 이송분·conflict 채택분은 recipe가 `derivation_candidate`로 이동하고 installed 슬롯이 비워져 TD entry로 멈추며 `grounding-required`로 분류되지 않음
95. 참조 material의 MC/MQ entry가 열려 있는 truth entry는 자기 kind를 유지한 채 `blocked_by`로 표시되고 blocked 동안 답변이 거부되며, 의존 entry가 닫히면 refresh가 blocked_by를 재계산함
96. TL `split`과 MC 통과 후 quote-span 생성은 old entry 삭제+0..N child payload 생성이 한 transaction이고, 각 child는 첫 축부터 재분류되며 old·child가 동시에 열린 시점 0건; children `candidate_id`는 canonical 정렬 순서 할당으로 3-OS 동일
97. 어느 축의 `absence` 답변(remove·discard·drop)도 남은 축 판정 없이 즉시 terminal이고 entry 삭제+absence 결과가 한 transaction
98. owner `reading|preparing`+valid manifest crash는 전 target이 manifest old state(absent 포함)·digest와 일치할 때만 pre-commit 정리되고, 하나라도 불일치면 자동 정리 없이 manual recovery
99. 잔재 진단은 §2.8 사다리 순서를 따른다: terminal owner+root digest 일치는 `CLEANUP-INCOMPLETE`, rollback evidence는 `ROLLBACK-INCOMPLETE`, malformed·mismatched evidence는 manual only, 그 밖의 nonterminal 잔재만 `TRANSACTION-INCOMPLETE`이며 전부 일반 명령을 막되 진단·복구 안내가 구분됨
100. 변환 불가 material의 MC `제거` cascade는 dependent pending truth/quote-span의 처분(`re-ground|함께 remove`)과 evidence-candidate SG entry의 처분(`다른 exact evidence 선택|support drop`)을 같은 preview에서 받아 한 transaction으로 적용되고, 처분 미정이 하나라도 있으면 no-write이며 blocked entry의 단독 답변 거부는 유지됨; current truth/support/document·`source=mNNN`·conflict evidence와 처분 규칙이 정의되지 않은 모든 inbound(새 pending kind 포함)는 하나라도 있으면 full impact를 보여주고 no-write
101. create의 rollback은 생성물을 absent로 되돌리고 delete의 rollback은 backup을 복원하며, manifest가 absent를 기대하는 자리의 파일 존재·state 불일치는 자동 복구 없이 corruption과 구분된 manual 진단
102. forward 적용을 `rolling_back`에서, restore를 `manifested|committing`에서 시도하는 mutation은 방향별 primitive guard가 거부하고 write-order fault suite에서 red
103. 잔재 진단은 terminal+exact→`CLEANUP-INCOMPLETE`, rollback evidence→`ROLLBACK-INCOMPLETE`, 그 밖의 nonterminal→`TRANSACTION-INCOMPLETE`, malformed→manual only 사다리 순서로 판정되며 `ROLLBACK-INCOMPLETE`가 umbrella에 흡수되지 않음
104. durable manifest 이후 target 변경 0인 abort는 owner를 `rolled_back`+old root digest로 먼저 terminalize한 뒤 정리하며, 정리 중 SIGKILL 잔재도 manual이 아니라 `CLEANUP-INCOMPLETE` 사다리로 분류됨
105. 공용 mutation primitive는 directory target을 fail-closed로 거부하고, `draft/`·`final/` 교체는 기존 consecrate 전용 transaction(`.consecrate.inflight`·`.final.bak`·compare-first·`CONSEC-INTERRUPTED`)이 담당하며, 공용 진단 사다리가 consecrate 교체 중의 정상 `final/` absent를 corruption으로 읽지 않음 — 두 evidence 계열의 파일은 분리됨

### 12.2 migration 사례

1. 단일 winner full discard 자동 변환
2. partial scope는 dry-run manual queue
3. open conflict는 candidate store로 이동하고 winner 미선택
4. retracted는 active에서 제거되고 non-derived `unsupported`는 canonical 0건+lossless `grounding-required` 1건, derived `unsupported`는 `derivation-required` 1건으로 이식돼 결정 전 차단
5. current source가 필요한 correction material 보존
6. orphan correction material prune report
7. loser citation full replacement와 partial stale 분리
8. upgrade의 target vector에 변경이 하나라도 적용된 실패는 successful rollback 뒤 v2 byte 전체 복원(target 변경 0인 실패는 pre-commit 정리), rollback 자체 N번째 실패는 `ROLLBACK-INCOMPLETE`+recoverable backup/manifest 보존
9. migration 후 old history field 0건
10. 기존 final seal 자동 재발행 0건
11. `decided_by: machine`, authority/date winner, 맥락 없는 attribute resolution은 전부 manual queue
12. dated `confirmed:`가 있거나 없어도 v2 active unit은 전부 unconfirmed로 시작하고 소급 confirmation digest 0건
13. malformed·고아 광산 로그는 current truth 선정에 영향 없이 사람용 경고만 내며 structural migration은 완료 가능
14. 닫힌 과거 광산 로그 block과 루트 릴리스 로그는 v3 운영 상태로 import하지 않음
15. migration 전 high-water scan이 삭제 예정 ID와 문서/장부 참조 ID를 포함하고 allocator가 그보다 큼
16. `project.md`/`config.yaml` artifact version의 missing·불일치·future version을 모든 일반 명령이 같은 `VERSION-MISMATCH`로 거부하고, 지원 하한 미만(v1)은 마지막 v1 지원 runtime을 안내하는 별도 진단으로 fail-closed
17. final version flip의 두 번째 rename 실패는 두 version field를 v2로 rollback하고, manifest durable-ack 뒤 SIGKILL 혼합 상태는 recovery 외에 소비되지 않음
18. v3 init과 성공한 upgrade 뒤 두 artifact version이 v3로 일치하며 runtime max와 별도 값으로 읽힘
19. parties·source·range·locus가 명백하고 winner만 모호한 v2 conflict는 apply가 v3 open component로 이식하고 validate/consecrate만 계속 차단
20. free-form partial scope, 유실 party/source, 결정 불가능 locus처럼 lossless payload를 만들 수 없는 항목은 dry-run에 이유를 내고 apply 전 byte 불변으로 중단
21. apply 뒤 decision/fidelity/document/confirmation/completeness debt가 dry-run manifest와 identity까지 같으면 `applied; not shippable`, 하나라도 예상 밖/누락이면 rollback
22. §10.2 우선순위에서 삭제·conflict 축으로 먼저 배치되지 않은 v2 derived truth는 사설 recipe성 키의 유무와 무관하게 자동 변환·재계산되지 않고 전부 lossless `derivation-required` pending decision으로 이식됨
23. 분류 축은 `provenance: derived`다: 삭제·conflict 축으로 먼저 배치되지 않은 derived truth는 ordinary canonical이 아니라 lossless `derivation-required` pending decision이며, supply/remap/remove 답변은 TD 축만 소비하고 §2.3.2에 따라 다음 kind로 전이할 수 있으며 모든 축 통과 또는 absence 뒤에만 전체가 닫히고, non-derived truth에 붙은 잔여 `derived_from`/`assumptions` 필드만으로는 derived로 분류되지 않음
24. v2 corroborated_by의 exact unique coverage address는 unverified/unconfirmed typed support edge로 보존되고 primary-source 중복은 edge를 만들지 않음
25. missing/ambiguous corroborated evidence는 관계를 버리거나 verified로 세탁하지 않고 `support-grounding-required` pending decision으로 round-trip
26. `status: verified` 단독·legacy-unbound·projection 범위가 다른 v2 ledger는 v3 attest를 만들지 않고 cold debt, exact-equivalent latest row만 compact
27. `status: used`는 current reference graph 결과와 무관하게 verification 권한을 얻지 않고 status field만 제거
28. `status: collected`와 `status: converted` 모두 converted.md 유무가 각각 active-unverified와 lossless `conversion-required` pending decision으로 갈리고 raw source byte는 보존; 존재하되 unreadable/malformed인 converted.md는 어느 쪽으로도 흡수되지 않고 apply 중단
29. unreferenced `status: retracted` material은 제거되지만 inbound truth/support/document/source=m/conflict/pending-decision reference가 있으면 re-ground/remove 결정 전 apply no-write
30. lifecycle×provenance 조합은 §10.2 우선순위로 total 분류됨: `retracted`+derived와 조건 충족 완전 `discarded`+derived는 삭제 축 우선, 조건 미충족 discarded·open `conflict`·machine-resolution+derived는 derived 메타를 보존한 conflict component/manual queue, 잔여 `ok|unsupported`+derived만 `derivation-required`
31. v1 광산은 v3 runtime에서 below-min 진단으로 거부되고, 고정 bridge(v0.5.21)로 v1→v2 후 새 runtime의 v2→v3 upgrade가 성공하는 디딤돌 E2E가 green
32. `unsupported`+derived는 `derivation-required` 하나로 이식되고, `remap` 답변에 유효한 grounding이 없으면 canonical이 아니라 `grounding-required`로 전이하며 모든 축 통과 전 canonical 0건; derived-origin conflict candidate의 채택도 같은 경유를 밟음

### 12.3 source seal 사례

1. self source의 정확한 축자 인용 통과
2. 한 글자 변조 차단
3. 다른 material/truth 귀속 정확·오류 양쪽
4. source unreadable과 missing 구분
5. source byte 변경 시 verification/context stale
6. 요약을 축자 marker로 위장하면 차단
7. binary source는 not-checkable로 정직하게 보고
8. 기존 truth→converted seal 유지
9. valid `source=self`와 direct `source=mNNN`은 regular raw source로 통과하고, `source=tNNN`, converted-as-source, path escape, transitive marker chase, symlink/alias source는 fail-closed
10. raw source가 여러 개인 target에서 `file=`이 없거나 잘못되면 fail-closed
11. machine-authored blockquote의 marker 누락과 inline quote-shaped span을 차단
12. source tree manifest가 상대경로·NUL·raw digest 순서를 결속하고 파일 추가·삭제·rename·byte 변경을 모두 감지
13. v2 unmarked quote가 단일 raw text exact match일 때 marker만 추가되고 verification은 stale
14. 여러 raw source에 같은 문구, 부분 match, 요약 가능성, binary source는 migration이 marker를 추측하지 않고 exact-range `quote-attribution-required` pending decision
15. source-marker migration이 material attest나 document review seal을 자동 재발행하지 않음
16. `source=mNNN` inbound edge가 있는 provider는 truth 직접 참조 0이어도 prune이 거부되고 `impact`가 dependent material을 열거
17. provider raw byte 변경은 direct dependents의 verification과 관련 document grounding을 stale로 만들며 unrelated material은 불변
18. direct material dependency cycle은 각 marker가 raw source로 끝나면 검증 가능하고, current root가 없는 SCC만 하나의 승인형 prune 후보가 됨
19. open conflict/pending-decision payload만 참조하는 evidence material도 queue가 닫힐 때까지 current root라 prune 불가이고 `impact`에 queue id가 표시됨
20. quote pending overlay는 결속된 converted digest+offset 한 곳만 `QUOTE-DECISION-PENDING`으로 차단하고 다른 unmarked blockquote를 면제하지 않음
21. exact source/location 답변은 `mode=verbatim` marker+byte seal, summary/paraphrase 답변은 blockquote 표기 제거+prose, remove 답변은 span absence를 만들고 각 성공 branch만 queue를 같은 transaction에서 삭제
22. binary not-checkable 답변은 실제 binary 판정+exact attribution을 기록한 뒤 queue를 삭제하되 matching cold row와 full material human confirmation 전 출하 차단이며 text mismatch를 이 mode로 낮추면 거부
23. quote answer 중 gather writer 실패/expected converted drift는 pending entry와 material 원본을 모두 보존
24. marker `location` 표기의 오류는 byte-domain seal 판정을 바꾸지 않으며(기계 판정은 source/file resolution과 span match) cold fidelity review 대상으로 표면화

### 12.4 출력 사례

1. `language: ko` human output 한국어
2. `language: en` human output 영어
3. JSON key/code 양쪽 동일
4. 모든 error에 stable code
5. 내부 enum/path는 보존되고 쉬운 풀이 동반
6. core 9개 스킬 모두 shared protocol과 report helper를 참조·호출하고 하나를 제거하면 roster doccheck red
7. 변경 없음 종료 보고도 결과·검증·결정 없음 표시
8. waiting items 개수와 실제 목록 동치
9. 원본에 없는 기계 조어가 채택 없이 truth/title/tag에 들어가지 않음
10. machine-authored 301자 summary는 main+detail로 분리되고 원문·인용·사용자 text는 byte 불변
11. source의 인명/대상 종류를 번역·로마자화·오분류한 fixture가 T1/T5 또는 document fidelity에서 통과하지 않음
12. 각 core skill의 no-change·success·blocked fixture가 start/progress/finish 필수 field를 모두 렌더하고 phase 하나를 빼면 contract red
13. 처리 건수·검증 rc·waiting identity를 structured command result와 다르게 주입하면 report renderer가 거부
14. 짧은 작업은 progress 생략 가능하되 start/finish는 필수이고, 긴 작업 fixture는 progress의 done/next/blocker를 실제 phase state와 일치시킴
15. B 추가 release에서는 같은 fixture matrix가 열 번째 roster skill까지 자동 확장

### 12.5 gaps A 사례

1. canonical truth가 있으면 gap 닫힘
2. 삭제된 과거 후보는 아무 영향 없음
3. conflict candidate는 coverage가 아님
4. 같은 locus의 conflict와 Open gap 중복 없음
5. conflict 해소 후 winner만 coverage
6. canonical truth 생성 시 기존 Open 제거
7. current `acceptance_context_digest`가 일치하는 Accepted-only는 required에서 통과하고 stale/null-context는 차단
8. 광산 로그 변경으로 gap 판정 불변
9. gaps 실행이 truth/material/광산 로그를 수정하지 않음
10. validate/status/gaps entry identity와 개수 동치
11. Accepted scope의 truth claim·locus·coverage/project input 변경은 `ACCEPTANCE-STALE`로 required gate를 차단하고 entry를 조용히 삭제/Open 이동하지 않음
12. stale Accepted의 re-accept token은 current context digest로 제자리 교체하고 이전 digest를 state에 남기지 않음
13. reopen token은 같은 entry identity를 Accepted→Open으로 원자 이동하고 count/list/gate가 같은 전이를 봄
14. fill 선택은 Accepted→Open으로 먼저 이동해 required gate를 차단하고, canonical coverage commit 전에는 Open을 보존하며 실제 fill 뒤에만 entry 제거
15. v2 Accepted는 자동 유효화되지 않으며 lossless scope는 null-context stale, ambiguous scope는 migration no-write
16. gap definition target 자체 삭제는 entry를 제거하지만 target은 남고 scoped premise truth만 삭제된 경우에는 entry가 `ACCEPTANCE-STALE`로 보존됨

### 12.6 enrichment B 사례

1. 명시 호출 전 자동 실행 0건
2. 실행 전후 mine tree hash 동일
3. validate/completeness 결과 불변
4. 존재 관찰에는 current truth, 부재·불균형에는 재현 가능한 query/count와 비교 집합 존재
5. 관찰과 창작 제안 구분
6. open conflict를 확정 사실로 사용하지 않음
7. truth/question 자동 생성 0건
8. rejected suggestion registry 생성 0건
9. 불균형 소설 fixture에서 근거 있는 질적 보강점 발견
10. 불균형 보고서 fixture에서 근거 있는 질적 보강점 발견
11. 균형 fixture에서는 `제안 없음`
12. conflict 영역만 보류하고 무관한 영역은 계속 분석
13. 발견한 후보를 gap·결함·필수 조치로 표시하지 않음

### 12.7 parser/artifact role 사례

> 진행(2026-08-10, 번들 `2026-08-08.7`): **§12.7 전체는 미완료.** 항목별로는: 1~4는 status·validate·writer가 *같은* typed object로 판정하는 것을 요구하는데 **production import가 아직 0개**라 E2E 동치는 검사되지 않았다 — 지금 충족된 것은 **contract-layer 선행조건**뿐이다(1·2·3의 role object 형태, 4의 비ASCII 4종 양 도메인 동치). **#5는 완료**(missing·duplicate·empty·leading-empty·interior-empty·extra role + 두 positional 계약 모두의 trailing delimiter 정책). **#6·7·8·9는 미착수** — 6은 소비자 전환(Phase 2) 전에는 대조할 green fixture가 없고, 7·8은 v3 review 절/migration이 아직 없으며, 9의 doccheck 변이 검사도 소비자 전환 뒤에 붙는다. **§12.7 전체 완료로 표시하지 말 것.**

1. Human queue waiting/closed와 ownership 세 역할을 status·validate·writer가 같은 typed object로 판정
2. questions waiting/proposed/closed를 listing·count·gate가 같은 역할로 판정
3. verify/review의 Human queue heading을 literal이 아니라 contract role로 찾음
4. role token을 비ASCII fixture로 바꿔도 byte-domain reader와 UTF-8 schema consumer의 역할 판정 동치
5. missing·duplicate·leading/interior empty·extra role은 model 전체 fail-closed, trailing delimiter 정책은 모든 positional contract에서 동일
6. v2 adapter 결과와 기존 green fixture의 entry identity·source offset이 byte-identical
7. v3 review의 네 역할 절 중 하나가 없으면 모든 관련 consumer가 같은 diagnostic으로 차단
8. migration이 누락 절을 보강한 뒤 old seal을 자동 갱신하지 않고 review-required를 보고
9. consumer-local `split('|')`, literal `Human queue`, private default vocabulary를 되살리는 mutation이 property/doccheck에서 red

### 12.8 document projection 사례

1. 문서가 인용한 truth의 claim·locus·`as_of` 변경은 semantic projection을 바꾸고 fidelity stale
2. 인용한 source·location·quote·raw-source byte 변경은 grounding projection을 바꾸고 fidelity stale
3. document `scope_tags` 안 current truth의 추가·삭제·locus 변경은 completeness projection을 바꾸고 completeness stale
4. 문서가 인용하지 않은 support-only edge의 추가·삭제는 semantic·grounding·completeness 어느 projection도 바꾸지 않음
5. 문서가 corroboration edge를 명시적으로 인용하면 그 edge의 source·location·quote 변경은 grounding stale
6. 파일 순서·mtime·출력용 metadata·generated view의 표현 순서 변경은 projection을 바꾸지 않음
7. 같은 mine snapshot의 세 projection은 3-OS에서 byte-identical canonical order와 digest를 냄
8. document gate, `status --open`, `impact`, review/refine가 서로 별도 계산하지 않고 같은 projection API와 stale reason을 사용

## 13. 주요 파일 영향 지도

| 영역 | 주요 파일 |
|---|---|
| entrypoint/config/read | `.weavedoc/bin/weavedoc.mjs`, `core.mjs`, `mine.mjs`, `read.mjs` |
| schema/format | 기존 `.weavedoc/schema`가 v2 계약 정본으로 유지되고 `.weavedoc/schemas/v3` 추가, `.weavedoc/FORMATS.md`, `.weavedoc/READ.md`, `.weavedoc/PARSER-MODEL.md` |
| artifact roles | 신규 `artifact-contracts.mjs`, `ledger-model.mjs`, `hq-ledger.mjs`, `questions-ledger.mjs`, `verified-units.mjs`, `review-model.mjs`, status/validate/doccheck consumers |
| init/templates | `.claude/skills/weavedoc-init/SKILL.md`, `.weavedoc/templates/{config.yaml,project.md,material.md,truth.md,gaps.md,plan.md,review.md}`, 신규 `.weavedoc-state/` 생성·빈 디렉터리 보존 규칙 |
| shared current state | 신규 `truth-model.mjs`, `derived-model.mjs`, finite operator registry, `raw-source-model.mjs`, `material-dependency-model.mjs`, locus-registry adapter, conflict-store adapter, pending-decision adapter, confirmation-map adapter, typed id allocator, `coverage-model.mjs` |
| truth validation | `validate-truths.mjs`, `cmd-validate.mjs` |
| read consumers | `cmd-pull.mjs`, `cmd-census.mjs`, `cmd-scope.mjs`, `cmd-status.mjs`, `cmd-reindex.mjs`, `cmd-impact.mjs`, `cmd-gaps.mjs` |
| verification | `.weavedoc-state/verification.tsv`, `verify.mjs`, `verified-units.mjs`, `cmd-attest.mjs`, 신규 `cmd-confirm-current.mjs`, `cmd-scope.mjs`, `weavedoc-verify/SKILL.md`, `weavedoc-review/references/reviewers.md`, schema의 verify fm/section/verdict 계약 |
| writers | `weavedoc-map/SKILL.md`, 신규 `cmd-map-commit.mjs`·`cmd-resolve.mjs`·`cmd-prune.mjs`·`cmd-rederive.mjs`, `cmd-attest.mjs`, `cmd-reindex.mjs`, `cmd-retag.mjs` |
| writer isolation | `lock.mjs`, `write.mjs`의 `writeDurable`/capability probe, dispatcher, 신규 transaction/recovery adapter와 `cmd-recover.mjs`, 모든 CLI/library entrypoint, 기존 faultinject와 신규 conflict/confirm/prune/recovery/write-order fault driver |
| document context | `cmd-seal-review.mjs`, `cmd-consecrate.mjs`, `review-model.mjs`, `mine.mjs`, plan/refine propagation 계약 |
| source seal | material validator/digest, `weavedoc-gather`·`weavedoc-map`·`weavedoc-verify` skills, material template |
| output | 신규 command render layer/message catalog, CLI golden files, `tests/refresh-golden.sh` |
| interaction | `gaps/gather/init/map/plan/refine/review/verify/write` core 9개와 후속 `enrich` `SKILL.md`, 신규 shared communication protocol+interaction-result schema/report renderer, `tests/doccheck.sh`·신규 skill-protocol fixture |
| gaps | `weavedoc-gaps/SKILL.md`, `cmd-gaps.mjs`, 신규 `cmd-gaps-disposition.mjs`, `gaps-register.mjs`, completeness/acceptance-context tests |
| enrichment | 신규 `weavedoc-enrich/SKILL.md`만 우선; runtime/schema/state 파일 추가 없음 |
| migration | `cmd-upgrade.mjs`, `tests/upgrade-faultinject.mjs`, `UPGRADING.md` |
| docs/policy | `README.md`, `WORKFLOW.md`, `IMPROVEMENT_PLAN.md`, `UPGRADING.md`, `tests/README.md`, 루트 `CHANGELOG.md` |
| regression/property | `tests/regress.sh`의 pristine/mk_v2/fresh-v3 builders, `tests/markdown-model-properties.mjs`, `tests/baseline/golden/{scope,status,status-open,validate,...}`, shipped-template/source/conflict/confirmation fixtures |
| manifest/release/CI | `tests/make-manifest.sh`, `tests/baseline/bundle.manifest*`, `tests/release-notes.sh`, `.github/workflows/ci.yml`, `.weavedoc/VERSION`, 루트 `CHANGELOG.md` |

`.weavedoc/`은 설치·업데이트되는 immutable runtime bundle이고 `.weavedoc-state/`는 광산별 mutable state다. 기존처럼 runtime 폴더를 통째로 교체해도 conflict·confirmation·allocator가 덮이지 않도록 경계를 물리적으로 분리한다. state는 현재 광산의 일부이므로 `.gitignore`하지 않고 Git이 변경을 추적한다. init·fresh clone·upgrade·validate는 state directory와 필수 파일의 생성/검증 규칙을 공유한다. 빈 디렉터리 때문에 검사가 0회 실행되는 상태를 green으로 간주하지 않는다. bundle manifest와 runtime fingerprint는 state **reader code와 bundled schema**만 덮고 광산별 state bytes는 절대 hash하거나 배포 asset에 넣지 않는다.

fresh v3 init은 `conflicts.json`, `pending-decisions.json`, `confirmations.json`, `loci.json`, `id-sequences.json`, `verification.tsv`를 유효한 empty 구조로 만들고 `transactions/.gitkeep` sentinel로 stage root를 Git/fresh clone에서도 보존한다. writer/recover cleanup은 operation-id 하위 경로만 제거하며 root와 sentinel을 지우지 않는다. `transaction.json`은 clean mine에는 존재하지 않고 operation 중 또는 interrupted recovery evidence로만 존재한다. configured v3 mine에서 필수 파일/경로/sentinel 부재·비정규 파일·읽기 실패·malformed JSON/TSV는 “빈 상태”가 아니라 stable diagnostic과 nonzero다. writer는 all-target stage+durable manifest+rename+fresh-read postcondition을 사용한다.

## 14. 구현 중 금지할 우회

- `history: keep | discard` 모드 추가
- truth loser/tombstone 보존
- `corrects` 렌더 확장
- `voided_premise`, rejected digest, rejected-claim cache
- `map-ledger` 같은 영구 winner/loser 판단 장부
- `audit.level` 또는 audit mode를 통한 별도 truth 권한 체계
- 광산 로그나 릴리스 로그를 validator/census/map/gaps 입력으로 사용
- source authority/date 기반 자동 winner
- conflict 질문에 기계 추천 winner 표시
- current truth와 candidate를 같은 truth population에 넣기
- document마다 truth 변경을 eager rewrite
- 새 consumer-local Markdown regex
- consumer-local role enum split·literal section name·private fallback vocabulary
- B를 validate/gaps gate에 결합
- B의 `suggestions.md`를 MVP 필수 상태로 추가
- 실제 review 없이 migration이 seal 재발행
- 검사 불가능한 binary/source를 기계 검증 완료로 표시
- parser refactor와 schema v3를 한 commit에 섞기

## 15. 구현 전에 고정할 세부 결정

다음은 방향을 바꾸지 않는 물리 설계 선택이다. 해당 Phase 시작 전에 red-first fixture와 함께 확정한다.

| 결정 | 확정 기본값 |
|---|---|
| canonical identity key | `(locus, normalized as_of)`; truth id는 의미 key가 아니라 안정적인 파일 주소 |
| locus registry | `.weavedoc-state/loci.json`, `lNNN` + source/user-grounded current labels; transliteration/조어 금지 |
| locus label normalization | decoded Unicode에 NFC+boundary trim만; JSON escaping은 직렬화일 뿐이고 slug·casefold·번역 없음 |
| `claim` exact normalization | Unicode NFC + 바깥 공백 trim; one-line만 허용하고 대소문자·구두점·숫자·단위·내부 공백·동의어는 바꾸지 않음 |
| `as_of` normalization | 없음은 `null`; 날짜/구간은 schema가 허용한 한 가지 typed 표기로만 저장하고 겹침이 애매하면 Human queue |
| artifact role vocabulary | schema v3의 explicit role key가 fixed artifact token을 가리키고 모든 consumer는 공용 typed contract만 사용 |
| derived 계산 | schema-owned finite declarative operator registry+typed units+DAG; arbitrary code 금지, premise writer와 rederive가 같은 calculator 사용; 계산 불능 dependent는 `삭제|derivation-required 이송` 처분(+operation 전체 `취소`) preview 뒤에만 premise 변경과 한 transaction으로 적용 |
| conflict 저장 | `.weavedoc-state/conflicts.json`, open entries only |
| current decision 저장 | `.weavedoc-state/pending-decisions.json`, unresolved full typed payload only; `q:<digest>` 질문 주소 + stable `candidate_id` 연속 identity, answer 후 삭제; 축 판정 순서·전이·재개방은 §2.3.2 고정 전이표 |
| current 확인 기준선 | `.weavedoc-state/confirmations.json`, unit별 latest confirmed projection digest+최소 identity descriptor만 유지; claim/quote/body bytes 금지. 지원 삭제는 결정 시점에 full preview를 보므로 descriptor-only 사후 확인은 주로 out-of-band 삭제 경로다 — v2 "restatement=full"의 의도적 완화이며 옛 문구는 Git 담당 |
| conflict resolver 표면 | agent가 호출하는 atomic CLI command |
| ID allocator | `.weavedoc-state/id-sequences.json`, truth·locus·conflict·candidate namespace별 단조 증가 |
| 광산 로그 | `truths/changelog.md`에 best-effort 한 줄; committed durable-ack 후 lock 유지 상태에서 manifest 밖 append, 그다음 cleanup. 실패·부분 기록은 rc 0 + stable warning, rollback·recovery·terminal root digest(로그 제외 canonical target domain) 불관여 |
| verification ledger | `.weavedoc-state/verification.tsv`, active material·truth·support-edge unit별 최신 cold-verification row 하나 |
| human confirmation | cold ledger와 분리된 current projection map; 둘 다 current digest와 맞아야 verify 완료 |
| 명시적 결정 확인 | expected-snapshot preview digest로 만든 one-use decision token; 승인된 writer 결과/삭제만 동시 confirm, snapshot drift 시 no-write |
| 출하 gate | cold debt=`VERIFY-CURRENT`, human debt=`CONFIRMATION-PENDING`; 둘 다 validate nonzero이고 consecrate가 그대로 상속 |
| raw source 기반 | Phase 1 공용 `raw-source-model`; sorted relative path+NUL+digest, regular-only, symlink/path-escape 거부 |
| operation isolation | 읽기·dry-run 포함 모든 지원 operation에 하나의 exclusive lock; 경합은 wait가 아니라 즉시 거부 |
| multi-file recovery | all-target stage+process-crash-durable `transaction.json`(target별 `create\|replace\|delete`+absent state, regular file 전용 — directory 교체는 consecrate 전용 transaction 소관); target 변경 0 실패는 terminalize 후 정리, 변경 적용 실패는 rollback, SIGKILL은 감지·거부 후 exact state/digest recovery, power-loss capability는 별도 공개 |
| artifact version 권위 | `project.md`와 `config.yaml` 두 값의 필수 agreement; 불일치 시 어느 쪽도 우선하지 않고 `VERSION-MISMATCH` |
| correction-only material GC | 일반 orphan은 explicit prune report+승인; exact conflict-loser-only/reference-zero material만 resolve preview의 같은 승인으로 삭제 |
| Accepted 현재성 | machine-resolvable scope+current `acceptance_context_digest`; mismatch/null은 required gate 차단, re-accept/reopen은 decision writer |
| quote syntax | HTML marker + 바로 뒤 quote block; `location`은 사람용 귀속 표시 — 기계 판정 입력은 source/file resolution과 byte-domain span match이며 location 오기는 cold review 대상 |
| binary source | not mechanically checkable + cold verify |
| B 이름 | `weavedoc-enrich` |
| B 저장 출력 | MVP는 대화만 |

## 16. 최종 완료 정의

다음이 모두 참일 때 이 계획은 완료된다.

1. `truths/t*.md` truth-card population에는 current canonical truth만 있고 workflow/view sidecar를 truth로 세지 않는다.
2. conflict는 별도 임시 상태이며 사용자 결정 전에는 자동 winner가 없다.
3. resolve 뒤 loser·resolution·tombstone이 active mine에 남지 않는다.
4. 과거 값으로 되돌리는 것이 특별한 예외 없이 동작한다.
5. Git·광산 로그·릴리스 로그를 제거하거나 바꿔도 current 판정은 변하지 않는다.
6. 한 truth 수정이 unrelated truth/material/document를 연쇄 편집하지 않는다.
7. provenance, quote seal, digest verification, cold review, writer safety는 유지된다.
8. source에 없는 축자 인용은 기계적으로 차단된다.
9. 모든 사용자 대면 출력은 프로젝트 언어와 통용어를 사용한다.
10. 모든 스킬이 시작·진행·종료 상태를 같은 계약으로 보고한다.
11. gaps A는 current model에서 기존 강제력을 유지한다.
12. enrichment B는 명시 호출형·읽기 전용·비차단으로 동작한다. 이 항목은 v3 core release를 막지 않는 후속 완료 조건이다.
13. v2 실광산 migration rehearsal과 fresh v3 mine이 모두 3-OS에서 green이다.
14. format 변경, migrator, 문서, 테스트가 같은 release에 발행된다.
15. 모든 지원 operation이 같은 exclusive lock 경계를 지키고, mutation의 판단·stage·commit은 같은 transaction 안에서 수행된다.
16. Human queue·questions·verify·review의 token 인식과 semantic role 판정이 한 contract에서 나오며 consumer-local 역할 해석이 없다.
17. multi-file writer는 정상·처리된 실패에서 atomic하고, process-crash-durable 경계 뒤 SIGKILL 상태는 모든 일반 명령이 감지·거부하며 exact-digest recovery만 허용한다. power-loss 보증은 capability report보다 넓게 주장하지 않는다.
18. document stale 판정은 semantic·grounding·completeness 공용 projection으로만 계산되고 support-only 변경을 과잉 전파하지 않는다.

이 계획의 핵심은 장치를 더 얹는 것이 아니다. **현재 사실, 임시 판단, 사람용 과거 기록을 서로 다른 층으로 분리하고 각 층이 다른 층의 권한을 침범하지 못하게 하는 것**이다.
