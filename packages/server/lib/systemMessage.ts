import type { ChatMessage, TextSegment } from "@repo/types"

const systemMessage = (content: string, meta?: {}, mentions?: ChatMessage["mentions"]) => {
  const newMessage = {
    user: {
      username: "system",
      id: "system",
      userId: "system",
    },
    content,
    meta,
    timestamp: new Date().toISOString(),
    mentions,
  }
  return newMessage
}

/** Ephemeral line delivered only to the target socket; client hides after `expiresAt`. */
export function expirableChatMessage(
  user: { userId: string; username: string; id?: string },
  content: string,
  expiresAt: number,
  options?: {
    contentSegments?: TextSegment[]
    meta?: ChatMessage["meta"]
    mentions?: ChatMessage["mentions"]
  },
): ChatMessage {
  // Use ISO timestamp for proper date parsing (required for sorting).
  // Millisecond precision is sufficient for uniqueness since preview messages
  // are per-user and sequential (only one pending message at a time).
  return {
    user: {
      userId: user.userId,
      username: user.username,
      id: user.id ?? user.userId,
    },
    content,
    expiresAt,
    contentSegments: options?.contentSegments,
    meta: options?.meta,
    timestamp: new Date().toISOString(),
    mentions: options?.mentions,
  }
}

export default systemMessage
