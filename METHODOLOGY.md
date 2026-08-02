# WeaveDoc

> Collect the sources of truth, make them navigable, and then guarantee that nothing you write contradicts or omits against them — folding each finished document back in as a new source.

WeaveDoc is a methodology for producing administrative documents — reports, proposals, contracts, review notes, research logs — with an AI agent, without the two failure modes that sink AI writing: **inventing facts** and **quietly disagreeing with the sources**.

> **Scope — WeaveDoc is for documents built from materials.** Its core assumes a *declared source of truth*: materials you supply and vouch for, every claim grounded and cited, a fidelity gate, source-to-source conflict handling. It is *not* a tool for fiction or free composition, where invention is the point. Some principles transfer (declare your source, cold review, plain language); the workflow does not.

---

## 1. What it is — a consistency engine, not a fact oracle

The one thing to understand first: **WeaveDoc does not know what is true, and does not pretend to.** No tool can. What it does is narrower and keepable — it guarantees that what you write **stays consistent with a source you declared**.

Philosophically this is *coherence*, not *correspondence*. WeaveDoc never checks a claim against reality; it checks a claim against the **materials you supplied and vouched for**. So the honest warranty is not "there are no errors" — it is:

> "This document does not contradict, and does not omit against, the source you declared."

That is a smaller promise than "it's true," and that is exactly why it can be kept 100% of the time. "It's true" collapses the first time a confident-but-wrong sentence comes out of a bad source. "It doesn't contradict your source" never collapses.

**Truth here is conferred, not discovered.** A fact becomes true *for this document* when a human vouches for the material it came from — the attested-fact sense used in law, audit, and journalism. So the division of labor is clean:

- **The human is the truth's author** — you declare and stand behind the materials.
- **WeaveDoc is the truth's keeper** — it makes sure every claim stays faithful to them, and never lets a contradiction slip in unseen.

`무모순 ≠ 기계가 만든 진실` — no-contradiction is not machine-made truth. The machine owns *consistency*; the human owns *truth*. Keep those straight and every other decision below follows.

---

## 2. What's different from other tools

