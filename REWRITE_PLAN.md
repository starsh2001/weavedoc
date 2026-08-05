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

### 진단 메시지의 절대경로 — **해결됨 (2026-08-04, bash에서 red-first로 수정)**

> 아래는 결정 전의 기록이다. **결정: ②(상대경로로 바꾼다)** — §11에 결정 행으로 남겼다.
> 착수해 보니 대상은 **2종이 아니라 4종**이었다(`FM-MISSING`·`SEAL-QUOTE-MISSING`·`FM-DUPLICATE-KEY`·
> `TRUTH-BODY-FRAGMENT`, 여기에 `SEAL-RETRACTED`·`SEAL-SPLIT-BLOCK`이 자료 경로를 함께 인쇄).
> 읽어서 세지 말고 **깨진 광산에 validate를 돌려 절대경로를 grep해서** 찾았다.
> 함정 하나: `tfile`은 메시지용인 동시에 frontmatter 키 census(`kcount`)의 **키**다. 한쪽만
> 상대화하면 필수 키 조회가 조용히 전부 빗나간다. 같은 문자열(`relf`)로 함께 바꿨다.
> 결과: 실광산 validate 출력의 절대경로 **0줄**, Linux 345/345 green. 아래 §3의 선언된 예외 2번이 사라졌다.

### (원래 기록) 5단계가 시작되기 전에 정해야 할 것 — 진단 메시지의 절대경로 (2b에서 발견)

truths 진단 두 종류가 **절대경로**를 메시지에 박는다. 나머지 진단은 전부 상대경로(`truths/t040.md`)를 쓴다 — 즉 설계가 아니라 **bash 런타임 안의 불일치**이고, truths awk가 `FILENAME`을 그대로 쓰기 때문이다.

```
[FM-MISSING]        /tmp/…/truths/t001.md  frontmatter 'claim' is empty …
[SEAL-QUOTE-MISSING] /tmp/…/truths/t001.md  quote not found in /tmp/…/materials/m001/converted.md …
```

문제는 **두 런타임이 같은 디렉터리를 다르게 쓴다**는 것이다: MSYS bash는 `/d/repo/x`, 네이티브 Node는 `D:/repo/x`. 규칙 차이가 아니라 표기 차이지만, 절대경로가 출력에 실리는 순간 **stdout 바이트 파리티가 이 줄들에서만 깨진다.**

선택지: ① Node가 Windows에서 MSYS 표기를 흉내낸다(네이티브 도구로서 틀린 방향 — PowerShell 사용자에게 POSIX 경로를 보여주게 된다) · ② **이 두 진단을 상대경로로 바꾼다** — 나머지 진단과 일관되고 플랫폼 독립이 되며, **bash 판에서 먼저 고치면**(red-first 케이스와 함께) Node는 그냥 따라가면 된다 · ③ 이 줄들만 파리티 예외로 선언한다.

**②를 권한다** — 이식 문제를 현행 제품의 실제 개선으로 바꾸고, 기존 342 케이스가 그 변경을 검증한다. 다만 "출력 바이트 불변" 계약의 의도된 예외이므로 **결정으로 기록하고 진행한다**(§11).

`tests/foundation-mine-parity.sh`는 그때까지 광산 루트를 `<MINE>`으로 정규화하고 매 실행마다 그 사실을 출력한다. **그 정규화가 이 결정을 대신하게 두지 말 것.**

### 이식이 드러낸 현행 런타임의 잠복 차이 — CRLF (2c에서 발견)

측정(2026-08-04):

```
printf 'a\r\nb\r\n' | awk '{print}'
  MSYS gawk  -> a\nb\n      (\r을 벗긴다)
  Linux gawk -> a\r\nb\r\n  (유지한다)
```

**같은 광산이 Windows와 Linux에서 이미 다르게 읽힌다.** `nocomment`가 그 위에 서 있고, consecration 게이트·gaps 계수·섹션 추출이 다시 그 위에 선다. CRLF 체크아웃은 Windows 작업트리의 정상 상태다(git autocrlf).

