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

  it("does not match ordinary search errors", () => {
    expect(isMetadataSourceAuthFailure(new Error("Network timeout"))).toBe(false)
    expect(isMetadataSourceAuthFailure(new Error("Rate limited"))).toBe(false)
  })
})
