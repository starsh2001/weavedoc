# DOCX template-fill 세로 조각 — 준비·매핑·fill·검증 완주

## Status

Open

## Description

template-fill 계열(원본 양식 파일을 운반체로 삼아 내용만 주입, 안 건드린 바이트는 원본 그대로라 준수가 구성으로 보장됨)의 첫 형식을 DOCX로 완주한다. 도구 생태계가 성숙해서(placeholder 텍스트 방식, content control) 제일 싸게 뚫리는 형식이다. markdown→PDF 생성이나 HTML 재현 같은 regenerate 계열은 근사만 가능하므로 대상이 아니다.

### 범위

1. **양식 준비**: 양식 사본에 `{{이름}}` placeholder를 심어 fill-ready로 만든다. 주입 지점 파악·이름 규약 제안은 AI, 승인은 사람, 심기는 기계. 준비 후 파일 안의 필드 목록을 꺼내 제안서와 대조(census 검증)하고, 원본과 나란히 1회 육안 대조한다.
2. **매핑 기록**: draft 섹션·값 ↔ placeholder 이름 매핑을 plan.md에 기록하는 층.
3. **fill 엔진**: placeholder 치환 + 반복 구간(행이 늘어나는 표) 행 복제. 넘침 규칙은 양식 쪽 선언을 따른다.
4. **검증 루프**: 결과를 PDF로 내보내 원본과 비교. 차이가 주입 지점 안에만 있는지 diff로 확인.

### 결정 필요

fill 엔진의 기술 선택: DOCX는 ZIP+XML이라 아카이브 조작이 필요하다. 기존 CLI의 의존성 정책(무의존 유지 여부)과 엔진의 거처(CLI 편입 vs 별도 스크립트)를 정해야 한다.

### 의존·크기

[ISSUE-2](ISSUE-2.md) 실증 결과를 설계 입력으로 반영. 번들 2~3개 규모. 이 이슈가 끝나면 "양식을 지키는 문서를 실제 파일로 뽑는" 흐름이 한 형식에 대해 완결된다.

## Severity

medium

## Type

improvement

## Linked Story



## Linked Epic

