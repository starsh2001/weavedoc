# 기타 형식 export 백로그 — PDF AcroForm·PPTX·HTML

## Status

Open

## Description

DOCX([ISSUE-5](ISSUE-5.md))·HWPX([ISSUE-6](ISSUE-6.md)) 이후, 실제 필요가 생길 때 하나씩 여는 형식들의 백로그다. 전부 template-fill 계열의 네이티브 장치가 있다.

- **PDF(AcroForm 필드 있는 양식)**: 필드 채우기는 성숙한 도구로 가능. 필드 없는 flat PDF는 좌표 오버레이라 깨지기 쉬우므로 대상에서 제외.
- **PPTX**: 이름 붙인 placeholder 도형·텍스트 상자에 주입.
- **HTML**: id·data 속성 또는 `{{이름}}` 슬롯. regenerate 계열이지만 디자인 자체를 직접 저작하는 경우라 문제가 다름. 그룹웨어 전자결재처럼 최종 목적지가 웹 에디터 붙여넣기인 경우, 구조 준수된 텍스트/HTML 조각이 산출물이 되고 디자인은 그룹웨어가 입히므로 이 갈래가 정답이 된다.

### 크기

형식당 번들 1~2개. 필요가 확정되기 전에는 착수하지 않는다.

## Severity

low

## Type

improvement

## Linked Story



## Linked Epic

