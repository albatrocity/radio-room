import { describe, test, expect, vi, beforeEach } from "vitest"
import * as messageHandlers from "./messageHandlers"
import { makeSocketWithBroadcastMocks } from "../lib/testHelpers"

// Create mock handler methods
const mockNewMessage = vi.fn()
const mockClearMessages = vi.fn()
const mockStartTyping = vi.fn()
const mockStopTyping = vi.fn()

// Mock the adapter factory
vi.mock("./messageHandlersAdapter", () => ({
  createMessageHandlers: vi.fn(() => ({
    newMessage: mockNewMessage,
    clearMessages: mockClearMessages,
    startTyping: mockStartTyping,
    stopTyping: mockStopTyping,
  })),
}))

describe("messageHandlers (adapter wrapper)", () => {
  let socket: any, io: any

  beforeEach(() => {
    vi.clearAllMocks()
    const mocks = makeSocketWithBroadcastMocks({
      roomId: "room1",
      userId: "1",
      username: "Homer",
    })
    socket = mocks.socket
    io = mocks.io
  })

  test("newMessage delegates to adapter", async () => {
    await messageHandlers.newMessage({ socket, io }, "msg")
    expect(mockNewMessage).toHaveBeenCalledWith({ socket, io }, "msg")
  })

  test("clearMessages delegates to adapter", async () => {
    await messageHandlers.clearMessages({ socket, io })
    expect(mockClearMessages).toHaveBeenCalledWith({ socket, io })
  })

  test("startTyping delegates to adapter", async () => {
    await messageHandlers.startTyping({ socket, io })
    expect(mockStartTyping).toHaveBeenCalledWith({ socket, io })
  })

  test("stopTyping delegates to adapter", async () => {
    await messageHandlers.stopTyping({ socket, io })
    expect(mockStopTyping).toHaveBeenCalledWith({ socket, io })
  })
})
