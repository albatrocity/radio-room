import { describe, expect, it } from "vitest"
import { isSpotifyGatewayError } from "./spotifyErrors"

describe("isSpotifyGatewayError", () => {
  it("matches the Spotify SDK 502 dump", () => {
    expect(
      isSpotifyGatewayError(
        new Error(
          'Unrecognised response code: 502 - Bad Gateway. Body: {"error": {"status": 502, "message": "An unexpected error occurred. Please try again later." } }',
        ),
      ),
    ).toBe(true)
  })

  it("does not match auth or rate-limit failures", () => {
    expect(isSpotifyGatewayError(new Error("Bad or expired token."))).toBe(false)
    expect(isSpotifyGatewayError(new Error("The app has exceeded its rate limits."))).toBe(false)
    expect(isSpotifyGatewayError(new Error("Rate limited"))).toBe(false)
  })
})
