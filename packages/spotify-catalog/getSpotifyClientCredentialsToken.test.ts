import { afterEach, describe, expect, it, vi } from "vitest"
import {
  clearSpotifyClientCredentialsTokenCache,
  getSpotifyClientCredentialsToken,
  SpotifyAppCredentialsError,
} from "./getSpotifyClientCredentialsToken"

describe("getSpotifyClientCredentialsToken", () => {
  afterEach(() => {
    clearSpotifyClientCredentialsTokenCache()
    vi.unstubAllGlobals()
    delete process.env.SPOTIFY_CLIENT_ID
    delete process.env.SPOTIFY_CLIENT_SECRET
  })

  it("throws when credentials are unset", async () => {
    await expect(getSpotifyClientCredentialsToken()).rejects.toBeInstanceOf(
      SpotifyAppCredentialsError,
    )
  })

  it("fetches and caches an app token", async () => {
    process.env.SPOTIFY_CLIENT_ID = "client-id"
    process.env.SPOTIFY_CLIENT_SECRET = "client-secret"

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "app-token",
        expires_in: 3600,
        token_type: "Bearer",
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const first = await getSpotifyClientCredentialsToken()
    const second = await getSpotifyClientCredentialsToken()

    expect(first).toEqual({ accessToken: "app-token", clientId: "client-id" })
    expect(second).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
