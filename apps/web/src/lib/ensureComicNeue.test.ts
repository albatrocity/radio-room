import { describe, expect, it } from "vitest"
import { textEffectsNeedComicNeue } from "./ensureComicNeue"

describe("textEffectsNeedComicNeue", () => {
  it("is true only for the comicSans font effect", () => {
    expect(textEffectsNeedComicNeue([{ type: "font", value: "comicSans" }])).toBe(true)
    expect(textEffectsNeedComicNeue([{ type: "font", value: "serif" }])).toBe(false)
    expect(textEffectsNeedComicNeue([{ type: "color", value: "primary" }])).toBe(false)
    expect(textEffectsNeedComicNeue(undefined)).toBe(false)
  })
})
