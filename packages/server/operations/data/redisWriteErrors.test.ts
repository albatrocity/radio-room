import { describe, expect, test, vi } from "vitest"
import type { AppContext } from "@repo/types"
import { addDj } from "./djs"
import { persistUser, expireUserIn } from "./users"

const oom = new Error("OOM command not allowed when used memory > 'maxmemory'.")

function contextWith(pubClient: Record<string, unknown>): AppContext {
  return { redis: { pubClient } } as unknown as AppContext
}

describe("data layer Redis write errors", () => {
  test("addDj awaits sAdd so OOM is caught instead of becoming an unhandled rejection", async () => {
    const sAdd = vi.fn().mockRejectedValue(oom)
    await expect(
      addDj({ context: contextWith({ sAdd }), roomId: "room1", userId: "user1" }),
    ).resolves.toBeNull()
    expect(sAdd).toHaveBeenCalledWith("room:room1:djs", "user1")
  })

  test("persistUser swallows rejected persist", async () => {
    const persist = vi.fn().mockRejectedValue(oom)
    await expect(persistUser({ context: contextWith({ persist }), userId: "user1" })).resolves.toBeNull()
  })

  test("expireUserIn swallows rejected pExpire", async () => {
    const pExpire = vi.fn().mockRejectedValue(oom)
    await expect(
      expireUserIn({ context: contextWith({ pExpire }), userId: "user1", ms: 1000 }),
    ).resolves.toBeNull()
  })
})
