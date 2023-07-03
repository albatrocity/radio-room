import { User } from "./User"

export interface TrackMeta {
  bitrate: number
  album: string
  artist: string
  track: string
  release: any
  artwork: string
  title: string
  dj?: Pick<User, "userId" | "username"> | null
}
