import { beforeEach, describe, expect, it } from "vitest"
import type { AppContext } from "@repo/types"
import { MemoryRedisClient } from "../../test-utils/MemoryRedisClient"
import { makeJukeboxCurrentPayload } from "./rooms"

describe("makeJukeboxCurrentPayload artwork", () => {
  let client: MemoryRedisClient
  let context: AppContext

  beforeEach(async () => {
    client = new MemoryRedisClient()
    context = {
      redis: { pubClient: client, subClient: client },
      pluginRegistry: { augmentNowPlaying: async (_roomId: string, np: unknown) => np },
    } as unknown as AppContext
    await client.hSet("room:r1:details", {
      id: "r1",
      title: "My Room",
      creator: "u1",
      type: "radio",
      artwork: "https://cdn.example/room.jpg",
      createdAt: "1",
      lastRefreshedAt: "1",
    })
  })

  it("keeps caller-provided artwork (streaming-mode segment image)", async () => {
    const payload = await makeJukeboxCurrentPayload({
      context,
      roomId: "r1",
      nowPlaying: undefined,
      meta: { artwork: "https://cdn.example/segment.jpg" },
    })
    expect(payload?.data.meta.artwork).toBe("https://cdn.example/segment.jpg")
  })

  it("falls back to room artwork when the caller provides none", async () => {
    const payload = await makeJukeboxCurrentPayload({
      context,
      roomId: "r1",
      nowPlaying: undefined,
      meta: {},
    })
    expect(payload?.data.meta.artwork).toBe("https://cdn.example/room.jpg")
  })
})
