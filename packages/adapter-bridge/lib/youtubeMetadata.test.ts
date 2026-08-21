import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { SimpleCache } from "@repo/types"
import { clearCachedMetadataSearchInflight } from "@repo/utils"
import { createYoutubeMetadataApi } from "./youtubeMetadata"

function memoryCache(): SimpleCache {
  const store = new Map<string, string>()
  return {
    async get(key) {
      return store.has(key) ? store.get(key)! : null
    },
    async set(key, value) {
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

function searchResponse(videoId: string, title: string) {
  return {
    items: [
      {
        id: { videoId },
        snippet: {
          title,
          channelId: "ch1",
          channelTitle: "Channel",
          thumbnails: { high: { url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` } },
        },
      },
    ],
  }
}

function videosResponse(videoId: string) {
  return {
    items: [
      {
        id: videoId,
        contentDetails: { duration: "PT3M20S" },
        status: { embeddable: true },
      },
    ],
  }
}

describe("createYoutubeMetadataApi search cache", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/search?")) {
          return {
            ok: true,
            json: async () => searchResponse("vid1", "Never Gonna Give You Up"),
          }
        }
        if (url.includes("/videos?")) {
          return {
            ok: true,
            json: async () => videosResponse("vid1"),
          }
        }
        return { ok: false, text: async () => "unexpected" }
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clearCachedMetadataSearchInflight()
  })

  it("skips YouTube fetch on cache hit for identical queries", async () => {
    const api = createYoutubeMetadataApi("test-key", memoryCache())
    const first = await api.search("rick astley")
    const second = await api.search("rick astley")

    expect(first).toHaveLength(1)
    expect(first[0]?.id).toBe("vid1")
    expect(first[0]?.duration).toBe(200_000)
    expect(second).toEqual(first)
    expect(fetch).toHaveBeenCalledTimes(2) // search.list + videos.list once
  })

  it("shares cache across normalized query variants", async () => {
    const api = createYoutubeMetadataApi("test-key", memoryCache())
    await api.search("Rick   Astley")
    await api.search("rick astley")
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("works without a cache (fetches every time)", async () => {
    const api = createYoutubeMetadataApi("test-key")
    await api.search("q")
    await api.search("q")
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it("does not cache API failures", async () => {
    const cache = memoryCache()
    const api = createYoutubeMetadataApi("test-key", cache)

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      text: async () => "quota",
    } as Response)

    await expect(api.search("fail")).rejects.toThrow(/YouTube API/)

    vi.mocked(fetch).mockImplementation(async (url: string) => {
      if (String(url).includes("/search?")) {
        return {
          ok: true,
          json: async () => searchResponse("vid1", "Ok"),
        } as Response
      }
      return {
        ok: true,
        json: async () => videosResponse("vid1"),
      } as Response
    })

    const result = await api.search("fail")
    expect(result).toHaveLength(1)
    expect(fetch).toHaveBeenCalled()
  })
})
