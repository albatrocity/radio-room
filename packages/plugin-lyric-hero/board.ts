import { moodLabelForMisses } from "./crowdMood"
import { blankDisplay, tokenizePhrase } from "./matching"
import type { PuzzleBoard, PuzzleToken, PublicPuzzleView } from "./types"

/** Create a fresh board from an authored phrase. */
export function createBoard(phrase: string, missMax: number): PuzzleBoard {
  const tokens: PuzzleToken[] = tokenizePhrase(phrase).map((t) => ({
    surface: t.surface,
    normalized: t.normalized,
    // Auto-reveal tokens with no matchable word (pure punctuation).
    revealed: !t.normalized,
  }))
  return {
    tokens,
    missedWords: [],
    missMax,
    walkedOut: false,
    solved: isBoardSolved(tokens),
    fillers: {},
  }
}

function isBoardSolved(tokens: PuzzleToken[]): boolean {
  return tokens.every((t) => !t.normalized || t.revealed)
}

export function toPublicPuzzleView(
  board: PuzzleBoard,
  options?: { revealedPhrase?: string; hint?: string },
): PublicPuzzleView {
  return {
    tokens: board.tokens.map((t) => ({
      display: t.revealed ? t.surface : blankDisplay(t.surface),
      revealed: t.revealed,
      ...(t.revealed && t.contributorUsername
        ? { contributorUsername: t.contributorUsername }
        : {}),
    })),
    missedWords: [...board.missedWords],
    missesUsed: board.missedWords.length,
    missMax: board.missMax,
    moodLabel: moodLabelForMisses(board.missedWords.length, board.missMax),
    walkedOut: board.walkedOut,
    solved: board.solved,
    ...(options?.revealedPhrase ? { revealedPhrase: options.revealedPhrase } : {}),
    ...(options?.hint ? { hint: options.hint } : {}),
  }
}

export type ApplyGuessResult =
  | { kind: "duplicate-hit" }
  | { kind: "duplicate-miss" }
  | { kind: "hit"; filledCount: number; solved: boolean }
  | { kind: "miss"; walkedOut: boolean }

/**
 * Apply a normalized single-word guess to the board (mutates).
 * Fills every matching unrevealed token; records unique misses.
 */
export function applyGuess(
  board: PuzzleBoard,
  normalizedGuess: string,
  userId: string,
  username: string,
): ApplyGuessResult {
  if (board.solved || board.walkedOut) {
    return { kind: "duplicate-miss" }
  }

  const matchingUnrevealed = board.tokens.filter(
    (t) => t.normalized === normalizedGuess && !t.revealed,
  )

  if (matchingUnrevealed.length > 0) {
    for (const t of matchingUnrevealed) {
      t.revealed = true
      t.contributorUserId = userId
      t.contributorUsername = username
    }
    const filled = board.fillers[userId] ?? []
    if (!filled.includes(normalizedGuess)) {
      board.fillers[userId] = [...filled, normalizedGuess]
    }
    board.solved = isBoardSolved(board.tokens)
    return { kind: "hit", filledCount: matchingUnrevealed.length, solved: board.solved }
  }

  // Already fully revealed for this word?
  const alreadyHit = board.tokens.some(
    (t) => t.normalized === normalizedGuess && t.revealed,
  )
  if (alreadyHit) {
    return { kind: "duplicate-hit" }
  }

  if (board.missedWords.includes(normalizedGuess)) {
    return { kind: "duplicate-miss" }
  }

  board.missedWords.push(normalizedGuess)
  if (board.missedWords.length >= board.missMax) {
    board.walkedOut = true
    // Reveal remaining tokens for display.
    for (const t of board.tokens) {
      if (!t.revealed) t.revealed = true
    }
    return { kind: "miss", walkedOut: true }
  }

  return { kind: "miss", walkedOut: false }
}

/** Reveal all tokens (competitive win / admin end). */
export function revealAll(board: PuzzleBoard): void {
  for (const t of board.tokens) {
    t.revealed = true
  }
}
