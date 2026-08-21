import { afterEach, describe, expect, it, vi } from "vitest"
import type { SimpleCache } from "@repo/types"
import {
  clearCachedJsonInflight,
  withCachedJson,
} from "./cachedJson"
import {
  browsePlaylistScope,
  metadataBrowseAlbumCacheKey,
  metadataBrowsePlaylistCacheKey,
  metadataBrowseRoomPrefix,
} from "./localBrowseCacheKeys"

function memoryCache(): SimpleCache & { store: Map<string, string> } {
  const store = new Map<string, string>()
  return {
    store,
    async get(key) {
      return store.has(key) ? store.get(key)! : null
    },
    async set(key, value, _ttlSeconds) {
      store.set(key, value)
    },
    async delete(key) {
      store.delete(key)
    },
    async deleteByPrefix(prefix) {
      for (const key of [...store.keys()]) {
        if (key.startsWith(prefix)) store.delete(key)
      }
    },
  }
}

afterEach(() => {
  clearCachedJsonInflight()
})

describe("localBrowseCacheKeys", () => {
  it("uses library scope when playlistIds are empty", () => {
    expect(browsePlaylistScope()).toBe("library")
    expect(browsePlaylistScope([])).toBe("library")
    expect(metadataBrowseAlbumCacheKey("room1", "alb1")).toBe(
      "metadata:browse:v1:room1:album:alb1:library",
    )
  })

  it("sorts unique playlist ids for scope", () => {
    expect(browsePlaylistScope(["b", "a", "a", "  c "])).toBe("a,b,c")
    expect(metadataBrowseAlbumCacheKey("room1", "alb1", ["pl-2", "pl-1"])).toBe(
      "metadata:browse:v1:room1:album:alb1:pl-1,pl-2",
    )
  })

  it("isolates rooms and playlist keys", () => {
    expect(metadataBrowseAlbumCacheKey("r1", "a")).not.toBe(metadataBrowseAlbumCacheKey("r2", "a"))
    expect(metadataBrowsePlaylistCacheKey("r1", "pl-1")).toBe(
      "metadata:browse:v1:r1:playlist:pl-1",
    )
    expect(metadataBrowseRoomPrefix("r1")).toBe("metadata:browse:v1:r1:")
  })
})

describe("withCachedJson", () => {
  it("fetches on miss and returns cached value on hit", async () => {
    const cache = memoryCache()
    const fetch = vi.fn(async () => ({ tracks: [1] }))

    const first = await withCachedJson({
      cache,
      key: "k1",
      ttlSeconds: 60,
      fetch,
    })
    const second = await withCachedJson({
      cache,
      key: "k1",
      ttlSeconds: 60,
      fetch,
    })

    expect(first).toEqual({ tracks: [1] })
    expect(second).toEqual({ tracks: [1] })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("does not store when skipCache returns true", async () => {
    const cache = memoryCache()
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ok: true })

    const first = await withCachedJson({
      cache,
      key: "nullable",
      ttlSeconds: 60,
      fetch,
      skipCache: (v) => v == null,
    })
    expect(first).toBeNull()
    expect(cache.store.size).toBe(0)

    const second = await withCachedJson({
      cache,
      key: "nullable",
      ttlSeconds: 60,
      fetch,
      skipCache: (v) => v == null,
    })
    expect(second).toEqual({ ok: true })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(cache.store.size).toBe(1)
  })

  it("does not cache thrown errors", async () => {
    const cache = memoryCache()
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ ok: true })

    await expect(
      withCachedJson({ cache, key: "err", ttlSeconds: 60, fetch }),
    ).rejects.toThrow("boom")
    expect(cache.store.size).toBe(0)

    const result = await withCachedJson({ cache, key: "err", ttlSeconds: 60, fetch })
    expect(result).toEqual({ ok: true })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("coalesces concurrent identical misses into one fetch", async () => {
    let resolveFetch!: (value: { n: number }) => void
    const fetch = vi.fn(
      () =>
        new Promise<{ n: number }>((resolve) => {
          resolveFetch = resolve
        }),
    )

    const cache = memoryCache()
    const p1 = withCachedJson({ cache, key: "same", ttlSeconds: 60, fetch })
    const p2 = withCachedJson({ cache, key: "same", ttlSeconds: 60, fetch })

    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1)
    })
    resolveFetch({ n: 1 })
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toEqual({ n: 1 })
    expect(r2).toEqual({ n: 1 })
  })

  it("passthrough fetches when cache is omitted", async () => {
    const fetch = vi.fn(async () => 1)
    await withCachedJson({ key: "x", ttlSeconds: 60, fetch })
    await withCachedJson({ key: "x", ttlSeconds: 60, fetch })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("deleteByPrefix clears room browse keys", async () => {
    const cache = memoryCache()
    await cache.set(metadataBrowseAlbumCacheKey("r1", "a"), "{}", 60)
    await cache.set(metadataBrowsePlaylistCacheKey("r1", "pl"), "{}", 60)
    await cache.set(metadataBrowseAlbumCacheKey("r2", "a"), "{}", 60)

    await cache.deleteByPrefix(metadataBrowseRoomPrefix("r1"))

    expect(await cache.get(metadataBrowseAlbumCacheKey("r1", "a"))).toBeNull()
    expect(await cache.get(metadataBrowsePlaylistCacheKey("r1", "pl"))).toBeNull()
    expect(await cache.get(metadataBrowseAlbumCacheKey("r2", "a"))).not.toBeNull()
  })
})
