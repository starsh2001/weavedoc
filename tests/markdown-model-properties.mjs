// Pure combinatorial checks for the Markdown scanner and typed ledger models.
// One Node process keeps this cheap on Windows; fixed Cartesian tables keep the generator itself
// auditable and Node 18 compatible.
import assert from 'node:assert/strict'
import { scanMarkdown } from '../.weavedoc/bin/lib/markdown-scan.mjs'
import { parseCoverage } from '../.weavedoc/bin/lib/coverage-model.mjs'
import { classifySlot, controlOnlyLead, leadRelation, parseSlot, parseTaggedBullet } from '../.weavedoc/bin/lib/ledger-model.mjs'
import { parseHumanQueues } from '../.weavedoc/bin/lib/hq-ledger.mjs'
import { parseQuestions } from '../.weavedoc/bin/lib/questions-ledger.mjs'
import { gapRegisterContract, parseGapText } from '../.weavedoc/bin/lib/gaps-register.mjs'
import { parseReview, rewriteOutsideKinds } from '../.weavedoc/bin/lib/review-model.mjs'
import { appendVerdicts, insertMirrorRow, parseVerifiedUnits, verifiedUnitsContract } from '../.weavedoc/bin/lib/verified-units.mjs'

let cases = 0
let groups = 0
const check = (condition, message, input = '') => {
  cases++
  assert.ok(condition, `${message}\nINPUT=${JSON.stringify(input)}`)
}

const eols = ['\n', '\r\n']
const fences = ['```', '````', '~~~', '~~~~']
const inners = ['<!-- literal', '# Human queue', '- [open] [user-only] HIDDEN', '``` nested-looking', '--> orphan']

// Outer precedence: a comment marker in a fence is literal, and a fence marker in a comment is
// literal.  In both directions the live suffix survives and no state leaks out of the wrapper.
groups++
for (const eol of eols) {
  for (const fence of fences) {
    for (const inner of inners) {
      const input = ['## Human queue', `${fence}md`, inner, fence, '- [open] [user-only] REAL'].join(eol) + eol
      const doc = scanMarkdown(input)
      const hq = parseHumanQueues(doc)
      check(!doc.fenceOpen && !doc.commentOpen, 'closed fence leaked lexical state', input)
      check(hq.entries.length === 1 && hq.entries[0].line.includes('REAL'), 'fenced example changed live HQ records', input)
      check(!hq.entries[0].line.includes('HIDDEN'), 'fenced record became live', input)
    }
  }

  for (const inner of [...fences, '# Human queue', '- [open] [user-only] HIDDEN']) {
    const input = ['<!--', inner, '-->', '## Human queue', '- [open] [user-only] REAL'].join(eol) + eol
    const doc = scanMarkdown(input)
    const hq = parseHumanQueues(doc)
    check(!doc.fenceOpen && !doc.commentOpen, 'closed comment leaked lexical state', input)
    check(hq.entries.length === 1 && hq.entries[0].line.includes('REAL'), 'commented example changed live HQ records', input)
  }
}

// Removing a closed inline comment must never concatenate its neighbours into a structural token.
groups++
for (const tail of ['```', '~~~', '# Open', '## Human queue', '- [open] [user-only] X']) {
  const input = `<!--x-->${tail}\nPLAIN\n`
  const doc = scanMarkdown(input)
  check(!doc.fenceOpen, 'comment removal manufactured a fence', input)
  check(doc.headings.length === 0, 'comment removal manufactured a heading', input)
  check(doc.lines[0].live.indexOf(tail) === '<!--x-->'.length, 'comment span did not preserve source columns', input)
}

// Frontmatter is its own context; Markdown-looking YAML values do not open comments/fences.
groups++
for (const token of ['<!--', '```', '~~~', '# Human queue']) {
  const input = `---\nvalue: ${token}\n---\n## Human queue\n- [open] [user-only] REAL\n`
  const doc = scanMarkdown(input, { frontmatter: true })
  check(doc.frontmatter.state === 'closed' && !doc.commentOpen && !doc.fenceOpen, 'frontmatter leaked into Markdown state', input)
  check(parseHumanQueues(doc).entries.length === 1, 'frontmatter hid the live ledger', input)
}
{
  const questions = '---\n# Questions\n- [open] REAL\n'
  const qdoc = scanMarkdown(questions)
  check(qdoc.frontmatter.state === 'absent' && parseQuestions(qdoc).entries.length === 1,
    'a questions.md horizontal rule became frontmatter', questions)
  const gaps = '---\n# Open\n- [declared] REAL\n# Accepted\n'
  check(parseGapText(gaps, { openName: 'Open', acceptedName: 'Accepted', kinds: new Set(['declared']) }).open.entries.length === 1,
    'a gaps.md horizontal rule became frontmatter', gaps)
  const typo = parseGapText('# Oepn\n- [declared] STRAY\n# Accepted\n', {
    openName: 'Open', acceptedName: 'Accepted', kinds: new Set(['declared'])
  })
  check(typo.structureDiagnostics.some(d => d.code === 'section-count' && d.role === 'open') &&
    typo.structureDiagnostics.some(d => d.code === 'stray-entry'),
  'gap structure model did not surface a misspelled section and orphaned record')
  const unclosed = scanMarkdown('---\n## Human queue\n- [open] [user-only] HIDDEN\n', { frontmatter: true })
  check(unclosed.frontmatter.state === 'open' && unclosed.diagnostics.some(d => d.code === 'MD_UNTERMINATED_FRONTMATTER'),
    'enabled frontmatter did not preserve its unclosed state')
}

