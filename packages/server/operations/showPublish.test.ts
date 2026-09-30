import { describe, it, expect } from "vitest"
import {
  finalizeShowPublish,
  continuePrepareShowPublish,
  findRoomsByShowIds,
  findRoomIdsByShowId,
} from "./showPublish"
import * as scheduling from "../services/SchedulingService"
import type { AppContext } from "@repo/types"
import { MemoryRedisClient } from "../test-utils/MemoryRedisClient"

describe("findRoomsByShowIds", () => {
  async function contextWithRooms(rooms: Array<{ id: string; showId?: string }>) {
    const client = new MemoryRedisClient()
    for (const r of rooms) {
      await client.sAdd("rooms", r.id)
      await client.hSet(`room:${r.id}:details`, {
        id: r.id,
        title: r.id,
        creator: "u1",
        type: "radio",
        createdAt: "1",
        lastRefreshedAt: "1",
        ...(r.showId ? { showId: r.showId } : {}),
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

    expect(matches.map((m) => m.roomId).sort()).toEqual(["r1", "r2"])
    expect(matches.find((m) => m.roomId === "r1")?.room.showId).toBe("show-1")
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

describe("finalizeShowPublish", () => {
  it("rejects whitespace-only markdown before touching the database", async () => {
    await expect(
      finalizeShowPublish("any-id", "  \n\t  ", {} as AppContext),
    ).rejects.toThrow(scheduling.SchedulingBadRequestError)

    await expect(finalizeShowPublish("any-id", "  \n\t  ", {} as AppContext)).rejects.toThrow(
      /Markdown cannot be empty/,
    )
  })
})

describe("continuePrepareShowPublish", () => {
  it("rejects invalid body before loading the show", async () => {
    await expect(
      continuePrepareShowPublish("any-id", { orderedTrackKeys: "nope" }, {} as AppContext),
    ).rejects.toThrow(scheduling.SchedulingBadRequestError)
  })
})
