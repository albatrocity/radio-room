import { describe, expect, test, vi, beforeEach } from "vitest"
import { AdminService } from "./AdminService"
import { AppContext } from "@repo/types"

// Mock dependencies
vi.mock("../operations/data", () => ({
  clearQueue: vi.fn(),
  clearRoomCurrent: vi.fn(),
  findRoom: vi.fn(),
  getUser: vi.fn(),
  saveRoom: vi.fn(),
  clearRoomPlaylist: vi.fn(),
}))
vi.mock("../operations/room/handleRoomNowPlayingData", () => ({
  default: vi.fn(),
}))
vi.mock("../lib/makeNowPlayingFromStationMeta", () => ({
  default: vi.fn().mockResolvedValue({}),
}))
vi.mock("../lib/systemMessage", () => ({
  default: vi.fn((msg) => ({ content: msg, type: "system" })),
}))

// Import mocked dependencies
import systemMessage from "../lib/systemMessage"
import {
  clearQueue,
  clearRoomCurrent,
  findRoom,
  getUser,
  saveRoom,
  clearRoomPlaylist,
} from "../operations/data"
import handleRoomNowPlayingData from "../operations/room/handleRoomNowPlayingData"
import makeNowPlayingFromStationMeta from "../lib/makeNowPlayingFromStationMeta"
import { appContextFactory, roomFactory, userFactory } from "@repo/factories"

describe("AdminService", () => {
  let adminService: AdminService
  let mockContext: AppContext
  const mockRoom = roomFactory.build({
    id: "room123",
    title: "Test Room",
    creator: "admin123",
    fetchMeta: false,
  })
  const mockUser = userFactory.build({
    userId: "user123",
    username: "Homer",
    id: "socket123",
  })

  beforeEach(() => {
    vi.resetAllMocks()
    mockContext = appContextFactory.build()
    adminService = new AdminService(mockContext)

    // Setup default mocks
    vi.mocked(findRoom).mockResolvedValue(mockRoom)
    vi.mocked(getUser).mockResolvedValue(mockUser)
    vi.mocked(systemMessage).mockImplementation((msg) => ({
      content: msg,
      type: "system",
      user: { id: "system", username: "System", userId: "system" },
      meta: {},
      mentions: [],
      timestamp: new Date().toISOString(),
    }))
  })

  test("should be defined", () => {
    expect(adminService).toBeDefined()
  })

  describe("getAuthedRoom", () => {
    test("returns room when user is an admin", async () => {
      const result = await adminService.getAuthedRoom("room123", "admin123")

      expect(findRoom).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room123",
      })

      expect(result).toEqual({
        room: mockRoom,
        isAdmin: true,
        error: null,
      })
    })

    test("returns error when user is not an admin", async () => {
      const result = await adminService.getAuthedRoom("room123", "user123")

      expect(result).toEqual({
        room: null,
        isAdmin: false,
        error: {
          status: 403,
          error: "Forbidden",
          message: "You are not the room creator.",
        },
      })
    })

    test("returns null when room is not found", async () => {
      vi.mocked(findRoom).mockResolvedValueOnce(null)

      const result = await adminService.getAuthedRoom("room123", "admin123")

      expect(result).toEqual({
        room: null,
        isAdmin: false,
        error: null,
      })
    })
  })

  describe("getRoomSettings", () => {
    test("returns room settings for admin", async () => {
      const result = await adminService.getRoomSettings("room123", "admin123")

      expect(result).toEqual({
        room: mockRoom,
        error: null,
      })
    })

    test("returns error when user is not an admin", async () => {
      const result = await adminService.getRoomSettings("room123", "user123")

      expect(result).toEqual({
        room: null,
        error: {
          status: 403,
          error: "Forbidden",
          message: "You are not the room creator.",
        },
      })
    })
  })

  describe("setPassword", () => {
    test("updates room password", async () => {
      const result = await adminService.setPassword("room123", "newpassword")

      expect(saveRoom).toHaveBeenCalledWith({
        context: mockContext,
        room: { ...mockRoom, password: "newpassword" },
      })

      expect(result).toEqual({
        success: true,
      })
    })

    test("returns failure when room is not found", async () => {
      vi.mocked(findRoom).mockResolvedValueOnce(null)

      const result = await adminService.setPassword("room123", "newpassword")

      expect(saveRoom).not.toHaveBeenCalled()
      expect(result).toEqual({
        success: false,
      })
    })
  })

  describe("kickUser", () => {
    test("returns kicked user socket ID and message", async () => {
      const userToKick = userFactory.build({
        userId: "user123",
        username: "Homer",
      })

      const result = await adminService.kickUser(userToKick)

      expect(getUser).toHaveBeenCalledWith({
        context: mockContext,
        userId: "user123",
      })

      expect(systemMessage).toHaveBeenCalledWith(
        expect.stringContaining("kicked"),
        expect.objectContaining({ status: "error" }),
      )

      expect(result).toEqual({
        socketId: "socket123",
        message: {
          content: expect.stringContaining("kicked"),
          type: "system",
          user: { id: "system", username: "System", userId: "system" },
          meta: {},
          mentions: [],
          timestamp: expect.any(String),
        },
      })
    })
  })

  describe("setRoomSettings", () => {
    test("updates room settings", async () => {
      const newSettings = { fetchMeta: true }

      vi.mocked(findRoom)
        .mockResolvedValueOnce(mockRoom) // First call for getAuthedRoom
        .mockResolvedValueOnce({ ...mockRoom, fetchMeta: true }) // Second call after update

      const result = await adminService.setRoomSettings("room123", "admin123", newSettings)

      expect(saveRoom).toHaveBeenCalledWith({
        context: mockContext,
        room: expect.objectContaining({ fetchMeta: true }),
      })

      expect(result).toEqual({
        room: { ...mockRoom, fetchMeta: true },
        error: null,
      })
    })

    test("handles fetch meta toggle", async () => {
      const newSettings = { fetchMeta: true }

      vi.mocked(clearRoomCurrent).mockResolvedValueOnce({
        stationMeta: { title: "Test", bitrate: "256" },
      })

      await adminService.setRoomSettings("room123", "admin123", newSettings)

      expect(clearRoomCurrent).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room123",
      })

      expect(makeNowPlayingFromStationMeta).toHaveBeenCalledWith({ title: "Test", bitrate: "256" })

      expect(handleRoomNowPlayingData).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room123",
        nowPlaying: undefined,
        stationMeta: { title: "Test", bitrate: "256" },
        forcePublish: true,
      })
    })

    test("returns error when user is not an admin", async () => {
      const newSettings = { fetchMeta: true }

      const result = await adminService.setRoomSettings("room123", "user123", newSettings)

      expect(saveRoom).not.toHaveBeenCalled()
      expect(result).toEqual({
        room: null,
        error: {
          status: 403,
          error: "Forbidden",
          message: "You are not the room creator.",
        },
      })
    })
  })

  describe("clearPlaylist", () => {
    test("clears room playlist and queue", async () => {
      const result = await adminService.clearPlaylist("room123", "admin123")

      expect(clearRoomPlaylist).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room123",
      })

      expect(clearQueue).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room123",
      })

      expect(result).toEqual({
        success: true,
        error: null,
      })
    })

    test("returns error when user is not an admin", async () => {
      const result = await adminService.clearPlaylist("room123", "user123")

      expect(clearRoomPlaylist).not.toHaveBeenCalled()
      expect(clearQueue).not.toHaveBeenCalled()

      expect(result).toEqual({
        success: false,
        error: {
          status: 403,
          error: "Forbidden",
          message: "You are not the room creator.",
        },
      })
    })
  })
})
