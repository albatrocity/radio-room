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
 * Content inside trailing parentheses that we treat as release/edition metadata (not part of the creative title).
 */
const PAREN_METADATA_INNER = new RegExp(
  [
    "^\\s*(?:",
    // Remaster variants
    "Remastered(?:\\s+\\d{4})?",
    "|\\d{4}\\s+Remaster(?:ed)?(?:\\s+(?:LP\\s+)?Version)?",
    "|Remaster(?:ed)?\\s+\\d{4}(?:\\s+LP\\s+Version)?",
    "|\\d{4}\\s+Mix",
    // Editions
    "|Deluxe Edition|Super Deluxe|Expanded Edition",
    "|Radio Edit|Single Version|LP Version|Album Version",
    "|Original Motion Picture Soundtrack",
    "|Bonus Track",
    "|Demo|Mono|Stereo",
    "|\\d+(?:st|nd|rd|th)?\\s+Anniversary Edition",
    // Live
    "|Live(?:\\s+(?:at|from)\\s+.+)?",
    // Featured artists (suffix only)
    "|feat\\.\\s*.+",
    ")\\s*$",
  ].join(""),
  "i",
)

/**
 * Trailing hyphen-separated metadata segments (common on streaming catalogs).
 */
const HYPHEN_METADATA_SUFFIXES: RegExp[] = [
  /\s*-\s*Remastered(?:\s+\d{4})?\s*$/i,
  /\s*-\s*\d{4}(?:\s+Remaster(?:ed)?(?:\s+(?:LP\s+)?Version)?)?\s*$/i,
  /\s*-\s*\d{4}\s+Mix\s*$/i,
  /\s*-\s*Live(?:\s+(?:at|from)\s+.+)?\s*$/i,
  /\s*-\s*Radio Edit\s*$/i,
  /\s*-\s*Single Version\s*$/i,
  /\s*-\s*Demo\s*$/i,
  /\s*-\s*Mono\s*$/i,
  /\s*-\s*Stereo\s*$/i,
  /\s*-\s*Bonus Track\s*$/i,
  /\s*-\s*(?:\d+(?:st|nd|rd|th)?\s+)?Anniversary Edition\s*$/i,
  /\s*-\s*Mix\s*$/i,
  /\s*-\s*(?:Deluxe Edition|Super Deluxe|Expanded Edition)\s*$/i,
]

function stripOneTrailingParenMetadata(s: string): string {
  const m = s.match(/\(\s*([^)]*)\)\s*$/i)
  if (!m || m.index === undefined) return s
  const inner = (m[1] ?? "").trim()
  if (!inner || !PAREN_METADATA_INNER.test(inner)) return s
  return s.slice(0, m.index).trimEnd()
}

function stripOneHyphenMetadata(s: string): string {
  for (const re of HYPHEN_METADATA_SUFFIXES) {
    const next = s.replace(re, "").trimEnd()
    if (next !== s) return next
  }
  return s
}

/**
 * Text after a spaced hyphen (`Title - …`) that we treat as catalog-only (remaster/year/edition).
 * Year-leading tails are common on DSPs ("2018 Stereo Remaster"); we avoid stripping creative
 * subtitles like "Song - Part Two" by requiring metadata-shaped fragments unless year-led.
 */
function looksLikeCatalogHyphenSuffix(fragment: string): boolean {
  const f = fragment.trim()
  if (!f) return false

  // Almost always catalog when the tail begins with a release year.
  if (/^\d{4}\s/.test(f)) return true

  if (/^(?:Stereo|Mono)\s+Remaster(?:ed)?$/i.test(f)) return true
  if (/^Remaster(?:ed)?(?:\s+\d{4})?$/i.test(f)) return true

  if (
    /^(?:Deluxe Edition|Super Deluxe|Expanded Edition|Radio Edit|Single Version|LP Version|Album Version|Bonus Track|Demo)$/i.test(
      f,
    )
  ) {
    return true
  }

  if (/^Mix$/i.test(f)) return true
  if (/^Live(?:\s+(?:at|from)\s+.+)?$/i.test(f)) return true
  if (/^(?:Mono|Stereo)$/i.test(f)) return true

  return false
}

/**
 * If the last ` - ` segment looks like catalog metadata, drop it (possibly repeatedly).
 * Handles forms like "Picture Book - 2018 Stereo Remaster" where regex-only stripping misses
 * words between year and "Remaster".
 */
function stripSuspiciousFinalHyphenSegment(s: string): string {
  const parts = s.split(/\s+-\s+/)
  if (parts.length < 2) return s
  const last = parts[parts.length - 1] ?? ""
  if (!looksLikeCatalogHyphenSuffix(last)) return s
  return parts.slice(0, -1).join(" - ").trimEnd()
}

/**
 * Remove common catalog suffixes (remaster/year/edition/live) so guesses match the core title/album.
 * Applied only to the target string during matching, not for display.
 */
export function stripMetadataSuffixes(s: string): string {
  let prev = ""
  let out = s.trim()
  while (out !== prev) {
    prev = out
    const afterParen = stripOneTrailingParenMetadata(out)
    if (afterParen !== out) {
      out = afterParen
      continue
    }
    const afterHyphen = stripOneHyphenMetadata(out)
    if (afterHyphen !== out) {
      out = afterHyphen
      continue
    }
    const afterSuspiciousHyphen = stripSuspiciousFinalHyphenSegment(out)
    if (afterSuspiciousHyphen !== out) {
      out = afterSuspiciousHyphen
      continue
    }
  }
  return out.trim()
}

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
 *
 * Catalog suffixes like "- Remastered 2009" or "(2011 Remaster)" are stripped from
 * `target` before matching so players can guess the core title/album name.
 */
export function messageMatchesTarget(
  message: string,
  target: string,
  fuzzyThreshold: number,
): boolean {
  const stripped = stripMetadataSuffixes(target)
  const t = norm(stripped.length ? stripped : target)
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