코드베이스는 이 문제를 **일부만** 방어한다: `has_fm`·`count_headings`·gaps 스캐너는 `\r`을 손으로 벗기는데, awk 리더들은 플랫폼에 맡긴다. 즉 의도는 "벗긴다"인데 철자가 두 개다.

**포트는 벗기는 쪽으로 통일했다** — 명시적 리더들의 의도와 같고, 무엇보다 Node가 세 플랫폼에서 같은 답을 낸다(이식의 목적 그 자체). 줄 읽기는 `core.mjs`의 `splitLines` 하나로 모았다.

**5단계에서 이 결정의 구체적 사례가 나왔다** (2026-08-04, `pass_crlf_retag` 광산): **CRLF truth가 LF 자료를 인용**하면 seal이 갈린다. Linux gawk는 truth 줄의 `\r`을 유지하므로 자료 본문에서 못 찾아 `SEAL-QUOTE-MISSING`을 내고, MSYS gawk는 벗기므로 통과한다 — **같은 광산, 같은 bash, 플랫폼에 따라 다른 판정.** 즉 여기엔 맞출 "bash의 답"이 하나로 존재하지 않는다. 포트는 항상 벗기므로 MSYS 답과 일치하고 플랫폼에 무관하다. 코퍼스 349개 중 줄바꿈이 섞인 광산은 **2개뿐**이고, 나머지 하나(`acct_mat_digest_line_endings_stable`)는 `mat_digest`가 이미 명시적으로 `\r`을 벗기므로 갈리지 않는다. `tests/parity-corpus.sh`에 (광산, 명령) 예외로 선언해 뒀다.

**그리고 이건 소비자가 다시 벗기고 끝나는 문제가 아니다 — `mat_digest`가 이 awk를 지난다.** 2e에서 확인:

| `mat_digest materials/m001/converted.md` (CRLF 950줄) | |
|---|---|
| MSYS (Windows) | `ebf43fc97fda6819…` |
| **Linux** | `5cf38845593ec9c3…` |

**같은 파일이 플랫폼마다 다른 digest를 낸다.** `truth_digest`는 raw 바이트를 해싱하므로 일치한다 — awk를 지나는 `mat_digest`만 문제다. digest는 "어떤 바이트가 검증됐는가"의 철자이고, 검증 판정 전체가 이 숫자를 탄다. 즉 CRLF 자료가 한쪽에서 attest되면 **반대쪽에서는 전부 stale로 읽힌다.**

**현재 실피해 범위(eclypse 실측)**: CRLF 자료 10개(m001·m012·m013·m016~m022) · digest가 박힌 m-행 5개(m023~m027) · **교집합 없음.** CRLF 자료들이 전부 `legacy-unbound`(digest `-`)라 지금은 안 물린다. 다만 **함정은 살아 있다** — 저 10개 중 하나를 `attest`하는 순간(정상적인 검증 작업이다) MSYS 값이 박히고, 이후 Linux·macOS 실행은 stale로 읽는다. CI의 3-OS 레그도 CRLF 광산에서는 서로 다른 digest를 계산한다(픽스처가 LF라 지금은 안 드러난다).

**권고: bash 판의 `mat_digest`에 `\r` 제거를 명시**하고 red-first 케이스를 붙인다. MSYS 답을 정본으로 삼으면 배포된 광산의 기존 digest가 그대로 유효해 churn이 없다. 한 줄짜리 수리이고, 이식과 무관하게 현행 제품의 결함이다.

### 선언된 파리티 예외 — 측정된 것만 (4단계에서 갱신, 2026-08-04)

파리티가 **조용히 봐주는 차이는 하나도 없다.** 아래는 전부 실측했고, 각각 왜 남는지가 적혀 있다.

