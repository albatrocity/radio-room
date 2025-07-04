import { describe, test, expect, vi, beforeEach } from "vitest"
import { makeSocketWithBroadcastMocks } from "../lib/testHelpers"

// Create mock handler methods
const mockNewMessage = vi.fn()
const mockClearMessages = vi.fn()
const mockStartTyping = vi.fn()
const mockStopTyping = vi.fn()

// Mock the adapter factory
vi.mock("./messageHandlersAdapter", () => ({
  createMessageHandlers: () => ({
    newMessage: mockNewMessage,
    clearMessages: mockClearMessages,
    startTyping: mockStartTyping,
    stopTyping: mockStopTyping,
  }),
}))

import { newMessage, clearMessages, startTyping, stopTyping } from "./messageHandlers"

describe("messageHandlers (adapter wrapper)", () => {
  let socket: any, io: any, mockContext: any

  beforeEach(() => {
    vi.resetAllMocks()

    // Setup socket mocks with context
    const socketResult = makeSocketWithBroadcastMocks({
      roomId: "room1",
      userId: "user123",
      username: "Homer",
    })

    socket = socketResult.socket
    io = socketResult.io
    mockContext = { redis: {}, db: {} }

    // Add context to the socket
    socket.context = mockContext
  })

  test("newMessage delegates to adapter", async () => {
    // console.log("newMessage:", newMessage())
    await newMessage({ socket, io }, "msg")
    expect(mockNewMessage).toHaveBeenCalledWith({ socket, io }, "msg")
  })

  test("clearMessages delegates to adapter", async () => {
    await clearMessages({ socket, io })
    expect(mockClearMessages).toHaveBeenCalledWith({ socket, io })
  })

  test("startTyping delegates to adapter", async () => {
    await startTyping({ socket, io })
    expect(mockStartTyping).toHaveBeenCalledWith({ socket, io })
  })

  test("stopTyping delegates to adapter", async () => {
    await stopTyping({ socket, io })
    expect(mockStopTyping).toHaveBeenCalledWith({ socket, io })
  })
})
