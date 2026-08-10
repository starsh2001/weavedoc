# WeaveDoc parser and ledger state model

This document is the architectural contract behind the artifact grammar in
[`FORMATS.md`](FORMATS.md). `FORMATS.md` says what users write; this document says how every
runtime consumer must derive the same answer from those bytes.

## 1. Boundary and non-goals

WeaveDoc implements the narrow Markdown structures that affect its ledgers: initial frontmatter,
HTML comments, fenced code blocks, ATX headings, list-entry prefixes and bracket slots. It is not a
general CommonMark renderer. Pulling in a full Markdown parser would widen the accepted grammar and
would lose the byte-domain and invalid-UTF-8 behaviour on which diagnostics and digests rely.

The architecture has three layers:

1. `markdown-scan.mjs` assigns every source byte to one lexical context and records source offsets.
2. `ledger-structure.mjs` derives entries, continuations and section boundaries without knowing any
   state/kind vocabulary.
3. Ledger adapters classify slots and apply local policy. Consumers select facts from those models;
   they do not parse the file again.

Within one command, adapters for the same physical file share the same scanned document. In
particular, `review.md` feeds both its fidelity policy and its Human-queue policy from one source
snapshot; shared grammar without shared generation would still permit two answers during an edit.

## 2. Lexical precedence

A document is scanned once, left to right. Contexts are exclusive.

- Initial frontmatter is recognised only when the caller enables it and line 1 is a frontmatter
  fence. Markdown-looking text inside it is metadata, not a heading, comment or code fence.
- Outside frontmatter, a code-fence opener is recognised only while no HTML comment is open.
- Inside a code fence, only a matching closer of the same character and sufficient length is
  structural. `<!--`, headings and nested-looking fences are literal.
