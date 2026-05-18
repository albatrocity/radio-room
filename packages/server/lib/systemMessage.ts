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

/** Ephemeral line delivered only to the target socket; client hides after `expiresInMs`. */
export function expirableChatMessage(
  user: { userId: string; username: string; id?: string },
  content: string,
  expiresInMs: number,
  options?: {
    contentSegments?: TextSegment[]
    meta?: ChatMessage["meta"]
    mentions?: ChatMessage["mentions"]
  },
): ChatMessage {
  // Capture createdAt and calculate expiresAt from the same base for accurate progress bar timing
  const createdAt = Date.now()
  const expiresAt = createdAt + expiresInMs
  return {
    user: {
      userId: user.userId,
      username: user.username,
      id: user.id ?? user.userId,
    },
    content,
    expiresAt,
    createdAt,
    contentSegments: options?.contentSegments,
    meta: options?.meta,
    timestamp: new Date(createdAt).toISOString(),
    mentions: options?.mentions,
  }
}

export default systemMessage
