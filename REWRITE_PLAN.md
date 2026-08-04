# WeaveDoc — Node.js 재작성 계획

> 결정: 2026-08-04 (사용자). §11 결정표에 같은 날 행으로 기록.
> **이 문서는 같은 날 먼저 쓰인 `GO_REWRITE_PLAN.md`를 대체한다.** 그 계획은 Node를 443ms로 잰
> 잘못된 측정 위에 서 있었다 — MSYS bash 안에서 재는 바람에 MSYS의 프로세스 생성세(~320ms)가
> 통째로 섞였다. 네이티브에서 다시 재니 Node는 그 1/5이었고, 결론이 바뀌었다.

## 0. 무엇을 왜 바꾸는가

**bash를 버리고 Node.js로 옮긴다. 배포 방식·파일 구조·사용 방법은 지금 그대로 둔다.**

이유는 두 가지고, 둘째가 더 크다.

### (1) 속도 — 프로세스를 13개에서 1개로

bash는 텍스트를 다룰 때마다 외부 프로그램(grep·awk·sed)을 부른다. weavedoc 명령 하나가 **약 13개**의 프로세스를 띄운다. Windows는 프로세스 생성이 비싸서 이게 그대로 비용이 된다.

| 실측 (2026-08-04, 이 머신) | |
|---|---|
| `bash weavedoc version` — **아무 일도 안 함** | **1,792ms** |
| Node — eclypse **268 truth 전부** 읽고 frontmatter 파싱하고 sha256 | **98.9ms** |
| └ 그중 기동 86.6ms · 실제 작업 **~12ms** |

**bash가 아무 일도 안 하고 시동만 거는 시간의 1/18에 Node는 실광산 전체를 처리한다.**

### (2) 결함 클래스 — 오늘 하루가 증거다

2026-08-04에 수리한 결함이 전부 한 클래스였다:

- **v0.3.5** — gawk가 UTF-8 로케일에서 이모지 든 claim 줄을 오독. 같은 광산이 로케일에 따라 red/green
- **v0.3.6** — scope의 `grep`이 ko 로케일에서 `Binary file matches` **한 문장**을 돌려줌. scope가 거기서 **유령 id를 만들어냄**
- **v0.3.7** — **bash `read`**가 멀티바이트 로케일에서 유효하지 않은 바이트를 담은 줄을 통째로 버림. 3-OS 중 **Linux만** 실패

전부 **"텍스트 처리를 외부 도구에 위임했는데 그 도구가 플랫폼·로케일마다 다르게 행동"**해서 생긴다. 한 프로세스 안에서 처리하면 이 클래스가 **존재하지 않는다.**

## 1. 왜 Node인가 (Go·Python 기각)

| | 명령 1회 | 사용자가 설치할 것 | 배포 형태 |
|---|---|---|---|
| 지금 (bash) | 1,792ms | bash≥4 · GNU awk · sed · coreutils | 폴더 복사 |
| **Node** | **~80ms** | Node (사용자는 이미 보유) | **폴더 복사 — 지금과 동일** |
| Go | ~50ms | 없음 | OS×아키텍처별 바이너리 5종 |
| Python | ~156ms | Python 3.x (보장 안 됨) | 폴더 복사 |

**Go 기각** — 명령당 30ms를 더 벌려고 다음을 전부 떠안는다: 플랫폼별 빌드, macOS arm64 ad-hoc 서명(크로스 컴파일 시 실패 사례 있음), 코드 서명 논의, 프로젝트에 커밋 불가(플랫폼 종속), npm 같은 배달 장치. **얻는 30ms보다 잃는 단순함이 크다.**

**Python 기각** — Node와 기동은 같지만(85ms) 실제 작업이 **6배 느리다**(12ms vs 71ms, 268 truth 기준). 광산이 커질수록 벌어진다. 그리고 설치 보장이 없다 — macOS는 기본 python3가 없고, **Windows는 `python`을 치면 Microsoft Store가 열리는** 함정이 있다. Windows가 이 프로젝트의 주 사용 환경이라 하필 최악의 경우에 걸린다.

**Node 선택의 결정타**: WeaveDoc은 Claude Code 스킬로 배포되고 **Claude Code 자체가 Node로 돌아간다.** 사용자에게 Node가 없을 수 없다. 그리고 `node:fs`·`node:path`·`node:crypto` 표준 라이브러리만 쓰므로 **npm 패키지 의존성 0** — `package.json`도 `npm install`도 없다.

