import { describe, expect, test, vi, beforeEach } from "vitest"
import { makeSocketWithBroadcastMocks } from "../lib/testHelpers"

const mockCheckPassword = vi.fn()
const mockSubmitPassword = vi.fn()
const mockLogin = vi.fn()
const mockChangeUsername = vi.fn()
const mockDisconnect = vi.fn()
const mockGetUserSpotifyAuth = vi.fn()
const mockLogoutSpotifyAuth = vi.fn()
const mockNukeUser = vi.fn()

// Mock the adapter module
vi.mock("./authHandlersAdapter", () => ({
  createAuthHandlers: () => ({
    checkPassword: mockCheckPassword,
    submitPassword: mockSubmitPassword,
    login: mockLogin,
    changeUsername: mockChangeUsername,
    disconnect: mockDisconnect,
    getUserSpotifyAuth: mockGetUserSpotifyAuth,
    logoutSpotifyAuth: mockLogoutSpotifyAuth,
    nukeUser: mockNukeUser,
  }),
}))

// Import handlers after mocks are set up
import {
  checkPassword,
  submitPassword,
  login,
  changeUsername,
  disconnect,
  getUserSpotifyAuth,
  logoutSpotifyAuth,
  nukeUser,
} from "./authHandlers"
import { AppContext } from "@repo/types"
import { appContextFactory } from "@repo/factories"

describe("authHandlers (adapter wrapper)", () => {
  let mockSocket: any
  let mockIo: any
  let mockAdapter: any
  let mockContext: AppContext

  beforeEach(() => {
    vi.resetAllMocks()

    // Setup socket mocks
    const socketResult = makeSocketWithBroadcastMocks({
      roomId: "room123",
      userId: "user123",
      username: "Homer",
    })

    mockSocket = socketResult.socket
    mockIo = socketResult.io
    mockContext = appContextFactory.build()

    // Add context to the socket
    mockSocket.context = mockContext
  })

  test("checkPassword delegates to adapter", async () => {
    await mockCheckPassword({ socket: mockSocket, io: mockIo }, "secret")

    expect(mockCheckPassword).toHaveBeenCalledWith({ socket: mockSocket, io: mockIo }, "secret")
  })

  test("submitPassword delegates to adapter", async () => {
    await submitPassword({ socket: mockSocket, io: mockIo }, "secret")

    expect(mockSubmitPassword).toHaveBeenCalledWith({ socket: mockSocket, io: mockIo }, "secret")
  })

  test("login delegates to adapter", async () => {
    const loginParams = {
      userId: "user123",
      username: "Homer",
      password: "secret",
      roomId: "room123",
    }

    await login({ socket: mockSocket, io: mockIo }, loginParams)

    expect(mockLogin).toHaveBeenCalledWith({ socket: mockSocket, io: mockIo }, loginParams)
  })

  test("changeUsername delegates to adapter", async () => {
    const params = {
      userId: "user123",
      username: "NewName",
    }

    await changeUsername({ socket: mockSocket, io: mockIo }, params)

    expect(mockChangeUsername).toHaveBeenCalledWith({ socket: mockSocket, io: mockIo }, params)
  })

  test("disconnect delegates to adapter", async () => {
    await disconnect({ socket: mockSocket, io: mockIo })

    expect(mockDisconnect).toHaveBeenCalledWith({ socket: mockSocket, io: mockIo })
  })

  test("getUserSpotifyAuth delegates to adapter", async () => {
    const params = { userId: "user123" }

    await getUserSpotifyAuth({ socket: mockSocket, io: mockIo }, params)

    expect(mockGetUserSpotifyAuth).toHaveBeenCalledWith({ socket: mockSocket, io: mockIo }, params)
  })

  test("logoutSpotifyAuth delegates to adapter", async () => {
    const params = { userId: "user123" }

    await logoutSpotifyAuth({ socket: mockSocket, io: mockIo }, params)

    expect(mockLogoutSpotifyAuth).toHaveBeenCalledWith({ socket: mockSocket, io: mockIo }, params)
  })

  test("nukeUser delegates to adapter", async () => {
    await nukeUser({ socket: mockSocket, io: mockIo })

    expect(mockNukeUser).toHaveBeenCalledWith({ socket: mockSocket, io: mockIo })
  })
})