| # | 무엇이 다른가 | 판정 |
|---|---|---|
| 1 | `version`의 fingerprint | 런타임 자기 바이트를 해싱하므로 **달라야 정상**. 필드가 제 일을 하는 것 |
| 2 | ~~광산 루트 표기(절대경로 진단)~~ | **없어졌다 — 두 번 만에.** 위의 상대경로 수정은 truths awk만 고쳤고 셸 쪽 **20종**이 그대로였다(§4a). 5단계 착수 시 345개 케이스 광산 전체에 validate를 돌려 발견했고, `prob`/`warn` 한 곳에서 완성한 뒤 재측정해 0줄을 확인했다 |
| 3 | **argv의 유효하지 않은 UTF-8 바이트** | 고칠 수 없다. MSYS bash가 네이티브 프로그램을 띄울 때 바이트열을 UTF-16으로 변환하는데, 유효하지 않은 UTF-8은 그 변환에서 손실된다 — 바이트가 Node 주소공간에 **애초에 도달하지 않는다**. bash는 bash·gawk·sha256sum이 전부 MSYS 안이라 바이트를 그대로 옮긴다. 실측: `attest verified 2 $'\xb0\xcb\xc1\xf5' m001` → bash는 `b0cbc1f5`, Node는 `c2b0c38bc381c3b5`를 장부에 쓴다. **영향 범위는 `standard` 열(자유 텍스트) 하나**이고 digest·id·판정에는 닿지 않는다. 계획된 PowerShell 호출 경로에는 유효하지 않은 바이트가 존재할 수 없다. 회귀 케이스 `pass_locale_scope_census_match`는 Node로 green(그 케이스가 고정하는 것은 로케일 독립성이고 Node에는 로케일 의존이 없다) |
| 4 | **`reindex --check`의 diff 본문에서 hunk 묶는 방식** | 판정에는 닿지 않는다 — `in sync`/`DIFFERS`, 개수 줄, 종료 코드는 항상 일치한다. 동일 길이의 최소 편집 스크립트가 여럿일 때 GNU diff와 다른 쪽을 고를 수 있다. 측정: `tests/diff-parity.sh` 864케이스 중 **97.9% 바이트 일치**(4,064케이스로 넓히면 96.5%), **실광산 index.md·tree.md 케이스는 0건 불일치**. 불일치는 전부 10단어 알파벳으로 같은 줄을 일부러 반복시킨 합성 입력 |

### 4a. 진단 경로 상대화 — 절반만 되어 있었다 (5단계 착수 시 발견, 2026-08-04)

오전의 상대화는 **truths awk만** 고쳤다. 셸 쪽 진단 **20종**(`FM-MISSING`·`MAT-*`·`CAT-*`·`PLAN-*`·`CFG-PATH-*`·`TRUTH-DIR`·`DATE-INVALID`·`PROJ-*`…)은 그대로 절대경로였다.

**왜 안 보였나**: 통과하는 광산은 진단을 한 줄도 찍지 않는다. "실광산 validate 출력의 절대경로 0줄"은 eclypse가 **깨끗해서** 성립한 값이었지, 진단이 상대경로라는 증거가 아니었다.

**어떻게 찾았나**: 345개 케이스가 만드는 광산을 전부 수확해(`WD_REG_WORK=… bash tests/regress.sh` → `$WORK/w/<case>`) 하나하나 validate를 돌리고, 출력에서 광산 루트를 grep했다. 읽어서 세지 않았다 — 오전의 "2종이 아니라 4종"이 정확히 읽어서 센 결과였다.

**어디서 고쳤나**: 구성 지점 ~30군데가 아니라 `prob`/`warn` **한 곳**(`relmsg`). 오전의 수리 항목이 "`relf`는 메시지인 동시에 키"였는데, 완성된 메시지는 아무도 소비하지 않으므로 이 자리에서는 그 클래스가 발생할 수 없다. 철자가 하나라 나중에 추가되는 진단도 자동으로 상대경로가 된다. 알려진 한계와 되돌림 조건은 `IMPROVEMENT_PLAN.md` §11.

회귀 케이스 `acct_diag_paths_are_relative`가 이걸 못 박는다 — 소스 grep이 아니라 **광산**으로, 서로 무관한 세 계열(material·catalog·plan)을 동시에 깨뜨려서, 한 계열을 고치는 것으로 나머지에 대해 조용해질 수 없게.

