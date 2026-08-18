import { describe, expect, it } from "vitest"
import { physicalMediaNowPlayingFrame } from "./physicalMediaNowPlayingArt"

const sleeve = {
  imageUrl: "/api/rooms/r1/images/cover",
  artworkFrame: "record-jacket",
}

describe("physicalMediaNowPlayingFrame", () => {
  it("returns undefined when the Item Shops toggle is off", () => {
    expect(
      physicalMediaNowPlayingFrame(
        { "item-shops": { physicalMediaFrame: sleeve } },
        { "item-shops": { enabled: true, showPhysicalMediaFrameInNowPlaying: false } },
      ),
    ).toBeUndefined()
  })

  it("returns undefined when Item Shops is disabled", () => {
    expect(
      physicalMediaNowPlayingFrame(
        { "item-shops": { physicalMediaFrame: sleeve } },
        { "item-shops": { enabled: false, showPhysicalMediaFrameInNowPlaying: true } },
      ),
    ).toBeUndefined()
  })

  it("returns the sleeve when enabled and the payload is valid", () => {
    expect(
      physicalMediaNowPlayingFrame(
        { "item-shops": { physicalMediaFrame: sleeve } },
        { "item-shops": { enabled: true, showPhysicalMediaFrameInNowPlaying: true } },
      ),
    ).toEqual(sleeve)
  })

  it("maps the retired j-card token to cassette-case", () => {
    expect(
      physicalMediaNowPlayingFrame(
        {
          "item-shops": {
            physicalMediaFrame: { imageUrl: "/tape.jpg", artworkFrame: "j-card" },
          },
        },
        { "item-shops": { enabled: true, showPhysicalMediaFrameInNowPlaying: true } },
      ),
    ).toEqual({ imageUrl: "/tape.jpg", artworkFrame: "cassette-case" })
  })

  it("returns the frame without imageUrl when the record has no cover", () => {
    expect(
      physicalMediaNowPlayingFrame(
        { "item-shops": { physicalMediaFrame: { artworkFrame: "jewel-case" } } },
        { "item-shops": { enabled: true, showPhysicalMediaFrameInNowPlaying: true } },
      ),
    ).toEqual({ artworkFrame: "jewel-case" })
  })
})
