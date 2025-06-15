import { describe, test, beforeEach, afterEach, vi, expect } from "vitest"
import { makeSocket } from "../lib/testHelpers"
import { addContextToSocket } from "../lib/socketWithContext"
import { clearMessages, newMessage, startTyping, stopTyping } from "./messageHandlers"
import getMessageVariables from "../lib/getMessageVariables"
import sendMessage from "../lib/sendMessage"

import {
  clearMessages as clearMessagesData,
  getUser,
  getTypingUsers,
  removeTypingUser,
  addTypingUser,
} from "../operations/data"
import { mockTrack } from "./__testutils__/mockTrack"
import { mockQueueItem } from "./__testutils__/mockQueueItem"

// Mock AppContext and Redis
const mockRedisClient = {
  set: vi.fn().mockResolvedValue(null),
  zAdd: vi.fn().mockResolvedValue(null),
  publish: vi.fn().mockResolvedValue(null),
  sMembers: vi.fn().mockResolvedValue([]),
} as any
const mockContext = {
  redis: {
    pubClient: mockRedisClient as any,
    subClient: mockRedisClient as any,
  },
} as any

vi.mock("../lib/getMessageVariables")
vi.mock("../lib/sendMessage")
vi.mock("../operations/data")
vi.mock("../operations/processTriggerAction")

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => {
  vi.clearAllMocks()
})

describe("messageHandlers", () => {
  const {
    socket: baseSocket,
    io,
    broadcastEmit,
    emit,
    toEmit,
    toBroadcast,
  } = makeSocket({
    roomId: "room1",
  })
  const socket = addContextToSocket(baseSocket, mockContext)

  const mockUser = {
    userId: "1",
    username: "Homer",
    isAdmin: false,
    isDj: false,
    isDeputyDj: false,
    status: "participating" as const,
    id: "socketId",
  }

  describe("clearMessages", () => {
    test("clears messages", async () => {
      await clearMessages({ socket, io })
      expect(clearMessagesData).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room1",
      })
    })

    test("emits SET_MESSAGES event", async () => {
      await clearMessages({ socket, io })
      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "SET_MESSAGES",
        data: {
          messages: [],
        },
      })
    })
  })

  describe("newMessage", () => {
    test("sends message", async () => {
      socket.data.userId = "1"
      socket.data.username = "Homer"

      vi.mocked(getMessageVariables).mockResolvedValueOnce({
        currentTrack: mockQueueItem,
        nowPlaying: undefined,
        listenerCount: 1,
        participantCount: 2,
        userCount: 3,
        playlistCount: 4,
        queueCount: 5,
      })

      vi.mocked(getUser).mockResolvedValueOnce(mockUser)

      await newMessage({ socket, io }, "D'oh")

      expect(sendMessage).toHaveBeenCalledWith(io, "room1", {
        content: "D'oh",
        mentions: [],
        timestamp: expect.any(String),
        user: {
          userId: "1",
          username: "Homer",
          isAdmin: false,
          isDj: false,
          isDeputyDj: false,
          status: "participating",
          id: "socketId",
        },
      })
    })

    test("removes message's user from typing list", async () => {
      socket.data.userId = "1"

      vi.mocked(getUser).mockResolvedValueOnce(mockUser)
      vi.mocked(removeTypingUser).mockResolvedValueOnce(null)
      vi.mocked(getTypingUsers).mockResolvedValueOnce([])

      await newMessage({ socket, io }, "")

      expect(removeTypingUser).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room1",
        userId: "1",
      })
    })

    test("emits TYPING event to clear message user", async () => {
      socket.data.userId = "1"

      vi.mocked(getUser).mockResolvedValueOnce(mockUser)
      vi.mocked(removeTypingUser).mockResolvedValueOnce(null)
      vi.mocked(getTypingUsers).mockResolvedValueOnce([])

      await newMessage({ socket, io }, "")

      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "TYPING",
        data: {
          typing: [],
        },
      })
    })
  })

  describe("startTyping", () => {
    beforeEach(() => {
      // Patch socket.broadcast.to to return an object with an emit method and required properties
      socket.broadcast.to = ((room: any) => ({
        emit: broadcastEmit,
        // minimal mock for BroadcastOperator
        adapter: undefined,
        rooms: new Set(),
        exceptRooms: new Set(),
        flags: {},
        except: () => socket.broadcast.to,
        compress: () => socket.broadcast.to,
        volatile: () => socket.broadcast.to,
        local: () => socket.broadcast.to,
        timeout: () => socket.broadcast.to,
      })) as any
    })
    test("adds user to typing list", async () => {
      vi.mocked(getUser).mockResolvedValueOnce(mockUser)
      vi.mocked(getTypingUsers).mockResolvedValueOnce([])
      socket.data.userId = "1"
      socket.data.username = "Homer"

      await startTyping({ socket, io })
      expect(addTypingUser).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room1",
        userId: "1",
      })
    })

    test("broadcasts TYPING event", async () => {
      vi.mocked(getUser).mockResolvedValueOnce(mockUser)
      vi.mocked(getTypingUsers).mockResolvedValueOnce([mockUser])
      socket.data.userId = "1"
      socket.data.username = "Homer"

      await startTyping({ socket, io })

      expect(broadcastEmit).toHaveBeenCalledWith("event", {
        type: "TYPING",
        data: {
          typing: [mockUser],
        },
      })
    })

    test("broadcasts to room channel", async () => {
      vi.mocked(getUser).mockResolvedValueOnce(mockUser)
      vi.mocked(getTypingUsers).mockResolvedValueOnce([])
      socket.data.userId = "1"
      socket.data.username = "Homer"

      await startTyping({ socket, io })

      expect(toBroadcast).toHaveBeenCalledWith("/rooms/room1")
    })
  })

  describe("stopTyping", () => {
    beforeEach(() => {
      // Patch socket.broadcast.to to return an object with an emit method and required properties
      socket.broadcast.to = ((room: any) => ({
        emit: broadcastEmit,
        adapter: undefined,
        rooms: new Set(),
        exceptRooms: new Set(),
        flags: {},
        except: () => socket.broadcast.to,
        compress: () => socket.broadcast.to,
        volatile: () => socket.broadcast.to,
        local: () => socket.broadcast.to,
        timeout: () => socket.broadcast.to,
      })) as any
    })
    test("removes user from typing user", async () => {
      vi.mocked(getUser).mockResolvedValueOnce(mockUser)
      vi.mocked(getTypingUsers).mockResolvedValueOnce([mockUser])
      socket.data.userId = "1"
      socket.data.username = "Homer"

      await stopTyping({ socket, io })
      expect(removeTypingUser).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room1",
        userId: "1",
      })
    })

    test("broadcasts TYPING event", async () => {
      vi.mocked(getUser).mockResolvedValueOnce(mockUser)
      vi.mocked(getTypingUsers).mockResolvedValueOnce([])
      socket.data.userId = "1"
      socket.data.username = "Homer"

      await stopTyping({ socket, io })

      expect(broadcastEmit).toHaveBeenCalledWith("event", {
        type: "TYPING",
        data: {
          typing: [],
        },
      })
    })

    test("broadcasts to room channel", async () => {
      vi.mocked(getUser).mockResolvedValueOnce(mockUser)
      vi.mocked(getTypingUsers).mockResolvedValueOnce([])
      socket.data.userId = "1"
      socket.data.username = "Homer"

      await stopTyping({ socket, io })

      expect(toBroadcast).toHaveBeenCalledWith("/rooms/room1")
    })
  })
})
