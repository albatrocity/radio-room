import { describe, it, expect, vi, beforeEach } from "vitest"
import { applyAdminDeputyBulkAction } from "./applyAdminDeputyBulkAction"
import type { AppContext } from "@repo/types"

const m = vi.hoisted(() => ({
  findRoom: vi.fn(),
  isRoomAdmin: vi.fn(),
  applySegmentDeputyBulkAction: vi.fn(),
}))

vi.mock("../data", () => ({
  findRoom: m.findRoom,
  isRoomAdmin: m.isRoomAdmin,
}))

vi.mock("./applySegmentDeputyBulkAction", () => ({
  applySegmentDeputyBulkAction: m.applySegmentDeputyBulkAction,
}))

describe("applyAdminDeputyBulkAction", () => {
  const context = { redis: {} } as unknown as AppContext

  beforeEach(() => {
    vi.clearAllMocks()
    m.findRoom.mockResolvedValue({ id: "r1", creator: "owner" })
    m.isRoomAdmin.mockResolvedValue(true)
    m.applySegmentDeputyBulkAction.mockResolvedValue(undefined)
  })

  it("rejects an invalid action before touching the room", async () => {
    const result = await applyAdminDeputyBulkAction({
      context,
      roomId: "r1",
      userId: "admin",
      action: undefined,
    })

    expect(result).toEqual({
      ok: false,
      error: { status: 400, error: "Bad Request", message: "Invalid deputy bulk action." },
    })
    expect(m.findRoom).not.toHaveBeenCalled()
    expect(m.applySegmentDeputyBulkAction).not.toHaveBeenCalled()
  })

  it("returns not found when the room is missing", async () => {
    m.findRoom.mockResolvedValue(null)

    const result = await applyAdminDeputyBulkAction({
      context,
      roomId: "r1",
      userId: "admin",
      action: "deputize_all",
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.status).toBe(404)
    expect(m.applySegmentDeputyBulkAction).not.toHaveBeenCalled()
  })

  it("rejects non-admins", async () => {
    m.isRoomAdmin.mockResolvedValue(false)

    const result = await applyAdminDeputyBulkAction({
      context,
      roomId: "r1",
      userId: "listener",
      action: "dedeputize_all",
    })

    expect(result).toEqual({
      ok: false,
      error: { status: 403, error: "Forbidden", message: "You are not a room admin." },
    })
    expect(m.isRoomAdmin).toHaveBeenCalledWith({
      context,
      roomId: "r1",
      userId: "listener",
      roomCreator: "owner",
    })
    expect(m.applySegmentDeputyBulkAction).not.toHaveBeenCalled()
  })

  it.each(["deputize_all", "dedeputize_all"] as const)(
    "applies %s for a room admin",
    async (action) => {
      const result = await applyAdminDeputyBulkAction({
        context,
        roomId: "r1",
        userId: "admin",
        action,
      })

      expect(result).toEqual({ ok: true })
      expect(m.applySegmentDeputyBulkAction).toHaveBeenCalledWith({
        context,
        roomId: "r1",
        action,
      })
    },
  )
})
