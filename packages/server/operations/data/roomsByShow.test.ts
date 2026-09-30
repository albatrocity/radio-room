import { describe, it, expect } from "vitest"
import type { AppContext } from "@repo/types"
import { MemoryRedisClient } from "../../test-utils/MemoryRedisClient"
import { findRoomIdsByShowId, findRoomsByShowIds } from "./roomsByShow"

describe("findRoomsByShowIds", () => {
  async function contextWithRooms(rooms: Array<{ id: string; showId?: string }>) {
    const client = new MemoryRedisClient()
    for (const room of rooms) {
      await client.sAdd("rooms", room.id)
      await client.hSet(`room:${room.id}:details`, {
        id: room.id,
        title: room.id,
        creator: "u1",
        type: "radio",
        createdAt: "1",
        lastRefreshedAt: "1",
        ...(room.showId ? { showId: room.showId } : {}),
      })
    }
    return { redis: { pubClient: client, subClient: client } } as unknown as AppContext
  }

  it("returns rooms attached to any of the given shows", async () => {
    const context = await contextWithRooms([
      { id: "r1", showId: "show-1" },
      { id: "r2", showId: "show-2" },
      { id: "r3", showId: "show-other" },
      { id: "r4" },
    ])

    const matches = await findRoomsByShowIds(context, new Set(["show-1", "show-2"]))

    expect(matches.map((match) => match.roomId).sort()).toEqual(["r1", "r2"])
    expect(matches.find((match) => match.roomId === "r1")?.room.showId).toBe("show-1")
  })

  it("skips the rooms scan when no shows are given", async () => {
    const context = await contextWithRooms([{ id: "r1", showId: "show-1" }])
    expect(await findRoomsByShowIds(context, new Set())).toEqual([])
  })

  it("findRoomIdsByShowId keeps its single-show contract", async () => {
    const context = await contextWithRooms([
      { id: "r1", showId: "show-1" },
      { id: "r2", showId: "show-2" },
    ])
    expect(await findRoomIdsByShowId(context, "show-1")).toEqual(["r1"])
  })
})
