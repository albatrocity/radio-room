import type { AppContext, ChatMessage, TextSegment } from "@repo/types"
import systemMessage from "../../lib/systemMessage"
import { persistMessage } from "../data/messages"

export async function postSystemChatMessage({
  context,
  roomId,
  content,
  meta,
  contentSegments,
}: {
  context: AppContext
  roomId: string
  content: string
  meta?: ChatMessage["meta"]
  contentSegments?: TextSegment[]
}): Promise<void> {
  const message: ChatMessage = {
    ...systemMessage(content, meta),
    ...(contentSegments ? { contentSegments } : {}),
  }

  if (context.systemEvents) {
    await context.systemEvents.emit(roomId, "MESSAGE_RECEIVED", {
      roomId,
      message,
    })
  }

  await persistMessage({ roomId, message, context })
}