// Comment masking preserves columns but masked bytes have no structural provenance.  Inserting a
// comment between a marker and its required separator cannot manufacture a heading, bullet or tag.
groups++
{
  const input = '#<!--x--> Human queue\n- [open] [user-only] HIDDEN\n'
  const doc = scanMarkdown(input)
  check(doc.headings.length === 0 && parseHumanQueues(doc).entries.length === 0,
    'a comment manufactured a heading separator', input)
}
for (const prefix of ['-<!--x--> ', '<!--x-->- ']) {
  const hqInput = `## Human queue\n${prefix}[open] [user-only] HIDDEN\n`
  check(parseHumanQueues(scanMarkdown(hqInput)).entries.length === 0,
    'a comment manufactured an HQ bullet prefix', hqInput)
  const qInput = `${prefix}[open] HIDDEN\n`
  check(parseQuestions(scanMarkdown(qInput)).entries.length === 0,
    'a comment manufactured a question bullet prefix', qInput)
  const gapInput = `# Open\n${prefix}[declared] HIDDEN\n# Accepted\n`
  check(parseGapText(gapInput, { openName: 'Open', acceptedName: 'Accepted', kinds: new Set(['declared']) }).open.entries.length === 0,
    'a comment manufactured a gap bullet prefix', gapInput)
}
{
  const input = '## Human queue\n- [open]<!--x-->[user-only] REAL\n'
  const entry = parseHumanQueues(scanMarkdown(input)).entries[0]
  check(entry.slots.state.type === 'known' && entry.slots.ownership.type === 'missing' && entry.syntax === 'malformed',
    'masked bytes manufactured the separator between HQ slots', input)
}

// Slot states are a closed discriminated set, never null/empty-string sentinels.
groups++
const allowed = new Set(['open'])
const slotCases = [
  ['', 'missing'],
  ['[', 'unclosed'],
  ['[]', 'blank'],
  ['[ ]', 'blank'],
  ['[{state}]', 'placeholder'],
  ['[<state>]', 'placeholder'],
  ['[open]', 'known'],
  ['[Open]', 'unknown']
]
for (const [text, type] of slotCases) {
  const got = classifySlot(parseSlot(text), allowed)
  check(got.type === type, `slot ${JSON.stringify(text)} classified as ${got.type}, want ${type}`, text)
}
for (const text of ['- [open', '- REAL']) {
  const slots = parseTaggedBullet(text, ['state', 'ownership']).slots
  check(slots.ownership.type === 'unreachable' && slots.ownership.because.slot === 'state',
    'a later slot collapsed structural unreachability into absence', text)
}

// HQ first-slot × second-slot × inline body × continuation.  Every bullet is exactly one template
// or record, and an unclosed optional bracket can never masquerade as a template.
groups++
const stateForms = [
  { text: '[open]', type: 'known' },
  { text: '[ruled]', type: 'known' },
  { text: '[other]', type: 'unknown' },
  { text: '[{state}]', type: 'placeholder' },
  { text: '[<state>]', type: 'placeholder' },
  { text: '[]', type: 'blank' },
  { text: '[open', type: 'unclosed' },
  { text: '', type: 'missing' }
]
const ownerForms = [
  { text: '[user-only]', type: 'known' },
  { text: '[recommended]', type: 'known' },
  { text: '[other]', type: 'unknown' },
  { text: '[{ownership}]', type: 'placeholder' },
  { text: '[]', type: 'blank' },
  { text: '[', type: 'unclosed' },
  { text: '', type: 'missing' }
]
const bodies = [
  { text: '', real: false },
  { text: ' <where> -- <what>', real: false },
  { text: ' REAL', real: true }
]
const continuations = [
  { text: '', real: false },
  { text: '\n', real: false },
  { text: '\n  <where> -- <what>', real: false },
  { text: '\n  REAL-CONT', real: true }
]
const hqStateForms = stateForms.filter(state => !['missing', 'unclosed'].includes(state.type))
for (const state of hqStateForms) for (const owner of ownerForms) for (const body of bodies) for (const cont of continuations) {
  const tags = [state.text, owner.text].filter(Boolean).join(' ')
  const input = `## Human queue\n- ${tags}${body.text}${cont.text}\n`
  const model = parseHumanQueues(scanMarkdown(input))
  const ownerCanBeTemplate = ['known', 'placeholder', 'missing'].includes(owner.type)
  const template = state.type === 'placeholder' && ownerCanBeTemplate && !body.real && !cont.real
  check(model.nodes.filter(n => n.nodeType === 'entry' || n.nodeType === 'template').length === 1, 'HQ bullet did not have exactly one structural node', input)
  check(model.entries.length === (template ? 0 : 1), 'HQ template/record materialisation mismatch', input)
  if (owner.type === 'unclosed') {
    const entry = model.entries[0]
    check(entry?.slots.ownership.type === 'unclosed', 'unclosed ownership slot collapsed into another state', input)
    // Policy ignores ownership on a ruled item, but lexical syntax remains an independent fact.
    check(entry.syntax === 'malformed', 'an explicitly unclosed ownership slot was called valid syntax', input)
  }
}
// Missing/unclosed first slots make every later slot structurally unreachable, so an ownership
// cross-product cannot be written in the grammar.  They still cross with both body axes here: the
// matrix is complete over representable states rather than silently omitting the terminal states.
for (const terminal of [{ text: '[open', type: 'unclosed' }, { text: '', type: 'missing' }]) {
  for (const body of bodies) for (const cont of continuations) {
    const input = `## Human queue\n- ${terminal.text}${body.text}${cont.text}\n`
    const entry = parseHumanQueues(scanMarkdown(input)).entries[0]
    const continuationPreserved = !cont.real || (entry.detailLines.some(detail => detail.content.includes('REAL-CONT')) &&
      (entry.inlineBody === 'real' || entry.line.includes('REAL-CONT')))
    check(entry?.slots.state.type === terminal.type && entry.slots.ownership.type === 'unreachable' &&
      entry.syntax === 'malformed' && continuationPreserved,
    `HQ terminal ${terminal.type} state lost syntax or continuation state`, input)
  }
}

