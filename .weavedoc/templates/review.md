---
round: 1
consecutive_passes: 0
---

<!--
  Review output for documents/<doc-id>/draft.md. Frontmatter carries the advisory loop's state:
  `round` (last round number) and `consecutive_passes` (clean advisory rounds IN A ROW so far —
  +1 on a clean round; back to 0 on any blocking finding AND on a bar-crossing ticket-downgrade
  by the defender, whose test is the next fresh panel — that round is not clean). `refine` loops
  until it reaches config.review.repeat, so a cold session reads these instead of restarting the loop.
  Both optional (absent = 0). Four sections, every heading at level 1 (`#`):
  1. Fidelity violations — the MANDATORY gate (weavedoc's warranty). Not editable, not triaged-down,
     not adjudicated away. Any open entry blocks final.md/final/ and consecration. Empty = gate passes.
       - [<kind>] <where> — <what>      kind: contradiction | unsupported | missing-required
  2. Findings — the ADVISORY cold multi-persona pass. Triaged; gated by config.review.strength; never blocks.
       - [<severity>] <where> — <what + why>   severity: critical | should-fix | nice-to-have
  3. Adjudications — carries advisory decisions across rounds so they aren't re-raised.
  4. Human queue — advisory findings the machine wanted to dismiss on SEMANTIC grounds. Same entry
     format and ownership rules as truths/verify.md's; `validate` requires an ownership tag on every
     [open] entry. A dismissal the machine isn't allowed to make needs a legal place to sit.
  ZONE RULE: a kind in brackets ([contradiction] etc.) may appear ONLY inside section 1. In every
  other section, name kinds WITHOUT brackets (`- fixed: contradiction — …`) — validate blocks a
  bracketed kind anywhere outside the gate's own section, whatever the line's shape.
  See .weavedoc/FORMATS.md.
-->

# Fidelity violations

- [{kind}] {where} — {what}

# Findings

- [{severity}] {where} — {what + why}

# Adjudications

- {fixed|dropped|accepted}: {finding} — {reason}

# Human queue

- [{state}] [{ownership}] {where} — {what the machine wanted to dismiss + its reason} — {what breaks if the dismissal is wrong}
