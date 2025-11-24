import { describe, test, expect, vi, beforeEach } from "vitest"
import { RoomHandlers } from "./roomHandlersAdapter"
import { RoomService } from "../services/RoomService"
import { makeSocketWithBroadcastMocks } from "../lib/testHelpers"

// Mock dependencies
vi.mock("../services/RoomService")

// Test suite for RoomHandlers
describe("RoomHandlers", () => {
  let mockSocket: any, mockIo: any, toEmit: any
  let roomService: RoomService
  let roomHandlers: RoomHandlers

  const mockRoomSettings = { setting1: "value1", setting2: "value2" }
  const mockRoomData = { data1: "value1", data2: "value2" }

  beforeEach(() => {
    vi.resetAllMocks()
    ;({
      socket: mockSocket,
      io: mockIo,
      toEmit,
    } = makeSocketWithBroadcastMocks({
      roomId: "room1",
      userId: "1",
    }))

    // Mock the RoomService methods
    roomService = {
      getRoomSettings: vi.fn().mockResolvedValue(mockRoomSettings),
      getLatestRoomData: vi.fn().mockResolvedValue(mockRoomData),
    } as unknown as RoomService

    roomHandlers = new RoomHandlers(roomService)
  })

  describe("getRoomSettings", () => {
    test("calls getRoomSettings with the correct parameters", async () => {
      await roomHandlers.getRoomSettings({ socket: mockSocket, io: mockIo })

      expect(roomService.getRoomSettings).toHaveBeenCalledWith("room1", "1")
    })

    test("emits ROOM_SETTINGS event with the correct data", async () => {
      await roomHandlers.getRoomSettings({ socket: mockSocket, io: mockIo })

      expect(mockIo.to).toHaveBeenCalledWith(mockSocket.id)
      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "ROOM_SETTINGS",
        data: mockRoomSettings,
      })
    })
  })

  describe("getLatestRoomData", () => {
    const mockSnapshot = { snapshotKey: "snapshotValue" } as any

    test("calls getLatestRoomData with the correct parameters", async () => {
      await roomHandlers.getLatestRoomData({ socket: mockSocket, io: mockIo }, mockSnapshot)

      expect(roomService.getLatestRoomData).toHaveBeenCalledWith("room1", "1", mockSnapshot)
    })

    test("emits ROOM_DATA event with the correct data", async () => {
      await roomHandlers.getLatestRoomData({ socket: mockSocket, io: mockIo }, mockSnapshot)

      expect(mockIo.to).toHaveBeenCalledWith(mockSocket.id)
      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "ROOM_DATA",
        data: mockRoomData,
      })
    })
  })
})