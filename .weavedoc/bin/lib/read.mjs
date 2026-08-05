// WeaveDoc foundations — the readers. Pure rules live in core.mjs; these turn files into values.
//
// Ported against the bash originals and checked by the foundation differential over a REAL mine
// (every truth and material in eclypse), not a table — because the interesting disagreements here
// are in real data: a comment that is not a comment, a value that keeps its own '#', a key spelled
// with a dot.
import { readFileSync, existsSync } from 'node:fs'
import { fmKey, fmVal, isFence, isFmLine, splitLines } from './core.mjs'

// `enc` exists for validate, which works in the byte domain: 'latin1' gives one char per byte, so a
// value holding invalid UTF-8 survives to be quoted back exactly as the runtime being replaced
// quotes it. Every other caller takes the default and is unaffected.
const readOr = (p, fb = '', enc = 'utf8') => { try { return readFileSync(p).toString(enc) } catch { return fb } }

// ---- schema ------------------------------------------------------------------------------
// Flat `key: value`, first spelling of a key wins. The value keeps its trailing whitespace — the
// bash reader does not strip it either, and a port that "tidied" that would be a silent change.
// A CARRIAGE RETURN IS NOT STRIPPED HERE, and that is the bash reader, not an oversight. `sch_load`
// is `while IFS= read -r line`, which keeps it; `cfg_load` one function over adds `line=${line%$'\r'}`
// and strips it. Two readers, two rules, and the port had unified them — measured on a CRLF schema:
// `project.fm.required` becomes `version|language|roles\r`, so bash reports SEVEN problems (the last
// key of every schema list is unmatchable) while the port reported none. Both bash platforms agree
// there, so this is not the declared CRLF divergence; it is the port being lenient where the runtime
// it replaces blocks. A CRLF schema is reachable: `core.autocrlf=true` is the Windows default and a
// user's own mine carries no .gitattributes pin.
const schemaLines = s => { const l = s.split('\n'); if (l.length && l[l.length - 1] === '') l.pop(); return l }

export function loadSchema (schemaPath, enc = 'utf8') {
  const m = new Map()
  for (const line of schemaLines(readOr(schemaPath, '', enc))) {
    if (line === '' || line.startsWith('#')) continue
    const i = line.indexOf(':')
    if (i < 0) continue
    const k = line.slice(0, i)
    if (k === '' || /[^a-zA-Z0-9._]/.test(k)) continue
    if (!m.has(k)) m.set(k, line.slice(i + 1).replace(/^[ \t]+/, ''))
  }
  return m
}

