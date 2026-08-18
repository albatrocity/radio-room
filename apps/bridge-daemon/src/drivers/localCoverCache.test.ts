import { describe, expect, it, vi } from "vitest"
import { CoverArtCache, coverCacheKey, mapWithConcurrency } from "./localCoverCache"

describe("coverCacheKey", () => {
  it("prefers coverArt over albumId over song id", () => {
    expect(coverCacheKey({ coverArt: "al-cover", albumId: "al1", id: "t1" })).toBe("al-cover")
    expect(coverCacheKey({ albumId: "al1", id: "t1" })).toBe("al1")
    expect(coverCacheKey({ id: "t1" })).toBe("t1")
    expect(coverCacheKey({})).toBe("")
  })
})

describe("CoverArtCache", () => {
  it("fetches once per cover key and coalesces inflight", async () => {
    let inflight = 0
    let maxInflight = 0
    const fetchBytes = vi.fn(async () => {
      inflight++
      maxInflight = Math.max(maxInflight, inflight)
      await new Promise((r) => setTimeout(r, 20))
      inflight--
      return "data:image/jpeg;base64,abc"
    })
    const cache = new CoverArtCache(fetchBytes, 60_000)
    const [a, b] = await Promise.all([cache.get("al1", 640), cache.get("al1", 640)])
    expect(a).toBe("data:image/jpeg;base64,abc")
    expect(b).toBe(a)
    expect(fetchBytes).toHaveBeenCalledTimes(1)
    expect(fetchBytes).toHaveBeenCalledWith("al1", 640)
    expect(maxInflight).toBe(1)
    await cache.get("al1", 640)
    expect(fetchBytes).toHaveBeenCalledTimes(1)
  })

  it("refetches after invalidate", async () => {
    const fetchBytes = vi.fn(async () => "data:image/jpeg;base64,abc")
    const cache = new CoverArtCache(fetchBytes, 60_000)
    await cache.get("al1", 640)
    cache.invalidate()
    await cache.get("al1", 640)
    expect(fetchBytes).toHaveBeenCalledTimes(2)
  })

  it("caches each size independently", async () => {
    const fetchBytes = vi.fn(async (_key: string, sizePx: number) => `data:${sizePx}`)
    const cache = new CoverArtCache(fetchBytes, 60_000)
    await expect(cache.get("al1", 384)).resolves.toBe("data:384")
    await expect(cache.get("al1", 1200)).resolves.toBe("data:1200")
    expect(fetchBytes).toHaveBeenCalledTimes(2)
    await cache.get("al1", 384)
    expect(fetchBytes).toHaveBeenCalledTimes(2)
  })
})

describe("mapWithConcurrency", () => {
  it("preserves order with a concurrency cap", async () => {
    let inflight = 0
    let maxInflight = 0
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      inflight++
      maxInflight = Math.max(maxInflight, inflight)
      await new Promise((r) => setTimeout(r, 10))
      inflight--
      return n * 10
    })
    expect(result).toEqual([10, 20, 30, 40, 50])
    expect(maxInflight).toBeLessThanOrEqual(2)
  })
})
