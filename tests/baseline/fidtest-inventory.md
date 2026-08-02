# fidtest.sh inventory — Phase 0 (2026-08-02)

`tests/fidtest.sh`는 `notes/fidtest.sh`의 byte-identical 사본이다. 원래 목적은 **두 `fid_body` reader(shipped vs candidate)에게 같은 입력 11개를 먹여 side-by-side로 비교**하는 개발기 실험 장치였다. candidate가 출하되고 `meta_single_judges`가 바이너리의 `fid_body()` 정의를 1개로 고정하면서 "두 reader 비교"라는 목적 자체는 소멸했다. 남은 가치는 **11개 입력 형태**이며, 아래 표가 각 형태의 회귀 suite 커버리지를 기록한다.

통합·폐기의 실행은 Phase 2(WD-QA-001)이며, 이 파일은 그 판단 근거를 남기는 Phase 0 inventory다.

| 실험 | 입력 형태 | 회귀 suite 커버리지 | Phase 2 조치 |
|---|---|---|---|
| c1_normal_empty | 빈 gate + `# Findings`의 advisory | `pass_gate_empty` | 폐기(중복) |
| c2_normal_open | gate 안 violation → block | `block_gate_plain` | 폐기(중복) |
| c3_sib2_empty | 형제 절이 `##` 레벨, gate 빈 상태 | `pass_gate_siblings_l2` | 폐기(중복) |
| c4_sib2_open | `##` 형제 + gate 안 violation | 근접 — `pass_gate_siblings_l2`와 `block_gate_plain`의 조합 형태, 정확 일치 케이스는 미확인 | 확인 후 통합 또는 폐기 |
| c5_planted_l2 | gate 안에 심은 `## Findings` | `block_gate_planted_sibling_tier` (주석이 c3의 정당한 쌍둥이임을 명시) | 폐기(중복) |
| c6_planted_l3 | gate 안에 심은 `### Human queue` | `block_gate_subheading_hq3` | 폐기(중복) |
| c7_subheading | gate 안 `## round 2` 소제목 아래 violation | `block_gate_subheading_own` | 폐기(중복) |
| c8_ambiguous | 모든 절이 `##` 동레벨인 모호 형태 | 근접 — siblings_l2 · planted_sibling_tier 쌍이 같은 함정 계열을 file-wide census로 처리 | 확인 후 통합 또는 폐기 |
| c9_lonely | gate 절 하나만 있는 파일 + violation | 근접 — `block_gate_plain`은 정상 구조 전제. 선언 절 전부 누락과의 상호작용은 미확인 | **고유 후보** — 확인 후 통합 |
| c10_comment | HTML 주석 안 violation (archived) | `pass_gate_archived_comment` (+경계는 `block_gate_unterminated_comment`) | 폐기(중복) |
| c11_v2_sib1 | gate가 `##` 레벨, `# Findings` 선행 | `block_gate_level2` (선행 순서만 다름) | 폐기(중복) — 순서 변형이 필요하면 그때 추가 |

요약: **명백 중복 7** (c1·c2·c3·c5·c6·c7·c10), **확인 필요 3** (c4·c8·c9 — c9가 고유 후보), **순서 변형 1** (c11). "확인"은 해당 형태를 실제 fixture로 만들어 현재 검사기의 판정을 회귀 케이스로 고정하는 것을 뜻한다.
