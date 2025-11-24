import { describe, test, expect, vi, beforeEach } from "vitest"
import { makeSocketWithBroadcastMocks } from "../lib/testHelpers"
import { User } from "@repo/types/User"
import { Room } from "@repo/types/Room"
import { userFactory } from "@repo/factories"

// Define mocks at the top level
const mockGetRoomSettings = vi.fn()
const mockSetPassword = vi.fn()
const mockKickUser = vi.fn()
const mockSetRoomSettings = vi.fn()
const mockClearPlaylist = vi.fn()

// Mock the adapter's createAdminHandlers function
vi.mock("./adminHandlersAdapter", () => ({
  createAdminHandlers: () => ({
    getRoomSettings: mockGetRoomSettings,
    setPassword: mockSetPassword,
    kickUser: mockKickUser,
    setRoomSettings: mockSetRoomSettings,
    clearPlaylist: mockClearPlaylist,
  }),
}))

// Import after mocking
import {
  getRoomSettings,
  setPassword,
  kickUser,
  setRoomSettings,
  clearPlaylist,
} from "./adminHandlers"

describe("adminHandlers", () => {
  let mockSocket: any, mockIo: any, mockContext: any

  beforeEach(() => {
    vi.resetAllMocks()

    // Setup socket mocks with context
    const socketResult = makeSocketWithBroadcastMocks({
      roomId: "room123",
      userId: "admin123",
      username: "Admin",
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

  test("setPassword delegates to adapter", async () => {
    await setPassword({ socket: mockSocket, io: mockIo }, "newpassword")

    expect(mockSetPassword).toHaveBeenCalledWith({ socket: mockSocket, io: mockIo }, "newpassword")
  })

  test("kickUser delegates to adapter", async () => {
    const userToKick = userFactory.build({
      userId: "user123",
      username: "Homer",
    })

    await kickUser({ socket: mockSocket, io: mockIo }, userToKick as User)

    expect(mockKickUser).toHaveBeenCalledWith({ socket: mockSocket, io: mockIo }, userToKick)
  })

  test("setRoomSettings delegates to adapter", async () => {
    const newSettings = { fetchMeta: true } as Partial<Room>

    await setRoomSettings({ socket: mockSocket, io: mockIo }, newSettings)

    expect(mockSetRoomSettings).toHaveBeenCalledWith(
      { socket: mockSocket, io: mockIo },
      newSettings,
    )
  })

  test("clearPlaylist delegates to adapter", async () => {
    await clearPlaylist({ socket: mockSocket, io: mockIo })

    expect(mockClearPlaylist).toHaveBeenCalledWith({ socket: mockSocket, io: mockIo })
  })
})
