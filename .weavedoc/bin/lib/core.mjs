// WeaveDoc foundations — the rules every command stands on.
//
// These are ports of the bash runtime's shared judges, and they are the layer where bash drifted
// most: on 2026-08-04 alone, "how a frontmatter value is read" had THREE spellings, and scope's
// private copy never peeled quotes, so `status: "retracted"` was a tombstone to validate and a live
// truth to scope. Here each rule is ONE exported function, and the foundation differential fed the
// same table to the bash originals and to these, so agreement is measured rather than assumed.
//
// Nothing here reads the filesystem or prints — pure rules, so they can be tested as a table.

// ---- how a line is read -------------------------------------------------------------------
// ONE spelling, because the bash runtime has two and they disagree by platform. Its explicit
// readers (has_fm, count_headings, the gaps scanner) strip a trailing CR by hand; its awk readers
// do not — and MSYS gawk strips CR itself while Linux gawk keeps it. Measured 2026-08-04:
//     printf 'a\r\nb\r\n' | awk '{print}'   ->  MSYS: a\nb\n     Linux: a\r\nb\r\n
// So the SAME mine already reads differently on the two platforms today, and a CRLF checkout is
// the normal state of a Windows working tree. The port follows the explicit readers — strip it —
// which is the codebase's stated intent and makes the answer platform-independent, which is the
// whole reason for the port. A trailing empty element (from a final newline) is not a line.
export function splitLines (s) {
  const l = s.split('\n')
  if (l.length && l[l.length - 1] === '') l.pop()
  return l.map(x => (x.endsWith('\r') ? x.slice(0, -1) : x))
}

// ---- the byte domain --------------------------------------------------------------------------
// A JS string cannot hold "raw bytes" and "decoded text" at once, so a command that must reproduce
// bash's output BYTE for byte has to pick one domain and stay in it. validate picks BYTES: it quotes
// mine values back in its diagnostics, and a value holding invalid UTF-8 (a CP949 material, a
// Korean console's stray byte) decodes to U+FFFD and prints as something the runtime it replaces
// never printed. Measured: bash prints `b0 cb c1 f5`, a UTF-8 reader prints `ef bf bd` four times.
//
// `U` lifts a UTF-8 SOURCE LITERAL into that domain; `M` is the template tag that does it for the
// literal halves of a message while the interpolated values — already bytes — pass through
// untouched. The pair is what lets a message be written normally and still come out as bytes.
export const U = s => Buffer.from(s, 'utf8').toString('latin1')
export const M = (strs, ...vals) => strs.reduce((a, s, i) => a + U(s) + (i < vals.length ? String(vals[i]) : ''), '')

// ---- the frontmatter fence ----------------------------------------------------------------
// ONE spelling, because there were ELEVEN and every one of them was narrower than the runtime it
// ports (found 2026-08-04 by a cold review that ran the two side by side instead of reading them).
// bash writes `^---[[:space:]]*$` in every reader of a fence, with LC_ALL=C pinned on those awks,
// and in the C locale that class is space · tab · newline · VERTICAL TAB · FORM FEED · carriage
// return. The port had `[ \t]`, so a fence carrying a `\v` or `\f` closed the block for bash and
// not for Node — and then Node kept reading frontmatter into the document body. Measured on census:
// a truth whose closing fence is `---\v` and whose BODY says `status: conflict` tallied that body
// line, inventing the "tallies do not sum to the file count" alarm on a file with one status.
// A line never holds a newline, and splitLines has already removed ONE trailing CR; CR stays in the
// class for the line that carried two of them, which both runtimes still read as a fence.
export const isFence = l => /^---[ \t\v\f\r]*$/.test(l)

// THE whitespace class between a ledger entry's tags — ONE spelling, because it had three and each
// pair disagreed somewhere (external review, v0.5.11): validate stripped `[ \t\n\v\f\r]`, status's
// ownership buckets took `[ \t\v\f]`, and the fold test took `[ \t]`. Measured consequences: a
// `\v`-separated entry folded nothing, so its body was dropped from `status --open`; a mid-line
// `\r` entry was counted "missing an ownership tag (validate rejects these)" while validate passed
// it. `\n` stays in the class although a line cannot hold one — it is validate's spelling, kept so
// this constant IS that rule rather than a near-copy of it.
export const TAG_SEP = '[ \\t\\n\\v\\f\\r]'

// …and the LEAD built from it, exported because two modules built the same regex from the same
// constant (v0.5.17). Two spellings of one rule is how TAG_SEP itself came to have three.
export const TAG_LEAD = new RegExp(`^${TAG_SEP}*`)

// ---- id spelling --------------------------------------------------------------------------
// The single definition of "how a number is spelled as an id", used both to resolve a file and to
// reject a file spelling its number any other way — so lookup and naming convention cannot drift.
// Base-10 is forced (bash: `10#$n`), or `010` would read as octal.
export function canonId (s) {
  if (typeof s !== 'string' || s === '') return null
  const p = s[0]
  if (p !== 't' && p !== 'm') return null
  const n = s.slice(1)
  if (n === '' || /[^0-9]/.test(n)) return null
  return p + String(parseInt(n, 10)).padStart(3, '0')
}

