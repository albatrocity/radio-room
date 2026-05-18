import { describe, test, expect, vi, beforeEach } from "vitest"
import { CHAT_BUFFER_FLAG } from "@repo/game-logic"
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
  let mockSocket: any,
    mockIo: any,
    socketEmit: any,
    broadcastEmit: any,
    toEmit: any,
    toBroadcast: any,
    roomSpy: any
  const mockTypingUsers: User[] = []
  const mockRoomPath = "/rooms/room1"
  let messageService: MessageService
  let messageHandlers: MessageHandlers

  beforeEach(() => {
    vi.resetAllMocks()
    ;({
      socket: mockSocket,
      io: mockIo,
      emit: socketEmit,
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

    test("delays send when user has stacked chat_buffer modifiers", async () => {
      vi.useFakeTimers()
      const now = 1_700_000_000_000
      vi.setSystemTime(now)

      mockSocket.context.gameSessions = {
        getUserState: vi.fn().mockResolvedValue({
          userId: "1",
          attributes: { score: 0, coin: 0 },
          modifiers: [
            {
              id: "buf-1",
              name: "buffer_pedal",
              source: "item-shops",
              stackBehavior: "stack",
              startAt: now - 1000,
              endAt: now + 300_000,
              effects: [{ type: "flag", name: CHAT_BUFFER_FLAG, value: true, intent: "negative" }],
            },
            {
              id: "buf-2",
              name: "buffer_pedal",
              source: "item-shops",
              stackBehavior: "stack",
              startAt: now - 1000,
              endAt: now + 300_000,
              effects: [{ type: "flag", name: CHAT_BUFFER_FLAG, value: true, intent: "negative" }],
            },
          ],
        }),
      }

      const sendPromise = messageHandlers.newMessage(
        { socket: mockSocket as any, io: mockIo as any },
        "Hello world",
      )

      await vi.advanceTimersByTimeAsync(0)

      expect(sendMessage).not.toHaveBeenCalled()
      expect(socketEmit).toHaveBeenCalledWith("event", {
        type: "MESSAGE_RECEIVED",
        data: {
          roomId: "room1",
          message: expect.objectContaining({
            content: "Hello world",
            expiresAt: now + 2000 + 500,
            user: expect.objectContaining({ userId: "1", username: "Homer" }),
          }),
        },
      })
      await vi.advanceTimersByTimeAsync(2000)
      await sendPromise

      expect(sendMessage).toHaveBeenCalled()
      vi.useRealTimers()
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
