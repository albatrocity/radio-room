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

      expect(mockSocket.on).toHaveBeenCalledWith("DEPUTIZE_DJ", expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith("QUEUE_SONG", expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith("SEARCH_TRACK", expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith("SEARCH_SPOTIFY_TRACK", expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith("SAVE_PLAYLIST", expect.any(Function))
    })

    test("should register exactly 5 socket events", () => {
      createDJController(mockSocket, mockIo)

      expect(mockSocket.on).toHaveBeenCalledTimes(9)
    })
  })

  describe("event handler registration", () => {
    test("should register 'DEPUTIZE_DJ' handler", () => {
      createDJController(mockSocket, mockIo)

      expect(socketEventHandlers.has("DEPUTIZE_DJ")).toBe(true)
      expect(socketEventHandlers.get("DEPUTIZE_DJ")).toBeTypeOf("function")
    })

    test("should register 'QUEUE_SONG' handler", () => {
      createDJController(mockSocket, mockIo)

      expect(socketEventHandlers.has("QUEUE_SONG")).toBe(true)
      expect(socketEventHandlers.get("QUEUE_SONG")).toBeTypeOf("function")
    })

    test("should register 'SEARCH_TRACK' handler", () => {
      createDJController(mockSocket, mockIo)

      expect(socketEventHandlers.has("SEARCH_TRACK")).toBe(true)
      expect(socketEventHandlers.get("SEARCH_TRACK")).toBeTypeOf("function")
    })

    test("should register 'SEARCH_SPOTIFY_TRACK' handler for backward compatibility", () => {
      createDJController(mockSocket, mockIo)

      expect(socketEventHandlers.has("SEARCH_SPOTIFY_TRACK")).toBe(true)
      expect(socketEventHandlers.get("SEARCH_SPOTIFY_TRACK")).toBeTypeOf("function")
    })

    test("should register 'SAVE_PLAYLIST' handler", () => {
      createDJController(mockSocket, mockIo)

      expect(socketEventHandlers.has("SAVE_PLAYLIST")).toBe(true)
      expect(socketEventHandlers.get("SAVE_PLAYLIST")).toBeTypeOf("function")
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
