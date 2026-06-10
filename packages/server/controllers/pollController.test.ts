import { describe, expect, test, vi, beforeEach } from "vitest"
import { SocketWithContext } from "../lib/socketWithContext"
import { Server } from "socket.io"
import { appContextFactory } from "@repo/factories"
import { createPollController } from "./pollController"

const pollHandlers = vi.hoisted(() => ({
  createPoll: vi.fn(),
  castVote: vi.fn(),
  closePoll: vi.fn(),
  deletePoll: vi.fn(),
}))

vi.mock("../handlers/pollHandlersAdapter", () => ({
  createPollHandlers: vi.fn(() => pollHandlers),
}))

describe("PollController", () => {
  let mockSocket: SocketWithContext
  let mockIo: Server
  let socketEventHandlers: Map<string, Function>

  beforeEach(() => {
    vi.resetAllMocks()
    socketEventHandlers = new Map()

    mockSocket = {
      on: vi.fn((event: string, handler: Function) => {
        socketEventHandlers.set(event, handler)
      }),
      emit: vi.fn(),
      id: "socket-1",
      data: {
        userId: "user-1",
        roomId: "room-1",
      },
      context: appContextFactory.build(),
    } as unknown as SocketWithContext

    mockIo = {
      to: vi.fn().mockReturnThis(),
      emit: vi.fn(),
    } as unknown as Server
  })

  test("registers all poll socket events", () => {
    createPollController(mockSocket, mockIo)

    expect(mockSocket.on).toHaveBeenCalledWith("CREATE_POLL", expect.any(Function))
    expect(mockSocket.on).toHaveBeenCalledWith("CAST_POLL_VOTE", expect.any(Function))
    expect(mockSocket.on).toHaveBeenCalledWith("CLOSE_POLL", expect.any(Function))
    expect(mockSocket.on).toHaveBeenCalledWith("DELETE_POLL", expect.any(Function))
    expect(mockSocket.on).toHaveBeenCalledTimes(4)
  })

  test("CREATE_POLL handler delegates to adapter", async () => {
    createPollController(mockSocket, mockIo)

    const payload = {
      question: "Best genre?",
      options: [{ label: "Rock" }, { label: "Jazz" }],
      settings: { hideRunningTotal: true },
    }
    await socketEventHandlers.get("CREATE_POLL")!(payload)

    expect(pollHandlers.createPoll).toHaveBeenCalledWith(
      { socket: mockSocket, io: mockIo },
      payload,
    )
  })

  test("CAST_POLL_VOTE handler delegates to adapter", async () => {
    createPollController(mockSocket, mockIo)

    const payload = { pollId: "poll-1", optionId: "opt-a" }
    await socketEventHandlers.get("CAST_POLL_VOTE")!(payload)

    expect(pollHandlers.castVote).toHaveBeenCalledWith(
      { socket: mockSocket, io: mockIo },
      payload,
    )
  })
})
