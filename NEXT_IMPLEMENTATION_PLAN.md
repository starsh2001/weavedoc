# WeaveDoc schema v3 최소핵 구현 계획

> 상태: **2026-08-12 범위 재결정(사용자 직접 결정) 반영 — 이전 8차 동결본(1400줄)을 이 문서가 대체한다.** 동결본이 필요하면 이 파일의 Git 이력(`ae33d26` 시점)을 본다. 폐기 항목의 상세 논거를 다시 파고들 일이 생겨도 동결본을 근거로 재도입하지 않는다 — 재도입은 §5의 폐기 사유를 뒤집는 새 실측이 있을 때만.<br>
> 기준선: 발행 v0.5.21 · 미발행 번들 `2026-08-08.14` = `ae33d26`(584/584 · 3-OS green)<br>
> 목표 릴리스: schema v3 (버전 번호는 구현 완료 후 결정)

## 0. 분업 — 모든 항목이 이 세 줄 안에서만 움직인다

1. **의미 판단은 전부 AI(스킬)가 한다.** 같은 사실인지, 충돌인지, 어떤 태그가 맞는지, 인용이 의미를 왜곡했는지 — 언어의 모양을 읽는 판단을 기계 코드로 만들지 않는다.
2. **결정은 전부 사람이 한다.** 충돌 해소, 채택, 삭제, 되돌림. 기계는 추천 winner도 내지 않는다.
3. **기계는 탐색을 좁히고(태그·인덱스), 장부를 지키고(ID·개수·차단), 바이트 인계철선(substring seal·digest·fail-closed)을 당기는 것뿐이다.** AI가 모든 곳을 다 찾아보지 않도록 도와주는 역할만 한다.

이전 계획이 1400줄로 커진 원인이 정확히 이 경계 위반이었다. quote 문법, locus 동일성, 6축 전이표는 전부 기계에게 언어 모양 판단을 시키는 장치였고, 텍스트는 무한하므로 그 케이스도 무한했다(최근 P1 무한 루프의 근원). 구현 중 어떤 항목이 이 세 줄 밖으로 나가려 하면 그 항목이 잘못된 것이다.

## 1. 유지되는 제품 결정

- **canonical-current는 필수다(A안 "v0.5.21 동결" 탈락).** 사실 하나를 고치면 연관 파일 전부에 기록이 번지고, 수정·되돌림은 생각보다 잦다. 광산에는 현재 정본 하나만 두고 과거는 Git이 담당한다.
- 기계는 winner를 고르지 않는다. 권위·날짜·최신성 기반 자동 해소 없음.
- 파란→초록→파란은 정상적인 두 번의 제자리 갱신이다. suppression·재제안 억제 기록은 만들지 않는다.
- 시간 범위가 실제로 다른 사실(`as_of`가 다른 둘)은 충돌이 아니라 별개 카드다. 설정 개정(retcon)이면 이전 값을 제거한다.
- 충돌 **감지**는 지금처럼 map(AI) 몫이다(`conflicts.detection` 강도 설정 유지). 기계는 미해결 항목이 있으면 출하를 막을 뿐이다.
- 질문·대기는 기존 사람 장부(questions.md·Human queue)가 담당한다. 새 질문 상태기계를 만들지 않는다.
- 정정은 재-grounding이다: 정정 내용이 material로 들어오고 카드의 source·location·quote가 그 자료를 가리키게 바꾼다. 손으로 다시 치지 않는다.

## 2. 최소핵 — 만들 것 다섯 가지

### 2.1 canonical 카드 제자리 수정

v2 truth 계약에서 네 필드를 제거한다. 실측한 현행 스키마 기준 정확한 diff:

| 스키마 줄 | v2 | v3 |
|---|---|---|
| `truth.fm.required` | `id\|claim\|source\|tags\|status` | `id\|claim\|source\|tags` |
| `truth.fm.optional` | `location\|conflict_with\|resolution\|superseded\|provenance\|derived_from\|assumptions\|as_of\|corroborated_by` | `location\|provenance\|derived_from\|assumptions\|as_of\|corroborated_by` |
| `truth.fm.enum.status` (`ok\|conflict\|unsupported\|discarded\|retracted`) | 있음 | 삭제 |
| `truth.fm.resolution.*` 3줄 (`type`·`decision_kind`·`decided_by`) | 있음 | 삭제 |

