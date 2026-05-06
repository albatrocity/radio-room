import type { ChatMessage } from "@repo/types"
import { isoNow } from "./constants"

export function studioSystemMessage(
  content: string,
  meta?: ChatMessage["meta"],
  mentions?: ChatMessage["mentions"],
): ChatMessage {
  return {
    user: {
      username: "system",
      id: "system",
      userId: "system",
    },
    content,
    meta,
    timestamp: isoNow(),
    mentions,
  }
}
