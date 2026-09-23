/**
 * Word normalization and phrase tokenization for Lyric Hero.
 *
 * Matching: trim, lowercase, strip surrounding punctuation via {@link normalizeToken},
 * then strip remaining non-alphanumeric characters so `'em`/`em` and `don't`/`dont`
 * share a match key. Display blanks still keep punctuation from the surface form.
 * No fuzzy matching.
 */

import { normalizeToken } from "@repo/plugin-base"

/**
 * Lyric Hero match key: shared token normalize, then drop leftover punctuation
 * (apostrophes, etc.) so punctuation-free variants match.
 */
export function normalizeWord(value: string): string {
  return normalizeToken(value).replace(/[^a-z0-9]/gi, "")
}

/**
 * True when `guess` has more than one whitespace-separated token
 * (after trim). Empty / single token → false.
 */
export function hasExtraTokens(guess: string): boolean {
  const parts = guess.trim().split(/\s+/).filter(Boolean)
  return parts.length > 1
}

/** Single normalized token from a guess string, or null if empty / multi-token. */
export function parseSingleGuess(guess: string): string | null {
  const trimmed = guess.trim()
  if (!trimmed) return null
  if (hasExtraTokens(trimmed)) return null
  const normalized = normalizeWord(trimmed)
  return normalized || null
}

export interface TokenizedPhraseToken {
  surface: string
  normalized: string
}

/** Split phrase on whitespace into surface tokens with normalized keys. */
export function tokenizePhrase(phrase: string): TokenizedPhraseToken[] {
  return phrase
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((surface) => ({
      surface,
      normalized: normalizeWord(surface),
    }))
}

/**
 * Build a blank display string: letters/digits become `_`, punctuation stays
 * (including internal apostrophes).
 */
export function blankDisplay(surface: string): string {
  return surface
    .split("")
    .map((ch) => (/[a-z0-9]/i.test(ch) ? "_" : ch))
    .join("")
}
