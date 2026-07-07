import { describe, test, expect, vi, beforeEach } from "vitest"
import { RoomHandlers } from "./roomHandlersAdapter"
import { RoomService } from "../services/RoomService"
import { makeSocketWithBroadcastMocks } from "../lib/testHelpers"
import { getAllPluginConfigs, getAllMergedPluginConfigs } from "../operations/data/pluginConfigs"

// Mock dependencies
vi.mock("../services/RoomService")
vi.mock("../operations/data/pluginConfigs", () => ({
  getAllPluginConfigs: vi.fn(),
  getAllMergedPluginConfigs: vi.fn(),
}))

// Test suite for RoomHandlers
describe("RoomHandlers", () => {
  let mockSocket: any, mockIo: any, toEmit: any
  let roomService: RoomService
  let roomHandlers: RoomHandlers

  const mockRoom = { setting1: "value1", setting2: "value2" }
  const mockRoomSettings = { room: mockRoom, isAdmin: false }
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

    // resetAllMocks() above clears module-mock return values, so re-establish them.
    ;(getAllPluginConfigs as any).mockResolvedValue({ pub: { enabled: true } })
    ;(getAllMergedPluginConfigs as any).mockResolvedValue({ pub: { enabled: true, secret: "x" } })

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

    test("emits ROOM_SETTINGS with PUBLIC plugin configs for non-admins", async () => {
      await roomHandlers.getRoomSettings({ socket: mockSocket, io: mockIo })

      expect(mockIo.to).toHaveBeenCalledWith(mockSocket.id)
      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "ROOM_SETTINGS",
        data: {
          room: mockRoom,
          pluginConfigs: { pub: { enabled: true } },
        },
      })
    })

    test("emits ROOM_SETTINGS with MERGED plugin configs for admins (ADR 0068 §2)", async () => {
      ;(roomService.getRoomSettings as any).mockResolvedValueOnce({
        room: mockRoom,
        isAdmin: true,
      })

      await roomHandlers.getRoomSettings({ socket: mockSocket, io: mockIo })

      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "ROOM_SETTINGS",
        data: {
          room: mockRoom,
          pluginConfigs: { pub: { enabled: true, secret: "x" } },
        },
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