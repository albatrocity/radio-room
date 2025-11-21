import { describe, expect, test, vi, beforeEach } from "vitest"
import { AuthService } from "./AuthService"
import { Room } from "@repo/types/Room"
import { roomFactory, userFactory } from "@repo/factories"
import {
  findRoom,
  getUser,
  updateUserAttributes,
  removeOnlineUser,
  nukeUserRooms,
  getUserRooms,
  deleteUser,
  expireUserIn,
  getRoomUsers,
  isDj,
  addDj,
} from "../operations/data"
import systemMessage from "../lib/systemMessage"

// Mock the operations that interact with Redis
vi.mock("../operations/data")

// Mock library functions
vi.mock("../lib/generateId", () => ({
  default: vi.fn().mockReturnValue("generated-id"),
}))

vi.mock("../lib/generateAnonName", () => ({
  default: vi.fn().mockReturnValue("anon-user"),
}))

vi.mock("../lib/systemMessage", () => ({
  default: vi.fn().mockImplementation((content, meta) => ({
    content,
    type: "system",
    meta,
  })),
}))

describe("AuthService", () => {
  let authService: AuthService
  let mockContext: any
  let mockRoom: Room

  beforeEach(() => {
    vi.resetAllMocks()

    mockContext = {
      redis: {
        pubClient: {},
        subClient: {},
      },
    }

    mockRoom = roomFactory.build({
      id: "room123",
      title: "Test Room",
      creator: "admin123",
      password: "secret",
    })

    authService = new AuthService(mockContext)
  })

  test("should be defined", () => {
    expect(authService).toBeDefined()
  })

  describe("passwordMatched", () => {
    test("returns true for room creator", () => {
      const result = authService.passwordMatched(mockRoom, "wrong-password", "admin123")
      expect(result).toBe(true)
    })

    test("returns true for correct password", () => {
      const result = authService.passwordMatched(mockRoom, "secret", "user123")
      expect(result).toBe(true)
    })

    test("returns false for incorrect password", () => {
      const result = authService.passwordMatched(mockRoom, "wrong-password", "user123")
      expect(result).toBe(false)
    })

    test("returns true if room has no password", () => {
      const noPasswordRoom = { ...mockRoom, password: "" }
      const result = authService.passwordMatched(noPasswordRoom, "", "user123")
      expect(result).toBe(true)
    })
  })

  describe("checkPassword", () => {
    test("returns passwordRequired=true and passwordAccepted=true for correct password", async () => {
      vi.mocked(findRoom).mockResolvedValueOnce(mockRoom)

      const result = await authService.checkPassword("room123", "secret")

      expect(result).toEqual({
        passwordRequired: true,
        passwordAccepted: true,
      })
    })

    test("returns passwordRequired=true and passwordAccepted=false for incorrect password", async () => {
      vi.mocked(findRoom).mockResolvedValueOnce(mockRoom)

      const result = await authService.checkPassword("room123", "wrong-password")

      expect(result).toEqual({
        passwordRequired: true,
        passwordAccepted: false,
      })
    })

    test("returns passwordRequired=false when room has no password", async () => {
      vi.mocked(findRoom).mockResolvedValueOnce(roomFactory.build({ password: "" }))

      const result = await authService.checkPassword("room123", "")

      expect(result).toEqual({
        passwordRequired: false,
        passwordAccepted: true,
      })
    })
  })

  describe("submitPassword", () => {
    test("returns error when room not found", async () => {
      vi.mocked(findRoom).mockResolvedValueOnce(null)

      const result = await authService.submitPassword("room123", "secret", "user123")

      expect(result).toEqual({
        error: {
          message: "Room not found",
          status: 404,
        },
        passwordAccepted: false,
      })
    })

    test("returns passwordAccepted=true for correct password", async () => {
      vi.mocked(findRoom).mockResolvedValueOnce(mockRoom)

      const result = await authService.submitPassword("room123", "secret", "user123")

      expect(result).toEqual({
        passwordAccepted: true,
        error: null,
      })
    })

    test("returns passwordAccepted=true for room creator regardless of password", async () => {
      vi.mocked(findRoom).mockResolvedValueOnce(mockRoom)

      const result = await authService.submitPassword("room123", "wrong-password", "admin123")

      expect(result).toEqual({
        passwordAccepted: true,
        error: null,
      })
    })
  })

  describe("login", () => {
    test("returns error when room not found", async () => {
      vi.mocked(findRoom).mockResolvedValueOnce(null)

      const result = await authService.login({
        incomingUserId: "user123",
        incomingUsername: "Homer",
        password: "secret",
        roomId: "room123",
        socketId: "socket123",
        sessionUser: undefined,
      })

      expect(result).toEqual({
        error: {
          message: "Room not found",
          status: 404,
        },
      })
    })

    test("returns error when password is incorrect", async () => {
      vi.mocked(findRoom).mockResolvedValueOnce(mockRoom)

      const result = await authService.login({
        incomingUserId: "user123",
        incomingUsername: "Homer",
        password: "wrong-password",
        roomId: "room123",
        socketId: "socket123",
        sessionUser: undefined,
      })

      expect(result).toEqual({
        error: {
          message: "Password is incorrect",
          status: 401,
        },
      })
    })

    test("returns user data and init data for successful login", async () => {
      vi.mocked(findRoom).mockResolvedValueOnce(mockRoom)

      vi.mocked(getUser).mockResolvedValueOnce(
        userFactory.build({
          userId: "user123",
          username: "Homer",
        }),
      )

      const result = await authService.login({
        incomingUserId: "user123",
        incomingUsername: "Homer",
        password: "secret",
        roomId: "room123",
        socketId: "socket123",
        sessionUser: undefined,
      })

      expect(result.error).toBeNull()
      expect(result.userData).toEqual({
        userId: "user123",
        username: "Homer",
        socketId: "socket123",
        roomId: "room123",
      })
      expect(result.newUser).toBeDefined()
      expect(result.newUsers).toBeDefined()
      expect(result.initData).toBeDefined()
    })

    test("auto-deputizes user when deputizeOnJoin is true", async () => {
      const roomWithAutoDeputize = roomFactory.build({
        ...mockRoom,
        deputizeOnJoin: true,
      })
      vi.mocked(findRoom).mockResolvedValueOnce(roomWithAutoDeputize)
      vi.mocked(getUser).mockResolvedValueOnce(
        userFactory.build({
          userId: "user123",
          username: "Homer",
        }),
      )
      vi.mocked(isDj).mockResolvedValueOnce(false)

      const result = await authService.login({
        incomingUserId: "user123",
        incomingUsername: "Homer",
        password: "secret",
        roomId: "room123",
        socketId: "socket123",
        sessionUser: undefined,
      })

      expect(result.error).toBeNull()
      expect(result.newUser?.isDeputyDj).toBe(true)
      expect(addDj).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room123",
        userId: "user123",
      })
    })

    test("preserves manually deputized status when deputizeOnJoin is false", async () => {
      const roomWithoutAutoDeputize = roomFactory.build({
        ...mockRoom,
        deputizeOnJoin: false,
      })
      vi.mocked(findRoom).mockResolvedValueOnce(roomWithoutAutoDeputize)
      vi.mocked(getUser).mockResolvedValueOnce(
        userFactory.build({
          userId: "user123",
          username: "Homer",
        }),
      )
      // User was previously manually deputized
      vi.mocked(isDj).mockResolvedValueOnce(true)

      const result = await authService.login({
        incomingUserId: "user123",
        incomingUsername: "Homer",
        password: "secret",
        roomId: "room123",
        socketId: "socket123",
        sessionUser: undefined,
      })

      expect(result.error).toBeNull()
      expect(result.newUser?.isDeputyDj).toBe(true)
      expect(addDj).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room123",
        userId: "user123",
      })
    })

    test("does not deputize user when deputizeOnJoin is false and user was not manually deputized", async () => {
      const roomWithoutAutoDeputize = roomFactory.build({
        ...mockRoom,
        deputizeOnJoin: false,
      })
      vi.mocked(findRoom).mockResolvedValueOnce(roomWithoutAutoDeputize)
      vi.mocked(getUser).mockResolvedValueOnce(
        userFactory.build({
          userId: "user123",
          username: "Homer",
        }),
      )
      // User was not manually deputized
      vi.mocked(isDj).mockResolvedValueOnce(false)

      const result = await authService.login({
        incomingUserId: "user123",
        incomingUsername: "Homer",
        password: "secret",
        roomId: "room123",
        socketId: "socket123",
        sessionUser: undefined,
      })

      expect(result.error).toBeNull()
      expect(result.newUser?.isDeputyDj).toBe(false)
      expect(addDj).not.toHaveBeenCalled()
    })
  })

  describe("changeUsername", () => {
    test("returns success=false when user not found", async () => {
      vi.mocked(getUser).mockResolvedValueOnce(null)

      const result = await authService.changeUsername("user123", "NewName", "room123")

      expect(result).toEqual({ success: false })
    })

    test("returns success=false when updateUserAttributes fails", async () => {
      vi.mocked(getUser).mockResolvedValueOnce(
        userFactory.build({
          userId: "user123",
          username: "Homer",
        }),
      )

      vi.mocked(updateUserAttributes).mockResolvedValueOnce({
        users: [],
        user: null,
      })

      const result = await authService.changeUsername("user123", "NewName", "room123")

      expect(result).toEqual({ success: false })
    })

    test("returns updated user info on successful username change", async () => {
      vi.mocked(getUser).mockResolvedValueOnce(
        userFactory.build({
          userId: "user123",
          username: "Homer",
        }),
      )

      vi.mocked(findRoom).mockResolvedValueOnce({
        ...mockRoom,
        announceUsernameChanges: true,
      })

      const updatedUser = userFactory.build({
        userId: "user123",
        username: "NewName",
      })

      vi.mocked(updateUserAttributes).mockResolvedValueOnce({
        users: [updatedUser],
        user: updatedUser,
      })

      // Ensure systemMessage returns a value
      vi.mocked(systemMessage).mockReturnValueOnce({
        content: "Homer transformed into NewName",
        user: {
          id: "system",
          userId: "system",
          username: "System",
        },
        mentions: [],
        timestamp: new Date().toISOString(),
        meta: {
          oldUsername: "Homer",
          userId: "user123",
        },
      })

      const result = await authService.changeUsername("user123", "NewName", "room123")

      expect(result.success).toBe(true)
      expect(result.newUser).toEqual(updatedUser)
      expect(result.newUsers).toEqual([updatedUser])
      expect(result.systemMessage).toBeDefined()
    })
  })

  describe("disconnect", () => {
    test("calls the necessary operations and returns user data", async () => {
      const updatedUsers = [userFactory.build()]
      vi.mocked(getRoomUsers).mockResolvedValueOnce(updatedUsers)
      vi.mocked(getUserRooms).mockResolvedValueOnce([])

      const result = await authService.disconnect("room123", "user123", "Homer")

      expect(removeOnlineUser).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room123",
        userId: "user123",
      })

      expect(expireUserIn).toHaveBeenCalled()

      expect(result).toEqual({
        username: "Homer",
        users: updatedUsers,
      })
    })
  })

  describe("nukeUser", () => {
    test("calls the necessary operations to delete user data", async () => {
      const result = await authService.nukeUser("user123")

      expect(nukeUserRooms).toHaveBeenCalledWith({
        context: mockContext,
        userId: "user123",
      })

      expect(deleteUser).toHaveBeenCalledWith({
        context: mockContext,
        userId: "user123",
      })

      expect(result).toEqual({ success: true })
    })
  })
})