- **파일이 존재하면 canonical이다.** `status: ok` 상수도 두지 않는다. 근거가 깨졌는지는 기존 인계철선(quote seal·validate)이 계산한다.
- 값이 바뀌면 **같은 `tNNN` 파일을 제자리에서 갱신한다(ID 불변)**. 문서 citation과 연관 데이터의 연쇄 수정을 피하는 것이 canonical-current의 핵심 효용이다.
- 갱신 주체는 map 스킬(AI)이고, 광산 로그 한 줄은 v2 kinds(`added|edited|removed|confirmed`)로 충분하다. verify의 확인 흐름(광산 로그 기준선 + 전량 재현)도 v2 그대로다.
- `derived`(provenance)는 v2 의미 그대로: AI가 유도하고 `derived_from`을 남기며, 전제가 바뀐 것을 알아채는 것도 AI(verify/map)다. 기계 재계산 없음.
- `corroborated_by`는 v2 필드 그대로 유지한다. "같은 사실의 새 근거"는 새 카드가 아니라 이 필드에 합류한다(같은 사실인지의 판정은 AI).
- **소비자 정리**: pull·validate·census·scope·reindex·status·gaps에서 status 분기를 삭제한다. gaps coverage의 live 필터(`not discarded/retracted`)도 삭제 — 존재=live. 삭제 전 소비처를 grep으로 전수 열거한다(재사용 리더가 폐기된 규칙을 들고 있는 클래스 방지).
- 제거된 필드는 스키마 목록에서 빠지므로 기존 frontmatter 검사(required/optional 대조)가 잔존 필드를 거부한다. 실측해서 unknown-field 검사가 없으면 그때 한 줄 추가한다.

### 2.2 conflicts.json — 임시 충돌 장부

위치: `.weavedoc-state/conflicts.json` (신설 디렉터리. 이유 하나뿐 — 런타임 번들 `.weavedoc/`을 통째로 교체해도 광산 상태가 덮이지 않게 물리 분리. state는 Git이 추적한다).

- **open 충돌만 담는다. 해소 = entry 삭제.** archive 절, accepted 절, 승패 기록, 재제안 억제 목록은 없다.
- entry 구성(정확한 JSON 형태는 슬라이스 1 첫 fixture에서 고정): `id(cNNN)` · `targets[]`(영향받는 기존 카드 id 0..N — 확정 current가 없으면 빈 배열) · `candidates[]`(도전 주장 각각의 claim·source·location·본문 인용·tags 전문 — 카드가 아니므로 truths/·index·coverage에 들어가지 않는다) · `created` · `note`.
- 기계의 역할은 둘뿐이다.
  - **장부 위생**: well-formed JSON, dangling target(없는 `tNNN` 참조) 거부, `cNNN` 재사용 금지.
  - **인계철선**: open entry가 하나라도 있으면 `validate` nonzero + `consecrate` 거부, `status --open`에 conflict lane 하나 추가(스킬 종료 보고와 동치).
- 해소 다섯 갈래는 전부 **사람이 결정하고 AI가 적용**한다: 현재값 유지(entry 삭제만) / 새값 채택(카드 제자리 갱신 + 삭제) / 같은 사실(corroborated_by 합류 + 삭제) / 분리·병합(카드 편집, 새 ID는 allocator, + 삭제) / 전부 기각(카드 0개 + 삭제).
- **분리·병합이 v2의 병기(attribute)를 흡수한다.** "둘 다 맞다"는 언제나 숨은 축(시간·관점·정의·범위)이 있다는 신호다 — 그 축을 claim에 새겨 두 카드가 더는 부딪히지 않게 만들고, 허가 기록은 남기지 않는다(카드 자체가 답이다). 축을 못 짚으면 **출처 귀속**("자료 A는 X라 한다" / "자료 B는 Y라 한다")이 항상 가능한 최후의 분리축이다. 진짜로 남는 충돌은 "아직 못 정했다"뿐이고 그것은 open entry로 출하를 막는다.
- **"카드 0개"는 두 가지 다른 상황에서 나오고 섞으면 안 된다**: ① open entry의 `targets=[]` = *아직 아무도 안 정했다*(미결·출하 차단) ② 해소 결과의 0개 = *사용자가 전부 틀렸다고 정했다*(정상·통과). 해소가 끝나면 남는 카드는 보통 하나이고, ②만 예외적으로 0개다.
- open 중에 target 카드가 바뀌어도 기계는 추적하지 않는다(stale-digest 기계 없음). 해소 시점에 AI가 현재 바이트를 다시 읽고 판단한다.
- 쓰기 표면은 소형 CLI(`weavedoc conflict add|list|remove` 가칭)로 좁힌다 — 스킬이 JSON을 손으로 편집해 장부를 깨는 경로 차단. v2 Human-queue CLI write path 선례를 따른다.

