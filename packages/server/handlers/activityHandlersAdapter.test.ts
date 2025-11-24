import { describe, expect, test, vi, beforeEach } from "vitest"
import { ActivityHandlers } from "./activityHandlersAdapter"
import { makeSocketWithBroadcastMocks } from "../lib/testHelpers"
import { reactionPayloadFactory, reactionStoreFactory, userFactory } from "@repo/factories"

// Mock dependencies
vi.mock("../services/ActivityService")
vi.mock("../operations/sockets/users", () => ({
  pubUserJoined: vi.fn(),
}))

// Import mocked dependencies
import { pubUserJoined } from "../operations/sockets/users"

describe("ActivityHandlers", () => {
  let mockSocket: any
  let mockIo: any
  let activityService: any
  let activityHandlers: ActivityHandlers
  let toEmit: any
  let toBroadcast: any

  // Mock return values
  const mockUser = userFactory.build({
    userId: "user123",
    username: "Homer",
    status: "participating" as const,
  })
  const mockUsers = [mockUser]
  const mockReactions = reactionStoreFactory.build({
    message: { "123": [{ emoji: "👍", user: mockUser.username! }] },
    track: {},
  })

  beforeEach(() => {
    vi.resetAllMocks()

    // Setup socket mocks
    const socketResult = makeSocketWithBroadcastMocks({
      roomId: "room123",
      userId: "user123",
      username: "Homer",
    })

    mockSocket = socketResult.socket
    mockIo = socketResult.io
    toEmit = socketResult.toEmit
    toBroadcast = socketResult.toBroadcast

    // Mock the ActivityService
    activityService = {
      startListening: vi.fn().mockResolvedValue({
        user: mockUser,
        users: mockUsers,
      }),
      stopListening: vi.fn().mockResolvedValue({
        user: mockUser,
        users: mockUsers,
      }),
      addReaction: vi.fn().mockResolvedValue({
        reactions: mockReactions,
      }),
      removeReaction: vi.fn().mockResolvedValue({
        reactions: mockReactions,
      }),
    }

    activityHandlers = new ActivityHandlers(activityService)
  })

  test("should be defined", () => {
    expect(activityHandlers).toBeDefined()
  })

  describe("startListening", () => {
    test("calls startListening with correct parameters", async () => {
      await activityHandlers.startListening({ socket: mockSocket, io: mockIo })

      expect(activityService.startListening).toHaveBeenCalledWith("room123", "user123")
    })

    test("calls pubUserJoined with user data", async () => {
      await activityHandlers.startListening({ socket: mockSocket, io: mockIo })

      expect(pubUserJoined).toHaveBeenCalledWith({
        io: mockIo,
        roomId: "room123",
        data: { user: mockUser, users: mockUsers },
        context: undefined,
      })
    })

    test("does not call pubUserJoined when no user is returned", async () => {
      activityService.startListening.mockResolvedValueOnce({
        user: null,
        users: [],
      })

      await activityHandlers.startListening({ socket: mockSocket, io: mockIo })

      expect(pubUserJoined).not.toHaveBeenCalled()
    })
  })

  describe("stopListening", () => {
    test("calls stopListening with correct parameters", async () => {
      await activityHandlers.stopListening({ socket: mockSocket, io: mockIo })

      expect(activityService.stopListening).toHaveBeenCalledWith("room123", "user123")
    })

    test("calls pubUserJoined with user data", async () => {
      await activityHandlers.stopListening({ socket: mockSocket, io: mockIo })

      expect(pubUserJoined).toHaveBeenCalledWith({
        io: mockIo,
        roomId: "room123",
        data: { user: mockUser, users: mockUsers },
        context: undefined,
      })
    })

    test("does not call pubUserJoined when no user is returned", async () => {
      activityService.stopListening.mockResolvedValueOnce({
        user: null,
        users: [],
      })

      await activityHandlers.stopListening({ socket: mockSocket, io: mockIo })

      expect(pubUserJoined).not.toHaveBeenCalled()
    })
  })

  describe("addReaction", () => {
    test("calls addReaction with correct parameters", async () => {
      const reaction = reactionPayloadFactory.build()

      await activityHandlers.addReaction({ socket: mockSocket, io: mockIo }, reaction)

      expect(activityService.addReaction).toHaveBeenCalledWith("room123", reaction)
    })

    test("emits REACTIONS event with updated reactions", async () => {
      const reaction = reactionPayloadFactory.build()

      await activityHandlers.addReaction({ socket: mockSocket, io: mockIo }, reaction)

      expect(mockIo.to).toHaveBeenCalled()
      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "REACTIONS",
        data: { reactions: mockReactions },
      })
    })

    test("does not emit event when result is null", async () => {
      activityService.addReaction.mockResolvedValueOnce(null)

      const reaction = reactionPayloadFactory.build()

      await activityHandlers.addReaction({ socket: mockSocket, io: mockIo }, reaction)

      expect(mockIo.to).not.toHaveBeenCalled()
      expect(toEmit).not.toHaveBeenCalled()
    })
  })

  describe("removeReaction", () => {
    test("calls removeReaction with correct parameters", async () => {
      const reaction = reactionPayloadFactory.build()

      await activityHandlers.removeReaction({ socket: mockSocket, io: mockIo }, reaction)

      expect(activityService.removeReaction).toHaveBeenCalledWith(
        "room123",
        reaction.emoji,
        reaction.reactTo,
        reaction.user,
      )
    })

    test("emits REACTIONS event with updated reactions", async () => {
      const reaction = reactionPayloadFactory.build()

      await activityHandlers.removeReaction({ socket: mockSocket, io: mockIo }, reaction)

      expect(mockIo.to).toHaveBeenCalled()
      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "REACTIONS",
        data: { reactions: mockReactions },
      })
    })

    test("does not emit event when result is null", async () => {
      activityService.removeReaction.mockResolvedValueOnce(null)

      const reaction = reactionPayloadFactory.build()

      await activityHandlers.removeReaction({ socket: mockSocket, io: mockIo }, reaction)

      expect(mockIo.to).not.toHaveBeenCalled()
      expect(toEmit).not.toHaveBeenCalled()
    })
  })
})
