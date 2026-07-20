import type { RedisClientType } from "redis"
import {
  bridgeRequestSchema,
  requestChannel,
  responseChannel,
  type BridgeRequest,
} from "@repo/adapter-bridge/protocol"
import type { LocalDriver } from "./drivers/local"
import type { Router } from "./router"

type RedisLike = RedisClientType<any, any, any>

export class RpcServer {
  private sub: RedisLike | null = null

  constructor(
    private readonly redis: RedisLike,
    private readonly roomId: string,
    private readonly router: Router,
    private readonly localDriver: LocalDriver | null,
  ) {}

  async start(): Promise<void> {
    this.sub = this.redis.duplicate() as RedisLike
    await this.sub.connect()
    await this.sub.subscribe(requestChannel(this.roomId), (message: string) => {
      void this.handleMessage(message)
    })
    console.log(`[rpc] Listening on ${requestChannel(this.roomId)}`)
  }

  async stop(): Promise<void> {
    if (!this.sub) return
    try {
      await this.sub.unsubscribe(requestChannel(this.roomId))
      await this.sub.quit()
    } catch {
      /* ignore */
    }
    this.sub = null
  }

  private async handleMessage(message: string) {
    let parsed: unknown
    try {
      parsed = JSON.parse(message)
    } catch {
      return
    }
    const result = bridgeRequestSchema.safeParse(parsed)
    if (!result.success) return
    const req = result.data

    // notifyNowPlaying is fire-and-forget (no response required, but we still reply ok)
    try {
      const value = await this.dispatch(req)
      await this.redis.publish(
        responseChannel(this.roomId),
        JSON.stringify({ id: req.id, ok: true, result: value }),
      )
    } catch (e) {
      await this.redis.publish(
        responseChannel(this.roomId),
        JSON.stringify({
          id: req.id,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        }),
      )
    }
  }

  private async dispatch(req: BridgeRequest): Promise<unknown> {
    const p = req.params
    switch (req.method) {
      case "playTrack":
        await this.router.playTrack({
          source: String(p.source),
          trackId: String(p.trackId),
          title: p.title != null ? String(p.title) : undefined,
          artist: p.artist != null ? String(p.artist) : undefined,
          album: p.album != null ? String(p.album) : undefined,
          volumePercent: typeof p.volumePercent === "number" ? p.volumePercent : undefined,
        })
        return null
      case "play":
        await this.router.play(p.source != null ? String(p.source) : undefined)
        return null
      case "pause":
        await this.router.pause(p.source != null ? String(p.source) : undefined)
        return null
      case "stop":
        await this.router.stop(p.source != null ? String(p.source) : undefined)
        return null
      case "seekTo":
        await this.router.seekTo(
          p.source != null ? String(p.source) : undefined,
          Number(p.positionMs ?? 0),
        )
        return null
      case "setVolume":
        await this.router.setVolume(
          p.source != null ? String(p.source) : undefined,
          Number(p.percent ?? 100),
        )
        return null
      case "getPlayback":
        return this.router.getPlayback()
      case "search": {
        if (String(p.source) !== "local" || !this.localDriver) return []
        return this.localDriver.search(String(p.query ?? ""))
      }
      case "notifyNowPlaying":
        await this.router.notifyNowPlaying({
          title: p.title != null ? String(p.title) : undefined,
          artist: p.artist != null ? String(p.artist) : undefined,
          album: p.album != null ? String(p.album) : undefined,
        })
        return null
      default:
        throw new Error(`Unknown method ${req.method}`)
    }
  }
}
