import { describe, expect, test, vi, beforeEach } from "vitest"
import { AuthHandlers } from "./authHandlersAdapter"
import { AuthService } from "../services/AuthService"
import { makeSocketWithBroadcastMocks } from "../lib/testHelpers"
import { userFactory } from "@repo/factories"

// Mock dependencies
vi.mock("../services/AuthService")
vi.mock("../lib/sendMessage", () => ({
  default: vi.fn(),
}))

describe("AuthHandlers", () => {
  let mockSocket: any
  let mockIo: any
  let authService: any
  let authHandlers: AuthHandlers
  let toEmit: any
  let toBroadcast: any
  let roomSpy: any
  let broadcastEmit: any

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
    toEmit = socketResult.toEmit
    toBroadcast = socketResult.toBroadcast
    roomSpy = socketResult.roomSpy
    broadcastEmit = socketResult.broadcastEmit
    
    // Add context to socket
    mockSocket.context = { redis: {}, db: {}, adapters: {}, jobs: [] }

    // Mock the AuthService
    authService = {
      checkPassword: vi.fn().mockResolvedValue({
        passwordRequired: true,
        passwordAccepted: true,
      }),
      submitPassword: vi.fn().mockResolvedValue({
        passwordAccepted: true,
        error: null,
      }),
      login: vi.fn().mockResolvedValue({
        userData: {
          userId: "user123",
          username: "Homer",
          socketId: "socket123",
          roomId: "room123",
        },
        newUser: userFactory.build({
          userId: "user123",
          username: "Homer",
        }),
        newUsers: [
          userFactory.build({
            userId: "user123",
            username: "Homer",
          }),
        ],
        initData: {
          users: [],
          messages: [],
          meta: {},
          passwordRequired: true,
          playlist: [],
          reactions: [],
          user: {
            userId: "user123",
            username: "Homer",
            status: "participating",
            isDeputyDj: false,
            isAdmin: false,
          },
          accessToken: undefined, // Only room creators receive tokens
          isNewUser: false,
        },
        error: null,
      }),
      changeUsername: vi.fn().mockResolvedValue({
        success: true,
        newUser: userFactory.build({
          userId: "user123",
          username: "NewName",
        }),
        newUsers: [
          userFactory.build({
            userId: "user123",
            username: "NewName",
          }),
        ],
        systemMessage: {
          content: "Homer transformed into NewName",
          type: "system",
          meta: {
            oldUsername: "Homer",
            userId: "user123",
          },
        },
      }),
      disconnect: vi.fn().mockResolvedValue({
        username: "Homer",
        users: [
          userFactory.build({
            userId: "another-user",
            username: "Marge",
          }),
        ],
      }),
      getUserSpotifyAuth: vi.fn().mockResolvedValue({
        isAuthenticated: true,
        accessToken: "dummy-access-token",
      }),
      logoutSpotifyAuth: vi.fn().mockResolvedValue({
        success: true,
      }),
      nukeUser: vi.fn().mockResolvedValue({
        success: true,
      }),
    }

    authHandlers = new AuthHandlers(authService)
  })

  test("should be defined", () => {
    expect(authHandlers).toBeDefined()
  })

  describe("checkPassword", () => {
    test("calls checkPassword with correct parameters", async () => {
      await authHandlers.checkPassword({ socket: mockSocket, io: mockIo }, "secret")

      expect(authService.checkPassword).toHaveBeenCalledWith("room123", "secret")
    })

    test("emits SET_PASSWORD_REQUIREMENT event with correct data", async () => {
      await authHandlers.checkPassword({ socket: mockSocket, io: mockIo }, "secret")

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "SET_PASSWORD_REQUIREMENT",
        data: {
          passwordRequired: true,
          passwordAccepted: true,
        },
      })
    })
  })

  describe("submitPassword", () => {
    test("calls submitPassword with correct parameters", async () => {
      await authHandlers.submitPassword({ socket: mockSocket, io: mockIo }, "secret", "room123")

      expect(authService.submitPassword).toHaveBeenCalledWith("room123", "secret", "user123")
    })

    test("emits SET_PASSWORD_ACCEPTED event with correct data", async () => {
      await authHandlers.submitPassword({ socket: mockSocket, io: mockIo }, "secret", "room123")

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "SET_PASSWORD_ACCEPTED",
        data: {
          passwordAccepted: true,
        },
      })
    })

    test("emits ERROR event when service returns an error", async () => {
      authService.submitPassword.mockResolvedValueOnce({
        error: {
          message: "Room not found",
          status: 404,
        },
        passwordAccepted: false,
      })

      await authHandlers.submitPassword({ socket: mockSocket, io: mockIo }, "secret", "room123")

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "ERROR",
        data: {
          message: "Room not found",
          status: 404,
        },
      })
    })
  })

  describe("login", () => {
    test("calls login with correct parameters", async () => {
      // Ensure socket has an id
      mockSocket.id = "socket123"

      await authHandlers.login(
        { socket: mockSocket, io: mockIo },
        {
          userId: "user123",
          username: "Homer",
          password: "secret",
          roomId: "room123",
        },
      )

      expect(authService.login).toHaveBeenCalledWith({
        incomingUserId: "user123",
        incomingUsername: "Homer",
        password: "secret",
        roomId: "room123",
        socketId: "socket123",
        sessionUser: undefined, // Session user not set in mock
      })
    })

    test("updates socket data and session on successful login", async () => {
      await authHandlers.login(
        { socket: mockSocket, io: mockIo },
        {
          userId: "user123",
          username: "Homer",
          password: "secret",
          roomId: "room123",
        },
      )

      expect(mockSocket.data.username).toBe("Homer")
      expect(mockSocket.data.userId).toBe("user123")
      expect(mockSocket.data.roomId).toBe("room123")

      expect(mockSocket.request.session.user).toEqual({
        userId: "user123",
        username: "Homer",
        id: mockSocket.id,
      })
      expect(mockSocket.request.session.save).toHaveBeenCalled()
    })

    test("joins the room and emits USER_JOINED event", async () => {
      await authHandlers.login(
        { socket: mockSocket, io: mockIo },
        {
          userId: "user123",
          username: "Homer",
          password: "secret",
          roomId: "room123",
        },
      )

      expect(mockSocket.join).toHaveBeenCalledWith("/rooms/room123")
      expect(roomSpy).toHaveBeenCalledWith("/rooms/room123")
      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "USER_JOINED",
        data: {
          user: expect.objectContaining({
            userId: "user123",
            username: "Homer",
          }),
          users: expect.arrayContaining([
            expect.objectContaining({
              userId: "user123",
              username: "Homer",
            }),
          ]),
        },
      })
    })

    test("emits INIT event with init data", async () => {
      await authHandlers.login(
        { socket: mockSocket, io: mockIo },
        {
          userId: "user123",
          username: "Homer",
          password: "secret",
          roomId: "room123",
        },
      )

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "INIT",
        data: expect.objectContaining({
          users: expect.any(Array),
          user: expect.objectContaining({
            userId: "user123",
            username: "Homer",
          }),
        }),
      })
    })

    test("emits ERROR event when service returns an error", async () => {
      authService.login.mockResolvedValueOnce({
        error: {
          message: "Room not found",
          status: 404,
        },
      })

      await authHandlers.login(
        { socket: mockSocket, io: mockIo },
        {
          userId: "user123",
          username: "Homer",
          password: "secret",
          roomId: "room123",
        },
      )

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "ERROR",
        data: {
          message: "Room not found",
          status: 404,
        },
      })
    })

    test("emits UNAUTHORIZED event when login fails due to incorrect password", async () => {
      authService.login.mockResolvedValueOnce({
        error: {
          message: "Password is incorrect",
          status: 401,
        },
      })

      await authHandlers.login(
        { socket: mockSocket, io: mockIo },
        {
          userId: "user123",
          username: "Homer",
          password: "wrong-password",
          roomId: "room123",
        },
      )

      expect(mockSocket.emit).toHaveBeenCalledWith("event", {
        type: "UNAUTHORIZED",
      })
    })
  })

  describe("changeUsername", () => {
    test("calls changeUsername with correct parameters", async () => {
      await authHandlers.changeUsername(
        { socket: mockSocket, io: mockIo },
        { userId: "user123", username: "NewName" },
      )

      expect(authService.changeUsername).toHaveBeenCalledWith("user123", "NewName", "room123")
    })

    test("updates session and emits USER_JOINED event on success", async () => {
      await authHandlers.changeUsername(
        { socket: mockSocket, io: mockIo },
        { userId: "user123", username: "NewName" },
      )

      expect(mockSocket.request.session.user).toEqual(
        expect.objectContaining({
          userId: "user123",
          username: "NewName",
        }),
      )
      expect(mockSocket.request.session.save).toHaveBeenCalled()

      expect(roomSpy).toHaveBeenCalledWith("/rooms/room123")
      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "USER_JOINED",
        data: {
          user: expect.objectContaining({
            userId: "user123",
            username: "NewName",
          }),
          users: expect.arrayContaining([
            expect.objectContaining({
              userId: "user123",
              username: "NewName",
            }),
          ]),
        },
      })
    })

    test("sends system message when provided", async () => {
      const sendMessage = await import("../lib/sendMessage").then((mod) => mod.default)

      await authHandlers.changeUsername(
        { socket: mockSocket, io: mockIo },
        { userId: "user123", username: "NewName" },
      )

      expect(sendMessage).toHaveBeenCalledWith(mockIo, "room123", {
        content: "Homer transformed into NewName",
        type: "system",
        meta: {
          oldUsername: "Homer",
          userId: "user123",
        },
      }, expect.any(Object))
    })
  })

  describe("disconnect", () => {
    test("calls disconnect with correct parameters", async () => {
      await authHandlers.disconnect({ socket: mockSocket, io: mockIo })

      expect(authService.disconnect).toHaveBeenCalledWith("room123", "user123", "Homer")
    })

    test("leaves the room and emits USER_LEFT event", async () => {
      await authHandlers.disconnect({ socket: mockSocket, io: mockIo })

      expect(mockSocket.leave).toHaveBeenCalledWith("/rooms/room123")
      expect(roomSpy).toHaveBeenCalledWith("/rooms/room123")
      expect(broadcastEmit).toHaveBeenCalledWith("event", {
        type: "USER_LEFT",
        data: {
          user: { username: "Homer" },
          users: expect.arrayContaining([
            expect.objectContaining({
              userId: "another-user",
              username: "Marge",
            }),
          ]),
        },
      })
    })
  })

  describe("getUserSpotifyAuth", () => {
    test("calls getUserSpotifyAuth with correct parameters", async () => {
      await authHandlers.getUserSpotifyAuth(
        { socket: mockSocket, io: mockIo },
        { userId: "user123" },
      )

      expect(authService.getUserSpotifyAuth).toHaveBeenCalledWith("user123")
    })

    test("uses socket userId when none provided", async () => {
      await authHandlers.getUserSpotifyAuth(
        { socket: mockSocket, io: mockIo },
        { userId: undefined },
      )

      expect(authService.getUserSpotifyAuth).toHaveBeenCalledWith("user123")
    })

    test("emits SPOTIFY_AUTHENTICATION_STATUS event", async () => {
      await authHandlers.getUserSpotifyAuth(
        { socket: mockSocket, io: mockIo },
        { userId: "user123" },
      )

      expect(mockIo.to).toHaveBeenCalledWith(mockSocket.id)
      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "SPOTIFY_AUTHENTICATION_STATUS",
        data: {
          isAuthenticated: true,
          accessToken: "dummy-access-token", // From mock service
        },
      })
    })
  })

  describe("nukeUser", () => {
    test("calls nukeUser with correct parameters", async () => {
      await authHandlers.nukeUser({ socket: mockSocket, io: mockIo })

      expect(authService.nukeUser).toHaveBeenCalledWith("user123")
    })

    test("emits SESSION_ENDED event and destroys session", async () => {
      await authHandlers.nukeUser({ socket: mockSocket, io: mockIo })

      expect(mockSocket.emit).toHaveBeenCalledWith("SESSION_ENDED")
      expect(mockSocket.request.session.destroy).toHaveBeenCalled()
    })
  })
})
