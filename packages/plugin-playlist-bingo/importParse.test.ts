import { describe, expect, it } from "vitest"
import { parseBingoCriteriaImport, parseDurationInputToMs } from "./importParse"

describe("parseDurationInputToMs", () => {
  it("parses m:ss and bare seconds", () => {
    expect(parseDurationInputToMs("3:00")).toBe(180_000)
    expect(parseDurationInputToMs("180")).toBe(180_000)
    expect(parseDurationInputToMs("1:01:01")).toBe(3_661_000)
  })

  it("rejects incomplete input", () => {
    expect(parseDurationInputToMs("3:")).toBeNull()
    expect(parseDurationInputToMs("3:60")).toBeNull()
  })
})

describe("parseBingoCriteriaImport", () => {
  it("parses each matcher type", () => {
    const raw = `
# bank
year 1977
year-between 1970 1979
artist Queen
title love
album Night
added-by ross
duration-gt 3:00
duration-lt 180
`
    const result = parseBingoCriteriaImport(raw)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toEqual([
      expect.objectContaining({ type: "releaseYearEq", year: 1977 }),
      expect.objectContaining({
        type: "releaseYearBetween",
        startYear: 1970,
        endYear: 1979,
      }),
      expect.objectContaining({ type: "artistContains", value: "Queen" }),
      expect.objectContaining({ type: "titleContains", value: "love" }),
      expect.objectContaining({ type: "albumContains", value: "Night" }),
      expect.objectContaining({ type: "addedByContains", value: "ross" }),
      expect.objectContaining({ type: "durationGt", durationMs: 180_000 }),
      expect.objectContaining({ type: "durationLt", durationMs: 180_000 }),
    ])
  })

  it("ignores blank lines and comments", () => {
    const result = parseBingoCriteriaImport("\n# hi\n\nyear 1999\n")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(1)
  })

  it("fails with a line-numbered message on bad input", () => {
    const result = parseBingoCriteriaImport("year 1977\nnope\n")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/^Line 2:/)
  })

  it("fails on invalid duration", () => {
    const result = parseBingoCriteriaImport("duration-gt 3:")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toMatch(/invalid duration/)
  })

  it("fails when contains value is empty", () => {
    const result = parseBingoCriteriaImport("artist   ")
    expect(result.ok).toBe(false)
  })
})
