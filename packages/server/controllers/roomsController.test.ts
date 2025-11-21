import { create } from "../controllers/roomsController"
import { checkUserChallenge } from "../operations/userChallenge"
import { saveRoom } from "../operations/data"
import { vi, describe, it, expect, beforeEach } from "vitest"
import { appContextFactory } from "@repo/factories"
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
})
