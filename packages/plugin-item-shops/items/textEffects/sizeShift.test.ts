import type { WordContext } from "@repo/plugin-base"
import { describe, expect, test } from "vitest"
import type { TextSegment } from "@repo/types"
import { echoTextEffect } from "./sizeShift"

const ctx: WordContext = { wordIndex: 0, wordCount: 1, allWords: ["hi"] }

describe("echoTextEffect", () => {
  test("echo segments carry only cascading size when base has no decorate effects", () => {
    if (echoTextEffect.phase !== "multiply") throw new Error("expected multiply phase")
    const base: TextSegment[] = [{ text: "hi" }]
    const stacks = { echo: 1 }
    const extras = echoTextEffect.buildExtras(base, stacks, ctx, "hi")
    expect(extras).toHaveLength(1)
    expect(extras[0]?.effects?.map((e) => e.type)).toEqual(["size"])
  })

  test("echo segments inherit non-size effects from base word segments", () => {
    if (echoTextEffect.phase !== "multiply") throw new Error("expected multiply phase")
    const base: TextSegment[] = [
      {
        text: "hi",
        effects: [{ type: "font", value: "comicSans" }],
      },
    ]
    const stacks = { echo: 2 }
    const extras = echoTextEffect.buildExtras(base, stacks, ctx, "hi")
    expect(extras).toHaveLength(2)
    for (const seg of extras) {
      expect(seg.effects?.some((e) => e.type === "font" && e.value === "comicSans")).toBe(true)
      expect(seg.effects?.some((e) => e.type === "size")).toBe(true)
    }
  })
})
