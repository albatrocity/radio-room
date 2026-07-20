import type { RedisClientType } from "redis"
import { bridgeEventSchema, eventChannel, presenceKey, type BridgeEvent } from "./protocol"

type RedisLike = RedisClientType<any, any, any>

export type CapabilityListener = (services: Set<string>) => void
export type BridgeEventListener = (event: BridgeEvent) => void

/**
 * Subscribes to BRIDGE events and presence for a room.
 * Exposes available services for search fan-out and UI.
 */
export class BridgeCapabilityCache {
  private services = new Set<string>()
  private connected = false
  private sub: RedisLike | null = null
  private capabilityListeners = new Set<CapabilityListener>()
  private eventListeners = new Set<BridgeEventListener>()
  private lastState: Extract<BridgeEvent, { type: "STATE" }> | null = null

  constructor(
    private readonly redis: RedisLike,
    private readonly roomId: string,
  ) {}

  getAvailableServices(): Set<string> {
    return new Set(this.services)
  }

  isConnected(): boolean {
    return this.connected
  }

  getLastState() {
    return this.lastState
  }

  onCapabilities(listener: CapabilityListener): () => void {
    this.capabilityListeners.add(listener)
    return () => this.capabilityListeners.delete(listener)
  }

  onEvent(listener: BridgeEventListener): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  async start(): Promise<void> {
    if (this.sub) return
    this.sub = this.redis.duplicate() as RedisLike
    await this.sub.connect()
    await this.sub.subscribe(eventChannel(this.roomId), (message: string) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(message)
      } catch {
        return
      }
      const result = bridgeEventSchema.safeParse(parsed)
      if (!result.success) return
      const event = result.data
      for (const listener of Array.from(this.eventListeners)) listener(event)

      if (event.type === "CAPABILITIES") {
        this.services = new Set(event.services)
        this.connected = true
        for (const listener of Array.from(this.capabilityListeners)) listener(this.services)
      } else if (event.type === "DISCONNECTING") {
        this.connected = false
        this.services = new Set()
        for (const listener of Array.from(this.capabilityListeners)) listener(this.services)
      } else if (event.type === "STATE") {
        this.lastState = event
      }
    })

    // Seed connected from presence key
    const ttl = await this.redis.ttl(presenceKey(this.roomId))
    this.connected = ttl > 0
  }

  async stop(): Promise<void> {
    if (!this.sub) return
    try {
      await this.sub.unsubscribe(eventChannel(this.roomId))
      await this.sub.quit()
    } catch {
      /* ignore */
    }
    this.sub = null
  }
}

/** Module-level caches keyed by roomId so advance jobs can share state. */
const caches = new Map<string, BridgeCapabilityCache>()

export function getOrCreateCapabilityCache(
  redis: RedisLike,
  roomId: string,
): BridgeCapabilityCache {
  let cache = caches.get(roomId)
  if (!cache) {
    cache = new BridgeCapabilityCache(redis, roomId)
    caches.set(roomId, cache)
  }
  return cache
}

export function dropCapabilityCache(roomId: string): void {
  const cache = caches.get(roomId)
  if (cache) {
    void cache.stop()
    caches.delete(roomId)
  }
}
