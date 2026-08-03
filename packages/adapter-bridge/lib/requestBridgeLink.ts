import { randomUUID } from "node:crypto"
import type { RedisClientType } from "redis"
import {
  BRIDGE_RPC_TIMEOUT_MS,
  bridgeControlMessageSchema,
  controlChannel,
  daemonPresenceKey,
  daemonsSetKey,
  type BridgeControlMessage,
} from "./protocol"

type RedisLike = RedisClientType<any, any, any>

export type RequestBridgeLinkResult =
  | { ok: true; daemonId: string; roomId: string }
  | { ok: false; error: string }

const OFFLINE_MESSAGE =
  "No Media Bridge is online. Start the bridge daemon on the DJ Mac (`bridge-daemon serve`) with Redis pointed at this environment, then try again."

/**
 * Publish LINK_REQUEST on BRIDGE:CONTROL and wait for the first matching ACK/NACK.
 */
export async function requestBridgeLink(params: {
  redis: RedisLike
  roomId: string
  timeoutMs?: number
}): Promise<RequestBridgeLinkResult> {
  const { redis, roomId } = params
  const timeoutMs = params.timeoutMs ?? BRIDGE_RPC_TIMEOUT_MS

  const online = await listOnlineBridgeDaemons(redis)
  if (online.length === 0) {
    return { ok: false, error: OFFLINE_MESSAGE }
  }

  const requestId = randomUUID()
  const sub = redis.duplicate() as RedisLike
  await sub.connect()

  let settled = false
  let timer: NodeJS.Timeout | null = null
  let finish!: (result: RequestBridgeLinkResult) => void

  const responsePromise = new Promise<RequestBridgeLinkResult>((resolve) => {
    finish = (result: RequestBridgeLinkResult) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve(result)
    }
  })

  try {
    timer = setTimeout(() => finish({ ok: false, error: OFFLINE_MESSAGE }), timeoutMs)

    await sub.subscribe(controlChannel(), (message: string) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(message)
      } catch {
        return
      }
      const result = bridgeControlMessageSchema.safeParse(parsed)
      if (!result.success) return
      const msg = result.data
      if (msg.type === "LINK_REQUEST") return
      if (msg.requestId !== requestId) return

      if (msg.type === "LINK_ACK") {
        finish({ ok: true, daemonId: msg.daemonId, roomId: msg.roomId })
      } else {
        finish({ ok: false, error: msg.error })
      }
    })

    const request: BridgeControlMessage = {
      type: "LINK_REQUEST",
      requestId,
      roomId,
      ts: Date.now(),
    }
    await redis.publish(controlChannel(), JSON.stringify(request))
    return await responsePromise
  } finally {
    try {
      await sub.unsubscribe(controlChannel())
      await sub.quit()
    } catch {
      /* ignore */
    }
  }
}

export async function listOnlineBridgeDaemons(redis: RedisLike): Promise<string[]> {
  const ids = await redis.sMembers(daemonsSetKey())
  if (!ids.length) {
    const keys = await redis.keys("bridge:daemon:*:presence")
    return keys
      .map((k) => {
        const m = /^bridge:daemon:(.+):presence$/.exec(k)
        return m?.[1]
      })
      .filter((id): id is string => Boolean(id))
  }

  const online: string[] = []
  for (const id of ids) {
    const ttl = await redis.ttl(daemonPresenceKey(id))
    if (ttl > 0) online.push(id)
  }
  return online
}
