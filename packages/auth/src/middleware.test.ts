import { describe, test, expect, vi, beforeEach } from "vitest"
import { requireAdmin } from "./middleware"

const mockGetSession = vi.hoisted(() => vi.fn())
vi.mock("./server", () => ({
  auth: { api: { getSession: mockGetSession } },
}))

vi.mock("better-auth/node", () => ({
  fromNodeHeaders: (headers: any) => headers,
}))

describe("requireAdmin", () => {
  let req: any
  let res: any
  let next: any

  beforeEach(() => {
    vi.resetAllMocks()
    req = { headers: { cookie: "better-auth.session_token=valid-token" } }
    res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    next = vi.fn()
  })

  test("returns 401 when no session exists", async () => {
    mockGetSession.mockResolvedValue(null)
    await requireAdmin(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" })
    expect(next).not.toHaveBeenCalled()
  })

  test("returns 403 when user role is 'user'", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "1", name: "Regular", role: "user" },
      session: { id: "s1" },
    })
    await requireAdmin(req, res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({ error: "Forbidden" })
    expect(next).not.toHaveBeenCalled()
  })

  test("calls next() when user role is 'admin'", async () => {
    const adminUser = { id: "1", name: "Admin", role: "admin" }
    const adminSession = { id: "s1" }
    mockGetSession.mockResolvedValue({ user: adminUser, session: adminSession })

    await requireAdmin(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  test("attaches platformUser and platformSession to req", async () => {
    const adminUser = { id: "1", name: "Admin", role: "admin" }
    const adminSession = { id: "s1", token: "tok" }
    mockGetSession.mockResolvedValue({ user: adminUser, session: adminSession })

    await requireAdmin(req, res, next)
    expect(req.platformUser).toEqual(adminUser)
    expect(req.platformSession).toEqual(adminSession)
  })

  test("returns 401 when session is expired (getSession returns null)", async () => {
    mockGetSession.mockResolvedValue(null)
    await requireAdmin(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  test("returns 500 when getSession throws", async () => {
    mockGetSession.mockRejectedValue(new Error("DB connection failed"))
    await requireAdmin(req, res, next)
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" })
    expect(next).not.toHaveBeenCalled()
  })

  test("passes request headers to getSession", async () => {
    mockGetSession.mockResolvedValue(null)
    const headers = { cookie: "better-auth.session_token=test-token" }
    req.headers = headers

    await requireAdmin(req, res, next)
    expect(mockGetSession).toHaveBeenCalledWith({ headers })
  })
})
