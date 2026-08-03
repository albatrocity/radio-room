import { describe, expect, it, vi } from "vitest"
import { listRoomsFromRedis } from "./listRooms"

describe("listRoomsFromRedis", () => {
  it("maps room hashes and sorts bridge rooms first", async () => {
    const redis = {
      sMembers: vi.fn().mockResolvedValue(["a", "b"]),
      hGetAll: vi.fn(async (key: string) => {
        if (key.includes(":a:")) {
          return {
            title: "Spotify Room",
            type: "radio",
            playbackControllerId: "spotify",
            playbackMode: "app-controlled",
            public: "true",
          }
        }
        return {
          title: "Bridge Room",
          type: "radio",
          playbackControllerId: "bridge",
          playbackMode: "app-controlled",
          public: "false",
        }
      }),
    }

    const rooms = await listRoomsFromRedis(redis as any)
    expect(rooms).toHaveLength(2)
    expect(rooms[0].id).toBe("b")
    expect(rooms[0].bridgeReady).toBe(true)
    expect(rooms[0].public).toBe(false)
    expect(rooms[1].bridgeReady).toBe(false)
  })

  it("skips empty hashes", async () => {
    const redis = {
      sMembers: vi.fn().mockResolvedValue(["gone"]),
      hGetAll: vi.fn().mockResolvedValue({}),
    }
    const rooms = await listRoomsFromRedis(redis as any)
    expect(rooms).toEqual([])
  })
})
