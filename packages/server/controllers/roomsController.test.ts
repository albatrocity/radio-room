import { create, findRooms, deleteRoom } from "../controllers/roomsController"
import { saveRoom } from "../operations/data"
import * as scheduling from "../services/SchedulingService"
import { vi, describe, it, expect, beforeEach } from "vitest"
import { appContextFactory, platformUserFactory } from "@repo/factories"
import { Request, Response } from "express"

const mockEnsureCreatorSpotifyAuth = vi.hoisted(() => vi.fn().mockResolvedValue(false))

vi.mock("../operations/createRoom", async (importOriginal) => {
  const mod = await importOriginal<object>()
  return {
    ...mod,
    createRoomId: vi.fn(() => "roomId"),
    persistRoom: vi.fn(),
  }
})
vi.mock("../operations/data")
vi.mock("../operations/ensureCreatorSpotifyAuth", () => ({
  ensureCreatorSpotifyAuth: mockEnsureCreatorSpotifyAuth,
}))
vi.mock("../services/SchedulingService", () => ({
  findShowById: vi.fn(),
  syncShowRoomPointer: vi.fn().mockResolvedValue(undefined),
}))

describe("create", () => {
  let mockContext: any
  let mockRequest: Partial<Request>
  let mockResponse: Partial<Response>
  let platformUser: ReturnType<typeof platformUserFactory.build>

  beforeEach(() => {
    mockContext = appContextFactory.build()
    platformUser = platformUserFactory.build()
    vi.clearAllMocks()
    mockEnsureCreatorSpotifyAuth.mockResolvedValue(false)

    mockRequest = {
      body: {},
      context: mockContext,
      platformUser,
    } as any

    mockResponse = {
      statusCode: 200,
      send: vi.fn(),
      status: vi.fn().mockReturnThis(),
    } as any
  })

  it("returns 401 when platformUser is missing", async () => {
    mockRequest = {
      body: {
        title: "Green Room",
        type: "jukebox",
      },
      context: mockContext,
    } as any

    await create(mockRequest as Request, mockResponse as Response)

    expect(mockResponse.statusCode).toBe(401)
    expect(saveRoom).not.toHaveBeenCalled()
  })

  it("writes to redis with platformUser.id as creator", async () => {
    mockRequest.body = {
      title: "Green Room",
      type: "jukebox",
    }

    await create(mockRequest as Request, mockResponse as Response)

    expect(mockEnsureCreatorSpotifyAuth).toHaveBeenCalledWith({
      context: mockContext,
      creatorUserId: platformUser.id,
      sessionUserId: undefined,
    })
    expect(saveRoom).toHaveBeenCalledWith({
      context: mockContext,
      room: expect.objectContaining({
        title: "Green Room",
        creator: platformUser.id,
        type: "jukebox",
      }),
    })
    expect(mockResponse.send).toHaveBeenCalledWith({
      room: expect.objectContaining({ creator: platformUser.id }),
      spotifyLinked: false,
    })
  })

  it("creates a live room with rtmp media source", async () => {
    mockRequest.body = {
      title: "Live Room",
      type: "live",
    }

    await create(mockRequest as Request, mockResponse as Response)

    expect(saveRoom).toHaveBeenCalledWith({
      context: mockContext,
      room: expect.objectContaining({
        title: "Live Room",
        creator: platformUser.id,
        type: "live",
        mediaSourceId: "rtmp",
      }),
    })
  })

  it("persists showId when show is ready", async () => {
    vi.mocked(scheduling.findShowById).mockResolvedValue({
      id: "show-1",
      status: "ready",
    } as any)

    mockRequest.body = {
      title: "Green Room",
      type: "jukebox",
      showId: "show-1",
    }

    await create(mockRequest as Request, mockResponse as Response)

    expect(saveRoom).toHaveBeenCalledWith({
      context: mockContext,
      room: expect.objectContaining({
        showId: "show-1",
        creator: platformUser.id,
      }),
    })
  })

  it("rejects showId when show is not ready", async () => {
    vi.mocked(scheduling.findShowById).mockResolvedValue({
      id: "show-1",
      status: "published",
    } as any)

    mockRequest.body = {
      title: "Green Room",
      type: "jukebox",
      showId: "show-1",
    }

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
          title: "Admin Room",
          type: "jukebox",
        },
        context: mockContext,
        platformUser,
      } as any

      await create(mockRequest as Request, mockResponse as Response)
      expect(saveRoom).toHaveBeenCalledWith({
        context: mockContext,
        room: expect.objectContaining({
          creator: platformUser.id,
          title: "Admin Room",
        }),
      })
    })
  })

  describe("findRooms (GET /rooms) with admin gate", () => {
    it("returns 401 when platformUser is missing", async () => {
      const mockRequest = {
        context: mockContext,
      } as any

      await findRooms(mockRequest as Request, mockResponse as Response)
      expect(mockResponse.status).toHaveBeenCalledWith(401)
    })

    it("returns rooms created by platformUser", async () => {
      const platformUser = platformUserFactory.build()
      const { getAllRooms, parseRoom, removeSensitiveRoomAttributes } = await import(
        "../operations/data"
      )
      ;(getAllRooms as any).mockResolvedValue([
        { id: "mine", creator: platformUser.id, title: "Mine" },
        { id: "other", creator: "someone-else", title: "Other" },
      ])
      ;(parseRoom as any).mockImplementation((r: unknown) => r)
      ;(removeSensitiveRoomAttributes as any).mockImplementation((r: unknown) => r)

      const mockRequest = {
        context: mockContext,
        platformUser,
      } as any

      await findRooms(mockRequest as Request, mockResponse as Response)
      expect(mockResponse.status).toHaveBeenCalledWith(200)
      expect(mockResponse.send).toHaveBeenCalledWith({
        rooms: [{ id: "mine", creator: platformUser.id, title: "Mine" }],
      })
    })
  })

  describe("deleteRoom (DELETE /rooms/:id) with admin gate", () => {
    it("returns 400 when no room id provided", async () => {
      const mockRequest = {
        context: mockContext,
        params: {},
        platformUser: platformUserFactory.build(),
      } as any

      await deleteRoom(mockRequest as Request, mockResponse as Response)
      expect(mockResponse.statusCode).toBe(400)
    })

    it("returns 401 when room creator does not match platformUser", async () => {
      const { findRoom: findRoomData } = await import("../operations/data")
      ;(findRoomData as any).mockResolvedValue({ id: "room1", creator: "other-user" })

      const mockRequest = {
        context: mockContext,
        params: { id: "room1" },
        platformUser: platformUserFactory.build(),
      } as any

      await deleteRoom(mockRequest as Request, mockResponse as Response)
      expect(mockResponse.statusCode).toBe(401)
    })

    it("deletes when room creator matches platformUser", async () => {
      const platformUser = platformUserFactory.build()
      const { findRoom: findRoomData, deleteRoom: deleteRoomData } = await import(
        "../operations/data"
      )
      ;(findRoomData as any).mockResolvedValue({ id: "room1", creator: platformUser.id })
      ;(deleteRoomData as any).mockResolvedValue(undefined)

      const mockRequest = {
        context: mockContext,
        params: { id: "room1" },
        platformUser,
      } as any

      await deleteRoom(mockRequest as Request, mockResponse as Response)
      expect(deleteRoomData).toHaveBeenCalledWith({
        context: mockContext,
        roomId: "room1",
      })
      expect(mockResponse.send).toHaveBeenCalledWith({
        success: true,
        roomId: "room1",
      })
    })
  })
})
