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

  it("strips surrounding punctuation and remaining apostrophes", () => {
    expect(normalizeWord("don't")).toBe("dont")
    expect(normalizeWord("dont")).toBe("dont")
    expect(normalizeWord('"Hello,"')).toBe("hello")
    expect(normalizeWord("(wait)")).toBe("wait")
  })

  it("treats 'em and em as the same key", () => {
    expect(normalizeWord("'em")).toBe("em")
    expect(normalizeWord("em")).toBe("em")
    expect(normalizeWord("\u2019em")).toBe("em")
  })

  it("returns empty for whitespace", () => {
    expect(normalizeWord("   ")).toBe("")
  })
})

describe("parseSingleGuess", () => {
  it("accepts a single word", () => {
    expect(parseSingleGuess("moonlight")).toBe("moonlight")
  })

  it("normalizes punctuation-free variants", () => {
    expect(parseSingleGuess("'em")).toBe("em")
    expect(parseSingleGuess("don't")).toBe("dont")
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
  it("tokenizes on whitespace with punctuation-free keys", () => {
    expect(tokenizePhrase("Don't stop")).toEqual([
      { surface: "Don't", normalized: "dont" },
      { surface: "stop", normalized: "stop" },
    ])
  })

  it("keeps punctuation in blanks", () => {
    expect(blankDisplay("don't")).toBe("___'_")
    expect(blankDisplay("Hello,")).toBe("_____,")
    expect(blankDisplay("'em")).toBe("'__")
  })
})
