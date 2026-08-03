import type { RedisClientType } from "redis"
import {
  BRIDGE_LAST_ENDED_TTL_SEC,
  BRIDGE_PRESENCE_TTL_SEC,
  eventChannel,
  lastEndedKey,
  presenceKey,
  type BridgeEvent,
} from "@repo/adapter-bridge/protocol"

type RedisLike = RedisClientType<any, any, any>

export class Presence {
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly redis: RedisLike,
    private readonly roomId: string,
  ) {}

  async start(services: string[]): Promise<void> {
    await this.refresh()
    this.timer = setInterval(() => void this.refresh(), 3000)
    await this.publish({ type: "CAPABILITIES", services })
  }

  async refresh(): Promise<void> {
    await this.redis.set(presenceKey(this.roomId), "1", { EX: BRIDGE_PRESENCE_TTL_SEC })
  }

  async publish(event: BridgeEvent): Promise<void> {
    // Durable ENDED for the advance job (pub/sub can miss across process boundaries)
    if (event.type === "ENDED") {
      await this.redis.set(
        lastEndedKey(this.roomId),
        JSON.stringify({
          trackId: event.trackId,
          source: event.source,
          reason: event.reason,
          at: Date.now(),
        }),
        { EX: BRIDGE_LAST_ENDED_TTL_SEC },
      )
      console.log(
        `[presence] wrote last_ended source=${event.source} trackId=${event.trackId} reason=${event.reason ?? "none"}`,
      )
    }
    await this.redis.publish(eventChannel(this.roomId), JSON.stringify(event))
  }

  async disconnecting(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    await this.publish({ type: "DISCONNECTING" })
    await this.redis.del(presenceKey(this.roomId))
  }
}
