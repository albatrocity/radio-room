import type { PlaybackControllerApi } from "@repo/types"
import { describe, expect, it, vi } from "vitest"
import type { ActiveSourceStore } from "./activeSource"
import { createBridgePlaybackApi } from "./playbackControllerApi"
import type { BridgeRpcClient } from "./rpcClient"

type RpcResult = Record<string, unknown>

function makeApi(opts: {
  source?: string | null
  rpcResult?: RpcResult | Error
  delegate?: Partial<PlaybackControllerApi> | null
}) {
  const rpc = {
    call: vi.fn(async () => {
      if (opts.rpcResult instanceof Error) throw opts.rpcResult
      return opts.rpcResult ?? null
    }),
    notify: vi.fn(async () => undefined),
  } as unknown as BridgeRpcClient

  const activeSource = {
    get: vi.fn(async () => opts.source ?? "spotify"),
    getLastVolume: vi.fn(async () => 50),
    set: vi.fn(async () => undefined),
  } as unknown as ActiveSourceStore

  const delegateGetPlayback = vi.fn(async () => ({
    state: "playing" as const,
    track: { id: "web-api-track" } as never,
    progressMs: 42_000,
    durationMs: 180_000,
  }))

  const api = createBridgePlaybackApi({
    roomId: "room-1",
    rpc,
    activeSource,
    getSpotifyDelegate: async () =>
      opts.delegate === null
        ? null
        : ({
            getPlayback: delegateGetPlayback,
            ...opts.delegate,
          } as unknown as PlaybackControllerApi),
  })

  return { api, rpc, delegateGetPlayback }
}

describe("bridge getPlayback observability", () => {
  it("returns the daemon snapshot when the SDK actually read the transport", async () => {
    const { api, delegateGetPlayback } = makeApi({
      rpcResult: { state: "playing", trackId: "abc", progressMs: 1_000, durationMs: 180_000 },
    })

    const playback = await api.getPlayback()

    expect(playback.progressMs).toBe(1_000)
    expect(playback.durationMs).toBe(180_000)
    expect(playback.observed).not.toBe(false)
    expect(delegateGetPlayback).not.toHaveBeenCalled()
  })

  it("falls through to the Spotify Web API when the daemon has no view of the transport", async () => {
    // A detached SDK answers the RPC successfully but cannot see the player, which used
    // to blank the progress bar and make the advance watchdog skip every track.
    const { api, delegateGetPlayback } = makeApi({
      rpcResult: { state: "stopped", progressMs: null, durationMs: null, observed: false },
    })

    const playback = await api.getPlayback()

    expect(delegateGetPlayback).toHaveBeenCalledOnce()
    expect(playback.progressMs).toBe(42_000)
    expect(playback.durationMs).toBe(180_000)
  })

  it("reports no view when neither the daemon nor a Spotify delegate can answer", async () => {
    const { api } = makeApi({
      rpcResult: { state: "stopped", observed: false },
      delegate: null,
    })

    await expect(api.getPlayback()).resolves.toMatchObject({ observed: false })
  })

  it("reports no view when the RPC itself fails for a driver source", async () => {
    const { api } = makeApi({
      source: "local",
      rpcResult: new Error("timeout"),
    })

    await expect(api.getPlayback()).resolves.toMatchObject({
      state: "stopped",
      observed: false,
    })
  })

  it("keeps a driver's genuine stop actionable so unplayable media can still be skipped", async () => {
    const { api } = makeApi({
      source: "local",
      rpcResult: { state: "stopped", progressMs: null, durationMs: null },
    })

    const playback = await api.getPlayback()

    expect(playback.state).toBe("stopped")
    expect(playback.observed).not.toBe(false)
  })
})
