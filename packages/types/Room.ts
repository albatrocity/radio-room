import { User } from "./User"
import { Station } from "./Station"
import { StationProtocol } from "./StationProtocol"
import { QueueItem } from "./Queue"

export type RoomError = {
  status: number
  message: string
}

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
  metadataSourceId?: string
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
}

export type RoomMeta = {
  nowPlaying?: QueueItem
  dj?: User
  title?: string
  artist?: string
  album?: string
  track?: string
  artwork?: string
  lastUpdatedAt?: string
  stationMeta?: Station
  // Legacy field for backward compatibility
  release?: any
}

export type MediaSourceStatus = {
  status: "online" | "offline" | "connecting" | "error"
  sourceType?: "jukebox" | "radio"
  bitrate?: number  // Radio-specific metadata
  error?: string
  lastUpdatedAt?: string
}
export interface StoredRoomMeta extends Omit<RoomMeta, "stationMeta" | "release" | "dj"> {
  stationMeta: string
  dj?: string
  release?: string
}

export type RoomSnapshot = {
  id: string
  lastMessageTime: number
  lastPlaylistItemTime: number
}
