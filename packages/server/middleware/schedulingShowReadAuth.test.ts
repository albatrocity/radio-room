import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Request, NextFunction } from "express"
import { schedulingShowReadAuth, RADIO_SESSION_HEADER } from "./schedulingShowReadAuth"
import { getUser, findRoom } from "../operations/data"
import { getPlatformAdminSession } from "@repo/auth/platformSession"

vi.mock("@repo/auth/platformSession", () => ({
  getPlatformAdminSession: vi.fn(),
}))

vi.mock("../operations/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../operations/data")>()
  return {
    ...actual,
    getUser: vi.fn(),
    findRoom: vi.fn(),
  }
})

const mockedGetPlatformAdminSession = vi.mocked(getPlatformAdminSession)
const mockedGetUser = vi.mocked(getUser)
const mockedFindRoom = vi.mocked(findRoom)

describe("schedulingShowReadAuth", () => {
  const next = vi.fn() as NextFunction
  let req: Partial<Request>
  let res: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()
    req = {
      params: { id: "show-1" },
      query: {},
      get: vi.fn(),
      context: {},
    } as Request
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    }
  })

  it("calls next when platform admin session exists", async () => {
    mockedGetPlatformAdminSession.mockResolvedValue({
      user: { id: "p1", role: "admin" },
      session: { id: "s1" },
    } as Awaited<ReturnType<typeof getPlatformAdminSession>>)

    await schedulingShowReadAuth(req as Request, res as never, next as NextFunction)

    expect(next).toHaveBeenCalled()
    expect(mockedGetUser).not.toHaveBeenCalled()
  })

  it("calls next for guest with header, roomId, user and matching showId", async () => {
    mockedGetPlatformAdminSession.mockResolvedValue(null)
    vi.mocked(req.get!).mockImplementation((name: string) =>
      name.toLowerCase() === RADIO_SESSION_HEADER ? "user-1" : undefined,
    )
    req.query = { roomId: "room-1" }
    mockedGetUser.mockResolvedValue({ userId: "user-1" } as Awaited<ReturnType<typeof getUser>>)
    mockedFindRoom.mockResolvedValue({
      id: "room-1",
      showId: "show-1",
    } as Awaited<ReturnType<typeof findRoom>>)

    await schedulingShowReadAuth(req as Request, res as never, next as NextFunction)

    expect(next).toHaveBeenCalled()
  })

  it("returns 401 without roomId for guest", async () => {
    mockedGetPlatformAdminSession.mockResolvedValue(null)
    vi.mocked(req.get!).mockReturnValue("user-1")

    await schedulingShowReadAuth(req as Request, res as never, next as NextFunction)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it("returns 401 when room showId does not match", async () => {
    mockedGetPlatformAdminSession.mockResolvedValue(null)
    vi.mocked(req.get!).mockReturnValue("user-1")
    req.query = { roomId: "room-1" }
    mockedGetUser.mockResolvedValue({ userId: "user-1" } as Awaited<ReturnType<typeof getUser>>)
    mockedFindRoom.mockResolvedValue({
      id: "room-1",
      showId: "other",
    } as Awaited<ReturnType<typeof findRoom>>)

    await schedulingShowReadAuth(req as Request, res as never, next as NextFunction)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })
})