| | Free / vibe writing | **WeaveDoc** | One-shot doc generators |
|---|---|---|---|
| Source of facts | none (or the model's memory) | materials you declare and vouch for | a prompt; maybe pasted context |
| How a claim is trusted | not | grounded in a cited material | generated, hoped correct |
| On a missing fact | improvises | **asks you** — your answer becomes a cited source | invents (hallucinates) or blanks |
| Before it ships | nothing | a **fidelity gate** it must pass | usually nothing |
| When sources disagree | unnoticed | **detected first, resolved by you** | silently picks one |
| Over time | drifts | the vouched-for source **grows**, kept contradiction-free | each doc is a fresh guess |

The point is not "more review." It is a **warranty**: a document that has passed WeaveDoc carries a specific, checkable guarantee about its relationship to its sources. That guarantee is the product; everything else serves it.

---

## 3. The fidelity gate — the spine

WeaveDoc's core is one mandatory, blocking check: the **fidelity gate**. A document cannot be finished until it passes. The gate is **fidelity to the declared source**, which has two directions — both are *violations of the source*, just opposite ones:

- **No contradiction** — the draft must not assert anything that conflicts with a material (or with another cited claim). *Always on.*
- **No omission** — the draft must not leave out something the source *requires*. *On when it matters* — for normative documents (contracts, statements of work, regulatory filings), a missing mandatory clause is itself a violation. Toggled by `config.fidelity.completeness`.

Adding-what-conflicts and dropping-what's-required are the two ways to be unfaithful; together they are the whole warranty.

**This is the selling point, and it must not be buried.** A separate, *advisory* pass — cold multi-persona review for clarity, logic, persuasiveness — runs on top, but it is **not** the gate. The difference is **blocking power**: a fidelity violation *blocks*; a quality note is a *suggestion* you can ship past. Quality is the human's call (and a nice-to-have); fidelity is the machine's guarantee (and non-negotiable). Do not rank them on one severity scale — they are different kinds of thing.

> Why the gate, not the review, is the spine: quality review that *feels* mandatory but is really advisory degrades into a rubber stamp, and — worse — lets a self-contradicting document ship. The fidelity gate is a categorical must-pass, not a high-severity finding.

---

## 4. The growing truth-source — the cycle

WeaveDoc is not a pipeline that ends at a finished document. A confirmed document **re-enters as a material** — it becomes part of the declared source that the *next* document is checked against. Sources → document → source. This is what makes it an *engine* (a source that grows) rather than a *generator* (a one-way spit-out).

That cycle is only safe because of the gate. If a confirmed document could carry a contradiction, then folding it back in would **poison the source** every later document trusts. So:

> **The fidelity gate is the membrane between draft and canon.** Nothing enters the growing truth-source without passing it.

This reframes "declaring a source" as a deliberate, weighty act — a **consecration**, not an upload. When you vouch for a material (at intake, by declaring a conversation, by confirming a document, or by answering a question), you are authoring truth the machine will build on and defend. It is the *act of declaring* that confers this, not who authored the words — a conversation you point at (your feedback and the AI's contributions alike) becomes a source exactly as a file does; the only line is that you must declare it, never have it absorbed unasked. WeaveDoc treats that moment as first-class.

---

## 5. When sources disagree with each other

Multiple reference materials can contradict *each other*, not just the draft. This is the boundary case that decides whether the whole warranty means anything — fidelity to a *self-contradictory* source is undefined. WeaveDoc's stance:

**5.1 Detection is the #1 priority of review.** Catching a source-to-source conflict outranks every quality check. It runs first, is never skipped, gets the most effort, and blocks the hardest. The honest limit is real — you cannot mechanically guarantee that *every* subtle semantic contradiction across an arbitrary corpus is found — so the warranty is stated precisely:

> "No *detected* contradiction ships silently."

But "we couldn't catch it, oh well" is **not** acceptable as a posture. A miss is a *defect to fix*, not a cost to accept. Recall is an **investment**: hunt on purpose (not by luck), cross-check every structured fact (numbers·dates·amounts·obligations) exhaustively, check **at the moment of citation** (about to cite A — do the same-topic materials disagree?), flag a contestable fact cited from a *single* material when siblings exist, and re-run detection as the source grows so a late-arriving material re-opens a past resolution. Honesty about the residual hard tail comes only *after* that effort — never as an excuse to do less.

**5.2 The machine detects; the human resolves.** Picking a winner is conferring truth — the human's job. So the machine may auto-resolve *only* by rules the human declared in advance:

1. **`supersedes`** — a newer material replaces an older one. Mechanical.
2. **`authority`** — a role precedence the project declared (e.g. `계약서 > 회의록`). Mechanical.
3. **Otherwise → stop and ask.** The human picks: **A**, **B**, **the real value** (a new material that supersedes both), or **keep both**.

**5.3 Keeping both (attribution) is a human-only switch.** When a conflict is genuinely unresolvable, the right move is often to *attribute* — "Source A reports X; Source B reports Y" — which is not a contradiction at all: it lifts the clash from the object level (*what's true*) to the meta level (*who said what*), and "the sources disagree, here is how" is itself a single coherent truth. But the machine may **never elect** attribution on its own — because deciding "both stand" is still a truth judgment, and truth is the human's. It may *propose* it; you *authorize* it. This closes an escape hatch: otherwise the machine could launder any conflict into a lazy "both sides" sentence to slip the gate.

The invariant underneath all of this: **the source may never hold a bare contradiction.** Every conflict ends resolved (single truth), or human-authorized-attributed (a meta-truth), or blocked. Contamination — a floating X-and-not-X — is made unreachable.

---

## 6. Ask only for what's missing

WeaveDoc is autonomous by default. It does not interview you for intent it can infer, and it does not freestyle. When a document genuinely needs a fact the materials don't contain — and it cannot be responsibly inferred — it **asks**, in one batch, and each answer is saved as a `user-answer` material and cited like any other. It never invents to fill a gap, and never silently leaves a hole. Asking is not a failure mode; it is how the source grows to cover what the document needs.

---

## 7. What to shore up when you hand it to an agent

A human writer knows when they are guessing. An agent, isolated to what it sees at once, does not — so the leak points must be made *structural*, not left to the agent's judgment:

- **It can't tell true from plausible** → so never let it assert un-grounded: every claim traces to a cited material, or it's a question, or it's a flagged blank. Never an invention.
- **It can't feel a contradiction it didn't happen to notice** → so force the hunt (§5.1), and put a *deterministic* floor under it (`weavedoc validate`) that catches the graph-level misses the AI's judgment can't guarantee.
- **It has no stake in "which source is right"** → so it must surface conflicts to you, never pick silently.
- **It can't keep its own additions apart from yours** → so authorship is a *recorded field*, not a memory: a machine proposal the user adopted enters as `adopted`, a computed value as `derived` with its assumptions spelled out, and every run logs its delta. What the human confirms is that **change list** — never "is the whole mine correct?", a question with no reviewable surface. Saying "제안값 그대로 둘게요" in chat is not enough; the file must say it, or the next session reads a machine guess as a human decision.

The gate, the conflict rules, the provenance field, and the validator exist because "trust the agent to be careful" is not a warranty. Structure is.

---

## 8. Distribution form

- **Target:** the Claude Code terminal (and compatible agents).
- **Form:** per-step skills (`.claude/skills/weavedoc-*`) + a light runtime (`.weavedoc/`: `config.yaml`, templates, `schema`, the read protocol `READ.md`, and a dependency-free bash toolbelt `bin/weavedoc` — validate · pull · census · reindex · retag · gaps). Invoked by natural language, not slash commands.
- **The mine serves consumers outside the pipeline too.** Creative work (lyrics, fiction) is out of scope for plan→write — invention can't pass the gate, by design — but it still *reads* the mine. That boundary has three doors: **pull** (protocol-correct read out), **gather** (declared results back in, gated), and the read protocol (`READ.md`, pointed to from the project's CLAUDE.md) for everything in between. A misread cannot poison the mine — write-side safety is mechanical — it can only make the outside output wrong; and if that output re-enters via gather, map's conflict hunt is the backstop.
- **One engine, per-project knobs.** The same machinery serves a research log and a contract; a few declared settings differ: `fidelity.completeness` (is omission a violation?), `conflicts.attribution` (may it keep both?), `conflicts.detection` depth, `authority` (role precedence). Set once, at the declaration moment.
- **Identity vs positioning.** The engine is general — a consistency engine over any declared source. The *pitch* can stay narrow ("fact-based, anti-hallucination document tool") as the wedge. Core broad, entrance narrow; they need not match.
- **The unit of work is a markdown file on disk.** Not tied to a tracker or API — a board just reads these files. Delete `.weavedoc/` and `.claude/skills/weavedoc-*` and the tool is gone while the documents and materials stand intact.

---

## Appendix — the warranty in one line

WeaveDoc guarantees: *no contradiction it detected ships silently against the source you declared and vouched for; every **detected** conflict between your sources is surfaced, not silently resolved; nothing was invented; and — when the completeness warranty (`fidelity.completeness: required`) is on — no structural gap passes the gate unfilled and unaccepted.* It does not guarantee that your sources are true — that is yours to author — and it cannot promise to detect every semantic contradiction; what it promises is that a detected one can never be shipped quietly. It keeps what you declared coherent, and grows it without letting a detected contradiction in.

---

*Plain language, no coined terms — a document that contradicts its own sources is a document no one should sign.*
