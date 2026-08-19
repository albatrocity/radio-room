import { describe, expect, it } from "vitest"
import { fitDiscLabel, truncateOnWord } from "./fitDiscLabel"

describe("truncateOnWord", () => {
  it("backs up to a word boundary near the cut", () => {
    expect(truncateOnWord("Loveless Sessions Live Extra", 20)).toBe("Loveless Sessions")
  })
})

describe("fitDiscLabel", () => {
  it("uses the maximum font size for short titles", () => {
    expect(fitDiscLabel("Kid A")).toEqual({ text: "Kid A", fontSize: 9 })
  })

  it("shrinks without truncating mid-length titles", () => {
    const result = fitDiscLabel("Everything In Its Right Place")
    expect(result?.text).toBe("Everything In Its Right Place")
    expect(result!.fontSize).toBeLessThan(9)
    expect(result!.fontSize).toBeGreaterThanOrEqual(5.5)
  })

  it("truncates with an ellipsis at the floor size", () => {
    const long =
      "My Extremely Long Album Title That Cannot Fit On A Compact Disc Label At All"
    const result = fitDiscLabel(long)
    expect(result?.fontSize).toBe(5.5)
    expect(result?.text.endsWith("\u2026")).toBe(true)
    expect(result!.text.length).toBeLessThan(long.length)
  })

  it("returns undefined for blank input", () => {
    expect(fitDiscLabel("   ")).toBeUndefined()
  })
})
