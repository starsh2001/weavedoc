<!--
  Review output for documents/<doc-id>/draft.md. Two parts:
  1. Fidelity violations — the MANDATORY gate (weavedoc's warranty). Not editable, not triaged-down,
     not adjudicated away. Any open entry blocks final.md and consecration. Empty = gate passes.
       - [<kind>] <where> — <what>      kind: contradiction | unsupported | missing-required
  2. Findings — the ADVISORY cold multi-persona pass. Triaged; gated by config.review.strength; never blocks.
       - [<severity>] <where> — <what + why>   severity: critical | should-fix | nice-to-have
  Adjudications carry advisory decisions across rounds so they aren't re-raised.
  See .weavedoc/FORMATS.md.
-->

# Fidelity violations

- [{kind}] {where} — {what}

# Findings

- [{severity}] {where} — {what + why}

# Adjudications

- {dropped|accepted}: {finding} — {reason}