// ---- dates --------------------------------------------------------------------------------
// One judge for every date in the mine: shape AND value. 2026-99-99 fails, and so does an
// unpadded 2026-7-3 — the format requires zero padding. Full Gregorian leap rule.
export function isDate (s) {
  if (typeof s !== 'string') return false
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return false
  const y = parseInt(s.slice(0, 4), 10)
  const m = parseInt(s.slice(5, 7), 10)
  const d = parseInt(s.slice(8, 10), 10)
  if (m < 1 || m > 12) return false
  let max = 31
  if (m === 4 || m === 6 || m === 9 || m === 11) max = 30
  else if (m === 2) max = (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28
  return d >= 1 && d <= max
}

// ---- list fields --------------------------------------------------------------------------
// `[a, b]` -> ["a","b"]. Brackets and double quotes are stripped first, then the split is on comma
// ONLY, so an item containing spaces survives intact. Empty items are dropped.
export function listField (s) {
  if (typeof s !== 'string') return []
  const bare = s.replace(/[[\]"]/g, '')
  return bare.split(',').map(x => x.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '')).filter(x => x !== '')
}

// Pipe-separated schema lists. The splitting is bash word splitting with IFS='|', which is NOT the
// same as "split and drop empties" (the differential caught this): with a NON-whitespace IFS every
// delimiter delimits, so interior and leading empty fields SURVIVE — `a||b` is three fields, `|a|`
// is two. Only a single trailing delimiter adds nothing, and an empty string is zero fields.
export function pipes (s) {
  if (typeof s !== 'string' || s === '') return []
  const parts = s.split('|')
  if (parts.length > 1 && parts[parts.length - 1] === '') parts.pop()
  return parts
}

// The delimited list CONTAINS the delimited needle. Spelled as the substring test bash performs
// (`case "|$2|" in *"|$1|"*`) and not as the membership test its comment describes, because the two
// disagree and the implementation is the contract: a needle that itself holds a delimiter matches a
// contiguous RUN of members, so `in_list "verified|failed" "verified|failed"` is TRUE. Measured
// against the original — attest is the first command to hand this raw argv.
export function inList (needle, list) {
  return `|${list}|`.includes(`|${needle}|`)
}

// ---- placeholders -------------------------------------------------------------------------
// An unfilled `{…}` placeholder is not a value (ruled 2026-07-31): write once took a placeholder
// tone AS the document's tone. "Entirely ONE brace group" — a value that merely CONTAINS braces is
// real content, and a value with two groups is not this shape either.
export function isPlaceholder (s) {
  if (typeof s !== 'string' || s === '') return false
  if (!(s.startsWith('{') && s.endsWith('}'))) return false
  if (s.indexOf('{') !== s.lastIndexOf('{')) return false
  if (s.indexOf('}') !== s.lastIndexOf('}')) return false
  return true
}

// ---- consumer-facing labels ---------------------------------------------------------------
// THE one spelling of every label a consumer sees on a truth. pull once attached PLAN-STAGE/as_of/
// DERIVED/ADOPTED while index and tree carried none, so which fact a reader received depended on
// which entry path they took. Every writer calls this; the text is spelled inline nowhere else.
// `enc` encodes the LITERALS only, and exists because the two callers work in different domains:
// pull builds decoded text, reindex builds byte-domain text copied verbatim out of truth files. The
// interpolated values (`asOf`, `assumptions`) are the caller's and are never re-encoded — doing so
// double-encoded a Korean `as_of` into mojibake in the generated index, which is how this was found.
export function truthLabels (asOf, prov, assumptions, srcStage, srcStatus, enc = s => s) {
  let lab = ''
  if (asOf) lab += ` (as_of: ${asOf})`
  if (prov === 'derived') {
    // Absent is not `[]`. FORMATS gives the EMPTY LIST a meaning ("uses stated facts only"), so a
    // MISSING `assumptions` must not render as that positive declaration.
    if (assumptions && assumptions !== '[]') lab += `${enc(' [DERIVED — assumes ')}${assumptions}]`
    else if (assumptions === '[]') lab += enc(' [DERIVED — declares no unstated assumptions]')
    else lab += enc(' [DERIVED — assumptions NOT DECLARED; open the file before reuse]')
  } else if (prov === 'adopted') {
    lab += enc(' [ADOPTED — machine-proposed, user-accepted]')
  }
  if (srcStage === 'plan') lab += enc(' [PLAN-STAGE SOURCE — never evidence of use]')
  if (srcStatus === 'retracted') lab += ' [RETRACTED SOURCE]'
  return lab
}

// ---- frontmatter value rule ---------------------------------------------------------------
// THE rule, one spelling. A key is everything before the first colon; the value is the remainder
// with leading whitespace removed, then — only when the value does not open with a quote — a
// trailing YAML comment stripped; then trailing whitespace removed and one layer of surrounding
// double quotes peeled. The quote check comes BEFORE comment stripping because a `#` inside a
// quoted value is content, not a comment.
export function fmKey (line) {
  const i = line.search(/[ \t]*:/)
  return i < 0 ? line : line.slice(0, i)
}

export function fmVal (line) {
  const k = fmKey(line)
  let v = line.slice(k.length).replace(/^[ \t]*:[ \t]*/, '')
  if (!v.startsWith('"')) {
    v = v.replace(/[ \t]+#.*$/, '')
    if (v.startsWith('#')) v = ''
  }
  v = v.replace(/[ \t]+$/, '').replace(/^"/, '').replace(/"$/, '')
  return v
}

// A frontmatter line at all? The shape the bash readers gate on before calling fmKey/fmVal.
export function isFmLine (line) {
  return /^[A-Za-z_][A-Za-z0-9_-]*[ \t]*:/.test(line)
}
