import {
  GENERAL_FEEDBACK_TOPIC_ID,
  type AppContext,
  type FeedbackInboxEntry,
  type FeedbackTopic,
} from "@repo/types"
import { getUsersByIds } from "../data"
import {
  getAllFeedbackResponsesForTopic,
  getAllFeedbackTopics,
} from "../data/feedback"

function makeGeneralTopic(): FeedbackTopic {
  const now = 0
  return {
    id: GENERAL_FEEDBACK_TOPIC_ID,
    title: "General feedback",
    sortOrder: Number.MAX_SAFE_INTEGER,
    status: "active",
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Load all responses across active + archived topics + general, with usernames.
 */
export async function loadFeedbackInbox({
  context,
  roomId,
}: {
  context: AppContext
  roomId: string
}): Promise<{
  topics: FeedbackTopic[]
  responses: FeedbackInboxEntry[]
}> {
  const topics = await getAllFeedbackTopics({ context, roomId })
  const topicIds = [
    ...topics.map((t) => t.id),
    GENERAL_FEEDBACK_TOPIC_ID,
  ]

  const allResponses = (
    await Promise.all(
      topicIds.map((topicId) =>
        getAllFeedbackResponsesForTopic({ context, roomId, topicId }),
      ),
    )
  ).flat()

  const userIds = [...new Set(allResponses.map((r) => r.userId))]
  const users = await getUsersByIds({ context, userIds })
  const usernameById = new Map(users.map((u) => [u.userId, u.username]))

  const responses: FeedbackInboxEntry[] = allResponses
    .map((r) => ({
      topicId: r.topicId,
      userId: r.userId,
      username: usernameById.get(r.userId) ?? "Unknown",
      vote: r.vote,
      comment: r.comment,
      updatedAt: r.updatedAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)

  return {
    topics: [...topics, makeGeneralTopic()],
    responses,
  }
}

export async function toFeedbackInboxEntry({
  context,
  response,
}: {
  context: AppContext
  response: {
    topicId: string
    userId: string
    vote: FeedbackInboxEntry["vote"]
    comment: string
    updatedAt: number
  }
}): Promise<FeedbackInboxEntry> {
  const users = await getUsersByIds({ context, userIds: [response.userId] })
  return {
    topicId: response.topicId,
    userId: response.userId,
    username: users[0]?.username ?? "Unknown",
    vote: response.vote,
    comment: response.comment,
    updatedAt: response.updatedAt,
  }
}
