// Shared structural primitives for WeaveDoc's three human-written ledgers.
//
// Values here are discriminated states, not sentinels.  In particular, `missing`, `unclosed`,
// `blank`, `placeholder`, `known` and `unknown` are different facts.  A consumer must select the
// states it means; it cannot accidentally turn an unclosed slot into an open record because both
// happened to be represented by a non-empty string.
import { TAG_LEAD } from './core.mjs'

const SLOT_SEP = /^[ \t\v\f\r]*/

const asLine = input => typeof input === 'string'
  ? { live: input, raw: input, hidden: [] }
  : { live: input.live, raw: input.raw, hidden: input.hidden || [] }

const hiddenAt = (line, offset) => line.hidden.some(span => offset >= span.start && offset < span.end)
const originalAt = (line, offset) => !hiddenAt(line, offset) && line.live[offset] === line.raw[offset]

// The historical placeholder rule is byte-domain and intentionally narrow.  Keep one spelling for
// every ledger while the input string remains in the caller's domain (ledger callers use latin1).
export function stripTemplate (s) {
  return s
    .replace(/\{[^{}]*\}/g, '')
    .replace(/<[^<>]*>/g, '')
    .replace(/[[\](){}<>\xe2\x80\x94\xc2\xb7:,.-]+/g, '')
    .replace(/[ \t]+/g, '')
}

export const hasRealContent = s => stripTemplate(s) !== ''

export function splitLead (input) {
  const line = asLine(input)
  const candidate = TAG_LEAD.exec(line.live)[0]
  let end = 0
  while (end < candidate.length && originalAt(line, end)) end++
  return {
    lead: line.live.slice(0, end),
    rest: line.live.slice(end),
    offset: end,
    // `layoutEnd` is where the first live non-layout byte begins. It may be later than `offset`
    // when a closed comment interrupts otherwise source-authentic indentation. Structural
    // attachment uses `lead`; display/body extraction resumes at `layoutEnd`.
    layoutEnd: candidate.length,
    visibleRest: line.live.slice(candidate.length),
    // A comment cannot become indentation merely because its bytes are column-preserving blanks.
    obstructed: end < candidate.length
  }
}

export function exactLiveLine (input, pattern) {
  const line = asLine(input)
  return line.hidden.length === 0 && line.live === line.raw && pattern.test(line.live)
}

export function parseSlot (text, at = 0) {
  if (text[at] !== '[') return { type: 'missing', start: at, end: at }
  const close = text.indexOf(']', at + 1)
  if (close < 0) return { type: 'unclosed', start: at, end: text.length, raw: text.slice(at) }
  return { type: 'closed', start: at, end: close + 1, value: text.slice(at + 1, close) }
}

export function classifySlot (slot, allowed = null) {
  if (slot.type !== 'closed') return slot
  const value = slot.value
  if (/^[ \t\v\f\r]*$/.test(value)) return { ...slot, type: 'blank' }
  if (/^[<{]/.test(value) && stripTemplate(value) === '') return { ...slot, type: 'placeholder' }
  if (allowed !== null && allowed.has(value)) return { ...slot, type: 'known' }
  return { ...slot, type: allowed === null ? 'value' : 'unknown' }
}

export const missingSlot = (at = 0) => ({ type: 'missing', start: at, end: at })

// Parse a bullet followed by a fixed number of bracket slots.  Missing later slots stay missing;
// a malformed earlier slot stops the prefix. An unclosed slot owns the rest of the physical line,
// so it is not also body content; its raw spelling remains on the typed slot for diagnostics.
// A missing slot owns no bytes, leaving the same position available as body. Separators are the
// exact ledger tag separators, not general Unicode whitespace.
export function parseTaggedBullet (input, slotNames, allowedByName = {}) {
  const line = asLine(input)
  const { lead, rest, offset, obstructed } = splitLead(line)
  const loc = { lead, rest }
  if (obstructed || !rest.startsWith('- ') ||
      line.raw.slice(offset, offset + 2) !== '- ' ||
      !originalAt(line, offset) || !originalAt(line, offset + 1)) {
    return { type: 'not-bullet', ...loc, slots: {}, prefixEnd: lead.length, remainder: rest }
  }

  const slots = {}
  let pos = 2
  let unreachable = null
  for (let slotIndex = 0; slotIndex < slotNames.length; slotIndex++) {
    const name = slotNames[slotIndex]
    if (unreachable !== null) {
      slots[name] = { type: 'unreachable', start: pos, end: pos, because: unreachable }
      continue
    }
    // `- ` is the complete bullet delimiter.  The first slot starts immediately after it; accepting
    // another blank here would silently widen all three ledger grammars (`-  [open]`).
    if (slotIndex > 0) {
      const possible = SLOT_SEP.exec(rest.slice(pos))[0]
      let sep = 0
      while (sep < possible.length && originalAt(line, offset + pos + sep)) sep++
      pos += sep
    }
    const parsed = parseSlot(rest, pos)
    slots[name] = classifySlot(parsed, Object.prototype.hasOwnProperty.call(allowedByName, name) ? allowedByName[name] : null)
    if (parsed.type !== 'closed') {
      unreachable = { slot: name, state: parsed.type }
      // `unclosed.end` is EOL while `missing.end` is the current position. Updating in both cases
      // separates the malformed tag prefix from the semantic body without a consumer-specific
      // exception; all three ledgers then fold a real continuation the same way.
      pos = parsed.end
      continue
    }
    pos = parsed.end
  }
  return {
    type: 'bullet',
    ...loc,
    slots,
    prefixEnd: lead.length + pos,
    remainder: rest.slice(pos)
  }
}

export function bodyState (text) {
  if (/^[ \t\v\f\r]*$/.test(text)) return 'empty'
  return hasRealContent(text) ? 'real' : 'template'
}

export function mergeBodyState (left, right) {
  if (left === 'real' || right === 'real') return 'real'
  if (left === 'template' || right === 'template') return 'template'
  return 'empty'
}

export function leadRelation (parentLead, lead) {
  if (parentLead === null) return 'root'
  if (lead.length > parentLead.length && lead.startsWith(parentLead)) return 'child'
  if (lead === parentLead) return 'peer'
  return 'separate'
}

export const controlOnlyLead = lead => /^[\v\f\r]*$/.test(lead)

export function sourceRef (line, suffix = '') {
  return {
    id: `${line.id}${suffix}`,
    line: line.number,
    start: line.start,
    end: line.end
  }
}
