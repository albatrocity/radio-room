import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { makeApi } from "./playbackControllerApi"

const startResumePlayback = vi.fn()
const getPlaybackState = vi.fn()
const getAvailableDevices = vi.fn()
const transferPlayback = vi.fn()
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
        getAvailableDevices,
        transferPlayback,
      },
    }),
  },
}))

const TRACK_URI = "spotify:track:4cOdK2wGLETKBW3PvgPWqT"
const OTHER_URI = "spotify:track:0000000000000000000000"

async function buildApi(getPreferredDeviceId?: () => Promise<string | null>) {
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
        clientId: "client",
        token: { accessToken: "token", refreshToken: "refresh" },
        getStoredTokens,
      },
      getPreferredDeviceId,
      onAuthenticationCompleted: vi.fn(),
    },
  })
}

/** Let the un-awaited confirm run to completion under fake timers. */
async function drainConfirm() {
  await vi.advanceTimersByTimeAsync(10_000)
}

describe("playTrack confirm-and-retry", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    getStoredTokens.mockResolvedValue({ accessToken: "token", refreshToken: "refresh" })
    startResumePlayback.mockResolvedValue(undefined)
    transferPlayback.mockResolvedValue(undefined)
    getAvailableDevices.mockResolvedValue({
      devices: [{ id: "sdk-1", is_active: true, name: "Listening Room Bridge" }],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("retries once when a stale lease accepted the play but started nothing", async () => {
    // Spotify answers 204 and then plays silence — the HTTP result cannot tell us.
    getPlaybackState.mockResolvedValue({ device: { id: "sdk-1" }, item: null })
    const api = await buildApi(async () => "sdk-1")

    await api.playTrack(TRACK_URI)
    expect(startResumePlayback).toHaveBeenCalledTimes(1)

    await drainConfirm()
    expect(startResumePlayback).toHaveBeenCalledTimes(2)
    expect(startResumePlayback).toHaveBeenLastCalledWith(
      "sdk-1",
      undefined,
      [TRACK_URI],
      undefined,
      0,
    )
  })

  it("does not retry when the track is confirmed playing", async () => {
    getPlaybackState.mockResolvedValue({
      device: { id: "sdk-1" },
      item: { id: "4cOdK2wGLETKBW3PvgPWqT", uri: TRACK_URI },
    })
    const api = await buildApi(async () => "sdk-1")

    await api.playTrack(TRACK_URI)
    await drainConfirm()

    expect(startResumePlayback).toHaveBeenCalledTimes(1)
  })

  it("abandons the retry when a newer track has been commanded", async () => {
    // A DJ skip during the confirm window; replaying the old URI would yank the room back.
    getPlaybackState.mockResolvedValue({ device: { id: "sdk-1" }, item: null })
    const api = await buildApi(async () => "sdk-1")

    await api.playTrack(TRACK_URI)
    await api.playTrack(OTHER_URI)
    startResumePlayback.mockClear()

    await drainConfirm()

    // The newer track's own confirm still retries; the abandoned one never replays.
    expect(startResumePlayback).toHaveBeenCalled()
    for (const call of startResumePlayback.mock.calls) {
      expect(call[2]).toEqual([OTHER_URI])
    }
  })

  it("leaves non-bridge rooms on the pre-existing single-shot path", async () => {
    getPlaybackState.mockResolvedValue({ device: { id: "desktop-1" }, item: null })
    const api = await buildApi(undefined)

    await api.playTrack(TRACK_URI)
    await drainConfirm()

    expect(startResumePlayback).toHaveBeenCalledTimes(1)
  })
})

describe("resolveTargetDevice with duplicate bridge devices", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getStoredTokens.mockResolvedValue({ accessToken: "token", refreshToken: "refresh" })
    startResumePlayback.mockResolvedValue(undefined)
    transferPlayback.mockResolvedValue(undefined)
  })

  it("prefers the advertised id over a stale same-named player", async () => {
    // Lease renewal leaves the previous player listed until Spotify reaps it.
    getAvailableDevices.mockResolvedValue({
      devices: [
        { id: "stale-1", is_active: false, name: "Listening Room Bridge" },
        { id: "fresh-2", is_active: false, name: "Listening Room Bridge" },
      ],
    })
    const api = await buildApi(async () => "fresh-2")

    await api.play()

    expect(startResumePlayback).toHaveBeenCalledWith("fresh-2")
  })

  it("prefers the active same-named player when the advertised id is gone", async () => {
    getAvailableDevices.mockResolvedValue({
      devices: [
        { id: "stale-1", is_active: false, name: "Listening Room Bridge" },
        { id: "active-2", is_active: true, name: "Listening Room Bridge" },
      ],
    })
    const api = await buildApi(async () => "reaped-id")

    await api.play()

    expect(startResumePlayback).toHaveBeenCalledWith("active-2")
  })
})
