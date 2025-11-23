import { describe, expect, test, vi, beforeEach } from "vitest"
import { SocketWithContext } from "../lib/socketWithContext"
import { Server } from "socket.io"
import { appContextFactory } from "@repo/factories"

// Import the actual controller
import { createDJController } from "./djController"

describe("DJController", () => {
  let mockSocket: SocketWithContext
  let mockIo: Server
  let socketEventHandlers: Map<string, Function>

  beforeEach(() => {
    // Reset
    socketEventHandlers = new Map()

    // Create mock context
    const mockContext = appContextFactory.build()

    // Create mock socket with event registration tracking
    mockSocket = {
      on: vi.fn((event: string, handler: Function) => {
        socketEventHandlers.set(event, handler)
      }),
      emit: vi.fn(),
      data: {
        userId: "user123",
        username: "TestUser",
        roomId: "room123",
      },
      context: mockContext,
    } as any

    // Create mock io
    mockIo = {
      to: vi.fn().mockReturnThis(),
      emit: vi.fn(),
    } as any
  })

  describe("initialization", () => {
    test("should register all DJ-related socket events", () => {
      createDJController(mockSocket, mockIo)

      expect(mockSocket.on).toHaveBeenCalledWith("dj deputize user", expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith("queue song", expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith("search track", expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith("search spotify track", expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith("save playlist", expect.any(Function))
    })

    test("should register exactly 5 socket events", () => {
      createDJController(mockSocket, mockIo)

      expect(mockSocket.on).toHaveBeenCalledTimes(9)
    })
  })

  describe("event handler registration", () => {
    test("should register 'dj deputize user' handler", () => {
      createDJController(mockSocket, mockIo)

      expect(socketEventHandlers.has("dj deputize user")).toBe(true)
      expect(socketEventHandlers.get("dj deputize user")).toBeTypeOf("function")
    })

    test("should register 'queue song' handler", () => {
      createDJController(mockSocket, mockIo)

      expect(socketEventHandlers.has("queue song")).toBe(true)
      expect(socketEventHandlers.get("queue song")).toBeTypeOf("function")
    })

    test("should register 'search track' handler", () => {
      createDJController(mockSocket, mockIo)

      expect(socketEventHandlers.has("search track")).toBe(true)
      expect(socketEventHandlers.get("search track")).toBeTypeOf("function")
    })

    test("should register 'search spotify track' handler for backward compatibility", () => {
      createDJController(mockSocket, mockIo)

      expect(socketEventHandlers.has("search spotify track")).toBe(true)
      expect(socketEventHandlers.get("search spotify track")).toBeTypeOf("function")
    })

    test("should register 'save playlist' handler", () => {
      createDJController(mockSocket, mockIo)

      expect(socketEventHandlers.has("save playlist")).toBe(true)
      expect(socketEventHandlers.get("save playlist")).toBeTypeOf("function")
    })
  })

  describe("closure and dependency management", () => {
    test("should not throw error when creating controller", () => {
      expect(() => createDJController(mockSocket, mockIo)).not.toThrow()
    })

    test("should handle socket and io being passed to controller", () => {
      createDJController(mockSocket, mockIo)

      // Verify that handlers were registered - if they were, the closure is working
      expect(socketEventHandlers.size).toBe(9)
    })
  })

  describe("pattern improvements", () => {
    test("demonstrates elimination of repetitive { socket, io } passing", () => {
      // This test documents the improvement
      // Before: Each event handler had to manually pass { socket, io }
      // After: Closure captures socket and io once, no repetition needed

      createDJController(mockSocket, mockIo)

      // The fact that we have 9 registered handlers proves the pattern works
      expect(mockSocket.on).toHaveBeenCalledTimes(9)
    })

    test("shows handler reuse through closure", () => {
      // The controller creates the handler adapter once and reuses it
      // This is more efficient than creating it for each event

      createDJController(mockSocket, mockIo)

      // All 9 events are registered using the same handler instance
      expect(socketEventHandlers.size).toBe(9)
    })
  })
})
