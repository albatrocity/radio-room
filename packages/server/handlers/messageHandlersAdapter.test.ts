import { describe, test, expect, vi, beforeEach } from "vitest"
import { MessageHandlers } from "../handlers/messageHandlersAdapter"
import { MessageService } from "../services/MessageService"
import { makeSocketWithBroadcastMocks } from "../lib/testHelpers"

// Mock dependencies
vi.mock("../services/MessageService")
vi.mock("../lib/sendMessage", () => ({
  default: vi.fn(),
}))

// Import mocked dependencies
import sendMessage from "../lib/sendMessage"
import { User } from "@repo/types"

describe("MessageHandlers", () => {
  let mockSocket: any, mockIo: any, broadcastEmit: any, toEmit: any, toBroadcast: any, roomSpy: any
  const mockTypingUsers: User[] = []
  const mockRoomPath = "/rooms/room1"
  let messageService: MessageService
  let messageHandlers: MessageHandlers

  beforeEach(() => {
    vi.resetAllMocks()
    ;({
      socket: mockSocket,
      io: mockIo,
      broadcastEmit,
      toEmit,
      toBroadcast,
      roomSpy,
    } = makeSocketWithBroadcastMocks({
      roomId: "room1",
      userId: "1",
      username: "Homer",
    }))
    // Mock the MessageService methods
    messageService = {
      processNewMessage: vi.fn().mockResolvedValue({
        message: {
          user: { userId: "1", username: "Homer" },
          content: "Hello world",
          mentions: [],
          timestamp: "2023-01-01T00:00:00.000Z",
        },
        typing: mockTypingUsers,
        roomPath: mockRoomPath,
      }),
      clearAllMessages: vi.fn().mockResolvedValue({
        roomPath: mockRoomPath,
      }),
      addUserToTyping: vi.fn().mockResolvedValue({
        typing: mockTypingUsers,
        roomPath: mockRoomPath,
      }),
      removeUserFromTyping: vi.fn().mockResolvedValue({
        typing: mockTypingUsers,
        roomPath: mockRoomPath,
      }),
      getTypingUsers: vi.fn(),
    } as unknown as MessageService
    messageHandlers = new MessageHandlers(messageService)
  })

  describe("newMessage", () => {
    test("calls processNewMessage with the correct parameters", async () => {
      await messageHandlers.newMessage(
        { socket: mockSocket as any, io: mockIo as any },
        "Hello world",
      )

      expect(messageService.processNewMessage).toHaveBeenCalledWith(
        "room1",
        "1",
        "Homer",
        "Hello world",
      )
    })

    test("emits typing event to the room", async () => {
      await messageHandlers.newMessage(
        { socket: mockSocket as any, io: mockIo as any },
        "Hello world",
      )
      expect(mockIo.to).toHaveBeenCalledWith(mockRoomPath)
      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "TYPING",
        data: { typing: mockTypingUsers },
      })
    })

    test("sends the message", async () => {
      await messageHandlers.newMessage(
        { socket: mockSocket as any, io: mockIo as any },
        "Hello world",
      )

      expect(sendMessage).toHaveBeenCalledWith(mockIo, "room1", {
        user: { userId: "1", username: "Homer" },
        content: "Hello world",
        mentions: [],
        timestamp: "2023-01-01T00:00:00.000Z",
      })
    })
  })

  describe("clearMessages", () => {
    test("calls clearAllMessages with the correct parameters", async () => {
      await messageHandlers.clearMessages({ socket: mockSocket as any, io: mockIo as any })

      expect(messageService.clearAllMessages).toHaveBeenCalledWith("room1")
    })

    test("emits SET_MESSAGES event", async () => {
      await messageHandlers.clearMessages({ socket: mockSocket as any, io: mockIo as any })
      expect(mockIo.to).toHaveBeenCalledWith(mockRoomPath)
      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "SET_MESSAGES",
        data: { messages: [] },
      })
    })
  })

  describe("startTyping", () => {
    test("calls addUserToTyping with the correct parameters", async () => {
      await messageHandlers.startTyping({ socket: mockSocket as any, io: mockIo as any })

      expect(messageService.addUserToTyping).toHaveBeenCalledWith("room1", "1")
    })

    test("broadcasts TYPING event to the room", async () => {
      await messageHandlers.startTyping({ socket: mockSocket as any, io: mockIo as any })
      expect(mockSocket.broadcast.to).toHaveBeenCalledWith(mockRoomPath)
      expect(broadcastEmit).toHaveBeenCalledWith("event", {
        type: "TYPING",
        data: { typing: mockTypingUsers },
      })
    })
  })

  describe("stopTyping", () => {
    test("calls removeUserFromTyping with the correct parameters", async () => {
      await messageHandlers.stopTyping({ socket: mockSocket as any, io: mockIo as any })

      expect(messageService.removeUserFromTyping).toHaveBeenCalledWith("room1", "1")
    })

    test("broadcasts TYPING event to the room", async () => {
      await messageHandlers.stopTyping({ socket: mockSocket as any, io: mockIo as any })
      expect(mockSocket.broadcast.to).toHaveBeenCalledWith(mockRoomPath)
      expect(broadcastEmit).toHaveBeenCalledWith("event", {
        type: "TYPING",
        data: { typing: mockTypingUsers },
      })
    })
  })
})
