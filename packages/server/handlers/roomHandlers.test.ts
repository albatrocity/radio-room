import { describe, expect, test, vi, beforeEach } from "vitest"
import { makeSocketWithBroadcastMocks } from "../lib/testHelpers"
import { RoomSnapshot } from "@repo/types/Room"

// Define mocks at the top level
const mockGetRoomSettings = vi.fn()
const mockGetLatestRoomData = vi.fn()

// Mock the adapter's createRoomHandlers function
vi.mock("./roomHandlersAdapter", () => ({
  createRoomHandlers: () => ({
    getRoomSettings: mockGetRoomSettings,
    getLatestRoomData: mockGetLatestRoomData,
  }),
}))

const mockFindRoom = vi.hoisted(() => vi.fn())
const mockGetMessagesSince = vi.hoisted(() => vi.fn())
const mockGetRoomPlaylistSince = vi.hoisted(() => vi.fn())
const mockRemoveSensitiveRoomAttributes = vi.hoisted(() => vi.fn((room) => room))

vi.mock("../operations/data", () => ({
  findRoom: mockFindRoom,
  getMessagesSince: mockGetMessagesSince,
  getRoomPlaylistSince: mockGetRoomPlaylistSince,
  removeSensitiveRoomAttributes: mockRemoveSensitiveRoomAttributes,
}))

// Import after mocking
import { getRoomSettings, getLatestRoomData } from "./roomHandlers"
import { roomFactory } from "@repo/factories"
import { removeSensitiveRoomAttributes } from "../operations/data"

//
describe("roomHandlers", () => {
  let mockSocket: any, mockIo: any, mockContext: any

  beforeEach(() => {
    vi.resetAllMocks()

    // Setup socket mocks with context
    const socketResult = makeSocketWithBroadcastMocks({
      roomId: "room123",
      userId: "user123",
      username: "Homer",
    })

    mockSocket = socketResult.socket
    mockIo = socketResult.io
    mockContext = { redis: {}, db: {} }

    // Add context to the socket
    mockSocket.context = mockContext
  })

  // Add tests for getRoomSettings and getLatestRoomData
  describe("getRoomSettings", () => {
    test("should emit ROOM_SETTINGS event with full room data for admin", async () => {
      const room = roomFactory.build({ creator: "user123" })
      mockFindRoom.mockResolvedValue(room)

      await getRoomSettings({ socket: mockSocket, io: mockIo })

      expect(mockIo.to).toHaveBeenCalledWith(mockSocket.id)
      expect(mockIo.to().emit).toHaveBeenCalledWith("event", {
        type: "ROOM_SETTINGS",
        data: { room },
      })
    })

    test("should emit ROOM_SETTINGS event with sanitized room data for non-admin", async () => {
      const room = roomFactory.build({ creator: "anotherUser" })
      mockFindRoom.mockResolvedValue(room)

      await getRoomSettings({ socket: mockSocket, io: mockIo })

      expect(mockIo.to).toHaveBeenCalledWith(mockSocket.id)
      expect(mockIo.to().emit).toHaveBeenCalledWith("event", {
        type: "ROOM_SETTINGS",
        data: { room: removeSensitiveRoomAttributes(room) },
      })
    })
  })

  describe("getLatestRoomData", () => {
    test("should emit ROOM_DATA event with messages and playlist", async () => {
      const room = roomFactory.build({ creator: "user123" })
      const messages = [{ id: "msg1" }]
      const playlist = [{ id: "track1" }]

      mockFindRoom.mockResolvedValue(room)
      mockGetMessagesSince.mockResolvedValue(messages)
      mockGetRoomPlaylistSince.mockResolvedValue(playlist)

      const snapshot: RoomSnapshot = {
        id: "room123",
        lastMessageTime: Date.now() - 1000,
        lastPlaylistItemTime: Date.now() - 2000,
      }

      await getLatestRoomData({ socket: mockSocket, io: mockIo }, snapshot)

      expect(mockIo.to).toHaveBeenCalledWith(mockSocket.id)
      expect(mockIo.to().emit).toHaveBeenCalledWith("event", {
        type: "ROOM_DATA",
        data: {
          room,
          messages,
          playlist,
        },
      })
    })

    test("should emit ROOM_DATA event with sanitized room data for non-admin", async () => {
      const room = roomFactory.build({ creator: "anotherUser" })
      const messages = [{ id: "msg1" }]
      const playlist = [{ id: "track1" }]

      mockFindRoom.mockResolvedValue(room)
      mockGetMessagesSince.mockResolvedValue(messages)
      mockGetRoomPlaylistSince.mockResolvedValue(playlist)

      const snapshot: RoomSnapshot = {
        id: "room123",
        lastMessageTime: Date.now() - 1000,
        lastPlaylistItemTime: Date.now() - 2000,
      }

      await getLatestRoomData({ socket: mockSocket, io: mockIo }, snapshot)

      expect(mockIo.to).toHaveBeenCalledWith(mockSocket.id)
      expect(mockIo.to().emit).toHaveBeenCalledWith("event", {
        type: "ROOM_DATA",
        data: {
          room: removeSensitiveRoomAttributes(room),
          messages,
          playlist,
        },
      })
    })
  })
})
