// gaps.md typed register model.  Every physical bullet becomes exactly one template or record;
// missing/unclosed/blank/placeholder/known/unknown kind slots remain distinct all the way to the
// consumers.  status, validate and `weavedoc gaps` select from this model instead of interpreting
// `null`, empty strings and arbitrary tails differently.
import { pipes } from './core.mjs'
import { scanMarkdown, sectionNodes } from './markdown-scan.mjs'
import { parseTaggedBullet, sourceRef } from './ledger-model.mjs'
import { itemBodyFacts, walkLedgerSections } from './ledger-structure.mjs'

const issueCode = slot => {
  switch (slot.type) {
    case 'missing': return 'missing-kind'
    case 'unclosed': return 'unclosed-kind'
    case 'blank': return 'blank-kind'
    case 'placeholder': return 'placeholder-kind'
    case 'unknown': return 'unknown-kind'
    default: return null
  }
}
const countsAsGap = slot => ['known', 'unknown', 'placeholder'].includes(slot.type)

// The schema fields are positional contracts, not bags with defaults. Dropping an empty first
// section silently moves Accepted into Open; deduplicating kinds hides a malformed vocabulary.
// Every gaps consumer receives this same closed result and disables both roles when it is invalid.
//
// SPLIT BY core.pipes(), not by `split('|')`. "How a pipe list is read" has exactly one spelling in
// this runtime (bash word splitting with IFS='|': interior and leading empties survive, ONE trailing
// delimiter adds nothing), and validate still reads `review.sections` through it. A second spelling
// here made a trailing `|` — legal everywhere else — invalidate the whole register and disable both
// role views, which is the two-answers class this release exists to end.
export function gapRegisterContract (schema) {
  const get = key => schema?.get?.(key)
  const rawSections = get('gaps.sections')
  const rawKinds = get('gaps.enum.kind')
  const sectionNames = pipes(rawSections)
  const kindNames = pipes(rawKinds)
  const distinctSections = new Set(sectionNames)
  const distinctKinds = new Set(kindNames)
  const validSections = sectionNames.length === 2 && sectionNames.every(name => name !== '') &&
    distinctSections.size === sectionNames.length
  const validKinds = kindNames.length > 0 && kindNames.every(name => name !== '') &&
    distinctKinds.size === kindNames.length
  const errors = []
  if (!validSections) {
    errors.push(sectionNames.length === 2 && sectionNames[0] === sectionNames[1] && sectionNames[0] !== ''
      ? 'one section cannot hold both roles; gaps.sections must contain two distinct non-empty positional names'
      : 'gaps.sections must contain exactly two distinct non-empty positional names (open|accepted)')
  }
  if (!validKinds) errors.push('gaps.enum.kind must contain one or more distinct non-empty kind names')
  return {
    valid: validSections && validKinds,
    error: errors.join('; '),
    sectionNames,
    kindNames,
    openName: validSections ? sectionNames[0] : null,
    acceptedName: validSections ? sectionNames[1] : null,
    kinds: validKinds ? new Set(kindNames) : new Set()
  }
}

function parseGapSections (sections, kindSet) {
  const entries = []
  const nodes = []
  const diagnostics = []
  const structure = walkLedgerSections(sections, {
    rootMode: 'column-zero',
    invalidMode: 'stop',
    fenceMode: 'stop',
    blankMode: 'reset'
  })

  for (const item of structure.items) {
    const parsed = parseTaggedBullet(item.lineNode, ['kind'], { kind: kindSet })
    const kind = parsed.slots.kind
    const facts = itemBodyFacts(item, parsed.remainder, { holdUntilReal: kind.type === 'placeholder' })
    const template = kind.type === 'placeholder' && facts.body !== 'real'
    const m2 = /^[ \t]*\[([^\]]*)\]/.exec(parsed.remainder)
    const doubleKind = m2 !== null && kindSet.has(m2[1]) ? m2[1] : null
    const issue = issueCode(kind)
    const node = {
      ...item,
      nodeType: template ? 'template' : 'entry',
      line: facts.line,
      parentId: null,
      materialization: template ? 'template' : 'record',
      syntax: !template && kind.type === 'known' && doubleKind === null ? 'valid' : 'malformed',
      inlineBody: facts.inlineBody,
      body: facts.body,
      content: parsed.remainder,
      slots: { kind },
      countsAsGap: !template && countsAsGap(kind),
      diagnostics: []
    }
    delete node.lineNode
    if (!template && issue !== null) node.diagnostics.push({ code: issue, slot: kind.type })
    if (!template && doubleKind !== null) node.diagnostics.push({ code: 'double-kind', value: doubleKind })
    nodes.push(node, ...item.detailLines)
    if (!template) entries.push(node)
  }

  diagnostics.push(...structure.diagnostics)
  for (const e of entries) diagnostics.push(...e.diagnostics.map(d => ({ ...d, source: e.source, raw: e.raw })))
  return { entries, nodes, diagnostics, badLine: structure.badLine, structure }
}

export function parseGapRegister (document, contract) {
  const contractValid = contract.valid !== false
  const sameRole = contractValid && contract.openName === contract.acceptedName
  const boundaries = contractValid ? new Set([contract.openName, contract.acceptedName]) : new Set()
  const openSections = contractValid ? sectionNodes(document, contract.openName, { boundaries }) : []
  // One physical section cannot simultaneously mean unresolved and accepted. Keep the first role
  // visible, make the second empty, and surface the invalid contract in the model itself so every
  // consumer (not only validate) gives one answer.
  const acceptedSections = !contractValid || sameRole ? [] : sectionNodes(document, contract.acceptedName, { boundaries })
  const open = parseGapSections(openSections, contract.kinds)
  const accepted = parseGapSections(acceptedSections, contract.kinds)

  const inside = new Set()
  for (const section of [...openSections, ...acceptedSections]) {
    inside.add(section.heading.line)
    for (const line of section.lines) inside.add(line.number)
  }
  const stray = []
  for (const line of document.lines) {
    if (inside.has(line.number)) continue
    const parsed = parseTaggedBullet(line, [])
    if (parsed.type === 'bullet' && parsed.lead === '') stray.push({ source: sourceRef(line), raw: line.live })
  }

  const headingCounts = contractValid
    ? {
        open: document.headings.filter(h => h.name === contract.openName).length,
        accepted: document.headings.filter(h => h.name === contract.acceptedName).length
      }
    : { open: 0, accepted: 0 }
  const structureDiagnostics = []
  if (!contractValid) {
    structureDiagnostics.push({ code: 'invalid-contract', reason: contract.error || 'invalid gaps register contract' })
  } else {
    if (sameRole) structureDiagnostics.push({ code: 'invalid-contract', reason: 'one section cannot hold both roles', name: contract.openName })
    if (headingCounts.open !== 1) structureDiagnostics.push({ code: 'section-count', role: 'open', name: contract.openName, count: headingCounts.open })
    if (headingCounts.accepted !== 1) structureDiagnostics.push({ code: 'section-count', role: 'accepted', name: contract.acceptedName, count: headingCounts.accepted })
  }
  for (const entry of stray) structureDiagnostics.push({ code: 'stray-entry', entry })

  return {
    document,
    open,
    accepted,
    stray,
    headingCounts,
    structureDiagnostics
  }
}

export function parseGapText (text, contract) {
  return parseGapRegister(scanMarkdown(text, { frontmatter: false }), contract)
}
