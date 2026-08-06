import { describe, expect, it } from "vitest"
import { fillCriteriaWithYears } from "./fillCriteria"
import { BINGO_FILLABLE_CELLS, type BingoConfigCriterion } from "./types"

function yearRow(year: number): BingoConfigCriterion {
  return { id: "", type: "releaseYearEq", year, value: "", durationMs: 0 }
}

describe("fillCriteriaWithYears", () => {
  it("no-ops when already at target", () => {
    const criteria = Array.from({ length: BINGO_FILLABLE_CELLS }, (_, i) => yearRow(1960 + i))
    const result = fillCriteriaWithYears({
      criteria,
      yearStart: 1960,
      yearEnd: 2000,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.added).toBe(0)
    expect(result.criteria).toHaveLength(BINGO_FILLABLE_CELLS)
  })

  it("fills remaining slots with ascending unused years", () => {
    const criteria = [yearRow(1970), yearRow(1972)]
    const result = fillCriteriaWithYears({
      criteria,
      yearStart: 1970,
      yearEnd: 1995,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.added).toBe(BINGO_FILLABLE_CELLS - 2)
    expect(result.criteria).toHaveLength(BINGO_FILLABLE_CELLS)
    const years = result.criteria
      .filter((c) => c.type === "releaseYearEq")
      .map((c) => c.year)
    expect(years).toContain(1970)
    expect(years).toContain(1972)
    expect(years).toContain(1971) // first unused after existing
    expect(years).not.toContain(1970 + BINGO_FILLABLE_CELLS) // only need 22 more from range
  })

  it("skips years already present as releaseYearEq", () => {
    const criteria: BingoConfigCriterion[] = [
      yearRow(1960),
      { id: "", type: "artistContains", value: "Queen", durationMs: 0 },
    ]
    const result = fillCriteriaWithYears({
      criteria,
      yearStart: 1960,
      yearEnd: 1985,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.added).toBe(BINGO_FILLABLE_CELLS - 2)
    const yearEq = result.criteria.filter((c) => c.type === "releaseYearEq")
    expect(yearEq.filter((c) => c.year === 1960)).toHaveLength(1)
    expect(result.criteria.some((c) => c.type === "artistContains")).toBe(true)
  })

  it("errors when the range has too few unused years", () => {
    const criteria = [yearRow(2000)]
    const result = fillCriteriaWithYears({
      criteria,
      yearStart: 2000,
      yearEnd: 2005,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/Need 23 more/)
    expect(result.message).toMatch(/only 5 unused/)
  })

  it("handles inverted year range", () => {
    const result = fillCriteriaWithYears({
      criteria: [],
      yearStart: 1983,
      yearEnd: 1960,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.added).toBe(BINGO_FILLABLE_CELLS)
    expect(result.criteria[0]?.year).toBe(1960)
    expect(result.criteria[23]?.year).toBe(1983)
  })
})
