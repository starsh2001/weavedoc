# 마지막 파리티 기록 — bash 판 삭제 직전 (2026-08-05)

> **이 문서가 존재하는 이유.** 다음 커밋이 `.weavedoc/bin/weavedoc`(bash 참조 런타임)을 삭제한다.
> 삭제하면 **두 런타임을 대조할 수단이 영원히 사라지므로**, 마지막 대조 결과를 이력에 남긴다.
> 이후 누군가 "Node 판이 bash 판과 정말 같았는가"를 물으면 답은 이 문서와 이 커밋의 트리다.
> 결정: `IMPROVEMENT_PLAN.md` §11, 2026-08-05(사용자) — "bash 삭제 직전에 parity 결과와 장애 주입
> 결과를 별도 커밋으로 고정해, 마지막 비교 기준을 Git 이력에 남겨야 한다."

- 커밋: **`05af5cc`** · 번들 **`2026-08-05.2`**
- 채점 플랫폼: **Linux 컨테이너**(`tests/in-container.sh`) — 두 런타임을 한 플랫폼에서 돌려 **비교에서 플랫폼을 제거**한다. 실광산 대조만 Windows(MSYS) 네이티브.
- 환경: Linux 6.18.33.2(WSL2) · bash 5.2.37 · GNU Awk 5.2.1 · GNU sed 4.9 · Node v20.19.2 / Windows MSYS bash 5.2.26 · gawk 5.0.0 · Node v22.19.0

---

## 1. 회귀 스위트 — 356/356 × 양쪽 러너

```
weavedoc regression — 05af5cc / bundle 2026-08-05.2 / 356 cases, -j6
  env: Linux 6.18.33.2-microsoft-standard-WSL2 · bash 5.2.37
  Node 판 채점 : passed 356 · failed 0 · not yet run 0
  bash 판 채점 : passed 356 · failed 0 · not yet run 0
```

케이스는 전부 **CLI 블랙박스**다 — 광산을 만들고, 명령을 돌리고, stdout과 종료 코드를 본다. 그래서 케이스를 그대로 두고 실행 대상만 바꿔 채점할 수 있고, 그게 이 재작성을 검증한 방법이다.

## 2. 코퍼스 파리티 — 광산 350개 × 읽기 명령 9종, **전체 출력** 대조

```
parity-corpus: all 350 compared mine(s) agree on:
  validate · validate --json · census · scope · status · gaps · impact m001 · pull 위약 · reindex --check
  (3 mine(s) had a (mine, command) pair held out as a declared divergence)
```

회귀 스위트는 **부분 문자열**을 본다 — 문구·개수·동반 줄이 달라도 통과한다. 코퍼스 저울은 **출력 전체**를 바이트로 본다. 349개 케이스가 만드는 광산(= 일부러 깨뜨린 프로젝트 349개)이 그 입력이다.

## 3. 쓰기 명령 파리티 — **전수**, stdout + 종료 코드 + **디스크에 남은 바이트**

쓰기 명령은 stdout만 봐서는 부족하다 — `attest`의 일은 파일 안의 한 행이고 `retag`의 일은 다시 쓰인 목록이다. 맞는 문장을 찍고 틀린 바이트를 쓰는 명령은 stdout 저울을 통과한다. 그래서 **결과 트리를 파일 단위로** 함께 대조했다.

| # | 시나리오 | 결과 |
|---|---|---|
| 1 | `attest verified 2 standard m001 t001` → `scope` `census` `validate` | TRANSCRIPT agree · TREE agree (50 files) |
| 2 | `attest failed 2 standard t001` → `scope` `validate` | agree · 50 files |
| 3 | `attest verified 3 계약검토 m001` (한국어 자유텍스트 standard) → `scope` | agree · 50 files |
| 4 | `reindex` → `validate` | agree · 49 files |
| 5 | `reindex --check` (동기화된 광산) | agree · 49 files |
| 6 | `seal-review d1 draft` → `validate` | agree · 49 files |
| 7 | `seal-review d1 final` → `validate` | agree · 49 files |
| 8 | `seal-review` 재봉인(누적이 아니라 교체) → `validate` | agree · 49 files |
| 9 | `retag 위약 벌칙` (개명) → `validate` `scope` | agree · 49 files |
| 10 | `retag 위약 대금` (기존 태그로 **병합**) → `validate` | agree · 49 files |
| 11 | `retag … --dry` (아무것도 쓰지 않아야 함) → `validate` | agree · 49 files |
| 12 | `upgrade --apply` (v1 → schema 2) → `validate` `scope` `census` `status` | agree · **59 files**(백업 디렉터리 내용 포함) |
| 13 | `upgrade --apply` (verdict 단어를 벗긴 광산 — verify.md를 실제로 편집시킴) → `validate` `scope` | agree · 59 files |
| 14 | `upgrade --check` / `--dry-run` | agree · 49 files |
| 15 | `upgrade --apply` on a v2 mine (할 일 없음) | agree · 49 files |
| 16 | `seal-review d1 draft` → `consecrate d1` → `validate` | agree · 49 files |
| 17 | **`retag` 롤백 경로** (catalog.md 제거 → post-validate 빨강) → `validate` | agree · **48 files** |

