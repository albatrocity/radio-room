import type { GameSession } from "@repo/types"
import { ChatMessage } from "./ChatMessage"
import { QueueItem } from "./Queue"
import { Reaction } from "./Reaction"
import { StationMeta } from "./StationMeta"
import { User } from "./User"

export type InitPayload = {
  /** Present after login; seeds UI when user joins mid-session. */
  activeGameSession?: GameSession | null
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