// Literal-lead nesting matrix and repeated-section reset.
groups++
const leads = ['', ' ', '  ', '    ', '\t', '  \t', '\v', '\f']
for (const parentLead of leads) for (const childLead of leads) {
  const input = `## Human queue\n${parentLead}- [open] [user-only] PARENT\n${childLead}- [{state}] [{ownership}] CHILD\n`
  const model = parseHumanQueues(scanMarkdown(input))
  const structuralParent = controlOnlyLead(parentLead) ? '' : parentLead
  const childIsEntry = controlOnlyLead(childLead) || leadRelation(structuralParent, childLead) !== 'child'
  check(model.entries.length === (childIsEntry ? 2 : 1), 'HQ literal-lead relation mismatch', input)
}
{
  const input = '## Human queue\n- [open] [user-only] R1\n## Human queue\n  - [{state}] [{ownership}] R2\n'
  check(parseHumanQueues(scanMarkdown(input)).entries.length === 2, 'HQ state crossed repeated section boundary', input)
}
{
  const input = '# Human queue\n- [open] [user-only] R1\n## Human queue\n- [open] [user-only] R2\n'
  check(parseHumanQueues(scanMarkdown(input)).entries.length === 2, 'a deeper repeated HQ section overlapped its parent', input)
  const gaps = '# Open\n- [declared] OPEN\n## Accepted\n- [declared] ACCEPTED\n'
  const model = parseGapText(gaps, { openName: 'Open', acceptedName: 'Accepted', kinds: new Set(['declared']) })
  check(model.open.entries.length === 1 && model.accepted.entries.length === 1,
    'differently levelled gap sections overlapped', gaps)
  const sameRole = parseGapText('# Same\n- [declared] ONE ROLE ONLY\n', {
    openName: 'Same', acceptedName: 'Same', kinds: new Set(['declared'])
  })
  check(sameRole.open.entries.length === 1 && sameRole.accepted.entries.length === 0 &&
    sameRole.structureDiagnostics.some(d => d.code === 'invalid-contract'),
  'one gap section was assigned both Open and Accepted roles')

  const malformedGapContracts = [
    ['leading-empty section role', '|Accepted', 'declared'],
    ['extra positional section role', 'Open|Accepted|Archive', 'declared'],
    ['duplicate kind vocabulary', 'Open|Accepted', 'declared|declared'],
    // An INTERIOR empty member, which core.pipes() preserves. A single TRAILING delimiter is a
    // different shape — it adds no member at all — and is checked as legal below.
    ['empty kind vocabulary member', 'Open|Accepted', 'declared||reference']
  ]
  for (const [label, sections, kinds] of malformedGapContracts) {
    const malformedContract = gapRegisterContract(new Map([
      ['gaps.sections', sections],
      ['gaps.enum.kind', kinds]
    ]))
    const malformedModel = parseGapText('# Open\n- [declared] MUST-NOT-ROUTE\n# Accepted\n', malformedContract)
    check(!malformedContract.valid && malformedModel.open.entries.length === 0 &&
      malformedModel.accepted.entries.length === 0 &&
      malformedModel.structureDiagnostics.some(d => d.code === 'invalid-contract'),
    `${label} shifted or preserved a usable gaps role`)
  }
  // …and the shape that is NOT malformed. A pipe list is read by core.pipes() everywhere in this
  // runtime, and one trailing delimiter adds no member. Rejecting it here disabled both register
  // roles over a schema every other reader accepts — a second spelling of one rule, not strictness.
  const trailingContract = gapRegisterContract(new Map([
    ['gaps.sections', 'Open|Accepted|'],
    ['gaps.enum.kind', 'declared|reference|']
  ]))
  const trailingModel = parseGapText('# Open\n- [declared] REAL\n# Accepted\n', trailingContract)
  check(trailingContract.valid && trailingContract.openName === 'Open' &&
    trailingContract.acceptedName === 'Accepted' && trailingModel.open.entries.length === 1,
  'a trailing pipe delimiter disabled the gaps register roles')
}

