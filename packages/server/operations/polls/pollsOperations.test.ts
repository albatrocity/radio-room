import { describe, it, expect, vi, beforeEach } from "vitest"
import type { AppContext } from "@repo/types"
import type { Poll } from "@repo/types/Poll"
import { MemoryRedisClient } from "../../test-utils/MemoryRedisClient"
import { createPoll } from "./createPoll"
import { castVote } from "./castVote"
import { closePoll } from "./closePoll"
import { deletePoll } from "./deletePoll"

const m = vi.hoisted(() => ({
  findRoom: vi.fn(),
  isRoomAdmin: vi.fn(),
  persistMessage: vi.fn(),
}))

vi.mock("../data", () => ({
  findRoom: m.findRoom,
  isRoomAdmin: m.isRoomAdmin,
}))

vi.mock("../data/messages", () => ({
  persistMessage: m.persistMessage,
}))

function makeContext(client: MemoryRedisClient, emit = vi.fn()): AppContext {
  return {
    redis: {
      pubClient: client as unknown as AppContext["redis"]["pubClient"],
      subClient: client as unknown as AppContext["redis"]["subClient"],
    },
    systemEvents: { emit },
  } as AppContext
}

function baseRoom() {
  return {
    id: "room-1",
    title: "T",
    creator: "admin-1",
    type: "jukebox" as const,
    fetchMeta: true,
    password: null,
    enableSpotifyLogin: false,
    deputizeOnJoin: false,
    createdAt: "1",
    lastRefreshedAt: "1",
  }
}

