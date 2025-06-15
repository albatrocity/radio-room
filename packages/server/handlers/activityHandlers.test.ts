// filepath: /Users/rossbrown/Dev/radio-room/packages/server/handlers/activityHandlers.test.ts
import { describe, test, expect, afterEach, vi, beforeEach } from "vitest"
import { makeSocket } from "../lib/testHelpers"
import { startListening, stopListening, addReaction, removeReaction } from "./activityHandlers"
import {
  updateUserAttributes,
  addReaction as addReactionData,
  removeReaction as removeReactionData,
  getAllRoomReactions,
} from "../operations/data"
import { pubUserJoined } from "../operations/sockets/users"
import { AppContext } from "../lib/context"
import { addContextToSocket } from "../lib/socketWithContext"

// Mock Redis client
const mockRedisClient = {
  set: vi.fn().mockResolvedValue(null),
  zAdd: vi.fn().mockResolvedValue(null),
  publish: vi.fn().mockResolvedValue(null),
  sMembers: vi.fn().mockResolvedValue([]),
}

// Mock AppContext
const mockContext: AppContext = {
  redis: {
    pubClient: mockRedisClient as any,
    subClient: mockRedisClient as any,
  },
}

// Mock the imports
vi.mock("../lib/sendMessage")
vi.mock("../operations/data")
vi.mock("../operations/performTriggerAction")
vi.mock("../operations/sockets/users")

beforeEach(() => {
  // Reset all mocks before each test
  vi.resetAllMocks()
})

afterEach(() => {
  vi.clearAllMocks()
})

function setupTest({ updatedStatus = "listening" } = {}) {
  ;(updateUserAttributes as ReturnType<typeof vi.fn>).mockImplementationOnce(
    ({ context, userId, attributes, roomId }) => {
      return Promise.resolve({
        user: {
          status: updatedStatus,
          userId: "1",
          username: "Homer",
        },
        users: [
          {
            status: updatedStatus,
            userId: "1",
            username: "Homer",
          },
        ],
      })
    },
  )
}

function setupReactionTest({} = {}) {
  vi.mocked(addReactionData).mockResolvedValueOnce(null)
  vi.mocked(removeReactionData).mockResolvedValueOnce(undefined)

  vi.mocked(getAllRoomReactions).mockImplementationOnce(({ context, roomId }) => {
    return Promise.resolve({
      message: {},
      track: {},
    })
  })
}

