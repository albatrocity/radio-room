import { describe, expect, test, vi, beforeEach } from "vitest"
import { appContextFactory } from "@repo/factories"
import type { AppContext } from "@repo/types"
import { PollHandlers } from "./pollHandlersAdapter"
import { makeSocketWithBroadcastMocks } from "../lib/testHelpers"

const pollOps = vi.hoisted(() => ({
  createPoll: vi.fn(),
  castVote: vi.fn(),
  closePoll: vi.fn(),
  deletePoll: vi.fn(),
}))

vi.mock("../operations/polls", () => pollOps)

describe("PollHandlers", () => {
  let handlers: PollHandlers
  let mockContext: AppContext
  let mockSocket: ReturnType<typeof makeSocketWithBroadcastMocks>["socket"]
  let mockIo: ReturnType<typeof makeSocketWithBroadcastMocks>["io"]
  let toEmit: ReturnType<typeof makeSocketWithBroadcastMocks>["toEmit"]

  beforeEach(() => {
    vi.resetAllMocks()
    mockContext = appContextFactory.build()
    const socketResult = makeSocketWithBroadcastMocks({
      roomId: "room-1",
      userId: "user-1",
      id: "socket-1",
    })
    mockSocket = socketResult.socket
    mockIo = socketResult.io
    toEmit = socketResult.toEmit
    handlers = new PollHandlers(mockContext)
  })

  describe("createPoll", () => {
    test("emits ERROR_OCCURRED when not in a room", async () => {
      mockSocket.data.roomId = undefined

      await handlers.createPoll(
        { socket: mockSocket, io: mockIo },
        { question: "Q?", options: [{ label: "A" }, { label: "B" }] },
      )

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "ERROR_OCCURRED",
        data: expect.objectContaining({ status: 401 }),
      })
      expect(pollOps.createPoll).not.toHaveBeenCalled()
    })

    test("emits ERROR_OCCURRED on operation failure", async () => {
      pollOps.createPoll.mockResolvedValueOnce({
        ok: false,
        error: { status: 409, error: "Conflict", message: "Active poll exists." },
      })

      await handlers.createPoll(
        { socket: mockSocket, io: mockIo },
        { question: "Q?", options: [{ label: "A" }, { label: "B" }] },
      )

      expect(pollOps.createPoll).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room-1",
        userId: "user-1",
        question: "Q?",
        options: [{ label: "A" }, { label: "B" }],
        settings: undefined,
      })
      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "ERROR_OCCURRED",
        data: { status: 409, error: "Conflict", message: "Active poll exists." },
      })
    })

    test("does not emit on success", async () => {
      pollOps.createPoll.mockResolvedValueOnce({ ok: true, poll: { id: "poll-1" } })

      await handlers.createPoll(
        { socket: mockSocket, io: mockIo },
        { question: "Q?", options: [{ label: "A" }, { label: "B" }] },
      )

      expect(mockSocket.emit).not.toHaveBeenCalled()
    })
  })

  describe("castVote", () => {
    test("emits POLL_VOTE_CONFIRMED on first vote", async () => {
      pollOps.castVote.mockResolvedValueOnce({
        ok: true,
        pollId: "poll-1",
        optionId: "opt-a",
        isFirstVote: true,
        totalVotes: 1,
      })

      await handlers.castVote(
        { socket: mockSocket, io: mockIo },
        { pollId: "poll-1", optionId: "opt-a" },
      )

      expect(mockIo.to).toHaveBeenCalledWith("socket-1")
      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "POLL_VOTE_CONFIRMED",
        data: { pollId: "poll-1", optionId: "opt-a", isSwap: false },
      })
    })

    test("emits POLL_VOTE_CONFIRMED with isSwap on vote change", async () => {
      pollOps.castVote.mockResolvedValueOnce({
        ok: true,
        pollId: "poll-1",
        optionId: "opt-b",
        isFirstVote: false,
        totalVotes: null,
      })

      await handlers.castVote(
        { socket: mockSocket, io: mockIo },
        { pollId: "poll-1", optionId: "opt-b" },
      )

      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "POLL_VOTE_CONFIRMED",
        data: { pollId: "poll-1", optionId: "opt-b", isSwap: true },
      })
    })

    test("emits POLL_VOTE_FAILED on operation failure", async () => {
      pollOps.castVote.mockResolvedValueOnce({
        ok: false,
        reason: "POLL_CLOSED",
      })

      await handlers.castVote(
        { socket: mockSocket, io: mockIo },
        { pollId: "poll-1", optionId: "opt-a" },
      )

      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "POLL_VOTE_FAILED",
        data: { pollId: "poll-1", reason: "POLL_CLOSED" },
      })
    })

    test("emits POLL_VOTE_FAILED when unauthenticated", async () => {
      mockSocket.data.userId = undefined

      await handlers.castVote(
        { socket: mockSocket, io: mockIo },
        { pollId: "poll-1", optionId: "opt-a" },
      )

      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "POLL_VOTE_FAILED",
        data: { pollId: "poll-1", reason: "UNAUTHORIZED" },
      })
      expect(pollOps.castVote).not.toHaveBeenCalled()
    })
  })

  describe("closePoll", () => {
    test("emits ERROR_OCCURRED on operation failure", async () => {
      pollOps.closePoll.mockResolvedValueOnce({
        ok: false,
        error: { status: 403, error: "Forbidden", message: "You are not a room admin." },
      })

      await handlers.closePoll({ socket: mockSocket, io: mockIo }, { pollId: "poll-1" })

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "ERROR_OCCURRED",
        data: { status: 403, error: "Forbidden", message: "You are not a room admin." },
      })
    })
  })

  describe("deletePoll", () => {
    test("emits ERROR_OCCURRED on operation failure", async () => {
      pollOps.deletePoll.mockResolvedValueOnce({
        ok: false,
        error: {
          status: 400,
          error: "Bad Request",
          message: "Close the active poll before deleting it.",
        },
      })

      await handlers.deletePoll({ socket: mockSocket, io: mockIo }, { pollId: "poll-1" })

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "ERROR_OCCURRED",
        data: {
          status: 400,
          error: "Bad Request",
          message: "Close the active poll before deleting it.",
        },
      })
    })
  })
})
