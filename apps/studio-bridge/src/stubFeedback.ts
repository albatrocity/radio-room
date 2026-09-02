import { GENERAL_FEEDBACK_TOPIC_ID, type FeedbackResponse, type FeedbackTopic } from "@repo/types"

/** Stub topics for Listening Room preview when snapshot omits feedback. */
export function buildStubFeedbackTopics(): FeedbackTopic[] {
  const now = Date.now()
  return [
    {
      id: "studio-feedback-physical-media",
      title: "Physical Media",
      description: "How is the Record Store experience?",
      sortOrder: 0,
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
  ]
}

/** In-memory responses keyed by roomId → topicId → userId (studio-bridge only). */
const responsesByRoom = new Map<string, Map<string, Map<string, FeedbackResponse>>>()

function roomMap(roomId: string) {
  let m = responsesByRoom.get(roomId)
  if (!m) {
    m = new Map()
    responsesByRoom.set(roomId, m)
  }
  return m
}

export function getStudioMyFeedbackResponses(
  roomId: string,
  userId: string,
  topicIds: string[],
): Record<string, FeedbackResponse> {
  const out: Record<string, FeedbackResponse> = {}
  const room = responsesByRoom.get(roomId)
  if (!room) return out
  for (const topicId of topicIds) {
    const r = room.get(topicId)?.get(userId)
    if (r) out[topicId] = r
  }
  return out
}

export function upsertStudioFeedbackResponse(params: {
  roomId: string
  userId: string
  username: string
  topicId: string
  vote?: "up" | "down"
  comment?: string
}):
  | { ok: true; response: FeedbackResponse }
  | { ok: false; reason: string } {
  const { roomId, userId, topicId, vote, comment } = params
  if (vote === undefined && comment === undefined) {
    return { ok: false, reason: "EMPTY_UPDATE" }
  }
  const topics = roomMap(roomId)
  let byUser = topics.get(topicId)
  if (!byUser) {
    byUser = new Map()
    topics.set(topicId, byUser)
  }
  const existing = byUser.get(userId)
  const isGeneral = topicId === GENERAL_FEEDBACK_TOPIC_ID
  if (vote === undefined && !existing) {
    if (!isGeneral) {
      return { ok: false, reason: "NO_VOTE" }
    }
    if (comment === undefined || comment.length === 0) {
      return { ok: false, reason: "EMPTY_UPDATE" }
    }
  }
  const response: FeedbackResponse = {
    topicId,
    userId,
    vote: vote !== undefined ? vote : (existing?.vote ?? null),
    comment: comment !== undefined ? comment : (existing?.comment ?? ""),
    updatedAt: Date.now(),
  }
  byUser.set(userId, response)
  return { ok: true, response }
}

export function listStudioFeedbackInbox(
  roomId: string,
  usernameById: Map<string, string>,
): {
  topicId: string
  userId: string
  username: string
  vote: "up" | "down" | null
  comment: string
  updatedAt: number
}[] {
  const room = responsesByRoom.get(roomId)
  if (!room) return []
  const out: {
    topicId: string
    userId: string
    username: string
    vote: "up" | "down" | null
    comment: string
    updatedAt: number
  }[] = []
  for (const [topicId, byUser] of Array.from(room.entries())) {
    for (const [userId, r] of Array.from(byUser.entries())) {
      out.push({
        topicId,
        userId,
        username: usernameById.get(userId) ?? "Unknown",
        vote: r.vote,
        comment: r.comment,
        updatedAt: r.updatedAt,
      })
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

export { GENERAL_FEEDBACK_TOPIC_ID }