### 2.3 ID allocator

위치: `.weavedoc-state/id-sequences.json`. truth·material·conflict 3개 namespace의 단조 증가 카운터.

- **삭제된 번호는 재사용하지 않는다** — 옛 문서 인용이 다른 사실을 가리키는 사고 방지. 번호 구멍은 정상이다.
- 발급은 지원 명령(`weavedoc alloc <ns>` 가칭)으로만 한다. 스킬이 디렉터리 스캔으로 발급하지 않는다.
- 인계철선: `next ≤ 관측 max`면 validate 오류(allocator 침범 감지).
- 초기값은 migrator가 **삭제하기 전에** 전수 스캔으로 만든다: 카드 파일명 + index/tree + verify 장부 + 문서 citation + 광산 로그의 id 토큰(숫자 증거로만). 신뢰할 high-water를 만들 수 없는 손상 광산이면 migration을 중단한다.

### 2.4 단순 migrator — 백업 → 변환 → 검증

기존 `upgrade` 명령을 확장한다(v0.5.21의 v1→v2 선례). 6층 debt manifest 없음.

**백업(전제)**: 광산 Git 워크트리 clean 요구 — 이것이 백업이고, 실패 복구는 Git 복원 안내다(기계가 git reset을 자동 실행하지 않는다). `version: 2` 확인.

**변환(기존 진입 잠금 안, 순서 고정)**:
0. **차단 항목 선별(첫 쓰기 전, 보고만)**: 아래 두 종류가 하나라도 있으면 **아무것도 쓰지 않고** 전수 목록과 함께 중단한다. 처리 방식은 결정 저장 장치가 아니라 재실행이다 — 사용자가 AI와 함께 v2 광산에서 항목을 정리한 뒤 migrator를 다시 돌린다(새 기계 0).
   - `status: unsupported` 카드: 근거 깨진 카드를 조용히 canonical로 승격하지 않는다 — v3는 "파일 존재 = canonical"이라 넘어가는 순간 표식이 사라진다. 정리 갈래는 `재-grounding | 삭제` 둘.
   - `resolution.type: attribute` 쌍(사용자 승인 병기): 승인 기록만 벗기면 무표식 카드 2장이 되어 "놓친 모순"과 구별 불가가 된다. 정리 = "어떤 축이 달라 둘 다 맞는가"(시간·관점·정의·범위)를 claim에 새기는 분리 재작성(§2.2) — 축을 못 짚으면 출처 귀속으로 분리한다.
   - 실측: eclypse에 두 종류 모두 **0건** — 이 중단의 현재 비용은 없다.
1. high-water 전수 스캔(§2.3) → `id-sequences.json` 생성
2. `discarded`·`retracted` 카드 삭제(전수 목록 보고) + 삭제 카드의 verify 장부 행 제거(그 외 행 불변). **`superseded`는 삭제 축이 아니다** — status 값이 아니라 **승자 카드에 붙는 필드**라서(v2 스키마 실측: "on a winner"), 카드 종류로 읽고 지우면 현재 정본이 사라진다. 그 필드는 4단계가 줄만 제거한다.
3. `status: conflict` 카드 → conflicts.json candidate로 이동하고 카드 삭제. 묶음(conflict_with로 연결) 안의 `ok` 카드가 target으로 남는다. 묶음 전원이 `conflict`면 `targets=[]` — 규칙이 total해서 모호 축이 없고, 중단할 일도 없다.
   **migration은 충돌을 해결하지 않는다 — 미결 상태 그대로 보관 장소만 옮긴다.** 이식 직후의 `targets=[]`는 §2.2 ①(미결)이지 ②(전부 기각)가 아니며, 이식된 entry는 전부 open이라 이사 직후 validate는 정상적으로 red다. 하나만 남는 것은 그 뒤 사용자가 결정한 시점의 일이다.
   실측: eclypse에 `status: conflict` 카드는 **0개**(`ok` 248 · `discarded` 26)다. 이 경로는 안전장치이므로 실광산 fixture가 없다 — 합성 fixture로 두 형태(ok 짝 있음/전원 conflict)를 모두 만든다.
