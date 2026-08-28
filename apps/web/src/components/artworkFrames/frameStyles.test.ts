import { describe, expect, it } from "vitest"
import { artworkOverlayIsCompact } from "./ArtworkOverlaySizeContext"

describe("artworkOverlayIsCompact", () => {
  it("uses full detail when size is unknown (feature art before a hint)", () => {
    expect(artworkOverlayIsCompact(undefined)).toBe(false)
  })

  it("keeps row and item-detail sizes compact", () => {
    expect(artworkOverlayIsCompact({ width: 48, height: 48 })).toBe(true)
    expect(artworkOverlayIsCompact({ width: 112, height: 112 })).toBe(true)
  })

  it("uses full detail for large feature art", () => {
    expect(artworkOverlayIsCompact({ width: 280, height: 280 })).toBe(false)
  })
})
