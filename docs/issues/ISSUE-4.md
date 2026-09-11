# validate 검사 — draft 제목 문구·순서를 양식 기준선과 대조

## Status

Open

## Description

기존 missing-required 게이트는 required 섹션의 존재만 본다. 외부 표준 양식에서는 "3. 추진 배경"을 "배경 및 목적"으로 바꿔 쓰는 것 자체가 위반이므로, 제목 문구와 순서까지 대조하는 검사가 필요하다.

### 내용

- plan.md가 `template:`을 선언한 문서에 대해([ISSUE-3](ISSUE-3.md) 의존), draft/final의 헤더 구조가 양식 기준선과 문구·순서까지 일치하는지 CLI가 바이트 대조한다.
- 대조 기준선은 에이전트의 재서술이 아니라 유입된 양식 자료(지문 찍힌 원본의 변환본)다.
- 회귀 케이스(red/green 실측)와 doccheck 검사 추가.

### 근거

draft는 에이전트 자신의 산출물이 증거인 축이라 바이트 검사가 정당화된다(mechanism vs procedure 경계 안). 기계는 대조만 하고, 불일치의 처리는 사람이 정한다.

### 크기

번들 1개(CLI + 회귀 + doccheck).

## Severity

medium

## Type

improvement

## Linked Story



## Linked Epic

