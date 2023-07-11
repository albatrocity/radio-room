import { SpotifyTrack } from "./SpotifyTrack"
import { User } from "./User"

export type Room = {
  id: string
  type: "jukebox" | "radio"
  title: string
  fetchMeta: boolean
  extraInfo: string | undefined
  password: string | null
  artwork?: string
  enableSpotifyLogin: boolean
  deputizeOnJoin: boolean
  radioUrl?: string
  createdAt?: string
  creator?: string
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
