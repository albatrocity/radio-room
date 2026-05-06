import type { ChatMessage } from "@repo/types"

export function formatChatBody(message: ChatMessage): string {
  if (message.contentSegments?.length) {
    return message.contentSegments.map((s) => s.text).join("")
  }
  return message.content
}
