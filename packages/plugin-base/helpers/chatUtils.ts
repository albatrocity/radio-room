import type { ChatMessage } from "@repo/types"

/** True when the chat message is from the room system user (not a listener). */
export function isSystemChatMessage(message: ChatMessage): boolean {
  return message.user.userId === "system"
}

/**
 * Normalize a guess or token for comparison: trim, lowercase, strip surrounding
 * punctuation; keep internal apostrophes. Empty string if nothing left.
 */
export function normalizeToken(value: string): string {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return ""
  return trimmed.replace(/^[^a-z0-9']+|[^a-z0-9']+$/gi, "")
}
