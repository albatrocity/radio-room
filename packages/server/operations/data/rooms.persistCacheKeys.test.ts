import { describe, expect, it, vi, beforeEach } from "vitest"
import type { AppContext } from "@repo/types"
import { isRoomCacheKey, persistRoom } from "./rooms"

describe("isRoomCacheKey", () => {
  it("matches images and track-preview suffixes", () => {
    expect(isRoomCacheKey("room:r1:images:al-cover-abc")).toBe(true)
    expect(isRoomCacheKey("room:r1:track-previews:tid")).toBe(true)
    expect(isRoomCacheKey("room:r1:track-preview-id:pid")).toBe(true)
    expect(isRoomCacheKey("room:r1:details")).toBe(false)
    expect(isRoomCacheKey("room:r1:online_users")).toBe(false)
  })
})

describe("persistRoom", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("PERSIST durable keys but leaves cache key TTLs intact", async () => {
    const persist = vi.fn().mockResolvedValue(1)
    const hGetAll = vi.fn().mockResolvedValue({
      id: "room-1",
      title: "Test",
      creator: "user-1",
      type: "radio",
      createdAt: new Date().toISOString(),
      lastRefreshedAt: new Date().toISOString(),
    })

    async function* scanIterator() {
      yield "room:room-1:details"
      yield "room:room-1:images:al-cover-x"
      yield "room:room-1:track-previews:t1"
      yield "room:room-1:online_users"
    }

    const context = {
      redis: {
        pubClient: {
          hGetAll,
          persist,
          scanIterator,
        },
      },
    } as unknown as AppContext

    await persistRoom({ context, roomId: "room-1" })

    expect(persist).toHaveBeenCalledWith("room:room-1:details")
    expect(persist).toHaveBeenCalledWith("room:room-1:online_users")
    expect(persist).not.toHaveBeenCalledWith("room:room-1:images:al-cover-x")
    expect(persist).not.toHaveBeenCalledWith("room:room-1:track-previews:t1")
  })
})
