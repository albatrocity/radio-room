import { describe, expect, it } from "vitest"
import {
  buildCriterionPool,
  dealBingoCard,
  sampleCriteria,
  validatePoolForCategory,
} from "./card"
import { BINGO_FILLABLE_CELLS, BINGO_FREE_COL, BINGO_FREE_ROW, BINGO_GRID_SIZE } from "./types"

describe("buildCriterionPool", () => {
  it("builds year and decade pools", () => {
    const years = buildCriterionPool("releaseYear", { yearStart: 1990, yearEnd: 1992 })
    expect(years.map((c) => (c.type === "releaseYearEq" ? c.year : null))).toEqual([
      1990, 1991, 1992,
    ])
    const decades = buildCriterionPool("releaseDecade", { decadeStart: 1980, decadeEnd: 2000 })
    expect(decades.map((c) => (c.type === "releaseDecadeEq" ? c.decade : null))).toEqual([
      1980, 1990, 2000,
    ])
  })
})

describe("sampleCriteria / dealBingoCard", () => {
  const rng = (() => {
    let i = 0
    const seq = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.15, 0.25, 0.35]
    return () => seq[i++ % seq.length]!
  })()

  it("requires 24 mixed criteria", () => {
    const pool = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`,
      type: "artistContains" as const,
      value: `A${i}`,
    }))
    expect(validatePoolForCategory("mixed", pool).ok).toBe(false)
  })

  it("deals 5x5 with free center", () => {
    const criteria = Array.from({ length: BINGO_FILLABLE_CELLS }, (_, i) => ({
      id: `c${i}`,
      type: "titleContains" as const,
      value: `t${i}`,
    }))
    const card = dealBingoCard("u1", "mixed", { criteria }, rng)
    expect(card.cells).toHaveLength(BINGO_GRID_SIZE * BINGO_GRID_SIZE)
    const free = card.cells.find((c) => c.r === BINGO_FREE_ROW && c.c === BINGO_FREE_COL)
    expect(free?.free).toBe(true)
    expect(free?.marked).toBe(true)
    expect(card.cells.filter((c) => !c.free)).toHaveLength(BINGO_FILLABLE_CELLS)
  })

  it("samples with replacement for small year pools", () => {
    const pool = buildCriterionPool("releaseYear", { yearStart: 2000, yearEnd: 2001 })
    const sampled = sampleCriteria(pool, BINGO_FILLABLE_CELLS, { unique: false, rng })
    expect(sampled).toHaveLength(BINGO_FILLABLE_CELLS)
  })
})
