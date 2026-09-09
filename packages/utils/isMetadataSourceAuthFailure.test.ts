import { describe, expect, it } from "vitest"
import { isMetadataSourceAuthFailure } from "./isMetadataSourceAuthFailure"

describe("isMetadataSourceAuthFailure", () => {
  it("matches Spotify expired token message", () => {
    expect(
      isMetadataSourceAuthFailure(
        new Error(
          "Search failed: Bad or expired token. This can happen if the user revoked a token or the access token has expired. You should re-authenticate the user.",
        ),
      ),
    ).toBe(true)
  })

  it("matches missing tokens", () => {
    expect(isMetadataSourceAuthFailure("No auth tokens found for room creator")).toBe(true)
  })

  it("matches missing refresh token", () => {
    expect(isMetadataSourceAuthFailure(new Error("No refresh token available"))).toBe(true)
  })

  it("matches missing Spotify token for a room", () => {
    expect(
      isMetadataSourceAuthFailure(
        new Error("no Spotify token available for room b258d0a597d2ccdd8ed538777c79287c"),
      ),
    ).toBe(true)
  })

  it("does not match ordinary search errors", () => {
    expect(isMetadataSourceAuthFailure(new Error("Network timeout"))).toBe(false)
    expect(isMetadataSourceAuthFailure(new Error("Rate limited"))).toBe(false)
  })
})