describe("poll operations", () => {
  let client: MemoryRedisClient
  let emit: ReturnType<typeof vi.fn>
  let context: AppContext

  beforeEach(() => {
    client = new MemoryRedisClient()
    emit = vi.fn()
    context = makeContext(client, emit)
    vi.clearAllMocks()
    m.findRoom.mockResolvedValue(baseRoom())
    m.isRoomAdmin.mockResolvedValue(true)
    m.persistMessage.mockResolvedValue(undefined)
  })

  describe("createPoll", () => {
    it("rejects non-admins", async () => {
      m.isRoomAdmin.mockResolvedValue(false)
      const result = await createPoll({
        context,
        roomId: "room-1",
        userId: "user-1",
        question: "Q?",
        options: [{ label: "A" }, { label: "B" }],
      })
      expect(result).toEqual({
        ok: false,
        error: { status: 403, error: "Forbidden", message: "You are not a room admin." },
      })
    })

    it("rejects when another poll is active", async () => {
      await client.set("room:room-1:polls:active_id", "existing")

      const result = await createPoll({
        context,
        roomId: "room-1",
        userId: "admin-1",
        question: "Q?",
        options: [{ label: "A" }, { label: "B" }],
      })

      expect(result.ok).toBe(false)
      if (!result.ok && "error" in result) {
        expect(result.error.status).toBe(409)
      }
    })

    it("publishes poll, emits POLL_PUBLISHED, and posts chat alert", async () => {
      const result = await createPoll({
        context,
        roomId: "room-1",
        userId: "admin-1",
        question: "Best song?",
        options: [{ label: "A" }, { label: "B" }],
        settings: { hideRunningTotal: true },
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.poll.status).toBe("open")
        expect(result.poll.settings.hideRunningTotal).toBe(true)
      }

      expect(emit).toHaveBeenCalledWith("room-1", "POLL_PUBLISHED", expect.any(Object))
      expect(emit).toHaveBeenCalledWith(
        "room-1",
        "MESSAGE_RECEIVED",
        expect.objectContaining({
          message: expect.objectContaining({
            content: "New poll started: Best song?",
            meta: { status: "info", type: "alert" },
          }),
        }),
      )
      expect(await client.get("room:room-1:polls:active_id")).toBeTruthy()
    })
  })

  describe("castVote", () => {
    let poll: Poll

    beforeEach(async () => {
      const created = await createPoll({
        context,
        roomId: "room-1",
        userId: "admin-1",
        question: "Pick one",
        options: [{ label: "A" }, { label: "B" }],
      })
      if (!created.ok) throw new Error("setup failed")
      poll = created.poll
      emit.mockClear()
    })

    it("emits POLL_VOTE_CAST on first vote only", async () => {
      const first = await castVote({
        context,
        roomId: "room-1",
        pollId: poll.id,
        userId: "u1",
        optionId: poll.options[0]!.id,
      })
      expect(first).toMatchObject({ ok: true, isFirstVote: true, totalVotes: 1 })
      expect(emit).toHaveBeenCalledWith("room-1", "POLL_VOTE_CAST", {
        roomId: "room-1",
        pollId: poll.id,
        totalVotes: 1,
      })

      emit.mockClear()
      const swap = await castVote({
        context,
        roomId: "room-1",
        pollId: poll.id,
        userId: "u1",
        optionId: poll.options[1]!.id,
      })
      expect(swap).toMatchObject({ ok: true, isFirstVote: false, totalVotes: 1 })
      expect(emit).not.toHaveBeenCalled()
    })
  })

  describe("closePoll", () => {
    it("persists results before emitting POLL_CLOSED and posts chat in order", async () => {
      const created = await createPoll({
        context,
        roomId: "room-1",
        userId: "admin-1",
        question: "Winner?",
        options: [{ label: "A" }, { label: "B" }],
      })
      if (!created.ok) throw new Error("setup failed")
      const poll = created.poll

      await castVote({
        context,
        roomId: "room-1",
        pollId: poll.id,
        userId: "u1",
        optionId: poll.options[0]!.id,
      })

      emit.mockClear()

      const result = await closePoll({
        context,
        roomId: "room-1",
        userId: "admin-1",
        pollId: poll.id,
      })

      expect(result.ok).toBe(true)
      expect(await client.get("room:room-1:polls:active_id")).toBeNull()
      expect(await client.get(`room:room-1:poll:${poll.id}:results`)).toBeTruthy()

      const pollClosedIndex = emit.mock.calls.findIndex((call) => call[1] === "POLL_CLOSED")
      expect(pollClosedIndex).toBeGreaterThanOrEqual(0)

      const messageCalls = emit.mock.calls.filter((call) => call[1] === "MESSAGE_RECEIVED")
      expect(messageCalls.length).toBe(2)
      expect(messageCalls[0]?.[2]?.message?.meta).toEqual({ status: "success", type: "alert" })
      expect(messageCalls[1]?.[2]?.message?.content).toContain("Poll: Winner?")
    })
  })

  describe("deletePoll", () => {
    it("rejects deleting the active poll", async () => {
      const created = await createPoll({
        context,
        roomId: "room-1",
        userId: "admin-1",
        question: "Q",
        options: [{ label: "A" }, { label: "B" }],
      })
      if (!created.ok) throw new Error("setup failed")

      const result = await deletePoll({
        context,
        roomId: "room-1",
        userId: "admin-1",
        pollId: created.poll.id,
      })

      expect(result.ok).toBe(false)
      if (!result.ok && "error" in result) {
        expect(result.error.status).toBe(400)
      }
    })

    it("deletes a closed poll and emits POLL_DELETED", async () => {
      const created = await createPoll({
        context,
        roomId: "room-1",
        userId: "admin-1",
        question: "Q",
        options: [{ label: "A" }, { label: "B" }],
      })
      if (!created.ok) throw new Error("setup failed")

      await closePoll({
        context,
        roomId: "room-1",
        userId: "admin-1",
        pollId: created.poll.id,
      })

      emit.mockClear()

      const result = await deletePoll({
        context,
        roomId: "room-1",
        userId: "admin-1",
        pollId: created.poll.id,
      })

      expect(result).toEqual({ ok: true, pollId: created.poll.id })
      expect(emit).toHaveBeenCalledWith("room-1", "POLL_DELETED", {
        roomId: "room-1",
        pollId: created.poll.id,
      })
    })
  })
})
