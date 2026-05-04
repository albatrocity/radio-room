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
  type: "jukebox" | "radio" | "live"
  title: string
  fetchMeta: boolean
  extraInfo: string | undefined
  password: string | null
  passwordRequired?: boolean
  artwork?: string
  /** When true, room artwork is only used in streaming mode (track detection off); metadata source artwork is shown otherwise */
  artworkStreamingOnly?: boolean
  enableSpotifyLogin: boolean
  deputizeOnJoin: boolean
  // Legacy fields - keep for backward compatibility
  radioMetaUrl?: string
  radioListenUrl?: string
  radioProtocol?: StationProtocol
  /**
   * Radio rooms only: offer optional experimental WebRTC (MediaMTX WHEP/LL-HLS) alongside Shoutcast.
   * Canonical Now Playing stays on the Shoutcast/ICY pipeline.
   */
  liveIngestEnabled?: boolean
  /** WebRTC WHEP playback URL when `liveIngestEnabled` */
  liveWhepUrl?: string
  /** LL-HLS fallback URL when `liveIngestEnabled` */
  liveHlsUrl?: string
  /**
   * Spotify playback delegation for rooms with a PlaybackController (typically radio).
   * `spotify-controlled` (default): tracks go to Spotify's queue; app queue mirrors Spotify.
   * `app-controlled`: app queue is authoritative; advance job starts the next track via Web API.
   */
  playbackMode?: "spotify-controlled" | "app-controlled"
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
  // Queue display settings (default true)
  showQueueCount?: boolean
  showQueueTracks?: boolean
  // Chat settings
  /** When true, non-admin listeners may upload images in chat; room admins may always upload. */
  allowChatImages?: boolean
  /** Attached scheduling show id (Postgres); timeline via Redis snapshot + SHOW_SCHEDULE_UPDATED */
  showId?: string | null
  /** Currently active segment within the attached show */
  activeSegmentId?: string | null
  /** When true, non-admins see the show timeline in the room sidebar */
  showSchedulePublic?: boolean
  /** When true, segment activation posts a system chat message with the segment title */
  announceActiveSegment?: boolean
  /** When true, the room is listed in the public lobby; when false, only accessible via direct URL */
  public?: boolean
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
    | "showQueueCount"
    | "showQueueTracks"
    | "allowChatImages"
    | "showSchedulePublic"
    | "announceActiveSegment"
    | "public"
    | "liveIngestEnabled"
  > {
  fetchMeta: Bool
  enableSpotifyLogin: Bool
  deputizeOnJoin: Bool
  announceNowPlaying?: Bool
  announceUsernameChanges?: Bool
  persistent?: Bool
  showQueueCount?: Bool
  showQueueTracks?: Bool
  allowChatImages?: Bool
  showSchedulePublic?: Bool
  announceActiveSegment?: Bool
  public?: Bool
  liveIngestEnabled?: Bool
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
  sourceType: z.enum(["jukebox", "radio", "live"]).optional(),
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
