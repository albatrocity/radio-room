import type { WordContext } from "@repo/plugin-base"
import { describe, expect, test } from "vitest"
import type { TextSegment } from "@repo/types"
import { echoTextEffect } from "./sizeShift"

const ctx: WordContext = { wordIndex: 0, wordCount: 1, allWords: ["hi"] }

describe("echoTextEffect", () => {
  test("each echo is a leading space plus one segment per base segment (cascading size)", () => {
    if (echoTextEffect.phase !== "multiply") throw new Error("expected multiply phase")
    const base: TextSegment[] = [{ text: "hi" }]
    const stacks = { echo: 1 }
    const extras = echoTextEffect.buildExtras(base, stacks, ctx, "hi")
    expect(extras).toHaveLength(2)
    expect(extras.map((s) => s.text).join("")).toBe(" hi")
    expect(extras[0]?.text).toBe(" ")
    expect(extras[0]?.effects?.map((e) => e.type)).toEqual(["size"])
    expect(extras[1]?.text).toBe("hi")
    expect(extras[1]?.effects?.map((e) => e.type)).toEqual(["size"])
  })

  test("echo segments inherit non-size effects from each mirrored base segment", () => {
    if (echoTextEffect.phase !== "multiply") throw new Error("expected multiply phase")
    const base: TextSegment[] = [
      {
        text: "hi",
        effects: [{ type: "font", value: "comicSans" }],
      },
    ]
    const stacks = { echo: 2 }
    const extras = echoTextEffect.buildExtras(base, stacks, ctx, "hi")
    expect(extras).toHaveLength(4)
    expect(extras.map((s) => s.text).join("")).toBe(" hi hi")
    for (const seg of extras) {
      if (seg.text === " ") {
        expect(seg.effects?.map((e) => e.type)).toEqual(["size"])
      } else {
        expect(seg.effects?.some((e) => e.type === "font" && e.value === "comicSans")).toBe(true)
        expect(seg.effects?.some((e) => e.type === "size")).toBe(true)
      }
    }
  })

  test("multi-segment base (e.g. per-letter colors) is echoed with matching effects per letter", () => {
    if (echoTextEffect.phase !== "multiply") throw new Error("expected multiply phase")
    const base: TextSegment[] = [
      { text: "l" },
      { text: "i", effects: [{ type: "color", palette: "orange", token: "border" }] },
      { text: "o", effects: [{ type: "color", palette: "red", token: "border" }] },
      { text: "n" },
    ]
    const stacks = { echo: 1 }
    const extras = echoTextEffect.buildExtras(base, stacks, ctx, "lion")
    expect(extras.map((s) => s.text).join("")).toBe(" lion")
    const echoedI = extras.find((s) => s.text === "i")
    const echoedO = extras.find((s) => s.text === "o")
    expect(echoedI?.effects?.some((e) => e.type === "color" && e.palette === "orange")).toBe(true)
    expect(echoedO?.effects?.some((e) => e.type === "color" && e.palette === "red")).toBe(true)
  })
})
