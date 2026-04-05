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

vi.mock("../../lib/systemMessage", () => ({
  default: (content: string, meta?: {}) => ({
    user: { username: "system", id: "system", userId: "system" },
    content,
    meta,
    timestamp: "mock-ts",
  }),
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

  it("dedeputize_all emits DEPUTY_BULK_APPLIED and MESSAGE_RECEIVED", async () => {
    m.getDjs.mockResolvedValueOnce(["a"])
    m.getRoomUsers.mockResolvedValueOnce([{ userId: "x" } as any])

    await applySegmentDeputyBulkAction({ context, roomId: "r1", action: "dedeputize_all" })

    expect(emit).toHaveBeenCalledWith("r1", "DEPUTY_BULK_APPLIED", {
      roomId: "r1",
      action: "dedeputize_all",
    })
    expect(emit).toHaveBeenCalledWith(
      "r1",
      "MESSAGE_RECEIVED",
      expect.objectContaining({
        roomId: "r1",
        message: expect.objectContaining({
          content: "All deputy DJ sessions have ended",
        }),
      }),
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

  it("deputize_all emits DEPUTY_BULK_APPLIED and MESSAGE_RECEIVED", async () => {
    m.getRoomUsers
      .mockResolvedValueOnce([{ userId: "u1" } as any])
      .mockResolvedValueOnce([{ userId: "u1" } as any])

    await applySegmentDeputyBulkAction({ context, roomId: "r1", action: "deputize_all" })

    expect(emit).toHaveBeenCalledWith("r1", "DEPUTY_BULK_APPLIED", {
      roomId: "r1",
      action: "deputize_all",
    })
    expect(emit).toHaveBeenCalledWith(
      "r1",
      "MESSAGE_RECEIVED",
      expect.objectContaining({
        roomId: "r1",
        message: expect.objectContaining({
          content: "All users have been promoted to deputy DJs",
        }),
      }),
    )
  })
})
