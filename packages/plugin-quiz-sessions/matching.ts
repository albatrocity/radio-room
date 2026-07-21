/**
 * Answer matching for quiz sessions.
 *
 * Matching is intentionally EXACT — no fuzzy matching — but case-insensitive and
 * whitespace-trimmed. See the quiz-sessions plan.
 */

/** Normalize an answer or guess for comparison: trim + lowercase. */
export function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase()
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
