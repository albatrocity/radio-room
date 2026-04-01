import { describe, it, expect, vi, beforeEach } from "vitest"
import { applySegmentDeputyBulkAction } from "./applySegmentDeputyBulkAction"
import type { AppContext } from "@repo/types"

const m = vi.hoisted(() => ({
  getDjs: vi.fn(),
  removeDj: vi.fn(),
  addDj: vi.fn(),
  getRoomUsers: vi.fn(),
  writeJsonToHset: vi.fn(),
}))

vi.mock("../data/djs", () => ({
  getDjs: m.getDjs,
  removeDj: m.removeDj,
  addDj: m.addDj,
}))

vi.mock("../data/users", () => ({
  getRoomUsers: m.getRoomUsers,
}))

vi.mock("../data/utils", () => ({
  writeJsonToHset: m.writeJsonToHset,
}))

describe("applySegmentDeputyBulkAction", () => {
  const emit = vi.fn()
  const context = {
    systemEvents: { emit },
    redis: {},
  } as unknown as AppContext

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("no-ops when action is undefined", async () => {
    await applySegmentDeputyBulkAction({ context, roomId: "r1", action: undefined })
    expect(m.getDjs).not.toHaveBeenCalled()
    expect(m.getRoomUsers).not.toHaveBeenCalled()
  })

  it("dedeputize_all removes each deputy and clears isDeputyDj", async () => {
    m.getDjs.mockResolvedValueOnce(["a", "b"])
    m.getRoomUsers.mockResolvedValueOnce([{ userId: "x" } as any])

    await applySegmentDeputyBulkAction({ context, roomId: "r1", action: "dedeputize_all" })

    expect(m.removeDj).toHaveBeenCalledWith({ context, roomId: "r1", userId: "a" })
    expect(m.removeDj).toHaveBeenCalledWith({ context, roomId: "r1", userId: "b" })
    expect(m.writeJsonToHset).toHaveBeenCalledWith({
      context,
      setKey: "user:a",
      attributes: { isDeputyDj: false },
    })
    expect(emit).toHaveBeenCalledWith(
      "r1",
      "USER_JOINED",
      expect.objectContaining({ roomId: "r1", users: [{ userId: "x" }] }),
    )
  })

  it("deputize_all adds each online user as deputy", async () => {
    m.getRoomUsers
      .mockResolvedValueOnce([
        { userId: "u1" } as any,
        { userId: "u2" } as any,
      ])
      .mockResolvedValueOnce([
        { userId: "u1" } as any,
        { userId: "u2" } as any,
      ])

    await applySegmentDeputyBulkAction({ context, roomId: "r1", action: "deputize_all" })

    expect(m.addDj).toHaveBeenCalledWith({ context, roomId: "r1", userId: "u1" })
    expect(m.addDj).toHaveBeenCalledWith({ context, roomId: "r1", userId: "u2" })
    expect(m.writeJsonToHset).toHaveBeenCalledWith({
      context,
      setKey: "user:u1",
      attributes: { isDeputyDj: true },
    })
    expect(emit).toHaveBeenCalled()
  })
})