4. 남은 카드에서 4개 필드 **줄만 제거**(재직렬화 금지 — 그 외 바이트 불변)
5. `conflicts.json` 생성(3에서 만든 entry 포함, 없으면 유효한 빈 구조), config.yaml `version: 3` flip
6. index/tree 재생성, 광산 로그 한 줄(best-effort)

**검증**:
- 보존식 하나: **v2 카드 수 = 남은 카드 + 삭제 + candidate 이동, 누락·중복 0건.**
- v3 validate 결과가 예상 목록과 exact 일치(이식된 open conflict 항목까지 id 단위로).
- materials/·documents/·questions.md·verify.md·gaps.md 등 무관 파일 바이트 불변(사람 장부는 건드리지 않는다).
- 실패 시 중단 + Git 복원 안내. 중간 crash도 clean-tree 전제라 Git이 복구한다.

**보고만 하는 것**: `decided_by: machine` resolution을 벗긴 카드 목록(차단 없음 — v2에서 기계가 정한 winner를 재검토할지는 사용자 선택).

**버전 정책**: v3 런타임의 일반 명령은 `version ≠ 3`이면 fail-closed + upgrade 안내. v1은 별도 진단으로 bridge(v0.5.21 = `0257167`)를 안내(기존 결정 유지). **v2/v3 병행 consumer는 없다** — 알려진 광산은 eclypse 하나다. migrator만 자체 v2 지식을 내장한다. version 선언은 v2 현행 그대로 config.yaml 한 곳(이중 선언 도입 안 함).

### 2.5 뷰 재생성

- index.md·tree.md는 기존 `reindex`가 canonical 카드만으로 재생성한다(status 표기 삭제).
- `census`: 번호 구멍 무경고(allocator가 설명한다), 폐기 수·광산 로그 해명 제거.
- 문서 전파는 v2 그대로(기존 stale 표시 + review 루프). 새 projection digest 기계는 없다.

## 3. locus 대체 — 태그 규율 (새 기계 0)

`lNNN` registry 대신 **사용자의 태그 원칙을 map 스킬에 규율로 적는다.** tags·retag·required_tags·scope_tags는 전부 v2에 이미 배선되어 있으므로 새 기계는 0이다.

1. 새 진실을 만들거나 기존 진실을 바꾸기 **전에** 기존 태그 목록(tree.md)을 먼저 본다.
2. 유사 태그를 재사용한다 — 새 태그 남발 금지.
3. 태그 선택이 애매하면 사용자에게 묻는다.
4. 카드를 수정할 때 태그가 여전히 맞는지 재확인한다.

태그는 **주제의 이웃**(탐색 좁히기)이고, "같은 사실인가"의 최종 판정은 그 이웃 안에서 AI가 한다. 기계는 태그 문자열을 의미로 해석하지 않는다 — 같은 태그를 가진 카드 목록을 좁혀 주는 것까지가 기계 몫이다.

스킬은 실행할 수 없으므로 doccheck이 map 스킬의 규율 문구 존재를 **텍스트로** 검사한다(v0.5.21 init 폴더 검사 선례).

## 4. 이미 커밋된 자산의 처리

