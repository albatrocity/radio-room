import { ChatMessage } from "./ChatMessage"
import { QueueItem } from "./Queue"
import { Reaction } from "./Reaction"
import { StationMeta } from "./StationMeta"
import { User } from "./User"

export type InitPayload = {
  user: User | null
  messages: ChatMessage[]
  meta: StationMeta
  playlist: QueueItem[]
  queue: QueueItem[]
  reactions: {
    message: Record<string, Reaction[]>
    track: Record<string, Reaction[]>
  }
  users: User[]
}