// Questions use the same slot/materialisation states with their own waiting policy.
groups++
for (const state of stateForms) for (const body of bodies) for (const cont of continuations) {
  const input = `# Questions\n- ${state.text}${body.text}${cont.text}\n`
  const model = parseQuestions(scanMarkdown(input), {
    states: new Set(['open', 'proposed', 'answered']),
    waiting: new Set(['open', 'proposed'])
  })
  const template = state.type === 'placeholder' && !body.real && !cont.real
  check(model.entries.length === (template ? 0 : 1), 'question template/record materialisation mismatch', input)
  if (state.text === '[open]' && (body.real || cont.real)) check(model.entries[0].bucket === 'waiting', 'open question did not enter waiting bucket', input)
}
{
  const blankContinuation = parseQuestions(scanMarkdown('- [{state}]\n\n  REAL QUESTION\n'))
  check(blankContinuation.entries.length === 1 && blankContinuation.entries[0].line.includes('REAL QUESTION'),
    'a physical blank severed a question placeholder from its continuation')
  const orphan = parseQuestions(scanMarkdown('  - [open] REAL QUESTION\n'))
  check(orphan.entries.length === 1 && orphan.entries[0].bucket === 'unrecognized' &&
    orphan.entries[0].diagnostics.some(d => d.code === 'QUESTION_ORPHAN'),
  'a misindented question entry vanished or became a valid waiting item')
}

// Gap kind states: missing/unclosed/blank are malformed but not gaps; unknown and a materialised
// placeholder are real filed gaps plus a diagnostic; a pure placeholder is only a template.
groups++
const kindForms = [
  { text: '[declared]', type: 'known' },
  { text: '[other]', type: 'unknown' },
  { text: '[{kind}]', type: 'placeholder' },
  { text: '[<kind>]', type: 'placeholder' },
  { text: '[]', type: 'blank' },
  { text: '[ ]', type: 'blank' },
  { text: '[declared', type: 'unclosed' },
  { text: '', type: 'missing' }
]
for (const kind of kindForms) for (const body of bodies) for (const cont of continuations) {
  const input = `# Open\n- ${kind.text}${body.text}${cont.text}\n# Accepted\n`
  const model = parseGapText(input, { openName: 'Open', acceptedName: 'Accepted', kinds: new Set(['declared']) })
  const template = kind.type === 'placeholder' && !body.real && !cont.real
  check(model.open.entries.length === (template ? 0 : 1), 'gap template/record materialisation mismatch', input)
  if (!template) {
    const record = model.open.entries[0]
    const wantGap = ['known', 'unknown', 'placeholder'].includes(kind.type)
    check(record.countsAsGap === wantGap, `gap countability mismatch for ${kind.type}`, input)
    if (['missing', 'unclosed', 'blank'].includes(kind.type)) check(record.syntax === 'malformed', 'unusable kind slot was not malformed', input)
  }
}

// Inline and effective body are separate axes.  A real continuation changes the effective body in
// every ledger without rewriting the source-line fact.
groups++
{
  const hq = parseHumanQueues(scanMarkdown('## Human queue\n- [open] [user-only]\n  REAL\n')).entries[0]
  check(hq.inlineBody === 'empty' && hq.body === 'real', 'HQ effective body ignored a continuation')
  const question = parseQuestions(scanMarkdown('- [open]\n  REAL\n')).entries[0]
  check(question.inlineBody === 'empty' && question.body === 'real', 'question effective body ignored a continuation')
  const gap = parseGapText('# Open\n- [declared]\n  REAL\n# Accepted\n', {
    openName: 'Open', acceptedName: 'Accepted', kinds: new Set(['declared'])
  }).open.entries[0]
  check(gap.inlineBody === 'empty' && gap.body === 'real', 'gap effective body ignored a continuation')
  const unclosedQuestion = parseQuestions(scanMarkdown('- [open\n  REAL QUESTION\n')).entries[0]
  check(unclosedQuestion.inlineBody === 'empty' && unclosedQuestion.line.includes('REAL QUESTION'),
    'an unclosed question slot was mistaken for body and hid its real continuation')
  const unclosedGap = parseGapText('# Open\n- [declared\n  REAL GAP\n# Accepted\n', {
    openName: 'Open', acceptedName: 'Accepted', kinds: new Set(['declared'])
  }).open.entries[0]
  check(unclosedGap.inlineBody === 'empty' && unclosedGap.line.includes('REAL GAP'),
    'an unclosed gap slot was mistaken for body and hid its real continuation')
}

// Empty-ledger idioms are exact source syntax, not a loose spelling that absorbs malformed bullets.
groups++
for (const [line, empty] of [['- (none)', true], ['- none', false]]) {
  const q = parseQuestions(scanMarkdown(`${line}\n`))
  check(q.entries.length === (empty ? 0 : 1), `questions empty idiom exactness failed for ${line}`)
  const hq = parseHumanQueues(scanMarkdown(`## Human queue\n${line}\n`))
  check(hq.entries.length === (empty ? 0 : 1), `HQ empty idiom exactness failed for ${line}`)
  if (empty) {
    check(q.sentinels.length === 1 && q.sentinels[0].materialization === 'sentinel', 'question empty idiom has no typed sentinel node')
    check(hq.sentinels.length === 1 && hq.sentinels[0].materialization === 'sentinel', 'HQ empty idiom has no typed sentinel node')
  }
}