| 자산 (번들) | 처리 |
|---|---|
| parser/state 리팩터링 (`e524511`·`bcf804d`) | 유지 — 이 계획의 기준선. |
| artifact-contracts 로더 + `schemas/v3` (`.3`~`.7`) | 커밋 유지·**휴면**. 소비자 전환 안 함 — v2 positional 계약이 계속 정본. truth 계약 변경은 기존 `.weavedoc/schema` **한 장**을 v3로 고친다(정본은 언제나 한 장). |
| raw-source-model (`.8`~`.9`) | 커밋 유지·**휴면**. 게이트 연결 안 함. |
| quote-marker-model (`.10`~`.14`) | 커밋 유지·**휴면**. 인용 보증은 v2 substring 인계철선(`SEAL-QUOTE-MISSING`)이 계속 담당하고, 정교한 의미 왜곡은 cold review(AI) 몫. |
| 회귀 584 케이스 · 3-OS 하네스 | 그대로. 새 케이스는 여기에 얹는다. |

휴면 = 코드와 테스트는 남기되 프로덕션 경로에 연결하지 않고, 이 계획의 완료 조건에도 넣지 않는다.

## 5. 폐기/미도입 목록 — 각 한 줄

| 항목 | 폐기 사유 |
|---|---|
| locus registry(`lNNN`·loci.json)·canonical key `(locus, as_of)`·label/alias·claim 정규화 | 이름의 동일성은 언어 모양 판단이라 기계 몫이 아니다 — 태그 규율(§3) + AI 판정으로 대체. |
| §2.3.2 6축 고정 전이표·pending-decisions.json(`q:key`·candidate_id·blocked_by·보존식) | 질문 상태기계는 그 자체가 유지 대상 기계가 된다 — 대기·질문은 기존 questions.md·Human queue로 충분. |
| derived 계산기(operator registry·DAG·rederive·`DERIVED-STALE`·처분 계약) | 계산의 의미를 기계가 소유하려는 장치 — derived는 v2처럼 AI가 유도하고 사람이 확인한다. |
| confirmation map 개편(confirmations.json·decision token·confirm-current) | 확인은 의미 행위라 기계 상태로 옮기지 않는다 — v2 확인 흐름(광산 로그 기준선 + 전량 재현) 유지. |
| migration 6층 expected-debt manifest | 보존식 한 줄 + exact validate 대조로 충분 — 층위 장부는 그 자체가 새 기계다. |
| quote marker·raw-source **게이트 연결** | 모듈은 휴면(§4) — 인용 보증은 v2 substring 인계철선으로 충분하고, 의미 왜곡은 cold review(AI) 몫. |
| §2.8 mutation-lock 완전판(durable transaction manifest·recover·phase 사다리·전 명령 exclusive lock) | clean-Git 전제와 기존 진입 잠금으로 복구 가능한 실패 계급에 상태기계가 과대하다. |
| material dependency graph·prune·conflict-loser 자동 삭제 | 무참조 material은 드물고 삭제는 사람이 Git으로 한다 — 자동 GC는 새 기계다. |
| support edge 모델(`s:` 키·S1 lens·typed coverage edge) | corroborated_by 필드 유지로 충분 — 근거가 같은 사실을 지지하는지는 AI/cold review 판단이다. |
| 문서 projection digest 3종(semantic·grounding·completeness) | 문서 신선도의 의미 판단을 기계화하는 것 — v2 stale 표시와 review 루프 유지. |
| 사람용 출력 개편(ko/en catalog·interaction-result schema·report helper·300자 계약) | 표현 계층 전면 개편은 이 릴리스의 문제가 아니다 — 보고 규율은 스킬 문서로. |
| enrichment B(`weavedoc-enrich`) | 광산 코어가 안정되기 전의 부가 기능이다. |
| artifact-contracts **소비자 전환**(§7.1 role flip) | 필요가 실측되기 전의 구조 완결주의 — 로더는 휴면 보존(§4). |
| version 이중 선언(project.md+config.yaml agreement)·v2/v3 병행 consumer·지원 수명 3단계 | 알려진 광산이 하나(eclypse) — v3 전용 런타임 + migrator 안내로 충분. |
| gaps A 이식(acceptance_context_digest·gaps-disposition writer) | Accepted 신선도의 의미 판단 기계화 — 기존 gaps 배선 유지, recheck는 gaps 스킬(AI) + 사람. |
| 신설 CLI 대군(map-commit·resolve·rederive·confirm-current·prune·recover·gaps-disposition·report) | 폐기된 기계들의 표면이었다 — 남는 신설은 conflict 장부 명령과 ID 발급뿐. |