## 2. 바꾸지 않는 것 (불변 계약)

재작성은 **동작을 옮기는 일이지 다시 설계하는 일이 아니다.**

- **CLI 표면** — 명령 이름·인자·플래그·`--json` 스키마
- **종료 코드** — 0/1/2의 의미
- **출력 바이트** — 사람이 읽는 줄, `examined:` 회계선, 진단 코드 86종, 경고 문구
- **온디스크 형식** — `.weavedoc/schema`가 SoT. frontmatter·ledger 6열·seal·gaps 문법·라벨 꼬리
- **배포 방식** — `.weavedoc/` 폴더 복사. 프로젝트에 커밋해도 되고, 크로스 플랫폼 공유도 그대로
- **원칙** — fail-closed, 격리 = 증거 없음, 규칙 하나에 철자 하나

바뀌는 것은 **파일 확장자와 앞에 붙는 단어뿐이다**: `bash .weavedoc/bin/weavedoc` → `node .weavedoc/bin/weavedoc.mjs`

## 3. 호출 방식 (결정)

**Windows에서는 PowerShell로, 그 외에는 bash로 호출한다.**

| node 스크립트 1회 실행 | 실측 |
|---|---|
| Linux, bash | **17ms** |
| **Windows, PowerShell** | **80ms** |
| Windows, Git Bash (MSYS) | **373ms** |

Git Bash는 Windows에서 Unix인 척하느라 프로세스 생성마다 **~290ms의 세금**을 낸다. PowerShell은 그 세금이 없다. Claude Code의 Bash 도구는 Windows에서 Git Bash를 쓰므로, **스킬에 플랫폼 분기를 넣어 Windows에서는 PowerShell 경로를 쓴다**(사용자 결정 2026-08-04: "트레이드오프는 별거 아니다, 빠른 게 최고다").

**실행 정책 문제는 없다 — 시험으로 확인했다.** `.mjs` 파일에 인터넷 출처 표시(Mark-of-the-Web, `ZoneId=3`)를 붙이고 PowerShell에서 실행해도 그대로 돈다. PowerShell의 ExecutionPolicy는 **PowerShell 스크립트(`.ps1`)에만** 적용되고, `node script.mjs`는 그냥 node.exe를 인자와 함께 실행하는 것이라 `.mjs`를 들여다보지 않는다. Windows 기본값인 `Restricted`에서도 동작한다.

> **깨지면 안 되는 규칙: `.ps1` 래퍼를 만들어 배포하지 않는다.** 만드는 순간 실행 정책의 대상이 되고, 다운로드된 `.ps1`은 `RemoteSigned`에서 막힌다.

## 4. 증명 수단 — 342개 케이스가 곧 명세

`tests/regress.sh`의 342 케이스는 전부 **CLI 블랙박스**다. 광산을 만들고, 명령을 실행하고, stdout과 종료 코드를 본다. 내부를 모른다. 그래서 **케이스를 그대로 두고 실행 대상만 바꿔** 재작성을 검증할 수 있다.

**파리티 계약**: 같은 광산 · 같은 명령 → **stdout 바이트 동일 · 종료 코드 동일**. (stderr는 대조하지 않는다 — 구현마다 경고 문구가 다르고, v0.3.7에서 이미 stdout만 보도록 정리했다.)

### 계획의 구멍 하나 — 0단계 실행 중 발견 (2026-08-04)

`regress.sh`는 시작 전에 **픽스처 광산이 validate를 통과하는지** 확인하고, 실패하면 거부한다. 옳은 관문이다 — 광산이 깨져 있으면 아래 케이스는 전부 무의미하다. 그런데 그 말은 **부분 이식을 채점할 수 없다**는 뜻이다: `validate`가 오는 5단계 전까지 1~4단계는 자동 채점 수단이 없다.

그래서 **`tests/parity.sh`**를 만들었다. 광산 하나 폭이 아니라 **명령 하나 폭**의 저울이다:

```
bash tests/parity.sh <mine-dir> <command>...
bash tests/parity.sh /d/repo/eclypse version lang     # 실광산으로도 잰다
```

같은 광산에 같은 명령을 두 런타임으로 돌려 **stdout 바이트 + 종료 코드**를 대조한다. 관문은 그대로 두고(약화시키지 않는다), 1~4단계는 이걸로 채점한다.

