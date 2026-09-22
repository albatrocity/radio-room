/**
 * Answer matching for quiz sessions.
 *
 * Matching is intentionally EXACT — no fuzzy matching — but case-insensitive,
 * whitespace-trimmed, and surrounding punctuation stripped via {@link normalizeToken}.
 * See the quiz-sessions plan.
 */

import { normalizeToken } from "@repo/plugin-base"

/** Normalize an answer or guess for comparison. */
export function normalizeAnswer(value: string): string {
  return normalizeToken(value)
}

/**
 * Return the accepted answer that matches `guess` (case-insensitive, trimmed),
 * preserving the authored casing. Empty/whitespace-only guesses never match.
 */
export function matchAcceptedAnswer(
  guess: string,
  acceptedAnswers: string[],
): string | undefined {
  const normalizedGuess = normalizeAnswer(guess)
  if (!normalizedGuess) return undefined
  return acceptedAnswers.find((answer) => normalizeAnswer(answer) === normalizedGuess)
}

/**
 * True when `guess` exactly matches one of `acceptedAnswers` after normalization
 * (case-insensitive, trimmed). Empty/whitespace-only guesses never match.
 */
export function isAcceptedAnswer(guess: string, acceptedAnswers: string[]): boolean {
  return matchAcceptedAnswer(guess, acceptedAnswers) !== undefined
}
