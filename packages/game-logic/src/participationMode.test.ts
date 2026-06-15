import { describe, it, expect } from "vitest"
import {
  PARTICIPATION_MODES,
  isCompetitiveMode,
  isInclusiveMode,
  participationModeSchema,
} from "./participationMode"

describe("participationMode", () => {
  it("exports both mode literals", () => {
    expect(PARTICIPATION_MODES).toEqual(["competitive", "inclusive"])
  })

  it("defaults schema parse to inclusive", () => {
    expect(participationModeSchema.parse(undefined)).toBe("inclusive")
  })

  it("parses explicit modes", () => {
    expect(participationModeSchema.parse("competitive")).toBe("competitive")
    expect(participationModeSchema.parse("inclusive")).toBe("inclusive")
  })

  it("isInclusiveMode is true only for inclusive", () => {
    expect(isInclusiveMode("inclusive")).toBe(true)
    expect(isInclusiveMode("competitive")).toBe(false)
    expect(isInclusiveMode(undefined)).toBe(false)
    expect(isInclusiveMode(null)).toBe(false)
  })

  it("isCompetitiveMode is true only for competitive", () => {
    expect(isCompetitiveMode("competitive")).toBe(true)
    expect(isCompetitiveMode("inclusive")).toBe(false)
    expect(isCompetitiveMode(undefined)).toBe(false)
    expect(isCompetitiveMode(null)).toBe(false)
  })
})
