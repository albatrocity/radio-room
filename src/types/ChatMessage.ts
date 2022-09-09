import { User } from "./User"

export type ChatMessage = {
  content: string
  mentions: []
  timestamp: string
  user: User
  reactions: []
  meta?: {
    status?: string
  }
}
