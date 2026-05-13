import { describe, expect, it } from "vitest"
import { applyTextEffects } from "@repo/plugin-base"
import { carrots, orangeLetterTextEffect, ORANGE_LETTER_FLAG } from "."

describe("carrots", () => {
  it("registers the expected shortId", () => {
    expect(carrots.shortId).toBe("carrots")
  })
})

describe("orangeLetterTextEffect", () => {
  it("preserves spaces between words", () => {
    const result = applyTextEffects("hi there", { [ORANGE_LETTER_FLAG]: 1 }, [orangeLetterTextEffect])
    expect(result).not.toBeNull()
    expect(result!.content).toBe("hi there")
    expect(result!.contentSegments.map((s) => s.text).join("")).toBe("hi there")
  })

  it("colors letter i in orange", () => {
    const result = applyTextEffects("hi", { [ORANGE_LETTER_FLAG]: 1 }, [orangeLetterTextEffect])
    expect(result).not.toBeNull()
    const iSegment = result!.contentSegments.find((s) => s.text === "i")
    expect(iSegment?.effects).toEqual([{ type: "color", palette: "orange", token: "fg" }])
  })

  it("colors uppercase I in orange", () => {
    const result = applyTextEffects("I am", { [ORANGE_LETTER_FLAG]: 1 }, [orangeLetterTextEffect])
    expect(result).not.toBeNull()
    expect(result!.content).toBe("I am")
    const iSegment = result!.contentSegments.find((s) => s.text === "I")
    expect(iSegment?.effects).toEqual([{ type: "color", palette: "orange", token: "fg" }])
  })

  it("uses stronger token with higher stack count", () => {
    const result = applyTextEffects("hi", { [ORANGE_LETTER_FLAG]: 3 }, [orangeLetterTextEffect])
    const iSegment = result!.contentSegments.find((s) => s.text === "i")
    expect(iSegment?.effects).toEqual([{ type: "color", palette: "orange", token: "emphasized" }])
  })
})
