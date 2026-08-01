---
id: t{NNN}          # zero-padded to at least 3 digits: t001, t042, t1000
claim: "{one-sentence fact}"
source: m{N}
location: "{where in the source}"
tags: [{tag1}, {tag2}]
status: ok
provenance: stated                # stated | adopted | derived — who authored the value
# corroborated_by: [m{M}]         # materials that independently confirm this truth
# as_of: "{phase/date}"           # required for time-varying claims (나이·학년·소속·상태)
# derived_from: [t{M}, m{M}]      # required when provenance: derived
# assumptions: ["{premise stated in no material}"]   # every unstated anchor of a derivation
# conflict_with: [t{M}]           # present only when status: conflict
# resolution: {type: pick, winner: t{M}, decided_by: user, decision_kind: supplied, reason: "{why}"}
#   ^ the decision record of a settled conflict — loser: status discarded; winner: status ok
#     (winner: own id); attribute: both ok. ONE LINE, flow style {}, never an indented block
#     (validate reads same-line values only). type: supersedes|authority|pick|value|attribute ·
#     winner may be a list · scope: [fields] for a partial supersede. Full examples: FORMATS.md.
---

{Verbatim quote from the source material pinning the exact claim — copy-pasted, never paraphrased.}
