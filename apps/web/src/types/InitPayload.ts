import { ChatMessage } from "./ChatMessage"
import { PlaylistItem } from "./PlaylistItem"
import { Reaction } from "./Reaction"
import { StationMeta } from "./StationMeta"
import { User } from "./User"

export type InitPayload = {
  user: User | null
  messages: ChatMessage[]
  meta: StationMeta
  playlist: PlaylistItem[]
  reactions: {
    message: Record<string, Reaction[]>
    track: Record<string, Reaction[]>
  }
  users: User[]
}
