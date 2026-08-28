# READ — consuming the mine from outside the pipeline

Rules for **any** consumer — a creative session, another skill, an ad-hoc question — reading this project's data mine (`truths/`, `materials/`) without going through plan→write. The pipeline skills enforce these internally; outside the pipeline they are yours to follow.

Why this exists: the mine is safe only for readers who know how to read it. `as_of`, provenance, and `stage` encode when a value holds and who authored it, and an open disagreement lives in `.weavedoc-state/conflicts.json` rather than on any card — a raw grep hands you a value whose time window you did not check, or one side of a disagreement nobody has ruled on. (Write-side safety is mechanical — validate, the fidelity gate — and does not depend on readers: a misread here cannot poison the mine; it only makes *your* output wrong.)

1. **Look up with `pull`, not raw reads.** `node .weavedoc/bin/weavedoc.mjs pull <tag|keyword>` searches claims+tags (falling back to body text) and applies this protocol mechanically: every listed card is canonical (schema v3), with `as_of` / derived / plan-stage / retracted-source labels attached. Quote pull output; don't eye-filter raw files for a lookup. The raw layer (`inbox/`, `materials/*/source.*`) is additionally **search-shielded** by the project's root `.ignore` — a ripgrep-family content search skips it, so a casual grep cannot hand you raw source text even by accident. If a tool that ignores `.ignore` surfaces one anyway, treat it as the audit layer: never quote it as current fact; open it only deliberately, by path, when auditing a conversion or retraction.

   **The audit layer is wider than the raw one, and one rule covers all of it — this clause binds pipeline runs too, not only outside consumers.** `truths/changelog.md`, the round history in `truths/verify.md`, and the two ledgers (`verify-ledger.tsv`, `intake-ledger.tsv`) record how the mine got here; none of them says what it holds now. **Judge from the current mine** — the cards, `index.md`/`tree.md`, `pull`, a material's `converted.md` — and open a record only when something *triggers* it: a finding that contests a value, a challenge to where a claim came from, a ruling someone says exists. Then open the span that answers the question, not the file. Two costs, and the second is the one that bites: a record quoted as current fact hands out a value that has since moved, and a record read wholesale floods the context it was consulted from — a working mine's changelog runs to thousands of lines and grows with every run, so a habit of sweeping it makes every later judgment worse, not better. **The mechanical readers are the exception and need no narrowing:** `validate`, `scope`, `census` and `status --open` read every ledger in full and return counts and names rather than prose. Quote their output; do not re-read what they already read.

2. **A card that exists is canonical (schema v3).** There is no status axis to check: the
   current value is the card, corrections happen in place (same id), and the past lives in
   Git. What CAN stand between you and a value is an **open disagreement**: it lives in
   `.weavedoc-state/conflicts.json` (never on a card), `status --open` lists each entry with
   both claims and their sources, and `validate` blocks shipping while any is open. Before
   leaning on a contested topic, glance at that lane — the mine will not stop *you* from
   reading, it stops the pipeline from shipping.

3. **Check the labels that change meaning.** Time-varying facts (나이·학년·소속·상태) carry `as_of` — a claim may not hold at the phase/date you're writing about. `provenance: derived` values rest on `assumptions` (read them before reuse); `adopted` = machine-proposed, user-accepted. A truth whose source material has `stage: plan` records *intent* — it is never evidence something was used or applied.

4. **Materials: converted.md is a mirror.** `> [note]` / `> [machine-note]` lines are handling guidance, not source facts. A material with `status: retracted` grounds nothing.

5. **Counts and entry points come from the CLI.** `census` for statistics; `truths/index.md` / `tree.md` (regenerated, never hand-edited) to find things by tag. Don't enumerate from memory.

6. **Exporting (a brief, guideline material, prompt context):** keep the truth id on each fact and carry its labels (`as_of`, derived) along; anything you add that is *not* from the mine must stay visibly separate from what is. A mine-based document produced outside the pipeline carries **no WeaveDoc warranty** — it becomes warranted only if it re-enters via `gather` and passes the gate. (If a misread does ride back in via gather, `map`'s conflict hunt is the net — a backstop, not a license.)
