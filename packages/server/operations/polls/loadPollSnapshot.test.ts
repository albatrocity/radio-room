import { describe, it, expect, beforeEach } from "vitest"
import type { AppContext, Poll } from "@repo/types"
import { MemoryRedisClient } from "../../test-utils/MemoryRedisClient"
import {
  addPollToIndex,
  setActivePollId,
  tryCastVote,
  writePoll,
  writeResultsSnapshot,
} from "../data/polls"
import { loadPollInitData, loadPollRoomDataSince } from "./loadPollSnapshot"

function makePoll(overrides: Partial<Poll> = {}): Poll {
  return {
    id: "poll-1",
    roomId: "room-1",
    question: "Best genre?",
    options: [
      { id: "opt-a", label: "Rock" },
      { id: "opt-b", label: "Jazz" },
    ],
    status: "open",
    settings: { hideRunningTotal: false },
    createdAt: 1_000,
    createdBy: "admin-1",
    publishedAt: 1_000,
    closedAt: null,
    closesAt: null,
    ...overrides,
  }
}

function makeContext(client: MemoryRedisClient): AppContext {
  return {
    redis: {
      pubClient: client as unknown as AppContext["redis"]["pubClient"],
      subClient: client as unknown as AppContext["redis"]["subClient"],
    },
  } as AppContext
}

describe("loadPollSnapshot", () => {
  let client: MemoryRedisClient
  let context: AppContext

  beforeEach(() => {
    client = new MemoryRedisClient()
    context = makeContext(client)
  })

  describe("loadPollInitData", () => {
    it("returns active poll, myVote, and poll history", async () => {
      const active = makePoll({ id: "poll-active", publishedAt: 5_000 })
      const closed = makePoll({
        id: "poll-closed",
        status: "closed",
        publishedAt: 1_000,
        closedAt: 2_000,
      })

      await writePoll({ context, poll: active })
      await writePoll({ context, poll: closed })
      await setActivePollId({ context, roomId: "room-1", pollId: active.id })
      await addPollToIndex({ context, roomId: "room-1", pollId: active.id, publishedAt: 5_000 })
      await addPollToIndex({ context, roomId: "room-1", pollId: closed.id, publishedAt: 1_000 })
      await tryCastVote({
        context,
        roomId: "room-1",
        pollId: active.id,
        userId: "user-1",
        optionId: "opt-b",
      })
      await writeResultsSnapshot({
        context,
        roomId: "room-1",
        pollId: closed.id,
        results: {
          pollId: closed.id,
          totalVotes: 0,
          optionTallies: { "opt-a": 0, "opt-b": 0 },
          winners: [],
          closedAt: 2_000,
        },
      })

      const init = await loadPollInitData({ context, roomId: "room-1", userId: "user-1" })

      expect(init.activePoll?.id).toBe("poll-active")
      expect(init.myVote).toEqual({
        pollId: "poll-active",
        optionId: "opt-b",
        votedAt: 0,
      })
      expect(init.pollHistory).toHaveLength(1)
      expect(init.pollHistory[0].poll.id).toBe("poll-closed")
    })

    it("omits myVote when the user has not voted", async () => {
      const active = makePoll({ id: "poll-active" })
      await writePoll({ context, poll: active })
      await setActivePollId({ context, roomId: "room-1", pollId: active.id })

      const init = await loadPollInitData({ context, roomId: "room-1", userId: "user-1" })

      expect(init.myVote).toBeNull()
    })
  })

  describe("loadPollRoomDataSince", () => {
    it("returns active poll and polls closed after since", async () => {
      const active = makePoll({ id: "poll-active", publishedAt: 5_000 })
      const closed = makePoll({
        id: "poll-closed",
        status: "closed",
        publishedAt: 1_000,
        closedAt: 4_000,
      })

      await writePoll({ context, poll: active })
      await writePoll({ context, poll: closed })
      await setActivePollId({ context, roomId: "room-1", pollId: active.id })
      await addPollToIndex({ context, roomId: "room-1", pollId: closed.id, publishedAt: 1_000 })
      await writeResultsSnapshot({
        context,
        roomId: "room-1",
        pollId: closed.id,
        results: {
          pollId: closed.id,
          totalVotes: 0,
          optionTallies: { "opt-a": 0, "opt-b": 0 },
          winners: [],
          closedAt: 4_000,
        },
      })

      const roomData = await loadPollRoomDataSince({
        context,
        roomId: "room-1",
        since: 3_000,
      })

      expect(roomData.activePoll?.id).toBe("poll-active")
      expect(roomData.pollHistorySince.map((entry) => entry.poll.id)).toEqual(["poll-closed"])
    })
  })
})
