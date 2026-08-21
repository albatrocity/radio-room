import { afterEach, describe, expect, it, vi } from "vitest"
import type { MetadataSourceTrack, SimpleCache } from "@repo/types"
import {
  clearCachedMetadataSearchInflight,
  metadataSearchCacheKey,
  normalizeSearchQuery,
  withCachedMetadataSearch,
} from "./cachedMetadataSearch"

function track(title: string): MetadataSourceTrack {
  return {
    id: title,
    title,
    urls: [],
    artists: [{ id: "a", title: "Artist", urls: [] }],
    album: {
      id: "",
      title: "",
      urls: [],
      artists: [],
      releaseDate: "",
      releaseDatePrecision: "year",
      totalTracks: 0,
      label: "",
      images: [],
    },
    duration: 180,
    explicit: false,
    trackNumber: 1,
    discNumber: 1,
    popularity: 0,
    images: [],
  }
}

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
  clearCachedMetadataSearchInflight()
})

describe("normalizeSearchQuery", () => {
  it("trims, lowercases, and collapses whitespace", () => {
    expect(normalizeSearchQuery("  Foo   BAR ")).toBe("foo bar")
  })
})

describe("metadataSearchCacheKey", () => {
  it("is stable for the same source and normalized query", () => {
    const a = metadataSearchCacheKey("youtube", "foo bar")
    const b = metadataSearchCacheKey("youtube", "foo bar")
    expect(a).toBe(b)
    expect(a).toBe(`metadata:search:v1:youtube:${encodeURIComponent("foo bar")}`)
  })

  it("differs by sourceId", () => {
    expect(metadataSearchCacheKey("youtube", "foo")).not.toBe(
      metadataSearchCacheKey("spotify", "foo"),
    )
  })
})

describe("withCachedMetadataSearch", () => {
  it("returns empty array for blank queries without fetching", async () => {
    const fetch = vi.fn(async () => [track("x")])
    const result = await withCachedMetadataSearch({
      cache: memoryCache(),
      sourceId: "youtube",
      query: "   ",
      ttlSeconds: 60,
      fetch,
    })
    expect(result).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it("fetches on miss and returns cached value on hit", async () => {
    const cache = memoryCache()
    const fetch = vi.fn(async () => [track("Song")])

    const first = await withCachedMetadataSearch({
      cache,
      sourceId: "youtube",
      query: "Song",
      ttlSeconds: 60,
      fetch,
    })
    const second = await withCachedMetadataSearch({
      cache,
      sourceId: "youtube",
      query: "Song",
      ttlSeconds: 60,
      fetch,
    })

    expect(first).toEqual([track("Song")])
    expect(second).toEqual([track("Song")])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("shares cache keys across normalized query variants", async () => {
    const cache = memoryCache()
    const fetch = vi.fn(async () => [track("Hit")])

    await withCachedMetadataSearch({
      cache,
      sourceId: "youtube",
      query: "Foo  Bar",
      ttlSeconds: 60,
      fetch,
    })
    await withCachedMetadataSearch({
      cache,
      sourceId: "youtube",
      query: "foo bar",
      ttlSeconds: 60,
      fetch,
    })

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("does not cache thrown errors", async () => {
    const cache = memoryCache()
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([track("Recovered")])

    await expect(
      withCachedMetadataSearch({
        cache,
        sourceId: "youtube",
        query: "q",
        ttlSeconds: 60,
        fetch,
      }),
    ).rejects.toThrow("boom")

    expect(cache.store.size).toBe(0)

    const result = await withCachedMetadataSearch({
      cache,
      sourceId: "youtube",
      query: "q",
      ttlSeconds: 60,
      fetch,
    })
    expect(result).toEqual([track("Recovered")])
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("passthrough fetches when cache is omitted", async () => {
    const fetch = vi.fn(async () => [track("A")])
    await withCachedMetadataSearch({
      sourceId: "youtube",
      query: "a",
      ttlSeconds: 60,
      fetch,
    })
    await withCachedMetadataSearch({
      sourceId: "youtube",
      query: "a",
      ttlSeconds: 60,
      fetch,
    })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("coalesces concurrent identical misses into one fetch", async () => {
    let resolveFetch!: (tracks: MetadataSourceTrack[]) => void
    const fetch = vi.fn(
      () =>
        new Promise<MetadataSourceTrack[]>((resolve) => {
          resolveFetch = resolve
        }),
    )

    const cache = memoryCache()
    const p1 = withCachedMetadataSearch({
      cache,
      sourceId: "youtube",
      query: "same",
      ttlSeconds: 60,
      fetch,
    })
    const p2 = withCachedMetadataSearch({
      cache,
      sourceId: "youtube",
      query: "same",
      ttlSeconds: 60,
      fetch,
    })

    // Allow both callers to pass cache.get and join the in-flight promise
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1)
    })
    resolveFetch([track("Same")])
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toEqual([track("Same")])
    expect(r2).toEqual([track("Same")])
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
