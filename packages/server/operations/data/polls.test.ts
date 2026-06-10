import { describe, it, expect, beforeEach } from "vitest"
import type { AppContext } from "@repo/types"
import type { Poll } from "@repo/types/Poll"
import { MemoryRedisClient } from "../../test-utils/MemoryRedisClient"
import {
  addPollToIndex,
  clearActivePollId,
  deletePollKeys,
  getActivePoll,
  getActivePollId,
  getLiveTotalVotes,
  getMyVote,
  getPoll,
  getPollHistoryEntries,
  getPollHistorySince,
  getResultsSnapshot,
  listPollIds,
  reduceVotesToResults,
  removePollFromIndex,
  setActivePollId,
  tryCastVote,
  writePoll,
  writeResultsSnapshot,
} from "./polls"

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
    redis: { pubClient: client as unknown as AppContext["redis"]["pubClient"], subClient: client as unknown as AppContext["redis"]["subClient"] },
  } as AppContext
}

// =============================================================================
// reduceVotesToResults (pure)
// =============================================================================

describe("reduceVotesToResults", () => {
  const options = [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
    { id: "c", label: "C" },
  ]

  it("returns empty winners and zero tallies when no votes cast", () => {
    const results = reduceVotesToResults({
      pollId: "p1",
      options,
      votes: {},
      closedAt: 9_000,
    })

    expect(results.totalVotes).toBe(0)
    expect(results.winners).toEqual([])
    expect(results.optionTallies).toEqual({ a: 0, b: 0, c: 0 })
    expect(results.closedAt).toBe(9_000)
  })

  it("computes a single winner", () => {
    const results = reduceVotesToResults({
      pollId: "p1",
      options,
      votes: { u1: "a", u2: "a", u3: "b" },
      closedAt: 9_000,
    })

    expect(results.totalVotes).toBe(3)
    expect(results.optionTallies).toEqual({ a: 2, b: 1, c: 0 })
    expect(results.winners).toEqual(["a"])
  })

  it("includes all tied options in winners", () => {
    const results = reduceVotesToResults({
      pollId: "p1",
      options,
      votes: { u1: "a", u2: "b", u3: "c" },
      closedAt: 9_000,
    })

    expect(results.winners).toEqual(["a", "b", "c"])
  })

  it("pads zero-vote options into optionTallies", () => {
    const results = reduceVotesToResults({
      pollId: "p1",
      options,
      votes: { u1: "a" },
      closedAt: 9_000,
    })

    expect(results.optionTallies).toEqual({ a: 1, b: 0, c: 0 })
  })
})

// =============================================================================
// Redis-backed operations
// =============================================================================

