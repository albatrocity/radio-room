import {
  GENERAL_FEEDBACK_TOPIC_ID,
  type AppContext,
  type FeedbackExportData,
  type FeedbackExportTopic,
  type FeedbackTopic,
} from "@repo/types"
import { getUsersByIds } from "../data"
import {
  getAllFeedbackResponsesForTopic,
  getAllFeedbackTopics,
} from "../data/feedback"

function makeGeneralTopic(): FeedbackTopic {
  return {
    id: GENERAL_FEEDBACK_TOPIC_ID,
    title: "General feedback",
    sortOrder: Number.MAX_SAFE_INTEGER,
    status: "active",
    createdAt: 0,
    updatedAt: 0,
  }
}

/**
 * Build export payload: active + archived topics + general (if it has responses).
 * Skip empty admin topics; always include general when it has responses.
 */
export async function loadFeedbackExportData({
  context,
  roomId,
}: {
  context: AppContext
  roomId: string
}): Promise<FeedbackExportData> {
  const storedTopics = await getAllFeedbackTopics({ context, roomId })
  const ordered = [
    ...storedTopics
      .filter((t) => t.status === "active")
      .sort((a, b) => a.sortOrder - b.sortOrder),
    ...storedTopics
      .filter((t) => t.status === "archived")
      .sort((a, b) => a.sortOrder - b.sortOrder),
    makeGeneralTopic(),
  ]

  const allUserIds = new Set<string>()
  const responsesByTopic = new Map<string, Awaited<ReturnType<typeof getAllFeedbackResponsesForTopic>>>()

  await Promise.all(
    ordered.map(async (topic) => {
      const responses = await getAllFeedbackResponsesForTopic({
        context,
        roomId,
        topicId: topic.id,
      })
      responsesByTopic.set(topic.id, responses)
      for (const r of responses) allUserIds.add(r.userId)
    }),
  )

  const users = await getUsersByIds({ context, userIds: [...allUserIds] })
  const usernameById = new Map(users.map((u) => [u.userId, u.username]))

  const topics: FeedbackExportTopic[] = []
  for (const topic of ordered) {
    const responses = responsesByTopic.get(topic.id) ?? []
    const isGeneral = topic.id === GENERAL_FEEDBACK_TOPIC_ID
    if (responses.length === 0 && isGeneral) continue
    if (responses.length === 0 && !isGeneral) continue

    let upCount = 0
    let downCount = 0
    for (const r of responses) {
      if (r.vote === "up") upCount += 1
      else downCount += 1
    }

    topics.push({
      topic,
      upCount,
      downCount,
      responses: responses
        .map((r) => ({
          userId: r.userId,
          username: usernameById.get(r.userId) ?? "Unknown",
          vote: r.vote,
          comment: r.comment,
          updatedAt: r.updatedAt,
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    })
  }

  return { topics }
}
