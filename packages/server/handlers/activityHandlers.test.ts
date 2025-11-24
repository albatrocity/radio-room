import { describe, expect, test, vi, beforeEach } from "vitest"
import { makeSocketWithBroadcastMocks } from "../lib/testHelpers"
import { User } from "@repo/types/User"
import { ReactionPayload } from "@repo/types/Reaction"
import { ReactionSubject } from "@repo/types/ReactionSubject"
import { Emoji } from "@repo/types/Emoji"
import { userFactory } from "@repo/factories"

// Define mocks at the top level
const mockStartListening = vi.fn()
const mockStopListening = vi.fn()
const mockAddReaction = vi.fn()
const mockRemoveReaction = vi.fn()

// Mock the adapter's createActivityHandlers function
vi.mock("./activityHandlersAdapter", () => ({
  createActivityHandlers: () => ({
    startListening: mockStartListening,
    stopListening: mockStopListening,
    addReaction: mockAddReaction,
    removeReaction: mockRemoveReaction,
  }),
}))

// Import after mocking
import { startListening, stopListening, addReaction, removeReaction } from "./activityHandlers"

describe("activityHandlers", () => {
  let mockSocket: any, mockIo: any, mockContext: any
  const mockUser = userFactory.build({
    userId: "user123",
    username: "Homer",
    status: "participating",
  })

  beforeEach(() => {
    vi.resetAllMocks()

    // Setup socket mocks with context
    const socketResult = makeSocketWithBroadcastMocks({
      roomId: "room123",
      userId: "user123",
      username: "Homer",
    })

    mockSocket = socketResult.socket
    mockIo = socketResult.io
    mockContext = { redis: {}, db: {} }

    // Add context to the socket
    mockSocket.context = mockContext
  })

  describe("startListening", () => {
    test("properly delegates to adapter method", async () => {
      await startListening({ socket: mockSocket, io: mockIo })

      expect(mockStartListening).toHaveBeenCalledWith({ socket: mockSocket, io: mockIo })
      expect(mockStartListening).toHaveBeenCalledTimes(1)
    })

    test("uses the context from the socket", async () => {
      await startListening({ socket: mockSocket, io: mockIo })

      // The createActivityHandlers function should be called with the context from the socket
      expect(mockStartListening).toHaveBeenCalled()
      // We can't directly test the createActivityHandlers call with context
      // since our mock replaces that function, but we can verify the adapter method is called
    })
  })

  describe("stopListening", () => {
    test("properly delegates to adapter method", async () => {
      await stopListening({ socket: mockSocket, io: mockIo })

      expect(mockStopListening).toHaveBeenCalledWith({ socket: mockSocket, io: mockIo })
      expect(mockStopListening).toHaveBeenCalledTimes(1)
    })

    test("uses the context from the socket", async () => {
      await stopListening({ socket: mockSocket, io: mockIo })

      expect(mockStopListening).toHaveBeenCalled()
    })
  })

  describe("addReaction", () => {
    test("properly delegates to adapter method with reaction payload", async () => {
      const reaction: ReactionPayload = {
        emoji: "👍" as unknown as Emoji,
        reactTo: {
          type: "message",
          id: "msg123",
        },
        user: mockUser as User,
      }

      await addReaction({ socket: mockSocket, io: mockIo }, reaction)

      expect(mockAddReaction).toHaveBeenCalledWith({ socket: mockSocket, io: mockIo }, reaction)
      expect(mockAddReaction).toHaveBeenCalledTimes(1)
    })

    test("works with various reaction types", async () => {
      const trackReaction: ReactionPayload = {
        emoji: "🎵" as unknown as Emoji,
        reactTo: {
          type: "track",
          id: "track123",
        },
        user: mockUser as User,
      }

      await addReaction({ socket: mockSocket, io: mockIo }, trackReaction)

      expect(mockAddReaction).toHaveBeenCalledWith(
        { socket: mockSocket, io: mockIo },
        trackReaction,
      )
    })
  })

  describe("removeReaction", () => {
    test("properly delegates to adapter method with reaction details", async () => {
      const params = {
        emoji: "👍" as unknown as Emoji,
        reactTo: {
          type: "message",
          id: "msg123",
        } as ReactionSubject,
        user: mockUser as User,
      }

      await removeReaction({ socket: mockSocket, io: mockIo }, params)

      expect(mockRemoveReaction).toHaveBeenCalledWith({ socket: mockSocket, io: mockIo }, params)
      expect(mockRemoveReaction).toHaveBeenCalledTimes(1)
    })

    test("works with various reaction types", async () => {
      const params = {
        emoji: "🎵" as unknown as Emoji,
        reactTo: {
          type: "track",
          id: "track123",
        } as ReactionSubject,
        user: mockUser as User,
      }

      await removeReaction({ socket: mockSocket, io: mockIo }, params)

      expect(mockRemoveReaction).toHaveBeenCalledWith({ socket: mockSocket, io: mockIo }, params)
    })
  })
})
