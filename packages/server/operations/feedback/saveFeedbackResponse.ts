import {
  FEEDBACK_LIMITS,
  GENERAL_FEEDBACK_TOPIC_ID,
  type AppContext,
  type FeedbackResponse,
  type FeedbackVote,
} from "@repo/types"
import { findRoom } from "../data"
import { getFeedbackTopic, upsertFeedbackResponse } from "../data/feedback"

export type SaveFeedbackResponseResult =
  | { ok: true; response: FeedbackResponse }
  | {
      ok: false
      reason:
        | "UNAUTHORIZED"
        | "ROOM_NOT_FOUND"
        | "TOPIC_NOT_FOUND"
        | "NO_VOTE"
        | "INVALID_COMMENT"
        | "EMPTY_UPDATE"
    }

export async function saveFeedbackResponse({
  context,
  roomId,
  userId,
  topicId,
  vote,
  comment,
}: {
  context: AppContext
  roomId: string
  userId: string
  topicId: string
  vote?: FeedbackVote
  comment?: string
}): Promise<SaveFeedbackResponseResult> {
  const room = await findRoom({ context, roomId })
  if (!room) {
    return { ok: false, reason: "ROOM_NOT_FOUND" }
  }

  if (topicId !== GENERAL_FEEDBACK_TOPIC_ID) {
    const topic = await getFeedbackTopic({ context, roomId, topicId })
    if (!topic || topic.status !== "active") {
      return { ok: false, reason: "TOPIC_NOT_FOUND" }
    }
  }

  if (comment !== undefined && comment.length > FEEDBACK_LIMITS.commentMax) {
    return { ok: false, reason: "INVALID_COMMENT" }
  }

  const result = await upsertFeedbackResponse({
    context,
    roomId,
    topicId,
    userId,
    vote,
    comment,
  })

  if (!result.ok) {
    return { ok: false, reason: result.reason }
  }

  return { ok: true, response: result.response }
}
