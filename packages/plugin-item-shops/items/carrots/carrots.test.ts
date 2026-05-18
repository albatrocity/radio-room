import { describe, expect, it } from "vitest"
import { applyTextEffects } from "@repo/plugin-base"
import { echoTextEffect } from "../textEffects/sizeShift"
import { redLetterTextEffect } from "../tomatoes"
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
    expect(iSegment?.effects).toEqual([{ type: "color", palette: "orange", token: "border" }])
  })

  it("colors uppercase I in orange", () => {
    const result = applyTextEffects("I am", { [ORANGE_LETTER_FLAG]: 1 }, [orangeLetterTextEffect])
    expect(result).not.toBeNull()
    expect(result!.content).toBe("I am")
    const iSegment = result!.contentSegments.find((s) => s.text === "I")
    expect(iSegment?.effects).toEqual([{ type: "color", palette: "orange", token: "border" }])
  })

  it("uses stronger token with higher stack count", () => {
    const result = applyTextEffects("hi", { [ORANGE_LETTER_FLAG]: 3 }, [orangeLetterTextEffect])
    const iSegment = result!.contentSegments.find((s) => s.text === "i")
    expect(iSegment?.effects).toEqual([{ type: "color", palette: "orange", token: "solid" }])
  })

  it("composes with tomatoes red-letter effect on the same word", () => {
    const result = applyTextEffects(
      "lion",
      { [ORANGE_LETTER_FLAG]: 1, red_letter: 1 },
      [orangeLetterTextEffect, redLetterTextEffect],
    )
    expect(result).not.toBeNull()
    expect(result!.content).toBe("lion")
    const iSeg = result!.contentSegments.find((s) => s.text === "i")
    const oSeg = result!.contentSegments.find((s) => s.text === "o")
    expect(iSeg?.effects).toEqual([{ type: "color", palette: "orange", token: "border" }])
    expect(oSeg?.effects).toEqual([{ type: "color", palette: "red", token: "border" }])
  })

  it("echo preserves per-letter colors on the repeated word (segment before multiply)", () => {
    const result = applyTextEffects(
      "lion",
      { [ORANGE_LETTER_FLAG]: 1, red_letter: 1, echo: 1 },
      [orangeLetterTextEffect, redLetterTextEffect, echoTextEffect],
    )
    expect(result).not.toBeNull()
    expect(result!.content).toMatch(/^lion lion$/)
    const orangeOnI = result!.contentSegments.filter(
      (s) =>
        s.text === "i" &&
        s.effects?.some((e) => e.type === "color" && e.palette === "orange"),
    )
    const redOnO = result!.contentSegments.filter(
      (s) =>
        s.text === "o" &&
        s.effects?.some((e) => e.type === "color" && e.palette === "red"),
    )
    expect(orangeOnI.length).toBe(2)
    expect(redOnO.length).toBe(2)
  })
})
