// Node side of the foundation differential. Reads tests/foundation-cases.tsv and emits one
// normalised answer per row; tests/foundation-parity.sh emits the same rows from the BASH
// originals and diffs the two. See core.mjs for why this comparison exists.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonId, isDate, listField, pipes, inList, isPlaceholder, fmKey, fmVal } from '../.weavedoc/bin/lib/core.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const table = readFileSync(join(HERE, 'foundation-cases.tsv'), 'utf8')

const unsentinel = s => (s === '<E>' ? '' : s)
// Answers are (rc, text). Newlines are escaped so one answer is one line, which is what makes the
// two sides diffable at all.
const esc = s => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t')

for (const raw of table.split('\n')) {
  const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
  if (line === '' || line.startsWith('#')) continue
  const f = line.split('\t')
  const rule = f[0]
  const a = unsentinel(f[1] ?? '')
  const b = unsentinel(f[2] ?? '')
  let rc = 0
  let outp = ''
  switch (rule) {
    case 'canon_id': { const r = canonId(a); rc = r === null ? 1 : 0; outp = r === null ? '' : r; break }
    case 'is_date': rc = isDate(a) ? 0 : 1; break
    // listfield/pipes report as the bash REPLY does: items newline-joined WITH a trailing newline
    // when non-empty, so the shapes are compared and not just the members.
    case 'listfield': { const it = listField(a); outp = it.length ? it.join('\n') + '\n' : ''; break }
    case 'pipes': { const it = pipes(a); outp = it.length ? it.join('\n') + '\n' : ''; break }
    case 'in_list': rc = inList(a, b) ? 0 : 1; break
    case 'is_placeholder': rc = isPlaceholder(a) ? 0 : 1; break
    case 'fmval': outp = fmVal(a); break
    case 'fmkey': outp = fmKey(a); break
    default: rc = 99; outp = 'UNKNOWN-RULE'
  }
  process.stdout.write(`${rule}\t${f[1] ?? ''}\t${f[2] ?? ''}\t${rc}\t${esc(outp)}\n`)
}
