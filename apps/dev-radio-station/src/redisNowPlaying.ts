import { createClient, type RedisClientType } from "redis"
import type { TrackMeta } from "./icy.js"

export const SYSTEM_NOW_PLAYING_CHANNEL = "SYSTEM:NOW_PLAYING_CHANGED"

export type NowPlayingChangedPayload = {
  roomId?: string
  title?: string
  artist?: string
  album?: string
}

export function parseNowPlayingPayload(raw: string): NowPlayingChangedPayload | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object") return null
    return parsed as NowPlayingChangedPayload
  } catch {
    return null
  }
}

export function shouldAcceptNowPlaying(
  payload: NowPlayingChangedPayload,
  roomIdFilter: string | null,
): boolean {
  const title = payload.title?.trim()
  if (!title) return false
  if (!roomIdFilter) return true
  return payload.roomId === roomIdFilter
}

export function trackMetaFromPayload(payload: NowPlayingChangedPayload): TrackMeta {
  return {
    title: (payload.title ?? "").trim(),
    artist: (payload.artist ?? "").trim(),
    album: (payload.album ?? "").trim(),
  }
}

export type RedisNowPlayingOptions = {
  redisUrl: string
  roomId: string | null
  onTrack: (meta: TrackMeta, roomId: string | undefined) => void
  /** Injected for tests. */
  createRedisClient?: (url: string) => RedisClientType
}

/**
 * Subscribe to Media Bridge / local-remote now-playing publishes and forward
 * accepted events to the stream metadata controller.
 */
export async function startRedisNowPlayingSubscriber(
  options: RedisNowPlayingOptions,
): Promise<{ stop: () => Promise<void> }> {
  const create =
    options.createRedisClient ??
    ((url: string) => createClient({ url }) as RedisClientType)
  const client = create(options.redisUrl)

  client.on("error", (err) => {
    console.error("[dev-radio] redis error:", err)
  })

  await client.connect()
  await client.subscribe(SYSTEM_NOW_PLAYING_CHANNEL, (message) => {
    const payload = parseNowPlayingPayload(message)
    if (!payload || !shouldAcceptNowPlaying(payload, options.roomId)) return
    options.onTrack(trackMetaFromPayload(payload), payload.roomId)
  })

  console.log(
    `[dev-radio] subscribed to ${SYSTEM_NOW_PLAYING_CHANNEL}` +
      (options.roomId ? ` (room filter: ${options.roomId})` : " (latest event)"),
  )

  return {
    stop: async () => {
      try {
        await client.unsubscribe(SYSTEM_NOW_PLAYING_CHANNEL)
      } catch {
        // ignore
      }
      try {
        await client.quit()
      } catch {
        await client.disconnect().catch(() => undefined)
      }
    },
  }
}
