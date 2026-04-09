import { describe, it, expect, vi, beforeEach } from "vitest"
import { Request, Response } from "express"
import { appContextFactory } from "@repo/factories"

const mockFindRoom = vi.hoisted(() => vi.fn())
const mockStoreImage = vi.hoisted(() => vi.fn())
const mockGetUser = vi.hoisted(() => vi.fn())
const mockGetRoomUsers = vi.hoisted(() => vi.fn())
const mockIsRoomAdmin = vi.hoisted(() => vi.fn())

vi.mock("../operations/data", () => ({
  findRoom: mockFindRoom,
  storeImage: mockStoreImage,
  getUser: mockGetUser,
  getRoomUsers: mockGetRoomUsers,
}))

vi.mock("../operations/data/admins", () => ({
  isRoomAdmin: mockIsRoomAdmin,
}))

import { RADIO_SESSION_HEADER } from "../lib/constants"
import { uploadImages } from "./imageController"

function mockPngFile(): Express.Multer.File {
  return {
    fieldname: "images",
    originalname: "x.png",
    encoding: "7bit",
    mimetype: "image/png",
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    size: 4,
    stream: null as any,
    destination: "",
    filename: "",
    path: "",
  }
}

describe("uploadImages", () => {
  let mockContext: ReturnType<typeof appContextFactory.build>
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let json: ReturnType<typeof vi.fn>
  let status: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext = appContextFactory.build({ apiUrl: "https://api.example" })
    json = vi.fn()
    status = vi.fn().mockReturnValue({ json })
    mockRes = { status: status as any, json: json as any }
    mockStoreImage.mockResolvedValue({ success: true })
    mockReq = {
      params: { roomId: "room-1" },
      context: mockContext as any,
      files: [mockPngFile()],
      session: { user: { userId: "user-1" } } as any,
      get: vi.fn(),
    } as any
  })

  it("returns 400 when no files", async () => {
    mockReq.files = [] as any
    await uploadImages(mockReq as Request, mockRes as Response)
    expect(status).toHaveBeenCalledWith(400)
    expect(json).toHaveBeenCalledWith({ error: "No files provided" })
  })

  it("returns 401 when session has no user and no valid radio session header", async () => {
    mockReq.session = {} as any
    mockReq.get = vi.fn(() => undefined)
    await uploadImages(mockReq as Request, mockRes as Response)
    expect(status).toHaveBeenCalledWith(401)
    expect(json).toHaveBeenCalledWith({ error: "Unauthorized" })
    expect(mockFindRoom).not.toHaveBeenCalled()
  })

  it("accepts x-radio-session-id when user is online in room (guest HTTP without cookie)", async () => {
    mockReq.session = {} as any
    mockReq.get = vi.fn((name: string) =>
      name.toLowerCase() === RADIO_SESSION_HEADER ? "guest-1" : undefined,
    )
    mockGetUser.mockResolvedValue({ userId: "guest-1", username: "Guest" })
    mockGetRoomUsers.mockResolvedValue([{ userId: "guest-1", username: "Guest" } as any])
    mockFindRoom.mockResolvedValue({
      id: "room-1",
      creator: "creator-1",
      allowChatImages: true,
    })
    mockIsRoomAdmin.mockResolvedValue(false)
    await uploadImages(mockReq as Request, mockRes as Response)
    expect(mockGetUser).toHaveBeenCalledWith({
      context: mockContext,
      userId: "guest-1",
    })
    expect(mockStoreImage).toHaveBeenCalledTimes(1)
    expect(status).not.toHaveBeenCalledWith(401)
    expect(json).toHaveBeenCalledWith({
      success: true,
      images: expect.any(Array),
    })
  })

  it("returns 404 when room not found", async () => {
    mockFindRoom.mockResolvedValue(null)
    await uploadImages(mockReq as Request, mockRes as Response)
    expect(status).toHaveBeenCalledWith(404)
    expect(json).toHaveBeenCalledWith({ error: "Room not found" })
  })

  it("returns 200 for guest when allowChatImages is true", async () => {
    mockFindRoom.mockResolvedValue({
      id: "room-1",
      creator: "creator-1",
      allowChatImages: true,
    })
    mockIsRoomAdmin.mockResolvedValue(false)
    await uploadImages(mockReq as Request, mockRes as Response)
    expect(mockIsRoomAdmin).not.toHaveBeenCalled()
    expect(mockStoreImage).toHaveBeenCalledTimes(1)
    expect(json).toHaveBeenCalledWith({
      success: true,
      images: expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          url: expect.stringContaining("/api/rooms/room-1/images/"),
        }),
      ]),
    })
  })

  it("returns 403 for non-admin when allowChatImages is not true", async () => {
    mockFindRoom.mockResolvedValue({
      id: "room-1",
      creator: "creator-1",
      allowChatImages: false,
    })
    mockIsRoomAdmin.mockResolvedValue(false)
    await uploadImages(mockReq as Request, mockRes as Response)
    expect(mockIsRoomAdmin).toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(403)
    expect(json).toHaveBeenCalledWith({ error: "Image uploads are not allowed in this room" })
    expect(mockStoreImage).not.toHaveBeenCalled()
  })

  it("returns 200 for room admin when allowChatImages is false", async () => {
    mockFindRoom.mockResolvedValue({
      id: "room-1",
      creator: "creator-1",
      allowChatImages: false,
    })
    mockIsRoomAdmin.mockResolvedValue(true)
    await uploadImages(mockReq as Request, mockRes as Response)
    expect(mockStoreImage).toHaveBeenCalledTimes(1)
    expect(json).toHaveBeenCalledWith({
      success: true,
      images: expect.any(Array),
    })
  })
})
