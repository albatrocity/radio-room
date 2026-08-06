import { describe, expect, it } from "vitest"
import type { BingoCardCell } from "@repo/types"
import { hasBingo } from "./win"
import { BINGO_GRID_SIZE } from "./types"

function grid(mark: (r: number, c: number) => boolean): BingoCardCell[] {
  const cells: BingoCardCell[] = []
  for (let r = 0; r < BINGO_GRID_SIZE; r++) {
    for (let c = 0; c < BINGO_GRID_SIZE; c++) {
      const free = r === 2 && c === 2
      cells.push({
        r,
        c,
        criterionId: `${r}-${c}`,
        label: free ? "FREE" : `${r},${c}`,
        marked: free || mark(r, c),
        free: free || undefined,
        criterion: free
          ? { id: `${r}-${c}`, type: "free" }
          : { id: `${r}-${c}`, type: "releaseYearEq", year: 2000 },
      })
    }
  }
  return cells
}

describe("hasBingo", () => {
  it("detects a full row", () => {
    expect(hasBingo(grid((r, _c) => r === 0))).toBe(true)
  })

  it("detects a full column", () => {
    expect(hasBingo(grid((_r, c) => c === 1))).toBe(true)
  })

  it("detects diagonals using free center", () => {
    expect(hasBingo(grid((r, c) => r === c))).toBe(true)
    expect(hasBingo(grid((r, c) => r + c === 4))).toBe(true)
  })

  it("returns false without a line", () => {
    expect(hasBingo(grid((r, c) => r === 0 && c < 3))).toBe(false)
  })
})
