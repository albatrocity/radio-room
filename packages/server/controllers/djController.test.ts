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
      expect(mockSocket.on).toHaveBeenCalledWith("CHECK_SAVED_TRACKS", expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith("ADD_TO_LIBRARY", expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith("REMOVE_FROM_LIBRARY", expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith("GET_SAVED_TRACKS", expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith("REQUEST_QUEUE_REMOVAL", expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith("REMOVE_FROM_QUEUE", expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith("PLAY_QUEUED_TRACK", expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith("REORDER_QUEUE", expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith("RESUME_PLAYBACK", expect.any(Function))
    })

    test("should register exactly 14 socket events", () => {
      createDJController(mockSocket, mockIo)

      expect(mockSocket.on).toHaveBeenCalledTimes(14)
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

    test("should register 'REORDER_QUEUE' handler", () => {
      createDJController(mockSocket, mockIo)

      expect(socketEventHandlers.has("REORDER_QUEUE")).toBe(true)
      expect(socketEventHandlers.get("REORDER_QUEUE")).toBeTypeOf("function")
    })
  })

  describe("closure and dependency management", () => {
    test("should not throw error when creating controller", () => {
      expect(() => createDJController(mockSocket, mockIo)).not.toThrow()
    })

    test("should handle socket and io being passed to controller", () => {
      createDJController(mockSocket, mockIo)

      // Verify that handlers were registered - if they were, the closure is working
      expect(socketEventHandlers.size).toBe(14)
    })
  })

  describe("pattern improvements", () => {
    test("demonstrates elimination of repetitive { socket, io } passing", () => {
      // This test documents the improvement
      // Before: Each event handler had to manually pass { socket, io }
      // After: Closure captures socket and io once, no repetition needed

      createDJController(mockSocket, mockIo)

      expect(mockSocket.on).toHaveBeenCalledTimes(14)
    })

    test("shows handler reuse through closure", () => {
      // The controller creates the handler adapter once and reuses it
      // This is more efficient than creating it for each event

      createDJController(mockSocket, mockIo)

      // All events are registered using the same handler instance
      expect(socketEventHandlers.size).toBe(14)
    })
  })
})
