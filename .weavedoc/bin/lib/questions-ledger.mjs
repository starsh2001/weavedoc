// questions.md typed model.  It shares Markdown precedence and slot states with the other ledgers;
// only its policy is local: entries open at column zero and open/proposed are waiting.
import { readFileSync } from 'node:fs'
import { scanMarkdown } from './markdown-scan.mjs'
import { exactLiveLine, missingSlot, parseTaggedBullet } from './ledger-model.mjs'
import { itemBodyFacts, walkLedgerSections } from './ledger-structure.mjs'
import { NONE_IDIOM } from './hq-ledger.mjs'

const DEFAULT_STATES = new Set(['open', 'proposed', 'answered'])
const readOrNull = p => { try { return readFileSync(p).toString('latin1') } catch { return null } }

export function parseQuestions (document, contract = {}) {
  const allowed = contract.states || DEFAULT_STATES
  const waiting = contract.waiting || new Set(['open', 'proposed'])
  const entries = []
  const nodes = []
  const sentinels = []
  const diagnostics = []
  const structure = walkLedgerSections([{ id: 'questions', lines: document.lines }], {
    rootMode: 'column-zero',
    invalidMode: 'reset',
    fenceMode: 'suspend',
    // A blank may separate an item from a continued explanation in ordinary Markdown. It does not
    // revoke the only parent that makes the indented line legible; section/file EOF is the reset.
    blankMode: 'preserve',
    // questions.md has no independent validate gate, so a misindented attempted entry must remain
    // visible to status as a typed malformed record instead of disappearing as unattached prose.
    orphanMode: 'surface'
  })

  for (const item of structure.items) {
    const parsed = parseTaggedBullet(item.lineNode, ['state'], { state: allowed })
    const sentinel = exactLiveLine(item.lineNode, NONE_IDIOM)
    const state = sentinel ? missingSlot() : parsed.slots.state
    const facts = itemBodyFacts(item, sentinel ? '' : parsed.remainder, {
      holdUntilReal: !sentinel && state.type === 'placeholder'
    })
    const template = !sentinel && state.type === 'placeholder' && facts.body !== 'real'
    const materializedSentinel = sentinel && facts.body === 'real'
    let bucket = 'unrecognized'
    if (sentinel && !materializedSentinel) bucket = 'sentinel'
    else if (item.attachment === 'orphan') bucket = 'unrecognized'
    else if (state.type === 'known') bucket = waiting.has(state.value) ? 'waiting' : 'closed'
    const node = {
      ...item,
      nodeType: sentinel && !materializedSentinel ? 'sentinel' : (template ? 'template' : 'entry'),
      line: facts.line,
      parentId: null,
      materialization: sentinel && !materializedSentinel ? 'sentinel' : (template ? 'template' : 'record'),
      syntax: sentinel
        ? (materializedSentinel ? 'malformed' : 'valid')
        : (state.type === 'known' && item.attachment !== 'orphan' ? 'valid' : 'malformed'),
      inlineBody: facts.inlineBody,
      body: facts.body,
      content: sentinel ? '' : parsed.remainder,
      slots: { state },
      bucket,
      diagnostics: []
    }
    delete node.lineNode
    if (materializedSentinel) node.diagnostics.push({ code: 'QUESTION_SENTINEL_CONTENT' })
    else if (item.attachment === 'orphan') node.diagnostics.push({ code: 'QUESTION_ORPHAN' })
    else if (!template && state.type !== 'known') node.diagnostics.push({ code: 'QUESTION_STATE', slot: state.type })
    nodes.push(node, ...item.detailLines)
    if (node.materialization === 'sentinel') sentinels.push(node)
    else if (node.materialization === 'record') entries.push(node)
  }

  const activeSentinels = sentinels.filter(node => node.materialization === 'sentinel')
  if (activeSentinels.length > 0 && entries.length > 0) {
    diagnostics.push({ code: 'QUESTION_EMPTY_CONTRADICTION', source: activeSentinels[0].source })
  }
  for (const entry of entries) diagnostics.push(...entry.diagnostics.map(d => ({ ...d, source: entry.source })))
  diagnostics.push(...structure.diagnostics)
  return { entries, nodes, sentinels, diagnostics, structure }
}

export function readQuestions (file, contract = {}) {
  const source = readOrNull(file)
  const document = scanMarkdown(source ?? '', { frontmatter: false })
  return { readable: source !== null, document, ...parseQuestions(document, contract) }
}
