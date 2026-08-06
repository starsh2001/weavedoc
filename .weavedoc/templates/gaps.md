<!--
  Mine completeness register for weavedoc-gaps (project root: gaps.md). Two parts:
  1. Open — structural gaps found in the mine, each awaiting fill-or-accept. Non-blocking.
       - [<kind>] <where> — <what's missing> — <evidence/pattern>
       kind: declared | reference | enumeration | symmetry
  2. Accepted — gaps the user intentionally left (do-not-resurface), each with a recheck condition.
       - [<kind>] <where> — <why left> — scope: <tags> — recheck: <condition> — as-of: <ids>
  A FILLED gap does not live here — the value enters via questions.md → user-answer material → map → truth,
  and the gap closes on the next scan. Accepted entries re-surface when their scope tags gain a new/changed truth.
  See .weavedoc/FORMATS.md.
-->

# Open

- [{kind}] {where} — {what's missing} — {evidence/pattern}

# Accepted

- [{kind}] {where} — {why intentionally left} — {scope: tags} — {recheck: condition} — {as-of: ids}
