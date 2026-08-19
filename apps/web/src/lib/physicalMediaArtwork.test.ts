import { describe, expect, it } from "vitest"
import { deriveDiscLabel, resolvePhysicalMediaArt, toPhysicalMediaArt } from "./physicalMediaArtwork"

const enabledConfig = {
  "item-shops": { enabled: true, showPhysicalMediaFrameInNowPlaying: true },
}

const sleeve = {
  imageUrl: "/api/rooms/r1/images/cover",
  imageUrlLarge: "/api/rooms/r1/images/cover-lg",
  artworkFrame: "record-jacket",
}

const pluginData = { "item-shops": { physicalMediaFrame: sleeve } }

describe("resolvePhysicalMediaArt", () => {
  it("returns undefined when the Item Shops toggle is off", () => {
    expect(
      resolvePhysicalMediaArt({
        pluginData,
        pluginConfigs: {
          "item-shops": { enabled: true, showPhysicalMediaFrameInNowPlaying: false },
        },
        trackArtUrl: "/track.jpg",
      }),
    ).toBeUndefined()
  })

  it("returns undefined when Item Shops is disabled", () => {
    expect(
      resolvePhysicalMediaArt({
        pluginData,
        pluginConfigs: {
          "item-shops": { enabled: false, showPhysicalMediaFrameInNowPlaying: true },
        },
        trackArtUrl: "/track.jpg",
      }),
    ).toBeUndefined()
  })

  it("returns undefined when disabled is set (room art / obscured / non-queue)", () => {
    expect(
      resolvePhysicalMediaArt({
        pluginData,
        pluginConfigs: enabledConfig,
        trackArtUrl: "/track.jpg",
        disabled: true,
      }),
    ).toBeUndefined()
  })

  it("returns the sleeve when enabled and the payload is valid", () => {
    expect(
      resolvePhysicalMediaArt({
        pluginData,
        pluginConfigs: enabledConfig,
        trackArtUrl: "/track.jpg",
      }),
    ).toEqual({
      artworkFrame: "record-jacket",
      imageUrl: sleeve.imageUrl,
      imageUrlLarge: sleeve.imageUrlLarge,
      fallbackImageUrl: "/track.jpg",
    })
  })

  it("omits fallbackImageUrl when the sleeve is the same as track art", () => {
    expect(
      resolvePhysicalMediaArt({
        pluginData,
        pluginConfigs: enabledConfig,
        trackArtUrl: sleeve.imageUrl,
      }),
    ).toEqual({
      artworkFrame: "record-jacket",
      imageUrl: sleeve.imageUrl,
      imageUrlLarge: sleeve.imageUrlLarge,
    })
  })

  it("maps the retired j-card token to cassette-case", () => {
    expect(
      resolvePhysicalMediaArt({
        pluginData: {
          "item-shops": {
            physicalMediaFrame: { imageUrl: "/tape.jpg", artworkFrame: "j-card" },
          },
        },
        pluginConfigs: enabledConfig,
      }),
    ).toEqual({ imageUrl: "/tape.jpg", artworkFrame: "cassette-case" })
  })

  it("falls back to track art when the record has no cover", () => {
    expect(
      resolvePhysicalMediaArt({
        pluginData: { "item-shops": { physicalMediaFrame: { artworkFrame: "jewel-case" } } },
        pluginConfigs: enabledConfig,
        trackArtUrl: "/track.jpg",
      }),
    ).toEqual({ artworkFrame: "jewel-case", imageUrl: "/track.jpg" })
  })

  it("returns undefined when the record has no cover and there is no track art", () => {
    expect(
      resolvePhysicalMediaArt({
        pluginData: { "item-shops": { physicalMediaFrame: { artworkFrame: "jewel-case" } } },
        pluginConfigs: enabledConfig,
      }),
    ).toBeUndefined()
  })

  it("uses imageUrlLarge as the sleeve when imageUrl is missing", () => {
    expect(
      resolvePhysicalMediaArt({
        pluginData: {
          "item-shops": {
            physicalMediaFrame: {
              imageUrlLarge: "/large.jpg",
              artworkFrame: "jewel-case",
            },
          },
        },
        pluginConfigs: enabledConfig,
        trackArtUrl: "/track.jpg",
      }),
    ).toEqual({
      artworkFrame: "jewel-case",
      imageUrl: "/large.jpg",
      imageUrlLarge: "/large.jpg",
      fallbackImageUrl: "/track.jpg",
    })
  })
})

describe("toPhysicalMediaArt", () => {
  it("requires a valid artworkFrame when a cover is present", () => {
    expect(toPhysicalMediaArt({ imageUrl: "/cover.jpg" })).toBeUndefined()
    expect(toPhysicalMediaArt({ imageUrl: "/cover.jpg", artworkFrame: "nope" })).toBeUndefined()
  })

  it("returns art when both fields are present", () => {
    expect(
      toPhysicalMediaArt({
        imageUrl: "/cover.jpg",
        imageUrlLarge: "/cover-lg.jpg",
        artworkFrame: "jewel-case",
      }),
    ).toEqual({
      artworkFrame: "jewel-case",
      imageUrl: "/cover.jpg",
      imageUrlLarge: "/cover-lg.jpg",
    })
  })

  it("returns coverless jewel-case art with a hand-lettered disc label", () => {
    expect(
      toPhysicalMediaArt({
        artworkFrame: "jewel-case",
        name: "CD: Kid A",
      }),
    ).toEqual({
      artworkFrame: "jewel-case",
      discLabel: "Kid A",
    })
  })

  it("passes operator name overrides through without stripping", () => {
    expect(
      toPhysicalMediaArt({
        artworkFrame: "jewel-case",
        name: "My Bloody Valentine — Loveless",
      }),
    ).toEqual({
      artworkFrame: "jewel-case",
      discLabel: "My Bloody Valentine — Loveless",
    })
  })

  it("returns undefined for coverless non-jewel frames", () => {
    expect(
      toPhysicalMediaArt({
        artworkFrame: "record-jacket",
        name: "LP: Loveless",
      }),
    ).toBeUndefined()
  })
})

describe("deriveDiscLabel", () => {
  it("strips the derived CD prefix only", () => {
    expect(deriveDiscLabel("CD: Kid A")).toBe("Kid A")
    expect(deriveDiscLabel("cd: ok computer")).toBe("ok computer")
  })
})
