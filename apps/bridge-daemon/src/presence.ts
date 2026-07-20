import type { RedisClientType } from "redis"
import {
  BRIDGE_PRESENCE_TTL_SEC,
  eventChannel,
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
    await this.redis.publish(eventChannel(this.roomId), JSON.stringify(event))
  }

  async disconnecting(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    await this.publish({ type: "DISCONNECTING" })
    await this.redis.del(presenceKey(this.roomId))
  }
}
