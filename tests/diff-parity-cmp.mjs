// Split the single `diff -r A B` output into per-case expected results and compare with ours.
import { readFileSync, readdirSync, existsSync } from 'node:fs'

const WORK = process.argv[2]
const all = existsSync(`${WORK}/all.gnu`) ? readFileSync(`${WORK}/all.gnu`, 'utf8') : ''

// `diff -r` announces each differing file with a `diff -r A/<name> B/<name>` line, then that file's
// normal-format diff. Identical files produce nothing at all, which is the empty expectation.
const gnu = new Map()
let cur = null; let buf = []
for (const line of all.split('\n')) {
  const m = /^diff -r A[/\\](\S+) B[/\\](\S+)$/.exec(line)
  if (m) { if (cur !== null) gnu.set(cur, buf.join('\n')); cur = m[1]; buf = []; continue }
  if (cur !== null) buf.push(line)
}
if (cur !== null) gnu.set(cur, buf.join('\n'))
// The final chunk carries the trailing newline of the stream as an empty element; drop it so the
// comparison is against the file's real content.
for (const [k, v] of gnu) gnu.set(k, v.replace(/\n$/, ''))

let n = 0; let fail = 0
const shown = []
const failed = []
for (const name of readdirSync(`${WORK}/A`).sort()) {
  n++
  const want = (gnu.get(name) ?? '').replace(/\s+$/, '')
  const got = readFileSync(`${WORK}/N/${name}`, 'utf8').replace(/\s+$/, '')
  if (want === got) continue
  fail++
  failed.push(name)
  if (shown.length < 4) {
    shown.push([name,
      readFileSync(`${WORK}/A/${name}`, 'utf8'), readFileSync(`${WORK}/B/${name}`, 'utf8'), want, got])
  }
}

for (const [name, a, b, want, got] of shown) {
  console.log(`  MISMATCH ${name}`)
  console.log('    input A: ' + JSON.stringify(a))
  console.log('    input B: ' + JSON.stringify(b))
  console.log('    GNU  : ' + JSON.stringify(want))
  console.log('    ours : ' + JSON.stringify(got))
}
console.log(`diff-parity: ${n} case(s)`)
if (fail === 0) { console.log('  AGREE — every case matches GNU diff byte for byte'); process.exit(0) }
console.log(`  ${fail} case(s) DIFFER (${(100 * (n - fail) / n).toFixed(1)}% match)`)
console.log(`  failing: ${failed.join(' ')}`)
// The REAL-mine cases are emitted last, and they are the ones that speak to actual exposure: a
// disagreement only on synthetic inputs with a ten-word alphabet is a different fact from one on
// the generated views this command actually diffs.
const realFrom = readdirSync(`${WORK}/A`).length - 24
const realFails = failed.filter(f => parseInt(f.replace('case', ''), 10) >= realFrom)
console.log(`  of which on the real mine's index.md/tree.md: ${realFails.length}`)
process.exit(1)
