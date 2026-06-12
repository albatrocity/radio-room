import { describe, it, expect, vi, beforeEach } from "vitest"
import { createActor, type Actor } from "xstate"
import type { Poll } from "@repo/types/Poll"
import { pollMachine } from "./pollMachine"

vi.mock("../actors/socketActor", () => ({
  subscribeById: vi.fn(),
  unsubscribeById: vi.fn(),
  emitToSocket: vi.fn(),
}))

vi.mock("../lib/toasts", () => ({
  toast: vi.fn(),
}))

const basePoll = (overrides: Partial<Poll> = {}): Poll => ({
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
  publishedAt: 2_000,
  closedAt: null,
  closesAt: null,
  ...overrides,
})

function startActiveActor() {
  const actor = createActor(pollMachine)
  actor.start()
  actor.send({ type: "ACTIVATE" })
  return actor
}

describe("pollMachine", () => {
  let actor: Actor<typeof pollMachine>

  beforeEach(() => {
    vi.clearAllMocks()
    actor = startActiveActor()
  })

  it("hydrates from INIT with myVote when present", () => {
    actor.send({
      type: "INIT",
      data: {
        activePoll: basePoll(),
        myVote: { pollId: "poll-1", optionId: "opt-a", votedAt: 0 },
        pollHistory: [],
      },
    })

    const snap = actor.getSnapshot()
    expect(snap.context.activePoll?.id).toBe("poll-1")
    expect(snap.context.myVote).toEqual({
      pollId: "poll-1",
      optionId: "opt-a",
      votedAt: 0,
    })
    expect(snap.context.totalVotes).toBe(0)
  })

  it("hydrates from INIT with server-provided totalVotes", () => {
    actor.send({
      type: "INIT",
      data: {
        activePoll: basePoll(),
        myVote: { pollId: "poll-1", optionId: "opt-a", votedAt: 0 },
        totalVotes: 42,
        pollHistory: [],
      },
    })

    const snap = actor.getSnapshot()
    expect(snap.context.totalVotes).toBe(42)
  })

  it("respects hideRunningTotal even when totalVotes is provided", () => {
    actor.send({
      type: "INIT",
      data: {
        activePoll: basePoll({ settings: { hideRunningTotal: true } }),
        totalVotes: 42,
        pollHistory: [],
      },
    })

    const snap = actor.getSnapshot()
    expect(snap.context.totalVotes).toBeNull()
  })

  it("hydrates from INIT without myVote", () => {
    actor.send({
      type: "INIT",
      data: {
        activePoll: basePoll(),
        pollHistory: [],
      },
    })

    expect(actor.getSnapshot().context.myVote).toBeNull()
  })

  it("POLL_PUBLISHED clears previous myVote and resets totalVotes", () => {
    actor.send({
      type: "INIT",
      data: {
        activePoll: basePoll({ id: "poll-old" }),
        myVote: { pollId: "poll-old", optionId: "opt-a", votedAt: 1 },
        pollHistory: [],
      },
    })

    actor.send({
      type: "POLL_PUBLISHED",
      data: { poll: basePoll({ id: "poll-new", publishedAt: 3_000 }) },
    })

    const snap = actor.getSnapshot()
    expect(snap.context.activePoll?.id).toBe("poll-new")
    expect(snap.context.myVote).toBeNull()
    expect(snap.context.totalVotes).toBe(0)
  })

  it("POLL_VOTE_CONFIRMED only applies to matching pollId", () => {
    actor.send({
      type: "INIT",
      data: { activePoll: basePoll({ id: "poll-1" }), pollHistory: [] },
    })

    actor.send({
      type: "POLL_VOTE_CONFIRMED",
      data: { pollId: "poll-other", optionId: "opt-b", isSwap: false },
    })
    expect(actor.getSnapshot().context.myVote).toBeNull()

    actor.send({
      type: "POLL_VOTE_CONFIRMED",
      data: { pollId: "poll-1", optionId: "opt-b", isSwap: false },
    })
    expect(actor.getSnapshot().context.myVote?.optionId).toBe("opt-b")
  })

  it("POLL_CLOSED moves poll to history and clears active", () => {
    actor.send({
      type: "INIT",
      data: {
        activePoll: basePoll(),
        myVote: { pollId: "poll-1", optionId: "opt-a", votedAt: 1 },
        pollHistory: [],
      },
    })

    actor.send({
      type: "POLL_CLOSED",
      data: {
        poll: basePoll({ status: "closed", closedAt: 9_000 }),
        results: {
          pollId: "poll-1",
          totalVotes: 1,
          optionTallies: { "opt-a": 1, "opt-b": 0 },
          winners: ["opt-a"],
          closedAt: 9_000,
        },
      },
    })

    const snap = actor.getSnapshot()
    expect(snap.context.activePoll?.status).toBe("closed")
    expect(snap.context.revealResults?.totalVotes).toBe(1)
    expect(snap.context.myVote).toBeNull()
    expect(snap.context.history).toHaveLength(1)
    expect(snap.context.history[0].poll.status).toBe("closed")
  })

  it("reaches active state on ACTIVATE", () => {
    expect(actor.getSnapshot().matches("active")).toBe(true)
  })
})
