# UPGRADING — v2 광산을 schema 3으로

이 런타임은 **v3 전용**입니다. `version: 2`인 광산은 모든 일반 명령이 한 가지 답 — "먼저 이주하세요" — 만 주고 아무것도 판정하지 않습니다(v2 카드는 v3 필수 키를 전부 만족해서, 게이트가 없으면 v2 광산이 v3 규칙 아래 깨끗하게 **오통과**합니다).

## 백업 → 변환 → 검증

백업은 **깨끗한 git 워크트리**입니다. 이주기는 그것을 확인만 하고(read-only `git status`), 복원을 대신 실행하지 않습니다 — 되돌리는 말은 언제나 같습니다:

```bash
git restore . && rm -rf .weavedoc-state
```

```bash
node .weavedoc/bin/weavedoc.mjs upgrade --check     # 분류·차단 항목·high-water 보고 (read-only; --dry-run 동일)
node .weavedoc/bin/weavedoc.mjs upgrade --apply     # 변환 + 보존식·exact-validate 검증 (clean git 필수)
```

## 무엇이 일어나나

v2 status 축은 전부 소진됩니다 — 카드마다 처분이 정확히 하나씩:

| v2 상태 | 처분 |
|---|---|
| `ok` (남는 전부) | 카드 유지, `status`·`conflict_with`·`resolution`·`superseded` **줄만** 제거(그 외 바이트 불변) |
| `discarded` / `retracted` | 카드 삭제(과거는 git), 그 카드의 verify 장부 행도 함께 제거 |
| `conflict` | `.weavedoc-state/conflicts.json`의 **무손실 후보**로 이동 — 살아남는 `ok` 짝이 있으면 그 카드가 entry의 target, 전원 conflict면 `targets: []`(아직 아무도 안 정한 상태). **이주는 충돌을 해결하지 않습니다** — 보관 장소만 옮기므로, 이주 직후 validate가 그 entry로 빨간 것이 정상이고, 사람이 판정해 entry를 삭제할 때까지 유지됩니다 |

`superseded`는 카드 종류가 아니라 **승자 카드의 필드**입니다 — 지우면 현재 사실이 사라지므로 절대 삭제 축이 아닙니다. `decided_by: machine`인 v2 resolution은 **보고만** 됩니다: 기계가 골랐던 값이 현행 카드로 남는데, 재론할지는 이주 후 사용자의 몫입니다.

새로 생기는 것: `.weavedoc-state/{conflicts.json, id-sequences.json}` (allocator의 next는 삭제 **전** 전수 스캔의 high-water 위 — 문서 인용·장부·로그의 id 토큰까지 셉니다), 그리고 `project.md`·`config.yaml` 모두 `version: 3`.

## 첫 쓰기 전에 멈추는 것들 (v2에서 정리하고 재실행 — 결정 저장 장치는 없습니다)

- **`status: unsupported` 카드** — v3에서는 "존재=정본"이라 근거 깨진 카드가 조용히 승격됩니다. 재-grounding하거나 삭제하세요.
- **`resolution.type: attribute` 쌍(승인된 병기)** — 기록만 벗기면 "놓친 모순"과 구별 불가한 카드 두 장이 남습니다. "둘 다 맞다"는 언제나 숨은 축(시간·관점·정의·범위, 최후는 출처 귀속)이 있습니다 — 그 축을 claim에 새겨 분리한 뒤 재실행.
- **삭제/이동될 카드를 인용하는 문서** — 인용을 먼저 고치세요. 매달린 인용은 id 규율이 막으려는 바로 그 부패입니다.
- (경고) **마지막 담지 카드가 떠나는 required_tag** — 이주 후 REQTAG-EMPTY가 예고되므로 apply가 거부합니다.

## 검증 — 이주의 보증

- 보존식: v2 카드 수 = 남은 카드 + 삭제 + 이동, 누락·중복 0.
- 이주 직후 validate는 **예측된 CONFLICT-OPEN 한 줄만** 내야 합니다 — 그 외 무엇이든 나오면 이주는 실패로 보고되고 복원 문구를 출력합니다.

## v1 광산은?

이 런타임에는 v1 리더가 없습니다. 고정 브리지 런타임 **v0.5.21 (commit `0257167`)** 의 `weavedoc upgrade`로 v1→v2를 먼저 밟은 뒤, 이 런타임으로 v2→v3를 밟습니다. (v1→v2에서 무엇이 바뀌는지는 그 브리지 체크아웃의 UPGRADING.md가 정본입니다.)
