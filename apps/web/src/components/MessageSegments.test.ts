import { describe, expect, it } from "vitest"
import { mergeAdjacentSameEffectPieces } from "./MessageSegments"

describe("mergeAdjacentSameEffectPieces", () => {
  it("joins adjacent pieces with no effects", () => {
    expect(
      mergeAdjacentSameEffectPieces([{ text: "*hello " }, { text: "world*" }]),
    ).toEqual([{ text: "*hello world*" }])
  })

  it("joins adjacent pieces with identical effects", () => {
    const color = { type: "color" as const, palette: "orange" as const, token: "solid" as const }
    expect(
      mergeAdjacentSameEffectPieces([
        { text: "*hello ", effects: [color] },
        { text: "world*", effects: [color] },
      ]),
    ).toEqual([{ text: "*hello world*", effects: [color] }])
  })

  it("does not merge across different effects", () => {
    const orange = { type: "color" as const, palette: "orange" as const }
    const red = { type: "color" as const, palette: "red" as const }
    expect(
      mergeAdjacentSameEffectPieces([
        { text: "a", effects: [orange] },
        { text: "b", effects: [red] },
        { text: "c", effects: [red] },
      ]),
    ).toEqual([
      { text: "a", effects: [orange] },
      { text: "bc", effects: [red] },
    ])
  })

  it("treats undefined and missing effects as the same", () => {
    expect(
      mergeAdjacentSameEffectPieces([{ text: "a", effects: undefined }, { text: "b" }]),
    ).toEqual([{ text: "ab" }])
  })
})
