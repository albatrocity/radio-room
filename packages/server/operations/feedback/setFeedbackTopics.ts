import { randomUUID } from "node:crypto"
import {
  FEEDBACK_LIMITS,
  GENERAL_FEEDBACK_TOPIC_ID,
  type AppContext,
  type FeedbackTopic,
  type FeedbackTopicInput,
} from "@repo/types"
import { findRoom, isRoomAdmin } from "../data"
import {
  getActiveFeedbackTopics,
  getAllFeedbackTopics,
  setFeedbackTopicOrder,
  writeFeedbackTopic,
} from "../data/feedback"

export type SetFeedbackTopicsResult =
  | { ok: true; topics: FeedbackTopic[] }
  | {
      ok: false
      error: { status: number; error: string; message: string }
    }

/**
 * Replace the active topic list. Existing ids are preserved; missing previously-active
 * ids are archived (responses retained). New rows get fresh ids.
 */
export async function setFeedbackTopics({
  context,
  roomId,
  userId,
  topics: inputs,
}: {
  context: AppContext
  roomId: string
  userId: string
  topics: FeedbackTopicInput[]
}): Promise<SetFeedbackTopicsResult> {
  const room = await findRoom({ context, roomId })
  if (!room) {
    return {
      ok: false,
      error: { status: 404, error: "Not Found", message: "Room not found." },
    }
  }

  const isAdmin = await isRoomAdmin({
    context,
    roomId,
    userId,
    roomCreator: room.creator,
  })
  if (!isAdmin) {
    return {
      ok: false,
      error: { status: 403, error: "Forbidden", message: "You are not a room admin." },
    }
  }

  if (inputs.length > FEEDBACK_LIMITS.maxActiveTopics) {
    return {
      ok: false,
      error: {
        status: 400,
        error: "Bad Request",
        message: `At most ${FEEDBACK_LIMITS.maxActiveTopics} active topics are allowed.`,
      },
    }
  }

  for (const input of inputs) {
    const title = input.title?.trim() ?? ""
    if (
      title.length < FEEDBACK_LIMITS.titleMin ||
      title.length > FEEDBACK_LIMITS.titleMax
    ) {
      return {
        ok: false,
        error: {
          status: 400,
          error: "Bad Request",
          message: `Topic title must be ${FEEDBACK_LIMITS.titleMin}–${FEEDBACK_LIMITS.titleMax} characters.`,
        },
      }
    }
    if (input.id === GENERAL_FEEDBACK_TOPIC_ID) {
      return {
        ok: false,
        error: {
          status: 400,
          error: "Bad Request",
          message: "Cannot author the reserved general feedback topic.",
        },
      }
    }
    if (
      input.description != null &&
      input.description.length > FEEDBACK_LIMITS.descriptionMax
    ) {
      return {
        ok: false,
        error: {
          status: 400,
          error: "Bad Request",
          message: `Description must be at most ${FEEDBACK_LIMITS.descriptionMax} characters.`,
        },
      }
    }
  }

  const now = Date.now()
  const existing = await getAllFeedbackTopics({ context, roomId })
  const existingById = new Map(existing.map((t) => [t.id, t]))
  const usedIds = new Set<string>()
  const nextActive: FeedbackTopic[] = []

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i]!
    const title = input.title.trim()
    const description = input.description?.trim() || undefined
    let id = input.id
    let createdAt = now

    if (id && existingById.has(id)) {
      if (usedIds.has(id)) {
        return {
          ok: false,
          error: {
            status: 400,
            error: "Bad Request",
            message: "Duplicate topic id in payload.",
          },
        }
      }
      createdAt = existingById.get(id)!.createdAt
    } else {
      id = randomUUID()
    }

    usedIds.add(id)
    const topic: FeedbackTopic = {
      id,
      title,
      ...(description ? { description } : {}),
      sortOrder: i,
      status: "active",
      createdAt,
      updatedAt: now,
    }
    nextActive.push(topic)
    await writeFeedbackTopic({ context, roomId, topic })
  }

  for (const topic of existing) {
    if (topic.status === "active" && !usedIds.has(topic.id)) {
      await writeFeedbackTopic({
        context,
        roomId,
        topic: { ...topic, status: "archived", updatedAt: now },
      })
    }
  }

  await setFeedbackTopicOrder({
    context,
    roomId,
    topicIds: nextActive.map((t) => t.id),
  })

  const topics = await getActiveFeedbackTopics({ context, roomId })

  if (context.systemEvents) {
    await context.systemEvents.emit(roomId, "FEEDBACK_TOPICS_CHANGED", {
      roomId,
      topics,
    })
  }

  return { ok: true, topics }
}
