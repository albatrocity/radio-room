import type { AppContext, JobApi } from "@repo/types"
import type { RedisClientType } from "redis"

type NowPlayingMessage = {
  roomId: string
  title: string
  artist?: string
  album?: string
}

const CHANNEL = "SYSTEM:NOW_PLAYING_CHANGED"

/**
 * Per-room subscriber that listens for NOW_PLAYING_CHANGED messages on
 * Redis pub/sub and forwards structured track data to the server pipeline
 * via submitMediaData.
 */
export class RtmpRoomSubscriber {
  private subscriberClient: RedisClientType<any, any, any> | null = null

  constructor(
    private roomId: string,
    private context: AppContext,
    private api: JobApi,
  ) {}

  async start(): Promise<void> {
    this.subscriberClient = this.context.redis.pubClient.duplicate() as RedisClientType<
      any,
      any,
      any
    >
    await this.subscriberClient.connect()

    await this.subscriberClient.subscribe(CHANNEL, async (message: string) => {
      try {
        const data: NowPlayingMessage = JSON.parse(message)
        if (data.roomId !== this.roomId) return

        if (!data.title) {
          await this.api.submitMediaData({ roomId: this.roomId })
          return
        }

        const trackId = [data.artist, data.title, data.album].filter(Boolean).join("-")

        await this.api.submitMediaData({
          roomId: this.roomId,
          submission: {
            trackId,
            sourceType: "rtmp",
            title: data.title,
            artist: data.artist,
            album: data.album,
          },
        })
      } catch (error: any) {
        console.error(`[adapter-rtmp] Error processing NOW_PLAYING_CHANGED for room ${this.roomId}:`, error)
        await this.api.submitMediaData({
          roomId: this.roomId,
          error: error?.message || "Failed to process Now Playing data",
        })
      }
    })

    console.log(`[adapter-rtmp] Subscribed to ${CHANNEL} for room ${this.roomId}`)
  }

  async stop(): Promise<void> {
    if (this.subscriberClient) {
      try {
        await this.subscriberClient.unsubscribe(CHANNEL)
        await this.subscriberClient.disconnect()
      } catch {
        // Already disconnected
      }
      this.subscriberClient = null
      console.log(`[adapter-rtmp] Unsubscribed from ${CHANNEL} for room ${this.roomId}`)
    }
  }
}
