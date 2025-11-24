import { describe, test, expect, vi, beforeEach } from "vitest"
import { MessageService } from "../services/MessageService"

vi.mock("../lib/parseMessage")
vi.mock("../operations/data", () => ({
  getUser: vi.fn(),
  clearMessages: vi.fn(),
  addTypingUser: vi.fn(),
  getTypingUsers: vi.fn(),
  removeTypingUser: vi.fn(),
}))

import { parseMessage } from "../lib/parseMessage"

import {
  clearMessages as clearMessagesData,
  getUser,
  addTypingUser,
  getTypingUsers,
  removeTypingUser,
} from "../operations/data"

describe("MessageService", () => {
  let messageService: MessageService
  const mockContext = { redis: { pubClient: {}, subClient: {} } }
  const mockUser = {
    userId: "1",
    username: "Homer",
    isAdmin: false,
    isDj: false,
    isDeputyDj: false,
    status: "participating" as const,
    id: "socketId",
  }

  beforeEach(() => {
    vi.resetAllMocks()
    messageService = new MessageService(mockContext as any)

    // Set up default mock responses
    vi.mocked(getUser).mockResolvedValue(mockUser)
    vi.mocked(getTypingUsers).mockResolvedValue([])
    vi.mocked(clearMessagesData).mockResolvedValue(undefined)
    vi.mocked(addTypingUser).mockResolvedValue(null)
    vi.mocked(removeTypingUser).mockResolvedValue(null)
    vi.mocked(parseMessage).mockReturnValue({
      content: "Hello world",
      mentions: [],
    })
  })

  describe("processNewMessage", () => {
    test("gets user information", async () => {
      await messageService.processNewMessage("room1", "1", "Homer", "Hello world")

      expect(getUser).toHaveBeenCalledWith({
        context: mockContext,
        userId: "1",
      })
    })

    test("parses the message", async () => {
      await messageService.processNewMessage("room1", "1", "Homer", "Hello world")

      expect(parseMessage).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room1",
        message: "Hello world",
      })
    })

    test("removes user from typing", async () => {
      await messageService.processNewMessage("room1", "1", "Homer", "Hello world")

      expect(removeTypingUser).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room1",
        userId: "1",
      })
    })

    test("gets typing users", async () => {
      await messageService.processNewMessage("room1", "1", "Homer", "Hello world")

      expect(getTypingUsers).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room1",
      })
    })

    test("returns the expected result", async () => {
      const result = await messageService.processNewMessage("room1", "1", "Homer", "Hello world")

      expect(result).toEqual({
        message: {
          user: mockUser,
          content: "Hello world",
          mentions: [],
          timestamp: expect.any(String),
        },
        typing: [],
        roomPath: "/rooms/room1",
      })
    })
  })

  describe("clearAllMessages", () => {
    test("clears messages for the room", async () => {
      await messageService.clearAllMessages("room1")

      expect(clearMessagesData).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room1",
      })
    })

    test("returns the room path", async () => {
      const result = await messageService.clearAllMessages("room1")

      expect(result).toEqual({
        roomPath: "/rooms/room1",
      })
    })
  })

  describe("addUserToTyping", () => {
    test("adds user to typing list", async () => {
      await messageService.addUserToTyping("room1", "1")

      expect(addTypingUser).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room1",
        userId: "1",
      })
    })

    test("gets updated typing list", async () => {
      vi.mocked(getTypingUsers).mockResolvedValue([mockUser])

      const result = await messageService.addUserToTyping("room1", "1")

      expect(getTypingUsers).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room1",
      })

      expect(result).toEqual({
        typing: [mockUser],
        roomPath: "/rooms/room1",
      })
    })
  })

  describe("removeUserFromTyping", () => {
    test("removes user from typing list", async () => {
      await messageService.removeUserFromTyping("room1", "1")

      expect(removeTypingUser).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room1",
        userId: "1",
      })
    })

    test("gets updated typing list", async () => {
      const result = await messageService.removeUserFromTyping("room1", "1")

      expect(getTypingUsers).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room1",
      })

      expect(result).toEqual({
        typing: [],
        roomPath: "/rooms/room1",
      })
    })
  })
})
