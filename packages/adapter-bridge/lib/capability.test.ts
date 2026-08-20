import { describe, expect, it, vi } from "vitest"
import { BridgeCapabilityCache } from "./capability"
import { capabilitiesKey, presenceKey } from "./protocol"

function mockRedis(params: { presenceTtl: number; capabilities: string[] | null }) {
  const store = new Map<string, string>()
  if (params.capabilities) {
    store.set("caps", JSON.stringify(params.capabilities))
  }
  return {
    ttl: vi.fn(async (key: string) => (key.includes(":presence") ? params.presenceTtl : -2)),
    get: vi.fn(async (key: string) => (key.includes(":capabilities") ? store.get("caps") ?? null : null)),
    duplicate: vi.fn(() => ({
      connect: vi.fn(async () => {}),
      subscribe: vi.fn(async () => {}),
      unsubscribe: vi.fn(async () => {}),
      quit: vi.fn(async () => {}),
    })),
  }
}

describe("BridgeCapabilityCache.start", () => {
  it("seeds services from durable CAPABILITIES when presence is live", async () => {
    const redis = mockRedis({ presenceTtl: 8, capabilities: ["youtube", "local"] })
    const cache = new BridgeCapabilityCache(redis as any, "room-1")
    await cache.start()

    expect(redis.ttl).toHaveBeenCalledWith(presenceKey("room-1"))
    expect(redis.get).toHaveBeenCalledWith(capabilitiesKey("room-1"))
    expect(cache.isConnected()).toBe(true)
    expect(cache.hasReceivedCapabilities()).toBe(true)
    expect([...cache.getAvailableServices()].sort()).toEqual(["local", "youtube"])
  })

  it("does not treat capabilities as known when the durable key is missing", async () => {
    const redis = mockRedis({ presenceTtl: 8, capabilities: null })
    const cache = new BridgeCapabilityCache(redis as any, "room-1")
    await cache.start()

    expect(cache.isConnected()).toBe(true)
    expect(cache.hasReceivedCapabilities()).toBe(false)
    expect(cache.getAvailableServices().size).toBe(0)
  })
})
