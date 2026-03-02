import { describe, expect, test, vi, beforeEach } from "vitest"
import { AdminHandlers } from "./adminHandlersAdapter"
import { AdminService } from "../services/AdminService"
import { makeSocketWithBroadcastMocks } from "../lib/testHelpers"
import { User } from "@repo/types/User"
import { Room } from "@repo/types/Room"
import { roomFactory, userFactory } from "@repo/factories"

// Mock dependencies
vi.mock("../services/AdminService")
vi.mock("../operations/data/pluginConfigs", () => ({
  getAllPluginConfigs: vi.fn().mockResolvedValue({}),
  getPluginConfig: vi.fn().mockResolvedValue(null),
  setPluginConfig: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("../operations/data", () => ({
  findRoom: vi.fn().mockResolvedValue(null),
}))

describe("AdminHandlers", () => {
  let mockSocket: any
  let mockIo: any
  let adminService: any
  let adminHandlers: AdminHandlers
  let toEmit: any
  let toBroadcast: any
  let roomSpy: any

  // Mock return values
  const mockRoom = roomFactory.build({
    id: "room123",
    title: "Test Room",
    creator: "admin123",
  })
  const mockUser = userFactory.build({
    userId: "user123",
    username: "Homer",
    id: "socket123",
  })

  beforeEach(() => {
    vi.resetAllMocks()

    // Setup socket mocks
    const socketResult = makeSocketWithBroadcastMocks({
      roomId: "room123",
      userId: "admin123",
      username: "Admin",
    })

    mockSocket = socketResult.socket
    mockIo = socketResult.io
    toEmit = socketResult.toEmit
    toBroadcast = socketResult.toBroadcast
    roomSpy = socketResult.roomSpy

    // Mock the AdminService
    adminService = {
      getRoomSettings: vi.fn().mockResolvedValue({
        room: mockRoom,
        error: null,
      }),
      setPassword: vi.fn().mockResolvedValue({
        success: true,
      }),
      kickUser: vi.fn().mockResolvedValue({
        socketId: "socket123",
        message: { content: "You have been kicked", type: "system" },
      }),
      setRoomSettings: vi.fn().mockResolvedValue({
        room: mockRoom,
        error: null,
      }),
      clearPlaylist: vi.fn().mockResolvedValue({
        success: true,
        error: null,
      }),
    }

    adminHandlers = new AdminHandlers(adminService)
  })

  test("should be defined", () => {
    expect(adminHandlers).toBeDefined()
  })

  describe("getRoomSettings", () => {
    test("calls getRoomSettings with correct parameters", async () => {
      await adminHandlers.getRoomSettings({ socket: mockSocket, io: mockIo })

      expect(adminService.getRoomSettings).toHaveBeenCalledWith("room123", "admin123")
    })

    test("emits ROOM_SETTINGS event with room data", async () => {
      await adminHandlers.getRoomSettings({ socket: mockSocket, io: mockIo })

      expect(mockIo.to).toHaveBeenCalledWith(mockSocket.id)
      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "ROOM_SETTINGS",
        data: {
          room: mockRoom,
          pluginConfigs: undefined,
        },
      })
    })

    test("emits ERROR_OCCURRED event when not authorized", async () => {
      adminService.getRoomSettings.mockResolvedValueOnce({
        room: null,
        error: {
          status: 403,
          error: "Forbidden",
          message: "You are not the room creator.",
        },
      })

      await adminHandlers.getRoomSettings({ socket: mockSocket, io: mockIo })

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "ERROR_OCCURRED",
        data: {
          status: 403,
          error: "Forbidden",
          message: "You are not the room creator.",
        },
      })
      expect(mockIo.to).not.toHaveBeenCalled()
    })

    test("does nothing when room is null without error", async () => {
      adminService.getRoomSettings.mockResolvedValueOnce({
        room: null,
        error: null,
      })

      await adminHandlers.getRoomSettings({ socket: mockSocket, io: mockIo })

      expect(mockSocket.emit).not.toHaveBeenCalled()
      expect(mockIo.to).not.toHaveBeenCalled()
    })
  })

  describe("setPassword", () => {
    test("calls setPassword with correct parameters", async () => {
      await adminHandlers.setPassword({ socket: mockSocket, io: mockIo }, "newpassword")

      expect(adminService.setPassword).toHaveBeenCalledWith("room123", "newpassword")
    })
  })

  describe("kickUser", () => {
    test("calls kickUser with correct parameters", async () => {
      const userToKick = userFactory.build({
        userId: "user123",
        username: "Homer",
      })

      await adminHandlers.kickUser({ socket: mockSocket, io: mockIo }, userToKick as User)

      expect(adminService.kickUser).toHaveBeenCalledWith(userToKick)
    })

    test("emits events and disconnects socket", async () => {
      const userToKick = userFactory.build({
        userId: "user123",
        username: "Homer",
      })

      // Mock socket.get and disconnect function
      const mockDisconnect = vi.fn()
      const mockGet = vi.fn().mockReturnValue({ disconnect: mockDisconnect })
      mockIo.sockets.sockets.get = mockGet

      await adminHandlers.kickUser({ socket: mockSocket, io: mockIo }, userToKick as User)

      expect(mockIo.to).toHaveBeenCalledWith("socket123")
      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "MESSAGE_RECEIVED",
        data: {
          roomId: "room123",
          message: { content: "You have been kicked", type: "system" },
        },
      })
      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "USER_KICKED",
        data: {
          roomId: "room123",
          user: userToKick,
          reason: "You have been kicked",
        },
      })
      expect(mockGet).toHaveBeenCalledWith("socket123")
      expect(mockDisconnect).toHaveBeenCalled()
    })
  })

  describe("setRoomSettings", () => {
    test("calls setRoomSettings with correct parameters", async () => {
      const newSettings = { fetchMeta: true }

      await adminHandlers.setRoomSettings({ socket: mockSocket, io: mockIo }, newSettings)

      expect(adminService.setRoomSettings).toHaveBeenCalledWith("room123", "admin123", newSettings)
    })

    test("emits ROOM_SETTINGS_UPDATED event via systemEvents with updated room data", async () => {
      const newSettings = { fetchMeta: true }

      await adminHandlers.setRoomSettings({ socket: mockSocket, io: mockIo }, newSettings)

      expect(mockSocket.context.systemEvents.emit).toHaveBeenCalledWith(
        "room123",
        "ROOM_SETTINGS_UPDATED",
        {
          roomId: "room123",
          room: mockRoom,
          pluginConfigs: undefined,
        },
      )
    })

    test("emits ERROR_OCCURRED event when not authorized", async () => {
      adminService.setRoomSettings.mockResolvedValueOnce({
        room: null,
        error: {
          status: 403,
          error: "Forbidden",
          message: "You are not the room creator.",
        },
      })

      await adminHandlers.setRoomSettings({ socket: mockSocket, io: mockIo }, { fetchMeta: true })

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "ERROR_OCCURRED",
        data: {
          status: 403,
          error: "Forbidden",
          message: "You are not the room creator.",
        },
      })
    })
  })

  describe("clearPlaylist", () => {
    test("calls clearPlaylist with correct parameters", async () => {
      await adminHandlers.clearPlaylist({ socket: mockSocket, io: mockIo })

      expect(adminService.clearPlaylist).toHaveBeenCalledWith("room123", "admin123")
    })

    test("emits QUEUE_CHANGED event via systemEvents with empty data", async () => {
      await adminHandlers.clearPlaylist({ socket: mockSocket, io: mockIo })

      expect(mockSocket.context.systemEvents.emit).toHaveBeenCalledWith(
        "room123",
        "QUEUE_CHANGED",
        { roomId: "room123", queue: [] },
      )
    })

    test("emits ERROR_OCCURRED event when not authorized", async () => {
      adminService.clearPlaylist.mockResolvedValueOnce({
        success: false,
        error: {
          status: 403,
          error: "Forbidden",
          message: "You are not the room creator.",
        },
      })

      await adminHandlers.clearPlaylist({ socket: mockSocket, io: mockIo })

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "ERROR_OCCURRED",
        data: {
          status: 403,
          error: "Forbidden",
          message: "You are not the room creator.",
        },
      })
      expect(roomSpy).not.toHaveBeenCalled()
    })
  })
})
