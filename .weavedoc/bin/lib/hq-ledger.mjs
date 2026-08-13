// Human-queue ledger: one lexical read and one structural model for status and validate.
//
// The source file is scanned once by markdown-scan.  This module then decides which visible bullets
// are records, templates or details.  Consumers may bucket/check the returned records, but they do
// not parse the source again.
import { readFileSync, existsSync } from 'node:fs'
import { U } from './core.mjs'
import { join, docIds } from './mine.mjs'
import { scanMarkdown, sectionNodes } from './markdown-scan.mjs'
import { exactLiveLine, missingSlot, parseTaggedBullet } from './ledger-model.mjs'
import { itemBodyFacts, walkLedgerSections } from './ledger-structure.mjs'

const readOrNull = p => { try { return readFileSync(p).toString('latin1') } catch { return null } }

const HQ_STATES = new Set(['open', 'ruled'])
const HQ_OWNERS = new Set(['user-only', 'recommended', 'machine'])

// The empty-ledger idiom belongs to Human queue and questions.md, never gaps.md.  It is byte-domain
// because ledger files are read as latin1 and quoted back byte-for-byte.
export const NONE_IDIOM = new RegExp(`^- \\((${U('없음')}|none)\\)[ \t\r]*$`)

export function hqFiles (m) {
  const out = []
  const v = join(m.truths, 'verify.md')
  if (existsSync(v)) out.push(v)
  for (const d of docIds(m)) {
    const r = join(m.documents, d, 'review.md')
    if (existsSync(r)) out.push(r)
  }
  return out
}

const malformedSlot = s => ['missing', 'unclosed', 'unreachable', 'blank', 'placeholder', 'unknown'].includes(s.type)

function parseSections (sections, contract = {}) {
  const entries = []
  const nodes = []
  const sentinels = []
  const diagnostics = []
  const states = contract.states || HQ_STATES
  const ownerships = contract.ownerships || HQ_OWNERS

  const structure = walkLedgerSections(sections, {
    rootMode: 'literal-peer',
    invalidMode: 'reset',
    fenceMode: 'suspend',
    blankMode: 'preserve'
  })

  for (const group of structure.groups) {
    const groupEntries = []
    const groupSentinels = []
    for (const item of group.items) {
      const parsed = parseTaggedBullet(item.lineNode, ['state', 'ownership'], {
        state: states,
        ownership: ownerships
      })
      const sentinel = exactLiveLine(item.lineNode, NONE_IDIOM)
      const state = sentinel ? missingSlot() : parsed.slots.state
      const ownership = sentinel ? missingSlot() : parsed.slots.ownership
      const templateOwnership = ['missing', 'placeholder', 'known'].includes(ownership.type)
      const facts = itemBodyFacts(item, sentinel ? '' : parsed.remainder, {
        holdUntilReal: !sentinel && state.type === 'placeholder' && templateOwnership
      })
      const template = !sentinel && state.type === 'placeholder' && templateOwnership && facts.body !== 'real'
      const materializedSentinel = sentinel && facts.body === 'real'
      const syntax = sentinel
        ? (materializedSentinel ? 'malformed' : 'valid')
        : (state.type === 'known' && (
            (state.value === 'open' && ownership.type === 'known') ||
            (state.value === 'ruled' && ['known', 'missing'].includes(ownership.type))
          ) ? 'valid' : 'malformed')
      const node = {
        ...item,
        nodeType: sentinel && !materializedSentinel ? 'sentinel' : (template ? 'template' : 'entry'),
        line: facts.line,
        parentId: null,
        materialization: sentinel && !materializedSentinel ? 'sentinel' : (template ? 'template' : 'record'),
        syntax,
        inlineBody: facts.inlineBody,
        body: facts.body,
        content: sentinel ? '' : parsed.remainder,
        slots: { state, ownership },
        kind: sentinel && !materializedSentinel ? 'sentinel' : (state.type === 'known' ? state.value : 'untagged'),
        diagnostics: []
      }
      delete node.lineNode

      if (materializedSentinel) node.diagnostics.push({ code: 'HQ_SENTINEL_CONTENT' })
      else if (!template && malformedSlot(state)) node.diagnostics.push({ code: 'HQ_STATE', slot: state.type })
      if (!sentinel && state.type === 'known' && malformedSlot(ownership) &&
          (state.value === 'open' || (state.value === 'ruled' && ownership.type !== 'missing'))) {
        node.diagnostics.push({ code: 'HQ_OWNERSHIP', slot: ownership.type, enforced: state.value === 'open' })
      }

      nodes.push(node, ...item.detailLines)
      if (node.materialization === 'sentinel') {
        sentinels.push(node)
        groupSentinels.push(node)
      } else if (node.materialization === 'record') {
        entries.push(node)
        groupEntries.push(node)
      }
    }
    if (groupSentinels.length > 0 && groupEntries.length > 0) {
      diagnostics.push({ code: 'HQ_EMPTY_CONTRADICTION', source: groupSentinels[0].source })
    }
  }

  for (const e of entries) {
    diagnostics.push(...e.diagnostics.map(d => ({ ...d, source: e.source })))
  }
  diagnostics.push(...structure.diagnostics)
  return { entries, nodes, sentinels, diagnostics, structure }
}

export function parseHumanQueues (document, contract = {}) {
  return parseSections(sectionNodes(document, 'Human queue'), contract)
}

export function readHumanQueues (file, contract = {}) {
  const source = readOrNull(file)
  const document = scanMarkdown(source ?? '', { frontmatter: true })
  return { readable: source !== null, document, ...parseHumanQueues(document, contract) }
}
