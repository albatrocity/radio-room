import { describe, expect, test, vi } from "vitest"
import type { RedisContext } from "@repo/types"
import { MemoryRedisClient } from "../test-utils/MemoryRedisClient"
import { hydrateIndexedJson } from "./hydrateIndexedJson"

function redis(): { client: MemoryRedisClient; ctx: RedisContext } {
  const client = new MemoryRedisClient()
  return { client, ctx: { pubClient: client, subClient: client } as unknown as RedisContext }
}

describe("hydrateIndexedJson", () => {
  test("returns parsed records and drops missing / invalid ids from both sets", async () => {
    const { client, ctx } = redis()
    await client.sAdd("idx", "keep")
    await client.sAdd("idx", "gone")
    await client.sAdd("idx", "bad")
    await client.sAdd("all", "keep")
    await client.sAdd("all", "gone")
    await client.sAdd("all", "bad")
    await client.set("rec:keep", JSON.stringify({ id: "keep" }))
    await client.set("rec:bad", "{not-json")

    const rows = await hydrateIndexedJson<{ id: string }>({
      redis: ctx,
      indexKey: "idx",
      allSetKey: "all",
      recordKey: (id) => `rec:${id}`,
      onRecord: async () => "keep",
    })

    expect(rows).toEqual([{ id: "keep" }])
    expect(await client.sMembers("idx")).toEqual(["keep"])
    expect(await client.sMembers("all")).toEqual(["keep"])
    expect(await client.get("rec:bad")).toBeNull()
  })

  test("onRecord drop leaves Redis rows for the caller to delete", async () => {
    const { client, ctx } = redis()
    await client.sAdd("idx", "stale")
    await client.sAdd("all", "stale")
    await client.set("rec:stale", JSON.stringify({ id: "stale" }))

    const rows = await hydrateIndexedJson<{ id: string }>({
      redis: ctx,
      indexKey: "idx",
      allSetKey: "all",
      recordKey: (id) => `rec:${id}`,
      onRecord: async () => "drop",
    })

    expect(rows).toEqual([])
    expect(await client.get("rec:stale")).toBe('{"id":"stale"}')
  })

  test("drops many missing ids with one sRem per set", async () => {
    const { client, ctx } = redis()
    await client.sAdd("idx", "keep")
    await client.sAdd("all", "keep")
    await client.set("rec:keep", JSON.stringify({ id: "keep" }))
    for (let i = 0; i < 20; i++) {
      await client.sAdd("idx", `gone${i}`)
      await client.sAdd("all", `gone${i}`)
    }
    const sRem = vi.spyOn(client, "sRem")

    const rows = await hydrateIndexedJson<{ id: string }>({
      redis: ctx,
      indexKey: "idx",
      allSetKey: "all",
      recordKey: (id) => `rec:${id}`,
      onRecord: async () => "keep",
    })

    expect(rows).toEqual([{ id: "keep" }])
    expect(sRem).toHaveBeenCalledTimes(2)
    expect(sRem.mock.calls[0]![1]).toHaveLength(20)
    expect(sRem.mock.calls[1]![1]).toHaveLength(20)
    expect(await client.sMembers("idx")).toEqual(["keep"])
  })
})
