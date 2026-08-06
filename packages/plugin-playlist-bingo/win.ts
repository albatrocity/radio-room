import type { BingoCardCell } from "@repo/types"
import { BINGO_GRID_SIZE } from "./types"

/**
 * True when any full row, column, or diagonal is marked (including free center as marked).
 */
export function hasBingo(cells: BingoCardCell[]): boolean {
  const marked = Array.from({ length: BINGO_GRID_SIZE }, () =>
    Array.from({ length: BINGO_GRID_SIZE }, () => false),
  )
  for (const cell of cells) {
    if (cell.r < 0 || cell.r >= BINGO_GRID_SIZE || cell.c < 0 || cell.c >= BINGO_GRID_SIZE) continue
    marked[cell.r]![cell.c] = cell.marked || cell.free === true
  }

  for (let i = 0; i < BINGO_GRID_SIZE; i++) {
    if (marked[i]!.every(Boolean)) return true
    if (marked.every((row) => row[i])) return true
  }

  if (marked.every((row, i) => row[i])) return true
  if (marked.every((row, i) => row[BINGO_GRID_SIZE - 1 - i])) return true

  return false
}