**선언된 예외 하나**: `version`의 fingerprint는 런타임 자기 바이트를 해싱하므로 **두 런타임이 다른 값을 내는 게 정상**이다. 이 줄만 정규화하고, 정규화했다는 사실을 매 실행마다 출력한다 — 조용히 봐주는 비교는 진짜 차이도 봐주게 된다.

### 5단계가 시작되기 전에 정해야 할 것 — 진단 메시지의 절대경로 (2b에서 발견)

truths 진단 두 종류가 **절대경로**를 메시지에 박는다. 나머지 진단은 전부 상대경로(`truths/t040.md`)를 쓴다 — 즉 설계가 아니라 **bash 런타임 안의 불일치**이고, truths awk가 `FILENAME`을 그대로 쓰기 때문이다.

```
[FM-MISSING]        /tmp/…/truths/t001.md  frontmatter 'claim' is empty …
[SEAL-QUOTE-MISSING] /tmp/…/truths/t001.md  quote not found in /tmp/…/materials/m001/converted.md …
```

문제는 **두 런타임이 같은 디렉터리를 다르게 쓴다**는 것이다: MSYS bash는 `/d/repo/x`, 네이티브 Node는 `D:/repo/x`. 규칙 차이가 아니라 표기 차이지만, 절대경로가 출력에 실리는 순간 **stdout 바이트 파리티가 이 줄들에서만 깨진다.**

선택지: ① Node가 Windows에서 MSYS 표기를 흉내낸다(네이티브 도구로서 틀린 방향 — PowerShell 사용자에게 POSIX 경로를 보여주게 된다) · ② **이 두 진단을 상대경로로 바꾼다** — 나머지 진단과 일관되고 플랫폼 독립이 되며, **bash 판에서 먼저 고치면**(red-first 케이스와 함께) Node는 그냥 따라가면 된다 · ③ 이 줄들만 파리티 예외로 선언한다.

**②를 권한다** — 이식 문제를 현행 제품의 실제 개선으로 바꾸고, 기존 342 케이스가 그 변경을 검증한다. 다만 "출력 바이트 불변" 계약의 의도된 예외이므로 **결정으로 기록하고 진행한다**(§11).

`tests/foundation-mine-parity.sh`는 그때까지 광산 루트를 `<MINE>`으로 정규화하고 매 실행마다 그 사실을 출력한다. **그 정규화가 이 결정을 대신하게 두지 말 것.**

**옮길 수 없는 세 부류** — 소리 없이 빠지면 안 되므로 각각 대체 케이스를 만들고, 못 만들면 여기 남긴다:
- `bash -n` 파싱 검사, `preflight_gnu`(GNU 도구 확인) — 대상이 사라진다. `node --check`가 전자의 자리를 대신하고, 후자는 **필요 자체가 없어진다**
- `rm` 셰임 고장 주입(`block_consecrate_validate_fail_final_unremovable`) — PATH 셰임이 안 통한다. 주입 지점을 인터페이스로 열어 테스트한다
- `meta_doc_sync`·`tests/doccheck.sh` — bash 소스에서 dispatch 표를 파싱해 문서와 대조한다. 파싱 대상을 JS 소스(또는 생성된 표)로 바꾼다

## 5. 순서

각 단계는 **끝날 때 스위트가 green**이어야 한다. 기존 규율(red-first · 불변 계약 · 유닛마다 커밋 · 침습 유닛은 콜드 diff 리뷰)을 그대로 적용한다.

**0단계 — 하네스 이중화 (Node 코드 0줄)**
`regress.sh`가 실행 대상을 환경변수로 받게 한다(`WD_BIN`, 기본값은 현행 bash). 끝나도 342/342는 bash로 green이어야 한다. 여기서 아무것도 빨라지지 않는다 — **다음 전부를 채점할 저울을 먼저 만드는 것.**

**1단계 — 뼈대 + 가장 싼 명령**
dispatch 표, `version`·`lang`·`locale`. 이 셋만 Node로 돌리고 해당 케이스를 파리티로 통과시킨다. → 여기서 첫 실측: 실제 기동 시간이 추정과 맞는지 확인.

**2단계 — 바닥 (읽기 기반)**
config·schema·frontmatter 값 규칙·섹션/주석 리더·ledger 행 필터·digest. 명령이 아니라 **모든 명령이 딛는 바닥**이고, bash 판에서 드리프트가 반복해 터진 자리다. 규칙마다 함수 하나 + 표 기반 테스트로 못 박는다.