**그리고 그 케이스도 충분하지 않았다.** 콜드 리뷰가 **모든 읽기 명령**으로 다시 재니 `impact`가 345개 광산 중 **326개**에서 절대경로였다 — 세 목록이 `prob`/`warn`을 거치지 않고 직접 인쇄하므로 `relmsg`가 닿지 않는다. `impact`도 상대화했고 `acct_impact_paths_are_relative`가 세 목록을 각각 못 박는다. **교훈은 측정 범위다**: "validate에 절대경로 0줄"은 "런타임에 절대경로 0줄"이 아니었고, 첫 번째 "0줄"이 틀렸던 것과 정확히 같은 이유로 틀렸다.

### 4b. 진단의 순서 — gawk 해시가 아니라 명세다 (2026-08-04)

truths awk의 진단 9계열이 `for (k in array)`로 나온다. gawk는 그 순서를 **명세하지 않고**, 실측 결과 **어떤 규모에서도 정렬이 아니다**(키 50·300·2000개 전부 NOT sorted). 그래서 필수 필드가 통째로 빠진 truth는 `status source claim tags id` 순으로 인쇄됐다 — gawk의 해시 함수를 구현하지 않는 한 포트가 재현할 수 없는 순서다.

이건 파리티 예외로 선언할 자리가 아니라 **없앨 수 있는 자리**였다. `PROCINFO["sorted_in"]="@ind_str_asc"`(GNU awk는 이미 필수 의존이다)로 순서를 명세했다. 바꾸기 전 블래스트 반경을 재고 바꿨다: 345개 광산 양방향 비교에서 출력이 바뀐 광산 **0개.** 스위트의 무엇도 해시 순서에 기대고 있지 않았고, 그저 명세가 없었을 뿐이다. `acct_diag_order_is_specified`가 다섯 개 전부를 한 문자열로 확인한다(id를 하나씩 보면 어떤 순열이든 통과한다).

참고로 MSYS gawk 5.0.0과 Linux gawk 5.2.1은 이 키 집합에서 **같은** 해시 순서를 냈다 — 즉 지금 플랫폼 간 불일치는 아니었다. 고친 이유는 결함이어서가 아니라 **명세되지 않은 것에 계약이 얹혀 있었기 때문**이다.

### 4d. `validate`는 **바이트 도메인**에서 돈다 (2026-08-04, 콜드 리뷰 후)

JS 문자열은 "raw 바이트"와 "디코드된 텍스트"를 동시에 담지 못한다. 그래서 bash 출력을 **바이트로** 재현해야 하는 명령은 도메인을 하나 골라야 하고, `validate`는 **바이트**를 고른다 — 진단이 광산의 값을 그대로 인용하는데, 유효하지 않은 UTF-8을 담은 값(CP949 자료, 한글 콘솔의 흘린 바이트)은 UTF-8로 디코드하면 U+FFFD가 되어 **원본 런타임이 찍은 적 없는 것**을 찍는다. 실측: bash는 `b0 cb c1 f5`, UTF-8 리더는 `ef bf bd` × 4.

- `core.mjs`의 **`U`**(UTF-8 소스 리터럴 → 바이트 도메인)와 **`M`**(템플릿 태그: 리터럴 반쪽만 인코딩하고, 이미 바이트인 보간값은 그대로 통과). 메시지 138군데가 이 태그를 단다.
- 파일 읽기는 전부 `latin1`(1문자 = 1바이트). `read.mjs`에 `fmvB`/`fmLoadBytes`를 두고, `loadSchema`/`loadConfig`는 `enc` 인자를 받는다. `sections.mjs`의 파일 리더 두 개(`dupSection`·`commentBalanced`)는 validate 전용이라 통째로 바이트로 옮겼다.
- **경로에서 온 값은 U()로 올린다.** `node:path`와 `readdirSync`는 디코드된 JS 문자열을 주므로, 그대로 바이트 메시지에 넣으면 한글 문서 id가 잘린 바이트로 찍힌다. 보간 64군데.
- **비-ASCII 리터럴을 담은 정규식은 바이트로 다시 써야 한다.** 이걸 놓쳐서 `pass_completeness_*` 2건이 즉시 빨개졌다: 템플릿 stub 판정의 `[…—:·,.-]`가 아무것도 안 지우게 됐다. 그리고 그건 **바이트 클래스**다 — `LC_ALL=C`의 `sed`에서 멀티바이트 멤버는 바이트 하나하나가 클래스에 들어간다. `—`는 `\xe2\x80\x94`, `·`는 `\xc2\xb7`.

