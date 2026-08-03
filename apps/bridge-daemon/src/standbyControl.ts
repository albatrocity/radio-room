import { hostname as osHostname } from "node:os"
import type { RedisClientType } from "redis"
import {
  BRIDGE_DAEMON_PRESENCE_TTL_SEC,
  bridgeControlMessageSchema,
  controlChannel,
  daemonPresenceKey,
  daemonsSetKey,
  type BridgeControlMessage,
  type BridgeDaemonPresence,
} from "@repo/adapter-bridge/protocol"

type RedisLike = RedisClientType<any, any, any>

export type StandbyHandlers = {
  getConnectedRoomId: () => string | null
  connect: (roomId: string) => Promise<void>
}

/**
 * Always-on Redis control plane for `serve` / `connect --ui`:
 * - heartbeats bridge:daemon:{id}:presence
 * - subscribes to BRIDGE:CONTROL for LINK_REQUEST
 */
export class StandbyControl {
  private heartbeat: NodeJS.Timeout | null = null
  private sub: RedisLike | null = null
  private linking = false

  constructor(
    private readonly redis: RedisLike,
    private readonly daemonId: string,
    private readonly handlers: StandbyHandlers,
  ) {}

  async start(): Promise<void> {
    await this.redis.sAdd(daemonsSetKey(), this.daemonId)
    await this.refreshPresence()
    this.heartbeat = setInterval(() => {
      void this.refreshPresence().catch((e) =>
        console.warn("[standby] presence refresh failed:", e),
      )
    }, Math.floor((BRIDGE_DAEMON_PRESENCE_TTL_SEC * 1000) / 3))

    this.sub = this.redis.duplicate() as RedisLike
    await this.sub.connect()
    await this.sub.subscribe(controlChannel(), (message: string) => {
      void this.onControlMessage(message)
    })
    console.log(`[standby] listening on ${controlChannel()} as ${this.daemonId}`)
  }

  async stop(): Promise<void> {
    if (this.heartbeat) {
      clearInterval(this.heartbeat)
      this.heartbeat = null
    }
    try {
      await this.redis.del(daemonPresenceKey(this.daemonId))
      await this.redis.sRem(daemonsSetKey(), this.daemonId)
    } catch {
      /* ignore */
    }
    if (this.sub) {
      try {
        await this.sub.unsubscribe(controlChannel())
        await this.sub.quit()
      } catch {
        /* ignore */
      }
      this.sub = null
    }
  }

  /** Call after connect/disconnect so presence reflects current room. */
  async refreshPresence(): Promise<void> {
    const payload: BridgeDaemonPresence = {
      daemonId: this.daemonId,
      hostname: osHostname(),
      connectedRoomId: this.handlers.getConnectedRoomId(),
      updatedAt: Date.now(),
    }
    await this.redis.set(daemonPresenceKey(this.daemonId), JSON.stringify(payload), {
      EX: BRIDGE_DAEMON_PRESENCE_TTL_SEC,
    })
  }

  private async onControlMessage(message: string): Promise<void> {
    let parsed: unknown
    try {
      parsed = JSON.parse(message)
    } catch {
      return
    }
    const result = bridgeControlMessageSchema.safeParse(parsed)
    if (!result.success) return
    const msg = result.data
    if (msg.type !== "LINK_REQUEST") return

    if (this.linking) {
      await this.publish({
        type: "LINK_NACK",
        requestId: msg.requestId,
        roomId: msg.roomId,
        ok: false,
        error: "Media Bridge is already handling a link request",
        daemonId: this.daemonId,
      })
      return
    }

    this.linking = true
    console.log(`[standby] LINK_REQUEST room=${msg.roomId} requestId=${msg.requestId}`)
    try {
      await this.handlers.connect(msg.roomId)
      await this.refreshPresence()
      await this.publish({
        type: "LINK_ACK",
        requestId: msg.requestId,
        roomId: msg.roomId,
        ok: true,
        daemonId: this.daemonId,
      })
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      console.error(`[standby] LINK_REQUEST failed:`, e)
      await this.publish({
        type: "LINK_NACK",
        requestId: msg.requestId,
        roomId: msg.roomId,
        ok: false,
        error,
        daemonId: this.daemonId,
      })
    } finally {
      this.linking = false
    }
  }

  private async publish(msg: BridgeControlMessage): Promise<void> {
    await this.redis.publish(controlChannel(), JSON.stringify(msg))
  }
}
