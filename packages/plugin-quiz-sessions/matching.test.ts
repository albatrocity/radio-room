import { describe, it, expect } from "vitest"
import { isAcceptedAnswer, matchAcceptedAnswer, normalizeAnswer } from "./matching"

describe("normalizeAnswer", () => {
  it("trims and lowercases", () => {
    expect(normalizeAnswer("  Hello World  ")).toBe("hello world")
  })

  it("collapses to empty for whitespace-only input", () => {
    expect(normalizeAnswer("   ")).toBe("")
  })
})

describe("matchAcceptedAnswer", () => {
  const answers = ["Paris", "City of Light"]

  it("returns the authored accepted answer that matched", () => {
    expect(matchAcceptedAnswer("city of light", answers)).toBe("City of Light")
  })

  it("preserves authored casing when the guess differs only by case", () => {
    expect(matchAcceptedAnswer("  pARIS  ", answers)).toBe("Paris")
  })

  it("returns undefined when nothing matches", () => {
    expect(matchAcceptedAnswer("London", answers)).toBeUndefined()
  })
})

describe("isAcceptedAnswer", () => {
  const answers = ["Paris", "City of Light"]

  it("matches exactly", () => {
    expect(isAcceptedAnswer("Paris", answers)).toBe(true)
  })

  it("matches case-insensitively", () => {
    expect(isAcceptedAnswer("pARIS", answers)).toBe(true)
  })

  it("matches after trimming surrounding whitespace", () => {
    expect(isAcceptedAnswer("  paris  ", answers)).toBe(true)
  })

  it("matches any of multiple accepted answers", () => {
    expect(isAcceptedAnswer("city of light", answers)).toBe(true)
  })

  it("does not fuzzy-match near misses", () => {
    expect(isAcceptedAnswer("Pariss", answers)).toBe(false)
    expect(isAcceptedAnswer("Par", answers)).toBe(false)
  })

  it("does not match substrings", () => {
    expect(isAcceptedAnswer("light", answers)).toBe(false)
  })

  it("returns false for empty or whitespace-only guesses", () => {
    expect(isAcceptedAnswer("", answers)).toBe(false)
    expect(isAcceptedAnswer("   ", answers)).toBe(false)
  })

  it("returns false when there are no accepted answers", () => {
    expect(isAcceptedAnswer("Paris", [])).toBe(false)
  })
})
