# UPGRADING — 이 런타임은 이주기를 싣지 않습니다

이 런타임은 **v3 전용**이고, 마이그레이션 도구를 싣지 않습니다. v2→v3 이주기는 0.6.15에서 은퇴했습니다 — v1 경로가 먼저 밟았던 것과 같은 방식으로, **그것을 실은 마지막 번들에 핀으로 고정**해 두었습니다. 은퇴의 근거는 소유자 재정입니다: 사용자가 한 명, 광산이 하나(이미 v3)뿐이라 이 경로의 손님이 영원히 없고, 미래의 사용자는 현행 스키마에서 시작합니다.

## 0.7.0: Codex compatibility

0.7.0은 schema migration이 아니라 harness surface 확장입니다. 기존 mine의 data file은 바뀌지 않습니다. 새 bundle의 `.weavedoc/`와 `.agents/skills/weavedoc-*`를 복사한 뒤 `weavedoc-init`을 reconfigure로 한 번 실행하면 다음을 심습니다.

- `AGENTS.md`의 bundle-owned pointer block (`.weavedoc/templates/agents-block.md`)
- `.codex/hooks.json`의 Codex hook pair (`.weavedoc/templates/codex-hooks.json`)
- 기존 `CLAUDE.md`와 `.claude/settings.json` entry의 현행 copy

Codex project hook은 trusted project에서만 load됩니다. reconfigure 뒤 `/hooks`에서 entry를 한 번 review하고, prompt가 나오면 project를 trust합니다. 이 단계 전에도 skills와 runtime command는 동작하지만, session별 write gate는 load되지 않습니다.

## 스키마가 낡은 광산을 만나면

버전 게이트가 살아 있으므로, 낡은 광산은 어느 일반 명령에서든 한 가지 답 — 어느 체크아웃으로 가라 — 를 받습니다. 판정 없이 거절만 합니다(v2 카드는 v3 필수 키를 전부 만족해서, 게이트가 없으면 v3 규칙 아래 깨끗하게 **오통과**합니다 — 게이트는 이주기와 달리 은퇴하지 않습니다).

| 광산 | 경로 |
|---|---|
| **v2** | 고정 브리지 런타임 **v0.6.14 (commit `924e97e`)** — v2→v3 이주기를 실은 마지막 번들. 그 체크아웃의 `weavedoc upgrade --check` / `--apply`와 그 시점의 이 문서가 정본입니다 |
| **v1** | 먼저 고정 브리지 런타임 **v0.5.21 (commit `0257167`)** 의 `weavedoc upgrade`로 v2까지, 그다음 위의 v0.6.14 브리지로 v3까지 |

브리지 체크아웃은 git에 있으므로 지워진 것이 아니라 **주소가 생긴 것**입니다. 각 브리지의 UPGRADING.md가 그 구간의 백업 규칙(깨끗한 git 워크트리)·차단 항목·보존식 검증을 그대로 담고 있습니다.

## 이주와 무관하게 살아 있는 것

- **`legacy-unbound` 행** — 이주가 남긴 실제 역사입니다. 바이트를 묶지 않는 행으로서 어디서나 따로 세어지고, 리더(`scope`·`census`·`validate`)는 그대로 있습니다. 새로 mint하는 도구만 없습니다.
- **`intake --anchor-existing`** — 남은 backlog를 지금 바이트로 묶는 사람의 행위. 이주기가 아니라 `intake`의 것이므로 그대로 있습니다.
- **버전 게이트** — 위 표가 곧 게이트의 출력입니다.

## 프로젝트 instruction pointer block

브리지에서 이주를 마치고 이 런타임으로 돌아오면, `init`이 `CLAUDE.md`와 `AGENTS.md`에 심은 `<!-- weavedoc:begin -->` block은 여전히 이전 bundle의 것입니다. `validate`가 `CLAUDE-BLOCK-STALE` 또는 `AGENTS-BLOCK-STALE`로 알려 주며, 수리는 `weavedoc-init` 재실행(reconfigure)입니다. marker 바깥의 project-specific text는 그대로 남습니다.
