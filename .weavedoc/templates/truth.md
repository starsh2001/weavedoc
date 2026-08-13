---
id: t{NNN}          # zero-padded to at least 3 digits: t001, t042, t1000 — granted by the
                    # allocator (.weavedoc-state/id-sequences.json), never by max+1 scanning
claim: "{one-sentence fact}"
source: m{N}
location: "{where in the source}"
tags: [{tag1}, {tag2}]
provenance: stated                # stated | adopted | derived — who authored the value
# corroborated_by: [m{M}]         # materials that independently confirm this truth
# as_of: "{phase/date}"           # required for time-varying claims (나이·학년·소속·상태)
# derived_from: [t{M}, m{M}]      # required when provenance: derived
# assumptions: ["{premise stated in no material}"]   # every unstated anchor of a derivation
# A card that exists IS canonical (schema v3) — there is no status field. The value changed?
# Edit THIS card in place (same id). An undecided disagreement? It lives in
# .weavedoc-state/conflicts.json until the user rules, and never wears a card. The past? Git.
---

{Verbatim quote from the source material pinning the exact claim — copy-pasted, never paraphrased.}
