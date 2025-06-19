import { describe, test, expect, beforeEach, afterEach, vi } from "vitest"
import { makeSocket } from "../lib/testHelpers"
import {
  getRoomSettings,
  setPassword,
  kickUser,
  setRoomSettings,
  clearPlaylist,
} from "./adminHandlers"
import { findRoom, saveRoom, getUser, clearRoomPlaylist, clearQueue } from "../operations/data"
import { AppContext } from "@repo/types"
import { addContextToSocket } from "../lib/socketWithContext"
import { roomFactory } from "@repo/factories/room"

// Mock AppContext and Redis
const mockRedisClient = {
  set: vi.fn().mockResolvedValue(null),
  zAdd: vi.fn().mockResolvedValue(null),
  publish: vi.fn().mockResolvedValue(null),
  sMembers: vi.fn().mockResolvedValue([]),
}
const mockContext: AppContext = {
  redis: {
    pubClient: mockRedisClient as any,
    subClient: mockRedisClient as any,
  },
}

// Mock the imports
vi.mock("../operations/data")
vi.mock("../operations/room/handleRoomNowPlayingData", () => ({ default: vi.fn() }))
vi.mock("../lib/systemMessage", () => ({ default: vi.fn(() => "system-message") }))

beforeEach(() => {
  vi.resetAllMocks()
})
afterEach(() => {
  vi.clearAllMocks()
})

const mockRoom = roomFactory.build({
  id: "adminRoom",
  creator: "1",
})

describe("adminHandlers", () => {
  const { socket: baseSocket, io, toEmit } = makeSocket({ roomId: "adminRoom" })
  const socket = addContextToSocket(baseSocket, mockContext)

  describe("getRoomSettings", () => {
    test("emits ROOM_SETTINGS event for admin", async () => {
      vi.mocked(findRoom).mockResolvedValueOnce({ ...mockRoom, creator: "1" })
      socket.data.userId = "1"
      await getRoomSettings({ io, socket })
      expect(toEmit).toHaveBeenCalledWith(
        "event",
        expect.objectContaining({ type: "ROOM_SETTINGS" }),
      )
    })
    test("emits error if not admin", async () => {
      vi.mocked(findRoom).mockResolvedValueOnce({ ...mockRoom, creator: "2" })
      socket.data.userId = "1"
      const emit = vi.spyOn(socket, "emit")
      await getRoomSettings({ io, socket })
      expect(emit).toHaveBeenCalledWith("event", expect.objectContaining({ type: "ERROR" }))
    })
  })

  describe("setPassword", () => {
    test("calls saveRoom with new password", async () => {
      vi.mocked(findRoom).mockResolvedValueOnce({ ...mockRoom, password: "old", creator: "1" })
      socket.data.userId = "1"
      await setPassword({ socket, io }, "newpass")
      expect(saveRoom).toHaveBeenCalledWith({
        context: mockContext,
        room: expect.objectContaining({ password: "newpass" }),
      })
    })
  })

  describe("kickUser", () => {
    test("emits KICKED and NEW_MESSAGE to kicked user", async () => {
      // Provide all fields, and cast as the expected type
      const mockUser = {
        userId: "1",
        username: "testuser",
        isAdmin: false,
        isDj: false,
        isDeputyDj: false,
        status: "participating",
        id: "socketId",
      } as {
        isDj: boolean
        isDeputyDj: boolean
        isAdmin: boolean
        id: string
        userId: string
        username: string
        status: "participating" | "listening"
      }
      vi.mocked(getUser).mockResolvedValueOnce(mockUser)
      const getSpy = vi.fn().mockReturnValue({ disconnect: vi.fn() })
      io.sockets.sockets.get = getSpy
      await kickUser({ io, socket }, mockUser)
      expect(toEmit).toHaveBeenCalledWith("event", expect.objectContaining({ type: "NEW_MESSAGE" }))
      expect(toEmit).toHaveBeenCalledWith("event", expect.objectContaining({ type: "KICKED" }))
      expect(getSpy).toHaveBeenCalledWith("socketId")
    })
  })

  describe("setRoomSettings", () => {
    test("calls saveRoom and emits ROOM_SETTINGS", async () => {
      vi.mocked(findRoom).mockResolvedValueOnce({ ...mockRoom, creator: "1", fetchMeta: false })
      vi.mocked(saveRoom).mockResolvedValueOnce(undefined)
      vi.mocked(findRoom).mockResolvedValueOnce({ ...mockRoom, creator: "1", fetchMeta: false })
      socket.data.userId = "1"
      await setRoomSettings({ io, socket }, { fetchMeta: false })
      expect(saveRoom).toHaveBeenCalled()
      expect(toEmit).toHaveBeenCalledWith(
        "event",
        expect.objectContaining({ type: "ROOM_SETTINGS" }),
      )
    })
  })

  describe("clearPlaylist", () => {
    test("calls clearRoomPlaylist and clearQueue, emits PLAYLIST", async () => {
      vi.mocked(findRoom).mockResolvedValueOnce({ ...mockRoom, creator: "1" })
      socket.data.userId = "1"
      await clearPlaylist({ io, socket })
      expect(clearRoomPlaylist).toHaveBeenCalled()
      expect(clearQueue).toHaveBeenCalled()
      expect(toEmit).toHaveBeenCalledWith("event", expect.objectContaining({ type: "PLAYLIST" }))
    })
  })
})
