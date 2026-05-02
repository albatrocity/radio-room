import { describe, expect, it } from "vitest"
import { buildSegments, tokenizeWords } from "./chatTransform"

describe("tokenizeWords", () => {
  it("splits words and preserves trailing whitespace", () => {
    const t = tokenizeWords("Hello everyone!")
    expect(t).toEqual([
      { word: "Hello", trailing: " " },
      { word: "everyone!", trailing: "" },
    ])
  })

  it("preserves leading whitespace as first token", () => {
    const t = tokenizeWords("  hi")
    expect(t).toEqual([
      { word: "", trailing: "  " },
      { word: "hi", trailing: "" },
    ])
  })
})

describe("buildSegments", () => {
  it("builds echo duplicate segments", () => {
    const tokens = tokenizeWords("Hi there")
    const { content, contentSegments } = buildSegments(tokens, (tok) =>
      tok.word
        ? [
            { text: tok.word },
            { text: ` ${tok.word}`, effects: [{ type: "size", value: "small" }] },
          ]
        : [],
    )
    expect(content).toBe("Hi Hi there there")
    expect(contentSegments.some((s) => s.effects?.some((e) => e.type === "size"))).toBe(true)
  })
})
