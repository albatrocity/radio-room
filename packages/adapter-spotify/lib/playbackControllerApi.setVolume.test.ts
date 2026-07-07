import { describe, it, expect, vi, beforeEach } from "vitest"
import { makeApi } from "./playbackControllerApi"

const setPlaybackVolume = vi.fn()
const getPlaybackState = vi.fn()
const getStoredTokens = vi.fn()

vi.mock("@spotify/web-api-ts-sdk", () => ({
  SpotifyApi: {
    withAccessToken: () => ({
      getAccessToken: vi.fn().mockResolvedValue({
        access_token: "token",
        refresh_token: "refresh",
        expires_in: 3600,
      }),
      player: {
        setPlaybackVolume,
        getPlaybackState,
      },
    }),
  },
}))

describe("playbackControllerApi.setVolume", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getStoredTokens.mockResolvedValue({
      accessToken: "token",
      refreshToken: "refresh",
    })
    getPlaybackState.mockResolvedValue({
      device: { id: "device-1" },
    })
    setPlaybackVolume.mockResolvedValue(undefined)
  })

  it("clamps volume and calls Spotify setPlaybackVolume", async () => {
    const api = await makeApi({
      token: {
        access_token: "token",
        refresh_token: "refresh",
        token_type: "Bearer",
        expires_in: 3600,
      },
      clientId: "client",
      config: {
        name: "spotify",
        authentication: {
          type: "oauth",
          getStoredTokens,
        },
        onAuthenticationCompleted: vi.fn(),
      },
    })

    await api.setVolume!(140.7)

    expect(setPlaybackVolume).toHaveBeenCalledWith(100, "device-1")
  })
})