// Sentinel and fence-opener transitions are explicit; neither may reuse the template-continuation
// transition accidentally.
groups++
{
  const qReal = parseQuestions(scanMarkdown('- (none)\n  REAL QUESTION\n'))
  check(qReal.entries.length === 1 && qReal.diagnostics.some(d => d.code === 'QUESTION_SENTINEL_CONTENT'),
    'question content below an empty sentinel vanished')
  const hReal = parseHumanQueues(scanMarkdown('## Human queue\n- (none)\n  REAL DECISION\n'))
  check(hReal.entries.length === 1 && hReal.diagnostics.some(d => d.code === 'HQ_SENTINEL_CONTENT'),
    'HQ content below an empty sentinel vanished')
  const qMixed = parseQuestions(scanMarkdown('- (none)\n- [open] REAL\n'))
  check(qMixed.diagnostics.some(d => d.code === 'QUESTION_EMPTY_CONTRADICTION'),
    'question sentinel/record contradiction was not represented')
  const hMixed = parseHumanQueues(scanMarkdown('## Human queue\n- (none)\n- [open] [user-only] REAL\n'))
  check(hMixed.diagnostics.some(d => d.code === 'HQ_EMPTY_CONTRADICTION'),
    'HQ sentinel/record contradiction was not represented')
  const hRounds = parseHumanQueues(scanMarkdown('## Human queue\n- (none)\n## Human queue\n- [open] [user-only] NEXT ROUND\n'))
  check(!hRounds.diagnostics.some(d => d.code === 'HQ_EMPTY_CONTRADICTION'),
    'HQ empty sentinel leaked across a repeated-section boundary')
}
{
  const hq = parseHumanQueues(scanMarkdown('## Human queue\n- [{state}] [{ownership}]\n  ```md\n  HIDDEN\n  ```\n'))
  check(hq.entries.length === 0, 'an indented fence opener materialized an HQ template')
  const q = parseQuestions(scanMarkdown('- [{state}]\n  ```md\n  HIDDEN\n  ```\n'))
  check(q.entries.length === 0, 'an indented fence opener materialized a question template')
  const hqAfterFence = parseHumanQueues(scanMarkdown('## Human queue\n- [{state}] [{ownership}]\n  ```md\n  HIDDEN\n  ```\n  REAL DECISION\n'))
  check(hqAfterFence.entries.length === 1 && hqAfterFence.entries[0].line.includes('REAL DECISION'),
    'a closed inert fence permanently reset its HQ parent')
  const qAfterFence = parseQuestions(scanMarkdown('- [{state}]\n  ```md\n  HIDDEN\n  ```\n  REAL QUESTION\n'))
  check(qAfterFence.entries.length === 1 && qAfterFence.entries[0].line.includes('REAL QUESTION'),
    'a closed inert fence permanently reset its question parent')
  const gap = parseGapText('# Open\n- [{kind}]\n  ```md\n  HIDDEN\n  ```\n# Accepted\n', {
    openName: 'Open', acceptedName: 'Accepted', kinds: new Set(['declared'])
  })
  check(gap.open.entries.length === 0 && gap.open.badLine !== null,
    'an indented fence opener did not fail closed in gaps')
  const acceptedOrphan = parseGapText('# Open\n# Accepted\n- [declared] DECISION\n\n  ORPHAN\n', {
    openName: 'Open', acceptedName: 'Accepted', kinds: new Set(['declared'])
  })
  check(acceptedOrphan.accepted.badLine !== null && acceptedOrphan.accepted.entries[0].line.includes('DECISION') &&
    !acceptedOrphan.accepted.entries[0].line.includes('ORPHAN'),
  'a blank line widened the fail-closed Accepted grammar', acceptedOrphan.document.source)
  const hqMixedLead = parseHumanQueues(scanMarkdown('## Human queue\n  - [{state}] [{ownership}]\n\tREAL DECISION\n'))
  check(hqMixedLead.entries.length === 1 && hqMixedLead.entries[0].line.includes('REAL DECISION') &&
    hqMixedLead.diagnostics.some(d => d.code === 'ambiguous-detail'),
  'a mixed-lead HQ continuation vanished instead of becoming an explicit ambiguity')

  const hqCommentDetail = parseHumanQueues(scanMarkdown('## Human queue\n- [{state}] [{ownership}]\n  <!--note-->REAL DECISION\n'))
  check(hqCommentDetail.entries.length === 1 && hqCommentDetail.entries[0].line.includes('REAL DECISION'),
    'a closed comment interrupted an authentic HQ continuation lead')
  const qCommentDetail = parseQuestions(scanMarkdown('- [{state}]\n  <!--note-->REAL QUESTION\n'))
  check(qCommentDetail.entries.length === 1 && qCommentDetail.entries[0].line.includes('REAL QUESTION'),
    'a closed comment interrupted an authentic question continuation lead')
  const qCommentOnly = parseQuestions(scanMarkdown('- [{state}]\n  <!--note-->\n  REAL QUESTION\n'))
  check(qCommentOnly.entries.length === 1 && qCommentOnly.entries[0].line.includes('REAL QUESTION'),
    'a comment-only line became a source blank and reset question state')

  const held = {
    hq: parseHumanQueues(scanMarkdown('## Human queue\n- [{state}] [{ownership}]\n  <where> -- <what>\n  REAL\n')).entries[0],
    question: parseQuestions(scanMarkdown('- [{state}]\n  <where> -- <what>\n  REAL\n')).entries[0],
    gap: parseGapText('# Open\n- [{kind}]\n  <where> -- <what>\n  REAL\n# Accepted\n', {
      openName: 'Open', acceptedName: 'Accepted', kinds: new Set(['declared'])
    }).open.entries[0]
  }
  for (const [ledger, entry] of Object.entries(held)) {
    check(entry.line.includes('REAL') && !entry.line.includes('<where>'),
      `${ledger} exposed template-only detail that preceded placeholder materialisation`, entry.line)
  }
}

