import type { TextSegment } from "@repo/types"
import { Reaction } from "./Reaction"
import { User } from "./User"

export type ChatMessage = {
  content: string
  contentSegments?: TextSegment[]
  mentions?: string[]
  timestamp: string
  user: User
  reactions?: Reaction["type"][]
  meta?: {
    status?: "error" | "success" | "warning" | "info"
    type?: "alert" | null
    title?: string | null
  }
}
