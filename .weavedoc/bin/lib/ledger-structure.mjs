// Neutral loose-list structure shared by Human queue, questions.md and gaps.md.
//
// This pass knows nothing about state/kind/ownership values.  It first decides which physical lines
// are items and which are their details, preserving source identity and section boundaries.  Ledger
// adapters classify the completed items afterwards, so template/sentinel materialisation and display
// folding cannot depend on streaming mutation order (`parent`/`held`/`fold`).
import {
  bodyState,
  controlOnlyLead,
  leadRelation,
  mergeBodyState,
  parseTaggedBullet,
  sourceRef,
  splitLead
} from './ledger-model.mjs'

const MODES = new Set(['literal-peer', 'column-zero'])
const ACTIONS = new Set(['reset', 'stop'])
const FENCE_ACTIONS = new Set(['suspend', 'stop'])
const BLANK_MODES = new Set(['preserve', 'reset'])
const ORPHAN_MODES = new Set(['reject', 'surface'])

export function walkLedgerSections (sections, policy = {}) {
  const rootMode = policy.rootMode || 'column-zero'
  const invalidMode = policy.invalidMode || 'reset'
  const fenceMode = policy.fenceMode || (invalidMode === 'stop' ? 'stop' : 'suspend')
  const blankMode = policy.blankMode || 'reset'
  const orphanMode = policy.orphanMode || 'reject'
  if (!MODES.has(rootMode)) throw new Error(`unknown ledger root mode: ${rootMode}`)
  if (!ACTIONS.has(invalidMode)) throw new Error('ledger invalid mode must be reset|stop')
  if (!FENCE_ACTIONS.has(fenceMode)) throw new Error('ledger fence mode must be suspend|stop')
  if (!BLANK_MODES.has(blankMode)) throw new Error('ledger blank mode must be preserve|reset')
  if (!ORPHAN_MODES.has(orphanMode)) throw new Error('ledger orphan mode must be reject|surface')

  const groups = []
  const items = []
  const nodes = []
  const diagnostics = []
  let badLine = null
  let stopped = false

  for (const section of sections) {
    const group = { sectionId: section.id, items: [] }
    let current = null

    for (const line of section.lines) {
      const live = line.live
      // Lexically inert regions suspend ledger state; they do not close it. A fenced example must
      // not materialise a placeholder, but a real continuation after the matching closer still
      // belongs to the item that preceded the example. The fail-closed gaps policy stops at the
      // opener instead. Fence body/closer lines are always inert facts from the shared scanner.
      if (line.context === 'fence-open' || line.context === 'fence-body' || line.context === 'fence-close') {
        if (line.context === 'fence-open' && fenceMode === 'stop') {
          badLine = { source: sourceRef(line), raw: live, reason: 'fence-open' }
          diagnostics.push({ code: 'bad-line', ...badLine })
          stopped = true
          break
        }
        continue
      }

      // A closed comment-only line is not a source blank. `live` alone cannot tell an inert comment
      // from a physical blank; the scanner's raw/hidden provenance keeps that distinction typed.
      if (line.context === 'comment-mixed' && !/[^ \t]/.test(live)) continue

      // Whether a blank continues a loose-list item is policy, not lexical fact. Human queues and
      // questions preserve the parent; the fail-closed gaps register retains its narrower grammar,
      // where prose after a blank cannot be absorbed into the previous record.
      if (!/[^ \t]/.test(live)) {
        if (blankMode === 'reset') current = null
        continue
      }

      const split = splitLead(line)
      const bullet = parseTaggedBullet(line, [])
      const relation = current === null ? 'root' : leadRelation(current.structuralLead, split.lead)
      const rootItem = bullet.type === 'bullet' && (
        rootMode === 'column-zero'
          ? split.lead === ''
          : (controlOnlyLead(split.lead) || relation !== 'child')
      )
      // Column-zero is an admission rule, not permission to erase an attempted record. Human-facing
      // questions opt into a typed orphan item so status can name the indentation error. Fail-closed
      // registers keep the default `reject`, which sends the same line through invalidMode instead
      // of accidentally admitting it as a valid record.
      const orphanItem = bullet.type === 'bullet' && rootMode === 'column-zero' &&
        orphanMode === 'surface' && current === null && /^[ \t]/.test(split.lead)

      if (rootItem || orphanItem) {
        const item = {
          nodeType: 'item',
          attachment: orphanItem ? 'orphan' : 'root',
          source: sourceRef(line),
          sectionId: section.id,
          lineNode: line,
          raw: live,
          lead: split.lead,
          structuralLead: controlOnlyLead(split.lead) ? '' : split.lead,
          detailLines: []
        }
        group.items.push(item)
        items.push(item)
        nodes.push(item)
        if (orphanItem) diagnostics.push({ code: 'orphan-item', source: item.source, raw: live })
        current = item
        continue
      }

      // Only source-authentic lead bytes establish parentage. A closed comment may interrupt that
      // lead without manufacturing it: `  <!-- note -->REAL` is still a child because the two
      // source spaces precede the comment. Its body begins at the first live byte after the masked
      // layout, not at the first hidden byte.
      const detail = /^[ \t]/.test(split.lead) && current !== null &&
        leadRelation(current.structuralLead, split.lead) === 'child'
      if (detail) {
        const content = split.obstructed ? split.visibleRest : live.replace(/^[ \t]+/, '')
        const node = {
          nodeType: 'detail',
          source: sourceRef(line),
          raw: live,
          lead: split.lead,
          parentId: current.source.id,
          attachment: split.obstructed ? 'comment-interrupted' : 'structural',
          content,
          body: bodyState(content)
        }
        current.detailLines.push(node)
        nodes.push(node)
        continue
      }

      // A differently-spelled indent (for example two spaces followed by a TAB line) is not a
      // structural child under the literal-prefix contract. For the two human ledgers, silently
      // dropping its prose is worse than attaching it ambiguously: preserve the bytes for display
      // and materialisation, but retain the ambiguity as a typed diagnostic. The fail-closed gaps
      // policy takes the stop branch below instead.
      const ambiguous = invalidMode === 'reset' && current !== null && /^[ \t]/.test(split.lead)
      if (ambiguous) {
        const content = split.obstructed ? split.visibleRest : live.replace(/^[ \t]+/, '')
        const node = {
          nodeType: 'detail',
          source: sourceRef(line),
          raw: live,
          lead: split.lead,
          parentId: current.source.id,
          attachment: 'ambiguous',
          content,
          body: bodyState(content)
        }
        current.detailLines.push(node)
        nodes.push(node)
        diagnostics.push({ code: 'ambiguous-detail', source: node.source, parentId: node.parentId, raw: live })
        continue
      }

      if (invalidMode === 'stop') {
        badLine = { source: sourceRef(line), raw: live, reason: split.obstructed ? 'masked-prefix' : 'unrecognized-line' }
        diagnostics.push({ code: 'bad-line', ...badLine })
        stopped = true
        break
      }
      current = null
    }

    groups.push(group)
    if (stopped) break
  }

  return { groups, items, nodes, diagnostics, badLine, stopped }
}

export function itemBodyFacts (item, inlineContent, { holdUntilReal = false } = {}) {
  const inlineBody = bodyState(inlineContent)
  let body = inlineBody
  for (const detail of item.detailLines) body = mergeBodyState(body, detail.body)
  // A placeholder bullet is held until a REAL continuation materialises it. Template-only detail
  // before that point is shipped instruction noise, not part of the record; the old walkers all
  // deliberately discarded it. Once realised, later detail belongs to the record normally.
  const firstReal = holdUntilReal ? item.detailLines.findIndex(detail => detail.body === 'real') : 0
  const displayDetails = holdUntilReal && firstReal >= 0 ? item.detailLines.slice(firstReal) : item.detailLines
  const folded = inlineBody === 'real' || displayDetails.length === 0
    ? item.raw
    : `${item.raw} ${displayDetails.map(detail => detail.content).join(' ')}`
  return { inlineBody, body, line: folded }
}
