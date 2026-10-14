import type { AppContext, JobApi } from "@repo/types"
import type { RedisClientType } from "redis"

type NowPlayingMessage = {
  roomId: string
  title: string
  artist?: string
  album?: string
}

const CHANNEL = "SYSTEM:NOW_PLAYING_CHANGED"

/** Redis now-playing payload. Kept so packs that still publish the channel keep working. */
export async function handleNowPlayingMessage(
  roomId: string,
  api: JobApi,
  message: string,
): Promise<void> {
  try {
    const data: NowPlayingMessage = JSON.parse(message)
    if (data.roomId !== roomId) return

    if (!data.title) {
      await api.submitMediaData({ roomId })
      return
    }

    const trackId = [data.artist, data.title, data.album].filter(Boolean).join("-")

    await api.submitMediaData({
      roomId,
      submission: {
        trackId,
        sourceType: "rtmp",
        title: data.title,
        artist: data.artist,
        album: data.album,
      },
    })
  } catch (error: any) {
    console.error(`[adapter-rtmp] Error processing NOW_PLAYING_CHANGED for room ${roomId}:`, error)
    await api.submitMediaData({
      roomId,
      error: error?.message || "Failed to process Now Playing data",
    })
  }
}

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
      await handleNowPlayingMessage(this.roomId, this.api, message)
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