재도입 조건은 하나다: 해당 줄의 사유를 뒤집는 **실측**(실제 광산에서 반복 발생한 결함/비용). 설계 완결성은 재도입 사유가 아니다.

## 6. 구현 순서

기존 검증 규율을 그대로 따른다 — red-first(불가능하면 변이 kill), 커밋 전 콜드 diff 리뷰, 태그 전 Linux 컨테이너 1회, 태그에서 3-OS. 이 계획은 규율을 바꾸지 않는다.

### 슬라이스 1 — v3 계약과 상태 파일
- `.weavedoc/schema` truth 계약 수정(§2.1 diff), fresh init이 v3 광산 생성(빈 conflicts.json·id-sequences.json 포함)
- conflicts.json/id-sequences.json 리더 + 소형 CLI(conflict add/list/remove·alloc) + validate 인계철선(장부 위생·출하 차단·allocator 침범)
- 소비자에서 status 분기 전수 삭제(grep 열거 → 삭제 → 케이스), `status --open` conflict lane
- **기존 스위트 처분**: v2 계약을 검사하는 케이스는 전수 열거 후 **삭제** — 2026-08-13 실측 **22개**(resolution 문법·conflict 짝·discarded 라벨·superseded 표시 등, `block_resolution_type`·`block_conflict_oneside`류). truth 픽스처에 `status: ok` 줄만 쓰는 케이스는 픽스처 수정으로 보존 — 실측 **16개**. 남는 케이스는 전부 v3에서도 유효한 계약의 감시자여야 한다. 죽은 계약의 케이스를 green으로 유지하려는 시도는 폐기한 기계를 되살리는 압력이므로 금지("테스트가 결함을 잠근다"의 거울상) — 케이스 수 감소는 이 전환의 정상 산출물이다
- `version ≠ 3` fail-closed 진단(v2 → upgrade 안내, v1 → bridge 안내)
- 완료: fresh v3 광산에서 전 명령 green, v2 광산은 안내와 함께 거부, 스위트에 v2 계약 감시자 0(삭제 목록을 커밋 메시지에 열거)

### 슬라이스 2 — migrator
- upgrade 확장(§2.4 순서), 보존식·exact validate 대조·무관 파일 불변 검증
- **eclypse 사본** migration 리허설(원본 불가침) — 274개 카드 실측이 첫 번째 증거
- 완료: 리허설 광산에서 validate green(이식된 open conflict 제외 exact), 보존식 성립

### 슬라이스 3 — 스킬 문서와 릴리스
- map: 태그 규율(§3)·충돌→conflicts.json 흐름·제자리 정정 반영 / verify·gaps 등: 폐기된 개념(status 분기 등) 제거, 종료 보고에 conflict lane 포함
- doccheck: map 규율 문구 텍스트 검사, FORMATS/README/UPGRADING 정합
- 릴리스: schema·migrator·문서·테스트를 한 태그에 발행
- 완료: §9 완료 정의 전체

## 7. 수용 테스트