describe("activityHandlers", () => {
  const {
    socket: baseSocket,
    io,
    broadcastEmit,
    emit,
    toEmit,
  } = makeSocket({
    roomId: "activityRoom",
  })

  // Add context to the socket using the helper function
  const socket = addContextToSocket(baseSocket, mockContext)

  describe("startListening", () => {
    test("calls updateUserAttributes with listening status", async () => {
      setupTest()
      socket.data.userId = "1"
      socket.data.username = "Homer"

      await startListening({ socket, io })

      expect(updateUserAttributes).toHaveBeenCalledWith({
        context: mockContext,
        userId: "1",
        attributes: {
          status: "listening",
        },
        roomId: "activityRoom",
      })
    })

    test("calls pubUserJoined with updated user data", async () => {
      setupTest()
      socket.data.userId = "1"
      socket.data.username = "Homer"

      await startListening({ socket, io })

      expect(pubUserJoined).toHaveBeenCalledWith({
        io,
        roomId: "activityRoom",
        data: {
          user: {
            status: "listening",
            userId: "1",
            username: "Homer",
          },
          users: [
            {
              status: "listening",
              userId: "1",
              username: "Homer",
            },
          ],
        },
        context: mockContext,
      })
    })

    test("doesn't call pubUserJoined if no user is returned", async () => {
      ;(updateUserAttributes as ReturnType<typeof vi.fn>).mockImplementationOnce(
        ({ context, userId, attributes, roomId }) => {
          return Promise.resolve({
            user: null,
            users: [],
          })
        },
      )

      socket.data.userId = "1"
      socket.data.username = "Homer"

      await startListening({ socket, io })

      expect(pubUserJoined).not.toHaveBeenCalled()
    })
  })

  describe("stopListening", () => {
    test("calls updateUserAttributes with participating status", async () => {
      setupTest({ updatedStatus: "participating" })
      socket.data.userId = "1"
      socket.data.username = "Homer"

      await stopListening({ socket, io })

      expect(updateUserAttributes).toHaveBeenCalledWith({
        context: mockContext,
        userId: "1",
        attributes: {
          status: "participating",
        },
        roomId: "activityRoom",
      })
    })

    test("calls pubUserJoined with updated user data", async () => {
      setupTest({ updatedStatus: "participating" })
      socket.data.userId = "1"
      socket.data.username = "Homer"

      await stopListening({ socket, io })

      expect(pubUserJoined).toHaveBeenCalledWith({
        io,
        roomId: "activityRoom",
        data: {
          user: {
            status: "participating",
            userId: "1",
            username: "Homer",
          },
          users: [
            {
              status: "participating",
              userId: "1",
              username: "Homer",
            },
          ],
        },
        context: mockContext,
      })
    })

    test("doesn't call pubUserJoined if no user is returned", async () => {
      ;(updateUserAttributes as ReturnType<typeof vi.fn>).mockImplementationOnce(
        ({ context, userId, attributes, roomId }) => {
          return Promise.resolve({
            user: null,
            users: [],
          })
        },
      )

      socket.data.userId = "1"
      socket.data.username = "Homer"

      await stopListening({ socket, io })

      expect(pubUserJoined).not.toHaveBeenCalled()
    })
  })

  describe("addReaction", () => {
    test("calls addReaction data operation for messages", async () => {
      setupReactionTest()

      await addReaction(
        { socket, io },
        {
          emoji: {
            id: "thumbs up",
            name: "thumbs up",
            keywords: [],
            shortcodes: ":+1:",
          },
          reactTo: {
            type: "message",
            id: "2",
          },
          user: {
            userId: "1",
            username: "Homer",
          },
        },
      )

      expect(addReactionData).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "activityRoom",
        reaction: {
          emoji: {
            id: "thumbs up",
            name: "thumbs up",
            keywords: [],
            shortcodes: ":+1:",
          },
          reactTo: {
            type: "message",
            id: "2",
          },
          user: {
            userId: "1",
            username: "Homer",
          },
        },
        reactTo: {
          id: "2",
          type: "message",
        },
      })
    })

    test("calls addReaction data operation for tracks", async () => {
      setupReactionTest()

      await addReaction(
        { socket, io },
        {
          emoji: {
            id: "thumbs up",
            name: "thumbs up",
            keywords: [],
            shortcodes: ":+1:",
          },
          reactTo: {
            type: "track",
            id: "2",
          },
          user: {
            userId: "1",
            username: "Homer",
          },
        },
      )

      expect(addReactionData).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "activityRoom",
        reaction: {
          emoji: {
            id: "thumbs up",
            name: "thumbs up",
            keywords: [],
            shortcodes: ":+1:",
          },
          reactTo: {
            type: "track",
            id: "2",
          },
          user: {
            userId: "1",
            username: "Homer",
          },
        },
        reactTo: {
          id: "2",
          type: "track",
        },
      })
    })

    test("emits a REACTIONS event", async () => {
      setupReactionTest()
      await addReaction(
        { socket, io },
        {
          emoji: {
            id: "thumbs up",
            name: "thumbs up",
            keywords: [],
            shortcodes: ":+1:",
          },
          reactTo: {
            type: "track",
            id: "2",
          },
          user: {
            userId: "1",
            username: "Homer",
          },
        },
      )
      // actual reaction payloads are fetched before emitting, and
      // not stubbed here
      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "REACTIONS",
        data: {
          reactions: {
            message: {},
            track: {},
          },
        },
      })
    })

    test("doesn't call addReactionData for invalid reaction types", async () => {
      setupReactionTest()

      await addReaction(
        { socket, io },
        {
          emoji: {
            id: "thumbs up",
            name: "thumbs up",
            keywords: [],
            shortcodes: ":+1:",
          },
          reactTo: {
            type: "invalid_type" as any,
            id: "2",
          },
          user: {
            userId: "1",
            username: "Homer",
          },
        },
      )

      expect(addReactionData).not.toHaveBeenCalled()
      expect(getAllRoomReactions).not.toHaveBeenCalled()
      expect(toEmit).not.toHaveBeenCalled()
    })
  })

  describe("removeReaction", () => {
    test("calls removeReaction data operation for messages", async () => {
      setupReactionTest()

      await removeReaction(
        { socket, io },
        {
          emoji: {
            id: "thumbs up",
            name: "thumbs up",
            keywords: [],
            shortcodes: ":+1:",
          },
          reactTo: {
            type: "message",
            id: "2",
          },
          user: {
            userId: "1",
            username: "Homer",
          },
        },
      )
      expect(removeReactionData).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "activityRoom",
        reaction: {
          emoji: {
            id: "thumbs up",
            keywords: [],
            name: "thumbs up",
            shortcodes: ":+1:",
          },
          reactTo: { id: "2", type: "message" },
          user: { userId: "1", username: "Homer" },
        },
        reactTo: { id: "2", type: "message" },
      })
    })

    test("calls removeReaction data operation for tracks", async () => {
      setupReactionTest()

      await removeReaction(
        { socket, io },
        {
          emoji: {
            id: "thumbs up",
            name: "thumbs up",
            keywords: [],
            shortcodes: ":+1:",
          },
          reactTo: {
            type: "track",
            id: "2",
          },
          user: {
            userId: "1",
            username: "Homer",
          },
        },
      )
      expect(removeReactionData).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "activityRoom",
        reaction: {
          emoji: {
            id: "thumbs up",
            keywords: [],
            name: "thumbs up",
            shortcodes: ":+1:",
          },
          reactTo: { id: "2", type: "track" },
          user: { userId: "1", username: "Homer" },
        },
        reactTo: { id: "2", type: "track" },
      })
    })

    test("emits a REACTIONS event", async () => {
      setupReactionTest()

      await removeReaction(
        { socket, io },
        {
          emoji: {
            id: "thumbs up",
            name: "thumbs up",
            keywords: [],
            shortcodes: ":+1:",
          },
          reactTo: {
            type: "track",
            id: "2",
          },
          user: {
            userId: "1",
            username: "Homer",
          },
        },
      )
      // actual reaction payloads are fetched before emitting, and
      // not stubbed here
      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "REACTIONS",
        data: {
          reactions: {
            message: {},
            track: {},
          },
        },
      })
    })

    test("doesn't call removeReactionData for invalid reaction types", async () => {
      setupReactionTest()

      await removeReaction(
        { socket, io },
        {
          emoji: {
            id: "thumbs up",
            name: "thumbs up",
            keywords: [],
            shortcodes: ":+1:",
          },
          reactTo: {
            type: "invalid_type" as any,
            id: "2",
          },
          user: {
            userId: "1",
            username: "Homer",
          },
        },
      )

      expect(removeReactionData).not.toHaveBeenCalled()
      expect(getAllRoomReactions).not.toHaveBeenCalled()
      expect(toEmit).not.toHaveBeenCalled()
    })
  })
})
