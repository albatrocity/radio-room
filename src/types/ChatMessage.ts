import { User } from "./User"

export type ChatMessage = {
  content: string
  mentions: []
  timestamp: string
  user: User
  reactions: []
  meta?: {
    status?: "error" | "success" | "warning" | "info"
    type?: "alert" | null
    title?: string | null
  }
}
