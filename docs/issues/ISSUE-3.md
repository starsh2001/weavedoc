# plan 전사 모드 — 양식 자료의 구조를 각색 없이 인스턴스화

## Status

Open

## Description

회사 기안·과제 제출물처럼 외부에서 강제되는 표준 양식은 구조를 각색하는 것 자체가 위반이다. 현재 weavedoc-plan은 구조를 제안하고 프로젝트에 맞게 각색하는 동작만 있으므로, 양식 앞에서 각색을 끄는 전사 모드를 추가한다.

### 내용

- 양식 파일은 gather로 유입되는 자료다. 기존 보호(copy-in·지문·원본↔변환 검증)를 그대로 받고, project.md에 규범 역할을 선언한다. 유입 쪽 신규 장치는 없다.
- plan이 규범 역할의 양식 자료를 만나면: 장·절 구조를 그대로 인스턴스화하고, plan.md frontmatter에 `template:` 필드로 출처 자료를 기록한다. elicitation은 "각 섹션에 어떤 truth를 채울 것인가"만 다룬다.
- FORMATS.md에 `template:` 필드와 전사 규칙을 문서화한다.

### 관련 설계

pending인 규범 자료 설계(coverage & norms, "발주처 양식" 사용례)와 쌍둥이 구조다: 내용 규범은 "다 다뤘는가"를, 형식 규범은 "이 모양인가"를 본다. 이 이슈는 형식 규범 쪽만 다룬다.

### 크기

번들 1개(스킬 문서 중심). 후속: [ISSUE-4](ISSUE-4.md)가 이 이슈의 `template:` 필드에 의존한다.

## Severity

medium

## Type

improvement

## Linked Story



## Linked Epic

