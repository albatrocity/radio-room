import { describe, it, expect, beforeEach } from "vitest"
import type { AppContext, FeedbackTopic } from "@repo/types"
import { GENERAL_FEEDBACK_TOPIC_ID } from "@repo/types"
import { MemoryRedisClient } from "../../test-utils/MemoryRedisClient"
import {
  getActiveFeedbackTopics,
  getAllFeedbackResponsesForTopic,
  getFeedbackResponse,
  getMyFeedbackResponses,
  setFeedbackTopicOrder,
  upsertFeedbackResponse,
  writeFeedbackTopic,
} from "./feedback"

function makeContext(client: MemoryRedisClient): AppContext {
  return {
    redis: {
      pubClient: client as unknown as AppContext["redis"]["pubClient"],
      subClient: client as unknown as AppContext["redis"]["subClient"],
    },
  } as AppContext
}

function makeTopic(overrides: Partial<FeedbackTopic> = {}): FeedbackTopic {
  const now = 1_000
  return {
    id: "topic-1",
    title: "Physical Media",
    description: "How is it?",
    sortOrder: 0,
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe("feedback data layer", () => {
  let client: MemoryRedisClient
  let context: AppContext

  beforeEach(() => {
    client = new MemoryRedisClient()
    context = makeContext(client)
  })

  describe("topics", () => {
    it("returns active topics in order", async () => {
      const a = makeTopic({ id: "a", title: "A", sortOrder: 0 })
      const b = makeTopic({ id: "b", title: "B", sortOrder: 1 })
      const archived = makeTopic({
        id: "c",
        title: "C",
        sortOrder: 2,
        status: "archived",
      })
      await writeFeedbackTopic({ context, roomId: "room-1", topic: a })
      await writeFeedbackTopic({ context, roomId: "room-1", topic: b })
      await writeFeedbackTopic({ context, roomId: "room-1", topic: archived })
      await setFeedbackTopicOrder({
        context,
        roomId: "room-1",
        topicIds: ["b", "a"],
      })

      const active = await getActiveFeedbackTopics({ context, roomId: "room-1" })
      expect(active.map((t) => t.id)).toEqual(["b", "a"])
    })
  })

  describe("upsertFeedbackResponse", () => {
    it("creates a vote with empty comment", async () => {
      const result = await upsertFeedbackResponse({
        context,
        roomId: "room-1",
        topicId: "topic-1",
        userId: "user-1",
        vote: "up",
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.response.vote).toBe("up")
      expect(result.response.comment).toBe("")
    })

    it("keeps comment when vote changes", async () => {
      await upsertFeedbackResponse({
        context,
        roomId: "room-1",
        topicId: "topic-1",
        userId: "user-1",
        vote: "up",
        comment: "love it",
      })
      const result = await upsertFeedbackResponse({
        context,
        roomId: "room-1",
        topicId: "topic-1",
        userId: "user-1",
        vote: "down",
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.response.vote).toBe("down")
      expect(result.response.comment).toBe("love it")
    })

    it("rejects comment-only without existing vote on named topics", async () => {
      const result = await upsertFeedbackResponse({
        context,
        roomId: "room-1",
        topicId: "topic-1",
        userId: "user-1",
        comment: "hello",
      })
      expect(result).toEqual({ ok: false, reason: "NO_VOTE" })
    })

    it("allows general comment-only without a vote", async () => {
      const result = await upsertFeedbackResponse({
        context,
        roomId: "room-1",
        topicId: GENERAL_FEEDBACK_TOPIC_ID,
        userId: "user-1",
        comment: "found a bug",
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.response.vote).toBeNull()
      expect(result.response.comment).toBe("found a bug")
    })

    it("rejects empty general comment-only create", async () => {
      const result = await upsertFeedbackResponse({
        context,
        roomId: "room-1",
        topicId: GENERAL_FEEDBACK_TOPIC_ID,
        userId: "user-1",
        comment: "",
      })
      expect(result).toEqual({ ok: false, reason: "EMPTY_UPDATE" })
    })

    it("allows clearing comment to empty string", async () => {
      await upsertFeedbackResponse({
        context,
        roomId: "room-1",
        topicId: GENERAL_FEEDBACK_TOPIC_ID,
        userId: "user-1",
        vote: "up",
        comment: "bug",
      })
      const result = await upsertFeedbackResponse({
        context,
        roomId: "room-1",
        topicId: GENERAL_FEEDBACK_TOPIC_ID,
        userId: "user-1",
        comment: "",
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.response.comment).toBe("")
      expect(result.response.vote).toBe("up")
    })

    it("rejects empty update", async () => {
      const result = await upsertFeedbackResponse({
        context,
        roomId: "room-1",
        topicId: "topic-1",
        userId: "user-1",
      })
      expect(result).toEqual({ ok: false, reason: "EMPTY_UPDATE" })
    })
  })

  describe("getMyFeedbackResponses", () => {
    it("returns only the user's responses", async () => {
      await upsertFeedbackResponse({
        context,
        roomId: "room-1",
        topicId: "topic-1",
        userId: "user-1",
        vote: "up",
      })
      await upsertFeedbackResponse({
        context,
        roomId: "room-1",
        topicId: "topic-1",
        userId: "user-2",
        vote: "down",
      })
      await upsertFeedbackResponse({
        context,
        roomId: "room-1",
        topicId: GENERAL_FEEDBACK_TOPIC_ID,
        userId: "user-1",
        vote: "down",
        comment: "n/a",
      })

      const mine = await getMyFeedbackResponses({
        context,
        roomId: "room-1",
        userId: "user-1",
        topicIds: ["topic-1", GENERAL_FEEDBACK_TOPIC_ID],
      })
      expect(Object.keys(mine).sort()).toEqual([GENERAL_FEEDBACK_TOPIC_ID, "topic-1"])
      expect(mine["topic-1"]?.vote).toBe("up")
      expect(mine[GENERAL_FEEDBACK_TOPIC_ID]?.comment).toBe("n/a")

      const other = await getFeedbackResponse({
        context,
        roomId: "room-1",
        topicId: "topic-1",
        userId: "user-2",
      })
      expect(other?.vote).toBe("down")

      const all = await getAllFeedbackResponsesForTopic({
        context,
        roomId: "room-1",
        topicId: "topic-1",
      })
      expect(all).toHaveLength(2)
    })
  })
})
