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
    
    // Add systemEvents to socket context
    mockSocket.context = {
      ...mockSocket.context,
      systemEvents: {
        emit: vi.fn(),
      },
    }
    
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

    test("emits typing event via systemEvents", async () => {
      await messageHandlers.newMessage(
        { socket: mockSocket as any, io: mockIo as any },
        "Hello world",
      )
      expect(mockSocket.context.systemEvents.emit).toHaveBeenCalledWith(
        "room1",
        "TYPING_CHANGED",
        { roomId: "room1", typing: mockTypingUsers },
      )
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
      }, expect.any(Object))
    })
  })

  describe("clearMessages", () => {
    test("calls clearAllMessages with the correct parameters", async () => {
      await messageHandlers.clearMessages({ socket: mockSocket as any, io: mockIo as any })

      expect(messageService.clearAllMessages).toHaveBeenCalledWith("room1")
    })

    test("emits MESSAGES_CLEARED event via systemEvents", async () => {
      await messageHandlers.clearMessages({ socket: mockSocket as any, io: mockIo as any })
      expect(mockSocket.context.systemEvents.emit).toHaveBeenCalledWith(
        "room1",
        "MESSAGES_CLEARED",
        { roomId: "room1" },
      )
    })
  })

  describe("startTyping", () => {
    test("calls addUserToTyping with the correct parameters", async () => {
      await messageHandlers.startTyping({ socket: mockSocket as any, io: mockIo as any })

      expect(messageService.addUserToTyping).toHaveBeenCalledWith("room1", "1")
    })

    test("emits TYPING_CHANGED event via systemEvents", async () => {
      await messageHandlers.startTyping({ socket: mockSocket as any, io: mockIo as any })
      expect(mockSocket.context.systemEvents.emit).toHaveBeenCalledWith(
        "room1",
        "TYPING_CHANGED",
        { roomId: "room1", typing: mockTypingUsers },
      )
    })
  })

  describe("stopTyping", () => {
    test("calls removeUserFromTyping with the correct parameters", async () => {
      await messageHandlers.stopTyping({ socket: mockSocket as any, io: mockIo as any })

      expect(messageService.removeUserFromTyping).toHaveBeenCalledWith("room1", "1")
    })

    test("emits TYPING_CHANGED event via systemEvents", async () => {
      await messageHandlers.stopTyping({ socket: mockSocket as any, io: mockIo as any })
      expect(mockSocket.context.systemEvents.emit).toHaveBeenCalledWith(
        "room1",
        "TYPING_CHANGED",
        { roomId: "room1", typing: mockTypingUsers },
      )
    })
  })
})
