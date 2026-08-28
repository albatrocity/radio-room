import { describe, expect, it } from "vitest"
import { textEffectStyles } from "./textEffectStyles"

describe("textEffectStyles font stacks", () => {
  it("maps comicSans to system comic faces before the cursive generic", () => {
    const { fontFamily } = textEffectStyles([{ type: "font", value: "comicSans" }])
    expect(fontFamily).toContain("Comic Sans MS")
    expect(fontFamily).toContain("Chalkboard SE")
    expect(fontFamily).toContain("Comic Neue")
    expect(fontFamily?.endsWith("cursive")).toBe(true)
  })
})
