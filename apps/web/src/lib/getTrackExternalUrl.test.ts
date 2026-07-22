import { describe, expect, it } from "vitest"
import { getTrackExternalUrl } from "./getTrackExternalUrl"

describe("getTrackExternalUrl", () => {
  it("prefers https resource over opaque local URI", () => {
    expect(
      getTrackExternalUrl({
        urls: [
          { type: "resource", url: "local:abc" },
          { type: "resource", url: "https://artist.bandcamp.com/track/x" },
        ],
      }),
    ).toBe("https://artist.bandcamp.com/track/x")
  })

  it("skips spotify: URI and finds open.spotify.com", () => {
    expect(
      getTrackExternalUrl({
        urls: [
          { type: "resource", url: "spotify:track:abc" },
          { type: "resource", url: "https://open.spotify.com/track/abc" },
        ],
      }),
    ).toBe("https://open.spotify.com/track/abc")
  })

  it("uses legacy external_urls.spotify", () => {
    expect(
      getTrackExternalUrl({
        external_urls: { spotify: "https://open.spotify.com/track/xyz" },
        urls: [{ type: "resource", url: "spotify:track:xyz" }],
      }),
    ).toBe("https://open.spotify.com/track/xyz")
  })

  it("returns null when only opaque URIs exist", () => {
    expect(
      getTrackExternalUrl({
        urls: [{ type: "resource", url: "local:abc" }],
      }),
    ).toBeNull()
  })
})
