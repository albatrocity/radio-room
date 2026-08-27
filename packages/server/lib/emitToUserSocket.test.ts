import { beforeEach, describe, expect, test, vi } from "vitest"
import type { AppContext } from "@repo/types"
import type { Server } from "socket.io"
import { emitToUserSocket } from "./emitToUserSocket"

const { getOnlineUserSocketId, getRoomUsers } = vi.hoisted(() => ({
  getOnlineUserSocketId: vi.fn(),
  getRoomUsers: vi.fn(),
}))

vi.mock("../operations/data", () => ({
  getOnlineUserSocketId,
  getRoomUsers,
}))

describe("emitToUserSocket", () => {
  const toEmit = vi.fn()
  const to = vi.fn(() => ({ emit: toEmit }))
  const io = { to } as unknown as Server
  const context = {} as AppContext

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  test("emits to the socket id from getOnlineUserSocketId", async () => {
    getOnlineUserSocketId.mockResolvedValue("sock-b")
    await emitToUserSocket({
      io,
      context,
      roomId: "room1",
      userId: "b",
      type: "TRADE_TYPING",
      data: { typing: true },
    })
    expect(getOnlineUserSocketId).toHaveBeenCalledWith({
      context,
      roomId: "room1",
      userId: "b",
    })
    expect(getRoomUsers).not.toHaveBeenCalled()
    expect(to).toHaveBeenCalledWith("sock-b")
    expect(toEmit).toHaveBeenCalledWith("event", {
      type: "TRADE_TYPING",
      data: { typing: true },
    })
    expect(console.warn).not.toHaveBeenCalled()
  })

  test("warns and no-ops when the user has no socket", async () => {
    getOnlineUserSocketId.mockResolvedValue(null)
    await emitToUserSocket({
      io,
      context,
      roomId: "room1",
      userId: "b",
      type: "TRADE_TYPING",
      data: {},
    })
    expect(getRoomUsers).not.toHaveBeenCalled()
    expect(to).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledWith(
      "[emitToUserSocket] no connected socket for userId b in room room1",
    )
  })
})
