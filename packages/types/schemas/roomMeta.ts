import { z } from "zod"
import { roomMetaSchema } from "../Room"
import { queueItemSchema } from "../Queue"
import { userSchema } from "../User"
import { stationSchema } from "../Station"

/**
 * Redis storage transformation schemas for RoomMeta.
 * Uses base schemas from type files.
 */

// =============================================================================
// RoomMeta → Redis (serialization)
// =============================================================================

/**
 * Transform RoomMeta to Redis-storable Record<string, string>
 */
export const roomMetaToRedisSchema = roomMetaSchema.transform((meta): Record<string, string> => {
  const result: Record<string, string> = {}

  // Object fields → JSON strings
  if (meta.nowPlaying) result.nowPlaying = JSON.stringify(meta.nowPlaying)
  if (meta.release) result.release = JSON.stringify(meta.release)
  if (meta.dj) result.dj = JSON.stringify(meta.dj)
  if (meta.stationMeta) result.stationMeta = JSON.stringify(meta.stationMeta)

  // String fields → stored directly
  if (meta.title) result.title = meta.title
  if (meta.artist) result.artist = meta.artist
  if (meta.album) result.album = meta.album
  if (meta.track) result.track = meta.track
  if (meta.artwork) result.artwork = meta.artwork
  if (meta.lastUpdatedAt) result.lastUpdatedAt = meta.lastUpdatedAt
  if (meta.bitrate !== undefined) result.bitrate = String(meta.bitrate)

  // Always set lastUpdatedAt
  result.lastUpdatedAt = String(Date.now())

  return result
})

// =============================================================================
// Redis → RoomMeta (deserialization)
// =============================================================================

/**
 * Safe JSON parse helper for Redis string fields
 */
const safeJsonField = <T extends z.ZodTypeAny>(schema: T) =>
  z
    .string()
    .optional()
    .transform((str): z.infer<T> | undefined => {
      if (!str) return undefined
      try {
        const parsed = JSON.parse(str)
        const result = schema.safeParse(parsed)
        return result.success ? result.data : undefined
      } catch {
        return undefined
      }
    })

/**
 * Transform Redis Record<string, string> to RoomMeta
 */
export const redisToRoomMetaSchema = z
  .object({
    nowPlaying: safeJsonField(queueItemSchema),
    release: safeJsonField(queueItemSchema),
    dj: safeJsonField(userSchema),
    stationMeta: safeJsonField(stationSchema),
    title: z.string().optional(),
    artist: z.string().optional(),
    album: z.string().optional(),
    track: z.string().optional(),
    artwork: z.string().optional(),
    lastUpdatedAt: z.string().optional(),
    bitrate: z.string().optional(),
  })
  .transform((data) => {
    // Use nowPlaying if available, fall back to release
    const nowPlaying = data.nowPlaying || data.release
    return {
      nowPlaying,
      release: nowPlaying, // backward compatibility
      dj: data.dj,
      stationMeta: data.stationMeta,
      title: data.title,
      artist: data.artist,
      album: data.album,
      track: data.track,
      artwork: data.artwork,
      lastUpdatedAt: data.lastUpdatedAt,
    }
  })

export type StoredRoomMetaRedis = z.input<typeof redisToRoomMetaSchema>
