// truths/coverage.md structural model shared by validate and census.
//
// Coverage keeps its historical level-2 grammar (`## mNNN`, `## legacy`): other level-2 headings
// close the current role, while shallower/deeper headings remain prose inside that role. Comments
// and code fences are decided by markdown-scan once, so neither consumer can manufacture a section
// by deleting a comment or count a fenced example as a real mapping.
import { readFileSync } from 'node:fs'
import { scanMarkdown } from './markdown-scan.mjs'

const readOrNull = file => { try { return readFileSync(file).toString('latin1') } catch { return null } }
const visibleLine = line => line.context.startsWith('fence-') ? '' : line.live

export function parseCoverage (document) {
  const materialSections = []
  const legacySections = []
  const otherSections = []
  const events = []
  let current = { role: 'other', materialId: null, lines: [] }

  for (const line of document.lines) {
    const heading = line.heading
    if (heading !== null && heading.level === 2) {
      const material = /^(m[0-9]+)(?:[ \t]|$)/.exec(heading.name)
      if (material !== null) {
        current = { role: 'material', materialId: material[1], heading, lines: [] }
        materialSections.push(current)
      } else if (heading.name === 'legacy') {
        current = { role: 'legacy', materialId: null, heading, lines: [] }
        legacySections.push(current)
      } else {
        current = { role: 'other', materialId: null, heading, lines: [] }
        otherSections.push(current)
      }
      continue
    }

    const text = visibleLine(line)
    const event = {
      source: { id: line.id, line: line.number, start: line.start, end: line.end },
      lineNode: line,
      text,
      role: current.role,
      materialId: current.materialId
    }
    current.lines.push(event)
    events.push(event)
  }

  return {
    document,
    events,
    materialSections,
    legacySections,
    otherSections,
    looseLegacyHeading: document.headings.some(heading => heading.level === 2 && heading.name.toLowerCase() === 'legacy')
  }
}

export function readCoverage (file) {
  const source = readOrNull(file)
  const document = scanMarkdown(source ?? '', { frontmatter: false })
  return { readable: source !== null, ...parseCoverage(document) }
}
