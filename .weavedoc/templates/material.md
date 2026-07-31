---
id: {m<NNN>}   # zero-padded to at least 3 digits: m001, m042, m1000
title: {human-readable name}
origin: {file|user-answer|prior-doc|conversation|research}
role: {one of project.md roles}
topics: [{topic}, {topic}]
format: {pdf|docx|xlsx|image|md|...}
source_path: {where the original came from}
added: {YYYY-MM-DD}
status: {collected|converted|verified|used|retracted}
summary: {2-3 line summary}
---
<!--
  The material converted to readable markdown, in the project language.
  Preserve structure (headings, tables, lists). Do not summarize away or alter facts.
  Do NOT ADD: converted.md is a MIRROR of the source. No derived tables/aggregates
  re-extracted from the body, no sort-order/superlative statements ("X가 최장신"),
  no cross-material consistency commentary ("이니셜과 정합"), no invented rationale.
  Needed handling guidance that is NOT in the source ("아래 값은 요청값, 실측 아님")
  goes in ONE clearly marked line:  > [note] ...   — excluded from mirror checks,
  and it must state no new facts. Machine framing inside a conversation/user-answer
  material (an anchor, a normalization) is marked  > [machine-note] ...  and is
  never promoted into a truth claim.
  Optional frontmatter:
    stage: {plan|applied}   — the source is clearly a plan/proposal vs an applied
      record (truths from plan-stage materials carry an "실행 확인 안 됨" caveat).
    corrects: [{m<N> §<sec>}] — this material displaces named parts of earlier ones.
      map reads it for the resolution `scope`, and it is what tells a reader of the
      body alone that this is a correction and not a new setting.
    url: / retrieved_at:   — REQUIRED when origin is `research` (validate blocks
      without them). `research` means the MACHINE fetched it: no human stood between
      the world and the record, so source.md keeps the values AS FETCHED (raw units,
      raw timezone, before conversion) and truths from it may not be `provenance:
      stated` — nobody stated a value the machine went and got.
  See .weavedoc/FORMATS.md.
-->

{converted content}
