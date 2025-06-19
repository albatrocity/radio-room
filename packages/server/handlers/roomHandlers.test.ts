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

// Import after mocking
import { getRoomSettings, getLatestRoomData } from "./roomHandlers"

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

  test("getRoomSettings delegates to adapter", async () => {
    await getRoomSettings({ socket: mockSocket, io: mockIo })

    expect(mockGetRoomSettings).toHaveBeenCalledWith({ socket: mockSocket, io: mockIo })
  })

  test("getLatestRoomData delegates to adapter", async () => {
    const mockSnapshot: RoomSnapshot = {
      id: "room123",
      lastMessageTime: Date.now(),
      lastPlaylistItemTime: 123456789,
    }

    await getLatestRoomData({ socket: mockSocket, io: mockIo }, mockSnapshot)

    expect(mockGetLatestRoomData).toHaveBeenCalledWith(
      { socket: mockSocket, io: mockIo },
      mockSnapshot,
    )
  })
})