**17번이 이 표에서 가장 중요하다** — 실패 후 롤백된 상태의 트리가 두 런타임에서 **바이트 동일**하다는 뜻이다.

## 4. 실광산 — `D:\repo\eclypse` (268 truth · 자료 30), 읽기 명령 전수

```
parity: all 12 command(s) agree
  version · lang · validate · validate --json · census · scope · status · gaps
  · impact m001 · m001 · pull 위약 · reindex --check
```

종료 코드까지 포함해 일치(`impact`/`m001`은 rc 2, 나머지 rc 0). 픽스처가 아니라 **실제로 쓰이는 광산**이라는 점이 이 줄의 값이다.

## 5. 장애 주입 — Node 전용(bash에는 대응 시임이 없다)

읽기 전용 대상·N번째 쓰기 실패·롤백 실패를 **연산 시임**으로 주입한다(PATH 심은 `node:fs`에 닿지 않는다 — consecrate의 선례). 판정 기준은 §9 완료 조건의 "write failure injection에서 partial state 없음"이다.

| 주입 | rc | 결말 | 광산 상태 |
|---|---:|---|---|
| retag, `project.md` 쓰기 실패 | 1 | `a write FAILED mid-rename — every prior edit rolled back … the mine is as before` | t001 `[위약]` · project `[위약]` · plan `[위약]` · **백업 0** |
| retag, 쓰기 실패 + **롤백 복원도 실패** | 1 | `rollback INCOMPLETE — could not restore: truths/t001.md … Do NOT delete that directory until the mine validates clean` | t001 `[벌칙]`(복원 못 함, **정직하게 보고**) · **백업 1개 보존** |
| upgrade, `project.md` 쓰기 실패 | 1 | `a write FAILED mid-migration — every change rolled back, the mine is byte-identical to before` | version 1 · marker 없음 · 생성된 장부 제거 · **백업 0** |
| upgrade, 쓰기 실패 + **`verify.md` 복원 실패** | 1 | `the rollback is INCOMPLETE. Could not verify restored: truths/verify.md …` | **백업 1개 보존** |

**핵심은 4행 전부가 "완전 이전 + rc≠0" 또는 "복구 불가를 명시하고 백업 보존" 중 하나로 끝난다는 것이다.** 반쯤 적용된 채 성공을 보고하는 결말이 없다. 이 4개는 회귀 케이스로도 고정돼 있다(`acct_retag_write_fault_rolls_back` 외 3건).

## 6. 선언된 파리티 예외 — 최종 목록 5건

`IMPROVEMENT_PLAN.md` §11과 `REWRITE_PLAN.md` §4의 표가 정본이고, 여기 요약만 둔다.

1. `version`의 fingerprint — 런타임 자기 바이트를 해싱하므로 **달라야 정상**
2. **argv의 유효하지 않은 UTF-8 바이트** — MSYS→네이티브 경계에서 바이트가 Node에 도달하지 않는다(고칠 수 없다)
3. **`reindex --check`의 diff 본문 hunk 묶기** — 판정·개수·종료 코드는 항상 일치. 실광산 불일치 0건
4. **CRLF가 섞인 광산** — bash의 답이 플랫폼마다 다르다(MSYS는 CR을 벗기고 Linux는 유지). 맞출 단일 답이 없어 포트는 MSYS 답을 택했다. 코퍼스 349개 중 줄바꿈이 섞인 광산은 2개
5. **Windows에서 `config.paths`에 MSYS 형식 절대경로** — `/tmp`는 `C:\tmp`가 아니라 `%LOCALAPPDATA%\Temp`이고 정적 규칙으로 옮길 수 없다. Windows에서는 `C:/…`로 적을 것

**예외는 "봐주는 것"이 아니라 "선언된 것"이다** — 저울이 매 실행마다 인쇄하고, 예외가 **더 이상 갈리지 않으면 STALE로 신고**한다. 봐주고 조용한 예외는 진짜 차이도 봐주게 된다.

---

## 이 기록이 덮지 못하는 것 (정직하게)

- **CRLF truth 위의 `retag`**: bash는 CR을 유지한 채 인용 봉인을 맞춰 실패→롤백(rc 1), Node는 CR을 벗겨 통과→커밋(rc 0). 위 4번 예외와 같은 가족이고 **이 릴리스 이전부터 그랬다**(런타임만 되돌려 재실행해 확인). v0.5.0 공통 장부 파서의 작업 범위로 §11에 명명해 뒀다. 3번 표의 9~11행은 **LF 광산**에서의 일치다.
- **`writePreservingEol`의 빈 줄**: Node는 빈 줄의 CR을 보존하지 않는다(`l === ''` 스킵). 같은 작업 범위.
- **읽기 전용 케이스의 rc≠0 갈래**: 두 채점 플랫폼 모두에서 사실상 도달하지 않는다(Linux는 권한이 rename-replace를 막지 않고, Windows는 `chmodSync` 재시도가 속성을 푼다). 실패 갈래를 실제로 고정하는 것은 **시임 케이스**이고, 그쪽은 위 5절대로 발동한다.