// Review shares the lexer but owns a shape-free zone policy: comments archive, fences do not excuse
// a violation, and only source-valid headings can open the gate.
groups++
{
  const contract = {
    sections: ['Fidelity violations', 'Findings', 'Adjudications', 'Human queue'],
    kinds: ['contradiction', 'unsupported', 'missing-required']
  }
  const synthetic = '<!--x--># Fidelity violations\n- [contradiction] HIDDEN-BY-NO-GATE\n'
  const syntheticModel = parseReview(scanMarkdown(synthetic, { frontmatter: true }), contract)
  check(syntheticModel.headingCount('Fidelity violations') === 0,
    'comment removal manufactured a review gate heading', synthetic)

  for (const malformedShape of [
    '# Fidelity violations\n## [typo] OPEN\n# Findings\n',
    '# Fidelity violations\n#[typo] OPEN\n# Findings\n',
    '# Fidelity violations\n--> [typo] OPEN\n# Findings\n'
  ]) {
    const model = parseReview(scanMarkdown(malformedShape, { frontmatter: true }), contract)
    check(model.gateShapeCandidates.length === 1 && model.gateShapeCandidates[0].rawSlot === 'typo' &&
      model.gateBlocking.length === 1,
      'an unknown gate-shaped slot escaped typed classification', malformedShape)
  }
  const headingProse = '# Fidelity violations\n# round 2 note [draft]\n# Findings\n'
  const headingProseModel = parseReview(scanMarkdown(headingProse, { frontmatter: true }), contract)
  check(headingProseModel.gateShapeCandidates.length === 0 && headingProseModel.gateBlocking.length === 0,
    'a later bracket in ordinary boundary-heading prose became a gate slot', headingProse)
  for (const ownedOutside of [
    '# Fidelity violations\n# Section [contradiction] OPEN\n# Findings\n',
    '# Fidelity violations\n# 1 [contradiction] OPEN\n# Findings\n'
  ]) {
    const model = parseReview(scanMarkdown(ownedOutside, { frontmatter: true }), contract)
    check(model.gateShapeCandidates.length === 0 && model.insideKinds.length === 1 &&
      model.gateBlocking.length === 1 && model.outsideKinds.length === 0 && model.blockingMarks.length === 1,
    'a non-gate-shaped boundary laundered a violation encountered while the gate was live', ownedOutside)
  }

  for (const materializedPlaceholder of [
    '# Fidelity violations\n# [<kind>] REAL OPEN\n# Findings\n',
    '# Fidelity violations\n# [{kind}] [contradiction] OPEN\n# Findings\n'
  ]) {
    const model = parseReview(scanMarkdown(materializedPlaceholder, { frontmatter: true }), contract)
    check(model.gateShapeCandidates.length === 1 && !model.gateShapeCandidates[0].template &&
      model.gateBlocking.length === 1,
    'a placeholder-shaped gate slot erased real content on the same line', materializedPlaceholder)
  }
  {
    const purePlaceholder = '# Fidelity violations\n## [<kind>] <where> -- <what>\n# Findings\n'
    const model = parseReview(scanMarkdown(purePlaceholder, { frontmatter: true }), contract)
    check(model.gateShapeCandidates.length === 1 && model.gateShapeCandidates[0].template &&
      model.gateBlocking.length === 0,
    'a pure gate placeholder became a blocking record', purePlaceholder)
  }
  {
    const boundaryPlaceholder = '# Fidelity violations\n# [<kind>] <where> -- <what>\n- [typo] REAL VIOLATION\n# Findings\n'
    const model = parseReview(scanMarkdown(boundaryPlaceholder, { frontmatter: true }), contract)
    check(model.gateShapeCandidates[0]?.template === true && model.gateShapeCandidates[0].mark.fromGate &&
      model.gateBlocking.length === 1 && model.gateBlocking[0].text.includes('[<kind>]'),
    'a template-shaped boundary closed the gate and laundered the following record', boundaryPlaceholder)
  }
  for (const [malformed, slotState] of [
    ['# Fidelity violations\n# [] REAL\n# Findings\n', 'blank'],
    ['# Fidelity violations\n# [typo\n# Findings\n', 'unclosed']
  ]) {
    const model = parseReview(scanMarkdown(malformed, { frontmatter: true }), contract)
    check(model.gateShapeCandidates.length === 1 && model.gateShapeCandidates[0].slotState === slotState &&
      model.gateBlocking.length === 1,
    `a ${slotState} gate slot collapsed into template noise`, malformed)
  }
  for (const insideKnownKind of [
    '# Fidelity violations\n## Section [contradiction] OPEN\n# Findings\n',
    '# Fidelity violations\n```md\n# Section [contradiction] OPEN\n```\n# Findings\n',
    '# Fidelity violations\n--> prose [contradiction] OPEN\n# Findings\n'
  ]) {
    const model = parseReview(scanMarkdown(insideKnownKind, { frontmatter: true }), contract)
    check(model.insideKinds.length === 1 && model.gateBlocking.length === 1 && model.blockingMarks.length === 1,
    'a known violation kind later on a gate line escaped the shape-free zone rule', insideKnownKind)
  }

  const live = '# Fidelity violations\n```md\n<!-- literal in fence\n- [contradiction] STILL-A-VIOLATION\n```\n# Findings\n'
  const liveModel = parseReview(scanMarkdown(live, { frontmatter: true }), contract)
  check(liveModel.headingCount('Fidelity violations') === 1 && liveModel.gateEntries.length === 1 &&
    liveModel.gateEntries[0].text.includes('STILL-A-VIOLATION'),
  'review fence/comment precedence changed the shape-free gate', live)

  const archived = '# Fidelity violations\n<!--\n- [contradiction] ARCHIVED\n-->\n# Findings\n'
  check(parseReview(scanMarkdown(archived, { frontmatter: true }), contract).gateEntries.length === 0,
    'an archived review violation became live')

  const swallowed = '# Fidelity violations\n<!--\n- [unsupported] SWALLOWED\n--> prose suffix\n# Findings\n'
  const swallowedModel = parseReview(scanMarkdown(swallowed, { frontmatter: true }), contract)
  check(swallowedModel.commentIncidents.length === 1 && swallowedModel.commentIncidents[0].count === 1,
    'review comment incident lost swallowed violation evidence', swallowed)

  const yamlComment = '---\n# Findings\nround: 1\n---\n# Fidelity violations\n# Adjudications\n# Human queue\n'
  check(parseReview(scanMarkdown(yamlComment, { frontmatter: true }), contract).lostSections.length === 0,
    'a YAML comment was misreported as a section swallowed by HTML comment', yamlComment)
  const yamlKind = '---\nnote: [contradiction] PARKED\n---\n# Fidelity violations\n# Findings\n# Adjudications\n# Human queue\n'
  const yamlKindModel = parseReview(scanMarkdown(yamlKind, { frontmatter: true }), contract)
  const yamlKindRewrite = rewriteOutsideKinds(yamlKindModel)
  check(yamlKindModel.outsideKinds.length === 1 && yamlKindRewrite.changed === 0 && yamlKindRewrite.manual.length === 1,
    'frontmatter became an archive lane or an automatic rewrite target for a violation kind', yamlKind)

  const fencedHistory = '# Findings\n```js\nconst x = "[contradiction]"\n```\n'
  const fencedRewrite = rewriteOutsideKinds(parseReview(scanMarkdown(fencedHistory, { frontmatter: true }), contract))
  check(fencedRewrite.changed === 0 && fencedRewrite.manual.length === 1 && fencedRewrite.text === fencedHistory,
    'review migration rewrote a fenced code example', fencedHistory)
  for (const unsafe of [
    '# Findings\n- see [contradiction](https://example.test)\n',
    '# Findings\n- run `[unsupported]` here\n',
    '# Findings\n- [^contradiction] footnote citation\n',
    '# Findings\n- [@unsupported] pandoc citation\n',
    '# Findings\n- [contradiction] shortcut link plus prose\n# Fidelity violations\n[contradiction]: https://example.test\n',
    '# Findings\n- [contradiction] shortcut link plus prose\n# Fidelity violations\n[contradiction]: /url "title <!-- audit -->"\n'
  ]) {
    const result = rewriteOutsideKinds(parseReview(scanMarkdown(unsafe, { frontmatter: true }), contract))
    check(result.changed === 0 && result.manual.length === 1 && result.text === unsafe,
      'review migration rewrote Markdown syntax without record-token authority', unsafe)
  }

  // One CR belongs to CRLF. A second is content, not a hidden second line ending; this deliberately
  // retires review.mjs's old two-pass CR exception in favour of the scanner's one physical model.
  const residualCR = '# Fidelity violations\r\r\n- [contradiction] OUTSIDE-BY-CONTRACT\r\r\n'
  const residualModel = parseReview(scanMarkdown(residualCR, { frontmatter: true }), contract)
  check(residualModel.headingCount('Fidelity violations') === 0 && residualModel.outsideKinds.length === 1,
    'a residual CR was silently stripped as a second line ending', residualCR)
  const multiHistory = '# Findings\n- [contradiction] then [unsupported]\n'
  const rewrittenHistory = rewriteOutsideKinds(parseReview(scanMarkdown(multiHistory, { frontmatter: true }), contract))
  check(rewrittenHistory.changed === 1 && rewrittenHistory.manual.length === 1 &&
    !rewrittenHistory.text.includes('[contradiction]') && rewrittenHistory.text.includes('[unsupported]'),
  'review migration claimed authority over a second prose mention on one record line', multiHistory)
  const commentedHistory = '# Findings\n- [contra<!-- audit -->diction] history\n'
  const rewrittenComment = rewriteOutsideKinds(parseReview(scanMarkdown(commentedHistory, { frontmatter: true }), contract))
  check(rewrittenComment.changed === 0 && rewrittenComment.manual.length === 1 && rewrittenComment.text === commentedHistory,
    'review migration claimed exact-token authority across an inline comment', commentedHistory)

  const mixedOrder = '# Findings\n- [unsupported] OUTSIDE-FIRST\n# Fidelity violations\n- [contradiction] INSIDE-SECOND\n# Human queue\n'
  const mixedOrderModel = parseReview(scanMarkdown(mixedOrder, { frontmatter: true }), contract)
  check(mixedOrderModel.blockingMarks.length === 2 &&
    mixedOrderModel.blockingMarks[0].line.start < mixedOrderModel.blockingMarks[1].line.start &&
    mixedOrderModel.blockingMarks[0].text.includes('OUTSIDE-FIRST'),
  'review blocker union exposed policy-discovery order instead of source order', mixedOrder)
}

