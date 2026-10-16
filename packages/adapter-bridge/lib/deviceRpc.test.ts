import { afterEach, describe, expect, it, vi } from "vitest"
import { BridgeRpcClient } from "./rpcClient"
import {
  beginDeviceLink,
  deviceRoomPresent,
  emitToDeviceSockets,
  receiveDeviceLink,
  registerDeviceSocket,
  resetDeviceSessionsForTests,
  settleDeviceResponse,
  watchDeviceRoom,
} from "./deviceSession"
import type { BridgeRequest } from "./protocol"
import { provisionSpotifyTokenForRoom } from "./spotifyTokenProvisioner"

const findRoom = vi.fn()
const getUserServiceAuth = vi.fn()
const set = vi.fn()

vi.mock("@repo/server/operations/data", () => ({
  findRoom: (...args: unknown[]) => findRoom(...args),
}))

vi.mock("@repo/adapter-spotify", () => ({
  createSpotifyServiceAuthAdapter: () => ({
    refreshAuth: vi.fn(),
  }),
}))

vi.mock("@repo/server/operations/dj/metadataAuthError", () => ({
  publishMetadataAuthError: vi.fn(),
}))

afterEach(() => {
  resetDeviceSessionsForTests()
  vi.clearAllMocks()
})

describe("device socket RPC", () => {
  it("plays and seeks without Redis pub/sub", async () => {
    const methods: string[] = []
    registerDeviceSocket({
      id: "sock-1",
      daemonId: "daemon-1",
      roomId: "room-1",
      emit: (event, payload) => {
        if (event !== "request") return
        const req = payload as BridgeRequest
        methods.push(req.method)
        settleDeviceResponse({ id: req.id, ok: true, result: null })
      },
    })

    const redis = {
      publish: vi.fn(() => {
        throw new Error("redis pub/sub disabled")
      }),
      ttl: vi.fn(() => {
        throw new Error("redis pub/sub disabled")
      }),
      duplicate: vi.fn(() => {
        throw new Error("redis pub/sub disabled")
      }),
    }
    const client = new BridgeRpcClient(redis as never, "room-1")

    await client.call("play", {})
    await client.call("seekTo", { positionMs: 1200 })

    expect(methods).toEqual(["play", "seekTo"])
    expect(redis.publish).not.toHaveBeenCalled()
  })

  it("does not write the spotify token key when a device socket is connected", async () => {
    const pushed: unknown[] = []
    registerDeviceSocket({
      id: "sock-2",
      daemonId: "daemon-1",
      roomId: "room-socket",
      emit: (event, payload) => {
        if (event === "spotify-token") pushed.push(payload)
      },
    })
    findRoom.mockResolvedValue({ creator: "user-1" })
    getUserServiceAuth.mockResolvedValue({
      accessToken: "atok",
      refreshToken: "rtok",
      expiresAt: Date.now() + 3600_000,
    })

    const token = await provisionSpotifyTokenForRoom({
      context: {
        redis: { pubClient: { set, del: vi.fn(), hGet: vi.fn() } },
        data: { getUserServiceAuth },
      } as never,
      roomId: "room-socket",
    })

    expect(token).toBe("atok")
    expect(set).not.toHaveBeenCalled()
    expect(pushed).toEqual([{ accessToken: "atok" }])
  })

  it("keeps the one-time link code off Redis", async () => {
    const emitted: unknown[] = []
    registerDeviceSocket({
      id: "sock-3",
      daemonId: "daemon-9",
      roomId: null,
      emit: (_event, payload) => {
        emitted.push(payload)
      },
    })

    const pending = beginDeviceLink("room-9", 1000)
    expect(pending).not.toBeNull()
    const request = emitted[0] as { type: string; requestId: string; code: string; roomId: string }
    expect(request.type).toBe("LINK_REQUEST")
    expect(request.code).toEqual(expect.any(String))

    receiveDeviceLink({
      type: "LINK_ACK",
      requestId: request.requestId,
      roomId: "room-9",
      ok: true,
      daemonId: "daemon-9",
      code: request.code,
    })

    await expect(pending).resolves.toEqual({
      ok: true,
      daemonId: "daemon-9",
      roomId: "room-9",
    })
  })

  it("does not ask a segment watcher to link", () => {
    const watcherEvents: unknown[] = []
    const bridgeEvents: unknown[] = []
    registerDeviceSocket({
      id: "watcher",
      daemonId: "local-remote",
      roomId: null,
      emit: (_event, payload) => {
        watcherEvents.push(payload)
      },
    })
    registerDeviceSocket({
      id: "bridge",
      daemonId: "daemon-1",
      roomId: null,
      emit: (_event, payload) => {
        bridgeEvents.push(payload)
      },
    })
    watchDeviceRoom("watcher", "room-1")

    const pending = beginDeviceLink("room-1", 1000)
    expect(pending).not.toBeNull()
    expect(watcherEvents).toEqual([])
    expect(bridgeEvents).toHaveLength(1)
    expect((bridgeEvents[0] as { type: string }).type).toBe("LINK_REQUEST")
  })

  it("delivers a segment cue to a watcher without treating it as a bridge", () => {
    const events: unknown[] = []
    registerDeviceSocket({
      id: "watcher",
      daemonId: "local-remote",
      roomId: null,
      emit: (event, payload) => {
        events.push([event, payload])
      },
    })
    watchDeviceRoom("watcher", "room-1")

    expect(deviceRoomPresent("room-1")).toBe(false)
    emitToDeviceSockets("room-1", "segment", { segmentId: "4", at: 10 })
    expect(events).toEqual([["segment", { segmentId: "4", at: 10 }]])
  })
})
