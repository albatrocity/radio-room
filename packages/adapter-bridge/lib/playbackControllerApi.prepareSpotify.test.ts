import type { PlaybackControllerApi } from "@repo/types"
import { describe, expect, it, vi } from "vitest"
import type { ActiveSourceStore } from "./activeSource"
import { createBridgePlaybackApi } from "./playbackControllerApi"
import type { BridgeRpcClient } from "./rpcClient"

function makeApi(opts: { prepareResult?: unknown | Error } = {}) {
  const calls: string[] = []

  const rpc = {
    call: vi.fn(async (method: string) => {
      calls.push(method)
      if (method === "prepareSpotify") {
        if (opts.prepareResult instanceof Error) throw opts.prepareResult
        return opts.prepareResult ?? { deviceId: "sdk-fresh", recreated: true }
      }
      return null
    }),
    notify: vi.fn(async () => undefined),
  } as unknown as BridgeRpcClient

  const activeSource = {
    get: vi.fn(async () => "spotify"),
    set: vi.fn(async () => undefined),
    getLastVolume: vi.fn(async () => null),
  } as unknown as ActiveSourceStore

  const playTrack = vi.fn(async () => {
    calls.push("delegate.playTrack")
  })
  const play = vi.fn(async () => {
    calls.push("delegate.play")
  })

  const api = createBridgePlaybackApi({
    roomId: "room-1",
    rpc,
    activeSource,
    getSpotifyDelegate: async () => ({ playTrack, play }) as unknown as PlaybackControllerApi,
  })

  return { api, rpc, playTrack, play, calls }
}

describe("bridge Spotify lease preparation", () => {
  it("renews the SDK lease before commanding a Spotify track", async () => {
    const { api, calls } = makeApi()

    await api.playTrack("spotify:track:abc")

    expect(calls).toEqual(["prepareSpotify", "delegate.playTrack"])
  })

  it("renews before resuming, which hits the same stale lease", async () => {
    const { api, calls } = makeApi()

    await api.play?.()

    expect(calls).toEqual(["prepareSpotify", "delegate.play"])
  })

  it("plays anyway when the daemon cannot prepare", async () => {
    // Older daemon, no SDK device host, or a renewal that timed out: the Web API
    // device fallbacks still apply, so a failed prepare must not block the show.
    const { api, playTrack } = makeApi({ prepareResult: new Error("RPC timeout") })

    await expect(api.playTrack("spotify:track:abc")).resolves.toBeUndefined()
    expect(playTrack).toHaveBeenCalledWith("spotify:track:abc")
  })
})
