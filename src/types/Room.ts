import { SpotifyTrack } from "./SpotifyTrack"
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
  radioUrl?: string
  createdAt?: string
  creator?: string
  spotifyError?: RoomError
  lastUpdatedAt?: string
}

export type RoomSetupShared = Pick<Room, "type" | "title">

export type RoomSetupRadio = RoomSetupShared & {
  type: "radio"
  radioUrl: Room["radioUrl"]
}

export type RoomMeta = {
  release?: SpotifyTrack
  track?: string
  artist?: string
  album?: string
  title?: string
  bitrate?: number
  dj?: User
}