**3단계 — 읽기 명령** · `status`·`scope`·`census`·`gaps`·`pull`·`impact`. 부작용이 없어 파리티 실패가 광산을 다치게 하지 않는다.

**4단계 — 쓰기 명령** · `attest`·`reindex`·`retag`·`seal-review`. 원자적 쓰기·롤백 규칙은 bash 판이 어렵게 배운 것이라 그대로 옮긴다.

**5단계 — 어려운 둘** · `validate`(진단 86종) · `consecrate`(상태 기계·in-flight marker·postcondition). 바닥과 읽기 명령이 검증된 뒤라야 실패 원인이 좁아진다.

**6단계 — 전환** · 기본 대상을 Node로 바꾸고 스킬·문서·CI를 같은 커밋에서 넘긴다. bash 판은 한 릴리스 동안 `legacy/`에 남겨 파리티 검증용으로만 쓴다.

**7단계 (별건) — 하네스도 Node로**
아래 §6의 이유로, **6단계가 끝난 뒤에** 착수한다.

## 6. 스윕 시간 — 어디까지 줄어드나 (실측 기반)

25케이스(scope 계열)로 하네스의 바닥을 직접 쟀다:

| 25케이스 | 시간 |
|---|---|
| 현재 bash weavedoc | **204초** |
| bash 스텁(즉시 종료)으로 교체 | 46초 |
| **node 스텁(즉시 종료)으로 교체** | **45초** |

**bash 스텁과 node 스텁이 같다.** MSYS에서는 무엇을 띄우든 프로세스 생성세가 같기 때문이다. 즉 남는 45초는 weavedoc이 아니라 **하네스가 쓰는 시간**이다 — 케이스마다 광산 복사(MSYS `cp` **682ms**), `sed -i`, `vrun`의 서브셸.

| 342케이스 전체 스윕 (Windows) | |
|---|---|
| 지금 | **36분 47초** |
| Node weavedoc + **bash 하네스** | **약 7~9분** |
| Node weavedoc + **Node 하네스** | **약 1~2분** (추정) |

마지막 줄의 근거: PowerShell 내장 파일 복사가 **22.7ms**(MSYS `cp`의 1/30)이고, Node 하네스도 파일 복사를 프로세스 없이 직접 한다. 호출도 80ms 경로를 탄다.

**하지만 하네스는 재작성을 채점하는 저울이다.** 저울과 저울에 올릴 물건을 동시에 바꾸면 틀렸을 때 어느 쪽이 틀렸는지 알 수 없다. **weavedoc을 옮기고 → bash 하네스로 채점해 통과를 확인하고 → 그 다음에 하네스를 옮긴다.** 7~9분을 먼저 얻고, 1~2분은 그 다음이다.

참고로 **Linux에서는 Node가 오히려 조금 느려진다.** Linux는 fork가 사실상 공짜(`/bin/true` 0ms)라 bash의 13 프로세스가 호출당 ~11ms밖에 안 되는데, Node 런타임 기동이 17ms다. 컨테이너 스윕이 9초 → 25~35초쯤 될 것이다. 절대값이 사소해 결정에 영향은 없지만, 나중에 원인을 찾지 않도록 적어둔다.

## 7. 배포 경계 — 테스트는 배포물이 아니다

`tests/make-manifest.sh`가 정의하는 배포 번들은 이것뿐이다:

```
.weavedoc/{bin/weavedoc, schema, READ.md, FORMATS.md, templates/*}
.claude/skills/weavedoc-*
```

`tests/`도, 이 계획서도, `IMPROVEMENT_PLAN.md`도, `CHANGELOG.md`도 들어가지 않는다. **재작성 대상은 배포되는 것 하나**이고, `regress.sh`의 3,000줄은 6단계까지 그대로 둔다.

## 8. 착수 전에 정할 것

- **최소 지원 Node 버전** (권장: 18 LTS — `node:fs`·`node:path`·`node:crypto`와 ESM만 쓰므로 넉넉하다)
- **파일 구성** — 단일 `.mjs` 하나로 갈지, 모듈 몇 개로 나눌지. bash 판이 3,779줄 단일 파일이었던 건 파싱 비용 때문이었고 Node에는 그 제약이 없다