// ---- config ------------------------------------------------------------------------------
// ONE pass fills two views, exactly as cfg_load does:
//   flat: first match of a key ANYWHERE (what cfgval means)
//   sect: section.key (what cfg2 means) — the section walls are what make two knobs two knobs
//
// The comment rule here is NOT the frontmatter rule, and the difference is deliberate on the bash
// side, so it is reproduced rather than harmonised: a trailing comment is stripped only when
// preceded by whitespace, and a value that is ENTIRELY a comment (`key: #note`) keeps the literal
// `#note`, because after the leading trim there is no whitespace left in front of the '#'.
export function loadConfig (configPath, enc = 'utf8') {
  const flat = new Map()
  const sect = new Map()
  let sec = ''
  for (const line of splitLines(readOr(configPath, '', enc))) {
    const t = line.replace(/^[ \t]+/, '')
    if (t === '' || t.startsWith('#')) continue
    const i = t.indexOf(':')
    if (i < 0) continue
    const k = t.slice(0, i)
    if (k === '' || /[^A-Za-z0-9_.-]/.test(k)) continue
    let v = t.slice(i + 1).replace(/^[ \t]+/, '')
    if (!v.startsWith('"')) v = v.replace(/[ \t]#[\s\S]*$/, '')
    v = v.replace(/[ \t]+$/, '')
    if (t === line) {
      // No indentation: a top-level key, which also opens a section for the lines beneath it.
      sec = k
    } else {
      const kk = `${sec}.${k}`
      if (!(sec !== '' && sect.has(kk))) sect.set(kk, v)
    }
    if (v !== '' && !flat.has(k)) flat.set(k, v)
  }
  return { flat, sect }
}

// A `paths:` value, resolved against ROOT. Deliberately its own scan and NOT a lookup in the maps
// above: the bash `cfg()` matches an INDENTED key followed by a colon and at least one space, from
// any section, and strips a trailing comment even with no space before the '#'. Three small
// differences from cfg_load, and a port that assumed they were the same rule would resolve a
// redirected folder differently from the runtime it is replacing.
export function cfgPath (configPath, key, dflt, root) {
  let v = ''
  const re = new RegExp(`^[ \\t]+${key.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}:[ \\t]`)
  for (const line of splitLines(readOr(configPath))) {
    if (!re.test(line)) continue
    v = line.replace(re, '').replace(/^[ \t]*/, '').replace(/[ \t]*#[\s\S]*$/, '').replace(/[ \t]*$/, '')
    break
  }
  if (v === '') v = dflt
  if (v.startsWith('/')) return v
  if (/^[A-Za-z]:[\\/]/.test(v)) return v.replace(/\\/g, '/')
  return `${root}/${v}`
}

// ---- frontmatter -------------------------------------------------------------------------
// Line 1 opens the block, and the fence pattern has ONE spelling: `---` plus optional trailing
// whitespace. A bare "---" comparison once split on a trailing space and disabled a seal.
export function hasFm (file) {
  if (!existsSync(file)) return false
  return isFence(splitLines(readOr(file))[0] ?? '')
}

// Parse a file's frontmatter ONCE into key -> value. First spelling of a key wins. Reading stops at
// the closing fence, so a body line shaped like a key is body, not frontmatter.
export function fmLoad (file) {
  const m = new Map()
  const lines = splitLines(readOr(file))
  if (lines.length === 0) return m
  if (!isFence(lines[0])) return m
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (isFence(line)) break
    if (!isFmLine(line)) continue
    const k = fmKey(line)
    if (!m.has(k)) m.set(k, fmVal(line))
  }
  return m
}

const FM_CACHE = new Map()
export function fmv (file, key) {
  let m = FM_CACHE.get(file)
  if (m === undefined) { m = fmLoad(file); FM_CACHE.set(file, m) }
  return m.get(key) ?? ''
}

// The same parse in the BYTE domain, for validate — which quotes frontmatter values back in its
// diagnostics and must print the bytes the file holds, not their UTF-8 decoding. Separate cache,
// because the same file yields different strings in the two domains and one map cannot hold both.
// The parsing rules are shared: every pattern they use is ASCII, so they read a byte-domain line
// exactly as they read a decoded one.
const FM_CACHE_B = new Map()
export function fmLoadBytes (file) {
  const m = new Map()
  let lines
  try { lines = splitLines(readFileSync(file).toString('latin1')) } catch { return m }
  if (lines.length === 0 || !isFence(lines[0])) return m
  for (let i = 1; i < lines.length; i++) {
    if (isFence(lines[i])) break
    if (!isFmLine(lines[i])) continue
    const k = fmKey(lines[i])
    if (!m.has(k)) m.set(k, fmVal(lines[i]))
  }
  return m
}
export function fmvB (file, key) {
  let m = FM_CACHE_B.get(file)
  if (m === undefined) { m = fmLoadBytes(file); FM_CACHE_B.set(file, m) }
  return m.get(key) ?? ''
}

// Content caches are per-PROCESS, and a WRITE command that re-validates in the same process would
// otherwise validate the bytes it cached BEFORE its own edits. The bash runtime clears its
// frontmatter and file caches at the top of cmd_validate for exactly this reason (a v0.3.1
// self-catch: the marker `upgrade` had just written was invisible to the very validation gating it).
// retag and consecrate both re-validate in process, so they call this first.
export function clearFileCaches () {
  FM_CACHE.clear()
  FM_CACHE_B.clear()
}