// Verified-units coverage and both writers share the same live heading/row source positions.
groups++
{
  const source = '<!--x-->## Verified units\n- t900 passes 2/2\n```md\n## Verified units\n- t901 passes 2/2\n```\n## Verified units\n- t001 passes 2/2\n# End\n- t999 passes 2/2\n'
  const model = parseVerifiedUnits(scanMarkdown(source, { frontmatter: true }), { verifiedMarker: 'verified' })
  check(model.headings.length === 1 && model.rows.length === 1 && model.rows[0].ids.includes('t001'),
    'Verified-units model admitted a synthetic/fenced heading or an outside row', source)
  const upgraded = appendVerdicts(model, ' · verified').text
  check(upgraded.includes('- t001 passes 2/2 · verified') && !upgraded.includes('- t999 passes 2/2 · verified') &&
    !upgraded.includes('- t900 passes 2/2 · verified'),
  'verdict writer edited a row outside the live Verified-units section', source)
  const mirrored = insertMirrorRow(model, '- t002 · verified')
  check(mirrored !== null && mirrored.indexOf('- t002 · verified') > mirrored.indexOf('\n## Verified units\n') &&
    mirrored.indexOf('- t002 · verified') < mirrored.indexOf('- t001 passes 2/2'),
  'mirror writer did not splice after the live readable heading', source)
  const covered = parseVerifiedUnits(scanMarkdown('## Verified units\n- t003-t004 · verified\n', { frontmatter: true }), { verifiedMarker: 'verified' })
  check(covered.coveredIds.includes('t003') && covered.coveredIds.includes('t004'),
    'verified range did not produce coverage')
  const wrongDepth = parseVerifiedUnits(scanMarkdown('### Verified units\n- t005 passes 1/1 · verified\n', { frontmatter: true }), { verifiedMarker: 'verified' })
  check(wrongDepth.rows.length === 0 && wrongDepth.coveredIds.length === 0,
    'a heading depth no writer or required-section check accepts granted verification coverage')
  const siblingBoundary = parseVerifiedUnits(scanMarkdown('# Verified units\n## Human queue\n- [open] [user-only] Is t009 verified\n', { frontmatter: true }), { verifiedMarker: 'verified' })
  check(siblingBoundary.rows.length === 0 && siblingBoundary.coveredIds.length === 0,
    'a known verify sibling section was absorbed as verification evidence')
  const malformedContract = verifiedUnitsContract(new Map([
    ['verify.sections', '|Human queue|Adjudications'],
    ['verify.units.verified', 'verified']
  ]))
  const malformedEvidence = parseVerifiedUnits(scanMarkdown('## Human queue\n- [open] [user-only] Is t009 verified\n'), malformedContract)
  check(!malformedContract.valid && !malformedEvidence.contractValid && malformedEvidence.coveredIds.length === 0,
    'an empty positional role shifted Human queue into the verification lane')
  // The same pipe-list rule as the gaps contract: a trailing delimiter is not a fourth role, and
  // rejecting it here reported zero verified coverage and refused migration on a legal schema.
  const trailingContract = verifiedUnitsContract(new Map([
    ['verify.sections', 'Verified units|Human queue|Adjudications|'],
    ['verify.units.verified', 'verified']
  ]))
  const trailingRows = parseVerifiedUnits(scanMarkdown('## Verified units\n- t010 · verified\n', { frontmatter: true }), trailingContract)
  check(trailingContract.valid && trailingContract.sectionName === 'Verified units' &&
    trailingRows.coveredIds.includes('t010'),
  'a trailing pipe delimiter disabled the whole verification contract')
  const loneCR = parseVerifiedUnits(scanMarkdown('## Verified units\r', { frontmatter: true }), { verifiedMarker: 'verified' })
  const loneCRMirror = insertMirrorRow(loneCR, '- t006 · verified')
  check(loneCRMirror === '## Verified units\r\n- t006 · verified\r\n',
    'mirror writer failed to turn an EOF CR into a readable CRLF anchor', loneCRMirror ?? '')
  const commentHeading = parseVerifiedUnits(scanMarkdown('## Verified units <!--\narchive\n-->\n', { frontmatter: true }), { verifiedMarker: 'verified' })
  check(insertMirrorRow(commentHeading, '- t007 · verified') === null,
    'mirror writer accepted a row inserted inside a multi-line comment')
  const commentRow = parseVerifiedUnits(scanMarkdown('## Verified units\n- t008 passes 1/1 <!--\naudit\n-->\n', { frontmatter: true }), { verifiedMarker: 'verified' })
  const commentVerdict = appendVerdicts(commentRow, ' · verified')
  check(commentVerdict.postcondition && commentVerdict.text.includes('- t008 passes 1/1 · verified <!--'),
    'verdict writer hid its suffix inside a multi-line comment', commentVerdict.text)
}

// Coverage keeps one historical level-2 grammar, but receives lexical visibility from the same
// scanner as every other Markdown register.
groups++
{
  const source = '# Coverage\n<!--\n## m900\n- hidden: t900\n-->\n```md\n## m901\n- hidden: t901\n```\n## m001\n- live: t001\n### m002\n- prose: t002\n## legacy\n- m003 — ruled\n'
  const coverage = parseCoverage(scanMarkdown(source))
  check(coverage.materialSections.length === 1 && coverage.materialSections[0].materialId === 'm001',
    'coverage admitted a commented, fenced or wrong-depth material section', source)
  check(coverage.legacySections.length === 1 && coverage.events.some(event => event.role === 'material' && event.text.includes('t002')),
    'coverage changed its level-2 section boundary contract', source)
}

console.log(`markdown-model-properties: groups=${groups} cases=${cases} cartesian=complete`)
