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
  /** Unix epoch (ms) when this message should be hidden (ephemeral / sender-only previews). */
  expiresAt?: number
  /** Unix epoch (ms) when this ephemeral message was created (pairs with expiresAt for progress bar). */
  createdAt?: number
}
