# WeaveDoc — 변경 내역

번들 버전은 `.weavedoc/VERSION`에 있습니다. **날짜만으로는 설치본을 구분할 수 없으므로**(같은 날짜 라벨로 다른 `bin/weavedoc`이 돌 수 있음) `weavedoc version`이 함께 찍는 **fingerprint**(bin+schema 해시)로 비교하세요.

---

## 2026-08-08.18

**Unreleased — slice 1 of schema v3 opens: the two state-file models, unwired.** The v3 plan was approved 2026-08-13; this is bundle A of slice 1, in the same shape every Phase-1 model landed in (raw-source, quote-marker): the model plus its properties file, nothing importing it yet.

**`id-sequences.mjs`** is the typed monotonic allocator (`.weavedoc-state/id-sequences.json`, namespaces `conflict|material|truth`). Canonical-current deletes cards, and max+1 scanning reuses the highest deleted number — after which an old `<!-- t:t042 -->` cites a different fact. Fail-closed both ways: a malformed file never reads as "start from 1", and counters are refused at the TEXT above 15 digits, because `9007199254740993` leaves `JSON.parse` already rounded and `isSafeInteger` then approves the rounded value (the canonId lesson, applied before the door instead of after it).

**`conflict-store.mjs`** is the temporary conflict store (`.weavedoc-state/conflicts.json`): open entries only, resolution is deletion, `targets: []` is the legal *undecided* state — and the parser refuses an `archive`/`accepted` key outright, because history growing back as an "extra" key is how discarded machinery returns. Key vocabularies are closed at every level (a typo'd candidate key silently dropped is a claim the user can no longer adopt), id spellings are exact (`c001`, never `c1` — the m1↔m001 incident), and serialization is canonical: sorted by numeric id, fixed key order, absent optionals omitted, one byte spelling per store state.

Both landed red-first (the properties files failed on `Cannot find module` before the models existed), 279 property cases across 18 groups, twelve targeted mutations all killed — after the mutation harness itself was fixed: its first run restored via `git checkout` on files git had never seen, so every mutation stacked silently and every verdict was noise. Restore is `cp`/`mv` now, with a `cmp` guard that a sed actually bit.

**Unreleased — a rule's describers are owners too.** Third cold-review round, two findings, both the class `.15` already named and then re-committed: the rule's *operating* owners were synced (engine + both counting SKILLs) while the documents that *describe* the contract were not counted. `verify.md`'s frontmatter contract in FORMATS and the shipped `review.md` template still said the count resets only on a failing/blocking round — a cold session resuming a loop from those words alone would count a bar-cross-downgraded round as clean and end the loop one round early, which is exactly the false-pass `.16` closed. Both now state the third reset condition. The evidence this time is a census, not a grep of the phrase being edited: every `consecutive_passes` mention in the tree (schema, schemas/v3, FORMATS, template, both SKILLs, engine, harness fixture, changelog history) was enumerated, and these two were the only remaining owners of the reset wording.

## 2026-08-08.16

**Unreleased — a downgrade's test is the next round, and the loop must not end before it.** One follow-up to `.15`, raised by the second cold review round and closed by the user's own sentence: "다음 라운드가 없으면 '불거질 수 있다'는 거짓이지."

`.15` kept ticket-downgraded findings re-raisable — the accepted safety valve was "the next fresh cold panel may re-raise it with the ticket". But that promise presumed a next round exists: a downgrade that crosses the blocking bar could land in a round that counts as clean, satisfy `repeat`, and end the loop with no fresh panel ever testing it (at `verify.strength: 1`, a consequence-less real critical could ship that way). Now a **bar-crossing ticket-downgrade leaves the round not clean** — the convergence count resets, so the next fresh cold panel always runs. Nothing goes to the human and the grade is not re-argued: the panel either re-raises the finding with its ticket, or a grade that survived two independent cold reads stands. The two-strikes rule, guaranteed instead of hoped for. The engine and both counting owners (verify §6, review convergence) state it in the same words.

## 2026-08-08.15

**Unreleased — a grade is argued by ticket, and the defender always sits.** Skill text only, no runtime bytes: review-grading discipline in the shipped skills, from a GroveSpec-alignment pass, cold-reviewed externally and corrected once by the user.

**The defender runs at `standard`, not just `full`.** The engine heading said "`full`; optional `standard`" while review SKILL B.3 said "run triage" with no condition — two documents, two answers, and which one a round obeyed depended on where it entered. Both now say the same thing: mandatory at `standard` and `full`; at `light` only the producer rule (the session that produced the conversions never self-triages) forces one.

**Each grade names its entry ticket.** critical: the wrong statement + its consequence. should-fix: the exact spot + the concrete misreading it produces. nice-to-have: the better version in one line. A finding missing its ticket files one grade lower — a *formal* call the defender may finalize; *semantic* downgrades still go to the Human queue. The prior text already let a consequence-less finding be dropped outright, so the ladder narrows that hole rather than opening one. And a ticket-downgrade is never condensed into do-not-raise: the next round's fresh cold panel may re-raise the finding *with* its ticket, and one that keeps failing to produce it has found its true grade (user-ruled 2026-08-12, against routing machine downgrades to the human — grading is the AI's job; the queue is for decisions).

**One grade vocabulary, one owner.** verify SKILL carried its own severity definitions and they disagreed with the engine's — the engine's own T2 example, an omission graded should-fix, did not fit the engine's own "two writers diverge" wording. The three grades live once in reviewers.md now; verify points at them, and WORKFLOW.md's summary line names the cold defender and its floor.

## 2026-08-08.14

**Unreleased — exact identity, and the file fails as one thing.** Four P1s in `2026-08-08.13`, all found by independent review, all in the same contract class as the round before.

**Identity was compared in a type that rounds.** NTFS inodes are 64-bit and `Number` holds 53 exact bits — on the machine that found this, `Number.isSafeInteger(stat.ino)` is already false, and two *different* directories compared equal after rounding, which made every pre/post identity check capable of missing a swap. Every stat in the raw model is `{ bigint: true }` now, and a byte length is lifted before it meets a size.

**The trusted root is a capability, not a path re-judged per call.** `.13` checked the final component, so a junction *above* the trusted root re-aimed everything under it while `materials/` stayed an innocent directory. `openTrustedRoot` pins the physical identity (canonical path + BigInt dev/ino) once; every later read verifies against the pin, so re-aiming any ancestor fails the comparison. A stable alias an operator set up deliberately resolves once at creation and stays consistent — the boundary is "same physical directory throughout", which is the property the seal actually needs, and that limit is stated rather than implied.

**`canonId` rounded ids.** `parseInt` above 2^53: `m9007199254740993` canonicalised to a *different* material and a quote sealed against the wrong file's bytes — measured. Canonicalisation is string-exact at any length now. This touches the one helper v2 production also uses; the v2 suite is unaffected because no real mine holds an id above 2^53, and exactness is strictly wider.

**A list container still split, and one unsupported quotation now fails the file.** `- > alpha` + `  > beta` were two refusals, and a bare `  beta` under a list quote vanished from every population. The container region stays open now so the block is one refused span with nothing dropped — and rather than growing a container model, a file holding *any* unsupported quotation is structural-invalid: no quote in it seals, because a population the grammar cannot segment is not a population to certify against.

Also: `parseQuoteMarkers` refuses a supra-latin1 Unicode string at the door instead of answering it wrongly; a `location` of zero-width characters is no longer a legible attribution; and the previous entry said "four smaller ones" while listing three — the fourth was the docs alignment it forgot to count.

Twelve mutations, all killed. One — the invisible-location rule — survived its first pass because the U+200B case had been verified by hand and never turned into an assertion, which is the exact failure the last three rounds keep re-teaching. It is a fixture now.

## 2026-08-08.13

**Unreleased — a quotation is one region, and the trusted root is checked too.** Two P1s in `2026-08-08.12`, both found by independent review, plus four smaller ones.

**One quotation was still being split into two answers.** The span model was total, but the *regions* were built line by line: `> alpha` was admitted and sealed while the `  > forged` beneath it became a neighbouring refusal. A consumer reading the sealed spans got the quotation with its forged line removed — the same defect as "refused yet sealed", wearing an adjacent span instead of one field. And the test that was supposed to catch it checked byte ranges for overlap, which two adjacent spans trivially pass.

Regions are built first now. A region is the maximal run of lines a reader sees as one quotation, and it is admitted only when *every* line is the machine shape; one indented `>`, one list-nested `>` or one lazy line refuses the whole region. A quotation is not partly checkable.

**An aliased trusted root bounded nothing.** Only the material directory was examined, so a junction standing in for `materials/` passed containment trivially — both sides resolved to the same external path, `relative()` returned `''`, and outside bytes sealed as ordinary evidence. The trusted root is now checked for the same alias it is supposed to prevent.

**Four smaller ones.** `m1` and `m001` are one material to every other reader in this runtime, so comparing the marker's spelling literally let `m1` inside `m001` become a second provider *and* slip past the self-reference refusal — ids are canonicalised before comparison. `\s` was still Unicode in the marker grammar, which cut a filename legitimately containing a UTF-8 non-breaking space; the classes are ASCII on both sides now. And `mode=not-checkable location="   "` passed as cold debt: the attribution a reviewer relies on has to be legible, not merely present.

Nine mutations, all killed — two only after the fixtures were sharpened. The marker's ASCII class needed an input that actually tells the two spellings apart (a filename containing NBSP, where Unicode `\s` rejects a legal name), and the trusted-root guard's two branches turned out to be internally redundant, so it is exercised by removing the block rather than one line.

## 2026-08-08.12

**Unreleased — the quote layer becomes one total result.** Six defects in `2026-08-08.11`, all found by independent review. The previous round moved the regexes into the shared file; this one makes the answer total.

**Moving a regex is not owning the structure.** `blockQuoteNodes` still judged one line at a time, so `- item` with a two-space `> alpha` became a *top-level* quote while the same thing at four spaces vanished with no rejection at all — one shape admitted wrongly, its neighbour lost entirely. In the other direction a heading or a list marker after a quote was called a lazy continuation, when both are ordinary block boundaries. The grammar is stated now: `>` at column zero, anything after it is content, and the shapes this runtime will not judge — indented, list-nested, lazy — are refused by name. Requiring a space after `>` had itself opened a fresh exit (`>alpha` was neither quote nor rejection), so it does not.

**A refused structure could still be sealed.** `quotes[]` reported `sealed: true` on a block the same scan had rejected in its diagnostics list — two answers about one span, and a graph reading `quotes[]` would have inherited the wrong one. There is now one span per region with a single terminal state (`sealed`, `mismatch`, `empty`, `unmarked`, `malformed-marker`, `unsupported-structure`, `source-unavailable`, `unresolved`, `binary-cold-debt`), spans do not overlap, and `quotes` is a view of that population rather than a second one. Every span carries its byte range, including unmarked and refused ones, so a `quote-attribution-required` payload needs no second scan.

**A non-breaking space was stripped as quote syntax.** `\s` in a JS regex is Unicode whitespace; in the byte domain U+00A0 is the single byte 0xA0, which is content. `>\xA0alpha` sealed against a source reading `alpha` — a false positive in the one comparison that exists to catch forgeries. Markdown's syntax classes are ASCII and are now written out.

**`self` and a material's own id were two providers.** Keying the snapshot cache on the marker's spelling read one directory twice. The key is the canonical material id, and naming your own id is refused so one provider has one address.

**The raw root could be swapped after the read.** Child files were re-examined; the directory was not. Rename the material aside, put a fresh one with identical filenames back, and every child re-lists identically while the snapshot describes files no longer at that path. The root's identity is captured at open and re-verified at the end.

**And the tests were shape checks.** `/^[0-9a-f]{64}$/` passes for any hex, so swapping the entry digest for the tree digest, replacing the converted digest with a constant, or shifting a range by one byte all went unnoticed. Everything a dependency graph will consume is recomputed from the bytes on disk now, and the ranges are sliced back out of the file and compared. Six mutations survived the first pass of this round — every one of them a rule I had verified by hand and never turned into an assertion.

## 2026-08-08.11

**Unreleased — the quote scanner stops re-interpreting Markdown.** Six defects in `2026-08-08.10`, all found by independent review, and they were one defect wearing six shapes.

**"One Markdown reader" was not true when I wrote it.** The module took lexical context from the shared scanner and then decided *structure* with its own regexes — `/^\s{0,3}>/` against raw lines, `<!-- wd:quote` against raw text. Everything else followed from that. A quote inside an HTML comment counted as live. A quote behind an unterminated fence vanished with no diagnostic, so a material could leave the checked population by opening a fence and never closing it. `- > alpha` was invisible to every population. A lazy continuation (`> a` then bare prose) sealed only the first line while a reader sees one quotation. `prose <!-- wd:quote … --> prose` declared a seal from inside a sentence, and a marker nested in an outer comment read as live. Blockquotes and standalone comments are typed nodes from `markdown-scan` now, and the two forms this grammar will not judge — lazy continuations and list-nested quotes — are **refused by name** rather than half-supported.

**An empty quote sealed against anything.** `includes('')` is true of every string, so a bare `>` was the strongest possible false positive and it passed in silence. A normalised span that is empty is now `QUOTE-SPAN-EMPTY`.

**The first consumer broke the snapshot contract it was built on.** `readRawSources()` ran per marker, so two quotes naming one provider could be judged against two generations of its bytes inside a single result — the second answer the raw model exists to prevent. One snapshot per provider per scan now, and the result carries the addresses a dependency graph and a confirmation projection will need: marker and quote byte ranges, entry digest, provider tree digest, converted digest, content classification, and the snapshot object itself.

**Korean `file=` could not resolve and `location=` came back as mojibake.** `converted.md` is read as latin1 because the comparison must be bytes; attribute *values* are human text and are now decoded strictly from their byte slice, with invalid UTF-8 a typed error rather than a best-effort string. The grammar fixtures were passing JS Unicode strings straight to the parser, so they never crossed that boundary at all — they go through the byte domain now.

**`not-checkable` was a weaker promise than the plan's.** It required only a `location`; the plan requires an exact `file=` too, because an unverifiable claim is the one place a reader has nothing but the address. And `looksBinary` tested NUL alone while calling the result "binary", so `01 02 03 41 42` was text and a verbatim quote of `AB` sealed against it. The classifier is stated now: NUL, any other C0 control, or DEL. Bytes ≥ 0x80 are deliberately *not* a tell — a CP949 material is ordinary legacy text, and treating undecodable-as-UTF-8 as binary would make the byte-domain seal moot.

**A hardlink could arrive after the read.** `raw-source-model` checked the link count before taking the bytes, so a file could be renamed aside and a hardlink dropped back under the same name mid-read: the descriptor still described a singly-linked file and the set published as complete. The name is re-examined after the read and bound to the same inode.

Also: `wsnorm` was described as reused from the truth seal and was in fact a copy. It is one exported function in `core.mjs` now, which both consumers import. Fifteen mutations, all killed — four survived the first pass because the fixtures did not actually target the rules they claimed to (a `not-checkable` case that always passed `file=`, a binary fixture that always contained a NUL, a snapshot check that compared digests rather than object identity, and a marker fixture whose prose on *both* sides was rejected by a different rule).

## 2026-08-08.10

**Unreleased — the v3 quote marker: grammar, scanner, and the resolver that stops at a raw source.** Read-only and unwired; it is deliberately **not** connected to the v2 gate. Written red-first against a module that did not exist, which is what the plan asks for.

This is the hop the mine did not have. The truth seal already proves a truth's body is in its material's `converted.md`; this proves the marked spans of `converted.md` are in the raw source. Between them a claim has no unchecked stretch — and a conversion is exactly where a sentence can quietly become a better sentence.

**The absence of a marker is the diagnostic.** An unmarked blockquote is the escape hatch: delete the marker and the claim leaves the checked set while still reading as a quotation. So the population rule is enforced from the other side — every live blockquote without a `wd:quote` marker is named, and a marker with no quote block after it is named too, because it seals nothing.

**Everything unrecognised in a marker is an error.** An unknown attribute, a duplicate, an empty value or unparsed residue all fail closed. A typo'd attribute that is silently dropped leaves the writer believing they constrained a claim that nothing did — the declared-but-unread class this format keeps closing. `source=tNNN` gets its own diagnosis rather than "unknown source": a truth proving a material that proves the truth is circular laundering, and the writer should be told which mistake they made.

**The comparison is bytes, in the truth seal's exact spelling.** Whitespace normalisation is reused rather than re-derived, because two spellings of "same text" would be two answers about one seal. A CP949 fixture whose quote differs from its source by two bytes fails; decoding first maps both onto U+FFFD and calls them equal, which is the forgery the truth seal was hardened against one hop later.

**Binary is decided by content and never reads as passed.** A `.md` full of NULs is binary and a `.bin` full of text is not — naming it by extension would let a rename change a verdict. A verbatim claim against a binary source is refused; `mode=not-checkable` is allowed *only* where the resolver judged the source binary, requires a `location` for the human attribution it stands on, reports `sealed: false`, and opens cold-verification debt. It cannot be used to excuse a text mismatch, which is the downgrade path the plan names outright.

**One Markdown reader.** Fence and comment precedence come from the shared scanner, so a fenced *example* of a marker is documentation rather than a claim. A regex over raw text would have counted it.

Thirteen mutations, all killed. One needed a sharper assertion first: deleting the scanner's own source-state gate left the quote unsealed anyway, because the resolver refuses a non-`complete` model too — but the two refusals are different facts for a reader, so the test now pins the code rather than the absence of a seal.

## 2026-08-08.9

**Unreleased — the raw-source model, rebuilt around a state and a snapshot.** Still read-only and unwired. Four defects in `2026-08-08.8`, all found by independent review, and the last of them is about my own claim rather than the code.

**The resolver answered from an incomplete set.** It read `readable` and `entries` and never looked at `rejected`, so a material with one regular source beside a rejected sibling — no tree digest, nothing sealed — still resolved that source as a valid address. The mirror was wrong too: a set of nothing but rejections reported `RAW-SOURCE-ABSENT`, which is a different fact. The cure is not another condition: the model now publishes ONE state — `complete`, `empty`, `invalid`, `unreadable`, `unstable` — where only the first two carry a manifest and only `complete` resolves an address. A discriminated state cannot be half-read; three fields a caller has to reassemble can, and were.

**An alias was evidence.** Only children were checked, never the material root, so a junction standing in for the material directory sealed an external directory's `source.md` as ordinary evidence — measured. A hardlinked `converted.md` passed as a source for the same reason: it is a regular file. Both are refused now, through one verified root capability (`openMaterialRoot`) so no consumer re-derives the boundary, with containment by canonical path and `relative()` rather than a string prefix — `/a/b` is not inside `/a/bc`. The trusted root is a required argument: a boundary that can be omitted is one that will be.

**It was not a snapshot.** `readdir`, then `lstat`, then a separate read: `size` came from one instant and `digest` from another, so a file rewritten in between produced an entry whose own two fields disagreed, and a set that changed mid-walk was published as complete. Identity and bytes now come from one open file description — fstat, read, fstat — and the directory is re-listed; anything that moved yields `unstable` rather than a digest. The model also keeps the bytes it hashed and hands out copies, because the quote scanner otherwise has to open the file again, which is the second answer this module exists to prevent.

**"All 52 mutation-killed" was false.** The mutations were structural; the digest itself was never attacked. Swapping SHA-256 for SHA-1, returning a padded file size instead of a content hash, and hashing a UTF-8 round-trip instead of the bytes all passed 52 of 52 — the byte-edit fixture also changed the length, so a size-shaped digest satisfied it. There are known SHA-256 vectors now, a same-length edit, invalid UTF-8, an independently recomputed tree digest, and 64-lowercase-hex shape assertions. All four survivors die.

The read race is injected through a fault seam, the way `consecrate` and `upgrade` take their write primitives: a race is the one condition a fixture cannot produce by waiting, and an unexercised stability check has never run. One clause of that check — the short-read guard — is not separately killable and says so at the code.

**And the fallback hid a defect, exactly as the previous entry worried it might.** Binding identity and bytes to one descriptor was right, but asking that descriptor whether it was a symlink is dead code: `open` FOLLOWS a link, so `fstat` describes the target and always answers false. A symlink to a regular file was therefore accepted as a source — the very thing `2026-08-08.8` refused. The local Windows sweep was green because the host cannot create a file symlink and the fixture's directory fallback stood in; all three CI legs failed on the same line. `lstat` decides the type first now, and the descriptor is bound to it by inode so the name cannot be re-pointed in between. The fixture links to a DIRECTORY instead: a junction needs no privilege on Windows and the type argument is ignored on POSIX, so the symlink branch runs on every host and the fallback is gone. The lesson is not about symlinks — a platform fallback that keeps a suite green is a place where a defect can live, and this one did.

## 2026-08-08.8

**Unreleased — the shared raw-source model.** Read-only and unwired, like everything else in Phase 1. Nothing in the runtime imports it yet.

Everything downstream that has to say "the source bytes changed" — conflict envelopes, support projections, confirmation projections, the source→converted seal — will read this one model instead of walking the material directory again. A second walk is a second answer about which bytes were verified, and that answer is the warranty.

**The manifest is an address list, not a bag of hashes.** Sorted `name NUL sha256 LF`, the shape [`verify.mjs`](.weavedoc/bin/lib/verify.mjs) already uses for a directory artifact, hashed whole. Sorting is bytewise so it cannot depend on locale or on UTF-16 surrogate order. That shape is what makes a RENAME detectable: identical bytes, different address, and a digest over contents alone cannot see it — asserted explicitly rather than assumed to fall out of add/delete/edit, together with a deleted-back-to-original check that an order- or history-dependent manifest would fail.

**A non-regular `source.*` makes the manifest unknown, not partial.** Symlinks are refused via `lstat` — `stat` reports the target's type, so a link to a regular file would pass as one, and a source that can be re-aimed without changing a byte inside the mine is not evidence. When any entry is rejected there is no tree digest at all: a digest over the files that happened to be regular is a complete-looking answer about an incomplete set. An unlistable material is likewise not an empty one, so a seal cannot be computed over "no sources" and reported as verified.

**Written addresses are refused before normalisation.** `..`, absolute and drive-qualified forms are rejected as written; normalising first and comparing after is how an escape becomes a prefix match on a sibling name. With several sources an address is required — choosing one silently attributes a quote to a file the writer never named, which is the attribution this seal exists to make checkable.

**One platform limit, recorded rather than papered over.** Creating a symlink needs a privilege Windows does not always grant, so the fixture falls back to a directory for the same rejection rule and the property output ends with `nonregular=symlink` or `nonregular=directory`. The assertion demands exactly the kind that was created, and the fallback is Windows-only — on POSIX a failure raises. Measured here: the `lstat`→`stat` mutation survives the Windows fallback, and the refusal fires when the fallback is forced. The POSIX side is *inferred* from those two facts plus green Linux and macOS legs; the mutant itself was not run there.

## 2026-08-08.7

**Unreleased — bundle hygiene on the frozen contract.** No behaviour change; `artifact-contracts` is unchanged and stays frozen.

**Four C0 control bytes were shipped inside `schemas/v3`.** A comment rewrite in `2026-08-08.6` wrote U+2014 through a latin1 writer, which keeps the low byte: 0x2014 becomes 0x14. They sat in comments, so the parser never saw them and every check stayed green — the control-character scan covered runtime modules only. The bytes are proper UTF-8 em-dashes now, and the scan covers `.weavedoc/schema` and `.weavedoc/schemas/*` in CI *and* in the local sweep, because a bundled contract edited here should go red here rather than one push later. This is the two-encoder trap this repository has recorded twice before, in a file that IS the format.

**Two statements that were true of v2 and not yet of v3.** `schemas/v3` opened by saying the checker defers to it, and the role block said every consumer asks the shared loader. Nothing reads the file yet; both now say so and name Phase 2 as when it changes. And the plan's §12.7 status said both "no item is complete" and "#5 is complete" in one line — it is per-item now: #5 done, #1–4 contract-layer prerequisite only, #6–9 not started, §12.7 as a whole outstanding.

## 2026-08-08.6

**Unreleased — closing the correction slice, including a rule I broke while writing the probe that enforces it.**

**The cache-key probe edited the live repository.** It appended to `$REPO/.weavedoc/schemas/v3`, took the key, and copied the file back. A SIGKILL in that window leaves the tree dirty, a concurrent edit is clobbered by the restore, the restoring copy was not checked, and A→B→A is no net change so the final seal cannot see any of it. The case sitting six lines away already says a test must not modify the tree it grades and uses an isolated copy for exactly that reason. The probe is one line in that copy now, and the live-tree case is deleted.

**The vocabulary fix went into the sound comparison.** The v2↔production check was already `size + one-way inclusion`, which is set equality; the hole was the v3↔v2 check, which compared sizes alone. Swapping one kind for another at the same count passed 216 of 216. Both now call one `sameSet()` — two spellings of one question is how the first fix landed in the wrong place.

**The positional matrix was half a matrix.** Interior-empty was untested on both contracts and the trailing-delimiter policy was asserted only on `verify.sections`, which is not a uniform policy, it is one example. Both contracts now carry leading-empty, interior-empty, interior-empty-with-a-compensating-member, and trailing.

**`contractFileFor` answered for inherited property names.** A plain object used as a membership test replies to `toString`, so the resolver built a path out of a function's source text. Own-property and integer checks make the API as total as it claims.

Also: `schemas/v3` still carried v2 comment blocks describing keys this bundle removed, which would have pointed a Phase 2 implementer back at the deleted path.

## 2026-08-08.5

**Unreleased — the contract path resolver gave a different answer per host.** `2026-08-08.4` fixed the Windows path bug with `node:path`, which is platform-dependent *by design*: on POSIX a backslash is an ordinary character, so `D:mine.weavedocschema` has no directory component there at all. The Windows leg of CI passed and Linux and macOS went red on the property count — the fixture asserted Windows spellings that only hold on Windows. A resolver for a bundled contract must not answer differently by host, so it now cuts at the last separator of either kind and emits forward slashes, with no import and one answer everywhere. Measured on all three legs rather than on the one that agreed.

## 2026-08-08.4

**Unreleased — the Phase 1 contract loader, corrected by review before anything is built on it.** Still read-only and unwired. Five defects, all in code shipped one bundle earlier, all found by an independent review of `2026-08-08.3` rather than by its own tests.

**A dirty contract could reuse a stale PASS.** The regression cache key hashed `.weavedoc/schema` by name and the versioned contracts beside it not at all, so editing `schemas/v3` moved nothing the cache could see: `--resume` replayed the previous PASS while a fresh key ran and failed. That is the same false-green v0.5.14/.15 closed for `bin/`, rebuilt one directory over — and it means the previous bundle's "KEY seal held" was true of the old files and vacuous for the new one. The key now walks the whole `schemas/` tree, and a probe edits the live contract, takes the key, restores it, and fails if the two keys match.

**The contract file was not bound to the version that asked for it.** `loadArtifactContracts(2, v3SchemaMap)` returned a fully-formed valid contract. A dispatcher that resolved the wrong path would have produced correct-looking roles for a document nobody asked for. The file's own `schema.version` is now checked against the request, and a mismatch exposes no role at all.

**Every Windows install would have read the wrong file.** `contractFileFor` stripped the trailing path component with a forward-slash regex, which finds nothing in `D:\mine\.weavedoc\schema` and glued `schemas/v3` onto the whole path. It is `node:path` now, normalised back to the forward slashes the rest of this runtime compares against, and asserted on both platform spellings. Version→file and version→adapter are explicit tables rather than a comparison against the floor: deriving "is this v2" from the floor means the day the floor rises, v3 mines quietly route through the v2 adapter.

**One token still had three answers.** `humanqueue.section`, `verify.section.human_queue` and `review.section.human_queue` were independent, and changing one left them split while the contract reported valid — the exact defect this module exists to end, reintroduced by the module itself. The heading is owned by the artifacts that declare it; the third opinion is gone, along with every v2 recognition key that `schemas/v3` was still carrying beside the role that replaces it (`gaps.enum.kind` stays: it assigns no role by position).

**Unroutable roles were accepted silently.** `verify.section.notes` and friends validated cleanly — a token the schema recognises that no consumer can route, which is the v2 known limit rebuilt one release after removing it. The role namespace is now closed by a roster per reserved prefix, in v3 only: in a v2 schema such a key names nothing and stays an unknown key, which this format has always treated as a named warning rather than a failure.

**Two mutations are unkillable by construction, and are named rather than hidden.** At the current floor the adapter table and a floor comparison are the same behaviour, so no input distinguishes them — the tables are pinned structurally instead, so collapsing them goes red. The byte-domain `encode` hook is a no-op because every fixed v2 token is ASCII; it guards the two-encoder class that bit v0.5.6 and v0.5.10 and only starts paying when a fixed token is not ASCII. Both are recorded at the code so the next mutation pass does not hunt for a fixture that cannot exist.

Also: the gaps-vocabulary equivalence compared sizes and one-way membership, so a vocabulary swapped word for word at the same count passed — both directions now. Acceptance §12.7: only #5 is complete at the contract layer. Cases 1–4 ask that status, validate and the writers judge through the SAME typed object, and no production consumer imports it yet — what exists is the prerequisite, not the equivalence. Recorded that way in the plan rather than counted as met.

## 2026-08-08.3

**Unreleased — schema v3 Phase 1 begins: a token's role is declared in one place, for two versions at once.** Read-only and unwired. No production consumer reads the new model yet, the mine's own contract is untouched, and the v2 suite grades the same runtime it did before; switching consumers is Phase 2's completion condition.

**The known limit gets a mechanism.** [`PARSER-MODEL.md`](.weavedoc/PARSER-MODEL.md) §5 records that the schema decided which words a reader *recognises* while what each word *meant* stayed hardcoded in the consumers — `open` waits, `ruled` is closed, the queue is the literal `Human queue`. `artifact-contracts.mjs` turns that into declared roles: `humanqueue.state.waiting`, `verify.section.units`, `review.section.violations` and the rest name their tokens once, and a consumer selects a role instead of splitting an enum or matching English. The bundled `schemas/v3` carries those keys; v2 keeps the single `.weavedoc/schema` it always had, because a second copy of one contract is a second answer waiting to drift.

**The v2 adapter's job is to agree, not to improve.** The properties assert equivalence with what production already computes — `verified-units.mjs`'s positional boundaries and marker, `gaps-register.mjs`'s open/accepted names and kind set — so the Phase 2 switch can be a deletion rather than a behaviour change. Where the three v2 shapes genuinely differ they are translated as they are, not harmonised: gaps and verify sections are positional lists, review's sections are a membership set whose gate is the fixed English name, and the queue/question words are fixed vocabulary that must still be present in the enum that declares them. A mine whose enum dropped `ruled` has no closed state, and the adapter says so rather than answering from a constant.

**One schema domain rule, stated by the caller.** `verifiedUnitsContract` takes the utf8 map and re-encodes; `gapRegisterContract` takes the byte map and does not. Both are correct today and having two conventions is a trap for the next edit — the class that made `status` and validate disagree about a non-ASCII state word in v0.5.6. The loader transcodes nothing, requires an explicit `domain`, and stamps it on the answer so a consumer can assert the tokens match the bytes it is about to compare.

**Version negotiation is total and picks no winner.** `project.md` and `config.yaml` are two records of one fact: missing, non-integer, disagreeing or above the runtime maximum all fail closed as `VERSION-MISMATCH` with no side adopted as authority, and a failed negotiation never returns a version. Below the floor is a *different* event with its own code and the pinned v1 bridge runtime (`v0.5.21`, `0257167`) named in it — telling a v1 user to upgrade the runtime would send them the wrong way. Runtime maximum is the runtime's own constant, never the mine's `schema.version`.

**Fail-closed as a unit.** An invalid, missing, duplicated or empty role leaves its artifact exposing *no* roles rather than the subset that parsed, and never shifts a later member into an earlier role. The positional property now uses a list with a compensating extra member as well as a short one: without the extra member the count check rejects the input anyway, so a reader that drops empties before assigning positions still looks correct. That combination was found by mutation, not by inspection.

**The fingerprint follows what ships.** `version`'s digest walks the versioned contracts beside the schema. From v3 the bundle carries more than one artifact contract, and a file deciding how a mine is read must not differ between two installs reporting the same fingerprint. An install predating the directory contributes nothing instead of losing its fingerprint. The bundle manifest gains the same path, fail-closed on its absence.

## 2026-08-08.2

**Unreleased — the comment-swallow contract says what it enforces, and the diagnostics added in `2026-08-08.1` are now executed by cases.** No parser behaviour changes: this bundle moves words and adds fixtures, so a mine that passed under `2026-08-08.1` passes here.

**One rule, three surfaces, one wording.** `consecrate` and `status --open` described the `REVIEW-COMMENT-SWALLOWS` suffix as "live prose". The judgment has always been the closer's shape — a deliberate archive ends its line with `-->`, horizontal blanks trimmed — so **any** further source text on that line is a suffix, an adjacent `<!-- … -->` included. `validate`'s message already said this ("its closing `-->` is followed by … on the same line"); the other two now match it, and [`.weavedoc/PARSER-MODEL.md`](.weavedoc/PARSER-MODEL.md) §6 states the trimming rule that separates a trailing space from a suffix. A contract three consumers read must not be written down twice.

**Four diagnostics gain the cases that execute them.** `2026-08-08.1` added `REVIEW-UNTERMINATED-FENCE`, `REVIEW-UNTERMINATED-FRONTMATTER` and `HQ-UNTERMINATED-COMMENT` as blocking checks and shipped them with no black-box case; the single-line comment-swallow form — the behaviour change that release declared — had none either, because every existing swallow case writes the multi-line shape. Each is pinned now from both sides, blocking and passing. This is the repository's recorded first defect class: a check that runs zero times and reports green. The `hqf === vmd` guard that routes `review.md` from `HQ-UNTERMINATED-FENCE` to `REVIEW-UNTERMINATED-FENCE` is a handoff no case counted, and now one does.

## 2026-08-08.1

**Unreleased — Markdown parsing and ledger state are now one model, not an accumulation of case handlers.** This is the architectural follow-through to the v0.6 parser candidate: the runtime no longer deletes comments, then reparses the joined text for fences and headings. A single byte-domain scanner assigns frontmatter, HTML comments, code fences, headings and source offsets in one precedence pass. The old `sections.mjs` and `review.mjs` parser families were deleted.

**Typed ledger state.** Human queue, questions and gaps now share one structural pass and keep syntax, materialisation, body state, slot state and hierarchy as independent axes. `missing`, `unclosed`, `blank`, `placeholder`, `known`, `unknown` and structurally `unreachable` are explicit states rather than overloaded empty strings. Each ledger supplies only its policy: Human queue uses literal-lead nesting and loose-list blanks; questions and gaps open entries at column zero; gaps stops fail-closed on unreadable grammar. Review remains shape-free but shares the lexer. Verified units and coverage have dedicated typed adapters over the same heading nodes.

**Readers and writers converge on the same nodes.** `validate`, `status --open`, `gaps`, `scope`, `census`, `consecrate`, `attest` and `upgrade` consume these models. When one physical file has multiple policies, they share one command-local document snapshot: review fidelity and its Human queue cannot observe two generations during one command. Writers splice original source offsets instead of rendering a masked projection, then reparse their candidate and prove that a mirror or verdict became live. Upgrade detects bracketed review kinds in every outside-gate context but auto-edits only an exact canonical first-token legacy record; frontmatter, fenced code, Markdown links/references, citations, inline code, near-spellings and later prose mentions require a human ruling. Present-but-unreadable migration inputs are unknown and refuse migration, never empty input.

**Combination coverage replaces example accumulation.** A pure Node 18-compatible property program exhausts the declared context × EOL × fence × slot × body × continuation × lead matrix (1,844 assertions), while black-box cases pin comment/fence precedence, section boundaries, malformed-state visibility, source-byte preservation and writer postconditions. Missing and unclosed terminal HQ states are crossed with every representable body/continuation shape; structurally unreachable ownership states are named rather than faked.

**Two behaviour changes, declared.** Historical behaviour is retained where it is contractual; these two are not, and are named here rather than discovered later.

- **`\r\r\n` is one line ending plus one content CR** ([`.weavedoc/PARSER-MODEL.md`](.weavedoc/PARSER-MODEL.md) §3), retiring the old two-pass CR strip that existed to match MSYS gawk on a runtime that no longer exists. A heading, a code-fence closer or an empty-ledger idiom written that way is no longer that token. In `gaps.md` this blocks (`section-count`), in `truths/verify.md` it blocks (`VERIFY-SECTION`), and in `review.md` the fidelity gate still blocks because the kind is then outside the zone. **Known issue:** a `review.md` Human-queue heading written `\r\r\n` is the one place that stays silent — the section is not found, its entries are missing from `status` and from the ownership check, and `review.sections` existence is deliberately not enforced. Not a normal-path input, so it is recorded rather than patched. Note also that `core.isFence` still keeps `\r` in its class, so the frontmatter fence — and only it — tolerates the second CR.
- **A single-line `<!-- … -->` holding a violation kind, followed by any further source text on the same line, is now a `REVIEW-COMMENT-SWALLOWS` incident.** The rule was always "a deliberate archive ends its line with `-->`"; the old reader spliced same-line comments out before the tripwire could see them, so only the multi-line form was ever tested. Both forms are judged now. The suffix is source text, not prose — trailing blanks are trimmed and end the line, while an adjacent `<!-- … -->` is a suffix like any other. This can newly block a `review.md` that passed before; the repair is the one the diagnostic already names — put the closing `-->` on its own line, or write the kind without brackets.

**Role contracts fail as a unit.** `gaps.sections` is exactly two distinct non-empty positional roles and `gaps.enum.kind` is a non-empty distinct vocabulary; `verify.sections` is exactly three distinct non-empty positional roles with one verdict marker. Dropping the first value, appending a role or duplicating a vocabulary member disables the whole affected model in every consumer instead of shifting later values into a different meaning. Both contracts split with `core.pipes()` — the runtime's one spelling of a pipe list — so a trailing delimiter, which adds no member anywhere else, cannot disable a register or the whole verification lane. Diagnostics exposed after policy-set union are sorted back into source order. Fence handling is named by its real transition (`suspend` or `stop`), and an unclosed bracket is tag syntax—not body text that can hide the only real continuation.

**One domain per comparison.** `status`'s Human-queue counters read `humanqueue.enum.state`/`.ownership` from the byte-domain schema map in validate's exact spelling, with no private default vocabulary. Reading them from the utf8 map made the listing and validate disagree about what a non-ASCII state word even is — recognised on one surface, unrecognised on the other. `status` also stops dropping a recognised state it has no policy for: only `ruled` is closed, and anything else surfaces as untagged instead of leaving the listing.

**Known limit, stated rather than implied.** The schema decides which words are recognised; what they MEAN is still hardcoded in the consumers (`open`/`ruled`, the three ownership words, `open`/`proposed` as waiting questions, the literal `Human queue` heading). FORMATS declares section headers and enum values to be fixed English, so the schema is where that fixed vocabulary is written down — not a rename knob. Renaming a value leaves its entries recognised but unrouted: ownership is not enforced on them, and a renamed `verify.sections` Human-queue position is not where the queue is read from. Recorded in [`.weavedoc/PARSER-MODEL.md`](.weavedoc/PARSER-MODEL.md) §5; making the roles themselves a typed contract is a separate change.

## 2026-08-07.10

**v0.5.21 — 장부는 펜스와 빈 줄을 사람처럼 읽어야 한다.** 독립 콜드 리뷰가 P1 세 묶음을 실측했다. 셋 다 **정상 입력**에서 나온다.

**① fenced Human queue 오인 (P1, 세 방향).** 이 장부는 HTML 주석만 벗기고 **코드펜스 판정을 안 썼다**(gaps.md는 v0.5.4부터 `defence`로 읽는다). 실측 세 건: fenced 예시의 `- [open] [user-only] …`가 **실제 대기 결정으로 계수**됐고, ownership 없는 fenced 예시는 **`HQ-UNTAGGED`로 rc 1** — 멀쩡한 파일을 막았으며, 진짜 `## Human queue`를 지우고 **fenced 제목만 남겨도 필수 절 검사가 통과**했다(광산에 큐가 아예 없는데 green). 이제 `hqRead()` 하나가 주석+펜스를 함께 벗기고 **walk와 필수-절 검사가 같은 텍스트를 읽는다**. 그 리더의 대가도 명명했다 — **미종결 펜스**는 뒤를 전부 지우므로 validate가 `HQ-UNTERMINATED-FENCE`로 막고 `status --open`이 경고한다(gaps·미종결 `<!--`와 같은 취급).

**② 빈 줄 하나에 실제 결정이 사라졌다 (P1).** walk가 빈 줄에서 `parentLead`·held stub·fold를 **전부 초기화**했다. 그런데 loose list — 항목, 빈 줄, 들여쓴 본문 — 은 평범한 마크다운이고 평범한 타이핑이다:

```md
- [{state}] [{ownership}]

  실제 결정 내용
```

실측 결과 `human queue: 0` · `status --open`은 "nothing is waiting on you" · validate rc 0. **모든 표면에서 동시에 소실**된다. 거울상은 반대로 **차단**했다 — 빈 줄 뒤의 nested `- [open]`이 형제로 오인돼 detail인 줄에 ownership을 요구했다(rc 1). 구조는 **lead**가 정하고 빈 줄에는 lead가 없다. 항목을 닫는 것은 들여쓰지 않은 줄이다.

**③ 빈 경로 보장이 절반이었다 (P1).** validate가 `materials`·`truths`·`documents`만 검사하고 **`inbox`를 빠뜨렸다** — 실측: 클론에서 `inbox/`만 없애도 `✓ all checks passed`. 그리고 init의 reconfigure 문단은 "가드 **둘**"이라 적혀 있는데 폴더 marker 항목은 "reconfigure에서도 실행"이라 적혀 있었다 — 두 줄이 서로를 반박했다. 넷 다 검사하고, reconfigure 가드를 **셋**으로 정리했다. **회귀도 고쳤다**: 기존 클론 케이스는 marker를 스스로 만들어서 스킬의 `.gitkeep` 지시를 지워도 green이었다 — 이제 케이스는 **네 경로 전수 행렬**을 돌고, `doccheck`이 **validate가 configured로 취급하는 키마다 init 스킬이 그 폴더와 `.gitkeep`을 명시하는지** 연결한다(스킬은 실행할 수 없는 지시문이라 이건 **텍스트 검사**이며, 그렇게 명시했다 — 양방향 변이로 red 확인).

**계약 정합 2건.** ① FORMATS는 kind 없는 불릿을 "malformed, **not a gap**"이라 하는데 status와 validate는 **open 총계에 넣고** 있었다 — v0.5.18에서 내가 총계를 validate에 맞춘 것이 방향을 잘못 잡았다. 이제 **어느 표면도 gap으로 세지 않고**(`1 open, 1 malformed`), 그 줄은 `COMP-MALFORMED`로 계속 막는다. ② 매니페스트의 필수 경로 검사가 **부분 문자열**이라 `weavedoc.mjs`가 없고 `weavedoc.mjs.bak`만 있어도 rc 0이었다 — 행의 **경로 필드를 exact match**한다.

**재현 못 한 지적 1건(정직하게 남긴다).** "`- [{state}] [` 같은 미폐합 두 번째 bracket이 조용히 pure stub으로 사라진다" — 실측하면 **내용이 있으면 사라지지 않는다**: 같은 줄에 내용이 있으면 untagged 항목으로, continuation에 있으면 실재화돼 표면화된다(`- [{state}] [{ownership} 실제내용`·`- [{state 실제내용`·`- [{state}] [` + 다음 줄 내용, 셋 다 확인). 사라지는 것은 **내용이 아예 없는 줄**뿐이고 그건 정상적인 템플릿 노이즈다. 다른 재현체가 있으면 알려주시라.

**미결로 남긴 것 1건(§11 기준 below-bar).** continuation fold는 부모보다 **얕거나 공백↔탭이 호환되지 않아도 접힌다**(실측 확인). 항목/detail 판정은 엄격 접두사인데 fold는 "들여쓰였는가"만 본다 — 비대칭은 사실이다. 다만 지금 동작은 **텍스트를 보여주는 쪽**으로 실패하고, 엄격하게 바꾸면 그 줄을 **표시에서 잃는다**(붙일 상위 항목을 추적하려면 lead 스택이 필요하다). 데이터 파괴도 정상 경로의 오차단/오통과도 아니므로 이번엔 손대지 않고, 스택 설계는 요청이 있으면 별건으로 한다.

**회귀 10건 추가**(9건 red-first): fenced 예시 3방향·미종결 펜스·loose list·빈 줄 뒤 nested·configured 경로 전수 행렬·클론 왕복 4경로·gaps 계약 수치·매니페스트 exact match. 변이 확인: `hqRead`를 `nocomment`로 되돌리면 펜스 3건이, 빈 줄 리셋을 되살리면 loose list가, `inbox`를 목록에서 빼면 경로 행렬이, exact를 prefix로 바꾸면 매니페스트가, 스킬 문구를 지우면 doccheck이 각각 빨개진다.

## 2026-08-07.9

**v0.5.20 — 하네스 한 건 수정, 런타임 무변경.** v0.5.18 태그는 3-OS CI에서 **red**로 끝났다(릴리스 잡 skip, 발행물 없음). 원인은 런타임이 아니라 이번에 추가한 케이스 하나다: `acct_openlist_gaps_arrays_agree`가 `--input-type=module` 없이 `node -e` 안에서 top-level await를 썼고, node 20(컨테이너)·22(로컬)는 모듈 문법을 감지해 실행하지만 **선언된 바닥인 node 18은 SyntaxError**다 — 그리고 **CI만 18로 돈다**. 로컬 518/518 green, 컨테이너 518/518 green, CI 3-OS 전부 red. 케이스를 **CLI 블랙박스로 다시 썼다**(정렬이 어긋나면 malformed 라벨이 옆 줄로 옮겨간다 — 두 `kinds.push` 각각에 대해 변이로 red 확인). **태그는 하나도 옮기지 않았다**: v0.5.18은 red 이력으로 남고, v0.5.19는 릴리스 게이트가 거부한 이력으로 남는다(한 번들에 릴리스 주장은 하나라는 계약 — 같은 절에 주장을 둘 넣은 것이 원인이고, 그 게이트는 옳다). 발행은 v0.5.20이다. **런타임 코드는 `.8`과 동일**하고 fingerprint `c489e6ed4cc8`도 그대로다 — 이 번들이 `.8`과 다른 것은 `VERSION` 한 줄뿐이다. 교훈은 케이스보다 크다 — **로컬도 컨테이너도 선언된 바닥을 채점하지 않는다**. tests/README에 명문화했고, 컨테이너 이미지를 18로 내리는 것은 미결로 남긴다.

## 2026-08-07.8

**v0.5.18 — 구조 판정은 한 곳에서, 그리고 배포는 소비자의 저장소까지다.** (이 번들에서 태그가 둘 나갔고 **둘 다 발행에 실패했다**: `v0.5.18`은 3-OS CI red — 아래 회귀 케이스 하나가 node 18에서만 SyntaxError였다; `v0.5.19`는 스윕 3-OS green이었지만 릴리스 게이트가 **한 번들에 릴리스 주장은 하나**라는 계약으로 거부했다 — 같은 절에 주장 두 줄을 넣은 내 잘못이다. 실제 발행은 번들 `2026-08-07.9`의 `v0.5.20`이며, 런타임 바이트는 이 번들과 `VERSION` 한 줄만 다르다. 태그는 하나도 옮기지 않았다.) 독립 콜드 리뷰와 downstream 재클론이 above-bar 4건을 실측했다.

**① Human queue의 lead 계약이 placeholder에만 적용됐다 (P1).** v0.5.17이 "더 깊은 불릿은 detail"을 placeholder 분기에만 가르쳤고, `- [open]`은 그 앞에 그대로 있었다. 실측:

```md
- [open] [user-only] PARENT
  - [open] CHILD-DETAIL
```

`status`는 대기 결정을 **2건**으로 셌고(FORMATS는 1건이라 한다), `validate`는 항목이 아닌 줄에 소유권 태그를 요구하며 **rc 1**로 막았다 — 멀쩡한 파일에서. 태그를 넣으면 이번엔 **존재하지 않는 대기 결정**이 보고된다. 같은 분열이 같은 lead의 일반 untagged 형제를 침묵 소실시키고, 들여쓴 `[ruled]` 밑의 하위 불릿을 중복 계상했다.

원인은 워커가 둘이었다는 것이다 — `status`의 걸음과 `validate`의 독립 walker. **`hq-ledger.mjs`를 만들어 구조 판정을 한 번만 한다**: 어떤 줄이 항목인지는 의견의 문제가 아니고, 그것으로 무엇을 할지가 정책이라 각자에게 남는다. `status`는 버킷으로 나누고, `validate`는 받은 항목의 태그를 검사한다. 규칙도 일반화했다 — **제어문자만으로 된 lead(컬럼 0 포함)는 언제나 항목**, 그 외에는 위 항목보다 **엄격히 더 깊을 때만** detail. placeholder 전용이던 `HQ_STUB_ENTRY`가 모든 불릿의 규칙이 됐다.

**② Windows downstream 재클론에서 런타임이 깨졌다 (P1).** 이 저장소는 루트 `.gitattributes`로 `.weavedoc/** text eol=lf`를 고정하지만, **배포 계약은 "`.weavedoc` 폴더 복사"**라 그 핀이 경계에서 멈춘다. `core.autocrlf=true`(Windows 기본값)로 fresh clone한 실측: schema에 CR **97개**, 진입점에 **381개**, fingerprint `ea390a9e0fbc` → `d1324e0a09b7`, validate **rc 1 · 372 problems**(FM-MISSING 300 · RESOLUTION-ENUM 61 · PROV-ENUM 8).

분해해서 원인을 특정했다: **CRLF 런타임 + LF 광산 = 372건**, **LF 런타임 + CRLF 광산 = 정상**. 즉 광산 바이트가 아니라 **런타임이 자기 schema를 읽는 것**이 깨진다. `loadSchema`만 CR을 남기고 있었고, 그 근거로 적혀 있던 것은 **bundle 2026-08-05.3에서 삭제된 bash 런타임과의 파리티**였다 — 원본이 사라진 순간이 물려받은 규칙을 다시 정할 때다(장부 CRLF를 §11 2026-08-05에 통일한 것과 같은 판정: **리더는 하나**). 두 반쪽을 함께 고쳤다: **파서가 판정을 되살리고**, **`.weavedoc/.gitattributes`를 번들에 실어 fingerprint를 되살린다**(매니페스트에도 등재).

**③ 빈 configured 디렉터리가 clone에서 사라졌다 (P1).** Git은 파일만 저장하므로 비어 있는 `documents/`는 clone에 없고, validate는 `CFG-PATH-MISSING`으로 정확히 막는다. **없는 디렉터리를 빈 것으로 간주하는 완화는 하지 않았다** — 0회 실행되는 검사와 통과는 구분돼야 한다. `weavedoc-init`이 configured 경로마다 `.gitkeep`을 보장하고(reconfigure 포함), 회귀는 **광산을 커밋 → clone → validate**로 실제로 왕복한다.

**④ pathspec 환경변수로 같은 KEY·다른 manifest (P1).** `git rev-parse --local-env-vars`는 `GIT_LITERAL_PATHSPECS`류를 **세지 않는다**. 실측: 그 넷 중 셋이 걸리면 매니페스트가 46행 `fb6a96eb…` → 36행 `09c403ef…`가 되는데 **하네스 키는 그대로**라, `--resume`이 fresh 실행이면 실패할 PASS를 재생한다. 양쪽을 독립적으로 막았다 — git-env.sh가 그 넷을 지우고(열거지만 git에 열거자가 없으므로 이유를 적어 남긴다), **make-manifest.sh는 애초에 pathspec glob에 의존하지 않는다**(`.claude/skills/weavedoc-*` → 디렉터리 + 루프 필터). `bin/`도 트리 통째로 받는다.

**매니페스트 생성기가 fail-closed가 됐다.** 실측: 저장소 밖 실행·필수 경로 없는 저장소·읽히지 않는 blob — 셋 다 **빈 매니페스트에 rc 0**이었고, 마지막 것은 **빈 입력의 sha256(`e3b0c442…`)을 파일 다이제스트로 기록**했다. 이제 `pipefail` + blob 실패 승격 + 64-hex 검사 + **필수 경로 확인**(개수 임계가 아니라 이름)으로 거부한다.

**gaps.md의 "비었음" 계약을 명문화했다 (사용자 재정).** `- (없음)`/`- (none)`은 **Human queue와 questions.md의 idiom이고 완결성 등록부의 것이 아니다** — 여기서 빈 절은 **불릿 0개**다. 등록부는 fail-closed이고 모든 불릿이 kind를 가진 gap 또는 결정이라는 단순 불변식이 언어별 예외보다 값이 크다. 대신 kind 없는 불릿을 **`malformed register entry`로 표시**한다(`status --open`은 설정과 무관하게, validate는 `required`에서 `COMP-MALFORMED`로). **표시일 뿐 총계에서 빼지 않는다** — 자기 검토에서 첫 철자가 `0 open, 1 malformed`를 찍는데 validate는 같은 스캔으로 `2 open gap(s)`를 막고 있었다: 한 파일 두 숫자, 이 lane이 없애려는 바로 그 계열이다. 이제 `gaps (2, 1 malformed)`이고 그 일치를 케이스가 단언한다. 그리고 이 표시는 **kind 슬롯이 아예 없는 줄**에만 붙는다 — placeholder가 남은 kind 위에 실제 내용이 있는 항목은 FORMATS가 명시적으로 **열린 갭으로 센다**(첫 철자가 그것까지 빼서 기존 케이스 둘이 정당하게 빨개졌다). eclypse의 `- (없음)` 삭제가 옳은 처리였다. `scanRegister`가 **항목별 kind 판정**을 돌려주고 집계는 거기서 파생된다 — 판정 하나, 리더 둘.

**회귀 15건 추가**(대부분 red-first): nested `[open]`(태그 유무 양쪽)·들여쓴 `[ruled]`의 부모성·같은 lead untagged 형제·CRLF schema·빈 디렉터리 clone 왕복·pathspec 4종·매니페스트 fail-closed 3축·gaps idiom(Open·Accepted·정상 빈 형태). 변이 확인: `HQ_OPEN`을 lead 비교 앞으로 되돌리면 ①이, `loadSchema`를 되돌리면 CRLF가, `.gitkeep`을 빼면 clone이, 소싱/pipefail/필수경로를 되돌리면 하네스 케이스가 각각 빨개진다.

## 2026-08-07.7

**v0.5.17 — 부모가 누구인지 알아야 detail이다, 그리고 격리는 상속된 git 환경 전부다.** 외부 리뷰가 above-bar 2건을 실측했다. 둘 다 **v0.5.16이 만든 것**이다.

**① Human queue의 형제 항목이 합쳐지거나 사라졌다 (P1).** v0.5.16은 "들여쓴 placeholder가 detail이려면 위에 뭔가 있어야 한다"를 **불리언**으로 구현했다. 불리언은 *무엇의* 하위인지를 말하지 못하므로, 같은 들여쓰기의 **형제**와 진짜 **자식**을 구분할 수 없다. 실측 3건:

- `  - [{state}] [{ownership}]` + 본문 continuation이 **두 벌** 있으면 → 첫 항목이 실재화되며 플래그가 서서 둘째가 "detail"이 됐다: `status` untagged **1건**, `--open`은 두 항목을 **한 줄로 병합**.
- 유효한 `  - [open] [user-only]` 항목 **뒤에** 같은 들여쓰기의 placeholder가 오면 → 내용 있는 항목의 detail은 버려지므로 둘째 항목이 **통째로 사라졌다**(`--open`이 이름조차 안 냈다).
- 반대로, 표면화된 고아 **아래의** 더 깊은 placeholder는 (플래그를 일부러 안 세웠으므로) **독립 항목으로 중복 계상**됐다 — FORMATS의 "더 깊은 들여쓰기는 detail"과 정면 충돌.

이제 `parentLead`가 **부모의 들여쓰기 문자열 자체**를 들고 있고, detail은 *엄격히 더 깊을 때*만이다(부모의 lead로 시작하면서 더 긴 것). 같은 lead는 **형제**, 부모의 확장이 아닌 lead(두 칸 공백 밑의 탭)도 형제로 **표면화**한다 — 애매한 들여쓰기에서 정직한 답은 감추는 쪽이 아니다. 표면화된 placeholder도 이제 **부모가 될 수 있다**(v0.5.16이 금지했던 것): 형제를 삼키지 못하게 막는 것은 부모의 부재가 아니라 lead 비교다. 덤으로 **`## Human queue` 절 경계에서 상태가 리셋된다** — 절 본문들이 아무 구분 없이 이어붙어, 한 라운드의 마지막 항목 밑에 다음 라운드의 첫 항목이 붙으면 그것도 사라졌다. `sectionEach`를 만들고 `sectionAll`을 그것의 join으로 정의했다(워커 하나, 답 하나). `TAG_LEAD`도 core로 올려 두 모듈이 같은 상수를 각자 조립하지 않게 했다.

**② 상속된 git 환경이 여전히 새어 들어왔다 (P1).** v0.5.16은 `GIT_DIR`·`GIT_WORK_TREE`·`GIT_INDEX_FILE` **셋을, 그때 찾은 호출 지점에서만** 지웠다. `git rev-parse --local-env-vars`가 세는 것은 **열다섯 개**고, 나머지 열둘이 계속 샜다. 실측:

- `GIT_OBJECT_DIRECTORY`가 걸린 환경에서 인덱스 케이스를 돌리면, 그 임시 저장소가 **무관한 저장소에 object 79개를 썼다** — 케이스는 **PASS**를 찍으면서. 테스트가 채점하지 않는 트리를 건드리면 안 된다던 바로 그 릴리스에서.
- `GIT_INDEX_FILE`은 `compute_key`에서만 지워졌고 `make-manifest.sh`에는 그대로였다 → **키는 기본 인덱스를, 매니페스트는 대체 인덱스를** 읽었다. 같은 키 · 다른 매니페스트: `--resume`이 fresh 실행이라면 실패했을 PASS를 재생하는 **false-green**.
- `GIT_OBJECT_DIRECTORY`·`GIT_COMMON_DIR`·`GIT_CONFIG_PARAMETERS`는 각각 **캐시 키를 움직였다**.

고친 방식이 요점이다. **호출 지점을 열거하는 대신 원인을 없앴다**: `tests/git-env.sh`가 git이 스스로 말하는 목록을 받아 **소싱한 셸에서 전부 unset**한다. 그러면 이 파일들의 모든 git 호출은 — 앞으로 추가될 것까지 — 별도 접두사 없이 깨끗하고, 파일당 git을 한 번씩 띄우는 매니페스트에 `env` 프로세스가 붙지도 않는다. `regress.sh`·`make-manifest.sh`·`release-notes.sh` 셋이 이 한 파일을 소싱하고, 공허 가드가 정리 실패를 **조용한 통과가 아니라 rc 2**로 만든다. (v0.5.13~16이 캐시 키 입력을 이름으로 세 번 쫓다 결국 집합 자체를 표현해 닫은 것과 같은 교훈이다.)

**회귀 검사.** HQ 6건(형제 실재화·`[open]` 옆 고아·고아 밑 더 깊은 detail·**실재화된 stub 밑의 detail**·절 경계·제어문자 lead) + 하네스 2건(`meta_git_env_ignored_by_key_and_manifest` — 열다섯 개 전부를 오염시켜 키와 매니페스트가 함께 움직이지 않는지; `meta_git_env_writes_stay_inside` — 오염된 환경의 자식 하네스가 victim 저장소에 **아무것도 쓰지 않는지**). 변이 확인: 소싱 줄을 지우면 앞의 것은 `key(…!=…) manifest`로, 뒤의 것은 **"자식이 victim에 object 80개를 썼다"**(케이스는 그때도 PASS를 찍는다)로 정확히 빨개진다. 제어문자 케이스는 **수정 전후 모두 통과하는 과잉차단 방지 가드**다 — 그 계약(제어문자 lead는 부모가 있어도 항목이다)이 여태 아무 케이스로도 고정돼 있지 않았다(변이로 red 확인). 실재화된 stub 케이스는 **부모의 들여쓰기를 stub이 아니라 continuation에서 읽으면** 한 항목이 둘로 갈리는 것을 잡는다 — 형제 케이스로는 안 보이는 축이다. 그리고 소싱 자체가 실패하면(파일 부재) 세 스크립트 모두 **조용히 진행하지 않고 rc 2로 거부**한다: `.`의 실패는 `set -e` 없이는 치명적이지 않아, 가드가 없으면 격리가 사라진 채로 끝까지 돈다.

**문구 3건.** ① `IMPROVEMENT_PLAN.md`가 아직 v0.5.15를 현행으로 표시 ② KEY 주석이 "bin/ 트리가 `$WD_ENTRY` 해시를 subsume한다"고 단언 — v0.5.15가 **그 문장만 믿고** 줄을 지웠다가 v0.5.16이 되돌린 자리인데 문장은 그대로였다 ③ nested placeholder 행렬 주석이 "EVERY lead … FF/CR"을 주장하지만 실제로는 space·tab뿐이고, 제어문자는 애초에 **반대 답**(항목)이다.

## 2026-08-07.6

**v0.5.16 — 테스트가 자기가 채점하는 트리를 건드리지 않는다.** 외부 리뷰가 above-bar 3건 + 하네스 결함 1건을 실측했고, 넷 다 v0.5.15가 만든 것이다.

**콜드 리뷰(커밋 전)가 critical 2건을 더 잡았다 — 둘 다 이 패치가 만든 것.** ① **`git init`이 상속된 `GIT_DIR`을 존중한다**: 인덱스 케이스가 만든 임시 저장소가 GIT_DIR이 걸린 환경(훅·`rebase --exec`·`bisect run`·`submodule foreach` — 즉 "커밋 전에 스윕 돌리기"의 평범한 배선)에서는 **실제 저장소의 인덱스를 초기화하고 스크래치 트리를 스테이징**했다(실측: 스테이징돼 있던 파일이 사라지고 케이스는 PASS). `env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE`로 감쌌다 — `compute_key`의 git 호출도 같이(안 그러면 **엉뚱한 저장소로 키를 계산**한다). 프로브를 라이브 트리 밖으로 옮긴 그 릴리스에서, 한 케이스 옆에 같은 클래스를 새로 만든 것이다. ② **`parent`가 불리언이라 두 번째 고아부터 사라졌다**: 첫 고아를 표면화하며 `parent`를 세워 형제들이 "placeholder의 detail"이 됐다 — 세 줄 중 하나만 나왔다. **표면화된 placeholder는 부모가 아니다**(실제 항목만 detail을 가질 수 있다). 덤으로 `- [ruled]`가 부모로 안 잡히던 것도(컬럼0 리셋이 방금 세운 플래그를 지웠다) 한 곳에서 결정하도록 합쳤다.

**should-fix 6건.** ① `--one`의 워커 거부가 **케이스를 실행한 뒤** 나와서, 거부 전에 부모의 공유 캐시에 PASS를 써 넣었다 → 아무것도 하기 전으로 옮겼고 커버리지도 붙였다(그 분기는 in-repo 호출자가 없어 지워도 스윕이 green이었다) ② 새 키 케이스들이 `TMPDIR`을 안 넘겨 공유 임시 디렉터리에 빈 `wd-reg-*`를 10개 남겼고, CI의 §7.3 실행-케이스 artifact가 **빈 목록**을 발행할 수 있었다 ③ 두 probe의 공허 가드가 **첫 키만** 검사했다 ④ 프로브 주석이 "호출자가 지운다"고 했지만 격리 복사본으로 옮기며 그 `rm`은 사라졌다 ⑤ tests/README의 KEY 목록에 `.weavedoc/VERSION`이 빠지고 `tests/**`를 과장했으며 순서가 코드와 달랐다 → `compute_key` 순서 그대로 ⑥ `.claude/skills` 설명의 뒷문장("표면을 넓힌다")이 여전히 거짓이었다.

**① 프로브가 실제 저장소 파일을 파괴했다.** `--one`의 씰을 실행시키려고 만든 프로브 케이스가 **live `$REPO`**에 `.weavedoc/bin/lib/.seal-probe.mjs`를 쓰고 호출자가 지웠다 — 그 경로에 **원래 파일이 있으면 삭제된다**(실측: 기존 파일 SHA `2571…` → DELETED). 게다가 A→B→A 형태라 씰은 못 보고, 병렬 스윕 중 다른 워커가 B 상태를 읽을 수 있었다. **테스트는 자기가 채점하는 트리를 변형해선 안 된다** — 이제 `$W` 아래 격리 복사본에서 돈다.

**② `$WD_ENTRY` 바이트가 다시 키에서 빠졌다.** v0.5.15가 "bin/ 트리가 덮으니 중복"이라며 그 줄을 지웠는데, `WD_BIN`은 **임의의 project-relative 경로**를 받는다 — `.weavedoc/alt-entry.mjs`는 bin/ 아래가 아니다. 실측: 편집해도 키가 그대로(`45b0…` → `45b0…`)고 `--resume`이 옛 PASS를 재생한다. 한 줄 복원.

**③ 부모 없는 들여쓰기 placeholder가 조용히 사라졌다.** v0.5.15가 "들여쓴 placeholder = detail"로 정리했는데, **위에 아무것도 없으면** detail이 될 대상이 없다 — `  - [{state}] [{ownership}] REAL-DECISION` 하나만 있는 절이 "nothing is waiting on you"를 찍었고 validate도 green이었다(placeholder state는 enum 밖이라 건너뛴다). 이제 `parent` 상태로 갈린다: 부모 아래면 detail, 고아면 표면화. 정규식만 되돌리면 중첩 오계수가 다시 열리므로 **상태로** 풀었다.

**④ `--one`이 FAIL을 찍고 rc 0으로 끝날 수 있었다.** 결과 파일 **전체**에서 `TAB+PASS`를 찾아, 케이스 출력에 인용된 다른 실행의 `PASS`가 잡혔다(씰 케이스들이 그런 출력을 낸다). 집계는 이미 `head -1`을 쓴다 — 같은 규칙을 이 출구에도. 아울러 `--one`이 워커 환경에서 씰을 **조용히 건너뛰던 것**도 `--seal-check`과 같은 이유로 거부한다.

**P2 — 새 장치들이 또 커버리지 없이 들어와 있었다.** 재귀 `bin/`·`tests/` 해시와 인덱스 해시를 이전 구현으로 되돌려도 **493/493**이었다. `meta_key_covers_every_live_input`(bin 최상위·bin 중첩·tests 중첩·bin 밖 `$WD_ENTRY` 네 축을 격리 복사본에서 실제로 움직여 본다)과 `meta_key_covers_the_git_index`(임시 git 저장소에서 **스테이징만** 된 변경이 키를 움직이는지)를 넣었다 — 변이로 각각 정확히 빨개지는 것 확인. 그리고 nested placeholder 케이스가 space만 보고 있어 **tab arm**을 추가했다.

**문구 2건.** "`.claude/skills`를 KEY에서 뺐다"는 부정확하다 — **경로 목록(`key_paths`)에서만** 뺐고 내용 해시는 그대로다. tests/README의 KEY 설명도 `진입점 + bin/lib + schema` 시절 그대로여서 현재 구성으로 갱신했다.

## 2026-08-07.5

**v0.5.15 — 키가 디렉터리를 통째로 본다, 그리고 새 장치들이 실제로 시험된다.** 콜드 리뷰가 above-bar 0으로 판정하면서 잡은 것들. 절반이 v0.5.14가 만든 것이다.

**키가 아직 내용에 눈감은 자리 — `.weavedoc/bin` 최상위.** 키는 `bin/weavedoc.mjs`와 `bin/lib`를 **이름으로** 해시했는데, 불변식 케이스들이 감시하는 집합은 "bin/ 아래의 모든 `.mjs`"다. 그래서 `bin/extra.mjs` 같은 파일은 **경로만** 키에 있고 내용은 없었다 — 실측: 만들면 키가 움직이지만 **편집하면 안 움직이고**, `--resume`이 옛 PASS를 재생하며 fresh 실행은 실패한다. v0.5.14가 `$WD_ENTRY` 하나를 이름으로 덧붙여 막았던 것과 **같은 클래스, 한 파일 옆**이었다. 이제 `find "$REPO/.weavedoc/bin" -type f`로 **트리 전체**를 해시하고(그 결과 `$WD_ENTRY` 줄은 불필요해져 삭제), `tests/`도 같은 이유로 재귀 해시한다(`baseline/`은 prune — 거기서 케이스가 읽는 건 매니페스트 두 개뿐이라 이름으로 해시한다).

**`.claude/skills`를 `key_paths`(경로 목록)에서만 뺐다 — 넣은 근거가 재현되지 않는다. 내용 해시는 그대로 남아 있다.** v0.5.14는 "같은 바이트로 rename하면 매니페스트는 움직이는데 키는 그대로"라고 적었지만, `make-manifest.sh`는 **인덱스**를 읽으므로 워킹트리 rename은 매니페스트를 움직이지 않고, **스테이징된** rename은 (v0.5.14가 넣은) 인덱스 해시로 이미 키를 움직인다. (다만 "표면을 넓힌다"는 그때 적은 이유는 과했다 — 내용 해시가 그대로라 임시 파일 하나로 키가 움직이는 것은 변하지 않는다; 경로 목록에서 빠졌을 뿐이다.)

**새 장치 둘이 커버리지 0이었다.** `--one`의 씰 호출을 지워도, 워커 분기의 `--seal-check` 거부를 지워도 **전부 green**이었다 — "텍스트는 행위가 아니다"를 헤드라인으로 내건 릴리스에서. 이제 `meta_key_seal_covers_one_and_worker_branch`가 둘 다 실행한다: `--one`이 실제로 거부하는지(전용 프로브 케이스가 `--one` 실행 중에 keyed 파일을 써서 **결정론적으로** 키를 움직이고, 호출한 케이스가 그 파일을 지운다), 그리고 워커 분기가 **정의되지 않은 함수로 죽는 대신** 이유를 말하며 거부하는지. 프로브는 `sealprobe_`로 이름 지어 **선택자 밖**에 둔다(`^(block|pass|acct|meta|e2e)_`) — 일반 스윕에 잡히면 파일을 남겨 스윕 자신의 씰이 (정당하게) 거부하고 매 실행이 실패한다. 저장소가 `nodeshape_`를 선택자 밖에 두는 것과 같은 이유다.

**`--one`도 워커 분기에서 죽고 있었다.** v0.5.14가 `--one`에 씰을 걸면서 `--seal-check`에만 가드를 달아, 워커 환경에서 `--one`을 부르면 `seal_or_refuse: command not found`로 조용히 무동작이었다(`set -e`가 아니라 rc 127이 버려진다). 같은 가드를 걸었다.

**주석 3건 — 또 같은 클래스.** ① stub 분기 위 주석이 **방금 제거한 패턴**(`HQ_STUB_OPENER`)을 계속 옹호하고 있었다 ② 분기의 근거로 "게이트가 그 선을 긋는다"고 적었는데 **거짓**이다 — `checkHqTags`는 공백·탭을 `\v`와 **똑같이** 벗긴다(실측: 세 형태 모두 rc 1 + 같은 진단). 진짜 근거는 각 형태의 오랜 계약이므로 그것만 남겼다 ③ 그 결과 죽은 `HQ_STUB_OPENER` 상수와 그것을 쓰던 **공허한 가드**(`!STUB && OPEN` — 둘 다 같은 선행을 먹고 `- [open]`은 결코 `- [{`일 수 없다)를 함께 지웠다.

**문서.** ① `.4`가 v0.5.11 절을 "전체 복원"이라 적고 **원문 네 구절을 빠뜨렸다** — 콜드 리뷰가 낱말 단위로 대조해 잡았고, 넷 다 복원했다 ② 새 각주가 `##` 제목 앞 빈 줄을 먹어 파일에서 유일하게 어긋난 제목이 됐다 ③ 하네스 안에 남아 있던 두 번째 낡은 수치("`validate` 한 번 ~40s" — 실측 ~1s, Node 이전 값) ④ `--one`이 이제 rc 2로 끝날 수 있다는 것과 그 비용(키를 한 번 더 계산해 +44%)을 README와 머리말에 적었다.

## 2026-08-07.4

**v0.5.14 — 씰이 실제로 인덱스를 본다.** v0.5.13이 "git 인덱스를 키에 넣었다"고 적었지만 **넣지 않았다**: `git ls-files -s`를 공용 `{ … } | awk '{print $1}'` **안**에 두어, awk가 첫 필드만 남기는 바람에 blob SHA와 경로가 버려지고 **파일 모드만** 키에 들어갔다. 외부 리뷰가 정상 개발 동작으로 재현했다 — 파일을 고치고 스윕을 시작한 뒤 중간에 `git add` → **491/491 rc 0**, `--resume`은 0건 실행으로 그 PASS를 재사용, fresh salt는 manifest drift로 FAIL. 이제 `git ls-files -s -z | sha256sum`을 **awk 밖에서** 통째로 해시한다(실측: 스테이징 하나로 키가 `4c40…`→`df49…`로 움직이고 되돌리면 복귀).

**같은 P1의 나머지 둘.** ① 키는 항상 기본 `weavedoc.mjs`를 해시해서 **실제로 시험 중인 `$WD_ENTRY`의 바이트가 빠져 있었다**(대체 러너를 쓰면 그 파일을 고쳐도 `--resume`이 옛 PASS를 준다) → `sha256sum "$REPO/$WD_ENTRY"` 추가 ② `key_paths`에 `.claude/skills`가 없어 **같은 바이트로 rename하면** 키는 그대로인데 매니페스트는 달라졌다 → 목록에 추가.

**P2 — "캐시 삭제를 테스트한다"는 주장이 거짓이었다.** 케이스가 `$W/.sealres`를 만들고 정작 **자식이 쓰는 캐시**(`$TMPDIR/wd-reg-<key>/res`)는 보지 않았고, 세어둔 개수는 쓰이지도 않았다 — 실제 `rm -rf`를 `:`로 바꾼 변이가 **통과**했다. 이제 자식의 진짜 캐시에 sentinel을 심고 소멸을 단언한다(그 변이에서 정확히 빨개지는 것 확인). 아울러 공개 진입점 `--one`도 케이스 결과를 출력한 **뒤** 씰을 건다.

**컨테이너 스윕이 잡은 것 — 이 케이스는 `--one`으로는 절대 실패하지 않았다.** 새 케이스가 자식을 부를 때 `WD_REG_RES`를 지우지 않아, **--batch 워커 안에서 돌면** 그 값이 상속돼 자식이 "워커" 분기로 가고 거기엔 `compute_key`가 없다 — 씰이 돌지 못해 케이스가 실패했다. 자식 호출에서 두 변수를 비우고, `--seal-check` 자체도 워커 분기에서 호출되면 **이유를 말하고 거부**하게 했다. 교훈: 하네스 케이스는 `--one`이 아니라 **전체 스윕의 실제 팬아웃**에서 확인해야 한다.

**Below-bar — v0.5.13이 과교정했다.** stub 분기를 `HQ_STUB_OPENER`(TAG_SEP 전체)로 넓히면서 **일반 공백/탭 들여쓰기까지** 삼켜, 실제 항목 아래의 placeholder 하위 불릿이 **별도 대기 항목**으로 보고됐다(v0.5.12: 1건 → v0.5.13: 2건). 공백/탭 들여쓰기는 continuation(detail), **제어문자 선행만** 게이트가 항목으로 받는 형태이므로 둘을 갈랐다(`HQ_STUB_ENTRY`). 비대칭은 의도다 — 들여쓴 `- [open]`은 예전부터 계수되고, 들여쓴 placeholder는 예전부터 detail이다.

**문서.** ① `.3`이 CHANGELOG의 제어문자를 이스케이프 텍스트로 바꿨지만 **그 제어문자가 만들었던 줄바꿈은 그대로 남아** v0.5.11 절의 문단 여섯 곳이 문장 중간에서 끊겨 있었다 — 절 전체를 복원했다 ② 리터럴 SOH 2개(하필 *그 함정을 설명하는 문장* 안에 있었다) → `\x01` ③ `tests/regress.sh` 머리말이 아직 `notes/regress.sh` 실행법과 옛 타이밍을 적고 있었다.

## 2026-08-07.3

**v0.5.13 — 스윕이 자기 기준을 봉인한다.** 외부 리뷰가 v0.5.12에서 **P1 false-green**을 실측했다: 워커가 부모의 캐시 KEY를 물려받는데(v0.5.12), 그 KEY는 **첫 케이스 전에 찍은 스냅샷**이고 그 뒤로 아무도 다시 보지 않았다. 그런데 케이스가 전부 픽스처만 읽는 게 아니다 — golden·doccheck·소스 형태 검사·장애 주입은 실행 중인 `$REPO`를 **다시 읽는다**. 그래서 스윕 도중 소스가 바뀌면 결과가 두 소스 상태에 걸쳐 흩어지고, 요약은 **한 번도 존재한 적 없는 트리에 대해 하나의 판정**을 찍는다.

**실측**(재현 그대로): 스윕 시작 18초 뒤 keyed 런타임 파일을 편집 → 스윕은 그대로 green을 찍고, 곧바로 같은 트리에 fresh key로 돌린 `acct_golden_outputs_current`는 **DRIFT로 실패**한다. 같은 트리, 두 답. 이 저장소가 가장 오래 이름 붙여 온 클래스(**검사가 green을 찍으며 아무것도 재지 않는다**)의 하네스판이다.

**수정: KEY seal.** KEY 계산을 `compute_key()` **하나**로 빼고(두 철자는 두 답이다), 워커가 끝난 뒤 **집계 전에 다시 계산**한다. 다르면 총계를 **보고하지 않고** rc 2로 거부하며, 결과 캐시를 **지운다** — 섞인 결과가 멀쩡한 KEY 아래 남으면 그게 바로 `--resume`이 "이미 통과했다"며 돌려줄 물건이기 때문이다. 검증: 위 재현을 새 하네스로 돌려 **rc=2 · "the tree changed while the suite was running — key … at start, … now" · 캐시 폐기** 확인. *행위 증명은 레이스라 수동 실측으로 하고(케이스가 $REPO를 편집하면 그게 곧 이 결함이다), 대신 `meta_key_seal_is_one_function_called_twice`가 **구조**를 고정한다 — 정의 1회·호출 2회(시작+씰)·거부 메시지 1회.*

**릴리스 잡 멱등화.** 태그가 이 잡에 두 번 닿을 수 있다 — push run과 같은 태그의 workflow_dispatch, 정확히 2026-08-06 Actions 장애가 강제했던 조합 — 그런데 `gh release create`가 두 번째에서 실패해서, **3-OS 게이트를 전부 통과한 run이 이미 발행된 릴리스 때문에 빨갛게** 끝났다. 이제 릴리스가 있으면 **manifest digest를 대조해** 같으면 성공, 다르면 거부한다(발행은 게이트가 아니지만, 다른 트리가 발행된 태그를 입는 것은 통과시킬 수 없다).

**Below-bar 1건 — 같은 클래스의 한 겹 아래.** v0.5.11이 항목 **판정**을 TAG_SEP로 넓히면서 접기 판정(`emptyRemainder`·`stubLine`)의 선행 strip은 `[ ` + B + `t]`로 남겨, 제어문자로 들여쓴 `- [open] [user-only]`가 계수·validate는 통과하고 **목록에서만 본문을 잃었다**. 선행 strip도 TAG_SEP로 통일.

**콜드 리뷰(커밋 전) 발견 — critical 2건 모두 이 패치의 것이었다.** ① **씰이 자기가 이름 붙인 클래스를 다 막지 못했다**: 케이스가 라이브로 읽는 `tests/baseline/bundle.manifest`(+`.sha256`)와 `.weavedoc/READ.md`·`.claude/skills/*`가 KEY에 없었고, `make-manifest.sh`는 **git 인덱스**(`git cat-file blob :path`)를 읽는데 인덱스 상태도 키에 없었다 — 실측: 스윕 중 매니페스트에 한 줄 추가하면 케이스는 실패하는데 **거부는 일어나지 않았다**. 넷 다 키에 넣었다(인덱스는 `git ls-files -s`). ② **구조 케이스가 텍스트만 고정했다**: `exit 2`를 `exit 0`으로 바꾸거나 조건을 도달 불가로 만들어도 **green**이었다 — 텍스트는 행위가 아니다. 씰을 `seal_or_refuse()`로 빼고 `--seal-check <key>`를 열어 **거부 자체를 케이스가 실행**한다(메시지·rc 2·캐시 삭제 전부 단언). ③ `--resume`에서 실행할 케이스가 0이면 씰을 건너뛰던 가드(`[ -n "$TODO" ]`) 제거 — 그 창에서도 픽스처를 만들고 검증한다. ④ **선행 제어문자 placeholder stub은 더 나쁘게 사라졌다**: `[open]` 분기는 TAG_SEP로 제외하는데 stub 분기는 컬럼0 앵커라 **아무도 처리하지 않아** 항목이 통째로 없어지고 "nothing is waiting on you"까지 찍혔다 — stub 분기도 `HQ_STUB_OPENER`로. ⑤ 릴리스 잡의 `gh release download`가 `bash -e` 아래 무방비라 자산이 없거나 이름이 다르면 다시 "게이트 green, 잡 red"가 됐다 — 가드 + 빈 파일 검사 추가, 그리고 주석이 주장하던 범위를 **매니페스트가 실제로 덮는 것**으로 좁혔다(번들 바이트가 같으면 다른 커밋도 통과한다는 사실을 명시).

**문서 4건.** ① **CHANGELOG에 실제 제어문자 19개**(VT 10·FF 4·TAB 5)가 들어가 문단이 깨지고 `git diff --check`가 실패했다 — 원인은 제 heredoc이 `""` 안의 이중 백슬래시를 줄여 Python이 이스케이프를 **해석**한 것이고, 같은 이유로 첫 수정 시도도 VT를 VT로 치환하는 no-op이었다(`chr(92)`로 우회). ② IMPROVEMENT_PLAN 현행 표기 ③ tests/README·ci.yml의 Windows "~35분" → **실측 2m28s**(v0.5.12 전 5m18s) ④ 셋 다 `doccheck`가 보지 않는 문장이라 잡히지 않았다.

## 2026-08-07.2

**v0.5.12 — Windows 스윕 30분+ → 7분. 느린 건 런타임이 아니라 하네스였다.** 사용자 지적: "속도 때문에 Node를 도입했는데 여전히 MSYS fork를 쓰면 어떻게 하느냐." 맞는 말이고, 실측이 그것을 그대로 보여줬다 — 런타임(Node)은 죄가 없고 **케이스마다 띄우는 프로세스 수**가 전부였다.

**분해(487케이스, -j6, Windows).** 케이스당 **5.2초**였고 그중 케이스 자체의 일은 1.7초뿐이었다.

| 항목 | 케이스당 | 성격 |
|---|---|---|
| 캐시 KEY 재계산 | ~2.5s | git·find·xargs·sha256sum×6·node/uname/bash/awk/sed `--version` 등 **~25개 프로세스** |
| bash 재기동 + 이 스크립트(5,000줄) 재파싱 | ~0.9s | 케이스마다 새 bash |
| 픽스처 복사(50개 파일) | 0.71s | 격리 모델의 값 |
| CLI 1회 실행 | 0.83s | black-box 계약의 값 |

MSYS는 프로세스 생성을 전역 직렬화하므로 spawn 하나가 ~0.4s다(빈 `bash -c true` 10회 = 4.3s, `node … version` 10회 = 4.0s — **빈 셸이 Node보다 비싸다**). 앞의 두 줄은 케이스와 무관한 준비 작업인데 487번 반복됐다.

**수정 둘.** ① 워커가 KEY를 **물려받는다**(`WD_REG_RES`/`WD_REG_KEY`) — 부모가 이미 계산했고 같은 프로세스 트리라 다를 수 없다. 사람이 `--one`을 직접 돌리면 종전대로 계산한다. ② `--batch`: 드라이버가 `xargs -n 8`로 **워커 하나에 8케이스**를 준다 — bash 기동이 487회 → 61회. 결과 파일·`--resume`·집계·리포트는 그대로다(바뀐 건 프로세스 수뿐). 어서션 3종(613곳)의 `printf | grep -qF`도 셸 내장 `case` 매칭으로 바꿨다 — 프로세스는 줄었지만 **실측 효과는 2초로 거의 없었다. 기대와 다른 결과라 그대로 적는다.**

**결과**: Windows 네이티브 **436s(7분 16초)**, 케이스당 **1.76s** — 남은 것은 픽스처 복사 + CLI 실행뿐이라 하네스 쪽 여지는 사실상 끝났다. 컨테이너는 **30초**로 여전히 14배 빠르므로 태그 전 검증 규칙(컨테이너 1회)은 그대로다.

**기각한 대안도 실측으로 남긴다.** `robocopy`는 `cp -r`보다 **느렸다**(828ms vs 639ms/복사). **`-j`를 12로 올려도 이득이 없었다**(436→416s) — MSYS 전역 직렬화 때문이고, 그 조건에서 잠금 타이밍 케이스 2건이 흔들린다. **변경 전 하네스로 워크트리를 만들어 같은 `-j12`를 돌려 같은 케이스가 같은 이유로 흔들리는 것을 확인**했으므로(그쪽은 3건) 배치가 만든 문제가 아니다 — 기본값 `-j6`을 유지한다.

**검증**: Windows 487/487 · 컨테이너 487/487 · `--one`·필터·`--resume` 정상. 배치 워커가 케이스 사이에 상태를 흘리지 않는다는 것도 따로 확인했다(문제의 두 케이스를 한 워커에 함께 넣어 통과).

## 2026-08-07.1

**v0.5.11 — 태그 사이의 공백을 한 번만 철자한다.** 외부 리뷰가 v0.5.10을 유효 판정(above-bar 0)하면서 **같은 계열 below-bar 3건**을 실측했다. 셋 다 뿌리가 하나다: "항목의 두 태그 사이 공백"이 **세 군데에서 다르게** 적혀 있었다 — validate는 `[ \t\n\v\f\r]`, status의 소유권 버킷은 `[ \t\v\f]`, 접기를 결정하는 `HQ_TAG`는 `[ \t]`. 쌍마다 어딘가에서 어긋났다.

- **`\v` 구분자 + continuation → 본문이 목록에서 사라진다.** HQ_TAG가 `\v`를 모르니 "태그뿐인 줄"로 안 읽혀 접기가 안 걸리고, `status --open`이 태그 줄만 찍고 결정 본문을 버렸다(실측).
- **행 내부 `\r` → status가 validate에 대해 거짓말한다.** `- [open]<CR>[user-only] …`를 status는 "missing an ownership tag **(validate rejects these)**"로 세고 validate는 rc 0으로 통과시켰다. 코드 주석의 "`\r`은 splitLines를 통과하지 못한다"도 **행 끝에만 참**이고 행 내부에는 거짓이었다 — 이 릴리스 줄기가 계속 잡아 온 그 문장.
- 수정: `core.mjs`에 **`TAG_SEP` 하나**를 두고 validate·버킷·HQ_TAG가 전부 그것을 쓴다. `\n`은 줄 안에 있을 수 없지만 클래스에 남긴다 — 이 상수가 validate 규칙의 *사본*이 아니라 **그 규칙 자체**여야 하기 때문.

**세 번째: placeholder continuation을 내용으로 오인한다.** `- [<status>]` 아래 `  <where> — <what>` — 출하 템플릿의 **자기 둘째 줄**이 held stub을 실재화시켜, 템플릿뿐인 장부가 "1 unrecognized"(questions)·"1 untagged"(HQ)로 보고됐다. 안전 방향이지만 **거짓 대기**다. gaps는 처음부터 옳은 질문을 했다(템플릿 토큰을 걷어내고 뭐가 남는가). 이제 `hasContent`를 세 장부가 공유하고, hold는 placeholder-only continuation을 **넘겨서 살아남아** 아래의 진짜 줄이 여전히 실재화한다(gaps와 같은 동작).

**"세 장부가 같은 기계"라는 v0.5.10의 설명은 그때 사실이 아니었다** — 실재화 조건이 달랐다. 이제 **실재화 판정은** 셋이 같고(콜드 리뷰가 continuation 텍스트 18종을 세 장부에 전수 대조: HEAD 9/18 갈림 → 0/18), 그 차이를 케이스로 고정했다. **여전히 같지 않은 것도 적어 둔다**: 빈 장부 관용구 `- (없음)`을 Q·HQ는 관용구로 넘기고 register는 항목으로 세며, 문법이 못 읽는 줄은 gaps만 경고한다 — 장부별로 정당한 차이지만 "같은 기계"는 **실재화 축에 한정된 말**이다.

**콜드 리뷰(커밋 전) 발견 6건 — 절반이 이 패치가 만든 것.** ① **TAG_SEP가 태그 *사이*만 닫고 불릿 *앞*은 두 철자로 남아 있었다**: `\v`로 들여쓴 `- [open]`이 validate에겐 항목이고 status 두 표면 모두에겐 안 보였다(rc 1 옆에 "nothing is waiting on you") — 같은 클래스, 한 자리 앞. 선행 공백도 TAG_SEP로 통일(단 untagged 규칙은 컬럼0 유지: 거기서 들여쓴 불릿은 하위 detail이다) ② **내가 이번에 폐기한 문장이 내가 편집한 줄 바로 위에 그대로 있었다** — 버킷 주석의 "`[ \t\v\f]` … `\n\r`은 splitLines를 통과 못 한다" ③ "single walk" 잔존이 1곳이 아니라 3곳이었다(2곳 더 정정) ④ 타이밍 문구도 사본이 하나 더 있었다(`tests/in-container.sh`) ⑤ 번들 라벨 날짜와 발행일 불일치(→ `2026-08-07.1`) ⑥ CHANGELOG의 계수·범위 과장 2건. **동작 변화 1건 명시**: `- [{state}]\v[{ownership}]` 단독은 이제 표시되지 않는다(공백 구분 쌍둥이와 동일 — 순수 stub은 소음, 초기 장부가 green으로 유지된다).

**문서 드리프트 4건.** ① IMPROVEMENT_PLAN 현행 표기(v0.5.9 → v0.5.11) ② `isNoise` 설명 주석이 현행 코드(`stubEntry` + hold)와 불일치 ③ "single walk" 잔존 1곳 → single classifier ④ **tests/README의 "컨테이너 20초 미만"** — 실측 32·33초(486케이스 -j6, 2026-08-07). 케이스가 430대이던 시절의 값이 그대로 남아 있었다; 케이스가 늘면 갱신하라는 문장을 함께 넣었다(`tests/in-container.sh`).

신규 4케이스(matrix 2칸 + 구분자 축 1 + 선행 공백 축 1; red-first 3 + 양방향 가드 1 — 가드는 "hold가 placeholder continuation을 넘겨 살아남는가"를 잡고, 수정이 hold를 실재화 불가로 만드는 식으로 "달성"되는 것을 막는다).

*(이 절은 `2026-08-07.4`에서 복구되고 `.5`에서 완성됐다 — `.3`이 제어문자를 이스케이프 텍스트로 바꿨지만 그 문자가 만들었던 **줄바꿈**은 남아 문단 여섯 곳이 문장 중간에서 끊겨 있었고, `.4`의 복구는 그 위에 원문 네 구절을 조용히 빠뜨린 채 "전체 복원"이라 적었다 — 콜드 리뷰가 원문과 낱말 단위로 대조해 잡았다.)*

## 2026-08-06.13

**v0.5.10 — 두 축의 조합이 빠져 있었다.** 외부 리뷰가 v0.5.9에서 above-bar 2건을 실측했다. 공통 뿌리: placeholder와 continuation을 **각각은** 시험했지만 그 **조합**을 시험하지 않았다.

**P1-1 — placeholder 불릿 + continuation이 통째로 사라진다(questions·Human queue).** `- [<status>]` / 들여쓴 실제 질문 → "nothing is waiting"(실측; HQ의 `- [{state}] [{ownership}]` + continuation도, **인라인** `- [{state}] [{ownership}] 실내용`도 동일). 원인: gaps는 scanRegister의 **hold-and-realize**(순수 stub을 쥐고 있다가 continuation이 실재화)를 처음부터 갖고 있었는데, 쌍둥이 장부 둘은 stub을 **즉시 버려** continuation이 붙을 자리가 없었다 — 그리고 HQ의 untagged 필터에는 v0.5.5의 **폐기된 prefix 규칙이 아직 살아 있었다**(remainder가 실내용이어도 통째 드롭). 수정: `stubLine(line, tag)`을 일반화(각 장부의 태그 프리픽스는 자기 문법 — HQ는 state+ownership 두 슬롯)하고 세 장부가 같은 기계를 돈다. 실재화된 stub은 unrecognized/untagged로 표면화된다(인라인 쌍둥이와 같은 버킷).

**P1-2 — 본문 없는 `[open]` 항목이 ownership 계약을 우회한다(validate).** `- [open]` + continuation 본문 → validate 통과, 같은 항목을 plain `status`는 "missing an ownership tag **(validate rejects these)**"로 셌다 — 한 항목, 한 명령은 validate가 거부한다고 말하고, validate는 통과시켰다. 원인은 checkHqTags의 **주석 없는** `what === '' → continue`. ownership 요구는 [open] **상태**에 대한 것이지 본문이 어느 줄에 있는지와 무관하므로 스킵을 제거했다(본문이 빈 줄이면 진단에 항목 줄 자체를 보여준다). eclypse 실광산 재검증: 통과(전 항목 ownership 보유).

**Below-bar 일괄.** ① cmd-gaps가 `scanRegister.badline`을 버려 Accepted 절의 산문 뒤 항목이 경고 없이 계수에서 빠지던 것 → 경고 추가 ② `meta_manifest_baseline_current`가 이름과 달리 **manifest 본문을 읽지 않던 것**(fresh digest vs .sha256만 비교 — 본문 변조 + .sha256 방치가 통과) → 3-way로 보강(본문↔fresh cmp + .sha256=hash(본문)), 본문 변조 변이로 kill 확인 ③ README·WORKFLOW의 "single walk" 잔존 2곳 → "single classifier"(하나인 것은 판정이다) ④ FORMATS questions.md 절에 continuation·빈 장부 관용구 명문화 ⑤ **.12 절의 "미결 전수 = 1+3+4" 주장 정정**: 그 수는 *직전 리뷰가 거론한 항목*의 분류였고, 저장소 전체 미결(§11 잔여 — attest Verified units 정규식, gaps 전처리 단 공유, truth_digest CRLF 등)은 별도로 남아 있다 — "전수"는 과장이었다.

**테스트.** placeholder/정상 태그 × inline/continuation 행렬 신규 6케이스 — **행렬이 이때 완결됐다는 주장은 과했다: `2026-08-07.1`에서 두 칸이 더 나왔다**(red-first 5 + full-template 침묵 가드 1 — 가드는 양방향 통과가 정답임을 주석에 선언). 세 장부 대칭이 이제 케이스로 고정된다.

**콜드 리뷰(커밋 전)가 이 패치 자신의 critical 1건을 잡았다 — 접기와 계약의 경계.** `- [open]` + continuation에 **ownership 태그가 다음 줄에** 오는 형태에서, status는 접힌 표시 줄로 분류해 "machine can just do 1"이라 하고 validate는 물리 항목 줄을 판정해 거부했다 — 한 항목, 두 답, 이 릴리스가 잡던 클래스가 P1-2 수정 **때문에** 새 조합으로 열린 것. 계약대로 태그는 **항목 줄**의 것이므로(FORMATS: two fixed tags, then prose — defender가 쓰면서 단다), 버킷 분류는 접히지 않은 원본 줄(`raw`)로 옮기고 접기는 표시 전용으로 남겼다. FORMATS에 "fold는 display, 판정은 entry line"을 명문화. 함께: ② 태그 사이 구분자 latitude를 validate와 정렬(`[ \t\v\f]` — \v 구분 항목이 "validate rejects these"로 세어지며 validate는 통과하던 병적 형태) ③ **새로 넣은 badline 경고가 두-인코더 함정을 또 밟았다** — latin1 섹션명을 UTF-8 템플릿에 보간해 지역화 스키마에서 mojibake(cmd-gaps + status --open 쌍둥이 모두 바이트 방출로) ④ 미닫힘 placeholder 브래킷의 untagged 표면화와 template-state+실ownership의 침묵 유지를 케이스로 고정. 신규 4케이스(red-first 3 + 핀 1).

**Known issues(이 릴리스가 새로 남기는 것만).** ① stub + 빈 줄 + continuation의 고아 continuation은 gaps에서만 명명되고(badline 경고) HQ·questions에서는 조용히 버려진다 — 빈 줄이 hold를 죽이는 규칙 자체는 세 장부 동일하나, "못 읽는 것은 명명한다"가 두 장부에 미적용(기존 클래스, 이번 변경 무관). ② \v 들여쓰기 등 더 깊은 공백 병리는 §11 기준 밖.

## 2026-08-06.12

**v0.5.9 — 미결 목록을 실측한다.** "또 안 한 거 있어?"라는 물음에 저장소의 미결을 전수로 세어 본 결과, 세 종류가 나왔다: **정말 안 한 것 1건 · 이미 해소됐는데 목록에 미결로 남아 있던 것 3건 · 근거 있게 미룬 것 4건**. 앞의 둘을 여기서 닫는다.

**정말 안 한 것 — gaps CLI가 미종결 펜스에 침묵한다.** `defence()`가 주는 `.open` 플래그를 버리고 `.text`만 써서, 닫히지 않은 코드펜스 뒤의 등록부가 계수에서 조용히 빠졌다. v0.5.4가 known-issue로 적었고, **v0.5.8이 바로 그 줄을 고치면서 그대로 지나쳤다** — 쌍둥이 리더(`status --open`)는 v0.5.6부터 경고해 왔으므로, 이 명령만 "리더가 못 보는 것은 명명한다" 규칙 밖에 있었다. 이제 경고를 찍는다(non-blocking은 조용할 이유가 아니라 **찍을** 이유다). red-first 확인.

**이미 닫혔는데 미결로 보이던 것 3건.** ① .8의 known-issue ①(--open의 utf8 도메인 인쇄)은 **.9에서 해소**됐는데 그 절이 해소를 기록하지 않았다 ② §11 v0.6 후보 ②(`status`↔`validate`의 Human queue 깊이 3~6 갈림)는 **깊이 3·4·5·6 전부 두 명령이 같은 수를 낸다**(실측) — v0.5.4의 `sectionAll` 깊이≤6 통일 때 함께 닫혔고 목록만 낡았다 ③ 후보 ④(공유 gaps parser)는 **등록부 리더가 v0.5.6~v0.5.8에서 통일**됐다(validate·`status --open`·`weavedoc gaps` 전부 `scanRegister`) — 남은 것은 그 앞단의 전처리(nocomment·defence를 각자 부름)이므로 항목을 그 범위로 좁혔다. **미결 목록도 장부이고, 장부는 정확해야 한다** — 닫힌 항목이 남아 있으면 다음 사람이 이미 한 일을 다시 재고, 그건 이 저장소가 census에 대해 이미 배운 것이다.

**근거 있게 미루는 4건**(이번에도 재서 적는다): 광산 mutation lock 완전판(§11의 승격 조건 4개 중 아무것도 아직 사실이 아니다) · ShellCheck 스타일 레벨(§9 백로그, §11이 태그 게이트가 아니라고 결정) · plain `status`의 읽기 실패 침묵(출력 계약 변경이라 별도 결정이 필요) · questions.md의 들여쓴 `- [open]`(FORMATS의 컬럼0 항목 문법이 우선).

## 2026-08-06.11

**v0.5.8 — 세 번째 답을 지운다.** v0.5.7이 known-issue로 남긴 `weavedoc gaps`의 accepted 집계를 닫는다. 그 항목을 남긴 근거는 **"cmd-gaps를 바이트 도메인으로 옮겨야 해서 범위 밖"**이었는데, 사용자의 반문("그것도 해야 하는 거 아냐?")을 받고 세어 보니 **그 파일이 gaps.md를 읽는 곳은 한 곳**이고 결과는 개수에만 쓰여 출력은 도메인 무관이었다. 실제 수정은 5줄이다 — **비용을 재지 않고 추정했고, 그 추정이 미루는 근거가 됐다**(v0.5.7이 같은 릴리스에서 "눈앞의 표면만 고친다"고 지적받은 직후다).

**결함.** accepted 집계만 v0.5.4 review #9가 **폐기한 placeholder prefix 규칙**을 계속 돌고 있었다 — `- [<kind>] 실제로 수용된 결정 …`처럼 kind 슬롯에 템플릿이 남았지만 본문이 채워진 항목을 **0으로 셌다**(실측: 항목 2개 중 1개). 같은 폐기 규칙이 v0.5.5에서는 차단 대상 갭을 "nothing is waiting"으로 만들었고, 여기서는 반대로 **과소 계수**로 나타났다. validate가 차단하므로 안전 방향이라 살아남았지만, 한 파일에 대한 세 번째 답이었다.

**수정.** 이제 `scanRegister`를 호출한다 — validate·`status --open`과 같은 함수. 로컬 계수기는 **고치지 않고 지웠다**: 그건 리뷰마다 validate 규칙으로 한 항목씩 수렴해 왔고(v0.5.4 컬럼0, review #11 펜스) 마지막 한 항목이 남아 있던 것이라, 같은 수렴을 또 한 번 하는 대신 호출로 대체하는 게 이 클래스의 유일한 종료 조건이다. 스키마는 **텍스트와 같은 도메인**(latin1)에서 읽는다 — 비ASCII 절 이름을 utf8 맵에서 읽는 것이 v0.5.6이 자기가 고치던 결함을 재도입한 경로이므로, 그 짝을 여기서도 지킨다(과잉수정 방지 가드 케이스 포함 — red-first 불가능한 종류라 주석에 명시).

신규 케이스 2(1 red-first + 1 가드), **변이 kill 확인**(옛 prefix 규칙으로 되돌리면 정확히 빨개진다). 이로써 gaps.md 등록부의 리더는 **하나**다: validate · `status --open` · `weavedoc gaps` 전부 `scanRegister`.

## 2026-08-06.10

**v0.5.7 — 항목이 제 내용을 갖고 나온다, 그리고 문구가 코드를 따라잡는다.** v0.5.6 발행은 유효 판정을 받았고(외부 리뷰: above-bar 0), 그 리뷰가 남긴 below-bar 목록을 한 번에 정리한다.

**동작 결함 1건 — continuation이 잘렸다(세 장부 전부).** 갭의 **내용이 continuation 줄에만 있는** 정상 형태에서 목록이 불릿만 보여줬다:

```
- [declared]
  penalty cap의 근거가 필요함
```
→ `gaps (1):` / `  - [declared]`. 개수는 맞으니 오통과는 아니지만, **파일을 열어야 뭔지 안다** — 이 명령이 없애려던 바로 그 상태다. `entries.push(gl)`이 불릿만 담고 placeholder-realize 분기만 두 줄을 합치고 있었다. 개수만 보던 단언으로는 볼 수 없어 **내용 단언** 케이스를 넣었다.

**그 첫 수정은 두 번 틀렸고, 콜드 리뷰가 둘 다 잡았다.** ① **너무 넓었다** — 모든 continuation을 접어서, 이미 내용이 있는 항목이 하위 불릿을 삼키고 `- [enumeration] … - [declared] …`처럼 항목 토큰 둘을 단 한 줄이 됐다. 이제 **항목 줄이 태그뿐일 때만** 접는다(`emptyRemainder`) — 내용이 있는 항목의 하위 불릿은 부연으로 계속 버려진다(Human queue의 기존 규칙과 같은 방향). ② **gaps만 고쳤다** — 같은 결함이 `questions.md`와 `## Human queue`에 그대로 살아 있는데 헤드라인은 저장소 전역처럼 읽혔다. 이 저장소가 반복해서 지적받은 "눈앞의 표면 하나만 고친다"이므로, **세 장부가 같은 판정(`emptyRemainder`)을 공유**하도록 통일했다.

**빈 장부 관용구가 실제 항목을 삼켰다.** `NONE_IDIOM`이 행 끝을 고정하지 않아 `- (none) 실제로는 질문임`이 "빈 장부"로 읽혔다. `[ \t\r]*$` 앵커(`\r`은 splitLines가 CRLF의 CR을 남기기 때문) + 반대 방향 과잉수정 방지 케이스(관용구 단독 줄은 두 철자 모두 계속 빈 장부 — red-first가 불가능한 종류라 주석에 그렇게 적었다).

**문구 정정 5건 — 전부 "코드가 아니라 주장이 틀린" 종류.** ① v0.5.6이 "Human queue를 정말로 한 번만 순회"라 했는데 실측상 분류만 1회고 진단·주석 검사가 다시 읽는다 → **"단일 분류기"**로 좁혔다(측정 안 한 주장은 이 저장소의 명명된 클래스다) ② .9 절의 "신규 케이스 10"은 실제 11(451→462) ③ tests/README의 manifest 45 → 46 ④ WORKFLOW의 `scope` 설명이 digest sidecar 이전의 2분법 계약이었다 → README와 같은 5등급으로 ⑤ IMPROVEMENT_PLAN 갱신일. 아울러 .9의 known-issue 목록이 **저장소 전체 미결**로 읽히지 않도록 "이 릴리스가 새로 남기는 것만"이라고 범위를 적었다.

**재현 지침을 케이스에 심었다 — 그리고 그 문장부터 틀렸다.** 외부 리뷰가 "red-first·mutation-kill 이력은 최종 트리에 기계 증거가 없어 독립 확인 불가"라고 정확히 지적했고, 그래서 신규 케이스 주석에 **무엇을 되돌리면 이 케이스가 빨개지는지**를 적었다(`Revert … → this goes red`). 그런데 **첫 판은 4개 중 2개에만 있었고 그 둘의 문자열은 코드에 존재하지 않았다**(`cont()`라는 함수는 없고, 앵커는 `[ \t\r]*$`인데 `[ \t]*$`라 적었다) — 검증 불가 주장을 없애자는 문단이 그 자체로 검증 불가 주장이었다(콜드 리뷰). 이제 **모든 신규 케이스**가 실제 코드 문자열을 가리킨다. `_still_empty`만 예외이고, 그건 과잉수정 방지 가드라 **양방향 통과가 정답**임을 주석에 선언했다.

**Known issues(이 릴리스가 새로 남기는 것만).** ① ~~`weavedoc gaps`의 accepted 집계가 폐기된 prefix 규칙을 돈다~~ — **.11(v0.5.8)에서 해소.** 여기 적은 미룸 사유("cmd-gaps를 바이트 도메인으로 옮겨야 한다")는 **재보지 않은 추정이었고 실제로는 5줄**이었다. ② 접힌 줄에 하위 불릿이 들어가는 드문 형태에선 한 줄에 `- [kind]` 토큰이 둘 보일 수 있다(내용 없는 항목 아래 불릿). ③ .9의 known-issue 3건은 그대로 유효하다.

**매니페스트 baseline을 이제 누가 본다.** `tests/baseline/bundle.manifest`는 릴리스의 신원 기록인데 **아무 케이스도 읽지 않았다** — CI는 두 번 생성이 서로 같은지만 보고, 그건 1년 묵은 baseline에도 참이다. 직전 두 릴리스가 손으로 갱신했고 이번엔 하마터면 빠질 뻔했다(콜드 리뷰). `meta_manifest_baseline_current`가 커밋된 트리의 매니페스트와 기록된 digest를 비교한다(공허 가드 포함) — golden 스냅샷이 받았던 것과 같은 처방.

## 2026-08-06.9

**v0.5.6 — 한 등록부, 한 판정. v0.5.5의 above-bar 오통과를 닫는다.** 외부 리뷰가 `status --open`에서 정상 경로 오통과를 실측했다: `- [<kind>] album — six-vs-five`가 든 gaps.md를 validate는 `[COMP-OPEN-GAPS] 1 open gap`으로 **차단**하는데 목록은 "nothing is waiting"이라 답했다(양쪽 실측). §11 기준 (b)이고, 하필 .8의 헤드라인 기능이다.

**원인은 제가 한 주장의 반대였다.** .8 커밋 메시지는 "새 파서를 만들지 않고 기존 리더를 재사용했다"고 적었지만, 재사용한 것은 `weavedoc gaps`의 **집계용 prefix 필터**(`- [{`·`- [<`로 시작하면 버림)였고 그것은 validate가 v0.5.4 review #9에서 **버린** 규칙이다(FORMATS: 슬롯 전체가 placeholder일 때만 stub, 나머지가 결정한다). 즉 다섯 번째 리더를 만들었고 그게 폐기된 규칙이었다 — 이 저장소가 이름 붙인 "한 파일 여러 답"의 재발. **테스트가 그 결함을 잠갔다**는 것도 함께 적는다: `acct_openlist_gaps_open_only`가 순수 stub만 넣어 틀린 동작을 고정했다.

**수정: 판정을 실제로 하나로.** validate 안에 있던 `scanRegister`를 `bin/lib/gaps-register.mjs`로 **이동**(재작성 아님 — 정규식·분기 순서·sentinel·`strip()` 바이트 클래스 전부 동일, 추가는 `entries` 반환뿐)하고 validate와 `status --open`이 **같은 함수를 호출**한다. 질문 장부의 stub 판정도 같은 모듈의 `stubEntry`로 통일했다 — `isNoise`의 known limit(`<…>` 토큰이 든 산문을 placeholder로 읽음)은 게이트에선 안전한 방향이지만 목록에선 **침묵**이 되어, `<미정>`을 언급한 진짜 질문이 사라졌다. 회귀 잠금장치로 **개수 동치 케이스**를 넣었다: 한 gaps.md에 여섯 형태(정상·filled placeholder·순수 stub·realize된 continuation·하위 불릿·accepted)를 넣고 validate의 개수와 목록의 개수를 **서로** 비교한다(빈 문자열 공허 가드 포함) — 어느 쪽으로 갈라져도 빨개진다.

**같은 클래스 2건 + follow-up 6건.** ① 상태 태그 없는 질문·`[<status>]`+실내용 질문이 조용히 사라지던 것(같은 prefix 오류) → 표면화 ② 충돌 줄에 각 측 **source** 추가(스킬 규칙이 요구하는 "양쪽과 출처") ③ `questions.enum.status`를 validate의 SCH_KEYS에 등재(키를 지워도 통과하던 선언-미독 클래스) ④ Human queue를 **정말로 한 번만** 순회(‘one walk’ 주장이 두 컬렉터의 재독을 덮고 있었다 — 측정 안 한 문구) ⑤ 읽기 실패를 미종결 주석으로 오진하던 것 분리 + 읽기 불가 truth 명명 ⑥ METHODOLOGY의 다섯 범주 누락·IMPROVEMENT_PLAN 현행 표기·§9↔§11 화해 문장(§9 본문에 없어 따로 읽으면 모순이었다)·릴리스 증거의 Node 버전(release job의 v22가 아니라 게이트가 돈 18을 찍도록 setup-node 고정).

**콜드 리뷰가 잡은 재도입 1건(critical) — 같은 결함이 도메인 문으로 다시 들어왔다.** 목록 리더를 바이트 도메인으로 옮기면서 섹션 이름은 **utf8 스키마 맵**에서 읽어, `gaps.sections: 미해결|수용` 같은 비ASCII 설정에서 제목이 매치되지 않아 다시 "nothing is waiting"이 나왔다(실측; ASCII 개명은 정상). 한국어 우선 제품에서 정상 경로다. 스키마를 latin1로도 읽어 파일과 도메인을 맞췄고(`gaps.enum.kind`·`questions.enum.status` 동일), **비ASCII 섹션명 arm을 개수 동치 케이스에 추가**했다. 같은 리뷰의 should-fix 3건도 수정: 경로 라벨을 항목 바이트와 함께 latin1로 인코딩해 `산출물/`이 경로가 아닌 바이트로 깨지던 것(라벨=텍스트·항목=바이트 분리), 등록부 문법 오류 뒤가 조용히 잘리던 것(경고 추가), 질문 stub 판정 무커버리지(케이스 추가). 신규 케이스 **11**(451→462) — 전부 red-first 또는 **변이 kill**로 확인(도메인 되돌림·인코더 합침·경고 제거·isNoise 복귀 각각에서 정확히 빨개진다). *(.10 정정: 이 절은 처음에 10이라 적었다.)*

**바이트 도메인 전환의 함정 하나는 기존 케이스가 잡았다.** `- (없음)` 빈 큐 관용구가 UTF-8 리터럴 정규식이라 latin1 바이트와 매치되지 않아, 빈 큐가 "태그 없는 항목 1건"으로 보고됐다(`acct_status_empty_queue_idiom`이 red). `U()`로 바이트 철자를 쓴다 — 무의미-방지 가드가 값을 한 것.

**Known issues(이 릴리스가 새로 남기는 것만 — 저장소 전체 미결은 §11 v0.6 후보와 이전 절들에 있다).** ① 읽기 불가 `verify.md`에 대해 plain `status`는 여전히 `human queue: 0`(`--open`은 경고) — status의 출력 계약 변경이라 이번 범위 밖. ② questions.md의 들여쓴 `- [open]`은 컬럼0 항목 문법에 따라 목록에 오르지 않는다(.8에서 이어짐). ③ 중복된 `# Open` 아래에서는 validate가 차단만 하고 세지 않아 목록이 더 많이 보인다(과다 보고, 안전 방향).

## 2026-08-06.8

**v0.5.5 — 핸드오프 규칙과 그 기계적 소스.** 실사용 지적에서 출발한 마이너 릴리스: 확인할 항목이나 충돌이 남았는데 마지막 어시스턴트 메시지가 "파일을 확인하세요"로 끝났다 (2026-08-06 사용자 룰링: "파일을 안 열어봐도 어떤 부분이 문제인지 메시지로 명시"). 두 부분이다.

**규칙: Surface, don't point.** run이 사용자 대기 항목 — 미해결 충돌 · 열린 질문 · Human-queue 항목 · 충실성 위반 · 열린 갭 — 을 남기고 끝나면, 마지막 메시지에 **항목 자체**를 명시한다: 항목당 한 줄(무엇인지 · 이슈 한 줄 · 필요한 결정), 많으면 상세만 압축하고 목록은 절대 줄이지 않는다. 파일 경로는 내용 **뒤의 참조**지 대체가 아니다 — verify의 "정확합니까?" 금지의 핸드오프 판. 8개 run 스킬 전부(init 제외 — 인터뷰가 원래 메시지 안에서 이뤄진다) + METHODOLOGY §7 + WORKFLOW §5에 명문화했고, review의 "Human queue가 곧 사용자가 읽는 것" 문장은 파일-포인터를 정당화할 여지가 있어 "파일은 기록, 메시지가 보고"로 정정했다.

**기계: `status --open`.** 다섯 카테고리의 열린 항목 전문을 한 줄씩 찍는 읽기 전용 모드 — 스킬의 마지막 보고는 이 출력을 답변 언어로 렌더링하지, 기억으로 재작성하지 않는다(census 규율의 핸드오프 적용). 리더는 전부 기존 판정의 재사용이다: Human queue는 status 카운터와 **한 워크 두 렌더링**(같은 컬렉터에서 카운트와 목록이 나와 어긋날 수 없다 — 기존 `status` 출력은 바이트 동일 확인), 충실성 위반은 게이트의 fidBody+isNoise 그대로(sections/kinds 파생은 consecrate 철자를 재사용 — 세 번째 철자를 만들지 않는다), questions/gaps는 gaps CLI의 nocomment+defence 그대로. 리더가 못 보는 것은 침묵 대신 명명한다: 미종결 `<!--`·펜스는 경고 줄이 되고, 경고가 서 있는 동안 nothing-waiting 문장은 보류된다(리더가 정직하게 할 수 없는 주장). questions.md는 validate가 읽지 않는 유일한 장부라 enum 밖 상태(`[Open]`)를 unrecognized로 **목록에 올린다**(hq untagged 규칙의 적용) — enum은 schema `questions.enum.status`에서 읽는다(선언되고 안 읽히던 키). 신규 케이스 14(red-first 13/14 관측 — 14번째 unrecognized-state 케이스는 리뷰 수정과 동시 작성이라 red 관측이 없어, 컬렉터를 죽인 **변이로 물어** 확인: nothing-waiting 오출력에서 정확히 빨개진다) + 전체 437→451 green. golden에 status-open.txt 추가, refresh-golden/골든 케이스에 모드 항목 편입.

**콜드 diff 리뷰(사후) 발견 4건 수정.** ① redirect된 광산에서 위반 라벨이 hq 라벨과 다른 철자를 찍던 것 — rel() 통일 + 죽은 warnComment 제거(모든 review.md는 hqFiles에 이미 있다), ② sections/kinds 파생을 consecrate 철자로(validate=latin1·CLI=utf8 갈림은 기존 known-issue 그대로 — 셋이 아니라 둘), ③ questions enum 하드코딩 3곳 → schema 파생, ④ 빈 `conflict_with`의 대롱거리는 화살표 → `(unrecorded)`. 테스트 보강 2건: 2번째 HQ 섹션 케이스에 **미끼 항목**(런투EOF 리더와 구분), 하위 불릿 케이스 주석 정정(들여쓴 `- [open]`은 카운터 관용대로 목록에 오른다).

**Known issues.** ① ~~--open의 줄들이 utf8 도메인으로 인쇄된다~~ — **.9(v0.5.6)에서 해소**(전 카테고리 latin1 읽기 + Buffer 출력). 당시 이 줄이 해소를 기록하지 않아 미결로 남아 보였다(2026-08-06 전수 점검). ② questions.md의 들여쓴 `- [open]`은 컬럼0 규칙(FORMATS 항목 문법)에 따라 목록에 오르지 않는다 — hq 카운터의 들여쓰기 관용과 장부 간 비대칭이지만, 항목 문법이 우선이고 unrecognized 장치는 컬럼0 줄만 다룬다.

## 2026-08-06.7

**v0.5.4 — 11차 리뷰 후속이자, 리뷰-수정 루프의 종료 라운드.** 이 번들과 함께 **릴리스 기준이 §11에 결정으로 박혔다**: 태그를 막는 결함은 (a) 데이터 파괴 (b) 정상 사용 경로의 오차단/오통과 두 종류뿐이고, 그 밖의 발견은 known-issue로 기록해 다음 릴리스로 간다. 11라운드의 궤적(데이터 파괴 → 동시성 → 정합성 → 병적 입력)이 근거다 — 리뷰는 빈손으로 돌아오지 않으므로, "리뷰 클린 = 태그"는 종료 조건이 없는 루프였다. red-first 4/4(전부 942ccdc 기준).

**펜스 판정 하나를 gaps의 네 리더 전부가 공유한다.** 10차의 수정은 펜스 인식을 **미아 검사 하나에만** 붙였다 — 그래서 코드펜스 안의 가짜 등록부가 validate를 통과했고(제목 계수기·등록부 스캐너는 펜스를 몰라 펜스 속 줄을 세었고, 2칸 들여쓴 closing fence는 가짜 항목의 연속줄로도 읽혔다), 역방향으로 정상 등록부 옆의 펜스 예시가 중복-제목 오차단을 받았다. 이 갈림은 제가 세 번째로 만든 "한 파일 여러 답"이다. 이제 `defence()`가 sections.mjs에 **한 번** 있고 — 10차 상태기의 이동이지 신설이 아니다 — validate의 제목 계수·등록부 스캔·미아 검사와 gaps CLI가 전부 그 결과 텍스트를 읽는다. **opener 줄은 남긴다**: 등록부 절 안에서 열린 펜스는 문법이 못 읽는 줄로 **계속 차단**돼야 하기 때문(fail-closed 유지). 미종결 펜스는 미종결 `<!--`와 같은 차단.

**opener 규칙이 CommonMark대로 좁혀졌다.** backtick opener의 info string에는 backtick이 올 수 없다 — `` ```foo`bar ``는 펜스가 아닌데 펜스로 읽혀, 실제로 보이는 미아 항목이 존재하지 않는 펜스 안으로 숨었다(rc 0 실측; .6의 "fail-closed 확인" 주석은 미종결 변형에만 참이었다 — 해당 문장 정정).

**동일 모드 중복도 usage 오류.** "one mode per invocation"이라 말하고 `--apply --apply`를 허용했다 — 규칙이 문장을 따른다.

**문서 정정 3건.** §11의 9차 행이 "명령 이전·읽기 이전 취득"이라 적어 10차 행과 자기모순이던 것, regress.sh 주석 3건(존재하지 않는 순서 서술 + 이제 다른 커밋을 가리키게 된 "vs v0.5.4" 표기 → SHA로), CHANGELOG .6의 과장 문장.

**Known issues(마지막 콜드 리뷰의 below-bar 발견 — 기준 미달이라 기록만 하고 태그와 함께 나간다).** ① ~~gaps CLI가 defence의 미종결-펜스 플래그를 버린다~~ — **.12(v0.5.9)에서 해소**(v0.5.8은 바로 그 줄을 고치면서 이 항목을 지나쳤다). 원문: completeness off에서 미종결 펜스 뒤 내용이 계수에서 조용히 빠짐(required면 validate가 차단; CLI의 기존 미종결-`<!--` 방향과 동일). ② 등록부 불릿 아래 1~3칸 들여쓴 펜스 예시는 이제 연속줄로 통과한다(942ccdc는 차단) — 펜스-내용은-텍스트 원칙의 적용이고 숨을 수 있는 건 없지만, 등록부 안에서 유일하게 더 관대해진 지점. ③ 주석-펜스 중첩은 nocomment-우선 — **"전 인터리빙 fail-closed"라던 애초 기록은 한 구석에서 틀렸다**(12차 리뷰 실측, 태그 후): 주석 제거가 원문에 없던 opener를 **합성**할 수 있어(`<!-- x -->\`\`\``이 0열 `\`\`\``이 됨) 그 뒤의 실제 미아가 rc 0으로 숨는다. 병적 입력·정상 경로 무영향이라 기준 미달 — v0.6 공유 gaps parser의 재현체로 §11에 기록. ④ validate는 latin1·CLI는 utf8로 읽는 선행 갈림(ASCII 펜스·절 이름엔 무영향). ⑤ shellcheck 스타일-레벨 잔여(§9 릴리스 조건으로 이미 이연). ⑥ held-lock과 복수-모드 오류가 겹치면 잠금 거부(rc 1)가 usage(rc 2)에 선행한다 — 어느 쪽이든 무쓰기 거부(B+ 라운드 콜드 리뷰가 by-design으로 기록).

## 2026-08-06.6

**v0.5.4 — 10차 리뷰(태그 보류) 후속: 재현 결함 2건 · 계약 불일치 2건 · 커버리지 1건.** 전부 실측 재현 → 수정 → red-first 3/3(펜스·단일-모드는 5999989 기준, 키 가드는 **함수 변이** 기준 — HEAD엔 함수가 없어 그 부재 자체가 결함 기록이다).

- **resume 키가 정말로 경로를 담는다.** .5의 "경로 편입"은 `basename`을 해시한 반쪽이었다 — golden/version.txt를 golden/z/로 옮겨도 키가 같아, 케이스가 읽는 고정 경로가 낡았는데 `--resume`이 **아무것도 안 돌리고 430 "passed"를 재생**했다(실측). 이제 저장소-상대 **전체 경로**가 통째로 들어가고, 목록을 만드는 `key_paths`는 **함수 하나**라 키 계산과 가드 케이스가 같은 바이트를 돈다(사본 케이스는 그 자체가 drift). 함수는 KEY 계산보다 **앞**에 정의된다 — 뒤면 호출이 `2>/dev/null` 속으로 사라져 키가 다시 경로-맹이 된다(공허 가드 추가). 가드 케이스는 변이로 문다는 것까지 확인: basename 판으로 되돌리면 "left the key's path half unchanged"로 빨개진다.
- **펜스 판정이 마크다운 규칙의, 이 검사에 필요한 부분을 따른다.** (이 문장에 딸렸던 "info string 속 backtick은 fail-closed" 주석은 **미종결 변형에만 참**이었다 — 닫힌 변형이 fail-open임을 11차가 실측했고, .7이 opener 규칙 자체를 CommonMark대로 고쳐 그 구석을 닫았다.) .5의 토글은 문자·길이·들여쓰기를 안 봐서 **양방향으로** 틀렸다: 4칸 들여쓴 ```은 마크다운에서 펜스가 아닌데 펜스로 읽어 **뒤의 진짜 항목을 삼켰고**(fail-open, rc 0 실측), 4-backtick 펜스를 안의 3-backtick이 닫아 **예시 내용을 오차단**했다. opener의 문자·개수·들여쓰기(≤3)를 기억하고, 같은 문자·그 이상 개수·뒤에 공백뿐일 때만 닫힌다. **미종결 펜스는 차단** — 뒤가 전부 이 검사에 안 보이므로, 미종결 `<!--`와 같은 판정.
- **upgrade 모드는 하나만.** last-wins는 dispatcher의 게이트가 공유할 수 없는 **숨은 규칙**이었다 — 게이트는 "`--apply`가 어디든 있으면"을 보고 명령은 마지막 플래그를 써서, `upgrade --apply --check`가 실제로는 read-only인데 잠금에 거부됐다. 모호한 철자는 usage 오류다(rc 2) — 두 파서가 한 argv에 다른 답을 할 수 없게.
- **"openMine이 무엇을 읽기도 전에 잠근다"는 거짓이었다.** 실제 순서: root 해소용 openMine 한 번 → 잠금 → 각 명령이 잠금 뒤 제 광산을 새로 연다(loadConfig·loadSchema는 호출마다 읽는다 — 확인). 데이터 경합은 없었지만 문장이 코드와 달랐다 — dispatcher 주석과 아래 .5 절 서술을 실제 순서로 정정.
- held-lock 케이스가 **writer 6종 전부**를 돈다 — consecrate·retag가 빠져 있어, 앞으로 잠금-전 읽기가 생기기 가장 쉬운 두 명령을 아무 케이스도 안 보고 있었다.

## 2026-08-06.5

**v0.5.4 — 9차 외부 리뷰 후속: 단일 writer를 계약으로 선언하고 기계로 강제한다.** (미발행 상태의 `.4`를 확장해 **이 번들로 태그한다** — `.4`는 태그된 적이 없다.) 이번 라운드의 지적은 제가 **클래스를 잘못 그었다**는 것이었고, 맞습니다. .4에서 닫은 것은 *"잠금을 쥐는 두 명령 안에서 어떤 판단이 안쪽인가"*였고, *"어떤 명령이 잠금을 쥐는가"*는 열려 있었습니다. red-first 5/5(+판정 불가 2건은 그렇다고 적음).

**철회하는 주장 둘.** ① .4의 "잠금 경계를 **클래스로** 닫았다"는 거짓이었다 — 위와 같이 좁힙니다. ② 9차 회신에서 제가 잃는 것을 "재실행 가능한 파생 상태"라 부른 것은 **증거를 파생물로 분류한 오류**입니다. seal은 "이 바이트가 이 맥락에서 검토됐다"는 증거고 `seal-review` 재실행은 재검토가 아니며, 장부 행은 라운드·기준·다이제스트의 감사 이력이라 `attest` 재실행은 재검증이 아닙니다. 아울러 "잠금의 존재가 결함을 만들었다"도 부정확했습니다 — `retag↔retag`와 `upgrade↔seal-review`는 **잠금 이전부터 있던 데이터 경합**이고, 잠금이 만든 것은 결함이 아니라 잘못된 기대였습니다.

**계약: 광산 하나에 변형 명령 하나.** 모든 쓰기 명령은 자기가 건드릴 파일의 스냅샷을 읽고 통째로 되씁니다. 그래서 두 writer가 한 광산에 붙으면 커밋된 일이 조용히 사라집니다 — 새 seal이 이행의 낡은 버퍼에 덮이고, 성공한 retag가 이웃의 롤백에 지워지고, 검증 행이 착지하는 순간 이미 stale입니다. 이건 지금까지 **선언된 적 없는 전제**였고(WORKFLOW의 "main session에서 실행"은 암시일 뿐 금지가 아니었습니다), 따라서 이번 변경은 문구 정정이 아니라 **지원 범위를 좁히는 제품 결정**입니다. FORMATS·README·WORKFLOW·**전 스킬 9개**에 명시했고, "byte-identical 롤백"과 "자동 격하 없음" 보증이 이 계약 아래서만 성립한다는 것, 그리고 **동시 변형 후의 복구는 명령 재실행이 아니라 재검토·재검증**이라는 것을 함께 적었습니다.

**기계의 몫: 진입 승인 잠금.** dispatcher가 변형 명령에 대해 `.weavedoc/mine.lock`을 **명령 본체가 광산에 대해 어떤 판단을 내리기도 전에** 잡습니다(10차 리뷰 정정: root 해소를 위한 openMine 한 번은 잠금 **앞**입니다 — 잠금이 광산 루트 아래 살아서 루트 없이는 잠글 수 없고, 그 호출의 스냅샷은 root 외에 쓰이지 않으며 각 명령이 잠금 뒤 제 몫을 새로 엽니다) — 그래서 어느 명령도 판단을 재배치할 필요가 없었고, 내부 reindex·validate 호출은 dispatcher를 다시 지나지 않아 **reentrant 설계도 불필요**했습니다. 둘째 writer는 **대기가 아니라 거부**입니다(동시 실행은 느린 게 아니라 미지원이므로, 기다리게 하면 지원한다는 거짓말이 됩니다). 읽기 전용 명령과 쓰기 명령의 읽기 전용 **모드**(`--check`·`--dry-run`·`--dry`)는 게이트를 지나지 않습니다. 잠금 코드는 새로 만들지 않았습니다 — 기존 lock.mjs의 획득 루프에 대기 시간과 문장만 매개변수로 붙였고, 무회수·소유권 마크 규칙은 그대로입니다. **한계도 적었습니다**: 에이전트가 광산 파일을 직접 편집하거나 공유 드라이브의 두 체크아웃이 붙는 경우는 어떤 CLI 잠금도 못 보므로 문서 계약이 그 몫을 집니다. 그리고 **크래시 반경이 넓어집니다** — 잔재 잠금이 이제 모든 쓰기 명령을 막습니다(무회수 정책의 일관된 귀결이고, 거부문이 경로와 삭제 방법을 명명합니다).

**gaps 문법 3축 추가.** ① kind 슬롯의 placeholder 판정이 **접두사 검사**였다 — `- [{kind} real-content]`처럼 템플릿 토큰과 실내용이 브래킷을 나눠 쓰면 소음으로 읽혔다(본문이 있으면 .4가 이미 막았고, 열려 있던 것은 **본문 없이 슬롯만 있는** 형태다). 슬롯 전체를 strip해 남는 게 있으면 kind로 판정한다. 슬롯이 **통째로 한 placeholder 그룹**인 경우(`- [<kind real-content>]`)는 여전히 스텁 — "placeholder를 채워라"가 값 **전체**를 보는 것과 같은 판정. ② **들여쓰기 축**: 항목은 0열에서 열린다. 부모 없는 들여쓴 불릿이 accepted 결정으로 통과하던 것(rc 0)과 정상 항목 아래 sub-bullet이 새 항목으로 오차단되던 것이 함께 닫혔다. ③ **등록부 밖의 항목**: 제3 절이나 첫 제목 위에 놓인 gap은 아무도 세지 않으면서 기록된 gap처럼 보였다(rc 0) — 이제 명명·차단(제3 절의 **산문**은 자유).

**P2 잔여 둘.** Human queue의 자체 walker에도 제목 깊이 상한 6 적용(.4가 sectionAll에만 넣어 status·validate가 다시 갈렸다). `--resume` 키에 **파일 경로** 편입 — 모든 해시를 `awk '{print $1}'`로 흘려 이름을 버렸기 때문에, 정렬 순서를 보존하는 rename이 키를 그대로 두고 사라진 파일에 대한 과거 성공을 재사용시켰다(실측 확인).

**커밋 전 실행-기반 콜드 리뷰: CRITICAL 0** — 게이트를 빠져나간 writer 없음(29개 명령/플래그 형태 전수), 정상 종료 26경로 전부 잠금 잔재 0, mine→ledger 순서 고정이라 교착 불가, 8프로세스 × 400ms 임계구역에서 **상호 배제 실측**, 드라이버는 여전히 dispatcher를 우회해 장부 잠금만 잡아 기존 경쟁 케이스 6건의 의미가 보존됨. real 6건 중 **내 것 5건 수정**:

- **내가 방금 만든 갈림**: validate가 "항목은 0열"로 옮겨갔는데 `weavedoc gaps`의 계수기는 안 옮겨가, sub-bullet이 CLI에선 accepted 2건·validate에선 연속줄이 됐다. 한 라운드 전에 절 이름으로 닫은 그 갈림을 문법 축에서 다시 연 것 — 계수기도 0열 규칙으로.
- **태그되지 않을 버전 라벨**: FORMATS를 비롯해 코드 주석까지 `v0.5.5`라 적었는데 이 번들은 **v0.5.4**로 태그된다(그 태그는 게이트가 거부한다). 11곳 전량 정정.
- **미아 검사가 거짓 문장을 냈다**: 모든 제목을 새 절로 읽어 `## 하위 제목` 아래 항목을 "등록부 밖"이라 불렀다 — 그 파일은 멀쩡했다(차단은 등록부 문법의 진짜 이유로 남는다). `sectionAll`과 **같은 중첩 모델**로, 코드펜스 안의 예시 불릿도 건너뛴다.
- **약속한 P2 하나를 빠뜨렸다**: §11 750행이 여전히 실패하는 `rmdir` 절차를 지시하고 있었다(메시지와 케이스는 이미 반증한다).
- **"거부지 대기가 아니다"를 아무 케이스도 물지 않았다**: 대기로 바꿔도 스위트가 초록이었다(같은 문장으로 타임아웃하므로). 경과 시간 단언을 넣어 제품 문장이 검사 가능해졌다.
- 그리고 **출하 템플릿이 자기 게이트에 걸렸다**(선행 결함): Accepted 예시 줄의 `scope:`·`recheck:`·`as-of:` 라벨이 중괄호 **밖**이라 strip을 통과해, 갓 초기화한 gaps.md가 `required`에서 차단됐다 — "순수 스텁은 green"이라는 코드 주석이 **손으로 쓴 대역**으로만 검증됐던 탓. 라벨을 중괄호 안으로 넣고, **출하 아티팩트 자체**를 검사하는 케이스를 세웠다.

**남긴 선행 결함 둘(기록, v0.6)**: `status`↔`validate`가 깊이 3~6의 `Human queue`에서 여전히 갈린다(필수-절 리더가 `##`까지만 본다) · `attest`의 `Verified units` 정규식은 상한도 공백 요구도 없어 `#Verified units`에 미러를 쓴다.

## 2026-08-06.4

**v0.5.4 첫 컷 — 8차 외부 리뷰(발행된 v0.5.3 검토) 후속. P1 4건 + P2 5건.** 이번엔 **사례가 아니라 클래스**를 닫는다: 앞선 세 라운드가 같은 세 표면(잠금 경계·gaps 문법·태그 게이트)을 한 칸씩 좁혀왔고, 매번 리뷰가 다음 칸을 가져왔다. 그래서 **새 기계는 하나도 만들지 않았다** — 옮기고, 내가 만든 중복을 지우고, 조건 하나씩 달았다. 검사는 전부 하네스에만 산다. red-first 8/8(전부 v0.5.3 런타임 기준).

**P1-1: `--apply`는 광산을 보기 전에 잠금부터 잡는다.** .3이 재스캔을 잠금 안으로 옮겼지만 **schema-2 조기 종료와 빈-plan 종료는 밖에 남아** 있었다 — 실측: 승자의 **트랜잭션 중간** schema 2를 읽은 두 번째 apply가 잠금을 **0초도 기다리지 않고** "nothing to do" rc 0을 찍었고, 승자는 곧 롤백했다(일어나지 않은 이행에 대한 성공 보고). 이제 preflight가 **함수 하나**이고 호출은 **한 번**이다 — 버전 행렬·이미-이행 종료·장부 void·scan 전부 그 안, `--apply`는 그것을 잠금 아래서 부른다. .3의 이중 철자는 삭제됐다(파일은 606→603줄, +53/−56 — 요점은 줄 수가 아니라 **한 판단에 한 철자**다). `--check`/`--dry-run`은 여전히 락 없이 — 쓰지 않는 명령이 이행 뒤에 줄 설 이유가 없다.

**잠금-우선이 바꾸는 거부는 하나가 아니라 여섯이다(콜드 리뷰가 내 서술이 좁았다고 지적 — 실측표로 정정).** 잠금이 쥐어져 있으면 **이미-이행·잘못된 버전·미래 버전·읽을 수 없는 장부·id 없는 장부** 다섯 가지 모두 이제 "즉답 rc 0/1/2"가 아니라 **경계를 기다린 뒤 잠금 거부(rc 1)**다 — 그게 이 수정의 요지다(잠금 아래서 읽지 않은 것은 판단 근거가 될 수 없다). 여섯째는 **경쟁이 전혀 없는 경우**라 별도로 고쳤다: truths/가 없는 광산에서 mkdir이 ENOENT로 실패해, 사용자가 만든 적 없는 잠금 이야기를 rc 1로 했다(불용 광산에 대한 다른 모든 거부는 rc 2). **디렉터리는 잠금 앞에서 검사한다** — attest가 같은 이유로 이미 두던 예외이고, 잠금의 경로 자체에 대한 것이지 광산 내용에 대한 판단이 아니다.

**P1-2: attest의 다이제스트도 잠금 안에서 뜬다.** id 해소·존재·툼스톤·다이제스트가 **잠금 앞**이라, "이 바이트가 무엇인가"와 "이 행이 그것을 검증했다고 말한다" 사이에 최대 5초의 대기가 있었다 — 실측: 대기 중 보유자가 바꾼 truth가 **없어진 바이트에 대해 verified로 기록**되고(attest rc 0), 행이 착지하는 순간 scope가 stale이라 불렀다. 다이제스트는 **시점에 대한 주장**이라 그것을 지키는 구역 밖에서 뜨면 안 된다. 이제 인자 문법(verdict·round·standard)만 밖에 남는다 — 명령줄에 대한 판단이라 낡을 수 없다.

**클래스 가드 2건(계측 없이 행동으로).** 이미 이행된 광산에서 `--apply`는, 잠금 밖 판단이 하나라도 있으면 **즉답**하고 없으면 **경계를 기다린 뒤 거부**한다. attest도 같다 — 없는 id는 밖에서 해소하면 즉시 실패, 안에서 해소하면 잠금 거부. **경과 시간이 증거**라, 다음에 어떤 판단이 밖으로 나가든 이 두 케이스가 잡는다(오늘의 둘만이 아니라).

**P1-3: kind 브래킷은 닫혀야 한다.** `- [{kind}`·`- [<kind>`가 placeholder 분기에 닿았고, 거기서 strip()이 열린 괄호를 템플릿 단어째 지워 ''를 만들어 **소음으로 읽혔다**(실측 rc 0). 여는 괄호에 짝이 없으면 kind도 placeholder도 산문도 아닌 **malformed**다. 그리고 이 함수의 **진리표 전체**(여는 형태 × 폐합 × 본문 × 연속줄 13칸)를 케이스로 고정했다 — 앞선 세 라운드가 이 표의 한 칸씩이었다.

**P1-4: 최상단 절은 릴리스를 정확히 하나 선언한다.** "앵커된 클레임이 하나라도 맞으면"이라, 진짜 클레임 옆에 과거 태그 줄을 하나 밀어 넣으면 **옛 태그가 되살아났다**(실측: v0.5.3 트리에서 v0.5.1 통과). 이제 클레임을 **전부 추출해 개수 1 + 태그 일치**를 요구한다(둘이면 양쪽 다 거부).

**P2 5건.** ① **잠금 거부 문구가 거짓말을 하고 있었다** — nonce를 넣으면서 크래시 락 안에 owner 파일이 남게 됐는데 안내는 여전히 "remove the lock"(=rmdir)이었고, 실제 크래시 락에서 그 명령은 ENOTEMPTY로 실패한다. 문구를 "경로와 그 내용물을 지우라"로 고치고, **케이스의 픽스처를 실제 크래시 모양(owner 포함)으로** 바꿨다 — 픽스처가 현실보다 순했던 게 이 갈림이 안 보인 이유다. ② dead ledger에서 superseded 줄 억제(무효 선언 옆에서 승자를 "history"라 부르던 것). ③ **제목 깊이 상한을 두 리더가 공유** — `sectionAll`은 `#` 몇 개든 읽고 `countHeadings`는 6에서 멈춰, `####### Accepted`가 validate엔 malformed·gaps CLI엔 accepted 1건이었다(마크다운이 엄격한 쪽 편이라 상한을 sectionAll로 옮겼다). **이 상한은 `sectionAll`의 전 소비자에 닿는다**(콜드 리뷰 실측): 7#짜리 `Verified units`는 scope에서 legacy-unbound→unverified, coverage `legacy` 절은 census에서 면제 소실, upgrade는 그 유닛의 legacy 행을 주조하지 않는다 — 전부 fail-closed. **예외 하나는 축소 방향**이라 적어 둔다: 7#짜리 `Human queue`를 status가 이제 0으로 읽는다(validate가 그 파일을 차단하지는 않는다). 7# 제목을 쓰는 픽스처·템플릿·실광산은 없고(전수 grep 0), 마크다운에서 7#는 제목이 아니다. ④ IMPROVEMENT_PLAN 머리의 낡은 HEAD 참조 정정. ⑤ **릴리스 증거 블록** — tag·bundle·schema·fingerprint·node·manifest sha256을 잡 로그와 **릴리스 노트 양쪽에** 남긴다(만료되는 로그에만 있던 것). 각 필드에 **무의미-방지 가드**를 달았다: `| tee`가 상태를 삼키고 실패한 치환은 빈 값이 되므로, 빈 필드가 하나라도 있으면 발행을 거부한다(콜드 리뷰 — "자기 공허가 성공과 똑같이 보이는 검사"의 그 클래스다).

**남긴 경계 둘(수정 아님, 기록).** `weavedoc gaps`는 placeholder로 여는 불릿을 닫혔든 아니든 accepted 계수에서 뺀다 — validate가 미폐합을 차단하므로 방향은 안전하나, 같은 "한 파일 두 답" 가족의 잔여다. attest는 아무것도 쓰지 않는 거부(없는 id·툼스톤)에서도 잠금을 잡았다 놓는다 — 해소가 잠금 안으로 들어간 결과이고, 그 창에서 죽으면 쓸 의도가 없던 명령의 잠금이 남는다.

## 2026-08-06.3

**v0.5.3 — 7차 외부 리뷰(발행된 v0.5.2 검토) 후속: P1 3건과 저우선 6건.** 태그 v0.5.2는 유지됐고(재현된 어느 것도 데이터를 파괴하지 않는다), 이 번들이 후속이다. 전 항목 실측 재현 → 수정 → red-first 6/6 — 4건은 v0.5.2 HEAD 기준, 실교차 케이스는 첫 컷 3041881 기준("the refused apply left the mine migrated"), 버전-flip 케이스는 콜드 리뷰 수정분이라 draft 기준.

**P1-1: continuation이 placeholder를 실재화하면 kind가 판정받는다.** 소음으로 보류된 `- [{kind}] …` 불릿을 실제 내용의 연속줄이 실재화할 때, 계수만 하고 아무것도 판정하지 않았다(실측: validate rc 0 + gaps CLI "records 0" — .2가 닫은 불릿-자체-본문 형태의 연속줄 판). 브래킷 단어가 소음 플래그와 함께 이동해, 실재화 순간 다른 모든 kind와 같은 어휘 규칙으로 차단된다. 순수 스텁(연속줄까지 소음)은 여전히 green.

**P1-2: `--apply`의 preflight가 잠금 아래서 재실행된다.** 계획 계산이 잠금 앞이라, 동시 apply 둘이 같은 v1 계획을 세우고 진 쪽이 **이행 끝난 광산에 낡은 계획을 재적용**했다(실측: 둘 다 rc 0 "applied 4 item(s)", 백업 2개 — 두 번째는 v2 파일을 담고 v1 복구점을 주장하는 MANIFEST). 잠금 취득 후 캐시를 비우고 **config 스냅샷을 재구성**해(열림-시점 파싱이라 안 비우면 재스캔도 낡은 바이트를 읽는다) 버전 행렬·장부-void·scanUpgrade를 전부 다시 돌린다 — 진 쪽은 "nothing to do" rc 0. 드라이버의 `--slow-write` 시임이 이 경쟁을 결정적 케이스로 만들었고, 장부-void 거부문은 헬퍼 하나로 합쳐 두 철자가 생기지 않게 했다.

**P1-3: 태그 클레임은 최상단 절만 인정된다.** 과거 클레임 줄은 영구히 남으므로 whole-file grep은 **옛 태그를 엉뚱한 HEAD에 재지정해도 통과**시켰다(실측: v0.5.2 트리에서 v0.5.1 술어 통과). 이제 최상단 `## <번들>` 절 안에서 행 시작 `**vX.Y.Z — `만 — 옛 태그의 정당한 재실행은 제 커밋을 체크아웃하고 그 트리의 최상단이 그 버전을 주장하므로 여전히 통과한다.

**커밋 전 실행-기반 콜드 리뷰(이 패치 자체): CRITICAL 0.** nonce 기계의 전 경로(성공 무잔재·kill -9 잔재의 마크된 락 영구 거부·빈/타인 락 불가침·거부자의 보유자-락 불가침·한 프로세스 다회 순환·**마크 쓰기 실패의 후퇴까지 실증** — umask로 mkdir만 성공시키자 EACCES를 명명하며 제 mkdir을 되물림), 동시-apply와 실교차 케이스 Windows 2회 무flake, 게이트 바이트-일치 에뮬레이션(v0.5.30까지 거부·최상단 절의 문장-중간 언급 불인정), oddVerdicts 3단어+CRLF+CP949의 od 바이트가 양 플랫폼 동일, KEY 3파일 1바이트 반응, red-first 문구 전건 바이트-일치. **real 1건은 반영**: 잠금-내 재실행이 "전체 preflight"라는 주장과 달리 **닫힌 버전-행렬을 건너뛰었다** — 대기 중 version: 3으로 바뀐 광산에 스테이징 apply가 돌고 post-validate 롤백이 뒤늦게 잡았다(데이터 무손실이나 "읽을 수 없는 포맷은 건드리지 않는다"가 이미 건드린 뒤). 행렬을 헬퍼로 추출해 잠금 아래서도 돌린다 — rc 2, 거부 문장, 쓰기 0(red: "the migration ran and rolled back instead of refusing up front"). nit로 기록만 한 경계 1: release의 read→unlink 사이 syscall-폭 TOCTOU — 이중 인간-오류 전제가 마이크로초로 압축된 것뿐이라 기계 추가 없이 기록(닫으려면 rename-후-제거).

**저우선 6건.** ① **잠금 소유권 마크** — 살아있는 락을 사람이 지시문을 어기고 지운 뒤 새 writer가 잡으면, 이전 보유자의 release가 **새 보유자의 락을 지웠다**(red 실측: FOREIGN-REMOVED). mkdir 직후 nonce를 써 두고 release는 마크가 일치할 때만 지운다 — **회수 채널이 아니다**: 잔여 락은 마크가 있든 남의 것이든 비어 있든 전원을 거부하고 사람이 지운다. ② 대기의 시계를 `performance.now()`로 — 벽시계 역행이 유한 대기를 늘릴 수 없다. ③ oddVerdicts가 id별 **전체** 단어를 담는다 — 첫 단어만 담아 validate는 행마다 전부, scope는 하나만 보이던 계수 축의 두-리더 갈림('·' 병기). ④ `--resume` KEY에 doccheck가 읽는 문서 3종(README·CHANGELOG·FORMATS.md). ⑤ **"교차 구성 불가" 주석은 거짓이었다** — pristine 픽스처가 canonical id의 v1 광산이라 attest가 그대로 돈다(rc 0 실측; mkv1의 개명된 광산만 보고 일반화한 내 오류). 주석을 정정하고 실교차를 상주 회귀로: 공격 attest가 잠금을 쥔 동안 upgrade는 한 바이트도 안 쓰고 거부, 광산은 v1 유지, 보유자 퇴장 후 같은 apply가 정상 이행. ⑥ §11 첫 컷 행(시효 회수 선택)에 대체 포인터 — 결정 로그로는 각자 참이나 현행-상태로 오독되던 충돌.

## 2026-08-06.2

**v0.5.2 — 6차 외부 리뷰(아래 .1 번들의 커밋 3041881 검토) 후속: 잠금의 P0 2건을 닫는다. 태그는 이 번들에 온다.** 전 항목 실측 재현 → 수정 → red-first 8/8 — pre-fix 런타임이 HEAD 그대로라 각 케이스가 그 결함의 문구로 죽는 것을 컨테이너에서 확인했다("A's committed row did not survive — the live lock was stolen" 등).

**P0-1: 자동 회수 제거 — 잠금은 사람이 지우기 전엔 잠금이다.** 첫 컷의 10초 시효 회수가 **살아있는 보유자에게서 잠금을 훔쳤다**(실측: 13s 보유 × 10.6s 진입 — 이웃 attest rc 0, 이어 원 보유자의 롤백이 이웃의 커밋된 행을 잘랐고, 신규 장부에선 unlink가 rc-0 행째 파일을 지웠으며 post-validate는 rc 0). 어떤 age 임계값도 시체와 SIGSTOP·절전 노트북·느린 디스크를 구분하지 못한다 — 구분하려면 하트비트가 필요하고 이 CLI에는 없다. 그래서 회수 분기 전체가 사라졌다: 잔여 잠금 앞에서 모든 writer는 **유한 대기 후 경로를 명명하며 거부**하고("will NEVER be reclaimed automatically … remove the lock yourself"), 크래시 뒤 수동 rmdir 한 번이 정직한 비용이다. 훔칠 수 없으니 소유권 토큰도 불필요해졌고(.1이 기록한 stat→rmdir TOCTOU 경계도 그 분기와 함께 소멸), 락 이름을 쓴 파일·내용물 있는 디렉터리 — 첫 컷의 무한-스핀 형태들 — 는 이제 그냥 "쥐어진 잠금"이다: mkdir가 양쪽 다 EEXIST(실측)라 같은 유한 거부로 나간다.

**P0-2: 모든 장부 writer가 한 잠금을 쓴다 — lock.mjs.** `upgrade --apply`는 장부에서 계획을 읽고 6단계에서 **통째로 다시 쓰는** writer인데 잠금 프로토콜을 몰랐다. 실측: 나이 0초의 **살아있는** 락을 심어도 rc 0·장부 기록·락 언급 0 — 그 창에서 attest의 created-here 롤백이 upgrade가 방금 주조한 legacy 행째 파일을 unlink하고, upgrade는 이미 성공을 보고한 뒤다(6차 리뷰의 실측과 동일 결말: `upgrade_rc=0 · ledger=MISSING · post-validate rc 0`). 잠금이 attest 전용 함수에서 **공용 모듈**로 나왔고, --apply는 트랜잭션 전체(백업→rename→reindex→장부 주조→검증→커밋/롤백)를 그 잠금 아래서 돈다. attest↔upgrade의 완전 교차 케이스는 일관된 광산 위에서 구성 불가라(v1 광산은 attest가 rc 2로 거부하고, 이행이 끝난 광산엔 upgrade가 쓸 것이 없다) 프로토콜을 쌍별로 고정했다 — upgrade는 쥐어진 락 앞에서 바이트 하나 안 쓰고 거부(트리 해시 동일 단언), attest는 기존 경쟁 케이스들.

**P1.** ① **`gaps.sections`의 값을 validate가 읽는다.** 첫 컷은 키를 로스터에 편입만 했다 — 삭제는 잡되 값은 안 읽는, "닫았다"고 주장한 바로 그 클래스의 잔여(실측: Pending|Waived 스키마에서 `# Open`이 **통과**하고 `# Pending`이 **차단**되는 정확한 역전). 절 이름과 메시지 전부 스키마 유래가 됐고, 값이 두 멤버가 아니면 SCHEMA-UNREADABLE. ② **이중 kind 차단** — 첫 브래킷만 판정해 `- [declared] [reference] …`가 rc 0이었다(실측). 두 번째 브래킷이 **kind 단어일 때만** 차단한다: `- [declared] [계약서 3조] …`의 브래킷 인용문은 본문이다. ③ release 게이트 둘: 정규식이 leading zero를 금지하고(`v01.2.3`이 통과했었다 — SemVer 위반), **태그는 CHANGELOG의 `**vX.Y.Z — ` 클레임 줄에 존재해야 발행된다**(`v9.9.9`가 현 번들을 발행하던 구조; 기존 기록에 대한 단언이라 제2의 진실원이 아니다).

**커밋 전 실행-기반 콜드 리뷰(이 패치 자체): CRITICAL 0 — 두 P0가 전 공격 형태에서 유지.** kill -9 잔재는 나이와 무관하게 영구 거부(수동 rmdir 후 같은 attest가 성공), **거부당한 writer는 보유자의 락을 건드리지 않는다**(거부 직후 락 잔존·보유자 정상 완주 실측), 동시 대기자 둘 다 정결 거부, upgrade는 성공·롤백 양 경로 모두 락 잔존 0에 `--check`/`--dry-run`은 락과 무관(읽기 전용), 스키마로 이름을 바꾼 장부에서도 같은 락, Windows 슬로우-홀더 2회 무flake, KEY는 golden·templates·doccheck.sh의 1바이트 편집에 각각 반응, red-first 표시 문구 8/8 재검증. real 1 + nit 3은 전부 반영:

- **real: placeholder 소음 가지가 kind 검사 전체를 우회했다.** `- [<kind>] [declared] x — r`이 무진단 rc 0(실측) — 소음 판정이 kind 분기보다 먼저 서서, 진짜 본문을 실은 placeholder-kind 불릿이 어휘 검사도 이중-kind 검사도 없이 Accepted의 "결정"이 됐다. 본문이 실재하면 그 불릿은 엔트리다: kind `[<kind>]`가 어휘 위반으로 명명·차단된다. 순수 스텁(본문까지 placeholder)은 그대로 소음이라 초기화 직후의 gaps.md는 여전히 green. .1이 경계로 기록한 remainder-decides의 남은 형태가 이것으로 닫혔고, validate-vs-CLI의 엔트리 계수 갈림도 이 형태가 오류가 되며 함께 소멸했다.
- nit: `gaps.sections: Open|Open`(동일 두 멤버)이 유효한 로스터로 통과 — 열림과 수용을 구분 못 하는 로스터라 한 절짜리 파일이 완전한 등록부로 읽힌다 → **DISTINCT 요구**, SCHEMA-UNREADABLE.
- nit: scope의 headless 문구가 찢긴 주석을 "row(s)"라 불렀다 → "line(s) … torn comment line"로 정직화.

**저우선 6건.** 찢긴 최종 **주석** 줄이 양쪽 리더에서 무언급이던 것(실측 validate rc 0·scope rc 0) → validate가 명명하고 파서는 파일-수준 손상으로 계수(주석은 증거가 될 수 없지만 찢긴 쓰기는 찢긴 쓰기고, 두 리더는 같은 답을 해야 한다); `weavedoc gaps`의 'Accepted' 하드코딩 + h1/h2 한정 → 스키마 절 이름 + any-level(validate 계수기와 같은 관용 — `### Accepted`를 validate만 세고 CLI는 "records 0"이라 찍던 갈림 봉합); scope의 장부 **4회 재파싱 → 인덱스 1회에서 전 뷰 파생**(동시 append가 한 명령 안에 두 세대를 섞을 창 제거; 몸통이 재읽기뿐이던 ledgerRowsBadstruct·ledgerQuarantined 은퇴); `--resume` 키에 **케이스가 소비하는 전부** 편입 — tests/*.sh·*.mjs(doccheck.sh·ctlscan.mjs는 케이스가 실행한다)·golden(케이스가 비교한다)·.weavedoc/templates(pristine이 복사한다); ps-smoke에 실명령 1개(빈 디렉터리 validate가 `CFG-PATH-MISSING`을 명명하며 거부하는지 — 프로세스 기동이 아니라 검사 실행의 증거); IMPROVEMENT_PLAN 상태줄 현행화. manifest 44→45(lock.mjs).

## 2026-08-06.1

**v0.5.2(첫 컷 — 6차 리뷰가 태그 전에 잡아세웠고, 태그는 .2로 갔다) — v0.5.1 외부 리뷰 후속. 동시성 P0 2건과 진단·문법 P1들.** 전 항목 실측 → 수정 → red-first(12/12, 각각 정확히 그 결함의 문구로 — 콜드 리뷰 수정분 2건은 커밋 전 draft 런타임을 기준으로 red).

**커밋 전 실행-기반 콜드 리뷰가 이 패치 자체에서 CRITICAL 1건 + real 1건 + nit 3건을 찾았고, 전부 반영했다** (P0 메커니즘 자체는 전 공격 형태에서 유지 — 겹친 실제 attest 둘 rc 0·행 2개·락 0, kill -9 잔재는 5s 거부 후 시효 회수, 보유 중 validate/scope/census/status 무간섭, Windows 락 케이스 2회 반복 무flake):

- **CRITICAL: 지울 수 없는 시효 락이 attest를 핫루프로 영구 정지시켰다.** 회수 분기의 `continue`가 경계 검사와 sleep을 건너뛰어 — 락 이름을 쓴 파일(ENOTDIR)이나 내용물 있는 디렉터리(ENOTEMPTY)처럼 rmdir이 영영 실패하는 물체 앞에서 100% CPU 무한 스핀(양 플랫폼 timeout 실측 rc 124). "대기는 유한하다"는 자기 주석의 반증이었다. 이제 **모든 반복이 예외 없이 경계 검사와 sleep을 지나고**, 지울 수 없는 시효 락은 경로와 errno를 명명하며 즉시 거부한다("delete it by hand"). 수정 중 실측 하나 더: Windows의 rmdir은 파일에 대해 **파일이 그대로인데 ENOENT를 답한다** — 그래서 회수 성공조차 `continue`하지 않는다(그 형태는 유한 5s 대기로 나간다).
- **real: non-EEXIST mkdir 실패가 남의 이야기를 했다.** truths/가 쓰기 불가면 acquireLock이 즉시 false였고, 호출부는 "다른 attest가 잠금을 쥐고 5s 내에 놓지 않았다"를 인쇄했다 — 존재하지 않는 락, 경과 0초. pre-fix 런타임은 같은 광산에서 진실("cannot create the ledger (EACCES)")을 말했으니 진실성 회귀였다. 거부가 자기 문장을 갖는다.
- nit: **superseded 줄이 superseded 아닌 행에도 발화** — 격리된 id의 최신 오타 행(승자가 없는데 "winner still stands"), headless 행의 빈 id 매달림. 유효한 승자가 있는 id만 history다.
- nit: **SemVer 게이트의 case-glob이 `v0.5.2yolo`·`v1x.2y.3z`를 통과** — 앵커드 정규식으로.
- nit: 아래 P0-2의 pre-fix red 인용이 러너가 표시하지 않는 중간 단언 문구였다(`bad()`는 마지막 실패 단언으로 RESULT를 덮는다) — 표시되는 문구로 정정. red 사실 자체는 콜드 리뷰가 10/10으로 재확인.
- **수정 케이스 작성이 추가로 잡은 P1: 6열 빈-id 행이 headless를 우회해 `''` 승자가 됐다.** headless 검사가 구조-실패 경로에만 있어, 여섯 열이 멀쩡하고 첫 열만 빈 행은 rowOk(f[0]을 아예 보지 않는다)를 지나 **아무의 것도 아닌 "승자"**로 계수되고 빈 id를 매단 채 표시됐다 — 한 화면 위에 적힌 무효화 계약("id 없는 행은 누구의 최신 verdict였을지 모른다")의 위반이고, v0.5.1 출하분에도 있던 구멍(실측: 그 행이 `[LEDGER-VERDICT]:  (typo)`로 인쇄되고 사이드카는 멀쩡히 계수). 이제 **귀속 검사가 구조 검사에 선행한다** — 열이 몇 개 살아남았든 id가 없으면 headless다.

**인정한 경계 2건**(수정 아님, 기록): ① 시효 회수의 stat→rmdir 사이 TOCTOU — 신선한 락을 회수할 수 있는 sub-ms 창. 발동엔 ≥10s 시효 + 회수자 둘 + 그 틈새의 완전한 재획득이 겹쳐야 하고, rmdir엔 정체성 검사가 없으며, 정체성을 넣으면(락 안 토큰 파일) rmdir-회수 자체와 충돌한다. 도달 가능한 인터리빙은 전부 실측 무해(동시 대기자 둘 × 2회: 양쪽 rc 0, 행 보존, 락 잔존 0). ② `- [<kind>]` 리터럴 플레이스홀더 + 실제 본문은 통과 — remainder-decides 판정(v0.3.x)의 소음 가지가 여는 형태로, 이번에 닫은 3종 옆에 남는다.

**P0-1: attest가 잠금 아래 돈다.** v0.5.1의 truncate-back은 **보상 쓰기**였고, 상호 배제 없는 보상 쓰기는 이웃의 성공을 지운다 — 시임으로 결정적으로 재현: A가 행을 붙이고 rc 0을 보고한 그 창에서, 실패한 B의 롤백이 **A의 행을 잘라냈다**(TSV는 멀쩡해서 validate도 몰랐다). 신규 장부에서는 B의 unlink가 **A의 커밋된 행째로 파일을 지웠다**. 이제 생성→꼬리검사→append→복구→미러 전체가 **하나의 임계구역**이다(장부 옆 디렉터리 락 — mkdir는 어디서나 원자적 — · 시효 초과 잠금은 회수 · 대기는 유한하고 초과 시 명시 거부). 경쟁 케이스 2건이 시임의 sleep으로 **결정적으로** 고정됐고(pre-fix red: "A's committed row did not survive"), 시효 회수 케이스는 `touch -d`로 나이를 만든다.

**P0-2: upgrade 백업이 항상 새 디렉터리다.** 날짜+PID 이름을 `mkdirSync(recursive)`가 기존 디렉터리째 받았고, 그 순간 `bkup()`의 "이번 런에 이미 찍음" 중복 제거가 **낡은 파일을 이번 런의 스냅샷으로 오인** — 진짜 스냅샷을 건너뛰고, 롤백이 **낡은 바이트를 복원**하며 "byte-identical"을 인쇄하고, 기존 복구점을 지웠다(PID는 컨테이너에서 재활용된다). `mkdtempSync`는 존재하는 경로를 반환할 수 없다 — 좁히는 게 아니라 클래스를 제거. 드라이버의 `--collide-bak`이 자기 PID 경로에 미끼를 심어 red-first로 증명(pre-fix 표시: "the planted bait dir is gone entirely" — 미끼 디렉터리를 이번 런의 백업으로 소비한 뒤 "검증된" 롤백의 뒷정리가 지워, 유일한 복구점까지 가져간다).

**P1들.** ① upgrade의 5단계 재생성 rc가 트랜잭션에 편입 — 무시하던 것이 이제 롤백을 발동한다(validate는 index의 id 존재만 보고 라벨 신선도는 못 봐서, 낡은 뷰가 "validate clean"으로 커밋됐었다). ② **대체된 unknown verdict를 파서가 담고 scope가 명명** — validate가 차단하는 바로 그 행이 장부를 서술하는 명령에서는 보이지 않았다. winner는 그대로 이긴다(복구된-장부 규칙); 단어가 옆에 적힐 뿐. ③ **gaps 문법 3종 봉합** — `- no-kind`(브래킷 필수), `- []`(sentinel이 ''라 빈 kind가 무-오류로 읽히던 것 → null), `- [declared|reference]`(`inList`의 파이프-부분문자열 트릭 → **정확 일치, 하나씩**). ④ `gaps.sections`·`gaps.enum.kind`가 SCH_KEYS에 편입 — 스키마에서 지워도 아무 일 없던 선언-미독 키. ⑤ release 잡에 **SemVer 형태 게이트**(`vfoo`가 발행되던 구조; 태그→번들 매핑은 규약이 없어 여전히 echo만 — CI grep으로 제2의 진실원을 만들지 않는다).

**저우선 5건도**: 빈 광산에서 조기 반환이 dead-ledger 진단을 삼키던 것(먼저 인쇄), 캐시 키에 faultinject 드라이버 + lib 재귀(find), CI 구문·제어문자 검사 재귀화, tests/README의 manifest 개수 44 정정.

## 2026-08-05.7

**v0.5.1 — v0.5.0 외부 리뷰 후속. P0 2건과 쓰기 내구성 P1들, 그리고 문서·식별자.** 전 항목 수정 전 실측 → 수정 → red-first 케이스 순서. **red-first가 없는 예외는 둘이고 이유가 적혀 있다**: attest 미러 경고와 upgrade MANIFEST 경고는 비특권 사용자가 필요해 스위트(컨테이너 root)에서 발동시킬 수 없다 — 콜드 리뷰가 컨테이너의 `nobody`로 손수 발동을 확인했다.

**커밋 전 실행-기반 콜드 리뷰가 이 패치 자체에서 real 6건을 더 찾았고, 전부 반영했다** (CRITICAL 0 — P0 수정은 전 공격 형태에서 유지):

- **공백-전용 줄에서 두-리더 갈림이 한 술어 아래로 재발** — validate는 lone-TAB을 빈-id 행으로 차단하는데 scope의 skip 술어가 흡수했다. skip은 이제 진짜 빈 줄과 `#`뿐, 공백을 실은 줄은 양쪽에서 같은 방식으로 파싱되고 같은 방식으로 실패한다.
- **raw-vs-canonical id 키잉 갈림** — validate는 관용 철자(`t1`→t001)를 받는데 scope가 raw 바이트로 키를 잡아 그 행이 디스크 유닛과 영영 못 만났다(validate green + 증거 강등), 게다가 유령 줄이 표시만 canonical화해 **파일이 있는 id를 "파일 없음"으로 지목**했다. 파서가 canonical로 키를 잡는다 — id 공간도 하나.
- **attest의 디렉터리-장부 진단이 Windows에서 거짓** — 디렉터리가 size 0으로 stat되어 꼬리-바이트 가드를 건너뛰고, "찢어진 행을 지우라"는 존재하지 않는 상태를 안내했다. 정규 파일 검사를 가드 앞에 두어 양 OS가 한 문장으로 거부한다.
- **upgrade의 스캔이 headless-blind** — scope·validate가 void라 선언한 사이드카에서 세 번째 소비자가 조용히 계획을 계산했다. unreadable과 같이 전 모드 거부.
- **장부가 없던 자리의 "as before"** — 이 실행이 만든 헤더 파일을 남기며 "이전과 같다"고 말했다. 이 실행이 만들었으면 지우고, 그 사실을 말한다.
- **consecrate 던지는-validator 수정의 케이스 부재**(CHANGELOG가 약속한 red-first가 스위트에 없었다) — 드라이버에 `--throw-validate` 모드를 추가하고 케이스로 고정(pre-fix red: "final.md is not byte-identical").

nit 셋도 정리: retag의 줄바꿈 주석을 실측대로 정직화(균일 파일은 보존, **혼합 파일은 첫 줄 기준 정규화** — 보존이 아니라 수리), scope의 m-레인 유령 줄 추가(SHOWN-never-absorbed의 결락), golden은 **커밋 직전 마지막 단계로 재생성**(중간 상태의 fingerprint가 박히는 것을 방지).

**P0: 장부 파서가 이제 정말 하나다.** `.4`가 줄 리더를 합쳤지만 **열 파서**가 남아 있었다 — validate의 `readTabs`는 bash `IFS=$'\t' read`를 재현하는 물건(선행·연속 TAB 붕괴)이고, 그 존재 이유는 bash와 함께 죽었는데 규칙만 살아남았다. 실측: 빈 열 하나 추가 → validate rc 0 / scope 격리(한쪽만 발동), **failed 행 앞 TAB + `status: verified` → 부채가 양쪽에서 소멸(owed=0)** — 행이 id 없는(headless) 행이 되어 scope가 귀속을 못 하고, v0.5.0의 headless 카운터는 **아무도 읽지 않는 죽은 코드**였다. 이제:

- **모든 TAB이 열을 가른다** — validate도 정확 분리(`readTabs` 은퇴), 초과 열·빈 id 전부 명명.
- **id 없는 행은 사이드카 전체를 무효화한다** — 귀속 불가능한 행은 **누구의 최신 verdict였을지 모르므로**, 어떤 행도 이기지 못하고 어떤 폴백도 열리지 않는다. scope가 이유를 인쇄하고 validate가 차단한다.
- **absent ≠ unreadable** (`ledgerRead`가 상태를 구분). `chmod 000` 장부(마지막 verdict failed)가 **"빚 없음"으로 읽히던 것**(rc 0 + 폴백 개방)이 → validate `LEDGER-UNREADABLE` 차단 + scope 명시 + 폴백 전면 금지. 디렉터리가 장부 이름을 쓴 경우도 같은 가지(스위트에서 검증 가능한 철자). `upgrade`는 읽을 수 없는 장부 위에서 **전 모드 거부**(장부가 이미 가진 것을 기준으로 행을 주조하므로).

**쓰기 내구성.** `attest`: 부분 append(ENOSPC류)가 **완성된 앞 행만 발효**시키던 것 → 크기 기록·truncate-back·복원 검증(all-or-nothing이 장애를 넘어 성립). `reindex`: **읽을 수 없는 기존 index는 시작 전에 거부** — 읽기 실패를 "원래 없음"과 합치면 롤백이 "복원" 대신 **삭제**를 하고 "rolled back"이라 보고했다(실측). `retag`: 롤백 중 재색인 실패가 이제 **문장을 바꾼다**("indexes re-synced"를 거짓으로 만들 수 없다). `upgrade`: **`crtd`(의도 등록)가 복사보다 먼저** — 도중에 죽은 복사가 롤백 목록 밖의 반쪽 경로를 남겼다. copy/rm도 주입 시임에 편입. `consecrate`: **던지는 validator = 실패한 validation**(예외가 경계를 통째로 건너뛰던 것). attest 미러·upgrade MANIFEST 쓰기 실패는 **경고로 명명**(조용한 무시 금지).

**retag의 CRLF 빈 줄.** 빈 줄의 CR을 보존하지 않아 CRLF 파일이 **혼합 줄바꿈**으로 나왔다(실측 cr 9→8). 보존하도록 고치고 — 그 과정에서 **기존 `pass_crlf_retag`가 롤백의 보존을 재고 있었음**이 드러났다: 픽스처가 validate를 통과하지 못해 매 실행 롤백됐고, "CR이 살아남았다"는 **원복된 파일**에 대해 참이었다. 픽스처를 유효하게 만들고(coverage 등록) 성공 단언 + CR/LF **개수** 단언으로 강화.

**gaps 스키마 결속.** `gaps.enum.kind`가 선언만 되고 읽히지 않았다(schema 헤더가 경고하는 바로 그 클래스). 오타 kind `[declraed]`가 Open에선 open gap으로 계수(차단은 되나 오진), **Accepted에선 조용히 통과** — 존재하지 않는 kind에 대한, 아무도 내리지 않은 결정. 이제 양쪽 절에서 어휘 위반으로 명명·차단.

**식별자·CI·문서.** manifest에 `.weavedoc/VERSION` 편입(43→44 — 라벨만 다른 두 설치본이 같은 manifest를 갖던 것). 회귀 캐시 키에 **node 버전 + 하네스 자신의 바이트**(dirty 케이스 수정 후 `--resume` 재사용 구멍). fingerprint의 lib 워크 **재귀화**(+하위 디렉터리 케이스). CI에 **PowerShell 스모크** — 문서가 권장하는 Windows 호출 경로를 처음으로 CI가 실행한다. CLI 도움말에 `upgrade` 추가 + **doccheck 검사 #4**(USAGE 줄 ↔ dispatch, red-first 확인). "tag cohesion" 단계 이름 정직화. IMPROVEMENT_PLAN 상태줄(v0.3.6에서 멈춰 있던 것) 현행화. verify 스킬의 근거 예시(.4 이후 거짓이 된 CRLF 갈림) 교체. gaps 스킬의 "not yet wired"(v0.3.3부터 wired) 정정.

## 2026-08-05.6

**성공을 보고하면서 실패하던 자리 셋.** 전부 수정 전에 실측하고, 수정 후 다시 쟀다.

- **`seal-review`가 봉인을 지우고 "sealed"를 찍었다.** frontmatter가 **열리고 닫히지 않으면** 삽입 루프가 닫는 울타리를 못 찾는다 — 지나가면서 기존 seal 줄을 전부 버리고, 새 필드는 넣지 못한 채, **방금 쓰지 못한 다이제스트를 출력하고 rc 0**. 실측: 멀쩡한 seal을 가진 review가 **필드 3개 → 0개**로 나왔다. 봉인은 깨끗한 리뷰와 그것이 검토한 바이트를 묶는 것이라, **지우면서 성공을 보고하는 건 이 명령이 실패할 수 있는 최악의 방향**이다. 이제 거부하고(rc 2) 파일을 손대지 않는다 — 일을 못 할 때 리뷰어의 글은 이 명령이 편집할 것이 아니다. (기존 `---note` 케이스는 *여는* 울타리를, 이건 *닫는* 울타리를 못 박는다.)
- **`reindex`가 반쪽만 교체하고 "폐기했다"고 말했다.** 두 뷰를 **둘 다 스테이징한 뒤 하나씩 rename**하는데, tree.md를 못 바꾸는 상황에서 **첫 rename은 이미 착지**했다 — 스테이징이 막으려던 바로 그 분열(새 index.md 옆에 손대지 않은 tree.md)이 생기고, 메시지는 `the staged copies were discarded`라고 **착지한 쪽에 대해 거짓**을 말했다. **상태를 잘못 보고하는 메시지는 상태보다 나쁘다.** 첫 rename을 되돌릴 수 있게 만들고(옛 index 바이트를 들고 있다가 복원·**검증**), 메시지가 실제로 일어난 쪽을 말한다.
- **`consecrate`가 marker 제거 실패를 삼켰다.** 승격은 성공했는데 in-flight marker가 남으면 **다음 validate가 `CONSEC-INTERRUPTED`로 실패**한다 — 초록 consecrate 옆에 빨간 광산이 있고 둘을 잇는 줄이 없었다(실측: rc 0 · marker 잔존 · 다음 validate rc 1). 이제 이름을 부른다. **rc는 0 그대로** — final은 정말로 검토된 draft이고, 실패로 만들면 이미 끝난 일을 다시 하게 만든다. 남은 건 파일 하나이고, 그 파일 이름을 말해 준다(바로 위 백업 제거 실패가 이미 쓰던 철자와 동일).

케이스 3건, **전부 red-first 확증**. 그중 seal-review 케이스는 "거부했다면서 파일을 편집했는지"를 따로 단언한다 — 거부하면서 쓴 것이 있으면 그건 거부가 아니다.

## 2026-08-05.5

**`attest`가 장부를 다시 쓰지 않고 덧붙인다.** 장부의 계약은 append-only인데 구현은 **전체를 읽어 새 행을 붙이고 통째로 다시 쓰는** 것이었고, 거기서 두 가지가 나왔다(외부 리뷰 P0-1). 잠금을 얹는 대신 **읽기-재작성 자체를 없앴다** — 읽지 않으면 읽기 실패도, 분실 갱신 창도 존재하지 않는다.

- **기존 장부 읽기가 실패하면 이력을 지우고 성공을 보고했다.** 실측(컨테이너, 비특권 사용자, `chmod 000` 장부):

  | | 옛 writer | 새 writer |
  |---|---|---|
  | 종료 코드 | **0** (`attest: verified — R2 …`) | **1** (거부) |
  | 이전 검증 행 | **1 → 0 (삭제됨)** | 1 → 1 (보존) |

  진짜 문제는 폴백 자리에 있었다: `catch { prior = 새 헤더 }`가 **ENOENT(장부 없음)와 읽기 실패를 구분하지 않아**, 못 읽은 파일을 빈 헤더로 갈아치웠다.
- **동시 attest의 분실 갱신** — 둘 다 읽고 둘 다 다시 쓰면 나중 것이 앞선 행을 지운다. **재현하지는 못했다**(단명 프로세스 둘이 임계구역에서 실제로 겹치지 않았다). 코드 형태로부터의 논증이고, append는 그 패턴 자체를 없앤다. 스위트에 경쟁 조건을 넣는 건 flake 생성기라 넣지 않았다 — 케이스 주석에 측정된 것과 아닌 것을 갈라 적어 뒀다.
- **파일 생성은 `'wx'`**(원자적 create-if-absent)라 두 프로세스가 헤더를 둘 다 쓸 수 없고, **미종결 마지막 행 위에는 덧붙이기를 거부한다**(그대로 붙이면 두 행이 하나로 융합된다 — `.4`가 막기 시작한 바로 그 찢어진 행).
- **`standard`에 제어 바이트를 거부한다.** TSV 필드 하나인데 TAB은 열을 늘리고 개행은 행을 쪼갠다. 전에는 **쓸 수 있었고**, 그 행은 아무것도 커버하지 못한 채 사용자가 만든 적 없는 malformed 장부를 validate가 보고했다. 이스케이프가 아니라 **문 앞에서 거부** — 이스케이프하면 아무 리더도 되돌리지 않는 두 번째 형식이 생긴다.

**`# Accepted` 절이 문법 검사를 받지 않고 있었다.** FORMATS는 required 모드에서 레지스터 문법을 fail-closed로 규정하고 "anything else blocks"라고 적는데, 스캐너는 `# Open`만 돌았다 — 불릿도 아니고 필드도 없는 prose가 통과했다(외부 리뷰 P0-4). **판정기 하나를 두 절에 부른다**(두 번째 리더를 만드는 건 이 릴리스가 없애고 있는 드리프트 클래스 그 자체). 경계는 명시했다: 강제하는 것은 **레지스터 문법**(불릿·연속줄)이고, Accepted 항목의 `scope:`/`recheck:`/`as-of:` **필드는 강제하지 않는다** — 그건 문서화됐으나 기계 강제된 적 없는 항목 형식이고, 게이트로 바꾸면 그 규칙 이전에 쓰인 광산을 결정 없이 막게 된다.

케이스 6건 추가(4건 red-first 확증 · 2건은 과잉 차단/과잉 격리 방지 가드라 전후 통과가 정답).

## 2026-08-05.4

**장부를 읽는 자리가 하나가 됐다.** 세 개였고, 같은 바이트를 두고 서로 다르게 답했다 — 실측(2026-08-05):

| 같은 파일 | `scope` | `validate` |
|---|---|---|
| CRLF 장부(= `core.autocrlf` 체크아웃) | 자료 **verified** | 날짜 열이 `2026-07-01\r` → **전 행 차단** |
| 미종결 마지막 행(= attest가 중간에 죽은 흔적) | **읽는다** | **버린다** |
| 정상 행 뒤 malformed 행(같은 id) | 이전 정상 행이 **유효** | 차단 |

**어느 명령에게 물었는지에 따라 달라지는 판정은 판정이 아니다.** `verify.mjs`의 `ledgerLines`/`ledgerIndex` 하나로 합치고, 물려받는 대신 **정했다**(§11 결정):

- **줄 끝 CRLF는 줄바꿈이다.** Windows 작업트리의 정상 상태를 깨뜨릴 이유가 없다. bash 판을 재현하느라 유지하던 규칙이었고, 그 런타임은 이제 없다.
- **내용 있는 미종결 마지막 행은 malformed다** — 건너뛰지 않는다. 조용히 버리면 **반쯤 쓰인 검증 행이 사라져** "아직 거기까지 안 간 장부"와 똑같이 보인다. 위험한 쪽은 그 절반이다.
- **id별 물리적 마지막 행이 승리하고, 그게 읽을 수 없으면 그 id는 격리된다** — 이전 정상 행도, v1 frontmatter 폴백도 열지 않는다. FORMATS의 `LAST row per id wins`를 약화하지 않고 구현한 것이고, "읽을 수 없는 verdict는 증거가 아니다"(2026-08-04)를 **읽을 수 없는 구조**로 넓힌 것이다. 반대 방향은 격리하지 않는다 — malformed 뒤에 정상 행이 오면 그건 **복구된 장부**이고 정상 행이 이긴다(과잉 격리 방지 가드 케이스로 고정).
- **필드 안 제어 바이트는 구조 위반이다.** 다음 리더에게 행을 깨뜨려, 같은 사실이 두 표면에서 다르게 읽히게 만든다.

**케이스 5건, 4건 red-first 확증**(나머지 1건은 과잉 격리 방지 가드라 전후 모두 통과해야 맞다). 그리고 그 과정에서 **같은 결함이 한 층 아래에서 재발한 것을 잡았다**: 공유 파서를 붙였더니 제어 바이트 행을 `scope`는 격리하고 `validate`는 통과시켰다 — validate가 자체 필드 진단을 쓰느라 `rowOk`를 거치지 않기 때문. 파서를 합치는 작업이 없앴어야 할 바로 그 두-리더 갈림이라, validate 쪽에도 규칙을 명시했다.

## 2026-08-05.3

**bash 판을 삭제한다 — 런타임이 하나가 됐다.** `.weavedoc/bin/weavedoc`은 이 재작성을 채점한 파리티 기준으로 한 릴리스를 더 살았고, 그 역할을 마쳤다. 삭제 **직전에** 마지막 대조를 전부 다시 재서 `tests/baseline/parity-final-2026-08-05.md`에 고정했다 — 회귀 356/356 × 양쪽 · 광산 350개 × 읽기 명령 9종 전체 출력 · **쓰기 명령 17개 시나리오 전수(결과 트리 바이트까지)** · 실광산 12개 명령 · 장애 주입 4건. "정말 같았는가"의 답이 기억이 아니라 이력에 있다. 번들 44 → **43개 파일**.

- **저울이 배포물을 채점한다.** `tests/regress.sh`의 기본 러너가 bash 판이었다 — 로컬에서 그냥 돌리면 **제품이 아니라 기준을 채점**하고 있었다(v0.4.0 외부 리뷰 지적). 이제 기본값이 Node다. CI도 레그마다 두 번 돌던 것을 한 번으로 줄였다.
- **고아 방향 검사가 켜졌다.** `meta_diag_code_table`은 "문서에 있는데 코드에 없는 코드"를 bash 레그에서만 봤다 — 이식이 부분적일 땐 옳은 판단이었지만, **bash가 사라지면 아무도 안 보게 된다**(조용히 멈춘 검사 클래스 그 자체). 양방향 전부 Node 소스에 대해 검사한다.
- **`doccheck`가 Node 진입점의 dispatch를 읽는다.** bash의 `case … esac` 대신 JS `switch`의 `case 'name':`을 파싱하고, 진입점 헤더에 명령 로스터 16줄을 실었다(문서가 자기 표면을 스스로 적게 하는 규칙). **무의미-방지 가드**를 붙였다 — 추출이 조용히 0건을 내면 아래 루프가 전부 0회 돌고 "docs and code agree"가 찍힌다. 자기 공허가 성공과 똑같이 보이는 검사는 그걸 거부해야 한다.
- **참조가 사라진 도구는 함께 삭제한다** — `parity.sh`·`parity-corpus.sh`·`parity-write.sh`·`foundation-parity.sh`·`foundation-mine-parity.sh`와 그 Node 짝들. 전부 **두 런타임을 비교하는** 물건이고 비교 대상이 없다. `in-container.sh`의 `regress-bash`·`corpus`·`build-corpus` 모드도 같은 이유로 제거(남은 모드는 `regress`·`sh`). `diff-parity.sh`는 **GNU diff**와 대조하므로 남는다.
- **릴리스 노트의 "새 명령" 목록**도 Node dispatch 차분으로 옮겼다(손으로 쓰지 않는다는 규칙은 그대로 — v0.2.0 태그가 이미 있던 명령 여섯 개를 새 것으로 적은 적이 있다). 실측: v0.4.0 대비 **새 명령 없음** = 명령 표면 불변.
- **fingerprint가 바뀐다**(`b11ee71eb923` → `fd42f0896617`) — 런타임 전체를 덮게 된 `.2`의 변경 때문이고, golden 기록을 갱신했다. **갱신된 golden 중 바뀐 파일은 `version.txt` 하나** — `validate`·`census`·`scope`·`status`·`gaps`의 출력은 바이트 동일이다.

**콜드 리뷰(실행 기반)가 이 삭제 자체에서 CRITICAL 한 건을 잡았다 — 삭제 패치가 만든 것이다.** README 요약 줄을 `.mjs`로 바꾸면서 `doccheck`의 앵커(공백 3칸에 걸려 있었다)가 어긋났고, **검사 #2("문서가 이름 붙인 토큰이 전부 실제 명령인가")가 0회 실행**되며 "docs and code agree"를 찍고 있었다. 이 릴리스가 막으려던 클래스 그 자체다. 앵커를 느슨하게 고치고 **그 추출에도 무의미-방지 가드**를 붙였다(양방향 red-first 확인: 가짜 토큰 → red, 앵커 파손 → red). 같은 리뷰가 함께 정리한 것들:

- `WORKFLOW.md`가 아직 **"bash ≥ 4 + GNU awk/sed 필요"**라고 적고 있었다(실측: `PATH`에 node만 두고 validate 통과). 번들에 실리는 `.weavedoc/schema` 헤더도 삭제된 `bin/weavedoc`을 현재형으로 가리켰다 — **배포물이 배포되지 않는 파일을 지목**하던 셈. `.gitattributes` 근거 주석, `IMPROVEMENT_PLAN` 죽은 링크, 런타임 모듈 7곳의 "지금은 없는 저울" 인용도 과거형으로.
- **CI가 `tests/*.sh` 전부**를 `bash -n`·shellcheck 대상으로 삼는다. `release-notes.sh`는 태그 시점에 `release` 잡이 **실제로 실행**하는데 어느 목록에도 없었다 — 다른 게이트가 전부 green이 된 뒤 발행에서 깨질 자리. 7개 전부 clean 실측.
- **`golden/`을 아무도 읽지 않고 있었다** — 런타임이 `.2`인데 스냅샷은 `.1`인 채로 한 릴리스를 지났고 스위트는 green이었다. `acct_golden_outputs_current`가 다섯 명령의 출력을 바이트로 대조하고(`version.txt`는 라벨 줄만 — fingerprint까지 걸면 lib 수정마다 갱신을 요구하는 마찰만 남는다), 갱신은 `tests/refresh-golden.sh` 한 줄이다. **의도한 출력 변경이 이제 golden 디렉터리의 diff로 드러난다.**

## 2026-08-05.2

**v0.5.0 1단계 — 외부 리뷰가 실측으로 확인해 준 포트 구멍 네 곳을 막는다.** v0.4.0 태그 직후의 외부 리뷰를 쌍둥이 광산 실측(컨테이너, 양 런타임)으로 전수 검증했고, 그 수렴이 §11에 결정 4건으로 기록됐다: **v0.5.0 직행(0.4.1 없음) · 장부 ID 격리 의미론 · CRLF 허용 공통 파서(bash 삭제와 같은 릴리스에서) · retag·upgrade의 (a)+(b)**. 이 라벨은 그중 bash를 건드리지 않고 할 수 있는 몫이다. **성공 경로 출력 바이트는 불변** — 바뀐 것은 장애 경로의 결말과 자기 식별 뿐이다.

- **retag·upgrade가 트랜잭션이 됐다 — 실패 시에도.** 실측(2026-08-05): 읽기 전용 project.md에서 Node retag는 EACCES가 명령 밖으로 새며 **t001만 개명된 반적용 상태 + 백업 잔류**로 죽었다(bash는 post-validate 롤백으로 원상). upgrade는 더 나빴다 — review_legacy 마커는 박혔는데 version은 1인 혼합 상태. 원인은 두 명령이 write.mjs의 **writeAtomic(스테이징+rename, EPERM/EACCES 시 속성 해제 재시도)을 우회한 직접 writeFileSync**. 이제 ① 모든 파일 쓰기는 stage+rename이고 실패는 **예외로 승격**되며(writeAtomic은 false를 반환한다 — 치환만 하면 조용히 넘어간다), ② 명령 전체가 snapshot → 시도 → 실패 시 전체 rollback → **postcondition 검증**(바이트 동등을 확인하고 나서야 "as before"를 말한다) 경계 안에서 돈다. 복구를 확인 못 하면 백업을 보존하고 명시적으로 차단한다.
- **fingerprint가 런타임 전체를 덮는다.** entrypoint+schema만 해시하던 것이 **bin/lib 22개 모듈(이름+바이트)**을 포함한다. bash는 런타임이 파일 하나라 그걸로 충분했지만 Node의 동작은 lib에 있다 — lib만 다른 실제 커밋 쌍(f3b05f2·ef48366)이 같은 fingerprint를 보고했다. 값이 바뀌므로 릴리스 준비에서 golden 갱신.
- **회귀 캐시 키가 두 런타임의 바이트 전부를 해시한다.** entrypoint만 해시하던 키는 **dirty lib 수정 후 `--resume`이 이전 결과를 재사용**할 수 있었다(HEAD는 커밋된 변경만 덮는다). 과잉 무효화는 있어도 과소 무효화는 없는 쪽으로.
- **케이스 7건, 전부 red-first 확증** — 수정 전 런타임(stash)에 대해 7/7이 정확히 예상한 사유로 실패함을 확인하고 넣었다. 장애 주입은 consecrate의 선례대로 **연산 시임**(`tests/retag-faultinject.mjs`·`upgrade-faultinject.mjs`)으로 — PATH 심은 node:fs에 닿지 않는다. 읽기 전용 케이스는 §9의 조건을 **이중 판정**(완전 이전+rc≠0 또는 완전 이후+rc=0)으로 못 박아 플랫폼·런타임에 무관하게 성립한다. 롤백-실패 케이스는 백업 보존과 "rollback INCOMPLETE" 문구를 못 박는다.
- **콜드 diff 리뷰(실행 기반)가 패치를 통과시키며 둘을 보탰다.** ① 단언 강화 — 사후조건은 세 번째 쓰기 표면(plan.md)과 verify.md까지 덮는데 케이스가 두 표면만 보고 있었다. plan.md 단언과 verify.md 바이트-복원 단언(verdict 단어를 벗겨 2단계가 실제로 그 파일을 편집하게 만든 뒤)을 추가. ② **"성공 경로 불변"의 정확한 범위** — LF 광산에서 성립(5개 시나리오 트리 바이트 동일 실측). CRLF **truth** 위의 retag는 이 패치 **이전부터** 갈려 있었다(bash: 봉인 불일치 → 롤백 rc 1 / Node: CR 벗김 → 커밋 rc 0 — 런타임만 HEAD로 되돌려 재실행으로 선재 확인). §11의 CRLF 공통 파서 결정 행에 인스턴스로 명명해 두었다.

## 2026-08-05.1

**런타임이 Node다 — 재작성이 배포물이 된다.** 지금까지 이식은 저장소 안에만 있었다 — 번들 정의(`tests/make-manifest.sh`)가 `bin/weavedoc`(bash)만 담고 있어서, 설치본은 여전히 bash였다. 이번 라벨부터 `bin/weavedoc.mjs`와 `bin/lib/`가 번들에 들어간다(21개 → **44개 파일**, WD-REL-001 범위 변경). `bin/lib`는 **글로브로** 넣는다 — 나중에 추가되는 모듈이 manifest 밖으로 배포될 수 있으면 manifest가 존재할 이유가 없다.

- **필요한 것: Node 18+ 하나.** `node:fs`·`node:path`·`node:crypto`만 쓴다. `package.json`도 `npm install`도 없다. 배포는 그대로 — 폴더 복사.
- **스킬·문서 14군데의 호출**을 `node .weavedoc/bin/weavedoc.mjs`로 바꿨다. 명령을 부르는 스킬 **7개 전부**에 플랫폼 규칙을 상시 규칙으로 넣었다: **Windows는 PowerShell, 그 외는 bash**(Git Bash는 프로세스마다 ~290ms의 Unix 흉내 세금 — 실측 373ms vs 80ms). **`.ps1` 래퍼는 만들지 않는다** — 실행 정책은 `.ps1`에만 적용되고 다운로드된 것은 `RemoteSigned`에서 막히지만, `node script.mjs`는 아예 그 대상이 아니다.
- **런타임이 스스로 인쇄하는 호출 문구**도 바뀐다(v1 광산 안내의 `upgrade --check`). 이건 **출력 계약**이라 349 케이스가 바이트로 비교하므로 **양쪽 런타임을 같은 커밋에서** 바꿨다. `node <경로> …`는 bash에서도 PowerShell에서도 같은 단어라 셸 분기가 필요 없다.
- **CI가 이제 배포되는 런타임(Node)을 기준으로 채점**하고, 같은 스위트를 bash 참조로 한 번 더 돌린다. 세 OS 전부. lint에 `node --check`와 **리터럴 제어문자 검사**가 붙었다 — 그 검사의 첫 초안이 자기 주석 안에 진짜 U+0001을 넣는 바람에, 검사 범위를 워크플로 자신까지 넓혔다.

**태그 런이 두 가지를 더 찾았다 (2026-08-05, 번들 바이트는 그대로 — 검사와 CI만 바뀐다).**

- **Windows에서 `config.paths`에 MSYS 형식 절대경로(`/tmp/…`·`/c/…`)를 적으면 Node 판은 못 읽는다.** MSYS의 `/tmp`는 `C:\tmp`가 아니라 `C:\Users\<사용자>\AppData\Local\Temp`이고(실측), 그 번역은 MSYS 프로그램만 한다 — bash는 자신이 MSYS라 해석했고 네이티브 Node는 `CFG-PATH-MISSING`을 낸다. 정적 규칙으로 옮길 수 없어 **선언된 파리티 예외 5번**으로 남긴다(유효하지 않은 argv 바이트와 같은 경계). **Windows에서 config에 절대경로를 쓸 일이 있으면 `C:/…` 형식으로 적으세요.** 판정·digest·id에는 닿지 않는다. 케이스 `pass_paths_absolute`가 경로를 MSYS 형식으로 만들고 있어서 *절대경로가 먹힌다*가 아니라 **MSYS 경로 번역**을 재고 있었다 — 네이티브 형식으로 고치고, 픽스처 편집이 실제로 반영됐는지 확인하는 가드를 붙였다(편집이 빗나가면 그냥 통과해 버리던 자리).
- **macOS CI 레그는 처음부터 gawk가 아니라 BWK awk를 채점하고 있었다.** `brew install gawk`는 gnubin도 `awk` 링크도 만들지 않아 `awk`는 계속 `/usr/bin/awk`였다. 즉 **지원하지 않는다고 문서에 적어 둔 툴체인을** 이 레그가 검증해 온 셈이고, 도구 자신의 preflight로는 못 잡는다(BWK awk도 `awk --version`에 0으로 답한다). `.7`에서 명세한 진단 순서가 거기서만 어긋나 드러났다. CI에 `awk → gawk`를 놓고, **PATH 위의 awk·sed가 정말 GNU인지 확인하는 단계**를 따로 붙였다 — 조용한 BSD 폴백은 이 레그가 막으라고 있는 바로 그것이다.

**bash 판은 한 릴리스 더 남는다 — 자리를 옮기지 않고.** `.weavedoc/bin/weavedoc`은 이 재작성을 채점한 **파리티 기준**이다. 두 런타임은 349 케이스 스위트, 깨진 광산 349개 명령별 대조, 쓰기 명령의 **디스크 결과 바이트**까지 일치한다. 그 일치를 나중에도 **잴 수 있게** 남긴다 — 그게 남은 유일한 역할이고, 0.4.0 다음 릴리스에서 삭제한다. 계획서 §5는 `legacy/`로 옮기라고 했지만 **옮기지 않았다**: 런타임을 바꾸는 바로 그 릴리스에서 기존 `bash .weavedoc/bin/weavedoc` 호출까지 깨뜨릴 이유가 없다. 파일 머리에 역할과 삭제 예정을 못 박아 뒀다.

---

## 2026-08-04.7

**`.6`의 상대경로 수정은 절반이었다.** 5단계(validate 이식)의 채점 수단을 먼저 세우다 드러났고, 같은 자리에서 이식 결함 3건도 함께 나왔다. **런타임 출력이 바뀌므로 번들 라벨을 올린다.**

- **진단 20종이 여전히 절대경로를 인쇄했다.** `.6`은 truths awk만 고쳤고 셸 쪽(`FM-MISSING`·`MAT-*`·`CAT-*`·`PLAN-*`·`CFG-PATH-*`·`TRUTH-DIR`·`DATE-INVALID`·`PROJ-*`)은 그대로였다. **안 보인 이유가 핵심이다: 통과하는 광산은 진단을 한 줄도 안 찍는다.** "실광산 절대경로 0줄"은 eclypse가 깨끗하다는 사실이었지 진단이 상대경로라는 증거가 아니었다. 이번엔 **345개 케이스가 만드는 광산을 전부 수확해** 하나씩 validate를 돌리고 출력에서 광산 루트를 grep해 20종을 확정했다 — `.6`의 "2종이 아니라 4종"이 읽어서 센 결과였던 것과 같은 이유로, 읽지 않고 쟀다.
  수리는 구성 지점 ~30군데가 아니라 `prob`/`warn` **한 곳**(`relmsg`)에서 했다. `.6`이 수리해야 했던 항목이 "`relf`는 메시지인 동시에 frontmatter 키 census의 키"였는데, **완성된 메시지는 아무도 소비하지 않으므로** 이 자리에서는 그 클래스가 발생할 수 없고, 철자가 하나라 나중에 추가되는 진단도 저자가 몰라도 상대경로가 된다. 케이스 `acct_diag_paths_are_relative`는 소스 grep이 아니라 **광산**으로 못 박는다 — 서로 무관한 세 계열(material·catalog·plan)을 동시에 깨뜨려서, 한 계열을 고치는 것으로 나머지에 대해 조용해질 수 없게. 알려진 한계: 광산 **값**이 프로젝트 절대 루트를 담으면 그 값도 짧게 인용된다(메시지 한정, 판정 무관).
- **Node 이식 결함 3건** — 새 채점기 `tests/parity-corpus.sh`가 3단계 명령(census·scope)에서 잡았다. 회귀 스위트는 **부분 문자열**을 확인하므로 문구·개수·동반 줄이 달라도 통과한다. 재작성의 계약은 출력 **바이트**라 그 저울로는 부족하다.
  - `census`가 중복 `status:` 키를 **첫 줄만** 셌다. bash는 전부 센다 — 그래야 "tally 합 ≠ 파일 수"가 산술로 드러난다. 중복 키를 조용히 정합하게 만들어, 이 계수기가 사려는 바로 그 신호를 지웠다.
  - `scope`의 `[LEDGER-VERDICT]` 줄에 없어야 할 **꼬리 공백**.
  - `scope`가 **줄을 한 줄도 못 내는 truth 파일**(0바이트, 또는 truth 파일명을 쓴 디렉터리)을 live로 셌다. bash는 awk 한 번으로 분류하므로 그런 입력은 분류 대상에 들지 않는다. census·validate가 그 파일을 **세면서 미분류로** 두는 것과 짝이 맞아야 한다.

- **`impact`가 마지막 남은 절대경로 출력이었다.** 진단을 상대화하고 나서 **모든 읽기 명령**으로 다시 재니 `impact`가 345개 광산 중 **326개**에서 절대경로를 찍고 있었다 — 세 목록(id grep · title grep · cited_truths 체인)이 `prob`/`warn`을 안 거치고 직접 인쇄하므로 `relmsg`가 닿지 않는다. Windows에서 두 런타임이 같은 파일을 `/d/repo/x`와 `D:/repo/x`로 달리 적어 이 명령 전체가 바이트 대조 불가였다. 케이스 `acct_impact_paths_are_relative`가 **세 목록 전부**를 못 박는다 — 별개 인쇄 지점 셋이라, 하나를 고쳤다고 나머지가 보증되지 않는다.
- **truths 진단의 순서가 gawk 해시에 맡겨져 있었다.** 9개 계열이 `for (k in array)`로 나오는데 gawk는 그 순서를 명세하지 않는다. 실측: **어떤 규모에서도 정렬이 아니다**(키 50·300·2000개 전부). 그래서 필수 필드가 통째로 빠진 truth는 `status source claim tags id` 순으로 인쇄됐다 — gawk가 아닌 무엇도 재현할 수 없는 순서이고, 애초에 이 도구가 하려던 약속도 아니다(**문제의 집합**이 계약이지 해시 순서가 아니다). `PROCINFO["sorted_in"]`으로 **명세**했다. 바꾸기 전 블래스트 반경 실측: 345개 광산 양방향 비교에서 출력이 바뀐 광산 **0개** — 스위트의 무엇도 해시 순서에 기대고 있지 않았고, 그냥 명세가 없었을 뿐이다. 케이스 `acct_diag_order_is_specified`.
- **`reindex --check`가 fail-open이었다** (콜드 리뷰 후 추가 발견). truth 파일명을 쓴 디렉터리가 있을 때 bash는 "2개 중 1개만 record를 냈다"며 **rc 1로 거부**하는데, 포트는 `isFile()` 필터로 그것을 모집단에서 빼버려 개수가 맞아떨어지고 **rc 0으로 성공**했다. 색인이 표현할 수 없는 이름을 잡으라고 있는 계수기가 바로 그 모양에서 열린 것이다.
- **프론트매터 fence 철자가 11벌이었고 전부 좁았다** (콜드 리뷰). bash는 모든 fence 리더에 `^---[[:space:]]*$`를 쓰고 그 awk들에는 `LC_ALL=C`가 박혀 있다 — C 로케일에서 그 클래스는 공백·탭·개행·**수직탭**·**폼피드**·복귀다. 포트는 `[ \t]`뿐이라, fence가 `\v`나 `\f`를 달고 있으면 bash는 블록을 닫고 Node는 **본문 안으로 계속 읽어 들어갔다.** 실측(census): 닫는 fence가 `---\v`이고 본문에 `status: conflict`가 있는 truth가 그 본문 줄을 tally에 넣어, status가 하나뿐인 파일에 "tally 합 ≠ 파일 수" 경보를 **만들어냈다.** `core.mjs`의 `isFence` 하나로 모았다(11군데 → 1군데). red 실증: 좁은 클래스로 되돌리면 `census`와 `reindex --check`가 갈린다.

**신규 도구**: `tests/parity-corpus.sh`(345 케이스가 만드는 광산 전체에 한 명령을 두 런타임으로 돌려 **출력 전체**를 대조. 선언된 예외는 **(광산, 명령) 쌍**으로 잡고 매 실행 인쇄하며, 예외가 더는 갈리지 않으면 "STALE"로 보고한다 — 재확인하지 않는 예외는 근거보다 오래 산다) · `tests/in-container.sh`(Linux 컨테이너 실행기 — 두 런타임을 한 플랫폼에서 채점해 비교에서 플랫폼을 뺀다). `tests/parity.sh`의 **종료 코드 비교가 죽어 있던 것도 고쳤다** — `x=$(cmd | sed)`는 sed의 상태를 담으므로 `brc`/`nrc`가 항상 0이었고, 계약의 절반이 한 번도 대조된 적이 없었다(`impact m999`가 rc 2인데 "rc 0"으로 통과).

회귀 **348/348**(Linux 컨테이너). 신규 케이스 3건 포함. 코퍼스 파리티: 광산 346개 × 이식된 명령 7개 전부 일치(선언된 (광산,명령) 예외 2건 제외).

**`validate`는 바이트 도메인에서 돈다.** 콜드 리뷰가 CRITICAL을 하나 잡았다: **봉인(seal)이 위조된 인용을 통과시켰다.** 파일을 UTF-8로 읽으면 유효하지 않은 바이트가 U+FFFD로 접혀 **서로 다른 두 바이트열이 같다고 비교**되는데, 봉인은 정확히 바이트 비교이고 이 광산의 위조 방지 보증 그 자체다. CP949 자료에서 truth 쪽 한 단어를 바꾼 실측: bash는 `SEAL-QUOTE-MISSING` + `0 sealed · 1 seal FAILED`, 포트는 `1 sealed`에 진단 없음. **아니라고 답해야 할 때 그렇다고 답하는 보증은 없는 보증보다 나쁘다.** 그래서 `validate`의 읽기·비교·메시지를 전부 바이트로 옮겼다(`U`/`M` · `fmvB` · `latin1` 리더 · Buffer 출력). 부수 발견: 비-ASCII 리터럴을 담은 정규식도 바이트로 다시 써야 하고, 그건 **바이트 클래스**다(`LC_ALL=C` sed에서 멀티바이트 멤버는 바이트별로 클래스에 들어간다) — 놓쳤더니 `pass_completeness_*` 2건이 즉시 빨개졌다. 경위는 `REWRITE_PLAN.md` §4d.

**같은 리뷰가 잡은, 포트가 관대했던 두 자리** — 둘 다 양 플랫폼 bash가 **같은 답**을 내므로 선언된 CRLF 예외가 아니다. CRLF `verify-ledger.tsv`(bash `read`는 `\r`을 안 벗겨 모든 행이 `LEDGER-MALFORMED`)와 CRLF `.weavedoc/schema`(`sch_load`는 유지, `cfg_load`는 벗김 — bash 안에 규칙이 둘인데 포트가 하나로 합쳤다). **Windows 기본 `core.autocrlf=true`로 그냥 clone하면 나오는 파일이다.**

**진단 순서도 명세로 만들었다**: `material_ids`/`doc_ids`가 글로브라 출력 순서가 `LC_COLLATE`의 함수였고, en_US.UTF-8에서 **MSYS와 Linux가 서로도 안 맞았다.** `local LC_ALL=C`로 고정했다(§4e).

**이 라벨에는 `validate`의 Node 이식도 함께 들어 있다**(진단 92종). 배포 번들(`bin/weavedoc` + schema + 스킬)은 **바이트 그대로**라 라벨은 올리지 않는다 — Node 런타임은 6단계에서 번들에 들어간다. 실측: 광산 **349개**에 대해 `validate` 출력 전체 + 종료 코드 대조에서 선언된 CRLF 예외 1건 외 전부 일치. 회귀는 bash 채점 348/348, **Node 채점 304/348 — 실패 44건이 전부 `consecrate`·`retag`·`upgrade`(미이식, exit 3) 도달**이고 validate 귀책은 0. 자세한 경위는 `REWRITE_PLAN.md` §5.

---

## 2026-08-04.6

Node 이식이 **현행 bash 판의 결함 두 개**를 드러냈다. 둘 다 red-first 케이스와 함께 bash에서 먼저 고쳤다. **런타임 출력이 바뀌므로 번들 라벨을 올린다** — 같은 날짜 라벨로 다른 `bin/weavedoc`이 돌면 안 된다.

- **`attest`의 `standard` 값이 verify.md 미러에서 망가졌다.** 미러 줄이 `awk -v line=…`로 전달됐는데 **gawk는 `-v` 값의 이스케이프를 확장한다.** `standard`는 사용자가 주는 자유 텍스트라, Windows 경로 `C:\tools\std`가 `C:<TAB>oolsstd`로 박혔고 `a\nb`는 **미러 항목을 두 줄로 쪼개** 항목이 아니게 만들었다. 장부 행은 `printf -v`로 만들어 멀쩡했으므로 **같은 사실의 두 표면이 어긋났고**, stdout도 멀쩡해서 stdout만 보는 검사로는 잡히지 않았다. `retag`은 같은 이유로 이미 ENVIRON을 쓰고 코드에 그 이유가 적혀 있었다 — `attest`만 안 고쳐져 있었다. 케이스: `pass_attest_standard_verbatim_in_mirror`·`pass_attest_standard_newline_stays_one_line`.
- **truths 진단이 절대경로를 인쇄했다.** 나머지 진단은 전부 상대경로를 쓴다 — 설계가 아니라 런타임 내부의 불일치였고, 원인은 truths awk가 `FILENAME`을 그대로 쓴 것. 같은 결함이 머신마다 다른 문장으로 보고됐다. **읽어서 세지 않고 깨진 광산에 validate를 돌려 찾으니 2종이 아니라 4종**이었다(`FM-MISSING`·`SEAL-QUOTE-MISSING`·`FM-DUPLICATE-KEY`·`TRUTH-BODY-FRAGMENT`, 여기에 `SEAL-RETRACTED`·`SEAL-SPLIT-BLOCK`이 자료 경로를 함께 인쇄). 실광산 validate 출력의 절대경로가 **0줄**이 됐다.

회귀 **345/345**(Linux 컨테이너, 31초). 신규 케이스 2건 포함.

---

## 2026-08-04.5

**`mat_digest`가 플랫폼마다 다른 값을 냈다 — 검증 장부를 조용히 무효화하는 결함.** Node 이식 작업이 바닥 규칙을 bash 원본과 대조하다 드러났다.

- **결함**: `mat_digest`는 파일을 awk에 통과시키는데, **MSYS gawk는 `\r`을 벗기고 Linux gawk는 유지한다.** 그래서 **같은 자료가 플랫폼마다 다른 digest**를 냈다 — 실측: eclypse `m001`(CRLF 950줄)이 Windows에서 `ebf43fc9…`, Linux에서 `5cf38845…`. digest는 "어떤 바이트가 검증됐는가"의 철자이고 모든 검증 판정이 이 숫자를 탄다. 즉 **git autocrlf 체크아웃 한 번이 검증 부채 전체를 되살린다.** `truth_digest`는 raw 바이트를 해싱하므로 영향 없음 — awk를 지나는 `mat_digest`만의 문제였다.
- **실피해 범위(추정 아님, 실측)**: eclypse는 자료 30개 중 10개가 CRLF(m001·m012·m013·m016~m022)이고 digest가 박힌 m-행은 5개(m023~m027)인데 **교집합이 없다** — CRLF 자료가 전부 `legacy-unbound`라 지금은 안 물린다. 다만 저 10개 중 하나를 `attest`하는 건 평범한 검증 작업이고, 그 순간 함정이 발동한다. CI의 3-OS 레그도 CRLF 광산에서는 서로 다른 digest를 계산했다 — **픽스처가 전부 LF라 342개 케이스가 한 번도 못 봤다.**
- **수리**: awk 첫 규칙으로 `sub(/\r$/, "")`. **MSYS 답을 정본으로 삼는다** — 배포된 광산이 거기서 digest됐으므로 명시화해도 **기존 숫자가 하나도 안 바뀐다**(실측: m001·m023~m027 전부 수리 전후 동일). 첫 규칙이어야 하는 이유는 아래 fence·`status:` 매칭이 전부 `$0`를 다시 읽기 때문.
- **케이스**: 해시 상수를 박는 대신 **결과를 진술한다** — "검증된 자료를 다른 줄바꿈으로 다시 써도 stale이 되면 안 된다". Linux에서 red 실증(`1 stale · → stale: m001`), 수리 후 양쪽 green. 픽스처를 만들 때 awk·sed를 쓰지 않고 bash `read`/`printf`를 쓴다 — 그 둘이 바로 CR 처리가 갈리는 도구라, 그걸로 픽스처를 만들면 한쪽에서 아무것도 증명하지 못한다.

**남겨둔 것**: `truth_digest`는 줄바꿈에 민감하다(raw 바이트). 플랫폼 간에는 **일관**되므로 결함은 아니지만, 자료와 truth의 규칙이 서로 다르다는 뜻이다. eclypse는 truth 269개 중 70개가 CRLF라 이걸 바꾸면 장부가 대량 무효화되므로 손대지 않았다 — 별도 판단 사항으로 남긴다.

검증: 회귀 **343/343**(Linux 전체 스윕, 신규 1) · MSYS scope 25·ledger 7·attest 2·verify 4·seal 14·consecrate 14 green · 이식 대조기 계속 일치 · doccheck ✓.

## 2026-08-04.4

**bash의 `read`도 로케일을 탄다 — v0.3.6 태그 run의 Linux 레그가 잡아낸 결함.** `2026-08-04.3` 태그에서 Windows·macOS는 통과했고 **Ubuntu만 실패**했다. 실패한 케이스는 이번에 새로 넣은 `pass_locale_scope_census_match` — **자기가 잡으라고 만든 것을 정확히 잡았다.**

- **결함**: 멀티바이트 로케일에서 bash `read`는 **유효하지 않은 멀티바이트 시퀀스를 담은 줄에 대해 아무것도 내놓지 않는다.** `IFS=$'\t' read -r a b` 형태도, `IFS= read -r l` + `${l%%…}` 형태도 마찬가지고, 데이터를 `LC_ALL=C cat`으로 통과시켜도 소용없다 — **읽는 셸의 로케일**이 결정하기 때문이다. scope의 `LROW` 맵이 `ko_KR.UTF-8`에서 **통째로 비었고**, 그래서 같은 광산이 `LC_ALL=C`에서는 digest-bound, ko에서는 전 자료 unverified로 나왔다. 장부의 자유 텍스트 `standard` 열이 바로 그런 바이트가 들어오는 자리다(한국어 콘솔의 CP949).
- **왜 로컬 스윕은 green이었나**: **MSYS는 재현하지 않는다.** 로컬 342/342와 Linux 341/342가 동시에 참이었다. §3의 로케일 정책이 "콘텐츠를 파싱해 판정을 내는 **awk**"만 다루고 **bash 자신의 리더**에는 조항이 없던 것이 원인 — 4차 리뷰의 콜드 리뷰어도 "material 레인은 bash `while read`라 바이트 정확하다"고 판정했고 그건 MSYS에서만 참이었다.
- **수리**: `cmd_scope`에 `local LC_ALL=C` — 명령 전체를 바이트 의미론으로. scope는 순수 판정 계산이고 프로젝트 텍스트를 렌더링하지 않으므로 명령 단위가 정직한 범위다. **최상위 blanket `export LC_ALL=C`는 계속 기각** — 스크립트 상단 v0.3.1 주석대로 retag의 한국어 gsub를 깨뜨린다.
- **탐침 결과(범위 한정)**: 같은 CP949 바이트를 truth frontmatter 값에 넣고 `validate`를 두 로케일에서 돌렸을 때는 **판정·`examined:` 모두 동일** — 노출은 scope의 ledger 경로에 한정된다. 다만 스크립트에는 데이터를 읽는 bash `read` 루프가 20개 넘게 있고, 그 전수 감사는 하지 않았다. **이 클래스가 닫혔다고 주장하지 않는다**(§10 후보).
- **케이스 보강**: 두 로케일 비교를 **stdout만** 대조하도록 바꿨다. stderr에는 gawk의 "invalid multibyte data" 알림과, ko_KR 로케일이 생성되지 않은 머신에서는 bash의 setlocale 경고가 섞인다 — 그대로 두면 *의견 불일치*가 아니라 *로케일 부재*로 케이스가 실패한다. `pass_locale_emoji_claim`이 명문화해 둔 안전 저하 성질(로케일 없으면 C로 떨어져 일치)을 이 케이스도 갖게 됐다.

**스윕 속도 실측(사용자 질문)**: 같은 342케이스가 **MSYS 36분47초 vs Linux 컨테이너 9초(약 245배)**. 로컬 호출 1회의 고정 floor가 MSYS에서 **2,980ms**인데 그중 파싱은 `bash -n` 기준 **~600ms**뿐 — 나머지는 기동 시 fork 비용이다. 즉 스윕이 느린 건 케이스 수나 스크립트 크기가 아니라 **MSYS fork**다. Ubuntu CI의 `regression-linux` job도 전체 suite를 **40초**에 끝낸다(실측, run 30863986184).

검증: 회귀 **342/342 on Linux(9초)** · MSYS scope 25·locale 4·census 11·ledger 7·json 4·verify 4 green · doccheck ✓.

## 2026-08-04.3

**4차 cold review 잔여 — 반나절 위생 패치.** 4차 리뷰가 P0 3건이라 했으나 재판정 결과 **심각도 인플레이션**으로 결론: 손 편집·조건 결합으로만 열리는 틈이고 긴급하지 않다. 다만 수리가 싸고 방치하면 원칙이 장식이 되므로 전부 고쳤다. 이번 라운드부터 **새 작업 규율** 적용 — 커밋 전 자기-적대 체크리스트(계산-소비 순서 · 실패 분기 전수 · 관용×noise 합성 · 로케일/플랫폼 · m/t·validate/scope 대칭), **수정 자체를 공격하는 케이스**, 침습 유닛은 **커밋 전 콜드 서브에이전트 diff 리뷰**.

- **scope 격리 비대칭 (유닛 1)** — `LROW` 맵이 unknown-verdict 격리 **앞에서** 만들어져, truth 레인은 필터된 장부를 쓰는데 material 레인만 격리 전 행을 읽었다. 오타 난 verdict가 자료에서는 digest-bound로 세이고 truth에서는 "아무것도 보증 안 함"으로 세이던 상태. 맵 구축을 필터 뒤로.
  **콜드 diff 리뷰가 이 수정의 부작용을 잡았다**: 격리가 v1 `status: verified` 폴백을 열어, 바이트가 바뀐 자료가 `stale`(빚)에서 `legacy-unbound`(빚 아님)로 **내려갔다** — 오타 하나가 할 일을 줄인 것. **§11 결정(사용자 2026-08-04): 격리 = 증거 없음.** 격리 행은 유닛을 곧장 unverified로 보내고 더 약한 폴백을 열지 않는다. **m·t 두 레인 동일** — truth 레인의 같은 선재 구멍(markdown `## Verified units` 언급이 격리 행을 legacy-unbound로 구제하던 것)도 같은 커밋에서 닫았다. 기각: 폴백 유지(오타가 빚을 줄임) · verdict만 불신하고 digest 유지(격리의 뜻이 둘이 됨).
- **gaps noise가 bullet 단위 (유닛 2)** — 배포된 플레이스홀더 bullet을 그대로 두고 **들여쓴 continuation에 실제 내용을 쓴 항목이 0건으로** 세였다. `required`가 자기가 사려던 바로 그 부채를 통과시킨 것. 판정을 **논리 entry(bullet + continuation 묶음)** 단위로 옮기고, bullet 규칙의 **자기 remainder 스펠링을 그대로 재사용**(둘째 파서 금지). entry당 1건 계상, fail-closed.
- **consecrate validate-실패 분기 (유닛 3)** — abort·mv-실패 분기는 marker를 지우기 전에 postcondition을 검증하는데 이 분기만 안 했다. `rm -rf "$fin"`의 결과를 믿었고, **복원할 원본이 없는 최초 consecration**에서는 final 자리를 한 번도 보지 않고 marker를 지웠다 — 거부된 **미검증** candidate가 final 이름을 달고 아무 흔적 없이 남는다. 세 분기 한 규칙. 고장 주입 케이스(`rm` 셰임)로 red 확인.
- **FM 값 규칙 단일화 + 로케일 잔여 (유닛 4)** — scope의 truth 분류기가 **사설 status 파서**를 들고 있었고 그건 따옴표를 벗기지 않았다: `status: "retracted"`가 validate에는 tombstone, scope에는 **live**. census는 같은 규칙의 세 번째 사본. `FM_KV_AWK`가 `fmkey`/`fmval`을 노출하고 셋 다 그걸 쓴다(`emitkv` 동작 불변).
  로케일 핀(§3 정책: 콘텐츠 파싱 awk는 `LC_ALL=C`, retag 재작성 awk만 문서화된 예외): scope truth awk · `mat_digest`(**digest에 들어갈 바이트를 고르는 awk** — 모든 검증 판정이 이 숫자를 탄다) · census status awk · scope 격리 awk 2개 · 공유 마크다운 리더 5종(`nocomment`·`comment_balanced`·`section_body`·`section_body2`·`section_all` — gaps/review/verify/coverage가 전부 이걸 쓴다).
  **그리고 awk가 아니라 grep 하나**: `strows`가 장부를 무핀 `grep -E '^t[0-9]'`로 잘랐다. 장부의 자유 텍스트 `standard` 열은 유효하지 않은 UTF-8을 담을 수 있고(한국어 콘솔이 CP949로 쓴다), GNU grep은 그런 스트림에 멀티바이트 로케일에서 **`Binary file (standard input) matches` 한 문장**을 돌려준다. scope는 "검증된 truth 0개"로 읽고 markdown 장부에서 부채를 재구성하며 **그 문장에서 유령 id를 만들어냈다**. 픽스처 실측: 같은 광산이 `LC_ALL=C`에서 `1 verified (digest-bound)`, `ko_KR.UTF-8`에서 `0 verified · 1 legacy-unbound`. `vids`(사람이 쓴 `## Verified units` 산문)에 같은 핀.
- **문서·CI 정합 (유닛 5)** — 계획서 상태줄이 "다음: v0.3.4 · macOS census 4건"으로 네 릴리스만큼 스테일 · **§9 완료조건은 macOS best-effort, §11은 required로 자기모순**(승격 커밋이 체크리스트 줄을 빠뜨림) · `tests/README`가 3-OS를 push/PR에서도 도는 것처럼 읽힘(실제는 tag·dispatch 한정) · clean-worktree 스텝에 `if: always()` 없음 — **두 job 모두**. 스윕이 실패한 run이야말로 트리가 더럽혀졌을 가능성이 가장 높은데 바로 그때 검사가 건너뛰어졌다.

검증: `bash -n` 통과 · 회귀 **342/342**(-j3 클린 완주 **36분 47초**, 신규 10 — 전부 red-first 확인, 유닛 1·4는 엔진을 임시 되돌려 red 재확인) · 수정을 공격하는 케이스 4건(폴백 경계 · entry당 중복 계수 · 플레이스홀더 continuation · stale digest) · scope/census가 C와 ko_KR.UTF-8에서 **바이트 동일** 실측 · doccheck ✓.

스윕 실측 갱신: 342케이스 -j3 = **36m47s**(직전 332케이스 31.5분 대비 케이스 10개 증가분). fork 직렬화 지배는 그대로.

## 2026-08-04.2

**P1 2단계 + 로케일 독립 판정 복원(잠복 결함 — 실광산이 곧 밟을 지뢰였음).**

- **로케일 의존 판정 (P0급 잠복)**: gawk 5.0이 UTF-8 로케일에서 이모지(🔴🟡🟢) 든 claim 줄을 오독해, 같은 광산·같은 bin이 **ko_KR.UTF-8에서는 FM-MISSING 5건, LC_ALL=C에서는 전체 통과** — 판정이 셸이 물려받은 로케일에 의존했다. eclypse의 최근 truth들이 정확히 이 모양이라 다음 validate가 밟을 상태였다(v0.3.4 포함 기존 전 버전 잠복; 세션 로케일이 바뀌며 드러남). 콘텐츠를 파싱해 판정을 내는 awk 전부에 `LC_ALL=C`(바이트 의미론) 핀 — 패턴은 전부 ASCII고 한국어는 바이트 동등성으로만 흐르므로 정확하며, retag의 재작성 awk만 문서화된 예외로 남긴다. 소규모 재현 확보(케이스 `pass_locale_emoji_claim` — 구식 bin에서 red 실증).
- **P1 2단계**: eclypse validate **32s → 13~18s** — coverage용 (id,source) 쌍을 fm 캐시에서 구성(전용 awk의 268파일 재독 제거) · verify 필수 절 검사(8회 bash 전체 순회) → awk 1회 · Human queue 항목 검사(bash 루프 + open 항목당 sed) → awk 1회. 필드 리포트 대비 누적: **155s → 13~18s**.
- **macOS 전체 green**: v0.3.4 태그 run에서 census 4건 포함 331/331 — P1의 index 대조 재작성이 quartet을 부수효과로 해소. §7.2/§11의 되돌림 조건("census 4건 해결 시 required 승격 재상정") 발동 — 승격 여부는 사용자 결정 대기.
- **스윕 병렬 실측**: 332케이스 -j6 ≈33분 vs **-j3 ≈31.5분** — 병렬도가 총시간을 바꾸지 못함 = MSYS fork 전역 직렬화 지배 확증(§10 후보 갱신: 유효 수단은 호출 수·파스 floor 축소 또는 Linux 위임).

검증: `bash -n` 통과 · 회귀 **332/332**(-j3 클린 완주 31.5분, 신규 1) · 세 로케일 판정 동일 실측 · doccheck ✓ · manifest 2회 동일.

## 2026-08-04.1

**필드 리포트(notes/FIELD-2026-08-03) 5건 전부 반영 — P1 단일 패스 접기(실광산 −79%) + 소비자 조회면 결함 D1~D4.** eclypse 실전 검증 사이클의 T5 소비자 렌즈가 낸 리포트를 §7 순서 그대로: fixture → P1 → D1+D4 → D3(§11 결정 선행) → D2.

- **P1 — validate 155s→32s(실광산 자료30·truth268, 3회 median · −79.4%), 합성 60-truth 47s→8s(−83%).** 항목 수에 비례하던 spawn을 전부 제거: truth당 basename+canon_id+awk 3-fork → 배치 awk 1회 · 재료당 `$(fm)` ~12회 → fmv(REPLY) · 전 파일 frontmatter 일괄 프리로드(`fm_preload`, 값 규칙은 `FM_KV_AWK` 한 벌 공유) · `$(sch)`×34/`$(cfg2)`×14 → 배열 직접 · index↔파일 대조 파이프라인 → bash 맵. **검사 규칙 무변경** — 같은 광산에서 문제 목록·종료 코드·`examined:` 동일. 측정 중 실물 결함 둘: `pipes()` 이중 정의(echo|tr판이 fork-free판을 몇 달간 덮고 있었음), v0.3.2 ledger digest 검사의 행당 printf|grep(246행×2fork≈15s — 자기 회귀).
- **D1 — index.md/tree.md가 `pull`과 같은 소비자 라벨을 싣는다**: `truth_labels()` 공유 함수 하나(둘째 사본 금지), ` ··` 구분자 뒤 라벨, `pull`은 매칭 전에 라벨 꼬리를 벗김(라벨 산문은 출력이지 검색어가 아님 — "evidence"를 pull하면 전 라벨 truth가 잡히는 것 방지). 진입 경로에 따라 소비자가 받는 사실이 달라지던 결함 종결(계획본 앨범 스펙이 tree.md에서 발매 사실로 읽힌 실사례). 기존 광산은 `reindex` 1회로 라벨 획득.
- **D4 — 부분 폐기(resolution.scope) 행에 `[출처]`+라벨 전체** — READ.md 규칙 2가 소비자를 보내는 바로 그 살아남은 절반이 무라벨로 출력되고 있었음(eclypse t040, 2026-08-01부터 open 항목). 전체 폐기 행은 의도적으로 그대로(후계자를 따라가라는 행).
- **D3 — `resolution.reason` 인용부호 강제**(§11 결정 2026-08-04): map이 항상 `"…"`로 쓰고, validate는 위험 형태(새 키를 열지 않는 쉼표를 품은 무인용)만 `RES-REASON-UNQUOTED`로 **경고**(비차단 — 배포 광산이 red가 되지 않게; 차단 승격은 schema 3 후보로 §11 기록). eclypse t245의 정정 부기가 YAML 절단선 아래로 사라진 실사고가 동기.
- **D2 — 표 본문 truth의 `↳ sealed:` 미리보기가 "머리행 — 표 N행, 전문은 truths/id.md"** — 러닝타임이 표 본문에 다 있는데 "광산에 길이 정보가 없다"고 판단한 실사례. 산문 미리보기는 불변.
- 합성 벤치 fixture **`mkscale`**(자료8·truth60, 전 truth 축자 인용) + `acct_scale_snapshot` — perf-baseline의 "250-truth fixture 추가 예정" 잔여 과제를 닫음.
- **스윕 실측 기록**: 전체 회귀 331케이스 = 이 머신(MSYS)에서 ~33분 연속 실행(06:52→07:25, 결과 mtime 곡선으로 확인). P1은 스윕을 거의 돕지 못함 — 스윕 케이스의 광산은 1-truth라 항목 비례 최적화의 수혜가 0에 가깝고, 지배 항은 **호출당 고정 floor(3,300줄 파스+고정 파이프 ≈3-5s) × 실명령 ~500회 × MSYS fork 전역 직렬화(-j6가 사실상 직렬)**. 그 직렬화의 물증: 경합 창에서 유일하게 실패한 케이스가 `fork: Resource temporarily unavailable`로 자식이 죽은 pass_locales(한산 후 단독 PASS). 스윕 가속은 P1과 별개 작업(하네스 상주화·케이스 배칭·Windows -j 하향·Linux CI 위임 관행)으로 §10 후보에 기록.

검증: `bash -n` 통과 · 회귀 **331/331**(신규 8, 전부 red 확인 후 구현; pass_locales는 fork 고갈 크래시 후 단독 재실행 PASS) · doccheck ✓ · manifest 2회 동일 · eclypse 사본에서 `examined:` 동일·rc=0 유지.



**v0.3.3 — 3차 cold review: 새 안전장치 자체의 구멍을 닫습니다.** 이번 P0 4건 중 2건이 v0.3.2에서 추가한 보호장치의 결함이었습니다(지난 라운드가 v0.3.1 메커니즘의 수명주기를 지적했던 것과 같은 클래스가 한 층 아래에서 반복). 전부 재현 케이스 선행으로 수리했습니다.

- **gaps 잔존 fail-open 4종 (P0-1)** — ① 들여쓴 산문 전체가 "연속행"으로 통과하던 것 → 연속행은 **bullet 뒤에서만** 합법(상태 기반 스캔), ② placeholder 대괄호를 남긴 **진짜** gap(`- [<reference>] …` + 내용)이 노이즈 필터에 걸려 0으로 세이던 것 → **remainder decides**(review 항목과 같은 재정), ③ 미종결 `<!--` 뒤에 숨은 gap → `comment_balanced`를 gaps.md에도 적용, ④ `# Accepted` 부재 → 두 절 모두 필수. countlines의 KNOWN LIMIT이 `required` 아래서 load-bearing이 된 사례입니다.
- **환경변수 주입 (P0-2)** — consecrate의 validate 예외를 **함수 인자**로 교체. bash가 시작 시 환경변수를 셸 변수로 승계하므로 `WD_CONSEC_DOC=d1 weavedoc validate`가 외부에서 예외를 자작할 수 있었습니다("동적 스코프라 export 안 된다"는 나가는 방향만 본 판단). dispatch가 validate 인자를 거부하므로 CLI 경로로는 닿지 않습니다.
- **INT 창 (P0-3)** — `mv cand fin` 직후~`stage="placed"` 사이 INT면 candidate가 남고 marker만 지워져 **미검증 final이 green**. stage 승급을 각 변경 **앞**으로 옮기고, abort·모든 실패 분기는 **복원 postcondition을 확인한 뒤에만** marker를 삭제합니다(복원 미완 → marker 유지 → validate 차단). marker 생성은 noclobber 배타(동시 실행 race), doc-id는 경로 조각 거부(consecrate·seal-review), 복구 안내는 **compare-first**(swap 전 crash면 final 자리가 원본이라 "final 삭제"는 틀린 지시), fsync 없음을 문구에 명시.
- **ledger 파서 이원화 (P0-4)** — scope는 3열 이상이면 읽고 validate는 6열을 요구해, 절단된 attest 행이 scope에서 digest-bound로 세이면서 validate는 차단했습니다. `LEDGER_ROW_AWK` 하나로 통일(6열·digest·round·standard·실달력 날짜), 거부된 행은 scope가 **표시 후 무시**.
- **재개 migration lane 분리** — v0.3.1이 남긴 출처 없는 m-id 행이 coverage에 잡혀 올바른 `v1-material-frontmatter` 행 생성을 막던 것 → material 레인 coverage는 출처 토큰(또는 실제 verdict)만 인정. scan·apply 양쪽.
- **`^---` 오인** — `---note`가 느슨한 사전검사를 통과해 **seal을 쓰지 않고 성공 메시지**를 내던 것 → 정확히 `---`만. migration 6b도 동일하게 조여, `---note` review는 prepend 경로로 가 마이그레이션 가능 상태를 유지합니다.
- **version 행렬 닫힘** — `version: banana`가 숫자 검사를 건너뛰어 "already at schema 2" exit 0이던 것 → 각 레코드는 1 또는 현재 schema만, 그 외 거부.
- **draft 단계 구조 불변식** — tuple 완전성·kind enum·marker 공존은 final 없이도 검사(같은 변조가 한 라운드 먼저 보임). digest/context **강제**와 seal 카운트는 consecrated 옆에 유지 — 라운드 사이 draft 편집은 refine의 정상 흐름이라 하드 블록하면 안 됩니다.
- **로스터 3키** — `review.enum.reviewed_kind`, `verify.ledger.origin.{material,truths}`. sch_load가 파일 전체를 읽어 동작에는 영향 없었지만, 선언-사용 드리프트는 로스터가 존재하는 이유 그 자체입니다.
- 문서: FORMATS(register 문법·consecrate 계약·단일 ledger 파서·구조 불변식 단계 독립)·UPGRADING(version 행렬·lane 재개)·PLAN 상태 블록 구조 정리(`git diff --check v0.3.2..HEAD` 통과).

검증: `bash -n` 통과 · 회귀 **323/323**(신규 13, 전부 red 확인 후 수리) · doccheck ✓ · `git diff --check` ✓(범위 검사 포함) · manifest 2회 동일.



**v0.3.2 — 2차 cold review의 P0 3건과 고우선 잔여를 전부 닫습니다 (8단계 합의안, 실패 케이스 선행).** v0.3.1 리뷰가 정확히 지적한 대로, 이번 구멍의 두 개는 v0.3.1이 만든 메커니즘 자체의 수명주기였습니다 — `review_legacy`는 도입됐지만 닫히지 않았고, dual-final은 validate에만 막혀 있었습니다.

- **upgrade는 v1 전용 (P0-1)** — version 레코드가 하나라도 1일 때만 실행(OR: 중단된 apply의 재개 보존), schema >2는 fail-closed("newer than this runtime"), v2 광산은 스캔 없이 "nothing to do". seal을 지운 v2 광산에 `--apply`가 `review_legacy`를 찍어 **변조를 이력으로 세탁**하던 경로가 근원 차단 — scan의 review-legacy 항목 자체도 v1 게이트(ledger 이관과 같은 게이트를 이 항목만 안 걸고 있었음).
- **marker 수명주기 (P0-1b)** — `seal-review`가 봉인 시 `review_legacy`를 **제거**(재봉인된 review는 v1 이력이 아님), marker+seal 공존은 `GATE-SEAL-MARKER`(신규 코드) 차단 — 남겨두면 "나중에 seal만 지우면 legacy로 강등"이 상비됩니다.
- **seal tuple all-or-none (P0-1c)** — kind/digest/context 중 어느 진부분집합도 v2에서 `GATE-UNSEALED`, `reviewed_kind`는 enum 검사. digest 없는 잔여 필드도 marker로 구제되지 않습니다.
- **dual-final consecrate 사전 거부 (P0-2)** — 기존 consecrate는 `final/`만 backup하고 `final.md`를 무백업 덮어쓴 뒤, dual 상태가 사라진 광산을 검증하고 성공 경로에서 backup까지 삭제 — **두 기존 산출물 모두 파괴, exit 0**. 이제 첫 write 전에 거부(validate의 `GATE-DUAL-FINAL`과 같은 판독).
- **gaps 문법 fail-closed (P0-3)** — `required`에서 중복 `# Open`/`# Accepted` heading과 산문 항목은 `COMP-MALFORMED`(빈 첫 Open 뒤 두 번째 Open의 항목이 보이지 않던 것, 산문 gap이 0으로 세이던 것). 들여쓴 연속행·HTML 주석은 문법에 포함. 계수는 section_all(레벨 무관)로.
- **fm 없는 v0.1 review 마이그레이션** — fm 블록을 새로 prepend. 기존엔 scan이 marker를 약속하고 apply가 못 넣어 post-validate rollback — 그런 광산은 영구 마이그레이션 불가였습니다.
- **내구 in-flight marker** — `.consecrate.inflight`를 **첫 final 변경 전 생성, 최후 삭제**. 최초 consecration은 `.final.bak`이 없어 hard kill(SIGKILL/전원)이 무검증 candidate를 흔적 없이 final에 남겼습니다 — 성공한 실행과 디스크상 구분 불가. validate가 marker/bak에 `CONSEC-INTERRUPTED`(신규 코드)로 fail-closed(유일한 예외: consecrate 자신의 in-process validate, **동적 스코프 local**로 해당 doc 한정 — export 아님). 모든 cp/mv 명시 검사. trap은 첫 mv 앞 + stage 가드(단일 파일 doc은 `$oldfin`과 `$fin`이 **같은 경로**라, 이동 전 abort가 보호 대상을 지울 뻔한 함정을 구현 중 자체 발견). 보증 문구 정직화: INT/TERM은 자동 복원, hard kill은 감지 후 수동 복원.
- **이관 축 교정** — t행은 `## Verified units`에서(origin=`v1-truths-ledger`), material행은 자료 자신의 v1 `status: verified`에서(origin=`v1-material-frontmatter`). Verified units의 m-id 언급은 추출 범위이지 변환 판정이 아닌데(WD-COR-001) 0.3.1 migration이 그 계약을 ledger 문에서 다시 열어 **필수 검증 부채를 비차단 legacy로 강등**시켰습니다. scope 판독은 의도된 비대칭: 출처 토큰 없는 m행은 **표시 후 무시**(자료 fm으로 fallback — upgrade를 다시 못 타는 기-이관 광산의 런타임 fail-safe 교정), t행 `-`는 grandfather(truths 레인은 처음부터 옳은 레인). UPGRADING에 영향 판별식과 attest last-row-wins 교정 절차.
- **ledger 행 형식 fail-closed** — 정확 6열(attest가 항상 6열을 쓰므로 이탈은 손 편집), digest 64-hex|`-`, round 정수|`-`, standard 비어있지 않음(출처 토큰 자리), 실제 날짜 — 전부 `LEDGER-MALFORMED`.
- **mk_v2 실패 승격 + v2 pass 배터리** — suite는 `set -e`가 아니라 `|| true`의 조용한 실패가 모든 v2 케이스에 unsealed 광산을 건네고 strip_seal 계열을 엉뚱한 이유로 통과시킬 수 있었음 → `bad()` 승격. `pass_gate_v2_sealed_clean` · `pass_consecrate_v2_e2e`로 pass 쪽도 고정.
- **macOS best-effort 결정 + trust boundary** — §11에 결정 기록(되돌림 조건: census 4건 해결 시 required 승격 재상정), README·WORKFLOW·tests/README·CI·§7.2·§9 한 문구. FORMATS에 신뢰 경계 명문화: 저장소 작성자와 runtime을 신뢰한다 · digest는 변경 결속이지 작성자 인증이 아니다 · **지원 명령은 자동 downgrade 경로를 만들면 안 된다**(v0.3.1 seal 세탁이 정확히 이 클래스).
- scope `--json` materials에 `originless_rows_ignored` 추가(additive, §11 JSON 정책). 이연 기록: candidate-aware validate 전면 재설계, failed 행의 바이트 변경 시 stale 재라벨.

검증: `bash -n` 통과 · 회귀 **310/310**(신규 26, 전 케이스 red 확인 후 수리) · doccheck ✓ · `git diff --check` ✓ · manifest 2회 동일(아래 커밋에서 확인).



**v0.3.1 — cold review가 연 게이트를 닫습니다.** v0.3.0 직후의 외부 cold review가 핵심 보증을 우회하는 false-green 6종을 실증했고, 전부 실물 확인 후 수리했습니다. 리뷰가 이 도구의 방법론을 이 도구에 적용한 결과이며, 그 지적이 옳았습니다.

- **review seal 강제 (P0-1)** — v2 광산에서 seal 필드를 지운 review+final은 이제 `GATE-UNSEALED`로 차단됩니다. 절반만 지운 것(context digest만 삭제)도 동일. **v1 광산만이 legacy**이고, v2의 부재는 변조입니다. 수리 중 실서열 버그도 자체 발견: SCHEMA_V1 플래그가 문서 검사 *이후*에 계산되어 진짜 v1 광산까지 차단됐던 것 — 플래그를 validate 서두로 이동.
- **인용 파싱 (P0-1b)** — `cited_truths: ["t001"]`의 따옴표가 context manifest에서 해당 truth를 조용히 누락시키던 것을 listfield 파싱으로 수리.
- **dual-final (P0-1c)** — `final.md`와 `final/`이 동시에 존재하면 `GATE-DUAL-FINAL` 차단(하나만 digest 검사되던 구멍).
- **consecrate 중단 안전 (P0-2)** — 잔존 `.final.bak` 감지 시 **거부**(기존엔 재실행이 유일한 원본 복구점을 삭제), 검증 창에 INT/TERM trap을 걸어 중단 시 candidate 제거+원본 복원. swap→validate→promote 순서 자체는 §5.3 설계 그대로 유지.
- **completeness fail-closed (P0-3)** — Open 절 없는 gaps.md(빈 파일 포함)는 `COMP-MALFORMED` 차단: 형식 없는 레지스터는 "돈 적 없는 워런티"와 같은 규칙.
- **migration 판정·충돌 (P0-4·5)** — `passes 1/2`는 **미완의 증거**로 verdict를 얻지 못하고, verdict-manual 행이 남아 있으면 apply가 **스탬프 전에 전체 거부**(멱등성 보존: 미완 이력이 부채에서 사라지는 일 없음). `t01.md`+`t1.md`가 같은 t001로 정규화되는 쌍충돌을 적용 전 검출.
- **ledger fail-closed (P0-6)** — 사이드카 verdict가 닫힌 enum(verified|failed|legacy-unbound) 밖이면 validate가 `LEDGER-VERDICT`로 차단하고 scope는 분류 전에 격리("cover nothing"으로 이름 찍음). `verifed` 오타가 digest 비교로 흘러 bound로 세어지던 fail-open의 종결.
- **로케일 결정론 (macOS 5건의 원인)** — UTF-8 로케일에선 NBSP가 `[[:space:]]`에 들어가 같은 바이트가 머신마다 다른 판정 경로를 탔습니다. bin 전역 `LC_ALL=C` 핀으로 바이트 의미론을 고정 — 프로젝트 언어 산문은 불투명 바이트로 통과, 패턴은 전부 ASCII. macOS 검증은 CI dispatch로.

검증: 로컬 전수 283/283 + doc-sync 1(VERSION 확정 후 단독 PASS) = 284 GREEN · 신규 케이스 10종 · 자체 발견 결함 3(SCHEMA_V1 순서 · v2 봉인↔migration 충돌→review_legacy 마커 · 캐시가 쓰기-후-재검증 오염→validate 진입 시 리셋) · 통합 판정은 CI Ubuntu 전수 + dispatch full matrix(macOS NBSP 수리 검증 포함).

잔여(기록): macOS 269→280 — NBSP 수리 검증 완료, 남은 4건은 전부 census의 index 파싱 계열(로컬 재현 불가, macOS 셸 필요). §7.2 non-blocking 유지, 승격/철회 결정은 이 4건 해소 후.

## 2026-08-02.16

**진단 계약 완성 + 나머지 `--json` (단위 11b) · raw source 고지 (WD-SEC-001).**

- **awk 내부 진단까지 전부 코드화** — truth·conflict·resolution·coverage·seal 계열 45곳이 `[CODE] ` 프리픽스를 달고 `emit_probs` 라우터로 합류합니다. 이제 **코드 없는 진단은 shell·awk 어디에도 없습니다**(`meta_uncoded_ratchet`가 shell 0 고정).
- **`.weavedoc/FORMATS.md`에 diagnostic code 표 신설(86개)** — 코드가 계약, 산문은 표현임을 명문화. **`meta_diag_code_table`이 양방향 드리프트를 차단**합니다: 바이너리가 표에 없는 코드를 내면 실패, 표가 바이너리에 없는 코드를 적어도 실패. 문서와 코드가 갈라질 수 없습니다.
- **`scope --json` · `version --json` 추가** — scope는 다섯 증거 등급을 카운트와 **id 배열**(`owed`)로 함께 내보내 소비자가 바로 행동할 수 있고, version은 bundle·fingerprint·schema_version을 구조화합니다.
- **WD-SEC-001 — init이 raw source의 Git 포함을 명시 고지합니다**: `.ignore`는 검색 방패일 뿐 접근 제어도 Git 제외도 아니며, `materials/*/source.*`는 커밋되어 히스토리에 남는다는 사실과 선택지(비공개 저장소 / 광산 자체를 Git 밖에 / gitignore 하되 감사 추적 상실 감수)를 사용자에게 말하도록 스킬에 못박았습니다.

검증: 신규 케이스 4(json_scope·json_version·diag_code_table·+11a분) 로컬 GREEN — 표 케이스는 첫 실행에서 자기 grep 패턴 결함(awk 형태 미인식)을 잡아 수정 후 통과 · 전수는 CI.

## 2026-08-02.15

**진단이 계약이 됩니다 — 안정 diagnostic code + `validate --json` (WD-CLI-002/QA-003, 단위 11a).**

- **코드 체계**: `AREA-SLUG`(예: `GATE-FINAL-DIGEST`, `SEAL-QUOTE-MISSING`, `VER-DISAGREE`) — **코드가 계약이고 영문 산문은 표현**입니다. 사람 출력엔 `[CODE]` 프리픽스(인용·grep 가능), 이번 웨이브로 shell 측 진단 71/73곳 코드화(잔여 2는 라우터 내부 = 실질 0). `meta_uncoded_ratchet`이 shell 측 0을 고정 — 코드 없는 prob는 이제 suite가 거부합니다.
- **`validate --json`**: stdout에 JSON 객체만 — `output_schema_version:1`, bundle, schema_version, result, problems, `examined`(seal/tombstone/gate/review-seal 카운트 전부), `diagnostics:[{code,message}]`, `warnings`. exit 규약 불변(0 pass · 1 fail). config unknown-key 경고도 `warn()` 수집기로 승격(`CFG-UNKNOWN-KEY`).
- awk 벌크 경로(truths·coverage awk)는 `emit_probs` 라우터로 합류 — 대표 진단 `SEAL-QUOTE-MISSING`은 1차에 포함, 나머지 awk 내부 타입과 scope/version/upgrade의 `--json`, FORMATS 코드표는 **단위 11b**로 명시 잔여.

검증: json 2 · ratchet 1 · human-code 1 · **gate 88/88**(프리픽스가 기존 단언 무손상) 로컬 · 전수는 CI.

## 2026-08-02.14

**document half의 E2E 척추 (WD-E2E-001).** `e2e_` 카테고리 신설 — 개별 판정이 아니라 **시퀀스**를 검증합니다: 문서 하나가 plan → draft → clean review → seal → consecrate를 실제 명령 흐름으로 통과하고, 관절마다 단언이 붙습니다.

- `e2e_single_document` / `e2e_multi_document` — 단일 파일과 draft/ 트리 각각 탄생부터 봉인된 validate까지.
- `e2e_stale_context_recovery` — 봉헌된 초록 → 인용 truth의 claim 변경 → hard red("review no longer describes this mine") → 재-seal → 다시 초록. 신선도의 왕복 전체.
- `e2e_block_repair_{contradiction,unsupported,missing-required}` — 세 kind 각각: gate가 이름으로 거부 → **거부가 final을 남기지 않음을 단언** → 수리 → 재-seal → 봉헌.
- `e2e_user_answer_chain` — ask 루프의 산출물 사슬(사용자 답변 → user-answer material → truth → 인용)이 통째로 validate·consecrate를 통과.
- `e2e_open_queue_consecrates` — 2026-08-01 재정을 시퀀스로 고정: 열린 Human queue는 기계의 봉헌을 막지 않는다(고지·go-ahead는 스킬의 의무, 한 층 위).

이 케이스들이 커버하지 **못하는** 것도 명시합니다: AI가 무엇을 쓸지 결정하는 절반 — 스킬 주도 실전 1회는 남은 과제로 플랜에 기록.

검증: e2e 8/8 첫 실행 GREEN · 전수는 CI.

## 2026-08-02.13

**Phase 5 개시 — preflight와 "문서≠코드"의 기계 검사.**

- **preflight (WD-CLI-001 마지막 항목)** — bash ≥ 4를 **첫 `declare -A` 이전에** 검사합니다: 3.2에서는 그 줄이 에러를 내고도 실행이 계속되어 배열이 스칼라처럼 조용히 굴러가는데, 정확히 그 은닉 실패를 끝냅니다. GNU sed/awk 검사는 validate와 쓰기 명령에서만(fork 2개 — 가벼운 읽기에 쓰지 않음; BSD 도구는 실패하지 않고 **조용히 다르게** 동작하므로 더 나쁨).
- **`tests/doccheck.sh` 신설 + `meta_doc_sync` 케이스** — dispatch ↔ README ↔ bin 헤더 주석, VERSION ↔ CHANGELOG 최신 항목이 한 사실인지 기계 검사. 첫 실행에서 곧장 lang·locale 미문서화(WD-DOC-001 잔여)를 잡았고, 두 번째 실행에서 이 번들의 VERSION/CHANGELOG 불일치를 잡았습니다 — 자기 일을 두 번 증명한 셈입니다.
- **문서 정합(WD-DOC-001)** — README 상단 요약을 dispatch 전체(16 명령)와 동기화, VERSION의 "날짜 비교" 안내를 fingerprint·schema 기준으로 교체, lang·locale 문서화, WORKFLOW에 bash≥4+GNU 요구사항 명시, "~220-truth" 시점성 숫자를 무시점 표현으로.

검증: doccheck GREEN · 신규 meta 케이스 포함 그룹 로컬 · 전수는 CI.

## 2026-08-02.12

**경계가 단단해졌습니다 — Phase 4 종료 (WD-IO-001 + WD-CLI-001).** 쓰기는 트랜잭션이 됐고, 입력의 가장자리는 추측을 멈췄습니다.

- **retag가 트랜잭션입니다** — 대상 경로 guard → 첫 수정 전 파일별 스냅샷 → 적용 → reindex → **full validation** → 실패 시 전량 원복 + 인덱스 재동기("rolled back"까지 케이스가 원문 tags로 증명). 미지의 3번째 플래그(`--forcee`)가 무시된 채 **실제 쓰기로 흐르던 결함**도 여기서 닫혔습니다 — 쓰기 명령은 추측하지 않습니다.
- **reindex는 same-filesystem staging + atomic rename** — mktemp가 다른 마운트라 cp 중단 시 반쪽 인덱스가 남을 수 있던 창을 닫고, 실패는 exit code로 전파됩니다.
- **write 명령의 workspace guard** — 리다이렉트된 경로는 어디든 **읽을** 수 있지만, 프로젝트 루트 밖으로 해석되거나 symlink를 통과하는 **쓰기**는 거부합니다(retag·reindex). symlink 케이스는 플랫폼 이중 판정: 진짜 symlink가 생기는 곳(Linux/CI)에선 거부를, MSYS처럼 복사로 degrade하는 곳에선 정상 동작을 각각 검증합니다.
- **실달력 날짜** — `2026-02-31`, `2023-02-29`(비윤년)를 거부하고 `2024-02-29`는 통과합니다(그레고리력 윤년 규칙, 순수 셸 산술).
- **truth 이름을 쓴 디렉터리**는 이름이 찍히고 세어지지 않습니다(gawk가 조용히 건너뛰어 검사가 안 돌던 자리).
- **Verified units의 역방향·거대 range**(`t009-t002`, `t001-t99999`)는 전개 전에 판정되어 그 줄 전체가 "covers nothing"으로 이름 찍힙니다 — 오타 하나가 수만 id의 커버리지를 주조하지 못합니다.
- **dispatch 전 명령 인자 엄격화** — 초과 인자·미지 flag는 usage+exit 2 (`validate --verbose`, `pull` 무인자, `reindex --check unexpected` 전부 케이스로 고정).
- **`C:\…`는 절대경로로 인식**되어 루트 밑에 접합되지 않습니다.
- **`audience: external`은 `publication_labels`를 요구**합니다(enum `internal|external` 신설, WD-CFG-001 마지막 조각).

검증: 신규 17케이스 그룹 GREEN 로컬 · 전수는 CI · 케이스 자신이 잡은 설계 결함 1(범위 행을 절 밖에 붙여 스캐너가 못 보던 픽스처 — attest 미러와 같은 함정).

## 2026-08-02.11

**실광산 `validate`가 8분 18초 → 1분 46초 (−78.7%).** 최소 fixture만으로는 실사용을 대표할 수 없어, 같은 광산(자료 28 · truth 264)의 사본 두 벌에 구·신 번들을 놓고 각각 측정했습니다. **검사 범위·판정·`examined:` 수치가 완전히 동일합니다** — 빨라진 것이지 덜 검사하는 것이 아닙니다.

- 호출 횟수 계측(내장 카운터 — `bash -x`는 MSYS에서 왜곡)이 다음 계층을 지목했습니다: `cfg2` 14회 · `cfgval` 5회(각각 awk 또는 grep+sed를 `$()` 안에서) · `nocomment` 15회(10회는 `dup_section` 뒤).
- **config를 한 번만 파싱**해 두 관점으로 캐시합니다 — `CFGFLAT`(파일 전체 첫 매치 = cfgval의 의미), `CFG`(section.key = cfg2의 의미). 섹션 벽은 유지되어 `verify.strength`와 `review.strength`는 여전히 별개입니다.
- **파일별 raw/주석제거 내용을 캐시**하고 `dup_section`은 그 위에서 내장으로 heading을 셉니다. Human queue 항목은 항목당 3 fork(grep+sed 2개) → 파라미터 확장.
- 값 의미론 불변: 따옴표 밖 주석만 제거, 값 없는 콜론은 여전히 부재.

최소 fixture 기준으로는 39.658초 → 14.06초(−65%)로 플랜의 −70%에 미달하지만, **실사용 기준으로는 −78.7%로 초과 달성**입니다. 개선폭 차이는 구조적입니다: 이번 최적화는 파일당·항목당 반복 fork를 없앤 것이라 대상 수에 비례해 이득이 커집니다. 두 수치를 모두 [perf-baseline.md](tests/baseline/perf-baseline.md)에 남겼습니다.

검증: 회귀 **241/241 CI green** · 실광산 재검증에서 구·신 판정 동일.

## 2026-08-02.10

**성능 —39.7초에서 16.4초로 (−59%).** Phase 4의 본 작업. 블록별 실측이 범인을 정확히 지목했습니다: 자료 1개·문서 1개짜리 최소 fixture인데 **materials 블록 12.7초 · documents 8.0초**. 원인은 로직이 아니라 **키마다 파일을 다시 파싱**한 것이었습니다 — `fm()`이 필드마다 awk를 띄우고 `req_value()`가 그걸 또 불러서, 자료 하나에 fork 30개.

- **frontmatter는 파일당 한 번만 파싱합니다** — 1회 파싱으로 캐시를 채우고, 이후 조회는 배열 참조(`fmv`는 `REPLY`에 담아 **fork 0**). 값 규칙(따옴표 밖 주석 제거·따옴표 벗기기·첫 철자 우선)은 그대로.
- **`listfield`가 내장이 됐습니다** — `echo|tr|tr|sed|grep` 5개 프로세스 → 순수 파라미터 확장. `IFS=','`라서 **공백이 든 항목이 쪼개지지 않습니다**(word splitting이었으면 깨졌을 부분).
- **`has_fm`**은 `head|tr|grep` 3 fork → 내장 read 한 줄. **`is_placeholder`**는 schema의 brace 패턴을 glob으로 판정(스키마는 여전히 의미의 SoT).
- **zone rule의 상수 3개**가 문서마다 파이프 11개로 재계산되던 것을 파라미터 확장으로 — 문서가 많은 광산일수록 이득이 커집니다.

측정(3회 median, 동일 fixture·머신): **39.658초 → 16.36초**. 목표 −70%(≤11.9초)에는 4.5초 남았고, 남은 분포는 [perf-baseline.md](tests/baseline/perf-baseline.md)에 기록했습니다.

시도했다가 **되돌린 것**: `dup_section` 뒤에 파일별 heading 인구조사 캐시 — 호출자가 묻는 횟수보다 인구조사 비용이 커서 오히려 documents 블록이 5.17→6.30초가 됐습니다. 캐시가 항상 이긴다는 가정이 틀린 사례라 기록해 둡니다.

측정 방법도 교정했습니다: `bash -x` 트레이스는 MSYS에서 stderr 쓰기 비용 때문에 라인당 ~12ms의 **가짜 균등 분포**를 만듭니다 — 블록 경계에 `EPOCHREALTIME`을 찍는 내장 마커만 신뢰합니다.

검증: 회귀 **241/241 CI green**(브랜치 run) · `bash -n` 통과 · 형식 무변경.

## 2026-08-02.9

**Phase 4 착수 — 병목의 정체를 숫자로 확정하고, 첫 fork 절감.** 추측 대신 계측부터 했습니다: **MSYS에서 `echo | tr` 100회 = 38초, 같은 횟수의 내장 루프 = 0.07초.** fork 하나가 약 190ms입니다. 즉 Windows에서 `validate`의 실행시간은 로직이 아니라 **프로세스 수**입니다. 이 사실이 남은 성능 작업의 방향을 결정합니다.

- **schema를 한 번만 읽습니다** — `sch()`가 조회마다 grep+head+sed 3개를 띄우던 것을 프로세스 시작 시 1회 로드 + 연관 배열 조회로. 호출부 40곳의 `$(sch …)` 명령 치환(각각 fork 1개)도 `${SCH[key]}` 직접 참조로 바꿔 fork 자체를 없앴습니다. **덤으로 잠복 버그 수정**: 옛 구현은 키를 정규식으로 보간해 `verify.sections`가 `verifyXsections`에도 매치됐습니다 — 이제 정확 일치입니다.
- **runtime의 자기 소스 grep 제거 (WD-ARC-001)** — validate가 자기 파일을 grep해 schema 키 로스터를 유도하던 것을 선언 상수 `SCH_KEYS`로. 파일명이 바뀌거나 읽기 권한이 없으면 조용히 4개 키로 축소되던 경로가 사라졌습니다(로스터가 잘리면 여전히 소리내어 실패).
- **enum 검사가 fork를 안 씁니다** — `pipes "$(sch X)" | grep -qx "$v"`(3 fork) 14곳을 순수 문자열 `in_list`(0 fork)로.

측정: 최소 fixture median **39.658초 → 35.96초 (약 10% 단축)**. 목표(70%, ≤11.9초)에는 크게 못 미칩니다 — 남은 fork는 `cmd_validate` 한 함수에만 명령 치환 101개·파이프 28개로 퍼져 있어, 다음 조각인 **metadata 단일 AWK pass 통합**이 실제 승부처입니다. 이번 번들은 그 전제(캐시·상수 로스터·fork 없는 enum)를 놓은 것입니다.

검증: `bash -n` 통과 · 로컬 85케이스 GREEN(치환이 광범위해 동작 보존을 우선 확인) · 전수 241은 CI Ubuntu.

## 2026-08-02.8

**Schema v2와 migration — Phase 3 종료, migration train 해제.** 이제 v1 광산이 스스로 v2가 되는 길이 있습니다: 검사와 적용이 분리된 `upgrade`, 그리고 버전이 실제 계약이 되는 협상.

- **schema 협상 (WD-MIG-002)** — `.weavedoc/schema`가 `schema.version: 2`를 선언. project.md·config.yaml의 `version:`은 한 사실의 두 기록으로 일치를 검사하고, **미래 버전은 fail-closed**, v1은 dual-reader로 읽되 `upgrade --check`를 가리키는 공지 한 줄. `version` 명령이 schema 줄을 함께 찍습니다.
- **config 전 계약 (WD-CFG-001, 조기)** — section-aware `cfg2` 신설: 평면 첫-매치 파서는 verify.strength 뒤의 review.strength를 영원히 못 봅니다. strength(1-3)·max_rounds(양의 정수)·scale(enum)·repeat(스케일별 비음수)를 verify/review 양쪽에서 검사, unknown top-level key는 **이름 찍는 경고**(확장인지 오타인지 기계가 못 가르므로 차단하지 않음).
- **`upgrade --check | --dry-run | --apply` (WD-MIG-001)** — 기본은 read-only. apply는 §8 원칙 그대로: rename 충돌 전수 사전검사(하나면 0 byte) → 원본 스냅샷+manifest → canonicalize(m5→m005; strict 참조 필드·catalog·coverage·cited_truths까지, **산문·changelog·consecrated 바이트는 불변**) → 성공 증거(`passes N/N`) 있는 행만 verdict 부여(기계는 장부가 안 한 인증을 안 함) → 절 보강 → gate 밖 괄호 kind 기록의 괄호 제거 → scalar repeat→scale map → **digest-less 이력을 `legacy-unbound` 사이드카 행으로 실체화(digest 소급 날인 없음, §11)** → 버전 스탬프 → **full validation, 실패 시 전량 자동 원복**(회귀 케이스가 트리 해시 동일성으로 증명). 멱등: 두 번째 실행은 "nothing to do".
- scope가 사이드카의 `legacy-unbound` verdict 행을 legacy로 집계(절대 stale 오분류 없음), 구 schema 프로젝트에서 새 키는 코드 기본값으로 degrade(`schema_ver`).
- **UPGRADING.md 신설** — 사용자 절차서.
- 실광산 `--check` 실측(read-only): 항목 4개 — 버전 스탬프 2 · scalar repeat · **244개 검증 unit의 legacy-unbound 실체화**. id는 이미 canonical이라 rename 0.

검증: `bash -n` 통과 · 신규 15케이스 그룹 GREEN 로컬(schema 3 · config 6 · upgrade/rollback 6) · 전수 241은 CI Ubuntu가 검증 · 개발 중 스스로 찾은 결함 2 — rollback이 생성 파일을 재백업해 원복을 오염(bkup이 created 목록을 건너뛰도록 수정), 그리고 **CI가 잡은 제품 결함**: 배포 템플릿 project.md가 `version: 1`로 남아 init 직후의 새 프로젝트가 버전 불일치로 차단될 뻔(`pass_shipped_templates`가 정확히 그 조합을 지킴).

## 2026-08-02.7

**CI 첫 실행이 잡은 3건 수리.** Phase 2에서 신설한 GitHub Actions의 첫 run이 곧바로 값을 했습니다 — ShellCheck 오류 1건(`$k[[:space:]]`가 배열 확장으로 오독되는 SC1087, 중괄호로 수정 — 동작 무변경), ko_KR 로케일 없는 runner에서의 케이스 실패 2건(`locale`은 빈 출력이 설계상 정상인데 smoke가 개발 머신을 단정하고 있었음 → 계약만 검증하도록 수정(정확한 계약은 "코드+exit 0 **또는** 빈 출력+exit 1" — run 2가 후자를 가르쳐줘서 두 라운드 걸림) · `pass_locales`는 CI에 locale-gen을 추가해 진짜 로케일 비교로 유지). 부수 실측: **같은 226케이스가 Ubuntu에서 65초, Windows Git Bash에서 ~35분** — WD-PERF-001의 "MSYS process spawn 비용이 주범" 진단이 CI로 입증됐습니다.

검증: `bash -n` 통과 · 영향 케이스 로컬(locale 2 · verify_section 1 · smoke 6) · 전수는 CI Ubuntu run이 push마다 65초로 수행.

## 2026-08-02.6

**완전성 보증이 문구가 아니라 배선이 됩니다 (WD-COR-004) — Phase 1 종료.** gaps.md는 지금까지 "never a hard failure"였고, README는 조건 없이 "no silent gaps"를 약속했습니다 — 배선과 문구가 서로 달랐습니다. 이제 둘이 일치합니다.

- **`fidelity.completeness: required`가 gap 레지스터를 gate 입력으로 만듭니다** — consecrated 출력이 있는데 gaps.md의 `# Open`에 항목이 남아 있으면 validate가 차단합니다. gaps.md 자체가 없어도 차단합니다: 한 번도 돌지 않은 워런티는 워런티가 아닙니다(게이트 기록 부재와 같은 fail-closed 규칙). `# Accepted`는 결정이므로 차단하지 않습니다.
- **기본값(off)은 그대로** — fill-or-accept, 비차단. 대신 침묵하지 않습니다: `status`가 "completeness: off — omissions are not checked"를 찍고, `consecrate` 성공 출력에도 같은 한계가 붙습니다. "보고된 갭 0"이 "갭 없음"으로 읽히는 것을 막습니다.
- **보증 문구 통일** — README 태그라인과 METHODOLOGY §7 워런티가 "검출된 contradiction은 조용히 출하되지 않는다"로 조여졌고, 완전성 보증은 required일 때만 주장합니다. FORMATS의 gaps.md 항목도 "Non-blocking by default"로 정정.

실광산 영향 없음(documents 비어 있음 → 검사 미발동; status에 off 고지 한 줄 추가).

검증: `bash -n` 통과 · 회귀 **217/217**(신규 6) · schema 불변.

## 2026-08-02.5

**Review가 검토한 바이트에 결속됩니다 — seal-review · consecrate · gate digest (WD-COR-002).** 지금까지 gate는 "clean review가 존재한다"까지만 봤고, 그 review가 **지금 이 final의 바이트**를 검토했다는 증거는 없었습니다. clean review 뒤에 draft를 고쳐 final로 복사해도, final을 직접 고쳐도, 인용된 truth·source·config가 바뀌어도 gate는 초록불이었습니다. 이제 전부 잡힙니다.

- **`weavedoc seal-review <doc-id> [draft|final]` 신설** — 라운드가 검토한 바이트(`reviewed_digest`: 단일 파일 raw bytes, 트리는 정렬 relpath `path\0sha256\n` manifest 재해시)와 판정의 지반(`review_context_digest`: cited truths · source materials · config · schema)을 review.md frontmatter에 고정합니다. 계산은 도구가, 손으로는 절대.
- **`weavedoc consecrate <doc-id>` 신설 — final의 유일한 쓰기 경로.** gate 비움을 validate와 같은 reader로 재확인 → seal·draft·context 대조 → 같은 filesystem에 candidate staging → **candidate를 final 자리에 둔 채 full validation 정확히 1회** → 성공 시 atomic promote, 실패 시 원본 final 바이트 그대로 보존. 수동 복사와 사전 validate(2회 실행 bridge)는 스킬에서 금지로 명시.
- **validate가 결속을 강제합니다** — sealed review의 digest와 final 바이트가 다르면 hard fail("Nobody reviewed the bytes that are about to ship"), context가 움직였어도 hard fail. digest 없는 v1 review는 `legacy-unbound`: `review seals:` 줄로 세어 보이되 차단하지 않습니다(migration train — v2 강제는 Phase 3에서).
- **context의 material은 status-제외 digest로** 해시합니다 — consecration 직후 refine이 찍는 `used` 스탬프가 방금 통과한 review를 소급으로 stale로 만들면 정상 흐름이 자폭하기 때문입니다(`pass_gate_context_survives_used_stamp`가 고정).
- 다중 파일 final/은 내용 변경·추가·삭제·rename 네 방향 전부 한 digest로 잡힙니다.
- review 스킬은 매 라운드 후 seal, refine 스킬 step 9는 consecrate 호출로 바뀌었습니다.

실광산 영향 없음 — documents가 비어 있어 결속 대상 final이 없습니다.

검증: `bash -n` 통과 · 회귀 **211/211**(신규 17 · meta 로스터 +4 판정자 · 세션 강제종료로 오염된 1건은 단독 재실행 PASS) · 형식 추가는 review frontmatter 선택 필드 3종과 examined 아래 `review seals:` 줄.

## 2026-08-02.4

**검증에 digest가 생겼습니다 — `verify-ledger.tsv` 사이드카와 `attest` (WD-COR-003).** 지금까지 "verified"는 장부에 이름이 있다는 뜻이었지, 그때 검증한 바이트가 지금의 바이트라는 뜻이 아니었습니다. verified truth를 한 글자 고쳐도 장부는 몰랐습니다. 이제 검증 기록이 내용에 결속됩니다.

- **`truths/verify-ledger.tsv` 신설** — machine-owned 사이드카. append-only TSV(id·sha256·verdict·round·standard·date), **id당 마지막 행이 이깁니다** — 재검증은 append고 라운드 이력은 남습니다. 쓰는 손은 `weavedoc attest` 하나뿐입니다.
- **`weavedoc attest <verified|failed> <round> <standard> <id...>` 신설** — digest 계산의 단일 철자. all-or-nothing(해석 안 되는 id 하나면 0 byte 기록), tombstone 거부, verified verdict는 `## Verified units`에 사람용 미러 줄을 함께 삽입.
- **digest 규칙** — truth는 파일 raw bytes 전체. material은 converted.md에서 **frontmatter `status:` 줄만 제외** — refine의 `used` 스탬프가 검증을 무효화하면 COR-001이 가른 두 축이 도로 붙기 때문입니다. 수동 수정·에이전트 실수·정상 re-map이 digest에는 전부 똑같이 보입니다.
- **`scope`가 5개 증거 등급으로 집계합니다** — verified(digest-bound) · legacy-unbound · stale · failed · unverified. **라운드의 부채 = unverified + stale + failed.** digest 없는 v1 기록(자료 frontmatter `verified`, markdown 장부 행)은 `legacy-unbound`: 보존되는 이력이되 바이트를 묶지 않으므로 verified로 세지 않습니다(§11 결정 — blind stamp 금지). 위험도순 재검증 대상입니다.
- **tombstone(retracted/discarded) truth가 모집단에서 빠집니다** — retracted material과 같은 규칙. 구 scope는 tombstone 3건을 갚을 수 없는 부채로, tombstone 커버리지를 verified로 각각 오계수하고 있었습니다.
- 구버전 schema 프로젝트(테스트베드 혼용)에서는 새 schema 키가 코드 기본값으로 degrade합니다.
- 스모크에서 MSYS `sha256sum`의 binary-mode 출력(`hash *file`)이 배치 digest 파서를 침묵 무력화하는 결함을 발견·수정했습니다 — 별표가 id에 붙어 모든 truth가 전 bucket에서 사라지는 형태였습니다.

실광산(238 live): 자료 22 verified → **legacy-unbound**, truth 224 verified → **201 legacy-unbound**(23은 tombstone/ghost 커버리지 정정), 미검증 40 → **37**(3건이 tombstone), ghost 2건(t083·t211) 지목 유지. 부채가 늘어난 게 아니라 **이제 정직하게 분류**된 것입니다.

검증: `bash -n` 통과 · 회귀 **194/194**(신규 10 · 갱신 3 · meta 로스터 +5 판정자) · 실광산 scope 재실행 ✓ · validate는 사이드카 옆에서 clean(`pass_attest_validate_clean`).

## 2026-08-02.3

**`used`는 검증이 아닙니다 — `scope` 상태축 수정 (IMPROVEMENT_PLAN WD-COR-001, Phase 1 착수).** material의 한 축 `status`에 lifecycle(`used`)과 검증 판정(`verified`)이 같이 살면서 `scope`가 `verified|used`를 한 묶음으로 세고 있었습니다. refine의 consecration은 `verified`를 `used`로 **덮어쓰므로**, verify를 건너뛴 자료도 문서에 한 번 인용되는 순간 검증 부채가 영구히 사라지는 구조였습니다.

- `scope`는 material 검증을 이제 **자료 자신의 `status: verified`에서만** 읽습니다. `used`는 부채로 계산되고, 부채 목록 아래 `(N of them status:used — \`used\` records citation, not verification; a verify round still owes them)` 한 줄이 이유를 찍습니다.
- `## Verified units`의 m-id는 material 검증의 근거가 되지 않습니다 — 그 장부는 truths 레인(추출 검증, converted↔truths)이고, material 검증(원본↔converted)의 v1 기록은 자료 frontmatter가 유일합니다(verify 스킬 §State). 신규 케이스가 이 구분까지 고정합니다: pristine 장부가 m001을 이름하지만 used 자료는 그래도 부채입니다.
- 검증 판정이 `used` 스탬프를 살아남는 구조(별도 verification 기록 + content digest + `legacy-unbound`)는 다음 작업 단위(WD-COR-003)입니다 — 이 번들은 잘못된 초록불만 먼저 끕니다.
- FORMATS의 material `status` enum에 `used` 뜻풀이를 추가했습니다(lifecycle이며 판정이 아님).

검증: `bash -n` 통과 · 회귀 **184/184**(신규 2: `acct_scope_used_unverified` · `acct_scope_verified_evidence_only`) · 실광산 scope 출력 불변 — used 자료 0건(문서 절반 미가동)이라 첫 consecration부터 물었을 버그를 그 전에 제거 · schema 불변.

## 2026-08-02.2

**주석 정리 — 코드 무변경.** `bin/weavedoc`의 주석이 40%(950줄)까지 불어 있었고, 그 대부분이 "이 줄을 간단히 고치려다 뭐가 깨졌다"는 회귀-방지 서사였습니다. 그런데 산문 경고는 실제로 회귀를 못 막았고(통일 지시 주석이 있었는데도 감사 라운드마다 재발), 막은 건 테스트였습니다 — 즉 가장 약한 매체로 회귀 방지를 하고 있었던 셈입니다. 그 서사를 걷어내고 **불변식 한두 줄 + KNOWN LIMIT**만 남겼습니다.

- 주석 **950 → 567줄**(40% → 28%). **코드는 1400줄 그대로** — 각 편집이 코드 줄은 건드리지 않고 주석 줄만 교체했으므로 코드 무변경은 기계적으로 보장됩니다.
- 원칙: 블록마다 "무엇을 하는가/어떤 불변식인가" 한두 줄과, 코드가 의도적으로 불완전한 지점(`KNOWN LIMIT`)만 유지. `in a real run …`·`used to …` 같은 재현 서사는 삭제. 명령 doc·게이트 구역 규칙 설명·재정 근거는 남김.
- awk 프로그램 내부 주석은 전체가 작은따옴표(`'…'`) 안이라 아포스트로피 하나로 문자열이 깨지므로, 그 규칙을 지켜 압축.

검증: `bash -n` 통과 · 회귀 **182/182** · 실광산 재검증 불변(scope·validate 출력 동일). 형식 변경 없음(스킬·schema·FORMATS 불변).

## 2026-08-02.1

**검증 범위를 기계가 정합니다 — `weavedoc scope` 신설.** 이 번들은 결함 수정이 아니라 **운용 실패 한 건**에서 나왔습니다. 실광산 재검증에서 "이 라운드가 갚아야 할 truth가 무엇인가"에 기계가 답했어야 했는데 판단으로 답해서, **264건 전체에 콜드 리뷰어 5명을 세 라운드** 돌렸습니다. 실제 미검증은 40건이었고, 규격 §8의 재확인 등급표가 이미 같은 말을 하고 있었으나 열리지 않았습니다. 산문은 건너뛸 수 있고 명령은 못 건너뜁니다 — 그 차이가 이 번들입니다.

- **`weavedoc scope` 신설** — 미검증 집합을 계산해서 찍습니다. 자료는 각 자료 자신의 `status`에서, truth는 `truths/verify.md`의 `## Verified units`에서 읽습니다. verify 스킬은 이제 라운드 범위를 여기서 **읽고**, 이미 덮인 단위를 다시 검증하려면 이유를 먼저 `verify.md`에 적어야 합니다("확실하게 하려고"는 이유가 아님).
- **`## Verified units`는 줄 모양이 아니라 판정으로 읽습니다.** 실광산은 이 절을 표로, 배포 견본은 불릿으로 씁니다 — 표만 읽는 파서였다면 불릿 광산이 "전부 미검증"으로 나와, 이 명령이 막으려던 전수 라운드가 뒷문으로 조용히 되돌아왔을 것입니다. 항목은 **판정 단어 `verified`로 끝나야** 하고(schema `verify.units.verified`), 그 밖으로 끝나는 항목(`**미통과**`·`R3 미실행`·판정 없는 레거시 줄)은 **아무것도 덮지 않으며 이름이 찍힙니다** — 단어 하나 빠진 줄이 "아직 거기까지 못 간 장부"와 똑같이 보이면 안 되기 때문입니다. 부분 문자열 비교는 반대 방향으로 틀립니다(`unverified`가 `verified`를 품음). 게이트 구역 규칙이 이미 배운 것과 같은 교훈 — 줄이 아니라 토큰을 봅니다.
- **리뷰어 수는 하한이자 상한입니다.** 레벨의 수 + 필요 시 방어자, 그 밖은 없음. **적으면** 두 렌즈를 한 명이 겸해 판정표에 아무도 따로 안 본 줄이 PASS로 올라오고(PARTIAL이 PASS 옷을 입음), **많거나 단위별로 뿌리면** 비용만 범위 크기만큼 곱해집니다 — 수는 라운드당이지 truth당이 아닙니다. 현행 모델 계층이 양방향으로 어긋나므로(한 쪽은 서브에이전트를 덜 부르고 다음 쪽은 더 부름) 해석 대상이 아니라 수치로 못박습니다.
- verify 스킬의 대상이 "all truths"에서 `scope`가 지목한 집합으로 바뀌었습니다. T2(자료 단위 coverage)·T5(소비자 시점)는 본래 광산 전체를 보는 렌즈라 예외로 명시했습니다. **레벨은 여전히 광산 전체 부피에서** 읽습니다 — 범위 부피로 읽으면 작은 배치로 자라는 광산이 T5를 한 번도 못 돌립니다. 범위는 *어느 단위*를, 부피는 *렌즈 몇 개*를 정합니다.

검증: 회귀 **182/182**(신규 케이스 4 포함) · 실광산 ✓ `자료 28 · truth 264 (264 sealed)`, `scope`가 미검증 truth 40건·자료 6건과 파일 없는 장부 id 2건을 지목.

## 2026-08-01.6

**Round 7 (부분 라운드) — critical 1 + 2건.** 리뷰어 4명 중 3명이 API 한도로 중도 종료, 방어자 미실행. 완주한 적대적 리뷰어(②)의 발견만 처리했고 그 사실을 여기 남깁니다.

- **C1 — `.5`가 만든 `section_all`이 레벨 인자를 받아, 레벨1 리더가 *더 깊은* 제목에서도 절을 끝냈습니다.** 장부는 라운드를 소제목으로 묶는 것이 정상 모양인데(실광산 verify.md가 그렇게 씁니다), `# Human queue` 아래 `## 라운드 2`를 두면 본문이 빈 채로 나와 **소유권 검사가 0회 실행되고 `✓ all checks passed`**가 났습니다. `### Human queue`는 두 리더 어느 쪽도 못 읽었습니다. 이제 **레벨 무관**으로 제목을 찾고 **같거나 얕은 제목에서만** 절을 끝냅니다(소제목은 안에 남음). R6-C2를 고친 함수 안에서 같은 부류가 한 축 남아 있었던 것 — "통일했는데 한 자리" 형상의 재발입니다.
- **`impact`가 관대한 id 철자에서 blast radius를 비웠습니다.** `source: m1`(폴더 m001)이면 네 절 전부 빈 결과 — 철회 직전 확인 지점입니다. `source`와 `cited_truths` 양쪽을 canon 비교로 맞췄습니다.
- **census가 `## legacy`를 첫 절만 읽었습니다**(validate는 전부 읽음) → 두 번째 블록의 면제가 영구 미반영. `section_all`로 통일.

검증: 전체 **178/178** 클린 와이프 · 실광산 ✓ `255 sealed` · census·status 전부 불변.

## 2026-08-01.5

**Round 6 전체 (확인 17건) — critical 2 깊게, 나머지 15 가볍게 한 판.**

- **C1 게이트, 철자 축**: 구역 규칙의 토큰 비교를 **정규화**(대괄호 안을 소문자 영숫자로 접어 비교) — `[missing required]`·제로폭 공백 등 철자 변형 전부가 규칙 하나로 수렴. **어휘 경계 재정**: kind는 고정 영어 토큰 3개뿐이고, `[모순]` 같은 어휘 밖 괄호는 산문(보증 밖, claim-vs-body와 같은 재정) — 절 안에서는 여전히 fail-closed. FORMATS 명문화, 케이스 3.
- **C2 Human queue**: 반복 절이 적법한 장부인데 첫 절만 읽혀 뒤 라운드의 열린 항목이 status·validate 양쪽에서 동시에 안 보였음 → `section_all`로 전 절 읽기 + `section_body`의 인접-반복 재진입 버그 수정. 케이스 1.
- **메타 가드 소생**: `meta_` 접두가 케이스 선택기에 없어 `.2`의 가드가 한 번도 실행된 적 없었음(그동안의 "170/170"은 그만큼 과장) → 선택기에 추가, 이제 돕니다.
- **census 셋**: legacy 차감을 분자와 같은 모집단으로 · retracted 판정을 양변 모두 `fm` 하나로 · 0-truth 분기도 distinct id 계수로.
- **가볍게 처리한 나머지**: 게이트 차단 메시지가 첫 항목을 지목(S3) · `impact`가 `cited_truths`를 경유해 발행 라벨 문서도 blast radius에 잡힘(S8) · `audience`/`publication_labels`(plan)·`gap_density`(project)에 주소 부여 — schema optional + 템플릿 + 스킬 필드명(S9) · 봉헌 go-ahead는 Human queue 아래 HTML 주석으로 기록(S10) · refine이 catalog.md status 열도 갱신(S11) · 반쯤 쓴 견본 한계 서술을 실제(꺾쇠+중괄호)로 정정(S2) · `- (없음)` 오계수 제거(N1) · plan 즉답 라우팅(N2) · Trigger A의 충돌 수리 1라운드 비용 명문화(N3) · required_tag 메시지에 ask 루프 경로 추가(N4).
- `.2`의 실광산 근거 문구 정정: eclypse는 documents/가 비어 게이트 계열이 실행되지 않으므로 그 러닝은 truths 절반의 무회귀 근거만 됨(아래 `.2`에 표기). `.4`는 VERSION만 올라갔던 것 — 내용은 두 재정(verify.md 부재 적법+status 보고 / untagged 어휘 단일화)이며 이 항목이 그 기록임.

검증: 직접 영향 케이스 17/17. (전수·실광산은 다음 큰 경계에서 1회.)

## 2026-08-01.3

**Round 5의 나머지 전부 — 문서 6 · nice 5 · 재정 1.** 이로써 R5 확인 19건이 모두 닫혔습니다.

### 재정 — 쓰다 만 견본 줄은 위반입니다 (사용자 재정)

kind 슬롯만 `{kind}`로 남고 **나머지는 다 작성된** 줄(`- [{kind}] 3장 — 초안 30% vs t001 10%`)이 "아직 안 쓴 견본"으로 조용히 버려지고, 절 안에 있는데도 `final.md`가 나갔습니다. `.12`가 프런트매터에 대해 내린 판정("미작성 자리표시자는 지시문이지 값이 아니다")과 정반대였고, 게이트가 마지막 남은 반대편이었습니다.

판별은 **나머지가 결정합니다**: 견본의 나머지는 그 자체가 자리표시자(`{where} — {what}`, gaps의 `scope:`·`recheck:` 라벨 포함)이므로, 나머지에 자리표시자가 없고 실내용이 있으면 쓰다 만 항목입니다. 슬롯 뒤에 아무것도 없으면 여전히 견본. 닫는 `]`가 없는 경우 슬롯 자신의 `}`가 "아직 견본"으로 오독되던 것도 같이 막았습니다. **좁게 한정**: 슬롯에 kind 흔적이 있는 근사 오타(`<Contradiction>`·`<contradiction / unsupported>`)는 건드리지 않습니다 — 그건 근사 안내 루프의 관할이고 그쪽 메시지가 더 낫습니다. 명시된 한계: 산문이 스스로 각괄호 토큰을 품으면(`값이 <10%>다`) 옛 판정으로 낙하합니다(새 거짓 차단 방향으로는 절대 안 갑니다).

### 문서 6건

- **S7** `templates/plan.md:13`이 아직 옛 어휘 — `.10` S10의 "세 곳 통일"이 **반쪽 거짓**이었습니다(예시 줄만 고치고 **지시하는** 설명 줄을 놓쳤고, 사용자가 읽는 건 설명 줄입니다). `.10`에 정정 표기를 달았습니다. regress의 pristine 노트도 동반 수정.
- **S8** 자기 write-scope가 금지한 쓰기를 지시하는 스킬이 셋이 아니라 **넷**이었고, `.10`이 그중 하나(refine의 `status: done`)를 넓혔습니다. 저장소가 이미 쓰는 괄호 예외 관용구를 네 자리(map·gaps·refine·review)에 붙여 한 판에 닫았습니다.
- **S9** `supersedes`가 "더 최신 날짜"로 해소하는데 **자료 자신의 날짜 필드가 없었습니다** — `added`는 입고 순서라 일괄 입고면 전부 같습니다. 그래서 한 독자는 사용자에게 묻고 다른 독자는 본문에서 날짜를 읽어 자동 해소해 **반대 승자**를 냈습니다. `dated`(선택, 자료 자신의 날짜)를 신설하고 **`supersedes`가 정렬할 수 있는 유일한 필드**로 못박았습니다. 없으면 그 규칙은 적용 불가 → authority → 질문으로 내려갑니다. validate가 날짜 형식을 검사합니다(이 값이 충돌 승자를 정하므로).
- **S10** 열린 Human queue 항목이 봉헌을 막는지 **어느 문서도 안 말했습니다**(두 사용자가 문서 출하 여부 자체를 다르게 결정). 재정: **막지 않습니다**(게이트가 유일한 차단 막) — 대신 **refine이 봉헌 직전에 열린 항목을 나열하고 명시적 동의를 받습니다.** 안 읽고 넘어가는 것이야말로 큐가 가로채려던 기계 판단이 한 층 위에서 반복되는 것입니다.
- **S11** ask 루프가 **자기 문서를 stale로** 만들어 질문 하나당 콜드 라운드 하나가 강제됐습니다(아무도 안 적음). 좁은 예외 신설: 문서 D의 ask 루프가 만든 `user-answer` 자료에서 나온 truth는 D를 stale로 만들지 않습니다(구성상 D의 scope 안이고, 같은 판에서 초안에 써 넣는 중이라 밖에서 온 드리프트가 아님). 다른 문서는 정상 전파, 그 답이 나중에 바뀌면 D도 정상 stale. 연결은 `questions.md`가 기록한 "어느 문서가 물었나"로 추적하고, 연결이 없으면 예외 없음.
- **S12** 인용의 사람용 절반이 **내부 자료 제목을 외부 문서에 강제**했습니다(문자 그대로 "user answer"까지). 계약 안에 탈출로가 없었습니다 — 지우면 문서화된 요구가 깨지고, 두면 광산 내부가 새어나갑니다. 재정: 외부 독자용일 때 **발행 라벨**을 쓸 수 있습니다. `plan`이 이미 묻는 audience에 걸어 두고, 기계 마커 `<!-- t:id -->`는 불변이라 게이트·`cited_truths`·전파는 무영향입니다. 라벨은 같은 출처를 출판 가능한 말로 부르는 것이지 다른 출처를 가리키면 안 됩니다.

### nice 5건

- **N1** `catalog.md` 부재가 자료↔카탈로그 고아 검사를 **양방향으로 조용히 끔** → 자료가 있는데 카탈로그가 없으면 이름을 부릅니다. **`verify.md`는 일부러 안 넣었습니다** — verify는 온디맨드 레인이라 부재가 적법하고, 막으면 첫 검증 전의 모든 광산이 실패합니다(부재를 **보고**할지는 형식 결정이라 Human queue에 남김).
- **N2** 인쇄되는 색인 수는 **줄**을 세는데 새 집합 대조는 `sort -u` — 중복 줄이 두 숫자를 어긋나게 하고 ✗는 없었습니다. 이제 distinct id로 세고, 중복이면 진짜 원인(같은 `id:`를 든 파일 둘)을 지목합니다.
- **N3** Human queue의 **하위 불릿**이 untagged 항목으로 보고돼, 따르면 항목 구조가 부서지는 처방이 나왔습니다. validate의 술어(열 0에서 시작하는 `- [`)를 그대로 재사용 — `- (없음)` 건과 같은 뿌리라 한 줄로 둘이 닫힙니다.
- **N4** 자리표시자 거부 규칙이 schema 주석에만 있고 **FORMATS(스스로를 사람용 거울이라 선언)에 0건** → 규약 절에 명문화.
- **N5** `decision_kind`에 standing-precedence(lazy authority)의 읽기가 없었습니다 — 기계가 기제를, 사용자가 순위를 발원하고 값 자체는 아무도 제안하지 않은 경우. **`ratified`로 확정**(우선 재검증 집합에 들어가는 것이 맞습니다 — 한 번 정한 규칙이 사용자가 못 보는 충돌들을 계속 결정하므로).

**회귀**: 신규 14케이스, 전체 **170/170** 클린 와이프. 실광산 ✓ `255 sealed` · census · status 전부 불변.

## 2026-08-01.2

**게이트 반전 — 구조 수정입니다.** 세 라운드 연속 같은 함수가 뚫린 원인은 개별 실수가 아니라 설계였습니다: "위반 항목처럼 생긴 줄"을 화이트리스트로 **인식**하려 했는데, 마크다운의 표면형은 무한해서 콜드 리뷰어가 올 때마다 새 변장이 하나씩 나오는 게 보장돼 있었습니다. 사용자 재정(2026-08-01)으로 부담을 뒤집습니다.

### 구역 규칙 — 모양은 더 이상 판정 대상이 아닙니다

> **kind 토큰(`contradiction`·`unsupported`·`missing-required`)이 대괄호 안에 있으면, 그 줄은 'Fidelity violations' 절 안에만 있을 수 있다. 절 밖이면 모양이 뭐든 차단.**

탐지 대상이 "무한한 항목 모양"에서 **schema가 소유한 단어 3개**로 바뀌었습니다 — 유한하고, 구성상 완전합니다. 대괄호 친 kind는 게이트가 행동하는 항목의 서명이고, 게이트 구역 밖의 그 서명은 주차된 위반이거나 잘못 쓴 기록이라 둘 다 정지가 맞습니다. 구현은 정규식 하나(`\[[^]]*(kind)`, 대소문자 무시)입니다. 강조·번호·인용·체크박스·표 — 어떤 옷을 입혀도 판정이 같으며, **표 행(`| [contradiction] | …`)처럼 아직 아무 라운드도 못 찾았던 모양까지 소급해서 닫힙니다.**

**경계 판정자는 하나입니다.** `fid_body`를 `fid_mark`(전 줄 안/밖 표시)로 리팩터링해 게이트가 읽는 안쪽과 구역 규칙이 검사하는 바깥쪽이 **같은 한 판정의 보수**가 되게 했습니다 — 제3의 상태가 생길 수 없습니다. `gate_entry()`(3라운드 연속 뚫린 그 함수)는 호출자가 없어져 삭제. 근사-kind 안내는 절 안으로 스코프(밖은 구역 규칙이 더 강한 메시지로 말함), 화살표 인계철선의 계수도 같은 정규식으로 통일.

**형식 변경 — 기록은 kind를 괄호 없이 씁니다.** adjudications·Findings 산문·Human queue가 위반을 *언급*할 때는 `- fixed: contradiction — …`처럼 맨 단어로 씁니다. 괄호 친 형태는 이제 차단되고, 메시지가 적법 철자를 가르칩니다. FORMATS와 review 템플릿에 명문화.

**은퇴한 한계**: "대괄호 앞에 단어가 있으면 안 센다"(`.9`의 명시된 한계와 그 대괄호 쌍둥이)는 조용한 통과에서 **시끄러운 차단**으로 은퇴 — `.9`에 은퇴 표기를 달았습니다. 수용된 거짓 양성 하나를 명시합니다: 미닫힘 대괄호 안의 kind 언급(`- [TODO contradiction 처리…`)은 `]`를 안 친 항목과 구분 불가라 차단됩니다. 탈출은 한 타(괄호 제거)이고 메시지가 말합니다.

### 메타 가드 — "통일했다는데 한 자리가 빠졌다"를 스위트가 감시합니다

키 철자 세 물결·fence 두 자리·게이트 세 라운드의 공통 뿌리는 bash/awk 2,000줄에서 같은 규칙의 복제를 막을 장치가 없다는 것이었습니다. 이제 회귀 스위트에 **바이너리 자체를 검사하는** 케이스가 있습니다: 공유 판정자 8종(is_noise·has_fm·fid_mark·fid_body·nocomment·canon_id·is_placeholder·req_value)이 정확히 한 번씩 정의되어 있는지, 인라인 fence 판정이 0개인지, 엄격 키 철자 패턴(`^key:`)이 되살아나지 않았는지. 드리프트가 생기면 콜드 리뷰어가 찾기 전에 스위트가 먼저 실패합니다.

**회귀**: 케이스 전면 개편 — 주차 차단 케이스 15곳이 구역 메시지로, 옛 "명시된 한계" 케이스 5개가 차단으로 뒤집힘(각각 괄호 없는 적법 철자의 통과 케이스 동반), 신규 7(표 행·미선언 제목·맨 단어 통과·TODO 수용 오탐·화살표 안/밖 분리·메타 가드). 전체 **158/158** 클린 와이프. 실광산 ✓ `255 sealed`·census 불변 (`fid_body` 리팩터링 무회귀).

## 2026-08-01.1

**Round 5의 critical 2건 + 코드 should-fix 5건.** 4관점 리뷰어 + 방어자 완주 결과는 FAIL(확인 19건)이었고, 기계 쪽을 여기서 닫습니다. 문서 쪽 7건은 다음 판입니다.

### C1 — 게이트가 세 번째 라운드 연속 같은 함수에서 뚫렸습니다

`gate_entry`가 못 세는 모양이 네 개 더 있었습니다: **강조**(`- **[contradiction]**`)·**인라인 코드**(`` - `[contradiction]` ``)·**태스크 체크박스**(`- [ ] [contradiction] …`, `- [x] …`). 넷 다 마크다운이 **평범한 위반 목록으로 렌더링**하고 `is_noise`가 항목이라 판정하는데, 절 밖에 주차하면 아무도 못 봐서 `열린 위반 + final.md + ✓ EXIT=0`. 두 자리를 고쳤습니다 — 접두 화이트리스트에 강조/인라인코드 마크업을 넣고, 첫 슬롯이 **체크박스 어휘**(빈칸·공백·x·X)일 때만 대괄호 하나를 전진합니다.

**방어자가 경고한 함정 둘을 다 피했습니다**: (a) 접두를 그냥 느슨하게 하면 명시된 한계(`- 3장 [contradiction]`·`- fixed: [contradiction]`)가 거짓 차단되고, (b) **마지막** 대괄호를 읽으면 Findings(`- [critical] … [contradiction] …`)와 Human queue(`- [open] [recommended] … contradiction`)가 주차된 위반으로 계수되어 이 프로젝트의 리뷰 파일 자신이 게이트를 막습니다. 22개 모양을 양방향 실측해 둘 다 안 밟았음을 확인했습니다.

**한계 문장을 넓혔습니다**: `- [3장] [contradiction] …`는 이미 명시된 한계 `- 3장 [contradiction] …`의 **대괄호 쌍둥이**라 계속 미계수입니다 — 둘을 다르게 판정하면 한계가 스스로 모순합니다.

### C2 — 마지막 truth 파일을 지우면 검사 넷이 통째로 꺼졌습니다

`ls truths/t[0-9]*.md`가 실패하면 그 안의 모든 것이 건너뛰어져, `index.md`와 `coverage.md`가 **지워진 truth를 계속 지목하는 채로** `✓ all checks passed` EXIT=0. "truth가 0"은 검사할 게 없다는 뜻이 아니라 **그 검사들이 할 수 있는 가장 강한 말**입니다. 큰 awk 한 판(봉인 포함)은 그대로 가드 안에 두고 — truth가 없으면 봉인할 것이 없는 게 맞습니다 — truth 개수와 논리적 의존이 없는 셋을 밖으로 뺐습니다: `required_tags` 커버리지 · index/tree 존재 + 집합 대조 · coverage 교차검사. census 쪽 조기 return도 같이 고쳤습니다(방어자가 **바로 이 상태를 위해 쓰인 도달 불가 arm**을 코드에서 찾아냈습니다 — 미완성이라는 코드 자신의 증언).

부수로 `tsrcpairs` awk가 빈 글롭을 리터럴 파일명으로 받아 **fatal로 죽던 것**도 막았습니다.

### census 셋 — 반드시 한 판에

- **S5 분자/분모가 서로 다른 모집단**을 셌습니다. 존재하지 않는 자료의 절(`## m099`)이 분자에 들어가 `2/2`(손계수 1/2), 반대로 밀면 `2/1`. 이제 **한 모집단**(실존 `converted.md` − retracted) 위에서만 셉니다.
- **S4 `## legacy`의 관대 철자**(`- m3` for `m003`)가 canon을 안 거쳐 retracted 스킵이 발화할 수 없었고, 분모가 **애초에 들어있지도 않은 자료를 두 번 차감**했습니다. 장부는 닫혔다고 읽히는데 살아있는 자료가 기록을 하나도 안 갖고 있었습니다.
- **S6 지울 수 없는 ✗**: `n_legacy == 0`이 "하나도 파싱 못 함"과 "전부 파싱된 뒤 retracted라 스킵됨" 두 상태에서 똑같이 나와, 규정 서식 그대로 쓴 줄을 "malformed"라고 했습니다. 처방은 "이미 쓴 대로 쓰라"였습니다. 파싱 개수(`n_legparsed`)를 따로 셉니다.
- **`numerator exceeds denominator` ✗의 서술도 다시 썼습니다** — 두 원인 중 하나는 이제 발생 불가(그 절은 아예 안 세어짐)라, 있을 수 없는 원인을 대는 문장이 두 독자를 없는 문제 찾기로 보냈습니다.

### S2 — 도구의 유일한 쓰기가 파일을 훼손하면서 성공을 보고했습니다

`.11`이 넣은 행미 보존이 **닫는 `]`가 없을 때** `sub()`가 아무것도 못 벗겨 `tail`에 원본 줄 전체가 남았고, `tags: [위약` → **`tags: [벌칙]tags: [위약`**. 이제 `sub()`의 **반환값**을 봅니다 — 미닫힘이면 줄을 **그대로 둡니다**(건너뛰면 줄이 삭제되어 더 나쁩니다). 수리 경로는 validate에 새로 넣었습니다: 리스트꼴 필드의 대괄호가 그 줄에서 안 닫히면 이름을 부릅니다. (리뷰어 ②가 적은 "`pull`이 죽는다"는 방어자가 실측으로 정정했습니다 — 죽지 않습니다.)

### S3 — 여덟 번째 자리

`resolution` flow 객체의 `scope:`가 `.7`/`.9`의 키 철자 통일에서 빠진 마지막 한 자리였습니다. `scope : [금액]`이면 scope가 조용히 사라져 **READ.md를 따르는 소비자가 부분 대체를 전면 대체로** 읽습니다 — 반대 사실입니다. R4-C3가 이 객체의 일곱 자리를 닫았고 이것이 여덟 번째입니다.

**회귀**: 신규 16케이스(C1 차단 4 + 함정 대조 3 / C2 차단 2 / census 5 / S2 1 / S3 1), 전체 **151/151** 클린 와이프. 실광산 ✓ `255 sealed` · `coverage records 17/27` **둘 다 불변**.

## 2026-07-31.12

**Round 4 Human queue의 정책 결정 4건 — 사용자 재정.** 방어자가 "기계가 정할 수 없다"고 올린 것들이고, 넷 다 확정됐습니다. 이로써 R3·R4의 장부가 완전히 비었습니다.

### ① 판정줄이 계약입니다 (C2 등급 규칙 — 규칙 기록)

같은 모양을 두 라운드가 다르게 판정했습니다: R3-H1(`source :`)은 계정 줄이 `0 sealed ← 1 NOT checked`로 정직하다는 이유로 **high**, R4-C2(`--- `)는 전용 알람이 꺼졌다는 이유로 **critical**. 재정: **돌았어야 할 검사가 안 돌았는데 도구가 깨끗한 판정(`✓`, exit 0)을 찍으면 critical** — 옆의 계정이 아무리 정직해도. 근거는 소비자입니다. 스크립트는 exit code를, 지친 사람은 체크표시를 읽습니다. 계정 줄은 **정보**이지 보증이 아니라, 안 돈 막 위에 찍힌 초록을 낮춰 주지 않습니다. 특히 **막**(봉인·게이트)이 조용히 안 돈 경우는 무조건 critical. 양방향입니다 — 실제로 돌고 정확히 보고한 검사는 메시지가 불친절하다는 이유만으로 critical이 되지 않습니다(should-fix). `reviewers.md`의 등급 정의 바로 아래에 못박아 다음 방어자가 재론하지 않습니다.

### ② coverage는 장부 개수이지 완전성 보증이 아닙니다 (S4 — 라벨·문서)

`coverage 17/27`은 "17개 자료를 다 캤다"가 아니라 "17개 자료가 coverage.md에 기록을 최소 한 줄 갖는다"입니다 — 요소 50개 중 1개만 적어도 그 자료는 셉니다. 추출이 **완전한가**는 다른 축(gaps 스킬의 enumeration·symmetry, truths verify 레인)이 이미 소유하고 있고, 그 판정을 census에 중복시키면 **한 질문에 판사 둘** — 이번 두 콜드 라운드가 계속 잡아낸 그 모양을 새로 만드는 셈입니다. 그래서 검사를 늘리는 대신 **오독할 수 없게 이름을 붙였습니다**: `coverage records 17/27 material(s)`. FORMATS·README에 "장부 개수이지 보증이 아니다"와 완전성의 소유자를 명시했습니다.

### ③ 미치환 자리표시자를 거부합니다 (좁게)

`tone: {the project tone, copied here, …}`가 "값이 있음"으로 통과하고 **write가 그 안내 문장을 문서의 톤으로 읽었습니다**. review.md 항목은 처음부터 미터치 템플릿 규칙(`is_noise`)이 있었는데 frontmatter 필드에는 없었습니다. 이제 필수 필드의 값이 **통째로 중괄호 한 덩어리**면 거부합니다.

- **좁습니다**: 값이 중괄호를 *포함*만 하는 것은 실제 내용이라 안 건드립니다(`tone: {담백} 유지` 통과). 자리표시자 **목록**(`tags: [{tag1}, {tag2}]`)은 `[`로 열려 대상이 아닙니다. 탈출로는 메시지가 말합니다 — 중괄호 밖에 아무 문자나 두면 됩니다.
- **판사는 하나**: 패턴이 schema(`fm.placeholder`)에 있고 셸 쪽 `req_value()`와 truth를 읽는 awk가 **같은 값을 읽습니다**. R4가 세 번 연속 잡아낸 "규칙은 통일했다는데 자리가 빠졌다"를 이번엔 만들지 않았습니다. 적용은 project·material·truth·plan 네 종 전부.

### ④ 인계철선 관할은 kind를 품은 내용까지 (S1 — 현행 유지, 근거 기록)

"주석 안은 설계상 안 보인다"의 예외인 중간-화살표 인계철선의 관할을 **kind를 품은 내용**으로 확정했습니다. 산문 메모만 삼킨 중간-닫힘은 계속 침묵합니다 — 게이트의 보증 대상은 위반이고, 메모 손실은 보증을 깨지 않습니다. 모든 중간-닫힘으로 넓히면 보관 노트 속 `-->` 하나하나가 오류가 되어 그 소음이 이 검사가 존재하는 단 하나의 신호를 흐립니다. 코드 주석에 재정과 근거를 남겼습니다.

**회귀**: 신규 5케이스(자리표시자 3종 차단 + 중괄호 포함 값 통과 + 자리표시자 목록 무영향), 전체 **135/135** 클린 와이프. 실광산 ✓ `255 sealed` 불변 — **자리표시자 검사의 거짓 차단 0건**, coverage는 라벨만 `coverage records 17/27`로 바뀜.

## 2026-07-31.11

**nice급 잔여 12건 전부 — 콜드 라운드 3·4의 확인 목록이 이것으로 비었습니다.** 남은 것은 Human queue의 정책 결정 4건(사용자 몫)뿐입니다.

### 숫자의 정직 (R3-N1·N2, R4-N3·N4·N5)

- `status`의 materials가 **폴더 수**, validate가 **converted.md 수**를 세서 같은 광산에서 2 vs 1 → 한 정의(디스크의 converted.md)로 통일하고, 폴더 수가 다르면 그 차이를 **보여줍니다**("N folder(s) without converted.md — validate names them").
- 소유권 태그 없는 `- [open]`이 총계엔 들고 3버킷·untagged 어디에도 없어 `open 5 — 2·1·1`처럼 합이 조용히 어긋남 → 나머지를 "N missing an ownership tag (validate rejects these)"로 표시.
- census의 index 교차검사가 **개수만** 비교해 매달린 항목과 미색인 파일이 상쇄 → **집합 비교**로: 양쪽을 각각 id로 지목합니다.
- 같은 자리의 처방이 해소 불가 루프였던 것(frontmatter 없는 파일은 reindex가 영원히 못 봄)도 함께: "돌아오면 validate가 거부하는 파일이다 — validate를 돌려라"로 안내가 이어집니다.
- 합계 가드 메시지에 가장 흔한 셋째 원인(enum 밖 status) 병기.

### 도구의 손버릇 (R4-N2, R3-N3·N6)

- `retag`가 재작성 줄의 **행미 YAML 주석을 말없이 지움** → 닫는 대괄호 뒤는 그대로 태웁니다.
- 봉헌 멤브레인 실패 메시지에만 복구 처방이 없던 것 → kind별 수리(refine)→재review, 또는 final 제거; "review.md에서 위반을 지워서 닫지 않는다"까지 명시.
- 편측 충돌 처방이 계단식(따르면 다음 오류가 한 단계 더) → 두 요건(상호 conflict_with + 양쪽 status conflict)을 한 메시지에.

### 문서가 비운 자리 (R3-N4·N5·N8, R4-N6)

- plan status `done`에 도달하는 지시가 어디에도 없던 것 → refine 9단계가 유일한 작성자로 명시.
- refine의 "fixed" 기록 vs adjudications enum `{dropped|accepted}` → enum을 `{fixed|dropped|accepted}`로(fixed는 역사, 나머지는 억제).
- final의 prior-doc 재진입 **주체·시점** 불명 → refine은 봉헌만; 등록은 **그것을 잇는 다음 문서의 plan**(continues 단계)이 gather로 라우팅. 아무도 안 잇는 final은 등록되지 않는 것이 정상.
- `corroborated_by` 합의를 인용할 손잡이가 없던 것 → 손잡이는 **truth id 자신**임을 명문화: 문서는 truth를 인용하고 가시 인용에 합의 자료들을 병기, 게이트는 그 주장이 인용된 truth의 claim이므로 통과. "m003도 동의한다"를 **별도 무인용 문장**으로 쓰는 것이 게이트가 정당하게 잡는 형태.

부수: 회귀 하네스의 무동작 tone 치환(R4-N1)도 고쳐 `pass_shipped_templates`가 tone 항목을 실제로 덮습니다(치환 발화를 grep으로 강제).

**회귀**: 신규 4케이스, 전체 **130/130** 클린 와이프. 실광산 ✓ `255 sealed`·census 255/255·status `materials: 27`(validate와 동일 정의) 전부 불변.

## 2026-07-31.10

**Round 4의 should-fix 13건 전부.** 코드 6건(S1~S6) + 문서·스킬 7건(S7~S13). 이로써 R4 확인 22건 중 남은 것은 nice 6건뿐입니다.

### 코드

- **S1 — 중간-화살표 인계철선의 실제 한계가 명시보다 넓었습니다.** 편집 둘: (1) 계수 술어가 `gate_entry`(정확한 항목)만 세서, 근사 안내가 "위반을 쓰려던 줄"이라 부르는 근사-kind·`#`번호 모양은 삼켜져도 0으로 침묵 → kind를 품은 모양 전부를 세도록 확장. (2) awk가 닫는 줄의 화살표 **앞** 조각을 내부(`I`)로 방출하지 않아 항목이 닫는 줄 자체에 있으면 계수 0인 채 C 이벤트를 만남 → 방출 추가. `.6`의 한계 문장에 정정 표기를 달았습니다.
- **S2 — 따를 수 없는 처방.** `-->`로 시작하는 줄은 kind가 정확해도 "kind를 고치라"로 차단됐습니다 — 고칠 것이 없는 처방. 이제 화살표가 원인임을 말하는 전용 분기가 있습니다.
- **S3 — `source:`가 관대한 해소를 안 거치는 유일한 참조였습니다.** `.2`의 마이그레이션 안내("폴더만 정규화, 참조는 그대로")가 이 필드에 대해 거짓이었고, 안내대로 하면 truth마다 실패하며 **그동안 봉인이 돌지 않았습니다**. `source`(와 coverage의 자료·truth id 키 전부)를 다른 참조와 같은 관대함으로 맞췄고, `.2`에 정정 표기를 달았습니다. 관대해져도 봉인은 약해지지 않습니다 — 해소된 자료의 본문 대조는 그대로입니다(`block_source_unpadded_dishonest`).
- **S4 — census coverage 분자가 기록이 아니라 제목을 셌습니다.** 빈 `## m002` 제목이 +1 — `## legacy`는 항목마다 ruled 날짜+인용 발화를 요구하는데 빈 제목은 아무 가드도 없이 같은 효과였습니다. 이제 절은 **본문 줄이 하나라도 있어야**(매핑이든 사유 있는 스킵이든 — map의 감사 기록) 셉니다. 절 id도 참조라 canon 후 중복 제거합니다.
- **S5 — census coverage 분모가 frontmatter 안 닫힌 자료를 조용히 뺐습니다.** `coverage 1/1`(ls는 2) 또는 원인 서술 둘 다 거짓인 `2/1` ✗. 이제 분모는 **디스크에서** 셉니다(존재하는 converted.md − retracted) — N_TRUTH·census 파일 수와 같은 규칙이고, 파싱 못 하는 파일은 스스로 retracted를 선언할 수 없으므로 자료로 남습니다. 파싱 문제 자체는 validate가 크게 빨갛습니다.
- **S6 — retracted 묘비가 `required_tag`를 충족시켰습니다.** 필수 주제의 마지막 실추출을 철회해도 광산이 그 주제에 대해 초록이었습니다. 이제 gaps 교리 그대로 **live truth만**(discarded도 retracted도 아님) 태그를 덮고, 메시지가 그 교리를 인용합니다("a tombstone is an extraction that never had standing").

### 문서·스킬

- **S7** — README 폴더 지도·map 스킬(truth 파일을 **만드는** 파일)이 아직 `t<N>` 무패딩 표기 → `t<NNN>`+예시로. material 템플릿의 `corrects: [{m<N> …}]`도 동반 정리. 전 배포 문서 무패딩 잔재 0 확인.
- **S8** — init §2의 reconfigure 분기가 검색 방패를 빠뜨림(§3 불릿은 "reconfigure에도"라 주장하는데 §2가 거기로 안 보냄) → §2가 두 멱등 가드(방패+CLAUDE.md 블록) 모두로 라우팅.
- **S9** — 입고가 MOVE가 된 지금 `source_path`의 정의가 빔 → origin별로 못박음: `file`은 **이동 전** 경로(중복 검사가 비교하는 값), 외부 복사는 원 경로, 비파일 origin은 비경로 핸들. gather 4단계에 "2단계가 옮기기 **전에** 기록하라" 병기.
- **S10** — plan 템플릿·FORMATS는 절 노트에 `materials: role·topics`, plan 스킬은 `truths by tags` — 그리고 `scope_tags`를 노트에서 수확하므로 템플릿을 따르면 **staleness가 영원히 안 발화**. 세 곳을 truth `tags` 어휘로 통일하고 이유(어휘가 다르면 트리거가 조용히 꺼짐)를 각 자리에 적음.
  > **정정 (2026-08-01.3, R5-S7)**: "세 곳 통일"은 **반쪽 거짓**이었습니다. plan 템플릿에서 고친 것은 예시 줄(`:20`)뿐이고, 같은 파일이 **지시하는** 설명 줄(`:13`, "materials by role and topics")은 옛 어휘로 남았습니다 — 그리고 사용자가 실제로 읽고 따르는 것은 그 설명 줄입니다. `.3`에서 닫았습니다.
- **S11** — reviewers.md에 severity 충돌 병합 규칙만 있고 **kind 충돌** 규칙이 없음(refine이 kind로 수리를 라우팅) → 증거 많은 진단 우선(contradiction > unsupported > missing-required), 밀려난 kind는 항목 산문에 남김.
- **S12** — 의미 기반 **DOWNGRADE**가 Human queue를 빠져나감(라우팅이 DROP에만 걸려 있는데 판정 집합은 KEEP/DOWNGRADE/DROP, strength 1에서 critical→should-fix 강등은 기능상 드롭) → reviewers.md·verify 스킬 둘 다 "drop **or downgrade**"로 확장. 이 규칙은 방어자 자신을 지배하는 메타 규칙입니다.
- **S13** — init이 자료가 0개인 시점에 `required_tags`를 채우라고 지시 → 지금 알면 묻고, 모르면 **명시적으로 유예**(빈 목록이면 completeness 설정이 기계적으로 무동작임을 사용자에게 말하고, gather/map이 후보를 제안·plan이 교차 확인). 침묵 유예가 문제지 유예 자체는 적법.

**회귀**: 신규 12케이스, 전체 **126/126** 클린 와이프. 실광산 ✓ `255 sealed` 불변 · coverage 17/27 불변(모든 절에 기록 있음 — S4가 실광산에서 아무것도 안 떨어뜨림을 확인) · required_tags 빈 목록이라 S6 무영향.

## 2026-07-31.9

**Round 4 콜드 라운드의 critical 3건.** 4관점 리뷰어 + 방어자 완주 결과는 FAIL(확인 22건)이었고, 그중 critical 셋을 여기서 닫습니다. 셋 다 같은 모양의 결함입니다 — **"판정 규칙을 하나로 합쳤다"는 이전 번들의 주장이 미완성**이었습니다.

### C1 — 게이트의 "유일한 판사"가 부르는 항목을 센서스가 안 셌습니다

`.5`가 `gate_entry`를 `is_noise` **위에** 쌓아 판정자를 통일했다고 했지만, 그 위의 entry-position 필터가 불릿을 `-`·`*`·`+` 한 글자로만 읽었습니다. 그래서 `is_noise`가 항목이라 판정하는 네 모양 — 마크다운 **번호 목록**(`1. [contradiction] …`), **인용문**(`> - […]`), 불릿 뒤 **비분리 공백**(워드프로세서에서 붙여넣으면 남는 것), **닫는 대괄호를 안 친 항목** — 이 절 밖에 주차되면 아무도 안 셌습니다. 같은 줄이 절 안에서는 차단, 절 밖에서는 무존재 — 번들이 자기 자신과 모순했습니다. 이제 기준은 "대괄호 앞은 목록/인용 뼈대여야 한다"이고, 닫는 대괄호가 없으면 슬롯을 첫 공백에서 끊어 읽습니다.

**명시된 한계**: 대괄호 앞에 **단어**가 있는 줄(`- 3장 [contradiction] …`)은 여전히 안 셉니다. `- fixed: [contradiction] …`(닫힌 건의 기록)과 문자열 모양이 같아서 세면 후자가 거짓 차단됩니다. 이 한계는 `pass_gate_labelled_entry_outside` 케이스로 가시화해 두었습니다 — 절 안에서는 게이트가 둘 다 위반으로 잡으므로, 모호성은 절 밖에만 존재합니다.

> **은퇴 (2026-08-01.2, 구역 규칙)**: 이 한계와 그 아래 문단의 확장은 게이트 반전으로 **은퇴**했습니다. 구역 규칙 아래에서는 라벨 항목과 기록이 **둘 다 시끄럽게 차단**되고(메시지가 기록의 적법 철자 — 괄호 없는 kind — 를 가르칩니다), "모양을 세는" 판정 자체가 사라져 이 문단이 지키던 모호성이 존재하지 않습니다.

### C2 — 여는 `---` 뒤 공백 한 칸이 봉인 전체를 껐습니다

frontmatter가 **존재하는지** 묻는 두 자리(자료·truth)만 문자열 완전일치(`= "---"`)로 남아 있었고, **안을 읽는** 리더 전부는 `^---[[:space:]]*$`였습니다. `--- `(뒤 공백)로 연 자료는 "never closed" 전용 경보가 꺼지고 → 봉인이 0회 실행 → 날조 본문이 `✓ all checks passed`. truth 쪽 쌍둥이는 반대로 **멀쩡히 파싱되는 파일**을 "not read as a truth at all"이라는 세 절이 전부 거짓인 메시지로 차단했습니다. 이제 `has_fm()` 하나가 여는 fence의 유일한 판정자입니다.

### C3 — flow 객체 안 키가 `.7` 통일에서 빠졌습니다

`.7`이 frontmatter 키의 콜론 앞 공백을 관대화했는데 `resolution: {…}` **안의** 키 4종(type·decision_kind·decided_by·winner)을 읽는 일곱 자리는 그대로였습니다. `{type : pick}`처럼 쓰면(적법 YAML) 보이는 반쪽은 거짓 메시지("resolution has no 'decided_by'" — 있는데)였고, 숨은 반쪽이 더 나빴습니다: `decided_by:`만 정규형이면 **enum 밖 type + enum 밖 decision_kind + 실재하지 않는 truth를 가리키는 winner가 전부 `✓`로 통과** — winner 실재 검사를 만든 이유였던 바로 그 사고의 복원이었습니다. 일곱 자리 전부(`match` 5곳 + pull의 `grep -oE` 2곳) 같은 관대화로 맞췄습니다.

**회귀**: 신규 13케이스(C1 차단 4 + 통과 2 + 절-안 대조 1 / C2 차단 2 + 통과 2 / C3 차단 1 + 통과 1, 기존 `block_resolution_by`의 핀도 거짓 분기와 구분되게 좁힘). 전체 **114/114** 클린 와이프. 실광산 ✓ `255 sealed` · census 255/255 · pull의 winner 경로(`winner: t063` 실물) 정상.

## 2026-07-31.8

**S1·S2·S3 — Round 3의 should-fix 세 건.** 이로써 R3의 critical 4 · high 2 · should-fix 3이 전부 닫혔고, 남은 것은 nice 7건뿐입니다.

### S1 — 유일한 쓰기 명령이 봉인된 데이터를 훼손하고, 그 결과로 사람을 지목했습니다

`retag`의 치환 패턴이 **프런트매터 경계를 안 봤습니다.** 그래서 본문이 리스트 필드 모양의 줄(`tags: [위약, 대금]`)을 인용한 truth — FORMATS가 "정확한 문구 자체가 사실인 경우"(코드·설정·YAML 조각)에 권장하는 바로 그 형태 — 는 그 **인용문이 말없이 재작성**됐습니다. 다음 validate는 도구 자신의 편집을 보고 `quote not found … (laundering risk)`라며 사용자를 날조 위험으로 지목했습니다. 이제 선행 `--- … ---` 블록 안에서만 치환합니다. 키 철자는 `.7`에서 통일한 관대한 규칙을 그대로 씁니다.

### S2 — 자료가 안 읽힌 것을 truth의 날조로 보고했습니다

converted.md의 frontmatter가 안 닫히면 그 자료의 body가 통째로 비고, 거기서 뽑은 truth 전부가 `laundering risk` + `seal FAILED`로 계수됐습니다. **추출은 멀쩡했고 자료가 안 읽힌 것**입니다. 이제 봉인은 그 자료가 실제로 파싱됐을 때(`mfmok`)만 돌고, 아니면 그 truth들은 **NOT checked**로 떨어집니다 — "봉인이 돌지 않았다"가 정확히 그 뜻입니다. 원인은 자료 자신의 prob이 지목합니다.

### S3 — 0바이트 truth 파일이 분모에서 증발했습니다

awk는 빈 파일에 레코드를 만들지 않으므로 `ntruthfile`이 그것을 세지 못했고, 파일이 **미검사로 뜨는 대신 모수에서 사라졌습니다** — 두 개짜리 광산에서 `truths 1 (1 sealed)`, 같은 순간 census는 `truth files 2`. 내용은 있고 frontmatter만 없는 파일은 세어져 NOT checked로 떴으니, **같은 결함 부류를 두 가지로 계수**하고 있었습니다. 이제 파일 수를 디스크에서 셉니다 — census와 같은 표현이라 두 명령이 truth 파일 개수를 두고 다시는 다른 답을 낼 수 없습니다.

**회귀**: 신규 3케이스(본문 인용 불변 + 프런트매터는 여전히 치환 / 자료 미닫힘에 laundering 부재·NOT checked / 0바이트 파일이 분모에 잡히고 census와 일치). 전체 **101/101**(쓰기 경로·계정 변경이라 전량 재실행). 실광산 재확인 ✓ `255 sealed`, validate·census의 파일 수 255 일치.

## 2026-07-31.7

**H1 — 적법한 YAML 철자 하나가 봉인을 통째로 끄던 것을 닫았습니다.** Round 3의 마지막 high입니다.

프런트매터 필드 리더들은 `^key:[[:space:]]`로 키를 알아봤습니다 — 콜론 **앞** 공백을 금지하고 **뒤** 공백을 요구하는 모양입니다. 그래서 YAML이 적법이라 부르는 두 철자(`source : m001`, `source:m001`)가 **키 census와 `fm()`은 통과하고 리더만 못 읽었습니다.** `source`에서 그 결과는 조용하고 전면적이었습니다: 봉인이 `tsrc!=""`로 감싸여 있으니 **0회 실행**되고, 날조 본문이 `status: ok`로 들어가고, 판정은 ✓였습니다. 게다가 독자가 갈렸습니다 — `fm`·`impact`는 같은 파일을 `m001`로 읽고, 큰 awk·reindex·pull·coverage는 빈 값으로 읽어 index.md에 `- t001: … []`를 썼습니다. 다른 키들은 시끄럽게 실패했기 때문에(안 읽힌 `status`는 빈 enum으로 뜹니다) **조용했던 건 `source` 하나**였습니다.

이제 다섯 개 awk의 필드 패턴 30줄 전부가 `^key[[:space:]]*:` — **키 census와 `fm()`이 원래 쓰던 바로 그 모양**입니다. 한 개념(프런트매터 키를 알아보는 법)에 철자 규칙 하나.

**회귀**: 신규 3케이스 — `source : m001`·`source:m001`에 날조 본문 → 봉인이 돌아 `quote not found` 차단, 정직한 truth에 세 키(`source :`·`status:ok`·`tags :`) 혼합 철자 → 통과 + census `live 1`. 전체 **98/98**(리더 변경이라 전량 재실행). 실광산 재확인 ✓ `255 sealed` 불변.

**인접 미수정(기록)**: 같은 부류가 한 층 아래에도 있습니다 — `resolution: {type : pick}`처럼 **flow 객체 안**의 키는 `match(rv,/type:[[:space:]]*…/)`가 못 찾아 enum 검사가 조용히 건너뜁니다. 파서가 여럿(awk match 3벌 + pull의 셸 grep)이고 프런트매터와 다른 표면이라 별도 판으로 둡니다.

## 2026-07-31.6

**C2 — 마지막 게이트 우회를 닫았습니다. Round 3의 critical 4건이 전부 닫혔습니다.**

사고의 모양: 보관용 `<!--`를 열고 닫는 걸 잊었는데, 한참 아래 산문의 화살표(`정정 흐름: 초안 --> 검토`)가 그것을 우연히 닫습니다. 사이의 **완전 정규형** 위반 항목들이 통째로 사라지는데 — 선언절 생존검사는 **제목**이 안 삼켜져서 침묵하고, comment_balanced는 파일이 주석 *밖에서* 끝나서 침묵하고, 센서스와 fid_body는 둘 다 nocomment를 거치므로 항목이 이미 없습니다. 특수 서식이 하나도 필요 없는 우회였습니다.

**판별자는 닫는 화살표의 모양입니다.** 내부만 봐서는 구분이 원리적으로 불가능합니다 — 적법한 보관이란 게 바로 "raw엔 있고 strip 후엔 없는" 상태이기 때문입니다. 갈리는 것은 닫는 쪽입니다: 의도된 보관은 `-->`가 줄을 끝내고, 사고의 닫힘은 산문이라 화살표 **뒤에 글이 이어집니다**. 그래서 규칙이 이렇게 명시됩니다 — **항목을 담은 주석 보관은 닫는 `-->`를 줄 끝에 둔다** — 그리고 그 규칙이 오류 메시지의 후반부입니다("보관이 의도라면 닫는 화살표를 제 줄에 두라"). 항목 판정은 C1의 `gate_entry`를 그대로 재사용해 판사를 늘리지 않았고, 주석 구역 해부는 nocomment와 같은 상태기계를 씁니다.

**한계 명시**: 우연히 `-->`로 *끝나는* 산문 줄은 보관 닫힘과 구분 불가라 여전히 조용히 삼킵니다. 주석 내부 불가시는 다른 모든 곳에서 여전히 설계이고, 이것은 실제로 뚫린 그 한 모양에 놓은 인계철선입니다.

> **정정 (2026-07-31.10, R4-S1)**: 위 한계 서술은 당시 실제 한계보다 좁았습니다. (1) 계수 술어가 `gate_entry`뿐이라 근사-kind·`#`번호 모양 — 근사 안내가 "위반을 쓰려던 줄"이라 부르는 바로 그것 — 은 삼켜져도 0으로 세어져 침묵했고, (2) 닫는 줄의 화살표 **앞** 조각을 내부로 방출하지 않아 항목이 닫는 줄 자체에 있으면 계수가 0인 채 C 이벤트를 만났습니다. 둘 다 `.10`에서 닫혔습니다.

**회귀**: 신규 2케이스 — R3 재현 픽스처 그대로(정규형 항목 2건 + 산문 화살표) 차단, 주석 없는 산문 화살표 통과. 기존 보관 통과 3케이스(`-->`가 제 줄) 불변. 전체 **95/95**.

## 2026-07-31.5

**C1 — 항목 센서스가 게이트 자신의 판사로 셉니다.** Round 3의 남은 critical 두 건 중 하나를 닫습니다.

파일 전역 센서스는 "게이트가 못 보는 자리에 주차된 위반"을 잡는 바닥인데, 자기만의 정규식(`- \[` 정확히 한 칸)으로 세고 있었습니다. 게이트의 판사 is_noise는 **불릿 모양과 무관하게** 대괄호 줄을 항목으로 판정하므로 두 판사가 어긋났고, 그 틈으로 `* [contradiction]`·두 칸 불릿·탭·불릿 생략이 절 밖에서 `✓`와 공존했습니다 — 렌더링은 정규형과 똑같은데도. "shape-independent floor"라고 주석에 썼던 검사가 실은 모양 의존이었던 것입니다.

이제 정규식이 없습니다. `gate_entry()`가 **is_noise를 그대로 호출**하고, 파일 전역 계수가 다른 원장을 합병하지 않도록 스코프 필터 둘만 얹습니다:

- **kind-보유** — 첫 대괄호 슬롯에 실제 kind가 있어야 셉니다. 없으면 권고절(`- [critical]`)과 Human queue(`- [open]`)가 위반으로 세어집니다.
- **항목 위치** — 대괄호가 줄을 열어야 합니다(불릿 허용). 아니면 adjudication 기록(`- fixed: [contradiction] …`)이나 kind를 **언급만** 하는 산문이 세어집니다. 줄 중간의 kind는 위반에 *대한* 말이지 위반이 아닙니다.

절 안 계수(vin)도 같은 판사를 쓰므로 두 계수가 "항목이란 무엇인가"에 대해 다시는 다른 답을 낼 수 없습니다. `.1`에서 소속을 잘못 잡았다가 바로잡은 `* [<Contradiction>]`(is_noise 항목인데 템플릿 규칙이 `- [<`만 봐서)도 이번에 실제로 닫혔습니다.

**회귀**: 신규 7케이스 — 별표·두 칸·탭·불릿 생략 각각 차단, `* [<Contradiction>]` 차단, adjudication의 kind 언급 통과, HQ 산문의 kind 언급 통과. 전체 **93/93**. eclypse는 documents/가 비어 있어 이 경로가 발동하지 않습니다.

**문서 정정(코덱스 외부 평가 채택분)**: README가 "git이 모든 OS에 제공하는 bash면 충분"이라 썼으나 `pull`의 `declare -A`는 **Bash 4+**를 요구합니다(macOS 기본 bash는 3.2이고, git이 bash를 제공하지도 않습니다). 요구 사항을 사실대로 좁혔습니다: Bash 4+ · GNU awk/sed — Git for Windows·리눅스가 기본 제공, macOS는 새 bash 설치 필요.

## 2026-07-31.4

**원시층에 검색 방패를 씌웠습니다** — 스킬을 거치지 않는 일반 세션의 content 검색이 `inbox/`와 `materials/*/source.*`를 **아예 검출하지 못합니다**.

`.3`의 이동은 재검출 문제를 풀었지만 원본은 여전히 `materials/` 안에 날것으로 있고, READ.md가 경고하는 바로 그 사고 — "raw grep은 폐기된 값과 미해결 충돌의 한쪽을 건네준다" — 는 프로토콜을 **읽은** 세션만 피할 수 있었습니다. 사용자 지적(2026-07-31): 스킬 없는 단순 질의에서도 원본이 검출 자체가 안 되게 하라.

**기제는 프로젝트 루트의 `.ignore` 한 파일입니다.** ripgrep 계열 검색(AI 세션의 기본 검색 도구 포함)이 git 여부와 무관하게 기본으로 존중합니다. `.gitignore`가 아닙니다 — 원본은 광산 기록의 일부라 **버전 관리에는 그대로 남습니다**. 의도적 경로 열람(verify의 원본 대조, 철회 감사)은 그대로 됩니다 — 그게 감사 경로니까요. 두 층이 이제 짝을 이룹니다: CLAUDE.md 블록은 "읽지 말라"고 **말하고**, `.ignore`는 블록을 안 읽은 세션조차 **찾을 수 없게** 만듭니다.

실증으로 확인했습니다: 방패 없는 픽스처에서 마커 검색 → 3파일 검출(source·inbox·converted), `.ignore` 추가 → **converted.md만** 검출, 하위 폴더에서 시작한 검색에도 상위 `.ignore`가 적용됨.

배선: init §3에 생성 단계(reconfigure에도 재보증, 설정된 `paths` 값 사용) · gather가 방패 부재 시 자가 치유(구식 광산이 다음 gather에서 자동 획득) · CLAUDE.md 블록에 원시층 취급 규칙 한 줄 · READ.md 규칙 1에 방패와 그 경계(`.ignore`를 무시하는 도구가 물어온 경우의 취급) 명시. CLI 무변경(bin md5 불변) — validate·census·gaps는 원래 inbox·source를 안 읽고, 셸 글롭·직접 경로는 `.ignore`의 영향을 받지 않습니다. 기존 광산 마이그레이션 = 파일 하나 추가가 전부.

## 2026-07-31.3

**inbox는 이제 대기열입니다** — gather가 inbox 파일을 자료 폴더로 **이동**합니다(복사도, 삭제도 아님). Round 3의 N7을 닫습니다.

문제는 "지울 것인가 남길 것인가"의 양자택일처럼 보였습니다: 지우면 흔적이 사라지고, 남기면 다음 gather가 같은 파일을 매번 새 입고로 재검출해 update-or-new 문답을 반복합니다. **결정(2026-07-31, 사용자): 둘 다 아니다 — 이동한다.** 원본은 바이트 그대로 `materials/<id>/source.<ext>`가 되어 converted.md 옆에 남고(철회 흐름이 보존을 전제하는 바로 그 감사 사본), inbox에는 **대기 중인 것만** 남습니다. 빈 inbox = 처리 대기 없음. 처리된 파일이 재검출될 길이 구조적으로 사라지고, 중복 검사는 이제 "지난 실행의 잔재"가 아니라 **같은 파일을 나중에 다시 떨어뜨린 의도적 재투입**만 잡습니다 — 물어볼 가치가 있는 경우만.

한 가지 경계를 같이 못박았습니다: 이동은 **inbox 안의 파일에만** 적용됩니다. 사용자가 가리킨 프로젝트 밖 원본은 계속 **복사**합니다 — 광산 바깥의 사용자 파일시스템을 옮기는 일은 없습니다.

CLI 변경 없음(gather는 스킬 지시문이고, validate·census·gaps는 inbox를 애초에 스캔하지 않습니다). 문서 세 곳(gather 스킬·README 폴더 다이어그램·WORKFLOW 표) 정합 갱신. 회귀 86/86 불변.

## 2026-07-31.2

**형식 변경입니다** — id는 이제 **세 자리 이상 0채움**이어야 합니다(`t001`·`t042`·`t1000`, 자료도 동일). Round 3의 H2를 닫습니다.

### 한 숫자에 철자는 하나

`t5.md`와 `t005.md`가 한 광산에 같이 있으면, 큰 awk의 id 색인들(상호성 `cwofn`/`rawof`, `norm2raw`, `retracted`)이 **정규화한 키 하나로 둘을 합쳐** 버립니다. 그래서 한 파일을 읽고 다른 파일을 보고하고, `pull`은 아무 말도 안 한 쪽을 usable로 내보냅니다 — `:757`의 메시지가 스스로 적어 둔 실패("pull reports the silent side as usable")가 그대로 일어납니다. 리뷰어가 재현한 광산은 `truths 3 (3 sealed)` / `✓ all checks passed`였습니다.

정규화 자체는 버그가 아닙니다 — `conflict_with: [t5]`라고 쓴 참조가 `t005.md`로 해소되게 하려고 일부러 넣은 관대함입니다. 진짜 문제는 **두 파일이 공존하면 그 참조가 원리적으로 답이 없는데 아무도 막지 않는다**는 것이었습니다.

**결정(2026-07-31, 사용자): 형식에 못박는다.** FORMATS가 id를 `t<N>`라고만 규정해 `t5`가 적법했던 자리를 `t<NNN>`(세 자리 이상 0채움)으로 좁혔고, `validate`가 파일명·폴더명을 정규형과 대조해 거부합니다. 그 대가로 **참조의 관대함은 그대로 둡니다** — 디스크에 철자가 하나뿐이면 `t5`가 가리킬 수 있는 파일도 하나뿐이므로, 관대함이 비로소 건전해집니다. FORMATS에 그 인과를 적었습니다.

규칙을 두 벌 만들지 않았습니다. `canon_id()` 하나가 "이 숫자의 정규 철자"를 정의하고, 해소기(`tfile_for`·`mdir_for`)와 검사기가 **같은 함수**를 씁니다 — 이름 규칙과 조회가 드리프트할 수 없습니다. 각 해소기에 흩어져 있던 `printf 't%03d'`/`printf 'm%03d'` 중복도 이 참에 접었습니다.

### 역호환 — 실광산 마이그레이션 비용 0

eclypse의 진실 255개·자료 27개가 **전부 이미 정규형**이라 이름을 바꿀 대상이 없습니다. 패치 바이너리로 돌려 id 관련 불평 0건·`255 sealed` 불변을 확인했습니다. 짧은 id를 쓰던 광산이 있다면 **파일명과 `id:` 필드만** 바꾸면 되고 참조는 손댈 필요가 없습니다(해소가 관대하므로).

> **정정 (2026-07-31.10, R4-S3)**: 위 마이그레이션 안내는 이 시점엔 `source:` 필드에 대해 거짓이었습니다. `source`는 관대한 해소기를 안 거치고 원시 문자열로 폴더명과 대조되는 유일한 참조여서, 안내대로 폴더만 정규화하면 truth마다 실패하고 **그동안 봉인이 돌지 않았습니다**. `.10`이 `source`(와 coverage의 id 키들)를 다른 참조와 같은 관대함으로 맞춰 이 안내가 그때부터 참이 됩니다.

`index.md`/`tree.md` 같은 생성 파일은 글롭(`t[0-9]*.md`)이 애초에 배제하고, 숫자가 아닌 이름(`t1abc.md`)은 이 검사의 대상이 아닙니다 — 이름 규칙 전반의 강제는 별개 사안입니다.

### 회귀

신규 5케이스(`t5` 차단 / `t0001` 과다패딩 차단 / 자료 `m5` 차단 / `t1000` 통과 / 생성 파일 오판 없음) + 기존 짧은 참조 케이스 2개(`winner: [t5]`·`cited_truths: [t5]`가 `t005.md`로 해소되어 통과)로 관대함 보존 확인. 전체 **86/86**.

이 판에서 도구가 제 실수도 하나 잡았습니다 — 템플릿 자리표시자를 `t{N}`→`t{NNN}`로 바꾸자, 템플릿을 **문자 그대로 채우는** 회귀 케이스가 즉시 실패했습니다. 배포 템플릿을 그대로 쓰는 사용자가 겪을 일을 그 케이스가 대신 겪은 것이라, 테스트를 새 자리표시자에 맞췄습니다.

## 2026-07-31.1

**Round 3 콜드 검토(4관점 + 방어자)는 FAIL입니다** — 확인 17건(critical 4 · high 2 · should-fix 3 · nice 8), `consecutive_passes 0/2`. 계정 축은 critical 0, 문서 축은 코드 0회 열람 완주, 봉인 막은 20여 각도 전부 방어. 뚫린 것은 게이트 4건입니다. 이 판은 그중 **C3·C4 둘**을 닫습니다 — 둘은 뿌리가 같아(is_noise가 잡음이라 부른 줄 안의 실패한 위반) 한 검사로 묶이고, 각각 사용자 결정을 받은 뒤 순서대로 처리했습니다. **C1·C2는 아직 열려 있습니다.** C1은 세 번째 판정자(항목 census)의 문제라 별도 판으로 가고, C2는 독립입니다. 한 판에 여러 뿌리를 동시에 건드리다 새 결함을 넣은 이력이 이 저장소에 두 번 있습니다.

### C3·C4 — 위반을 쓰려다 실패한 줄이 조용히 사라지던 두 경로를, 이름으로 불러 세웁니다

두 결함의 증상은 같습니다: **사람 눈에는 위반 목록이 그대로 보이는데 게이트는 빈 절을 읽습니다.** 뿌리도 하나로 묶입니다 — `is_noise`가 "항목이 아니다"라고 판정한 줄 중에, **대괄호 슬롯에 실제 kind가 들어 있는** 것이 있습니다. 그건 누군가 위반을 쓰려 했다는 증거입니다.

`is_noise`는 **건드리지 않았습니다.** 게이트의 항목 판정은 불변이고, 새 검사는 그 판정이 "잡음"이라 부른 줄만 들여다보며 더 좁은 질문 하나를 던집니다. 판정자를 늘리지 않으려고 두 검사를 한 루프로 합쳤습니다.

**C4 — `#`로 시작하는 줄은 무조건 버려졌습니다.** `is_noise`의 첫 규칙이 `#`로 시작하는 모든 줄을 잡음으로 처리하는데, 그 규칙의 목적은 **제목** 걸러내기입니다. 그런데 `fid_body`가 진짜 제목을 이미 버리고 넘기므로, 그 규칙이 실제로 먹는 것은 `#1 [contradiction] …` 같은 **번호 매긴 항목**뿐입니다. 마크다운은 `#` 뒤에 공백이 없으면 제목으로 렌더링하지 않습니다 — 읽는 사람에게는 번호 붙은 위반 목록이 그대로 보입니다.

**C3 — 근사-kind가 "미작성 템플릿"으로 침몰했습니다.** kind 판정은 열거값과 **정확히** 일치할 때만 항목이고, `- [<`/`- [{`로 시작하는 나머지는 전부 미작성 템플릿이었습니다. FORMATS가 문자 그대로 인쇄하는 꺾쇠 서식에서 대문자 하나(`- [<Contradiction>]`)·공백 하나(`- [<missing-required >]`)·kind 병기(`- [<contradiction / unsupported>]`)가 **차단을 침묵으로** 뒤집었습니다. 대조군이 결정적입니다 — 꺾쇠만 떼면(`- [Contradiction]`) 정상 차단됐습니다.

**결정(2026-07-31, 사용자): 짐작하지도, 조용히 버리지도 않는다 — 무엇을 쓰라고 말한다.** 슬롯을 소문자로 접고 다듬었을 때 실제 kind가 *들어 있으면*, 실패한 방식에 따라 각각 지시합니다 — `#` 줄에는 "`- `로 시작하라", 근사-kind에는 "정확한 kind 하나로 고쳐라". 봉헌 전에도 잡고, 절 밖에 주차돼 있어도 잡습니다(파일 전체, nocomment 경유 — 주석 보관은 침묵). 미작성 템플릿·권고절 항목·kind 없는 `#` 산문은 슬롯에 kind 문자열이 없어 그대로 통과합니다.

**한계 명시**: 슬롯에 kind가 부분 문자열로도 없는 완전 오타(`- [<contradicton>]`)는 여전히 템플릿으로 낙하합니다 — 판별자가 "kind를 쓰려 했다"는 증거를 요구하기 때문입니다.

### 회귀·확인

신규 9케이스 — C3: 대문자·공백·병기 차단 / 절 밖 변형 차단 / 주석 보관 통과. C4: 번호 항목 차단 / 절 밖 변형 차단 / 주석 보관 통과 / kind 없는 `#` 산문 통과. 전체 **81/81**. Round 3 리뷰어의 원래 재현 픽스처(`#1 [contradiction]` 두 줄)를 패치 바이너리로 다시 돌려 두 줄 모두 이름으로 불러 세우는 것까지 확인했습니다.

이 과정에서 제 테스트 1개의 설계 오류도 잡았습니다 — `* [<Contradiction>]`(별표 불릿)은 is_noise가 **항목**으로 판정하는 모양이라 C3가 아니라 **C1(census 불릿 의존)의 잔여 통로**이며, C1 수정에서 닫혀야 합니다. 처음엔 이 케이스를 C3 테스트로 넣었다가, 실패를 보고 소속을 바로잡았습니다.

eclypse는 `documents/`가 비어 있어 이 검사가 발동하지 않습니다(문서 루프 안의 추가 검사).

## 2026-07-30.14

**Round 2가 남긴 것을 닫았습니다 — 직전 다섯 판이 스스로 넣은 critical 3건과, 선재 critical 6건.** 열 자리를 고쳤고 **한 번에 하나씩** 고친 뒤 각각 양방향으로 확인했습니다. 이번 판의 전제는 하나입니다: 확인 없는 "고쳤다"를 쓰지 않는다.

### 회귀 스위트를 먼저 만들었습니다 (그리고 이번엔 살아남습니다)

지난 두 라운드의 하네스는 `/tmp`에 있다가 세션마다 사라졌고, 그래서 매 라운드가 같은 표를 다시 만드는 값을 치렀습니다. 이번 것은 `notes/regress.sh`(gitignore, 배포 제외)에 있습니다. **72 케이스** — 막아야 하는 것 43, 통과해야 하는 것 22, 계정(`examined:`) 7. 케이스마다 자기 픽스처 사본에서 돌고, 마지막에 결과를 전부 지운 뒤 최종 코드로 처음부터 다시 돌렸습니다: **72/72.**

만들자마자 **제 케이스 3개가 틀렸다는 것부터 드러났습니다.** 주석 안 제목 케이스는 `<!-- # 제목 -->`을 한 줄로 써서 정작 재현하려던 결함(여러 줄 주석 안의 제목)을 재현하지 못했고, 짧은 본문·이어붙인 인용 케이스는 **coverage 미등록이라는 엉뚱한 이유로** 차단되면서 "막혔다"를 참으로 만들고 있었습니다. 기대 문자열을 실제 진단 문구로 좁히고 나서야 baseline이 정직해졌습니다 — **58 통과 · 12 실패**, 그 12건이 전부 실재하는 결함이었습니다.

### 게이트 — 제목 모양으로 우회하는 길을 형태와 무관하게 닫았습니다

- **형제 절 이름이 더 깊은 레벨에 있으면 절이 거기서 끊겼습니다.** `.11`이 넣은 종료자가 이름을 **레벨과 무관하게** 존중해서, `# Fidelity violations` 다음에 `## Findings` 한 줄만 넣으면 그 아래 열린 위반이 게이트가 읽는 범위 밖으로 나가고 `final.md`과 함께 `✓`가 나왔습니다. 이제 **그 파일이 형제 절을 쓰는 레벨**(형제 이름이 나타나는 가장 얕은 레벨)을 먼저 재고, 그보다 깊은 형제 이름은 하위 헤딩으로 절 안에 남깁니다. `.11`이 고쳤던 모양(형제가 전부 `##`)은 그대로 끊깁니다 — 그 파일의 형제 레벨이 2이기 때문입니다.
- **레벨로는 판정 불가능한 경우가 남습니다**: 형제가 `##`인 파일이 `#` 위반절 **안에** `## Findings`를 심으면 정상 배치와 **문자열이 동일**합니다. 그래서 절을 읽지 않는 **파일 전체 항목 계수**를 넣었습니다 — 주석을 제거한 파일 전체에서 실제 kind를 가진 항목 수와, 절 리더가 본 수를 비교해 다르면 하드 실패입니다. 지금까지 제목 모양으로 우회하던 길(하위 헤딩·두 번째 제목·읽을 수 없는 제목)이 **한 자리에서** 걸립니다. 권고 `- [critical]`과 미작성 `- [{kind}]`는 항목이 아니므로 세지 않습니다 — `is_noise`의 판정과 같습니다.
- **두 독자가 서로 다른 파일을 읽고 있었습니다.** `dup_section`은 원문을, `fid_body`는 `nocomment`를 거쳐 읽었습니다. 그래서 제목이 **닫힌 주석 안에만** 있으면 앞은 "게이트를 돌릴 수 있다"고 하고 뒤는 빈 절을 읽어 **통과**했고, 반대로 지난 라운드를 제목째 주석에 보관하면 "제목이 둘"이라 **영구 차단**되면서 안내대로 합치면 닫힌 위반이 되살아나 또 막혔습니다 — 적법한 파일에 탈출로가 없었습니다. 이제 둘 다 `nocomment`를 거칩니다. `verify.sections`의 존재 확인도 같은 이유로 같이 옮겼습니다(주석 처리한 절이 요구를 충족시키고 있었습니다).
- **늦게 닫히는 주석.** `comment_balanced`는 파일이 주석 안에서 *끝나는지*만 봅니다. 산문의 화살표(`초안 2장 --> 3장`)가 뒤에서 우연히 닫아주면 균형은 맞고 그 사이만 사라집니다. 주석 안의 보관 이력은 **적법하고 앞으로도 적법해야 하므로** 판정 기준은 "무엇이 주석 처리됐나"가 아니라 **"이 파일이 선언한 절이 주석 제거 후에도 살아 있나"** 입니다 — 원문에 있는 `review.sections` 제목이 제거 후 사라지면 지적합니다.

### 봉인 — 두 구멍

- **한 토큰짜리 본문은 인용이 아닙니다.** `f8c2801`이 길이 게이트를 없애며 적은 근거("짧은 문자열 검사는 통과 쪽으로 틀리므로 잃을 게 없다")가 정확히 거꾸로였습니다. **통과 쪽으로 틀리는 것이 구멍입니다** — 본문이 `#`이나 `5천만원`이면 `index()`가 거의 아무 자료에서나 찾아내 통과하고 `sealed`로 계수되며, 그 위의 claim은 무엇이든 쓸 수 있었습니다. 대체물은 재는 것이 아니라 **세는 것**입니다: 공백으로 나뉜 **토큰 수**는 로케일이 달라도 같은 값입니다(길이 게이트를 없앤 원인이 `length()`의 로케일 의존이었습니다). 줄별이 아니라 **본문 전체**로 판정합니다 — 표를 축자 인용하면 `|---|---|` 같은 한 토큰 줄이 정당하게 들어갑니다.
- **줄마다 축자인데 붙여 놓으면 원문에 없는 문장이 됩니다.** 봉인이 줄 단위 substring이라, 원문에서 멀리 떨어진 두 줄을 각각 통과시킵니다. 마크다운은 그것을 한 문단으로 렌더링합니다. 악의가 필요 없습니다 — 흔한 사고는 **중간 한정 줄을 빼먹은 인용**입니다. 본문 전체를 블록으로 한 번 더 대조하되 **공백을 접어서** 비교합니다(빈 줄 하나 더 넣은 인용까지 실패시키지 않으려고). 인접한 줄을 그대로 옮긴 정상 다중 줄 인용은 통과합니다.

### 나머지 넷

- **`paths` 비교가 문자열이었습니다.** `./materials`·`materials/./`·같은 폴더의 절대경로가 전부 "다른 위치"로 읽혔고, **같은 실행이 그 폴더의 자료를 전부 검사하고 있는데도** "여기 있는 것은 검사되지 않는다"고 exit 1로 말했습니다. 확인 가능하게 거짓인 차단 메시지는 없느니만 못합니다 — 스킬이 blocking으로 취급해 파이프라인이 유령 앞에서 멈춥니다. 실경로로 비교합니다.
- **자료 frontmatter가 안 닫히면 그 자료의 모든 truth가 "laundering risk"로 오진됐습니다.** truths awk는 frontmatter가 **닫힌 뒤에야** 자료 본문을 모으므로 본문이 통째로 비고, 그러면 그 자료에서 뽑은 truth가 전부 "인용이 원문에 없다"로 나옵니다 — 자료가 파싱되지 않았을 뿐인데 추출이 날조라고 말한 셈입니다. truth 쪽에는 전용 검사가 있었고 자료 쪽에는 없었습니다.
- **`resolution.winner`가 실재하는지 아무도 안 봤습니다.** id를 실은 필드 중 유일하게 존재 확인에서 빠져 있었고, 하필 **소비자가 따라가라고 지시받는** 필드입니다 — `pull`은 discarded truth의 독자를 전부 winner로 보냅니다. 오타 하나면 프로토콜 전체가 없는 truth를 가리켰습니다. 다섯 번째 필드로 같은 검사에 태웠습니다(`reason:` 산문 안의 id는 세지 않도록 winner 절만 훑습니다).
- **`pull`이 claim만 보여줬습니다.** 봉인은 body에 걸리는데 `index.md`·`tree.md`·`pull`은 claim을 렌더하고 READ.md는 소비자를 정확히 그 셋으로 보냅니다. 그래서 진짜 축자인 본문 위에 정반대의 claim이 앉아 있어도 소비자가 보는 모든 면이 claim에 동의합니다. 이제 usable 행에 **봉인된 본문 첫 줄**을 같이 찍습니다.

  **claim을 기계가 막을 수는 없다는 것도 확인했습니다.** 유일한 기계적 대리 검사(claim의 숫자가 본문에 있어야 한다)를 실제 광산 255개에 돌려보니 **21건(8%)이 거짓 실패**였습니다 — `4인`·`Phase 2`·`m001` 같은 정당한 조직 번호입니다. claim은 설계상 요약이므로 축자 검사 대상이 아닙니다. 그래서 기계는 **막지 않고 보여줍니다.**

### 문서 — 없는 명령을 시키던 자리

`README`·`WORKFLOW`·`FORMATS`·verify/map 스킬이 `.6`에서 되돌린 `audit` 레인을 여전히 지시하고 있었습니다(진입 순서, "세 개의 on-demand 레인", A2/A4/A6·A7 참조). 전부 걷어냈고 `WORKFLOW`의 "ten skills"도 실제 개수인 아홉으로 맞췄습니다.

**`examined:`를 설명하는 문서가 0줄이었습니다.** `sealed`·`tombstone`·`← NOT checked`·`gate-checked`가 무슨 뜻인지, 어느 숫자가 나쁜 것인지 사용자가 알 방법이 없었습니다 — 그 줄을 읽고 판단하라고 지시하는 문서는 있는데. README에 뜻과 읽는 법을 적었습니다.

**`tone`은 문서가 지시하는 기본 경로가 곧바로 validate 실패였습니다.** init·plan·plan 템플릿이 "비워라/상속하라"고 하고 schema는 필수입니다. 상속은 **plan 시점에 해소해서 값을 적는 것**으로 정리했습니다 — 적히지 않은 상속은 콜드 독자가 해소할 수 없습니다.

### 역호환

형식 변경 없음. **실제 광산(eclypse: 진실 255 · 자료 27)을 이 번들로 두 번 돌려 `✓ all checks passed`를 확인했습니다** — 255/255 sealed, 새 검사 어느 것도 거짓 실패를 만들지 않습니다. 새 검사가 실데이터와 만나는 지점을 미리 재봤습니다: 본문 토큰 최소 3(경계 2), 블록 대조 통과 255/255, `resolution` 45건의 winner 전부 해소, 자료 27개 전부 frontmatter 닫힘. `documents/`가 비어 있어 게이트 계열은 여전히 미발동입니다.

### 남긴 것 — 알면서 남긴 한계

- **두 토큰짜리 조각은 여전히 통과합니다.** 바닥을 "인용인가 아닌가"의 최소선에 뒀습니다(실제 광산 최소가 3토큰).
- **주석 안은 설계상 보이지 않습니다.** 늦게 닫히는 주석에서 잡아내는 것은 *선언된 절*이 사라진 경우뿐이고, 불릿만 삼킨 경우는 의도한 보관과 구분할 수 없습니다.
- **claim↔body 불일치는 사람이 보는 것으로 남습니다**(위 8% 측정).
- 수렴 루프 배선(`consecutive_passes` 검사 계층, 기준선 핀 저장 위치, `verify.md`를 `stale`로 만드는 주체 등)은 이번 판에서 건드리지 않았습니다.

## 2026-07-30.13

**채워진 위반 항목이 게이트에서 삭제되던 것을 고쳤습니다.** `.7`이 넣은 "두 번째 자리표시자" 규칙의 산물입니다.

그 규칙은 줄 어딘가에 `{…}`/`<…>` 쌍이 **두 번** 있으면 미작성 템플릿으로 판정했습니다. 그런데 실제 위반이 두 번째 쌍을 공짜로 제공합니다 — `- [<unsupported>] 2장 <각주 3> — 인용된 수치가 없다`, `- [<contradiction>] 3장 — 초안 <12%>는 t004(<10%>)와 모순`. 각주·수치·태그 이름을 각괄호로 감싸는 순간 완전히 작성된 위반이 사라지고 게이트가 통과했습니다. review 스킬이 지시하는 서식이 `- [<kind>] <where> — <what>`이라 각괄호를 남기는 습관 자체가 그 스킬에서 나옵니다.

**판별자는 대괄호 안이 실제 kind인가입니다.** 토큰 개수로는 두 경우를 가를 수 없습니다. `review.enum.kind`를 schema에 추가하고(`contradiction|unsupported|missing-required`) `is_noise`가 그것을 읽습니다 — 대괄호에 실제 kind가 있으면 각괄호를 남겼든 아니든 무조건 항목이고, 자리표시자 **이름**(`kind`)이 남아 있으면 템플릿입니다. kind는 게이트가 실제로 작동하는 대상이므로, 실제 kind가 없는 줄은 게이트가 처리할 수 있는 항목이 아니라는 판단이기도 합니다.

### 이 수정 안에서 두 번 틀렸습니다

둘 다 돌려봐서 잡았고, 둘 다 **읽어서는 맞아 보였습니다.**

- **처음엔 "자리표시자를 다 지우면 잔여물이 비어야 템플릿"으로 만들었습니다.** 게이트 13케이스는 전부 맞았는데, 배포 `gaps.md` 템플릿의 Accepted 줄이 자리표시자 사이에 리터럴 라벨(`scope:` · `recheck:` · `as-of:`)을 갖고 있어서 잔여물이 비지 않았습니다 → 그 템플릿이 항목으로 세어져 `gaps`가 `records 0` → `records 1`로 회귀했습니다. 두 판정자를 같은 줄 목록에 나란히 먹이는 대조표를 만들고서야 보였습니다.
- **`sed`의 줄 연결 `\`가 또 `
`으로 먹혀** sed가 `n`을 파일명으로 읽고 실패했습니다. 실패하면 잔여물이 빈 문자열이 되고, 그 규칙에서 빈 문자열은 "템플릿"이므로 **모든 줄이 삭제되고 게이트가 통째로 열렸습니다.** 이 세션에서 백슬래시가 먹힌 게 다섯 번째입니다. 한 줄로 다시 쓰고, 그와 별개로 이 자리는 실패 시 **항목 쪽으로** 떨어지게 했습니다 — 게이트의 판정자가 오류로 침묵하면 안 됩니다.

### `countlines`의 한계를 숨기지 않고 적었습니다

`is_noise`와 `countlines`는 기본 판정(대괄호가 자리표시자를 열면 템플릿)을 공유하지만, kind enum 재정의는 `is_noise`에만 있습니다. `countlines`는 호출자가 준 패턴으로 서로 다른 원장을 세고(coverage `## legacy` 항목은 대괄호가 아예 없고, gaps와 Human queue는 enum이 다릅니다) 읽을 절 컨텍스트가 없기 때문입니다. **결과를 명시합니다**: 실제 kind를 각괄호로 감싼 gaps 항목(`- [<reference>] t001 — …`)은 여기서 과소 계수됩니다. 닫으려면 호출자가 자기 enum을 넘겨야 하고, 그때까지는 공유 규칙이 아니라 알려진 한계입니다.

### 역호환

형식 변경 없음(`review.enum.kind`는 schema 추가이고 기존 값을 바꾸지 않습니다). eclypse에는 자리표시자 불릿이 `gaps.md`의 HTML 주석 안에만 있고 `nocomment`가 지우므로 출력이 동일하며, `documents/`가 비어 있어 게이트는 발동하지 않습니다.

## 2026-07-30.12

**Round 2 콜드 검토(4 관점)를 돌렸고 FAIL입니다.** `consecutive_passes` 0/2. 원시 발견은 56 → 19로 줄었지만 구성이 바뀌었습니다 — **critical 8건 중 6건이 직전 다섯 판이 넣은 것**이고, 그중 4건이 **그 판들이 만든 안전장치 자체**였습니다. 이번 판은 그중 계정 두 건만 고칩니다. 계정이 거짓이면 그 위의 모든 판정을 믿을 수 없고, Round 2 결과를 읽은 판단부터 흔들립니다.

### `sealed`가 "통과"라고 말하면서 "실행"을 셌습니다

`sealsrc`가 `index()`의 판정 **앞에서** 세팅되므로, 인용이 원문에 **없다고 확인된** truth가 `sealed`에 들어갔습니다. 묘비도 들어갔습니다.

이게 왜 심각한가 — WORKFLOW와 verify 스킬이 확인 화면에 이 문장을 쓰라고 **지시합니다**: *"축자 인용 존재는 validate가 N/N 확인 — 오탈자 검토는 불필요합니다."* validate가 내놓는 유일한 N/N이 이 줄입니다. 즉 계정이 **자기가 막으려던 거짓 기록을 생산**하고 있었습니다. 리뷰어 픽스처에서 실제 통과 9건인데 `11 sealed`가 찍혔습니다.

네 갈래로 쪼갰습니다: **통과 · 봉인 FAILED · 묘비(면제) · 미검사.**

```
truths 2 (1 sealed · 1 seal FAILED)        ← 실패가 통과에 섞이지 않습니다
truths 2 (1 sealed · 1 tombstone)          ← 묘비는 어느 쪽도 아닙니다
truths 2 (1 sealed ← 1 NOT checked)        ← 이제 이 표시는 "안 봤다"만 뜻합니다
```

묘비를 면제로 둔 것은 규격 때문입니다 — 철회된 truth의 인용은 원문에 **없는 것이 정상**이고(그 부재가 철회 사유입니다) 본문이 없는 stub도 적법합니다. 전에는 정상 묘비 하나가 깨끗한 광산에서 `← 1 NOT sealed`를 영구히 켰고, 그 표시를 설명하는 유일한 문서(이 CHANGELOG)는 그것을 "0으로 떨어뜨려야 하는 결함"으로 가르쳤습니다. 0으로 만드는 방법은 묘비를 지우는 것뿐이고 map 스킬이 그것을 금지합니다.

### `materials`가 진실 파일에 매달려 있었습니다

`N_MAT`이 truths awk의 부산물이었고 그 awk는 `t*.md`가 하나도 없으면 통째로 건너뜁니다. 그래서 **gather 완료 ~ map 시작 사이 — 모든 프로젝트가 반드시 지나는 구간 — 에서 자료를 전부 검사하고도 `materials 0`을 찍었습니다.** 같은 프로젝트에서 `status`는 `materials: 3`이라고 말했고, verify 스킬은 두 숫자를 **모두 인용하라**고 지시합니다. 리뷰어 셋이 독립적으로 찾았습니다.

이제 자료를 **검사하는 루프 안에서** 셉니다. `converted.md`가 없는 폴더는 세지 않고(그 자체가 별도 지적), `paths.materials`를 딴 곳으로 돌리면 정직하게 0입니다.

### 역호환

형식 변경 없음. eclypse는 묘비가 0개이므로 출력이 이전과 동일합니다.

### 남은 것 — 직전 다섯 판이 넣은 critical 4건

`is_noise`의 "두 번째 자리표시자" 규칙이 **채워진 항목**을 삭제(각괄호 토큰이 하나 더 있으면) · `fid_body`의 형제 절 종료자가 **더 깊은 레벨**에서도 발동 · `paths` 문자열 비교가 `./materials`를 거짓 차단 · 길이 게이트 제거로 `#` 한 글자 본문이 봉인 통과. 한 번에 하나씩 고칩니다.

## 2026-07-30.11

**봉헌 게이트의 마지막 알려진 우회를 닫았습니다.** Round 2 콜드 검토를 걸기 직전에 확인해 보니 B2가 열려 있었습니다 — `# Fidelity violations` 아래에 `## round 2` 같은 하위 헤딩 하나만 있으면, 그 아래 열린 위반과 `final.md`이 공존하는데 `✓ all checks passed`가 나왔습니다. 계정은 `1 gate-checked`라고 정직하게 말했습니다: 게이트가 **돌았고**, 절을 비었다고 읽었습니다.

원인은 종료 조건이었고, **양쪽 다 틀렸습니다.** 이 파일은 두 선택지를 각각 한 번씩 실어봤습니다:

- **자기 레벨에서만 끊기**(`^#`) → 다른 절을 `##`로 쓴 파일에서 위반절이 EOF까지 흘러, 권고 findings가 위반으로 세어지고 **깨끗한 문서가 막혔습니다.**
- **모든 헤딩에서 끊기**(`^#+`) → 절 **안의** 하위 헤딩이 절을 끝내, `## unsupported`로 묶은 위반이 절 밖으로 나가고 **게이트가 빈 절을 읽었습니다.**

레벨만으로는 가를 수 없습니다 — 규격이 레벨을 정하지 않았기 때문입니다. 두 경우를 가르는 것은 **그 헤딩이 review.md의 다른 절 이름인가**이고, `review.sections`가 이미 그 목록을 갖고 있었습니다. 그래서 읽습니다. 형제 절 이름이면 어느 레벨이든 절을 끝내고, 아니면 하위 헤딩이므로 절 안에 남습니다. 네 방향 전부 확인했습니다.

부수 효과로 **`review.sections`가 처음으로 소비자를 얻었습니다.** 존재 강제는 여전히 off입니다 — 그건 마이그레이션 비용이 있는 별개 결정이고 사용자 몫입니다. schema 주석을 그 구분에 맞게 고쳤습니다("읽지만 존재를 강제하지는 않는다", 그리고 그 목록이 없으면 왜 두 종료 조건이 양방향으로 틀리는지).

### 역호환

형식 변경 없음. 배포 `review.md` 템플릿(네 절 전부 `#` 레벨)은 그대로 통과합니다.

## 2026-07-30.10

**뿌리 C 마무리.** 같은 개념을 읽는 코드가 여러 벌 있고 그 벌들이 서로 다르게 답하던 다섯 자리를 하나씩 합쳤습니다.

- **두 낱말 태그가 영구 거짓 실패였습니다.** `required_tags`는 공백으로 이어붙여 공백으로 쪼갰고 truth의 `tags`는 콤마로 쪼갰습니다. 그래서 `required_tags: [계약 범위]`가 태그 **둘**(`계약`·`범위`)이 되어 둘 다 "no truths"로 뜨고, **정작 실제 태그는 한 번도 검사되지 않았습니다.** FORMATS는 required_tag 0건을 missing-required 충실성 위반으로 규정하므로, 광산이 해소 불가능한 위반 두 개를 달고 있으면서 요청한 검사 하나를 잃은 상태였습니다. 이제 한 줄에 하나씩 ENVIRON으로 넘겨 `tags`와 같은 방식으로 쪼갭니다.
- **`resolution.winner`의 자기판정만 0패딩을 정규화하지 않았습니다.** `t005.md`에 `winner: [t5]`라고 쓰면 "남이 이겼다"로 읽어 **승자를 `discarded`로 바꾸라고** 지시했고, 그 지시를 따르면 사용자가 고른 값이 광산에서 사라집니다(`pull`이 usable 0). 같은 함수의 `winnerof`·`reflist`는 처음부터 정규화했고 `tidn3`도 이미 계산돼 있었습니다.
- **날짜를 판정하는 곳이 하나뿐이고 그 하나가 값을 안 봤습니다.** `is_date()` 하나로 합쳤습니다 — 형태(`YYYY-MM-DD`, 0패딩)와 값(월 1–12, 일 1–31). 이제 `added`·`retrieved_at`·`verified_at`이 실제로 날짜인지 확인받습니다. 전에는 `retrieved_at: (미정)`이 FORMATS가 "재확인 가능성의 앵커"라 부르는 필드를 충족했습니다. coverage의 `ruled:`도 같은 기준이 됩니다 — 전에는 `2026-99-99`를 기록된 판정으로 인정하고 `2026-7-3`을 "날짜가 없다"고 했습니다. 귀속 요구도 따옴표 **한 개**가 아니라 내용 있는 짝(`"[^"]+"`)을 요구합니다.
- **참조 필드가 절반만 정규화됐습니다.** `conflict_with`·`superseded`·`derived_from`·`corroborated_by`는 `t5`를 `t005`로 해소했고 `corrects`·`cited_truths`는 "그런 것 없음"으로 답했습니다 — 그래서 존재하는 truth를 두고 "이 문서는 staleness 감지에서 면제된다"고 겁을 줬습니다. `tfile_for()`·`mdir_for()` 하나씩으로 합쳤습니다(어느 패딩이든 해소, 표시는 사용자가 쓴 그대로).

### 역호환

형식 변경 없음. eclypse(진실 256개)를 읽기로 확인했습니다 — `added`/`retrieved_at`/`verified_at`이 전부 `YYYY-MM-DD`이고 참조 필드의 짧은 id가 0개이므로 새 검사 넷이 거짓 실패를 만들지 않습니다.

### 남은 뿌리 C 한 건

`census`·`status`·`pull`이 schema의 enum을 awk/case로 베껴 쓰는 것(B9)은 넣지 않았습니다. 세 명령의 출력을 동시에 건드리는 유일한 항목이라 별도 판으로 둡니다 — 한 판에 여러 벌을 고치다 새 구멍을 낸 이력이 두 번 있습니다.

## 2026-07-30.9

뿌리 B의 마지막 한 건과 **뿌리 C**를 닫았습니다. 둘 다 같은 축입니다 — "규격을 읽는다고 적혀 있는데 실제로 읽는가".

### A1 — 명부를 기억하는 대신 유도합니다

schema를 못 읽으면 멈추는 가드가 키 **4개**만 지키고 있었습니다. 실제로 읽는 키는 **22개**입니다. 그래서 `material.fm.required_when.research` 한 줄이 없으면 url·retrieved_at 없는 fetched 값이 통과했고, v0.1.0 schema(27줄)를 그대로 두고 bin만 갱신한 설치에서 실제로 발생합니다.

명부를 **소스에서 뽑습니다** — `grep -oE 'sch [a-z][a-z_.]+'`. 손으로 관리하는 목록은 드리프트하고, 그 드리프트는 이 가드가 막으려는 방식으로 정확히 안 보입니다. 유도 자체가 실패하면(10개 미만) 조용히 4개로 후퇴하지 않고 **그 사실을 지적한 뒤** 후퇴합니다 — 말 없는 후퇴는 같은 침묵-0을 한 층 위에서 반복하는 것입니다.

### 뿌리 C — 값 리더 네 벌이 이제 같은 값을 봅니다

`census`의 `val()`만 **인용부호를 벗기지 않았습니다.** 나머지 셋(validate·reindex·pull)은 벗겼습니다. 결과:

- `status: "ok"` 로 쓴 truth가 상태 집계에서 빠져 `live 0`이 되고, `✗ status tallies sum to 0 but there are 2 truth file(s)`가 뜨고, **그 진단이 대는 두 원인이 둘 다 거짓**이며 지시받은 `validate`는 `✓`였습니다. 이제 `live 2`입니다.
- `material` status를 읽는 census의 인라인 리더도 같아서 `status: "retracted"` 자료가 분모에는 들어가고 분자에서는 빠져 `coverage 1/2`였습니다. 이제 `1/1`입니다.
- `coverage`의 `source` 추출기는 인용·주석 **둘 다** 안 벗겼습니다. `source: "m001"` 로 쓴 truth는 coverage 섹션에 없어도 통과했습니다 — FORMATS의 "adding a truth without updating coverage fails"가 거짓이었습니다. 이제 잡힙니다.

덤으로 `pull`의 `val()`에 리터럴 SOH 바이트가 박혀 있던 것을 `reindex`가 이미 쓰는 `\x01` 이스케이프로 바꿨습니다. 소스에 보이지 않는 제어문자가 남아 있는 것은 다음 사람이 읽을 때의 함정입니다.

### 역호환

형식 변경 없음. eclypse(진실 256개)를 읽기로 확인했습니다 — 인용된 `status`/`source` 값이 0개이므로 census·coverage 판정이 달라지지 않습니다.

## 2026-07-30.8

**Round 1 콜드 검토(5 관점) + 방어자 triage 결과, 47건이 살아남았습니다.** 그 47건을 뿌리로 묶으면 세 개가 26건을 만들고 critical 11건 중 10건을 만듭니다. 이번 판은 그중 **가장 큰 뿌리 하나**만 다룹니다 — 한 번에 여러 뿌리를 건드린 지난 판이 스스로 5개의 새 결함을 만들었기 때문입니다.

### 뿌리 B — "검사 0회"와 "통과"가 같은 출력이었다

critical 8건이 전부 같은 모양이었습니다. schema 키가 없어서 · `source:`가 비어서 · 본문에 검사할 줄이 없어서 · frontmatter가 안 닫혀서 · `paths`가 딴 곳이어서 · 문서 폴더가 glob에 안 걸려서 — **검사가 한 번도 돌지 않았고, 출력은 `✓`였습니다.** 개별 수정으로는 닫히지 않습니다: 검사를 추가할수록 0회 실행될 경로가 늘어납니다.

**계정(accounting)을 넣었습니다.** `validate`가 판정 앞에서 **무엇을 몇 개 실제로 검사했는지** 항상 찍습니다:

```
  examined: materials 1 · truths 2 (1 sealed ← 1 NOT sealed) · documents 1 (1 consecrated, 0 gate-checked ← 1 NOT gate-checked)
```

계정은 아무것도 판정하지 않습니다. **"안 봤다"가 "보고 아무것도 못 찾았다"와 닮는 것을 끝냅니다.** 이제 `source:` 빈값(아직 미수정)은 `✓` 옆에 `1 NOT sealed`를 달고 나오고, 다음에 어느 방향으로 새든 같은 자리에서 드러납니다.

같은 판에서 이 뿌리의 두 건을 닫았습니다:

- **게이트가 읽을 수 있는 제목이 없으면 그것 자체가 위반입니다.** `fid_body`는 절이 **비었을 때**(정상)와 **제목을 못 찾았을 때**(구멍) 똑같이 빈 값을 돌려주고, 게이트는 후자를 전자로 읽었습니다. 일곱 모양이 그렇게 통과했습니다 — `(2건)` 접미어 · 꼬리 콜론 · `1.` 번호(배포 `review.md` 템플릿 주석이 네 절에 직접 번호를 붙여 유도합니다) · 대소문자 · 병기 제목 · 꼬리 NBSP · 들여쓴 헤딩. 제목 부재는 이제 파일 부재와 같은 실패입니다. 같은 이유로요 — **게이트가 침묵한 것이지 통과시킨 것이 아닙니다.**
- **`paths`가 가리키는 폴더가 없거나, 광산 내용이 그 밖에 있으면 지적합니다.** FORMATS가 `paths` 변경을 명시적으로 허용하므로, 폴더를 옮기다 오타 하나로 두 막이 조용히 꺼지고 `✓`가 나왔습니다.

### 이 판에서 내가 만든 버그 3개 (전부 잡음)

계정을 넣으면서 awk 배열 이름을 충돌시켰고(`_t`가 이미 split 대상), `printf` 형식 문자열의 `
`이 실제 개행이 돼 인자가 밀렸고(요약이 두 줄로 쪼개져 엉뚱한 값이 찍혔습니다), `N_GATED` 증가를 `continue`/`break`가 건너뛰는 자리에 뒀습니다. 셋 다 **돌려봐서** 나왔습니다 — 읽어서는 세 개 다 맞아 보였습니다.

### 뿌리 B의 나머지 세 건 — 계정이 가리킨 자리를 닫았습니다

계정을 넣은 직후 `1 NOT sealed`로 드러난 셋입니다. 고친 뒤 그 숫자가 0으로 떨어지는 것으로 확인했습니다 — 고쳤다고 주장할 필요가 없었습니다.

- **`source:`가 비면 봉인이 0회 돌았습니다.** truth의 필수 필드 검사가 **키의 존재만** 봤습니다(`for(rk in reqkey) ... in kcount`). 봉인은 `tsrc!=""`로 감싸여 있으니 값이 비면 통째로 건너뛰고, 날조 본문이 `status: ok`로 들어가 `pull`에서 usable로 나왔습니다. 다른 네 artifact(project·material·plan·verify)는 처음부터 값을 봤습니다(`[ -n "$(fm ...)" ]`) — **봉인을 지닌 유일한 artifact만** 키 존재 검사였습니다.
- **본문에 검사할 줄이 없으면 봉인 대상이 0줄이었습니다.** 봉인은 줄 단위라 0줄이면 0회입니다. FORMATS는 축자 본문을 필수로 규정하는데 본문이 있는지 확인하는 코드가 없었습니다. 묘비(`retracted`)는 면제입니다 — 정당하게 stub일 수 있습니다.
- **frontmatter가 닫히지 않으면 그 파일의 모든 검사가 0회였습니다.** `tf_done()`이 **닫는** `---`에서 실행되므로, 없으면 파서가 EOF까지 frontmatter로 삼켜 id-파일명 대조·source 존재·status enum·resolution enum·봉인이 전부 실행되지 않았습니다. 직전 판에 넣은 가드는 **1행만** 봤습니다.

이 판에서도 내가 두 개를 만들었고 둘 다 돌려봐서 잡았습니다: awk 배열 이름을 또 충돌시켰고(`_a`가 이미 split 대상 — 직전 판의 `_t`와 같은 실수), `if`를 빠뜨린 조건절을 넣었습니다. 그 뒤 BEGIN의 split 배열 이름 10개(`_a _b _c _d _k _p _r _s _t _y`)를 전수 확인해 새로 쓴 두 이름(`_bt _st`)과 겹치지 않음을 확인했습니다.

### 역호환

형식 변경 없음. 기존 광산은 그대로 통과하고 `examined:` 한 줄이 추가될 뿐입니다. eclypse(진실 256개)를 읽기로 확인했습니다 — 빈 필수키 0 · 본문 0줄 0 · frontmatter 미닫힘 0이므로 세 검사 모두 거짓 실패를 만들지 않습니다.

## 2026-07-30.6

전수검사(5개 관점 콜드 검토, 저장소 스냅샷 고정 후 병렬)를 돌려 51건을 받았습니다. 판정 기준은 "결함이 고쳐졌나"가 아니라 **"고친 것이 안 고친 것만 못하지 않은가"** 였습니다. 결과에 따라 **새 쓰기·감사 명령을 이번 번들에서 되돌리고**, 확인된 순손해 4건을 고쳤습니다.

### 되돌린 것

**`weavedoc audit` · `weavedoc new-truth` · `weavedoc supersede` 세 명령과 `weavedoc-audit` 스킬을 뺐습니다.** 검토가 찾은 결함 중 대부분이 이 표면에 몰려 있었습니다 — `audit` A2의 stale 검사는 awk 문자열 안에 리터럴 개행이 들어가 **출하 이후 한 번도 실행된 적이 없고**(`2>/dev/null`이 문법 오류를 삼켰습니다), `supersede --type attribute`는 규격이 양쪽 `ok`로 남기라고 한 병기를 한쪽 `discarded`로 파괴했으며, `new-truth`는 `--status conflict`로 validate가 곧바로 거부할 파일을 쓰고 `> [machine-note]` 줄을 진실로 승격했습니다.

설계 자체를 버린 것은 아닙니다. 되돌린 것은 **구현**이고, 각 명령은 자기 검토 라운드를 거친 뒤 다시 들어옵니다. 규격 추가분(`origin: research` · truth `retracted` · material `corrects` · truth `superseded` · Human queue `[state] [ownership]` · coverage `## legacy` · `verify.fm.*`)과 그에 대한 `validate` 검사는 **그대로 남습니다** — 이미 그 형식으로 기록된 광산이 계속 검사받아야 하기 때문입니다.

### 고친 것 — 순손해 4건

- **봉헌 게이트의 자리표시자 판정이 앵커 없이 매칭**되어, 템플릿 모양을 그대로 쓴 진짜 위반(`- [<contradiction>] 3장 — …`)이 게이트를 통과했습니다. 되돌리기 전 버전이 막던 입력입니다. 이제 **줄 시작에 앵커**되고, **두 번째 자리표시자가 남아 있을 때만** 미작성 템플릿으로 봅니다 — 절반만 채운 줄은 실제 항목으로 세어 막습니다. 판정이 갈리면 안 되는 짝인 `countlines`도 같은 두 조건으로 맞췄습니다.
- **닫히지 않은 `<!--`가 게이트를 무력화**했습니다. 게이트는 주석을 지우고 읽는데, 끝까지 닫히지 않은 주석은 그 아래 전부를 지웁니다. 보관용 주석을 닫는 걸 잊으면 열린 위반이 통째로 사라진 채 "깨끗함"이 나왔습니다. 이제 `review.md`의 주석 균형을 게이트와 같은 자리에서 검사합니다.
- **census의 coverage 분자가 철회된 자료의 섹션을 셌습니다.** 분모는 빼는데 분자는 세어 `2/1`이 나왔고, 진단문이 대는 두 원인이 **둘 다 거짓**이었으며, 문서가 처방한 탈출구(`## legacy`)를 따르면 validate가 빨개졌습니다. 자료는 보통 **매핑된 뒤에** 철회되므로 두 집합에 다 들어갑니다 — 분자에 같은 규칙을 적용했습니다.
- **`status`가 `documents/*/review.md`의 Human queue를 안 읽어 "0"을 단언**했습니다(`validate`는 같은 파일을 읽고 있었습니다). 두 소비자가 쓰는 파일 목록을 `hq_files()` 하나로 합쳤고, 그 과정에서 **경로에 공백이 있으면 소유권 검사가 통째로 꺼지던 문제**(목록이 공백으로 이어붙인 문자열이었습니다)도 같이 닫혔습니다. 읽는 헤딩 레벨도 `validate`와 동일하게 맞췄습니다 — `verify.md`는 `##`, `review.md`는 `#`을 씁니다.

### 고친 것 — 선재 결함, 1차: 게이트 3구멍 + 템플릿 (4)

봉인을 본문 전 줄로 넓힌 이득이 **게이트의 문이 열려 있어서** 문서에 도달하지 못하고 있었습니다. 네 군데 다 새 규격 없이 닫았습니다.

- **`final/` 디렉터리가 게이트 검사 대상이 아니었습니다.** FORMATS는 다중 파일 출력을 1급 형태로 규정하는데 게이트는 `final.md`만 찾았으므로, **다중 파일 문서는 한 번도 게이트를 거친 적이 없습니다.** `cmd_status`도 같은 짝이라 함께 고쳤습니다 — 다중 파일 문서를 계속 "→ write"로 보고하면 이미 끝낸 단계로 되돌립니다.
- **`review.md`가 없으면 게이트를 건너뛰었습니다.** 조건이 두 파일의 존재를 모두 요구했기 때문에, 리뷰 파일을 지우면 불변식이 실패하는 대신 **꺼졌습니다.** 게이트 자신의 기록이 없다는 것은 게이트가 돌지 않았다는 가장 강한 신호이므로 이제 그 자체를 위반으로 봅니다.
- **`## Fidelity violations`(레벨 2)로 쓴 위반은 읽히지 않았습니다.** 규격이 이 절의 레벨을 정하지 않았는데 게이트는 레벨 1만 읽었습니다. `hq_body`와 같은 이유로 `fid_body`를 두어 양쪽 레벨을 읽고, 제목 사본 검사도 레벨 무관으로 셉니다. 같은 수정으로 반대 방향 결함도 닫혔습니다 — 레벨 1 절 추출기가 `##` 제목에서 멈추지 않아 **위반절이 비어 있는데도** 그 뒤 권고 findings 전부를 위반으로 세어 깨끗한 문서를 막고 있었습니다.
- **`fm()`이 YAML 꼬리 주석을 안 벗겼습니다.** 배포 템플릿이 열거값을 인라인 주석으로 설명하므로(`provenance: stated  # stated | adopted | derived`), **문서대로 템플릿에서 프로젝트를 만들면 첫 걸음에서 `validate`가 17건 실패**했습니다(`plan.md`·`truth.md`까지 합치면 46건). 인용된 값은 그대로 둡니다 — 인용 안의 `#`는 리터럴이고 템플릿이 `claim`·`location`을 인용합니다. **값 리더가 다섯 개**(`fm` + `validate`·`census`·`reindex`·`pull`의 `val()`)라서 다섯 곳을 함께 고쳤습니다. `fm()`만 고쳤을 때는 truth 파일이 여전히 실패했습니다 — 이 되돌리기가 막으려던 바로 그 "한쪽만 고침"입니다.

### 고친 것 — 선재 결함, 2차: 나머지 전부 (19)

앞 절에 "아직 열려 있는 것"으로 6건만 적었는데 그것은 전체가 아니라 눈에 띄던 부분이었습니다. **부분 기록을 총계로 인용한 것** — 이 도구가 막으려는 동작 그대로입니다. 실제 잔여는 19건이었고 아래가 전부입니다.

**잘못된 데이터를 쓰거나 검사가 조용히 통과하던 것 (6)**

- `retag`이 백슬래시 든 태그로 frontmatter를 두 줄로 쪼개놓고 `validate`가 통과했습니다. `awk -v`가 값에 이스케이프 처리를 하기 때문입니다. `fm_set`·`pull`은 이미 ENVIRON을 쓰고 있었고 **파일을 쓰는 쪽만 마지막까지 `-v`로** 남아 있었습니다.
- 인용 봉인의 **길이 임계값을 없앴습니다.** awk의 `length()`는 UTF-8 로케일에서 문자를, C에서 바이트를 세므로 "10"이 기계마다 한국어 3자와 10자로 갈렸습니다 — 같은 광산이 다른 판정을 받았고, 임계값 미달인 줄은 **아예 검사되지 않았습니다.** 짧은 문자열의 부분일치는 값이 싸고 통과 쪽으로 기울므로 건너뛸 이유가 없습니다. (로케일 4종에서 동일 결과 확인.)
- 같은 자리에서 묘비 판정이 **본문 줄 순서에 의존**하던 것도 고쳤습니다. 첫 일치 줄에서 판정해 같은 파일이 줄 순서에 따라 통과/실패했습니다. 이제 본문을 다 읽은 뒤 판정합니다 — 한 줄이라도 원문에 없으면 철회 사유가 성립합니다.
- `conflict_with` **상호성**을 강제합니다. 한쪽만 선언하면 READ.md 규칙 2("양쪽 다 사용 불가")를 어느 소비자도 적용할 수 없어 `pull`이 침묵한 쪽을 usable로 내보냈습니다. 0패딩 표기 차이(`t1` ↔ `t002`)도 상호로 인정합니다.
- `config`의 `gaps.markers`가 잘못된 정규식이면 grep이 exit 2를 내는데 `2>/dev/null`이 삼켜 **"0건"으로 보고**했습니다. 이제 스캔 전에 패턴을 검사하고, 갭이 아니라 도구 설정 오류이므로 유일하게 non-zero로 끝냅니다.
- **frontmatter 키 중복**을 잡습니다. `fm`은 첫 값, validate/reindex는 마지막 값, census는 둘 다 세어 한 필드에 세 답이 나왔습니다. census에 "상태 합계가 파일 수와 맞는가" 산술 검사도 넣었습니다.

**should-fix (8)**

- `validate`가 **frontmatter 없는 truth 파일의 원인을 말합니다.** 전에는 "reindex를 돌려라"만 반복하고 reindex는 성공을 보고하는 무한 루프였고, 진짜 원인은 `reindex --check`만 알고 있었습니다. 그 경우 인덱스 탓을 하지 않도록 메시지도 억제합니다.
- 폴더 이름에 **공백**이 있으면 `$(doc_ids)`/`$(material_ids)`가 단어 분할돼 실제 폴더는 검사되지 않고 유령 id 둘이 보고됐습니다. 8개 순회를 전부 줄 단위 읽기로 바꿨습니다(`< <(...)`로, `prob` 집계가 서브셸에서 사라지지 않게).
- `resolution`의 **enum 3종을 검사합니다.** 손으로 쓴 결정 기록은 전부 무검사였고 `decided_by`는 schema에 아예 없었습니다(추가함). 결정의 출처를 적지 않은 resolution도 지적합니다 — 사람이 판정했는지 기계가 골랐는지가 두 번째 막입니다.
- `pull`만 `\x01`을 안 벗겨 소비자 조회에서 필드가 밀렸습니다.
- `truth.fm.required`/`enum.status`/`enum.provenance`와 resolution enum 3종을 **schema에서 읽습니다.** 전에는 awk에 하드코딩돼 FORMATS.md의 "schema가 이긴다"가 truth 파일에 대해 거짓이었습니다.
- census가 **최소 id보다 아래의 번호 구멍**을 보고합니다. id는 t001부터 할당되므로 가장 낮은 파일이 t011이면 t001–t010은 사라진 것인데, 살아있는 id 사이의 구멍만 보고 있었습니다.
- `plan.md`의 `cited_truths`가 실제 truth를 가리키는지 검사합니다. 이 목록이 Trigger A의 조회 키이므로 끊어진 id는 그 문서를 **영구히 staleness 대상에서 제외**시킵니다.
- review 스킬이 `status: escalated`를 지시하던 것을 고쳤습니다 — `plan.fm.enum.status`에 없는 값이라 지시대로 하면 `validate`가 깨졌습니다. 에스컬레이션은 `review.md`의 `# Human queue`에 둡니다.

**nice-to-have (5)**

- `reindex --chek` 같은 오타를 조용히 무시하고 **쓰기 모드로 실행**하던 것을 거부합니다.
- `retag`이 **CRLF을 보존**합니다. 태그 하나 바꾸는 명령이 전량 diff를 만들었습니다. CR 탐지는 `grep`이 아니라 bash `read`로 합니다 — MSYS의 grep은 입력에서 CR을 지우므로 `grep -q`는 한 번도 일치한 적이 없었습니다.
- 위반절의 **괄호 없는 산문은 항목이 아닙니다.** 빈 절에 "(없음)"이라 적으면 열린 위반으로 읽혀 문서를 막았습니다. `[kind]`가 있는 줄은 불릿이 없어도 계속 항목으로 셉니다.
- `gaps`가 **원시 스캔임을 명시**하고 `gaps.md`의 수용 건수를 함께 찍습니다. 줄어들지 않는 숫자는 읽히지 않게 됩니다.
- `templates/material.md`의 status 열거에 `retracted`를 넣었습니다.

### 검증 중에 스스로 만들어 잡은 것 (3)

이 세션의 수정 작업이 만든 결함입니다. 셋 다 검증 단계에서 드러났고 고쳤습니다 — 기록해 두는 이유는 warm 검증의 한계를 보여주기 때문입니다.

- `truth.fm.required`를 schema에서 읽는 배열(`reqkey`)을 **만들어놓고 읽지 않았습니다.** 필수 키 검사는 하드코딩된 채였고, 그런데 위 절에는 이미 "schema에서 읽습니다"라고 적어 놨습니다 — 배선이 생기기 전에 주장을 먼저 적은 것. 이제 실제로 읽습니다(schema에 `location`을 추가하면 validate가 따라오는 것으로 확인).
- 그 수정이 새 위험을 만들었습니다: **schema를 못 읽으면 검사가 실패하는 대신 꺼집니다.** 하드코딩일 때는 항상 돌았습니다. 그래서 `validate`가 이제 SoT를 **먼저** 확인하고, 읽을 수 없으면 다른 판정을 내리지 않고 그 자리에서 멈춥니다 — 침묵은 통과와 구분되지 않기 때문입니다.
- CRLF 보존이 **죽은 코드**였습니다. CR 탐지를 `grep -q`로 했는데 MSYS의 grep은 입력에서 CR을 지우므로 한 번도 일치한 적이 없습니다. 읽어서는 맞아 보이고 돌려봐야 드러나는 종류입니다. bash `read`로 바꿨습니다.

### 새로 생긴 것 — 검증 수렴 루프

`config.yaml`에 `repeat`("clean rounds in a row required to pass")이 **선언되어 있었지만 아무 스킬도 읽지 않았습니다.** 값도 `1`이라, 읽혔더라도 "한 번 깨끗하면 끝"이었습니다. 선언만 있고 배선이 없는 노브 — 이 세션이 찾아낸 결함 유형 그대로였고, 형제 저장소 GroveSpec은 같은 노브를 `consecutive_passes` 카운터로 끝까지 이어 놓았습니다.

이번 세션 자체가 `repeat: 1`이 부족하다는 실측입니다. 4라운드째 검토에서 선재 결함 20건이 나왔고, 그 수정 중 셋은 죽은 코드이거나 거짓 주장이었습니다. 한 번 깨끗한 라운드는 **그 라운드에 대한 증거이고 대상에 대한 증거가 아닙니다.**

- **`repeat`이 scale별로** 갈립니다 — `skip` 0 · `light`/`standard` 1 · **`full` 2**. 리뷰어 수가 이미 scale로 갈리던 것과 같은 축입니다. `max_rounds`는 3 → 5(루프가 두 번째 통과를 얻을 여유).
- **`consecutive_passes`** — `verify.fm.optional`(있으면 int, 없으면 0)과 `review.fm.optional`. 깨끗하면 +1, 실패하면 **0**, 그리고 **step 0의 기준선이 움직였으면 0**. 라운드마다 기록하므로 콜드 세션이 루프를 처음부터 다시 돌리지 않고 이어받습니다.
- **`status: in-progress`** 추가 — 깨끗했지만 카운트가 `repeat`에 못 미친 상태. `passed`는 카운트가 도달했을 때만 씁니다. 전에는 이 상태를 적을 값이 없어 한 번 통과가 곧 `passed`였습니다.
- **`## Verified units`가 통과 기준을 기록**합니다(`passes 2/2`). 나중에 `repeat`을 올렸을 때, 예전의 낮은 기준으로 통과한 단위가 새 기준을 조용히 물려받지 않고 드러납니다.
- **`escalated`는 도달한 연속 횟수로 보고**합니다(`2 rounds, 1/2 clean in a row`) — "passed"가 아니라.
- `review.md`에 frontmatter(`round`·`consecutive_passes`)와 **빠져 있던 `# Human queue` 절**이 들어갔습니다. `review.sections`가 요구하는데 템플릿에 없었습니다.

**대상은 루프 내내 얼려 있습니다.** verify step 0이 기준선을 고정하고 움직이면 그 라운드를 FAIL시킵니다 — 연속 통과가 의미를 갖는 이유가 그것이고, 없으면 움직이는 표적의 통과를 세게 됩니다. 광산이 자라는 문제는 이 카운터가 아니라 `stale` + `## Verified units` 단위 원장이 따로 처리합니다(두 축은 별개).

**역호환 — 정정.** 처음 이 문단에 "기존 `verify.md`는 그대로 통과합니다"라고 적었는데 **거짓입니다.** frontmatter만 보면 맞습니다(`consecutive_passes`는 optional, 없으면 0). 그러나 같은 번들이 `verify.sections`를 강제하게 됐으므로, `## Human queue`·`## Adjudications`가 생기기 전에 쓰인 `verify.md`는 **`validate`에서 2건 실패**합니다. eclypse(세 절을 모두 가진 광산) 하나만 확인하고 일반 주장을 쓴 것이 원인입니다.

**마이그레이션**: 기존 `truths/verify.md`에 빠진 절의 **빈 제목만 추가**하면 됩니다(`## Verified units` · `## Human queue` · `## Adjudications` — 헤딩 레벨은 `#`/`##` 아무 쪽이나). 오류 메시지가 빠진 절 이름을 정확히 말해 줍니다.

**왜 `verify.sections`는 강제하고 `review.sections`는 안 하는가** — 같은 판단을 두 곳에 다르게 적용한 것이 맞고, 이유는 이렇습니다. `verify.md`는 프로젝트당 한 파일이고, `## Verified units`가 없으면 전역 `passed`가 그 뒤에 태어난 단위를 조용히 덮습니다(단위별 정직성이 담기는 유일한 자리입니다). `review.md`는 문서당 한 파일이고, 게이트는 필요한 절을 헤딩 레벨 무관으로 이미 읽습니다. 그래도 비대칭이 불편하면 되돌릴 수 있습니다 — 강제를 빼는 쪽이 한 줄 더 쌉니다.

### 커밋 후 정적분석에서 나온 것 (1)

실기 콜드 라운드 전에 소스만 보는 검사를 한 번 더 돌렸습니다 — 이번 세션에 실제로 물렸던 결함 유형을 자동 검사로 만든 것(죽은 함수 · 채우고 안 읽는 배열 · schema 키 미독 · config 노브 미독 · 스킬이 쓰는 enum 값이 schema에 없는 것 · awk 단일인용 안의 아포스트로피 · 리터럴 제어문자 · schema 섹션 목록 ↔ 템플릿 헤딩).

- **`verify.sections`가 소비자를 잃었습니다.** 그 키를 읽는 유일한 곳이 감사 레인 A2였고, 그 레인을 되돌리면서 schema에 선언되고 FORMATS가 서술하는데 **아무도 강제하지 않는** 상태가 됐습니다. 특히 `## Verified units`는 단위별 정직성을 담는 절이라, 없으면 전역 `passed`가 그 뒤에 태어난 단위를 조용히 덮습니다. `validate`가 검사하게 복구했습니다(헤딩 레벨 무관 — 규격이 레벨을 정하지 않았고 게이트가 이미 그 교훈을 비싸게 배웠습니다).

같은 검사가 `review.sections`도 미독으로 잡았지만 **넣지 않았습니다.** 그건 한 번도 강제된 적이 없어서, 지금 넣으면 복구가 아니라 **새 형식 요구사항**이고 네 번째 절이 생기기 전에 쓰인 `review.md`를 깨뜨립니다. 마이그레이션 비용이 있는 결정은 정리 작업이 아니라 사용자 몫이라, schema에 왜 서술 전용으로 두는지 적어 두었습니다.

그리고 `*.fm.optional` 계열이 **의도적으로** 서술 전용이라는 것을 schema 머리말에 명시했습니다. 선언만 있고 안 읽히는 키는 강제되는 키와 구분되지 않고, `repeat`이 정확히 그렇게 방치돼 있었습니다 — 다음 정적분석이 "잊고 배선 안 한 것"과 "일부러 서술만 한 것"을 가를 수 있어야 합니다.

나머지 검사는 전부 깨끗했습니다: 죽은 함수 0 · 안 읽는 배열 0 · awk 안의 아포스트로피 0 · 리터럴 CR 0 · 스킬·템플릿이 쓰는 status 값 14개 전부 schema에 존재 · 템플릿 헤딩이 schema 섹션 목록과 일치.

### 아직 열려 있는 것

**이 번들에 대한 콜드 검토는 0회입니다.** 위 수정은 전부 warm 검증 — 고친 사람이 고른 케이스로 확인한 것이며, 이 저장소의 교리대로 warm은 cold을 대체하지 않습니다. 되돌린 세 명령(`audit`·`new-truth`·`supersede`)은 각자 검토 라운드를 거친 뒤 다시 들어옵니다.

## 2026-07-29.4

한 세션에서 실사용 로그를 검토해 두 가지를 만들고(감사 레인 · Human queue 소유권), 이어서 나머지 다섯 건을 마저 구현한 뒤, **4개 관점 콜드 검토**로 결함을 잡아 고쳤습니다.

### 새로 생긴 것

**감사(audit) 레인** — `validate`(형식)와 `verify`(충실성) 사이의 세 번째 레인. 묻는 것은 *"광산이 자기 자신에 대해 하는 말이 맞나"*입니다.
- `weavedoc audit` — 기계 판정 A1~A5(장부 카운트 · verify 상태 정합 · resolution 상호성 · 중복/과소 진실 · 잔여 파일). **출력이 항상 "안 본 것"으로 끝납니다.**
- `weavedoc-audit` 스킬 — 고정 차원 A1~A7. A6(`as_of` 값의 진위)·A7(파일 간 의미 표류)은 판단 몫.
- **루프가 없는 것은 의도**입니다. verify/review는 대상이 고정이고 발견이 열려 있어 반복하지만, 감사는 반대 모양(대상이 열려 있고 검사가 고정)이라 **목록이 루프를 대신합니다.** 대신 정직한 한계 두 가지를 규격에 적었습니다 — 목록은 커버가 아니라 표본이므로 **밖에서 온 발견에는 A8을 추가**하고, 런 중 수리는 앞선 판정을 무효화하므로 **끝나고 기계 절반을 다시 읽습니다.**
- 비용은 광산 크기가 아니라 **변경량**에 비례합니다(A6/A7을 `audited_at` 이후 변경분으로 한정).

**쓰기 경로** — `weavedoc new-truth` / `weavedoc supersede`. 읽기·검사는 오래전에 기계화됐는데 쓰기만 손이었고, 그래서 규격 위반이 *쓴 뒤에* 잡혔습니다. `new-truth`는 **파일이 생기기 전에 인용 봉인을 검사**하고, `supersede`는 **결정을 모든 당사자에게 한 번에** 기록합니다.

**T5 consumer-reader 렌즈**(verify) — READ.md와 `pull`만 가지고, 자료 없이 광산을 읽습니다. 다른 모든 렌즈는 광산의 맥락을 *가지고* 읽으므로 **없는 이정표는 이 렌즈만 볼 수 있습니다.** PASS는 절차로 정의(대조 기준이 없으므로).

**M4 reachability 렌즈**(verify) — `origin: research` 자료 전용. 나중에 같은 출처에 도달해 같은 값을 얻을 수 있는가.

### 규격 추가

| | |
|---|---|
| `origin: research` | 기계가 직접 가져온 자료. `url`·`retrieved_at` 필수, `source.md`는 **변환 전 원값** 보존, 그 truth는 `provenance: stated` 금지 |
| `status: retracted` (truth) | 애초에 성립하지 않았던 추출의 묘비. resolution 없음, `changelog`의 `removed:` 줄 필수, 충돌 한쪽만 철회 금지 |
| `corrects: [m011 §4]` (material) | 정정 자료가 무엇을 대체하는지 선언. resolution `scope`를 추론 대신 읽어오고, 본문만 읽는 소비자도 정정임을 앎 |
| Human queue 소유권 | `user-only` / `recommended` / `machine`. **콜드 defender가** 붙임 — 기각하려던 기계가 붙이면 기각이 한 층 위에서 부활 |
| `## legacy` (coverage) | 사용자 재정 면제 구획. 분모가 실제로 N/N에 도달 가능 |
| `truths/audit.md` | 감사 상태 파일. `## Scope`가 **필수**이고 `validate`가 강제 |

### ⚠️ 깨지는 변경 — 인용 봉인이 본문 전 줄로 확대

`validate`의 축자 인용 검사가 **본문 첫 줄만** 보던 것에서 **10자 이상인 모든 줄**로 넓어졌습니다.

FORMATS가 명시적으로 권장하는 **다행(多行) 전문 truth** — 가사 전문·계약 조항·코드 스니펫처럼 정확한 문구 자체가 사실인 것 — 은 예전 규칙에서 **1행 외 전부가 봉인 밖**이었습니다. 2행부터는 무엇으로 바꿔도 통과했습니다.

**기존 광산을 이 번들로 올리면 초록이던 것이 빨강이 될 수 있습니다.** 그건 새 결함이 아니라 그동안 검사되지 않던 줄이 이제 검사되는 것입니다. 업그레이드 후 첫 `validate`에서 다행 본문 truth를 확인하세요 — 어긋난 줄은 원문에서 다시 복사해야 합니다.

`new-truth`의 쓰기 시점 봉인도 같은 규칙으로 맞췄고, 비교 대상에서 자료의 frontmatter를 제외했습니다(기계가 쓴 `summary:`로 봉인이 충족되던 문제).

### 그 밖에 validate가 새로 차단하는 것

- `truths/verify.md`의 프론트매터·enum·필수 섹션 (형제 파일 `audit.md`와 같은 수준으로)
- `supersede`의 사전 검사 — 철회된 truth/자료를 승자나 패자로 지정하는 것
- id 참조가 실재하는지 — `conflict_with`·`superseded`·`derived_from`·`corroborated_by` (이전엔 `corrects`만)
- 봉헌 게이트에서 `# Fidelity violations` 제목이 중복된 문서

### 재검증 등급표

판단이 아니라 표로. frontmatter만 → 콜드 라운드 없음 / 진실 3건 이하 → diff 미니라운드 / 그 이상·critical → 전체 라운드. 레벨이 안 돌린 렌즈는 `— (level)`로 적습니다(PARTIAL 아님 — 그래야 `light`/`standard`가 통과 가능).

### 콜드 검토가 잡은 결함 (전부 수정됨)

기억해 둘 만한 유형:

- **자기 템플릿이 자기 설계를 무력화** — 감사 템플릿 주석을 프론트매터 앞에 둬서 `fm()`이 못 읽음. `audited_at`이 영영 안 읽혀 감사가 매번 전체 스윕으로 회귀. **규칙: 프론트매터는 1행, 주석은 그 뒤.**
- **규칙이 자기 처방을 도달 불가로 만듦** — `retracted` 묘비가 A4를 트립시켜, map이 시킨 대로 철회하면 닫을 수 없는 지적이 영구 발생.
- **필터가 너무 넓음** — `- [{kind}]` 잡으려던 placeholder 필터가 YAML flow map을 인용한 실제 항목까지 삼킴. **필터는 정확한 모양에 앵커.**
- **`awk -v`는 이스케이프를 해석함** — `--reason`의 윈도우 경로가 한 줄짜리 `resolution:`을 두 줄로 쪼개고 뒷줄이 소실, 그런데 `validate`는 통과. 사용자 값은 **ENVIRON 경유**.
- **`set -e` 없이 `shift 2`는 조용히 실패** — 값 없는 플래그에 무한 루프.
- **카운트 규칙이 계층마다 달라짐** — `validate`/`status`/`audit`이 "항목"의 정의를 달리 보면 열린 총계가 버킷 합과 안 맞음.
- 그 외: 날짜 zero-padding, `removed:` 한 줄에 여러 id, 주석 제거 순서, 중복 h2 재진입, hole당 grep 프로세스(990개 → 2분).

### 기타

- `census` — 홀을 "설명됨/미설명"으로 분리, `retracted` 별도 집계, `coverage N/M of TOTAL (K legacy-exempt)`로 원 총계 병기
- `pull` — `derived` 라벨이 **assumptions를 실제로 출력**(예전엔 "읽어보라"면서 안 보여줬음), `retracted` 전용 라벨·집계
- `status` — 열린 Human queue를 소유권별로 표시
- `weavedoc version` — fingerprint 병기
- `weavedoc-gaps`와 `weavedoc-audit` 역할 구분(트리거 문구 정리)

---

## 2026-07-27.7 이전

`notes/`의 세션 로그 참조.
