# upgrade가 legacy-unbound를 표시만 하고 후속 확인 절차로 잇지 않는다

## Status

Done

## Description

eclypse 광산(`D:\repo\eclypse`, truth 266 · 자료 38)에서 2026-08-26 `weavedoc-map` 실전 실행 중 관측. 작업 자체는 정상 완료됐고 `validate`도 통과한다. 아래는 **도구가 사용자를 어디로도 안내하지 않는 지점**이다.

소유자 발화: *"레거시 언바운드가 있으면 그게 맞는 자료인지 확인을 해야지 왜 가만히 있는거야?"*

### 증상

eclypse의 `truths/verify-ledger.tsv`에 `legacy-unbound` 행이 **223건**(m001~m018 + t001~t226 계열, 전부 `2026-08-03` 날짜) 있고 석 달째 그대로다. `scope`는 매번 이것을 보고하며, Hammoc 대시보드는 그 출력을 영문 원문으로 사용자에게 노출한다.

실제 노출 문구:

> verify-ledger legacy row(s) for m001-m015 m017 m018 carry no material origin token ('v1-material-frontmatter') — truths-lane history, not material evidence; ignored, and each material falls back to its own frontmatter. Nothing is damaged, but these materials stay unverified until re-attested

### 설계 판단 자체는 옳다 — 뒤집자는 게 아니다

`FORMATS.md` §`intake --anchor-existing`이 이유를 명시한다:

> a digest minted by a migration reads afterwards as evidence while in fact recording whatever happened to be on disk the moment a tool ran, **including an edit made ten minutes earlier**. That is how a falsified copy becomes canon

마이그레이션이 자동으로 도장을 찍으면 안 된다는 원칙은 유지되어야 한다.

### 문제는 그 다음이 없다는 것

FORMATS.md는 이미 이렇게 적고 있다:

> `upgrade` now **reports** the unbound count and what it costs instead of minting its rows in silence. Leaving materials unbound was always a decision; it was taken on the owner's behalf and never put in front of them

보고까지는 왔는데 **보고 다음이 없다.** 현재 흐름은 이게 전부다:

1. upgrade가 "이건 확인 안 됐다"고 표시한다 (`legacy-unbound`)
2. 끝

해소 수단은 이미 존재한다 — `intake --anchor-existing <note>` 또는 해당 단위의 verify 재실행. 그런데 **어느 명령도 그것을 권하지 않고**, 사용자는 FORMATS.md를 직접 읽어야 그런 명령이 있다는 것을 안다. 그 결과가 석 달 방치다.

"함부로 승인하면 안 된다"와 "미확인 상태를 방치한다"는 다른 것이다. 지금 도구는 전자를 지키려다 후자에 도달했다.

### 소비자 결과

- `scope`/`census`의 `legacy-unbound` 숫자가 **줄어들 경로 없이** 계속 보고된다. 줄지 않는 경고는 읽히지 않게 된다 — FORMATS.md가 `--no-source`를 정당화하며 스스로 든 논리(*"one permanent false alarm is how a warning stops being read"*)가 여기에도 그대로 적용된다
- Hammoc 대시보드에 조치 불가능한 진단 카드가 상주한다 (Hammoc 저장소 ISSUE-131 §3)
- 재확인을 유도하는 유일한 경로가 verify인데, **verify는 장부의 빈 칸을 채우려고 돌리는 명령이 아니다.** 변환 품질을 확인하려고 돌리는 것이므로, 목적이 뒤집힌 실행을 사용자에게 시키는 셈이 된다

### 제안 (최소안)

`upgrade` 완료 시점, 그리고 `scope`가 unbound를 보고할 때 **다음 행동을 명시**한다.

- 종료 메시지에 해소 명령을 문자 그대로 적는다: `intake --anchor-existing "<무엇을 보증하는지>"`. 지금은 개수와 비용만 말하고 명령을 말하지 않는다
- 그 명령이 **무엇을 주장하고 무엇을 주장하지 않는지** 한 줄로 병기한다 (`anchored ≠ verified` — 바이트를 그때 상태로 묶을 뿐 내용을 읽었다는 뜻이 아님). 무심코 실행하는 것을 막는 것이 이 설계의 목적이므로 안내는 경고와 함께 가야 한다
- `source.*`가 없어 ruling이 필요한 자료는 지금처럼 이름을 부르고 건너뛴다 (기존 동작 유지)

한 단계 더 가려면 upgrade가 대상 목록을 보여주고 확인을 받는 대화형 단계를 두되, **비대화형 실행에서는 아무것도 하지 않고 안내만 남긴다.**

### 수락 기준 후보

- upgrade를 실행한 사용자가 FORMATS.md를 읽지 않고도 해소 명령에 도달할 수 있다
- `--anchor-existing`의 의미(anchored ≠ verified)가 그 안내 지점에서 함께 전달된다
- 기존 안전 속성 불변: 마이그레이션은 여전히 digest를 자동 발급하지 않고, 이미 binding이 있는 자료를 재anchor하지 않는다

---

## Severity

medium

## Type

improvement

## Linked Story



## Linked Epic


