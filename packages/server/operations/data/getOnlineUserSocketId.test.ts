import { describe, expect, test, vi } from "vitest"
import type { AppContext } from "@repo/types"
import { getOnlineUserSocketId } from "./users"

describe("getOnlineUserSocketId", () => {
  test("returns socket id after SISMEMBER + getUser", async () => {
    const sIsMember = vi.fn().mockResolvedValue(true)
    const hGetAll = vi.fn().mockResolvedValue({ userId: "b", id: "sock-b" })
    const context = {
      redis: { pubClient: { sIsMember, hGetAll } },
    } as unknown as AppContext

    await expect(
      getOnlineUserSocketId({ context, roomId: "room1", userId: "b" }),
    ).resolves.toBe("sock-b")
    expect(sIsMember).toHaveBeenCalledWith("room:room1:online_users", "b")
    expect(hGetAll).toHaveBeenCalledWith("user:b")
  })

  test("skips getUser when the user is not in the online set", async () => {
    const sIsMember = vi.fn().mockResolvedValue(false)
    const hGetAll = vi.fn()
    const context = {
      redis: { pubClient: { sIsMember, hGetAll } },
    } as unknown as AppContext

    await expect(
      getOnlineUserSocketId({ context, roomId: "room1", userId: "b" }),
    ).resolves.toBeNull()
    expect(hGetAll).not.toHaveBeenCalled()
  })
})
