# HWPX template-fill 세로 조각 — 행 복제·한/글 COM 보조 포함

## Status

Open

## Description

한국 실무의 핵심 형식인 HWP/HWPX에 template-fill을 얹는다. 기본 경로는 placeholder 텍스트 치환이다: 누름틀 필드 개체를 순수 XML로 신규 생성하는 것만 어렵고, `{{이름}}` 텍스트 치환이면 준비·채우기 모두 자동화 범위에 들어온다(누름틀 삽입이 꼭 필요하면 준비 1회에 한해 COM 자동화 또는 사람 삽입 + 기계 census 대조가 예비 경로).

### 전제가 되는 사실

- HWP(바이너리)와 HWPX(XML)는 같은 문서 모델의 두 저장 방식이라, 한/글 프로그램 내 변환은 레이아웃이 사실상 보존된다. 예외: 배포용 잠금 문서(변환 불가, 편집 가능본 필요), 구버전 특수 개체.
- 따라서 위험한 일(HWP→HWPX 변환 + 원본 대조)은 양식당 1회로 접고, 반복되는 fill은 한/글 무의존의 순수 XML 치환으로 남긴다.
- 이 머신에 한/글 설치 확인됨(COM ProgID `HWPFrame.HwpObject`).

### 범위

1. **fill 엔진**: HWPX ZIP+XML placeholder 치환([ISSUE-5](ISSUE-5.md)의 엔진 기반 공유).
2. **반복 구간**: 행 XML 복제 로직 + 실제 한/글에서 열어 재현 검증.
3. **한/글 COM 보조 스크립트**: HWP↔HWPX 변환, 창 없는 PDF 내보내기(에이전트가 PDF를 직접 읽어 검토·픽셀 diff), 보안 승인 모듈 등록(최초 1회 관문).
4. **검증 lane 분리**: 한/글 의존 부분은 CI에서 실행 불가이므로 Windows 로컬 전용 lane으로 분리하고, CI에서는 우아하게 skip한다. 만든 뒤에도 CI가 못 지켜주는 유지 비용이 남는다는 점을 문서에 명시.

### 의존·크기

[ISSUE-5](ISSUE-5.md)의 fill 엔진 공통 기반 이후. 번들 2~3개 규모.

## Severity

medium

## Type

improvement

## Linked Story



## Linked Epic

