import { describe, it, expect } from "vitest"
import {
  blankDisplay,
  hasExtraTokens,
  normalizeWord,
  parseSingleGuess,
  tokenizePhrase,
} from "./matching"

describe("normalizeWord", () => {
  it("lowercases and trims", () => {
    expect(normalizeWord("  Moonlight  ")).toBe("moonlight")
  })

  it("strips surrounding punctuation but keeps internal apostrophes", () => {
    expect(normalizeWord("don't")).toBe("don't")
    expect(normalizeWord('"Hello,"')).toBe("hello")
    expect(normalizeWord("(wait)")).toBe("wait")
  })

  it("returns empty for whitespace", () => {
    expect(normalizeWord("   ")).toBe("")
  })
})

describe("parseSingleGuess", () => {
  it("accepts a single word", () => {
    expect(parseSingleGuess("moonlight")).toBe("moonlight")
  })

  it("rejects multiple tokens", () => {
    expect(parseSingleGuess("the moonlight")).toBeNull()
    expect(hasExtraTokens("the moonlight")).toBe(true)
  })

  it("rejects empty", () => {
    expect(parseSingleGuess("")).toBeNull()
  })
})

describe("tokenizePhrase / blankDisplay", () => {
  it("tokenizes on whitespace", () => {
    expect(tokenizePhrase("Don't stop")).toEqual([
      { surface: "Don't", normalized: "don't" },
      { surface: "stop", normalized: "stop" },
    ])
  })

  it("keeps punctuation in blanks", () => {
    expect(blankDisplay("don't")).toBe("___'_")
    expect(blankDisplay("Hello,")).toBe("_____,")
  })
})
