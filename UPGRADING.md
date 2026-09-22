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

## 광산 루트의 줄바꿈 속성 (`.gitattributes`)

`init`의 다섯째 멱등 보장 클래스입니다. **이 클래스보다 먼저 만들어진 광산에는 이 파일이 없습니다** — 심어지는 파일이라 번들 교체로는 들어오지 않고, `weavedoc-init` 재실행(reconfigure)이 수리입니다.

없을 때의 증상은 조용하지 않습니다. `core.autocrlf=true`가 기본인 플랫폼에서 체크아웃하면 디스크 바이트가 LF에서 CRLF로 바뀌고, 바이트를 그대로 해시하는 지문은 전부 어긋납니다. 실측(eclypse, 2026-09-22): 자료 19건이 유입 지문 변경으로 보고됐고, 디스크의 CRLF를 LF로 환산하자 19건 전부 다시 일치했으며 Git에 저장된 바이트도 일치했습니다. 해시 검사는 정확했고 변조는 없었으며 신호의 전부가 체크아웃이었습니다.

번들 안의 `.weavedoc/.gitattributes`는 `.weavedoc/**`만 고정합니다. 루트 파일은 복사한 폴더에 딸려 가지 않으므로, 광산 자신의 증거는 그 고정 밖에 있었습니다.

**두 층은 반대 규칙이고 합치면 안 됩니다.** 생성되는 광산 텍스트는 LF로 고정하고, 원본(`materials/*/source.*`, `inbox/**`)은 `-text`로 **양방향 변환을 모두 끕니다**. 원본을 LF로 고정하는 것은 수리가 아니라 증거를 고쳐 쓰는 일입니다 — 원본은 도착한 그 바이트일 때만 원본입니다. 컨테이너 원본(docx·hwpx·xlsx)은 바이너리 zip이기도 합니다.

셋째 범주는 **설치된 스킬 트리**(`.claude/skills/weavedoc-*`·`.agents/skills/weavedoc-*`, LF 고정)입니다. 설치본은 release manifest와 디스크 바이트의 해시 대조로 검사하는데, 체크아웃이 스킬을 CRLF로 다시 쓰면 byte-identical한 설치가 그 대조에서 탈락합니다(2026-09-22 하루에 두 번 실측). manifest가 싣는 경계(`weavedoc-*`)로만 스코프하므로 하네스가 같은 루트에 자기 스킬을 미러링해도 건드리지 않습니다. `.codex/hooks.json`은 `JSON.parse` 비교라 CRLF에 면역이고, `.gitattributes` 자신은 CRLF로 체크아웃돼도 파싱되므로 — 둘 다 실측 — 고정하지 않습니다.

**심는 것으로 이미 어긋난 워크트리가 복구되지는 않고, 평범한 checkout으로도 부족합니다.** 실측(git 2.46, `core.autocrlf=true`): 속성을 심은 뒤에도 `git ls-files --eol`은 여전히 `i/lf w/crlf`이고, `git checkout -- .`는 `-text` 경로만 복구하며 LF로 고정한 파일은 그대로 남습니다. 해당 경로를 삭제하고 다시 체크아웃하면 전부 `i/lf w/lf`로 돌아옵니다. 이것이 통하는 이유는 저장된 blob이 처음부터 LF였기 때문이고, 그래서 먼저 확인할 것이 그 점입니다 — Git에 저장된 바이트가 기록된 지문과 여전히 일치하는지 확인하고, 다시 체크아웃한 뒤 `scope`를 돌립니다. **변경으로 표시된 파일을 일괄 재인증해 경보를 지워서는 안 됩니다**: 실제 내용 변경도 밖에서 보면 똑같이 보이고, 같은 실측에서 카드 한 장(t088)은 정말로 바뀐 것이었습니다.

**복구가 되돌리는 축은 하나뿐입니다 — 완료 조건을 그렇게 읽으십시오.** 유입 지문(원본 바이트)은 해소되지만 검증 부채는 다른 축이고 그대로 남습니다. 검증 기록이 `stale`인 것은 그 검증 이후 파일이 실제로 바뀌었다는 뜻이지 체크아웃이 만든 것이 아니므로, 바이트를 되돌려도 사라지지 않습니다. 실측(eclypse, 2026-09-22): 복구 뒤 유입 원본 변경은 **19 → 0건**이 됐고, 자료 검증의 `m029`와 truth 검증의 `t088`은 그대로 `stale`로 남았습니다. 즉 완료 조건은 “`scope`가 전부 초록”이 아니라 **“유입 변경이 0건이고, 남은 것은 복구 전에도 있던 검증 부채뿐”** 입니다. 남아 있다는 사실 자체는 복구 실패의 신호가 아닙니다.
