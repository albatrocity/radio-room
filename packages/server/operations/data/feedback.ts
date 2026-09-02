import {
  AppContext,
  feedbackResponseStoredSchema,
  feedbackTopicSchema,
  GENERAL_FEEDBACK_TOPIC_ID,
  type FeedbackResponse,
  type FeedbackResponseStored,
  type FeedbackTopic,
  type FeedbackVote,
} from "@repo/types"

// =============================================================================
// Key helpers
// =============================================================================

function topicsKey(roomId: string) {
  return `room:${roomId}:feedback:topics`
}

function topicOrderKey(roomId: string) {
  return `room:${roomId}:feedback:topic_order`
}

function responsesKey(roomId: string, topicId: string) {
  return `room:${roomId}:feedback:responses:${topicId}`
}

// =============================================================================
// Serialization
// =============================================================================

function parseTopic(raw: string): FeedbackTopic | null {
  try {
    const parsed = feedbackTopicSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function parseStoredResponse(raw: string): FeedbackResponseStored | null {
  try {
    const parsed = feedbackResponseStoredSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function toResponse(
  topicId: string,
  userId: string,
  stored: FeedbackResponseStored,
): FeedbackResponse {
  return {
    topicId,
    userId,
    vote: stored.vote,
    comment: stored.comment,
    updatedAt: stored.updatedAt,
  }
}

// =============================================================================
// Topics
// =============================================================================

export async function writeFeedbackTopic({
  context,
  roomId,
  topic,
}: {
  context: AppContext
  roomId: string
  topic: FeedbackTopic
}): Promise<void> {
  await context.redis.pubClient.hSet(topicsKey(roomId), topic.id, JSON.stringify(topic))
}

export async function getFeedbackTopic({
  context,
  roomId,
  topicId,
}: {
  context: AppContext
  roomId: string
  topicId: string
}): Promise<FeedbackTopic | null> {
  if (topicId === GENERAL_FEEDBACK_TOPIC_ID) return null
  const raw = await context.redis.pubClient.hGet(topicsKey(roomId), topicId)
  if (!raw) return null
  return parseTopic(raw)
}

export async function getAllFeedbackTopics({
  context,
  roomId,
}: {
  context: AppContext
  roomId: string
}): Promise<FeedbackTopic[]> {
  const raw = await context.redis.pubClient.hGetAll(topicsKey(roomId))
  if (!raw || Object.keys(raw).length === 0) return []
  const topics: FeedbackTopic[] = []
  for (const value of Object.values(raw)) {
    const topic = parseTopic(value)
    if (topic) topics.push(topic)
  }
  return topics
}

export async function setFeedbackTopicOrder({
  context,
  roomId,
  topicIds,
}: {
  context: AppContext
  roomId: string
  topicIds: string[]
}): Promise<void> {
  const key = topicOrderKey(roomId)
  if (topicIds.length === 0) {
    await context.redis.pubClient.del(key)
    return
  }
  await context.redis.pubClient.set(key, JSON.stringify(topicIds))
}

export async function getFeedbackTopicOrder({
  context,
  roomId,
}: {
  context: AppContext
  roomId: string
}): Promise<string[]> {
  const raw = await context.redis.pubClient.get(topicOrderKey(roomId))
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []
  } catch {
    return []
  }
}

/**
 * Active topics in order (excludes archived and general).
 */
export async function getActiveFeedbackTopics({
  context,
  roomId,
}: {
  context: AppContext
  roomId: string
}): Promise<FeedbackTopic[]> {
  const [order, all] = await Promise.all([
    getFeedbackTopicOrder({ context, roomId }),
    getAllFeedbackTopics({ context, roomId }),
  ])
  const byId = new Map(all.map((t) => [t.id, t]))
  const ordered: FeedbackTopic[] = []
  for (const id of order) {
    const topic = byId.get(id)
    if (topic && topic.status === "active") {
      ordered.push(topic)
    }
  }
  return ordered
}

// =============================================================================
// Responses
// =============================================================================

export async function getFeedbackResponse({
  context,
  roomId,
  topicId,
  userId,
}: {
  context: AppContext
  roomId: string
  topicId: string
  userId: string
}): Promise<FeedbackResponse | null> {
  const raw = await context.redis.pubClient.hGet(responsesKey(roomId, topicId), userId)
  if (!raw) return null
  const stored = parseStoredResponse(raw)
  if (!stored) return null
  return toResponse(topicId, userId, stored)
}

/**
 * Partial upsert: changing vote keeps existing comment.
 * Named topics: comment-only requires an existing vote.
 * General: comment-only create allowed (`vote: null`).
 */
export async function upsertFeedbackResponse({
  context,
  roomId,
  topicId,
  userId,
  vote,
  comment,
}: {
  context: AppContext
  roomId: string
  topicId: string
  userId: string
  vote?: FeedbackVote
  comment?: string
}): Promise<
  | { ok: true; response: FeedbackResponse }
  | { ok: false; reason: "NO_VOTE" | "EMPTY_UPDATE" }
> {
  if (vote === undefined && comment === undefined) {
    return { ok: false, reason: "EMPTY_UPDATE" }
  }

  const existing = await getFeedbackResponse({ context, roomId, topicId, userId })
  const isGeneral = topicId === GENERAL_FEEDBACK_TOPIC_ID

  if (vote === undefined && !existing) {
    if (!isGeneral) {
      return { ok: false, reason: "NO_VOTE" }
    }
    // General comment-only create: require a non-empty comment.
    if (comment === undefined || comment.length === 0) {
      return { ok: false, reason: "EMPTY_UPDATE" }
    }
  }

  const nextVote = vote !== undefined ? vote : (existing?.vote ?? null)
  const nextComment =
    comment !== undefined ? comment : (existing?.comment ?? "")
  const updatedAt = Date.now()

  const stored: FeedbackResponseStored = {
    vote: nextVote,
    comment: nextComment,
    updatedAt,
  }

  await context.redis.pubClient.hSet(
    responsesKey(roomId, topicId),
    userId,
    JSON.stringify(stored),
  )

  return {
    ok: true,
    response: toResponse(topicId, userId, stored),
  }
}

export async function getAllFeedbackResponsesForTopic({
  context,
  roomId,
  topicId,
}: {
  context: AppContext
  roomId: string
  topicId: string
}): Promise<FeedbackResponse[]> {
  const raw = await context.redis.pubClient.hGetAll(responsesKey(roomId, topicId))
  if (!raw || Object.keys(raw).length === 0) return []
  const out: FeedbackResponse[] = []
  for (const [userId, value] of Object.entries(raw)) {
    const stored = parseStoredResponse(value)
    if (stored) out.push(toResponse(topicId, userId, stored))
  }
  return out
}

/**
 * All responses for the given user across active topics + general.
 */
export async function getMyFeedbackResponses({
  context,
  roomId,
  userId,
  topicIds,
}: {
  context: AppContext
  roomId: string
  userId: string
  /** Topic ids to check (active topics + typically general). */
  topicIds: string[]
}): Promise<Record<string, FeedbackResponse>> {
  const result: Record<string, FeedbackResponse> = {}
  await Promise.all(
    topicIds.map(async (topicId) => {
      const response = await getFeedbackResponse({ context, roomId, topicId, userId })
      if (response) result[topicId] = response
    }),
  )
  return result
}
