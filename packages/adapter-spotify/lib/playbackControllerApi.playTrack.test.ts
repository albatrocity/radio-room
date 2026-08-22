import { describe, it, expect, vi, beforeEach } from "vitest"
import { makeApi } from "./playbackControllerApi"

const startResumePlayback = vi.fn()
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
        startResumePlayback,
        getPlaybackState,
      },
    }),
  },
}))

const TRACK_URI = "spotify:track:4cOdK2wGLETKBW3PvgPWqT"

const gatewayError = () =>
  new Error(
    'Unrecognised response code: 502 - Bad Gateway. Body: { "error" : { "status" : 502, "message" : "Bad gateway." } }',
  )

async function buildApi() {
  return await makeApi({
    token: {
      access_token: "token",
      refresh_token: "refresh",
      token_type: "Bearer",
      expires_in: 3600,
    },
    clientId: "client",
    config: {
      name: "spotify",
      authentication: { type: "oauth", getStoredTokens },
      onAuthenticationCompleted: vi.fn(),
    },
  })
}

describe("playbackControllerApi.playTrack", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getStoredTokens.mockResolvedValue({ accessToken: "token", refreshToken: "refresh" })
    getPlaybackState.mockResolvedValue({ device: { id: "device-1" } })
    startResumePlayback.mockResolvedValue(undefined)
  })

  it("plays the requested track on the resolved device", async () => {
    const api = await buildApi()

    await api.playTrack(TRACK_URI)

    expect(startResumePlayback).toHaveBeenCalledWith(
      "device-1",
      undefined,
      [TRACK_URI],
      undefined,
      0,
    )
  })

  it("treats a 502 as success once playback confirms the track started", async () => {
    const api = await buildApi()
    startResumePlayback.mockRejectedValueOnce(gatewayError())
    getPlaybackState.mockResolvedValue({
      device: { id: "device-1" },
      item: { id: "4cOdK2wGLETKBW3PvgPWqT", uri: TRACK_URI },
    })

    await expect(api.playTrack(TRACK_URI)).resolves.toBeUndefined()
  })

  it("rethrows a 502 when the track never started", async () => {
    const api = await buildApi()
    startResumePlayback.mockRejectedValueOnce(gatewayError())

    await expect(api.playTrack(TRACK_URI)).rejects.toThrow("502")
  })

  it("rethrows a 502 when a different track is playing", async () => {
    const api = await buildApi()
    startResumePlayback.mockRejectedValueOnce(gatewayError())
    getPlaybackState.mockResolvedValue({
      device: { id: "device-1" },
      item: { id: "someOtherTrackId", uri: "spotify:track:someOtherTrackId" },
    })

    await expect(api.playTrack(TRACK_URI)).rejects.toThrow("502")
  })

  it("still rethrows non-gateway failures without probing playback", async () => {
    const api = await buildApi()
    startResumePlayback.mockRejectedValueOnce(new Error("403 Forbidden"))

    await expect(api.playTrack(TRACK_URI)).rejects.toThrow("403")
  })
})
