import { beforeEach, describe, expect, it, vi } from "vitest"
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

describe("resolveTargetDevice via play()", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getStoredTokens.mockResolvedValue({
      accessToken: "token",
      refreshToken: "refresh",
    })
    startResumePlayback.mockResolvedValue(undefined)
    transferPlayback.mockResolvedValue(undefined)
  })

  async function make(getPreferredDeviceId?: () => Promise<string | null>) {
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
        getPreferredDeviceId,
        onAuthenticationCompleted: vi.fn(),
        onPlay: vi.fn(),
        onPlaybackStateChange: vi.fn(),
      },
    })
  }

  it("transfers to preferred inactive device then plays", async () => {
    getAvailableDevices.mockResolvedValue({
      devices: [{ id: "sdk-1", is_active: false, name: "Listening Room Bridge" }],
    })
    const api = await make(async () => "sdk-1")
    await api.play()
    expect(transferPlayback).toHaveBeenCalledWith(["sdk-1"], false)
    expect(startResumePlayback).toHaveBeenCalledWith("sdk-1")
  })

  it("uses preferred active device without transfer", async () => {
    getAvailableDevices.mockResolvedValue({
      devices: [{ id: "sdk-1", is_active: true, name: "Listening Room Bridge" }],
    })
    const api = await make(async () => "sdk-1")
    await api.play()
    expect(transferPlayback).not.toHaveBeenCalled()
    expect(startResumePlayback).toHaveBeenCalledWith("sdk-1")
  })

  it("falls back to legacy active device when no preferred key", async () => {
    getPlaybackState.mockResolvedValue({ device: { id: "desktop-1" } })
    const api = await make(undefined)
    await api.play()
    expect(getAvailableDevices).not.toHaveBeenCalled()
    expect(startResumePlayback).toHaveBeenCalledWith("desktop-1")
  })

  it("uses Connect-listed Bridge id when ready id differs", async () => {
    getAvailableDevices.mockResolvedValue({
      devices: [
        { id: "listed-bridge", is_active: false, name: "Listening Room Bridge" },
        { id: "desktop-1", is_active: false, name: "Mac mini" },
      ],
    })
    const api = await make(async () => "ready-id-mismatch")
    await api.play()
    expect(transferPlayback).toHaveBeenCalledWith(["listed-bridge"], false)
    expect(startResumePlayback).toHaveBeenCalledWith("listed-bridge")
  })

  it("transfers by preferred id when device is missing from the list", async () => {
    getAvailableDevices.mockResolvedValue({ devices: [] })
    const api = await make(async () => "sdk-unlisted")
    await api.play()
    expect(transferPlayback).toHaveBeenCalledWith(["sdk-unlisted"], false)
    expect(startResumePlayback).toHaveBeenCalledWith("sdk-unlisted")
  })

  it("falls back when transfer of unlisted preferred device throws", async () => {
    getAvailableDevices.mockResolvedValue({ devices: [] })
    transferPlayback.mockRejectedValue(new Error("Device not found"))
    getPlaybackState.mockResolvedValue({ device: { id: "desktop-1" } })
    const api = await make(async () => "sdk-gone")
    await api.play()
    expect(startResumePlayback).toHaveBeenCalledWith("desktop-1")
  })

  it("targets listed preferred device when transfer throws a real error", async () => {
    getAvailableDevices.mockResolvedValue({
      devices: [{ id: "sdk-1", is_active: false, name: "Listening Room Bridge" }],
    })
    transferPlayback.mockRejectedValue(new Error("transfer failed"))
    const api = await make(async () => "sdk-1")
    await api.play()
    expect(startResumePlayback).toHaveBeenCalledWith("sdk-1")
  })
})
