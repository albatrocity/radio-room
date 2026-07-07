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
 * True when `guess` exactly matches one of `acceptedAnswers` after normalization
 * (case-insensitive, trimmed). Empty/whitespace-only guesses never match.
 */
export function isAcceptedAnswer(guess: string, acceptedAnswers: string[]): boolean {
  const normalizedGuess = normalizeAnswer(guess)
  if (!normalizedGuess) return false
  return acceptedAnswers.some((answer) => normalizeAnswer(answer) === normalizedGuess)
}
