import type { RedisClientType } from "redis"
import {
  BRIDGE_RPC_TIMEOUT_MS,
  bridgeResponseSchema,
  presenceKey,
  requestChannel,
  responseChannel,
  type BridgeRequest,
  type BridgeResponse,
} from "./protocol"

type RedisLike = RedisClientType<any, any, any>

export class BridgeRpcClient {
  private pending = new Map<
    string,
    { resolve: (value: BridgeResponse) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >()
  private sub: RedisLike | null = null
  private started = false

  constructor(
    private readonly pub: RedisLike,
    private readonly roomId: string,
  ) {}

  async start(): Promise<void> {
    if (this.started) return
    this.sub = this.pub.duplicate() as RedisLike
    await this.sub.connect()
    await this.sub.subscribe(responseChannel(this.roomId), (message: string) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(message)
      } catch {
        return
      }
      const result = bridgeResponseSchema.safeParse(parsed)
      if (!result.success) return
      const pending = this.pending.get(result.data.id)
      if (!pending) return
      clearTimeout(pending.timer)
      this.pending.delete(result.data.id)
      pending.resolve(result.data)
    })
    this.started = true
  }

  async stop(): Promise<void> {
    for (const [, p] of Array.from(this.pending)) {
      clearTimeout(p.timer)
      p.reject(new Error("RPC client stopped"))
    }
    this.pending.clear()
    if (this.sub) {
      try {
        await this.sub.unsubscribe(responseChannel(this.roomId))
        await this.sub.quit()
      } catch {
        /* ignore */
      }
      this.sub = null
    }
    this.started = false
  }

  async isPresent(): Promise<boolean> {
    const ttl = await this.pub.ttl(presenceKey(this.roomId))
    return ttl > 0
  }

  async call(
    method: BridgeRequest["method"],
    params: Record<string, unknown> = {},
    options?: { timeoutMs?: number; requirePresence?: boolean },
  ): Promise<unknown> {
    const requirePresence = options?.requirePresence !== false
    if (requirePresence && !(await this.isPresent())) {
      throw new Error(`Bridge daemon not connected for room ${this.roomId}`)
    }

    await this.start()

    const id = crypto.randomUUID()
    const request: BridgeRequest = { id, method, params }

    const timeoutMs = options?.timeoutMs ?? BRIDGE_RPC_TIMEOUT_MS
    const responsePromise = new Promise<BridgeResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Bridge RPC timeout: ${method}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
    })

    await this.pub.publish(requestChannel(this.roomId), JSON.stringify(request))
    const response = await responsePromise
    if (!response.ok) {
      throw new Error(response.error ?? `Bridge RPC failed: ${method}`)
    }
    return response.result
  }

  /** Fire-and-forget (e.g. notifyNowPlaying). Still requires presence when requirePresence is true. */
  async notify(
    method: BridgeRequest["method"],
    params: Record<string, unknown> = {},
  ): Promise<void> {
    if (!(await this.isPresent())) return
    const id = crypto.randomUUID()
    const request: BridgeRequest = { id, method, params }
    await this.pub.publish(requestChannel(this.roomId), JSON.stringify(request))
  }
}
