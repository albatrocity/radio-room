import Fuse from "fuse.js"

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()

/** Target tokens shorter than this are not required individually (e.g. "a", "i"). */
const MIN_TARGET_WORD_LEN = 2

/**
 * Tokenize normalized text into words for matching.
 */
function words(s: string): string[] {
  return s.split(/\s+/).filter((w) => w.length > 0)
}

/**
 * Build message-side candidates: each word plus adjacent bigrams (so "feel better"
 * can still match two target words when the message has that phrase).
 */
function messageMatchCandidates(messageNorm: string): string[] {
  const ws = words(messageNorm)
  const out = new Set<string>()
  for (const w of ws) {
    out.add(w)
  }
  for (let i = 0; i < ws.length - 1; i++) {
    const bi = `${ws[i]} ${ws[i + 1]}`.trim()
    if (bi.length >= 1) out.add(bi)
  }
  return Array.from(out)
}

/**
 * For a one-word target (e.g. title "charlie"), reject guesses that are far shorter than
 * the word, so "ch" does not match "charlie". Multi-word titles still use per-word fuzzy
 * matching (e.g. "u" → "you" for a short target word in a longer title).
 */
function minCandidateLengthForSingleWordTarget(targetWord: string): number {
  if (targetWord.length <= 2) return 1
  if (targetWord.length === 3) return 2
  return Math.max(3, Math.ceil(targetWord.length * 0.5))
}

/**
 * True if `candidate` is a fuzzy match for the single word `targetWord` (Fuse threshold).
 * Single-character candidates are only considered against longer targets (e.g. "u" → "you").
 * When `treatAsSingleWordTitle` is true, `candidate` must be long enough (see
 * `minCandidateLengthForSingleWordTarget`); this blocks tiny fragments like "ch" on "charlie".
 */
function tokenMatchesTargetWord(
  candidate: string,
  targetWord: string,
  fuzzyThreshold: number,
  treatAsSingleWordTitle: boolean,
): boolean {
  if (!candidate.length || !targetWord.length) return false
  if (candidate.length === 1 && targetWord.length < 3) return false
  if (treatAsSingleWordTitle && candidate.length < minCandidateLengthForSingleWordTarget(targetWord)) {
    return false
  }

  const fuse = new Fuse([{ text: targetWord }], {
    keys: ["text"],
    threshold: fuzzyThreshold,
    ignoreLocation: true,
    // Allow single-character queries (e.g. "u" vs "you"); stricter logic is "all words" above.
    minMatchCharLength: 1,
  })
  return fuse.search(candidate).length > 0
}

/**
 * Returns true if `message` fuzzy-matches `target` (case-insensitive).
 *
 * **All significant words** in `target` must have at least one fuzzy match among
 * message words (or adjacent two-word phrases). This prevents a single token like
 * "how" from matching the full title "How Music Makes You Feel Better".
 *
 * Accepts typos per word, e.g. "How music makes u feel better" vs the full title.
 */
export function messageMatchesTarget(
  message: string,
  target: string,
  fuzzyThreshold: number,
): boolean {
  const t = norm(target)
  const m = norm(message)
  if (!t.length || !m.length) return false

  // Full normalized title appears in the message
  if (m.includes(t)) return true

  const targetTokens = words(t).filter((w) => w.length >= MIN_TARGET_WORD_LEN)
  if (targetTokens.length === 0) {
    // Very short title: fall back to single-token fuzzy against whole message
    const single = words(t)[0] ?? t
    if (single.length < MIN_TARGET_WORD_LEN) return false
    const candidates = messageMatchCandidates(m)
    return candidates.some((c) => tokenMatchesTargetWord(c, single, fuzzyThreshold, true))
  }

  const candidates = messageMatchCandidates(m)
  const singleSignificantToken = targetTokens.length === 1

  for (const targetWord of targetTokens) {
    const matched = candidates.some((c) =>
      tokenMatchesTargetWord(c, targetWord, fuzzyThreshold, singleSignificantToken),
    )
    if (!matched) return false
  }

  return true
}
