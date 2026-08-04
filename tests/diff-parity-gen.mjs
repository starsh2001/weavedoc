// Generate the case pairs for tests/diff-parity.sh and run lib/diff.mjs over each one.
//
// Deterministic PRNG on purpose: a differential that changes its inputs every run cannot be
// reproduced when it finally fails. Widen the search by raising the count, not by reading the clock.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { diffNormal, diffLines } from '../.weavedoc/bin/lib/diff.mjs'

const WORK = process.argv[2]
const N = parseInt(process.argv[3] ?? '200', 10)
for (const d of ['A', 'B', 'N']) mkdirSync(`${WORK}/${d}`, { recursive: true })

let seed = 20260804
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
const ri = n => Math.floor(rnd() * n)

// A small alphabet makes accidental matches — and therefore ambiguous alignments — common, which is
// exactly where two implementations of "shortest edit script" are most likely to disagree.
const WORDS = ['alpha', 'beta', '위약', '대금', '- t001: 계약', '', '## 태그', 'x', 'y', '🔴 emoji']
const mkfile = n => Array.from({ length: n }, () => WORDS[ri(WORDS.length)])

function perturb (lines) {
  const out = lines.slice()
  const ops = 1 + ri(4)
  for (let k = 0; k < ops; k++) {
    if (out.length === 0 || rnd() < 0.34) out.splice(ri(out.length + 1), 0, `INS-${ri(1000)}`)
    else if (rnd() < 0.5) out.splice(ri(out.length), 1)
    else out[ri(out.length)] = `CHG-${ri(1000)}`
  }
  return out
}

const cases = []
// Hand-picked shapes first: the ones an off-by-one or a missing no-newline marker hides in.
const H = ['a', 'b', 'c']
cases.push([[], []], [[], H], [H, []], [H, H])
cases.push([H, ['a', 'b']], [['a', 'b'], H], [['x'], H], [H, ['x']])
cases.push([['a', 'b'], ['a', 'B']], [['a', 'b'], ['A', 'b']])
for (let i = 0; i < N; i++) {
  const base = mkfile(1 + ri(30))
  cases.push([base, perturb(base)])
}

let idx = 0
const emit = (a, b, aNoEol, bNoEol) => {
  const nm = `case${String(idx++).padStart(5, '0')}`
  const txt = (ls, noEol) => (ls.length === 0 ? '' : ls.join('\n') + (noEol ? '' : '\n'))
  writeFileSync(`${WORK}/A/${nm}`, txt(a, aNoEol))
  writeFileSync(`${WORK}/B/${nm}`, txt(b, bNoEol))
  const da = diffLines(readFileSync(`${WORK}/A/${nm}`, 'utf8'))
  const db = diffLines(readFileSync(`${WORK}/B/${nm}`, 'utf8'))
  const o = diffNormal(da.lines, db.lines, da.noEol, db.noEol)
  writeFileSync(`${WORK}/N/${nm}`, o.length === 0 ? '' : o.join('\n') + '\n')
}

for (const [a, b] of cases) {
  // Every case is emitted in all four trailing-newline combinations — that axis is invisible in the
  // line text and is precisely where this implementation was first found wrong.
  for (const an of [false, true]) for (const bn of [false, true]) emit(a, b, an, bn)
}

// And the real thing: the generated views of the real mine against perturbed copies of themselves.
// tree.md matters most — the same truth appears under every tag it carries, so identical lines
// genuinely repeat there, which is the ambiguity the randomised cases only simulate.
for (const real of ['D:/repo/eclypse/truths/index.md', 'D:/repo/eclypse/truths/tree.md']) {
  if (!existsSync(real)) continue
  const lines = readFileSync(real, 'utf8').replace(/\r/g, '').replace(/\n$/, '').split('\n')
  for (let k = 0; k < 12; k++) emit(lines, perturb(lines), false, false)
}
console.log(`diff-parity: generated ${idx} case(s)`)
