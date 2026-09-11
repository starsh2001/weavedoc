# 양식 export 실증 스파이크 — 실제 양식 1개 손 실증

## Status

Open

## Description

양식 준수 export 파이프라인(관련: [ISSUE-5](ISSUE-5.md), [ISSUE-6](ISSUE-6.md))의 본 구현 전에, 실제 제출 양식 1개로 전체 왕복을 도구 편입 없이 일회성 스크립트로 실증한다. 목적은 이후 조각들의 크기 추정을 추측이 아니라 실측으로 바꾸는 것.

### 실증 범위

1. 양식 사본 유입 → placeholder(`{{이름}}` 텍스트) 심기
2. 값 치환(fill) → 결과 파일 생성
3. PDF 내보내기(한/글 COM 또는 Word) → 원본 양식과 비교: 에이전트가 PDF를 직접 읽어 검토하고, 가능하면 픽셀 diff로 "차이가 주입 지점 안에만 있는가" 확인

### 이 실증으로 확인할 것

- 대상 양식의 반복 구간(행이 늘어나는 표) 유무와 복잡도
- 넘침(overflow) 거동: 칸보다 긴 내용이 들어갈 때 형식이 어떻게 반응하는가
- 한/글 COM 자동화의 보안 승인 관문(파일 접근 모듈 등록) 처리. 이 머신에 한/글 설치 확인됨(COM ProgID `HWPFrame.HwpObject`)

### 선행 조건

사용자가 실제 제출 양식 파일 1개를 제공해야 한다. 그 파일의 형식(HWP/HWPX 또는 DOCX)이 첫 대상 형식과 [ISSUE-5](ISSUE-5.md)·[ISSUE-6](ISSUE-6.md)의 우선순위를 정한다.

### 크기

반나절~하루.

## Severity

medium

## Type

improvement

## Linked Story



## Linked Epic

