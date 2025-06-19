import { describe, expect, test, vi, beforeEach } from "vitest"
import { RoomService } from "./RoomService"
import { AppContext } from "@repo/types"
import { Room, RoomSnapshot } from "@repo/types/Room"
import { ChatMessage } from "@repo/types/ChatMessage"
import { QueueItem } from "@repo/types/Queue"

// Mock dependencies
vi.mock("../operations/data", () => ({
  findRoom: vi.fn(),
  getMessagesSince: vi.fn(),
  getRoomPlaylistSince: vi.fn(),
  removeSensitiveRoomAttributes: vi.fn((room) => ({ ...room, sensitive: false })),
}))

// Import mocked dependencies
import {
  findRoom,
  getMessagesSince,
  getRoomPlaylistSince,
  removeSensitiveRoomAttributes,
} from "../operations/data"
import {
  appContextFactory,
  roomFactory,
  queueItemFactory,
  chatMessageFactory,
} from "@repo/factories"

describe("RoomService", () => {
  let roomService: RoomService
  let mockContext: AppContext
  const mockRoom = roomFactory.build({
    id: "room123",
    title: "Test Room",
    creator: "admin123",
  })
  const mockMessages = chatMessageFactory.buildList(2)
  const mockPlaylist = [queueItemFactory.build()]
  const mockSnapshot: RoomSnapshot = {
    id: mockRoom.id,
    lastMessageTime: Date.now(),
    lastPlaylistItemTime: 123456789,
  }

  beforeEach(() => {
    vi.resetAllMocks()
    mockContext = appContextFactory.build()
    roomService = new RoomService(mockContext)

    // Setup default mocks
    vi.mocked(findRoom).mockResolvedValue(mockRoom)
    vi.mocked(getMessagesSince).mockResolvedValue(mockMessages)
    vi.mocked(getRoomPlaylistSince).mockResolvedValue(mockPlaylist)
  })

  test("should be defined", () => {
    expect(roomService).toBeDefined()
  })

  describe("getRoomSettings", () => {
    test("returns null when roomId is not provided", async () => {
      const result = await roomService.getRoomSettings("", "user123")
      expect(result).toBeNull()
      expect(findRoom).not.toHaveBeenCalled()
    })

    test("returns null when room is not found", async () => {
      vi.mocked(findRoom).mockResolvedValueOnce(null)
      const result = await roomService.getRoomSettings("room123", "user123")
      expect(result).toBeNull()
    })

    test("returns room with sensitive attributes for admin", async () => {
      const result = await roomService.getRoomSettings("room123", "admin123")

      expect(findRoom).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room123",
      })

      expect(result).toEqual({
        room: mockRoom,
      })

      expect(removeSensitiveRoomAttributes).not.toHaveBeenCalled()
    })

    test("returns room without sensitive attributes for non-admin", async () => {
      // Clear call history but keep the implementation
      vi.mocked(removeSensitiveRoomAttributes).mockClear()
      // Set up the return value for this specific test
      vi.mocked(removeSensitiveRoomAttributes).mockReturnValueOnce({
        ...mockRoom,
        password: null,
      })
      vi.mocked(findRoom).mockResolvedValue(mockRoom)

      await roomService.getRoomSettings(mockRoom.id, "user123")

      expect(findRoom).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room123",
      })

      expect(removeSensitiveRoomAttributes).toHaveBeenCalledWith(mockRoom)
    })
  })

  describe("getLatestRoomData", () => {
    test("returns null when roomId is not provided", async () => {
      const result = await roomService.getLatestRoomData("", "user123", mockSnapshot)
      expect(result).toBeNull()
      expect(findRoom).not.toHaveBeenCalled()
    })

    test("returns null when room is not found", async () => {
      vi.mocked(findRoom).mockResolvedValueOnce(null)
      const result = await roomService.getLatestRoomData("room123", "user123", mockSnapshot)
      expect(result).toBeNull()
    })

    test("returns complete data with sensitive room attributes for admin", async () => {
      const result = await roomService.getLatestRoomData("room123", "admin123", mockSnapshot)

      expect(findRoom).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room123",
      })

      expect(getMessagesSince).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room123",
        since: mockSnapshot.lastMessageTime,
      })

      expect(getRoomPlaylistSince).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room123",
        since: mockSnapshot.lastPlaylistItemTime,
      })

      expect(result).toEqual({
        room: mockRoom,
        messages: mockMessages,
        playlist: mockPlaylist,
      })

      expect(removeSensitiveRoomAttributes).not.toHaveBeenCalled()
    })

    test("returns complete data without sensitive room attributes for non-admin", async () => {
      vi.mocked(removeSensitiveRoomAttributes).mockClear()
      // Set up the return value for this specific test
      vi.mocked(removeSensitiveRoomAttributes).mockReturnValueOnce({
        ...mockRoom,
        password: null,
      })
      const result = await roomService.getLatestRoomData("room123", "user123", mockSnapshot)
      expect(findRoom).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room123",
      })
      expect(getMessagesSince).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room123",
        since: mockSnapshot.lastMessageTime,
      })
      expect(getRoomPlaylistSince).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room123",
        since: mockSnapshot.lastPlaylistItemTime,
      })
      expect(removeSensitiveRoomAttributes).toHaveBeenCalledWith(mockRoom)
      expect(result).toEqual({
        room: { ...mockRoom },
        messages: mockMessages,
        playlist: mockPlaylist,
      })
    })
  })
})
