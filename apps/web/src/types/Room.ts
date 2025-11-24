import { SpotifyTrack } from "./SpotifyTrack"
import { StationMeta } from "./StationMeta"
import { StationProtocol } from "./StationProtocol"
import { User } from "./User"

export type RoomError = {
  status: number
  message: string
}

export type Room = {
  id: string
  type: "jukebox" | "radio"
  title: string
  fetchMeta: boolean
  extraInfo: string | undefined
  password: string | null
  passwordRequired?: boolean
  artwork?: string
  enableSpotifyLogin: boolean
  deputizeOnJoin: boolean
  radioMetaUrl?: string
  radioListenUrl?: string
  radioProtocol?: StationProtocol
  createdAt?: string
  creator?: string
  spotifyError?: RoomError
  radioError?: RoomError
  lastUpdatedAt?: string
  announceUsernameChanges?: boolean
  announceNowPlaying?: boolean
}

export type RoomSetup = Pick<
  Room,
  | "type"
  | "title"
  | "radioMetaUrl"
  | "radioListenUrl"
  | "radioProtocol"
  | "deputizeOnJoin"
> & {
  playbackControllerId?: string
  metadataSourceId?: string
  mediaSourceId?: string
}

import { QueueItem } from "./Queue"

export type RoomMeta = {
  nowPlaying?: QueueItem
  track?: string
  artist?: string
  album?: string
  title?: string
  bitrate?: number
  stationMeta: StationMeta
  dj?: User
  lastUpdatedAt?: string
}
