import { describe, it, expect, vi, beforeEach } from "vitest"
import { makeApi } from "./playbackControllerApi"

const seekToPosition = vi.fn()
const getPlaybackState = vi.fn()
const getStoredTokens = vi.fn()
const onPlaybackPositionChange = vi.fn()

vi.mock("@spotify/web-api-ts-sdk", () => ({
  SpotifyApi: {
    withAccessToken: () => ({
      getAccessToken: vi.fn().mockResolvedValue({
        access_token: "token",
        refresh_token: "refresh",
        expires_in: 3600,
      }),
      player: {
        seekToPosition,
        getPlaybackState,
      },
    }),
  },
}))

async function buildApi() {
  return makeApi({
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
      onPlaybackPositionChange,
    },
  })
}

describe("playbackControllerApi.seekTo", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getStoredTokens.mockResolvedValue({
      accessToken: "token",
      refreshToken: "refresh",
    })
    getPlaybackState.mockResolvedValue({
      device: { id: "device-1" },
    })
    seekToPosition.mockResolvedValue(undefined)
  })

  it("seeks on the resolved device", async () => {
    const api = await buildApi()
    await api.seekTo(12_345)
    expect(seekToPosition).toHaveBeenCalledWith(12_345, "device-1")
    expect(onPlaybackPositionChange).toHaveBeenCalledWith(12_345)
  })

  it("treats Spotify empty-body JSON parse errors as success", async () => {
    seekToPosition.mockRejectedValue(
      new SyntaxError("Unexpected number in JSON at position 1"),
    )
    const api = await buildApi()
    await expect(api.seekTo(5000)).resolves.toBeUndefined()
    expect(onPlaybackPositionChange).toHaveBeenCalledWith(5000)
  })

  it("rethrows non-empty-body errors", async () => {
    seekToPosition.mockRejectedValue(new Error("Bad or expired token"))
    const api = await buildApi()
    await expect(api.seekTo(5000)).rejects.toThrow("Bad or expired token")
    expect(onPlaybackPositionChange).not.toHaveBeenCalled()
  })
})