1. 파란→초록: 같은 `tNNN` 제자리 갱신, 무관 파일 바이트 불변
2. 초록→파란 재갱신이 suppression 없이 정상 동작
3. 충돌 감지 시 conflicts.json entry 생성, canonical 카드 바이트 불변
4. open conflict ≥ 1이면 validate nonzero + consecrate 거부, 해소(entry 삭제) 후 통과
5. 해소 뒤 광산 어디에도 loser·승패 기록 0건, 같은 주장 재입력이 정상 재비교
6. 해소 결과 남는 카드는 하나다 — 새값 채택·현재값 유지 어느 쪽이든 `tNNN` 하나 + conflicts.json 항목 0개 + validate 통과
6b. 예외로 사용자가 후보를 **전부 기각**하면 카드 0개가 정상 결과(§2.2 ②)이고 validate가 통과한다 — 미결 상태의 `targets=[]`(①)는 같은 0개여도 validate red로 갈린다
7. dangling target·malformed JSON·`cNNN` 재사용을 validate가 각각 구분해 거부
8. 삭제된 `tNNN`이 재사용되지 않음(allocator next > max, 침범 시 validate 오류)
9. census가 번호 구멍을 경고하지 않음
10. 카드의 v2 잔존 필드(status 등 4종)를 validate가 거부
11. migrator 보존식: v2 카드 수 = 남은 카드 + 삭제 + 이동, 누락·중복 0건
12. migrator: `discarded`·`retracted` 카드 삭제; **`superseded` 필드를 가진 승자 카드는 삭제되지 않고** 필드 줄만 제거된다(그 외 바이트 불변) — 이 카드를 지우는 구현은 red
13. migrator: `conflict` 카드 이동 — `ok` 짝은 target, 전원 `conflict`면 `targets=[]`; 두 형태 모두 이식 후 entry가 open이라 validate red이고, 기계가 고른 winner 0건
14. migrator: 문서 citation 속 tNNN이 카드 max보다 커도 allocator next가 그보다 큼
15. migrator: 삭제 카드의 verify 장부 행 제거, 그 외 행·사람 장부(questions/verify/gaps) 바이트 불변
16. `version: 2` 광산에 일반 명령 fail-closed + upgrade 안내, v1은 bridge 안내
17. 제자리 갱신 후에도 v2 quote substring 인계철선이 그대로 동작(새 quote가 converted.md에 없으면 red)
18. `status --open` conflict lane 총계·목록이 스킬 종료 보고와 동치 — **공허 금지**: 두 표면 모두 최소 1건이 실제로 표시되는 fixture로 검사하고, 그 1건이 open임은 validate가 독립 확인한다(두 표면이 같은 리더 결함을 공유해도 0=0 일치로 통과하지 못하게)
19. doccheck이 map 스킬의 태그 규율 문구를 검사(빼면 red)
20. `decided_by: machine` 카드가 migration 보고서에 열거되고 차단은 없음
21. migrator: `status: unsupported` 카드가 하나라도 있으면 첫 쓰기 전에 중단하고 전수 목록을 내며, 광산 전체가 바이트 불변
22. migrator: `resolution.type: attribute` 쌍도 동일하게 쓰기 0회 중단 + 전수 목록; 분리 재작성(claim에 축 명시) 후 재실행은 정상 완료되고 두 카드 모두 canonical로 남음

## 8. 구현 전에 고정할 세부 결정 (기본값 제시 — red-first fixture와 함께 확정)

| 결정 | 기본값 |
|---|---|
| 상태 파일 위치 | `.weavedoc-state/{conflicts.json, id-sequences.json}` — 런타임 폴더 교체가 상태를 덮지 않게 |
| conflict CLI 표면 | `weavedoc conflict add\|list\|remove` 가칭 |
| ID 발급 표면 | `weavedoc alloc truth\|material\|conflict` 가칭 |
| conflicts.json 정확 스키마 | §2.2 구성 요소 기준, 슬라이스 1 첫 fixture에서 JSON 형태 고정 |
| `decided_by: machine` 이력 | migrator 보고만(차단 없음) — 재검토는 사용자 선택 |
| unknown-field 검사 | 기존 frontmatter 검사가 잔존 필드를 잡는지 실측 후, 없으면 한 줄 추가 |

## 9. 완료 정의

1. truths/에는 current canonical 카드만 있다 — status·승패 필드 0건.
2. 충돌은 conflicts.json에만 있고, open이 하나라도 있으면 출하가 막힌다.
3. 해소 뒤 loser·이력이 광산에 남지 않고, 같은 주장이 다시 오면 다시 비교된다.
4. 이전 값으로 되돌리기가 예외 없이 정상 갱신으로 동작한다.
5. 삭제된 ID는 어느 namespace에서도 재사용되지 않는다.
6. 카드 하나의 수정이 무관한 truth/material/document를 연쇄 편집하지 않는다.
7. v2의 바이트 인계철선(quote substring seal·digest 검증·fail-closed validate)이 전부 유지된다.
8. map 스킬이 태그 규율을 담고 doccheck이 그것을 검사한다.
9. 기계가 winner를 고르거나 추천하는 경로가 0건이다.
10. eclypse 사본 migration 리허설과 fresh v3 init이 모두 3-OS에서 green이다.
11. schema·migrator·문서·테스트가 같은 릴리스에 발행된다.

이 계획의 핵심은 장치를 얹는 것이 아니라 **경계를 지키는 것**이다: 의미는 AI가 읽고, 결정은 사람이 내리고, 기계는 장부와 바이트만 지킨다.