- Inside an HTML comment, only `-->` closes it. Fence openers and headings are literal.
- Closed comment spans are masked with equal-length blanks. They are never deleted and the two live
  sides are never concatenated, so `#<!--x--> H` cannot manufacture a heading and
  `<!--x-->``` ` cannot manufacture a fence.
- Headings require 1–6 hashes at column zero plus a source-authentic ASCII space or tab separator.

Unclosed frontmatter, comments and fences remain typed diagnostics on the document. A consumer may
make the consequence stricter, but it may not silently turn an open lexical state into empty input.

## 3. Source identity

Each physical line records `start`, `end`, its exact `raw` bytes, its line ending, masked spans,
context and optional heading node. Every entry and diagnostic carries a source reference derived
from that line. Parsing never rewrites or normalises the source.

One CR belongs to a CRLF line ending. In `\r\r\n`, the first CR is content and the second belongs to
CRLF; the content CR is not stripped a second time. A lone CR at EOF is recorded as that final
line's terminator. If a writer adds another line there it completes the boundary to CRLF, then
reparses the candidate.

Two consequences are recorded rather than hidden. `core.isFence` keeps CR in its class, so the
**frontmatter** fence — and only it — still closes on `---\r\r\n`; headings and code fences do not.
And a `review.md` Human-queue heading written `\r\r\n` is the one consumer where the residual CR
fails open: the section is not found, its entries are absent from `status` and from the ownership
check, and `review.sections` existence is deliberately not enforced. Every other artifact blocks on
the same input.

Byte offsets are mutation authority. A writer may splice only the original source domain; the
comment-masked `live` projection is for classification and must never be written back.

## 4. Typed ledger state

The common entry model keeps independent axes independent:

| axis | states |
|---|---|
| source syntax | `valid` / `malformed` |
| materialisation | `template` / `sentinel` / `record` |
| inline and effective body | `empty` / `template` / `real` |
| bracket slot | `missing` / `unclosed` / `blank` / `placeholder` / `known` / `unknown` / `unreachable` |
| attachment | root entry / structural detail / explicit ambiguous detail / orphan attempt / stray record |

For example, a placeholder kind followed by real prose is a record with malformed syntax and a
`placeholder` slot. It is not template noise. A later slot after an unclosed earlier slot is
`unreachable`, not merely missing. These distinctions prevent one boolean or empty string from
carrying several incompatible meanings.

Placeholder entries are held until real content materialises them. Template-only continuations
before the first real continuation remain instructions and are not folded into the displayed
record. Once materialised, later detail belongs to the record normally.

## 5. Policy adapters

| artifact | entry root | blank-line policy | invalid structure | section policy |
|---|---|---|---|---|
| Human queue | literal-lead peer | preserve loose-list state | preserve ambiguous indented prose and diagnose it | every `Human queue` round is isolated |
| `questions.md` | column zero | preserve parent across blanks | surface unrecognised and orphan records | whole file |
| `gaps.md` | column zero | reset continuation | stop and report `badLine` | Open and Accepted are disjoint roles |
| `review.md` | shape-free bracket scan | n/a | fail closed outside the gate | dedicated fidelity-zone policy |
| `verify.md` Verified units | row candidates inside live headings | n/a | uncovered row, never evidence | live level-1/2 headings only |
| `coverage.md` | event lines | n/a | lexical damage is malformed | historical level-2 material/legacy grammar |

Literal-lead nesting means a line is structurally deeper only when its lead starts with the parent
lead and is longer. Equal leads are peers. Incompatible space/tab spellings are not silently treated
as children; human ledgers preserve the prose with an ambiguity diagnostic, while the fail-closed
gap register stops.

Closed comments and closed fences are inert scopes: they suspend a held parent and resume it after
the closer. They cannot materialise a placeholder themselves, but they also cannot erase one. A
real continuation after source-authentic indentation remains a child when a closed comment occurs
between that indentation and the prose; the masked comment bytes never become indentation. A real
source blank still applies the adapter's blank-line policy.

The structural fence actions are named for their actual transition: `suspend` preserves the held
parent across the inert scope; `stop` records the opener as the fail-closed boundary. They are not
the same as the invalid-line action `reset`, which actually clears a parent.

Schema lists that assign roles are positional contracts, not bags with defaults. `gaps.sections`
must contain exactly two distinct non-empty names (open, then accepted), and `gaps.enum.kind` must
contain one or more distinct non-empty names. `verify.sections` must contain exactly three distinct
non-empty names (Verified units, Human queue, Adjudications), and its verdict marker must be a
non-empty scalar. An invalid contract disables every role in that adapter for every consumer; no
empty member may shift a later name into an earlier role, and no extra member may be ignored.

Positional strictness is about members, not about spelling. These two POSITIONAL contracts split
with `core.pipes()` — leading and interior empties survive so a role can never shift, and one
trailing delimiter adds no member. Splitting them any other way rejected schemas every other reader
accepts. Elsewhere a pipe list is a membership SET whose readers drop empties downstream, so those
sites still call `split('|')` and the spelling has no consequence; the rule stated here is about
lists that assign a role by position, not about every list in the runtime.

Enum names are compared in the artifact's own domain: a byte-domain ledger is matched against the
byte-domain schema map, never the decoded one.

**Known limit — recognition is modelled, roles are not.** The schema decides which words are
*recognised* state, ownership and kind values. What each word MEANS is still hardcoded in the
consumers: `open`/`ruled` in the Human queue, the three ownership words in `status`'s split,
`open`/`proposed` as the waiting questions. Section names are the same: `verify.sections`' second
position names the Human queue, but `parseHumanQueues` looks for the literal `Human queue`. This is
consistent with FORMATS, which declares section headers and enum values to be fixed English — the
schema is where the fixed vocabulary is written down, not a rename knob — but a reader must not
mistake these keys for a configuration surface. Renaming a value makes its entries recognised and
then unrouted; only the residue rule in `status` keeps them visible.

## 6. Review detection versus mutation

The review zone is deliberately not a bullet ledger. A bracketed violation kind is detected outside
the gate in prose, tables, frontmatter and code fences. HTML comments are the archive mechanism.

An archive that swallows kind-bearing lines and is then closed by a mid-line `-->` is an incident,
and the test is the closer's shape, not the comment's length: a deliberate archive ends its line
with `-->`. Single-line and multi-line comments are judged by that one rule. The previous reader
spliced a same-line comment out before the tripwire ran, so only the multi-line form was ever
tested; making the rule uniform can block a `review.md` that passed before.

Materialisation and boundary ownership remain separate facts here too. A pure placeholder-shaped
line may be inert inside the gate, but the same shape at the gate heading's tier is also a Markdown
section boundary and therefore blocks: treating that dual-role line as template noise would close
the gate and launder the first real record after it.

Detection does not grant rewrite authority. Upgrade may remove brackets only when the bracket
interior is one exact canonical kind, is the first token after the historical bullet/table marker,
is followed by whitespace or end of line, and the document has no matching Markdown reference
definition. Frontmatter, fenced code, inline/reference links, footnote/Pandoc citations, inline code,
near-spellings and later prose mentions are detection-only: changing `[contradiction]` there could
alter metadata, program text or Markdown structure. Such a line becomes a `review-history-manual`
migration item and `--apply` writes nothing until a human rules it.

## 7. Writer postconditions

Writers use source offsets and then run the same parser over their candidate bytes.

- `attest` writes the sidecar first. A human mirror is written only if the exact inserted row is
  live at its expected offset after reparsing; otherwise the authoritative sidecar remains and the
  command names the skipped mirror.
- Upgrade verdict suffixes are anchored before any comment that spans later lines. Every targeted
  row must reparse as a live verified row or the migration rolls back.
- Review-history migration preserves comment bytes and reparses to identify any remaining unsafe
  outside-gate kind.
- Existing migration sources that cannot be read are unknown, not empty, and stop preflight.

This is the general writer rule: a byte write is not success until the shared reader observes the
state the command claims it created.

## 8. Required invariants

The property suite and black-box regression suite enforce these invariants:

- A closed fence containing comments, headings or ledger entries cannot change the live entry set.
- A closed comment containing fences, headings or entries cannot change the live structure.
- Masking cannot create a structural token by joining separated source bytes.
- Every admitted root bullet becomes exactly one typed template, sentinel or record; child,
  stray and orphan bullets retain those explicit structural outcomes instead of disappearing.
- Malformed state cannot collapse into template noise.
- An unclosed slot owns its remaining source prefix but is not body; a real continuation stays
  visible in every ledger model.
- Section boundaries reset parent, held and fold state.
- Diagnostics assembled from independent policy sets are exposed in source order.
- Status and validation consume the same entry identities even when their policies differ.
- A parser round-trip is byte inert; a writer preserves unrelated bytes.
- A writer's claimed row/verdict must be observable by a fresh parse.
- Empty extraction in a test is failure, not a vacuous green result.

When adding syntax, extend the scanner or one adapter, add the new state to the Cartesian property
matrix, and migrate every consumer together. Do not add a consumer-local regex over stripped text.
