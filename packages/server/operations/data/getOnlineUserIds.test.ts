import { describe, expect, test, vi } from "vitest"
import type { AppContext } from "@repo/types"
import { getOnlineUserIds } from "./users"

describe("getOnlineUserIds", () => {
  test("returns SMEMBERS of the online set with no user reads", async () => {
    const sMembers = vi.fn().mockResolvedValue(["a", "b"])
    const hGetAll = vi.fn()
    const context = {
      redis: { pubClient: { sMembers, hGetAll } },
    } as unknown as AppContext

    await expect(getOnlineUserIds({ context, roomId: "room1" })).resolves.toEqual(["a", "b"])
    expect(sMembers).toHaveBeenCalledWith("room:room1:online_users")
    expect(hGetAll).not.toHaveBeenCalled()
  })
})