검증: 유효하지 않은 UTF-8 값 · 한글 문서/자료 id · 한글+이모지 값 · 값 안의 SOH · 로케일 3종 — 사람 출력과 `--json` 모두 일치. 실광산 eclypse도 일치하고 한글이 정상 렌더된다.

### 4e. 목록 순서도 명세다 — 로케일 콜레이션 (2026-08-04)

`material_ids`·`doc_ids`는 글로브로 만들어지고, **글로브는 `LC_COLLATE`로 정렬한다.** validate가 그 목록을 돌며 진단을 내므로 **출력 순서가 셸이 물려받은 로케일의 함수**였다. 실측(`m002 M003 m-004 m_005 mAA mzz`):

| | 순서 |
|---|---|
| C / POSIX (양 플랫폼) | `M003 m-004 m002 mAA m_005 mzz` |
| en_US.UTF-8 · MSYS | `m_005 m002 M003 m-004 mAA mzz` |
| en_US.UTF-8 · Linux | `m002 M003 m-004 m_005 mAA mzz` |

**두 플랫폼이 서로도 안 맞는다.** 재현할 단일 답이 없다 — gawk 해시 순서(§4b)와 같은 모양이고 같은 방식으로 정리했다: 물려받지 말고 **이름을 붙인다.** `material_ids`/`doc_ids`에 `local LC_ALL=C`(`LC_COLLATE`가 아니다 — `LC_ALL`이 우선하므로 그 상태에서 `LC_COLLATE` 할당은 조용히 무시된다). 함수 스코프이고 복귀 후 호출자 로케일은 그대로다(확인함). Node 쪽은 `.sort()`(UTF-16 코드 유닛)가 아니라 **바이트 비교**로 정렬한다 — 둘은 BMP 전체에서 일치하고 그 위에서 갈린다.

### 4c. 플랫폼 차이로 남겨두는 것 — CR 하나짜리 파일

바이트 하나(`\r`)만 든 truth 파일에 대해 **MSYS gawk 5.0.0은 `NR`을 0**으로, **Linux gawk 5.2.1은 1**로 센다. 그래서 `scope`의 live 집계가 Windows bash에서만 다르게 나온다(포트는 Linux 답과 일치). 이식이 만든 차이가 아니라 gawk 쪽 차이이고, 채점 플랫폼이 Linux라 컨테이너 저울은 이걸 볼 수 없다 — 그래서 여기 적어둔다.

### bash가 깨져 있고 포트가 낫는 자리 — 재현하지 않았다

포트가 **더 안전한 쪽으로** 갈린다. 되돌리지 말 것. 전부 실측:

- **schema 키가 없을 때**: bash는 `set -u`로 죽는다(`SCH[verify.ledger.verdicts]: unbound variable`). `ledger_file`의 주석이 예상한 바로 그 "testbed drift"에서, 종료 코드 1에 stdout은 빈 채로. Node는 코드 기본값으로 degrade한다
- **장부 경로가 디렉터리일 때**: bash의 `mv`가 임시 파일을 **그 디렉터리 안으로 옮기고 rc 0으로 성공을 보고**한다(장부는 안 써진 채 `verify-ledger.tsv/verify-ledger.tsv.tmp.<pid>`가 남는다). Node는 `attest: ledger write failed` rc 1
- **`require_inside_root ""`**: bash의 `cd ""`는 성공해서 CWD로 해석되므로 **가드를 통과한다**. `paths: truths: /` 설정이면 실제로 도달한다(양쪽 다 `TRUTHS`가 빈 문자열이 된다). Node는 거부한다
- **truth 파일명을 쓴 디렉터리의 census 표기** (추가 2026-08-04): `truths/t009.md`가 디렉터리면 bash의 `ls "$TRUTHS"/t[0-9]*.md`가 그것을 `<경로>:` 헤더로 나열해 진단에 `t009.md:`(앞 공백 2개 + `.md:` 꼬리)를 흘리고, 그 줄이 `sort -n`에서 0으로 읽혀 **numbering-holes 줄이 통째로 사라진다.** Node는 `t009`로 찍고 holes를 정상 계산한다. validate는 양쪽 다 `TRUTH-DIR`로 막으므로 판정은 같다

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

