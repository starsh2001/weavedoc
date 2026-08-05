// weavedoc seal-review <doc-id> [draft|final] — pin what the clean review actually reviewed.
//
// Writes reviewed_kind + reviewed_digest + review_context_digest into review.md's frontmatter. Both
// digests are computed HERE and never by hand, so there is one spelling; the review skill calls this
// the moment a round finishes, while "what the reviewer read" and "what is on disk" are still one
// thing.
//
// A review_legacy marker is REMOVED on seal: the marker means "v1 history, digest-less by
// definition", and a freshly sealed review is neither. Leaving it would park a demotion path —
// strip the seal later and the review reads as legacy again, reopening the gate.
import { statSync } from 'node:fs'
import { isFence, splitLines } from './core.mjs'
import { join, contextDigest, docDraftPath, docFinalPath } from './mine.mjs'
import { artifactDigest } from './verify.mjs'
import { writeAtomic, readText, textBuf } from './write.mjs'

const isFile = p => { try { return statSync(p).isFile() } catch { return false } }
const FENCE = { test: isFence }   // the ONE fence spelling — core.mjs
const SEALED = /^(reviewed_kind|reviewed_digest|review_context_digest|review_legacy)[ \t]*:/

export function cmdSealReview (m, out, d, kindArg) {
  const kind = (kindArg === undefined || kindArg === '') ? 'draft' : kindArg
  if (!d) { out('usage: weavedoc seal-review <doc-id> [draft|final]'); return 2 }
  if (/[/\\]/.test(d) || d === '.' || d === '..') {
    out(`seal-review: '${d}' is not a document id (ids are plain folder names under documents/)`); return 2
  }
  if (kind !== 'draft' && kind !== 'final') { out(`seal-review: kind '${kind}' must be draft|final`); return 2 }

  const rev = join(m.documents, d, 'review.md')
  if (!isFile(rev)) { out(`seal-review: no review.md for '${d}' — run review first`); return 2 }
  // Bytes, not decoded text: this rewrites the whole file to change three frontmatter lines, and
  // the findings prose below them is the reviewer's, in whatever encoding they wrote it.
  const lines = splitLines(readText(rev))
  if (!FENCE.test(lines[0] ?? '')) {
    out("seal-review: review.md has no frontmatter block to seal into (line 1 must be exactly '---') — nothing sealed"); return 2
  }

  const art = kind === 'draft' ? docDraftPath(m, d) : docFinalPath(m, d)
  if (art === null) { out(`seal-review: no ${kind} for '${d}'`); return 2 }
  const adg = artifactDigest(art)
  if (adg === null) { out(`seal-review: cannot digest ${art}`); return 2 }
  const cdg = contextDigest(m, d)

  // THE BLOCK MUST CLOSE. The guard above only proves line 1 is a fence, so an unclosed block used
  // to reach the loop below — where `infm` never clears, the three fields are never inserted, and
  // every existing seal line is dropped on the way past. Measured 2026-08-05: a review that HAD a
  // valid seal came out with none, and the command printed the seal it had just failed to write and
  // exited 0. A seal is the binding between a clean review and the bytes it reviewed; deleting one
  // while reporting success is the worst direction this command can fail in. Refuse instead, and
  // leave the file exactly as it is — the reviewer's own text is not this command's to edit when it
  // cannot do its job.
  if (!lines.slice(1).some(l => FENCE.test(l))) {
    out("seal-review: review.md's frontmatter block never closes (no '---' after line 1) — nothing sealed, and the existing seal is left untouched. Close the block, then re-run"); return 2
  }
  // The three fields go in immediately BEFORE the closing fence, and any earlier spelling of them
  // inside the block is dropped on the way past — so re-sealing replaces rather than accumulates.
  const outl = []
  let infm = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (i === 0 && FENCE.test(line)) { infm = true; outl.push(line); continue }
    if (infm && FENCE.test(line)) {
      outl.push(`reviewed_kind: ${kind}`)
      outl.push(`reviewed_digest: sha256:${adg}`)
      outl.push(`review_context_digest: sha256:${cdg}`)
      infm = false
      outl.push(line)
      continue
    }
    if (infm && SEALED.test(line)) continue
    outl.push(line)
  }
  if (!writeAtomic(rev, textBuf(outl.map(l => `${l}\n`).join('')))) {
    out('seal-review: write failed'); return 1
  }

  out(`seal-review: ${d} ${kind} sealed`)
  out(`  reviewed_digest: sha256:${adg}`)
  out(`  review_context_digest: sha256:${cdg}`)
  return 0
}
