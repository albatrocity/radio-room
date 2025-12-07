import { z } from "zod"
import { userSchema } from "./User"
import { stationSchema } from "./Station"
import { StationProtocol } from "./StationProtocol"
import { queueItemSchema } from "./Queue"

// =============================================================================
// RoomError Schema & Type
// =============================================================================

export const roomErrorSchema = z.object({
  status: z.number(),
  message: z.string(),
})
export type RoomError = z.infer<typeof roomErrorSchema>

// =============================================================================
// Room Type (complex, not fully schema-based due to optional configs)
// =============================================================================

export type Room = {
  id: string
  creator: string
  type: "jukebox" | "radio"
  title: string
  fetchMeta: boolean
  extraInfo: string | undefined
  password: string | null
  passwordRequired?: boolean
  artwork?: string
  enableSpotifyLogin: boolean
  deputizeOnJoin: boolean
  // Legacy fields - keep for backward compatibility
  radioMetaUrl?: string
  radioListenUrl?: string
  radioProtocol?: StationProtocol
  // New adapter-based configuration
  playbackControllerId?: string
  metadataSourceIds?: string[]
  mediaSourceId?: string
  mediaSourceConfig?: { url: string }
  createdAt: string
  spotifyError?: RoomError
  radioError?: RoomError
  lastRefreshedAt: string
  announceNowPlaying?: boolean
  announceUsernameChanges?: boolean
  persistent?: boolean
}

// =============================================================================
// StoredRoom (Redis storage format)
// =============================================================================

type Bool = "true" | "false"

export interface StoredRoom
  extends Omit<
    Room,
    | "fetchMeta"
    | "enableSpotifyLogin"
    | "deputizeOnJoin"
    | "spotifyError"
    | "radioError"
    | "announceNowPlaying"
    | "announceUsernameChanges"
    | "persistent"
    | "mediaSourceConfig"
    | "metadataSourceIds"
  > {
  fetchMeta: Bool
  enableSpotifyLogin: Bool
  deputizeOnJoin: Bool
  announceNowPlaying?: Bool
  announceUsernameChanges?: Bool
  persistent?: Bool
  spotifyError?: string
  radioError?: string
  mediaSourceConfig?: string
  metadataSourceIds?: string // JSON stringified array
}

// =============================================================================
// RoomMeta Schema & Type
// =============================================================================

export const roomMetaSchema = z.object({
  nowPlaying: queueItemSchema.nullish(),
  dj: userSchema.nullish(),
  title: z.string().nullish(),
  artist: z.string().nullish(),
  album: z.string().nullish(),
  track: z.string().nullish(),
  artwork: z.string().nullish(),
  lastUpdatedAt: z.string().nullish(),
  stationMeta: stationSchema.nullish(),
  // Legacy field for backward compatibility
  release: queueItemSchema.nullish(),
  bitrate: z.number().nullish(),
})

export type RoomMeta = z.infer<typeof roomMetaSchema>

// =============================================================================
// MediaSourceStatus Schema & Type
// =============================================================================

export const mediaSourceStatusSchema = z.object({
  status: z.enum(["online", "offline", "connecting", "error"]),
  sourceType: z.enum(["jukebox", "radio"]).optional(),
  bitrate: z.number().optional(),
  error: z.string().optional(),
  lastUpdatedAt: z.string().optional(),
})

export type MediaSourceStatus = z.infer<typeof mediaSourceStatusSchema>

// =============================================================================
// StoredRoomMeta (Redis storage format)
// =============================================================================

export interface StoredRoomMeta
  extends Omit<RoomMeta, "stationMeta" | "release" | "dj" | "nowPlaying"> {
  stationMeta?: string
  dj?: string
  release?: string
  nowPlaying?: string
}

// =============================================================================
// RoomSnapshot Type
// =============================================================================

export type RoomSnapshot = {
  id: string
  lastMessageTime: number
  lastPlaylistItemTime: number
}
