import { Server } from "socket.io"
import type { FeedbackTopicInput, FeedbackVote } from "@repo/types"
import { SocketWithContext } from "../lib/socketWithContext"
import { createFeedbackHandlers } from "../handlers/feedbackHandlersAdapter"

/**
 * Feedback Controller — registers feedback-related socket events (ADR 0145).
 */
export function createFeedbackController(socket: SocketWithContext, io: Server): void {
  const handlers = createFeedbackHandlers(socket.context)
  const connections = { socket, io }

  socket.on(
    "SET_FEEDBACK_TOPICS",
    async (data: { topics: FeedbackTopicInput[] }) => {
      await handlers.setTopics(connections, data)
    },
  )

  socket.on(
    "SAVE_FEEDBACK_RESPONSE",
    async (data: { topicId: string; vote?: FeedbackVote; comment?: string }) => {
      await handlers.saveResponse(connections, data)
    },
  )

  socket.on("GET_FEEDBACK_INBOX", async () => {
    await handlers.getInbox(connections)
  })
}

export default createFeedbackController