describe("polls data layer", () => {
  let client: MemoryRedisClient
  let context: AppContext

  beforeEach(() => {
    client = new MemoryRedisClient()
    context = makeContext(client)
  })

  it("writes and reads a poll", async () => {
    const poll = makePoll()
    await writePoll({ context, poll })
    const loaded = await getPoll({ context, roomId: "room-1", pollId: "poll-1" })
    expect(loaded).toEqual(poll)
  })

  it("manages active poll id pointer", async () => {
    await setActivePollId({ context, roomId: "room-1", pollId: "poll-1" })
    expect(await getActivePollId({ context, roomId: "room-1" })).toBe("poll-1")
    await clearActivePollId({ context, roomId: "room-1" })
    expect(await getActivePollId({ context, roomId: "room-1" })).toBeNull()
  })

  it("indexes polls by publishedAt (newest first)", async () => {
    await addPollToIndex({ context, roomId: "room-1", pollId: "old", publishedAt: 100 })
    await addPollToIndex({ context, roomId: "room-1", pollId: "new", publishedAt: 200 })
    expect(await listPollIds({ context, roomId: "room-1" })).toEqual(["new", "old"])
    await removePollFromIndex({ context, roomId: "room-1", pollId: "old" })
    expect(await listPollIds({ context, roomId: "room-1" })).toEqual(["new"])
  })

  describe("tryCastVote", () => {
    beforeEach(async () => {
      await writePoll({ context, poll: makePoll() })
    })

    it("inserts first vote and returns HLEN as totalVotes", async () => {
      const result = await tryCastVote({
        context,
        roomId: "room-1",
        pollId: "poll-1",
        userId: "u1",
        optionId: "opt-a",
      })

      expect(result).toEqual({ ok: true, isFirstVote: true, totalVotes: 1 })
      expect(await getMyVote({ context, roomId: "room-1", pollId: "poll-1", userId: "u1" })).toBe(
        "opt-a",
      )
      expect(await getLiveTotalVotes({ context, roomId: "room-1", pollId: "poll-1" })).toBe(1)
    })

    it("swaps vote without changing total", async () => {
      await tryCastVote({
        context,
        roomId: "room-1",
        pollId: "poll-1",
        userId: "u1",
        optionId: "opt-a",
      })

      const result = await tryCastVote({
        context,
        roomId: "room-1",
        pollId: "poll-1",
        userId: "u1",
        optionId: "opt-b",
      })

      expect(result).toEqual({ ok: true, isFirstVote: false, totalVotes: 1 })
      expect(await getMyVote({ context, roomId: "room-1", pollId: "poll-1", userId: "u1" })).toBe(
        "opt-b",
      )
    })

    it("rejects vote on closed poll", async () => {
      await writePoll({
        context,
        poll: makePoll({ status: "closed", closedAt: 2_000 }),
      })

      const result = await tryCastVote({
        context,
        roomId: "room-1",
        pollId: "poll-1",
        userId: "u1",
        optionId: "opt-a",
      })

      expect(result).toEqual({ ok: false, reason: "POLL_CLOSED" })
    })

    it("rejects vote on missing poll", async () => {
      const result = await tryCastVote({
        context,
        roomId: "room-1",
        pollId: "missing",
        userId: "u1",
        optionId: "opt-a",
      })

      expect(result).toEqual({ ok: false, reason: "POLL_NOT_FOUND" })
    })

    it("rejects invalid option id", async () => {
      const result = await tryCastVote({
        context,
        roomId: "room-1",
        pollId: "poll-1",
        userId: "u1",
        optionId: "opt-z",
      })

      expect(result).toEqual({ ok: false, reason: "INVALID_OPTION" })
    })

    it("returns null totalVotes when hideRunningTotal is true", async () => {
      await writePoll({
        context,
        poll: makePoll({ settings: { hideRunningTotal: true } }),
      })

      const result = await tryCastVote({
        context,
        roomId: "room-1",
        pollId: "poll-1",
        userId: "u1",
        optionId: "opt-a",
      })

      expect(result).toEqual({ ok: true, isFirstVote: true, totalVotes: null })
    })
  })

  describe("results snapshot", () => {
    it("writes and reads results for closed polls only", async () => {
      await writePoll({ context, poll: makePoll({ status: "closed", closedAt: 5_000 }) })

      const results = reduceVotesToResults({
        pollId: "poll-1",
        options: makePoll().options,
        votes: { u1: "opt-a" },
        closedAt: 5_000,
      })
      await writeResultsSnapshot({ context, roomId: "room-1", pollId: "poll-1", results })

      expect(
        await getResultsSnapshot({ context, roomId: "room-1", pollId: "poll-1" }),
      ).toEqual(results)
    })

    it("returns null for open polls even if results key exists", async () => {
      await writePoll({ context, poll: makePoll({ status: "open" }) })
      await writeResultsSnapshot({
        context,
        roomId: "room-1",
        pollId: "poll-1",
        results: {
          pollId: "poll-1",
          totalVotes: 0,
          optionTallies: { "opt-a": 0, "opt-b": 0 },
          winners: [],
          closedAt: 5_000,
        },
      })

      expect(await getResultsSnapshot({ context, roomId: "room-1", pollId: "poll-1" })).toBeNull()
    })
  })

  it("deletePollKeys removes poll, votes, and results", async () => {
    const poll = makePoll()
    await writePoll({ context, poll })
    await tryCastVote({
      context,
      roomId: "room-1",
      pollId: "poll-1",
      userId: "u1",
      optionId: "opt-a",
    })
    await writeResultsSnapshot({
      context,
      roomId: "room-1",
      pollId: "poll-1",
      results: {
        pollId: "poll-1",
        totalVotes: 1,
        optionTallies: { "opt-a": 1, "opt-b": 0 },
        winners: ["opt-a"],
        closedAt: 9_000,
      },
    })

    await deletePollKeys({ context, roomId: "room-1", pollId: "poll-1" })

    expect(await getPoll({ context, roomId: "room-1", pollId: "poll-1" })).toBeNull()
    expect(await getMyVote({ context, roomId: "room-1", pollId: "poll-1", userId: "u1" })).toBeNull()
    expect(await getResultsSnapshot({ context, roomId: "room-1", pollId: "poll-1" })).toBeNull()
  })

  describe("snapshot read helpers", () => {
    it("getActivePoll returns the open poll pointed to by active_id", async () => {
      const poll = makePoll({ id: "poll-active" })
      await writePoll({ context, poll })
      await setActivePollId({ context, roomId: "room-1", pollId: poll.id })

      expect(await getActivePoll({ context, roomId: "room-1" })).toEqual(poll)
    })

    it("getActivePoll returns null when active poll is closed", async () => {
      const poll = makePoll({ id: "poll-active", status: "closed", closedAt: 9_000 })
      await writePoll({ context, poll })
      await setActivePollId({ context, roomId: "room-1", pollId: poll.id })

      expect(await getActivePoll({ context, roomId: "room-1" })).toBeNull()
    })

    it("getPollHistoryEntries returns closed polls with results, newest first", async () => {
      const closedOld = makePoll({
        id: "poll-old",
        status: "closed",
        publishedAt: 1_000,
        closedAt: 2_000,
      })
      const closedNew = makePoll({
        id: "poll-new",
        status: "closed",
        publishedAt: 3_000,
        closedAt: 4_000,
      })
      const openPoll = makePoll({ id: "poll-open", status: "open", publishedAt: 5_000 })

      await writePoll({ context, poll: closedOld })
      await writePoll({ context, poll: closedNew })
      await writePoll({ context, poll: openPoll })
      await addPollToIndex({ context, roomId: "room-1", pollId: closedOld.id, publishedAt: 1_000 })
      await addPollToIndex({ context, roomId: "room-1", pollId: closedNew.id, publishedAt: 3_000 })
      await addPollToIndex({ context, roomId: "room-1", pollId: openPoll.id, publishedAt: 5_000 })

      await writeResultsSnapshot({
        context,
        roomId: "room-1",
        pollId: closedOld.id,
        results: {
          pollId: closedOld.id,
          totalVotes: 0,
          optionTallies: { "opt-a": 0, "opt-b": 0 },
          winners: [],
          closedAt: 2_000,
        },
      })
      await writeResultsSnapshot({
        context,
        roomId: "room-1",
        pollId: closedNew.id,
        results: {
          pollId: closedNew.id,
          totalVotes: 1,
          optionTallies: { "opt-a": 1, "opt-b": 0 },
          winners: ["opt-a"],
          closedAt: 4_000,
        },
      })

      const history = await getPollHistoryEntries({ context, roomId: "room-1", limit: 20 })

      expect(history.map((entry) => entry.poll.id)).toEqual(["poll-new", "poll-old"])
      expect(history[0].results.totalVotes).toBe(1)
    })

    it("getPollHistorySince returns only polls closed after the timestamp", async () => {
      const closedOld = makePoll({
        id: "poll-old",
        status: "closed",
        publishedAt: 1_000,
        closedAt: 2_000,
      })
      const closedNew = makePoll({
        id: "poll-new",
        status: "closed",
        publishedAt: 3_000,
        closedAt: 4_000,
      })

      await writePoll({ context, poll: closedOld })
      await writePoll({ context, poll: closedNew })
      await addPollToIndex({ context, roomId: "room-1", pollId: closedOld.id, publishedAt: 1_000 })
      await addPollToIndex({ context, roomId: "room-1", pollId: closedNew.id, publishedAt: 3_000 })
      await writeResultsSnapshot({
        context,
        roomId: "room-1",
        pollId: closedOld.id,
        results: {
          pollId: closedOld.id,
          totalVotes: 0,
          optionTallies: { "opt-a": 0, "opt-b": 0 },
          winners: [],
          closedAt: 2_000,
        },
      })
      await writeResultsSnapshot({
        context,
        roomId: "room-1",
        pollId: closedNew.id,
        results: {
          pollId: closedNew.id,
          totalVotes: 1,
          optionTallies: { "opt-a": 1, "opt-b": 0 },
          winners: ["opt-a"],
          closedAt: 4_000,
        },
      })

      const since = await getPollHistorySince({ context, roomId: "room-1", since: 3_000 })

      expect(since.map((entry) => entry.poll.id)).toEqual(["poll-new"])
    })
  })
})
