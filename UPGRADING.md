# UPGRADING — v1 광산을 schema 2로

`project.md`의 `version: 1`인 광산(v0.1.x로 만든 프로젝트)이 대상입니다. v1 광산도 현재 런타임이 **그대로 읽습니다**(dual-reader) — `validate`가 공지 한 줄을 찍을 뿐 막지 않습니다. 마이그레이션은 원할 때 하면 됩니다.

## 절차 — 검사와 적용은 분리되어 있습니다

```bash
bash .weavedoc/bin/weavedoc upgrade --check     # 항목 목록 (read-only; 기본값)
bash .weavedoc/bin/weavedoc upgrade --dry-run   # 전체 계획, 0 write
bash .weavedoc/bin/weavedoc upgrade --apply     # staged 적용 + 사후 full validation + 실패 시 자동 rollback
```

`--check`/`--dry-run`은 마이그레이션이 필요하면 exit 1(스크립트용 신호), 이미 최신이면 "nothing to do"에 exit 0. `--apply`는 두 번 실행하면 두 번째는 0 change입니다(멱등). version 레코드 행렬은 닫혀 있습니다(v0.3.3): 각 레코드는 `1` 또는 현재 schema(`2`)만 허용 — 그 외 값(미래 버전, 오타)은 거부합니다. v0.3.1이 남긴 출처 없는 m-id 행이 있어도 재개된 apply가 올바른 출처 행을 정상적으로 만듭니다(레인별 coverage).

## 무엇이 바뀌나

| 항목 | v0.1 | schema 2 |
|---|---|---|
| id 철자 | `m5` / `t5` 허용 | `m005`/`t005`로 canonicalize — 폴더·파일명, `id:`, strict 참조 필드(source·conflict_with·derived_from·corroborated_by·winner·cited_truths), catalog, coverage까지 |
| `## Verified units` | verdict 없는 성공 행 | `passes N/N` 증거가 있는 행만 ` · verified`를 얻음 — **성공 증거가 없는 행은 기계가 절대 인증하지 않고 이름만 찍습니다** |
| verify.md 절 | Human queue·Adjudications 부재 가능 | 빈 절 보강 |
| review 이력 | gate 밖 `[kind]` 괄호 기록 | 괄호 제거(record form) — **열린 violation이 아니었는지 확인하라고 계획에 표시됩니다** |
| config `repeat` | scalar (`repeat: 1`) | scale map (skip 0 · light/standard는 기존 값 · full은 +1) |
| 검증 이력 | markdown 행뿐 | `verify-ledger.tsv`에 `legacy-unbound` 행으로 실체화 — **digest는 소급 날인하지 않습니다**(§11 결정): 이력은 보존되고, digest-bound는 재검증(attest)으로만 얻습니다. **두 레인, 두 출처**(v0.3.2): truth 행은 `## Verified units`에서, material 행은 자료 자신의 `status: verified`에서 — Verified units의 m-id 언급은 추출 검증의 범위 표시일 뿐 변환 판정이 아닙니다(WD-COR-001). 각 행은 출처 토큰(`v1-truths-ledger` / `v1-material-frontmatter`)을 standard 열에 기록합니다 |
| review frontmatter 없음 | v0.1 review는 fm 블록이 없을 수 있음 | `review_legacy` marker를 담은 fm 블록을 새로 prepend — 이런 광산도 마이그레이션됩니다 |
| 버전 스탬프 | `version: 1` ×2 | `project.md`·`config.yaml` 모두 `version: 2` |

## v0.3.1로 이미 마이그레이션한 광산

v0.3.1의 migration은 m-id 행을 잘못된 레인(truths ledger의 언급)에서 만들었습니다. schema 2 광산은 upgrade를 다시 탈 수 없으므로 **런타임이 fail-safe로 교정합니다**: 출처 토큰이 없는 m-id `legacy-unbound` 행은 material 검증 증거로 인정되지 않고(scope가 무시 사실을 표시), 해당 자료는 자신의 frontmatter로 돌아갑니다 — `status: verified`면 그대로 legacy, 아니면 다시 부채(owed)입니다.

- **영향 판별**: `awk -F'\t' '$1 ~ /^m/ && $3 == "legacy-unbound" && $5 == "-"' truths/verify-ledger.tsv` — 나오는 행이 영향 대상입니다. `weavedoc scope`도 같은 목록을 `pre-0.3.2 m-id ledger row(s) ignored` 줄로 보여줍니다.
- **교정**: 해당 자료를 verify 스킬로 재검증하면 `attest`가 새 행을 append하고 last-row-wins로 자연히 이깁니다. 별도의 행 삭제·수정은 필요 없습니다(장부는 append-only).
- t-id의 출처 없는(`-`) 행은 그대로 유효합니다 — truths 레인은 처음부터 옳은 레인이었습니다.

## 건드리지 않는 것

- **산문과 consecrated 출력**(draft/final 본문) — 바이트 불변. 옛 철자 참조는 관대한 해소가 계속 읽습니다.
- **changelog** — 기록은 역사라 다시 쓰지 않습니다.
- **digest** — 과거 검증에 현재 바이트의 digest를 찍는 일은 없습니다.

## 안전장치

- 적용 전 rename 충돌 전수 검사(하나라도 걸리면 0 byte 기록).
- 모든 원본은 `.upgrade-backup-<날짜>.<pid>/`에 스냅샷 + MANIFEST — 복원 지점이 필요 없어지면 지우면 됩니다.
- 적용 끝에 **full validation이 돌고, 실패하면 전부 자동 원복**됩니다(바이트 동일 — 회귀 케이스가 트리 해시로 증명). 실패 원인은 대개 마이그레이션 이전부터 있던 문제입니다 — 고치고 재실행하세요.
