import { describe, expect, it, vi, beforeEach } from "vitest"
import { controlChannel, daemonsSetKey, daemonPresenceKey } from "./protocol"
import { requestBridgeLink } from "./requestBridgeLink"

describe("requestBridgeLink", () => {
  const subscribeHandlers: Array<(message: string) => void> = []
  const publish = vi.fn()
  const sMembers = vi.fn()
  const ttl = vi.fn()
  const keys = vi.fn()
  const subscribe = vi.fn(async (_ch: string, handler: (message: string) => void) => {
    subscribeHandlers.push(handler)
  })
  const unsubscribe = vi.fn()
  const quit = vi.fn()
  const connect = vi.fn()

  const redis = {
    publish,
    sMembers,
    ttl,
    keys,
    duplicate: () => ({
      connect,
      subscribe,
      unsubscribe,
      quit,
    }),
  } as any

  beforeEach(() => {
    vi.clearAllMocks()
    subscribeHandlers.length = 0
    sMembers.mockResolvedValue(["daemon-1"])
    ttl.mockResolvedValue(10)
    keys.mockResolvedValue([])
  })

  it("fails fast when no daemon presence", async () => {
    sMembers.mockResolvedValue([])
    keys.mockResolvedValue([])

    const result = await requestBridgeLink({ redis, roomId: "room-1", timeoutMs: 50 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/No Media Bridge is online/)
    }
    expect(publish).not.toHaveBeenCalled()
  })

  it("resolves LINK_ACK for matching requestId", async () => {
    const pending = requestBridgeLink({ redis, roomId: "room-1", timeoutMs: 2000 })

    await vi.waitFor(() => expect(publish).toHaveBeenCalled())
    const published = JSON.parse(publish.mock.calls[0][1]) as {
      type: string
      requestId: string
      roomId: string
    }
    expect(publish.mock.calls[0][0]).toBe(controlChannel())
    expect(published.type).toBe("LINK_REQUEST")
    expect(published.roomId).toBe("room-1")

    subscribeHandlers[0]!(
      JSON.stringify({
        type: "LINK_ACK",
        requestId: published.requestId,
        roomId: "room-1",
        ok: true,
        daemonId: "daemon-1",
      }),
    )

    const result = await pending
    expect(result).toEqual({ ok: true, daemonId: "daemon-1", roomId: "room-1" })
    expect(sMembers).toHaveBeenCalledWith(daemonsSetKey())
    expect(ttl).toHaveBeenCalledWith(daemonPresenceKey("daemon-1"))
  })

  it("resolves LINK_NACK error", async () => {
    const pending = requestBridgeLink({ redis, roomId: "room-1", timeoutMs: 2000 })
    await vi.waitFor(() => expect(publish).toHaveBeenCalled())
    const published = JSON.parse(publish.mock.calls[0][1]) as { requestId: string }

    subscribeHandlers[0]!(
      JSON.stringify({
        type: "LINK_NACK",
        requestId: published.requestId,
        roomId: "room-1",
        ok: false,
        error: "Chrome failed",
        daemonId: "daemon-1",
      }),
    )

    const result = await pending
    expect(result).toEqual({ ok: false, error: "Chrome failed" })
  })
})
