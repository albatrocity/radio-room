import { create, findRooms, deleteRoom } from "../controllers/roomsController"
import { checkUserChallenge } from "../operations/userChallenge"
import { saveRoom } from "../operations/data"
import * as scheduling from "../services/SchedulingService"
import { vi, describe, it, expect, beforeEach } from "vitest"
import { appContextFactory, platformUserFactory } from "@repo/factories"
import { Request, Response } from "express"

const mockCheckUserChallenge = vi.hoisted(() => vi.fn())

vi.mock("../operations/userChallenge", () => ({
  checkUserChallenge: mockCheckUserChallenge,
}))
vi.mock("../operations/createRoom", async (importOriginal) => {
  const mod = await importOriginal<object>()
  return {
    ...mod,
    createRoomId: vi.fn(() => "roomId"),
    persistRoom: vi.fn(),
  }
})
vi.mock("../operations/data")
vi.mock("../services/SchedulingService", () => ({
  findShowById: vi.fn(),
}))

describe("create", () => {
  let mockContext: any
  let mockRequest: Partial<Request>
  let mockResponse: Partial<Response>

  beforeEach(() => {
    mockContext = appContextFactory.build()
    vi.clearAllMocks()

    // Create mock request
    mockRequest = {
      body: {},
      context: mockContext,
    } as any

    // Create mock response
    mockResponse = {
      statusCode: 200,
      send: vi.fn(),
      status: vi.fn().mockReturnThis(),
    } as any
  })

  it("should check user challenge", async () => {
    mockRequest.body = {
      challenge: "challenge",
      userId: "userId",
      title: "Green Room",
      type: "jukebox",
    }

    await create(mockRequest as Request, mockResponse as Response)
    
    expect(checkUserChallenge).toHaveBeenCalledWith({
      challenge: "challenge",
      userId: "userId",
      context: mockContext,
    })
  })

  it("return 401 if challenge doesn't match", async () => {
    mockRequest.body = {
      challenge: "challenge",
      userId: "userId",
      title: "Green Room",
      type: "jukebox",
    }

    mockCheckUserChallenge.mockRejectedValue("Unauthorized")

    await create(mockRequest as Request, mockResponse as Response)
    
    expect(mockResponse.statusCode).toBe(401)
  })

  it("writes to redis", async () => {
    mockRequest.body = {
      challenge: "challenge",
      userId: "userId",
      title: "Green Room",
      type: "jukebox",
    }

    mockCheckUserChallenge.mockResolvedValue(1)

    await create(mockRequest as Request, mockResponse as Response)
    
    expect(saveRoom).toHaveBeenCalledWith({
      context: mockContext,
      room: expect.objectContaining({
        title: "Green Room",
        creator: "userId",
        type: "jukebox",
      }),
    })
  })

  it("persists showId when show is ready", async () => {
    vi.mocked(scheduling.findShowById).mockResolvedValue({
      id: "show-1",
      status: "ready",
    } as any)

    mockRequest.body = {
      challenge: "challenge",
      userId: "userId",
      title: "Green Room",
      type: "jukebox",
      showId: "show-1",
    }
    mockCheckUserChallenge.mockResolvedValue(1)

    await create(mockRequest as Request, mockResponse as Response)

    expect(saveRoom).toHaveBeenCalledWith({
      context: mockContext,
      room: expect.objectContaining({
        showId: "show-1",
      }),
    })
  })

  it("rejects showId when show is not ready", async () => {
    vi.mocked(scheduling.findShowById).mockResolvedValue({
      id: "show-1",
      status: "published",
    } as any)

    mockRequest.body = {
      challenge: "challenge",
      userId: "userId",
      title: "Green Room",
      type: "jukebox",
      showId: "show-1",
    }
    mockCheckUserChallenge.mockResolvedValue(1)

    await create(mockRequest as Request, mockResponse as Response)

    expect(mockResponse.statusCode).toBe(400)
    expect(saveRoom).not.toHaveBeenCalled()
  })
})

describe("admin-gated routes", () => {
  let mockContext: any
  let mockResponse: Partial<Response>

  beforeEach(() => {
    mockContext = appContextFactory.build()
    vi.clearAllMocks()
    mockResponse = {
      statusCode: 200,
      send: vi.fn(),
      status: vi.fn().mockReturnThis(),
    } as any
  })

  describe("create (POST /rooms) with admin gate", () => {
    it("proceeds with room creation when platformUser is present", async () => {
      const platformUser = platformUserFactory.build()
      const mockRequest = {
        body: {
          challenge: "challenge",
          userId: "userId",
          title: "Admin Room",
          type: "jukebox",
        },
        context: mockContext,
        platformUser,
      } as any

      mockCheckUserChallenge.mockResolvedValue(1)
      await create(mockRequest as Request, mockResponse as Response)
      expect(saveRoom).toHaveBeenCalled()
    })
  })

  describe("findRooms (GET /rooms) with admin gate", () => {
    it("returns 401 when session user is missing", async () => {
      const mockRequest = {
        context: mockContext,
        session: {},
      } as any

      await findRooms(mockRequest as Request, mockResponse as Response)
      expect(mockResponse.status).toHaveBeenCalledWith(401)
    })

    it("returns rooms when session user exists", async () => {
      const { getAllRooms } = await import("../operations/data")
      ;(getAllRooms as any).mockResolvedValue([])

      const mockRequest = {
        context: mockContext,
        session: { user: { userId: "admin-user-1" } },
        platformUser: platformUserFactory.build(),
      } as any

      await findRooms(mockRequest as Request, mockResponse as Response)
      expect(mockResponse.status).toHaveBeenCalledWith(200)
    })
  })

  describe("deleteRoom (DELETE /rooms/:id) with admin gate", () => {
    it("returns 400 when no room id provided", async () => {
      const mockRequest = {
        context: mockContext,
        params: {},
        session: { user: { userId: "admin-user-1" } },
        platformUser: platformUserFactory.build(),
      } as any

      await deleteRoom(mockRequest as Request, mockResponse as Response)
      expect(mockRequest.context).toBeDefined()
      expect(mockResponse.statusCode).toBe(400)
    })

    it("returns 401 when room creator does not match session user", async () => {
      const { findRoom: findRoomData } = await import("../operations/data")
      ;(findRoomData as any).mockResolvedValue({ id: "room1", creator: "other-user" })

      const mockRequest = {
        context: mockContext,
        params: { id: "room1" },
        session: { user: { userId: "admin-user-1" } },
        platformUser: platformUserFactory.build(),
      } as any

      await deleteRoom(mockRequest as Request, mockResponse as Response)
      expect(mockResponse.statusCode).toBe(401)
    })
  })
})