**4단계 — 쓰기 명령** · `attest`·`seal-review`·`reindex`. 원자적 쓰기·롤백 규칙은 bash 판이 어렵게 배운 것이라 그대로 옮긴다. **완료 2026-08-04.**

> **`retag`은 여기서 끝낼 수 없다 — 이 순서는 틀렸었다.** `cmd_retag`이 부르는 다른 명령은 정확히
> 둘이고(`cmd_reindex`·`cmd_validate`), 커밋 경로가 **사후 전체 validate에 답하고 실패하면 전량
> 롤백**하는 구조다. validate 없이는 그 경로가 성립하지 않는다(실측: `--dry` 2.5초 / 커밋 경로
> 17.7초, 회귀 케이스 6건 중 3건이 이 경로). 5단계로 옮겼다 — §11 결정 행.

**5단계 — 어려운 셋** · `validate`(진단 92종) → **`retag`**(129) → `consecrate`(158 · 상태 기계·in-flight marker·postcondition). 바닥과 읽기 명령이 검증된 뒤라야 실패 원인이 좁아진다. validate가 오는 순간 `regress.sh`가 Node를 전면 채점할 수 있게 되므로, 그 시점이 진짜 분기점이다.

> **`validate` 완료 2026-08-04** (5a-0 채점 수단 → 5a-1 척추 → 5a-2 truths 패스 → 5a-3 ledger·index·coverage → 5a-4 문서 루프 → 5a-5 꼬리·`--json`).
> 실측: 광산 **349개**에 대해 `validate` **출력 전체 + 종료 코드** 대조 — 선언된 CRLF 예외 1건 외 전부 일치. 이식 명령 9개(`validate`·`validate --json`·`census`·`scope`·`status`·`gaps`·`impact`·`pull`·`reindex --check`) 전면 코퍼스도 같은 결과.
> 회귀: bash 채점 **348/348**, Node 채점 **304/348** — **실패 44건이 전부** `consecrate`·`retag`·`upgrade`(미이식, exit 3) 도달이고 validate 귀책은 0.
> `src_shape_unported()`가 지키던 세 케이스에 Node 철자를 썼다(§4의 "건너뛰면 안 된다"). `meta_diag_code_table`의 Node판은 **고아 방향을 의도적으로 검사하지 않는다**: 포트가 부분인 동안 미이식 명령의 코드는 사이트가 없고, 그걸 고아로 신고하면 계약이 아니라 이식 진척도를 재는 테스트가 되어 포트가 진행되면 저절로 녹색이 된다. bash 판이 양방향을 계속 본다.
> `meta_single_judges`의 Node판은 첫 실행에서 **포트 안에 이미 있던 리터럴 제어문자 3개**를 잡았다(`cmd-pull.mjs`의 `replace(/<SOH>/g,' ')`, `diff.mjs`의 `<NUL>` 마커) — 화면에는 `replace(//g,' ')`로 보이는, bash에서 이 이식을 속인 것과 **같은 함정**. 이스케이프로 바꿨고 이제 상시 감시된다.

> **5단계 전체 완료 2026-08-05.** `validate` → `retag` → `consecrate` → `upgrade` 순. **`NOT_PORTED`가 비었다** — 모든 명령이 Node로 돈다.
> 실측: 회귀 **349/349 양쪽 러너**(bash 채점·Node 채점) · 코퍼스 광산 349개 × 읽기 명령 9개 전부 일치(선언 예외만) · 쓰기 명령은 `tests/parity-write.sh`로 stdout·종료 코드·**결과 트리**까지 대조(retag 7 · consecrate 8 · upgrade 7 모양).
> `upgrade --apply`의 백업 디렉터리 이름은 `.upgrade-backup-<date>.<PID>`라 두 실행이 항상 다르다 — **bash를 bash와 비교해도 같은 차이가 나온다**는 걸 확인하고 하네스에서 정규화했다(내용은 계속 대조한다).

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
