import { describe, expect, it } from "vitest"
import { prefersCoarsePointer, virtualizerOverscan } from "./virtualizerOverscan"

describe("virtualizerOverscan", () => {
  it("uses the desktop count for fine pointers", () => {
    expect(virtualizerOverscan(10, 24, false)).toBe(10)
  })

  it("uses the touch count for coarse pointers", () => {
    expect(virtualizerOverscan(10, 24, true)).toBe(24)
  })
})

describe("prefersCoarsePointer", () => {
  it("reads matchMedia(pointer: coarse)", () => {
    expect(prefersCoarsePointer(() => ({ matches: true }))).toBe(true)
    expect(prefersCoarsePointer(() => ({ matches: false }))).toBe(false)
  })

  it("is false when matchMedia is missing", () => {
    expect(prefersCoarsePointer(undefined)).toBe(false)
  })
})
