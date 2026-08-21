import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MetadataGetAlbumResult, SimpleCache } from "@repo/types"
import { clearCachedJsonInflight } from "@repo/utils"
import { createLocalMetadataApi, fetchLocalPlaylistTracks } from "./localMetadata"
import type { BridgeRpcClient } from "./rpcClient"

function memoryCache(): SimpleCache & { store: Map<string, string> } {
  const store = new Map<string, string>()
  return {
    store,
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

function albumResult(id: string): MetadataGetAlbumResult {
  return {
    album: {
      id,
      title: `Album ${id}`,
      artists: [],
      images: [],
    },
    tracks: [
      {
        id: "t1",
        title: "Track",
        urls: [],
        artists: [],
        album: {
          id,
          title: `Album ${id}`,
          urls: [],
          artists: [],
          releaseDate: "",
          releaseDatePrecision: "year",
          totalTracks: 1,
          label: "",
          images: [],
        },
        duration: 1000,
        explicit: false,
        trackNumber: 1,
        discNumber: 1,
        popularity: 0,
        images: [],
      },
    ],
  }
}

describe("local browse Redis cache", () => {
  const call = vi.fn()
  const rpc = {
    isPresent: vi.fn(async () => true),
    call,
  } as unknown as BridgeRpcClient

  beforeEach(() => {
    vi.clearAllMocks()
    call.mockReset()
  })

  afterEach(() => {
    clearCachedJsonInflight()
  })

  it("getAlbum caches successful results and skips RPC on hit", async () => {
    const cache = memoryCache()
    call.mockResolvedValue(albumResult("alb-1"))
    const api = createLocalMetadataApi({
      roomId: "room1",
      getRpcForRoom: () => rpc,
      cache,
    })

    const first = await api.getAlbum!("alb-1")
    const second = await api.getAlbum!("alb-1")

    expect(first?.album.id).toBe("alb-1")
    expect(second?.album.id).toBe("alb-1")
    expect(call).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledWith("getAlbum", {
      source: "local",
      albumId: "alb-1",
    })
  })

  it("getAlbum does not cache null and scopes by playlistIds", async () => {
    const cache = memoryCache()
    call.mockResolvedValueOnce(null).mockResolvedValueOnce(albumResult("alb-1"))
    const api = createLocalMetadataApi({
      roomId: "room1",
      getRpcForRoom: () => rpc,
      cache,
    })

    expect(await api.getAlbum!("missing")).toBeNull()
    expect(cache.store.size).toBe(0)

    await api.getAlbum!("alb-1", { playlistIds: ["pl-b", "pl-a"] })
    await api.getAlbum!("alb-1", { playlistIds: ["pl-a", "pl-b"] })
    expect(call).toHaveBeenCalledTimes(2) // null + one successful scoped fetch
    expect(call).toHaveBeenLastCalledWith("getAlbum", {
      source: "local",
      albumId: "alb-1",
      playlistIds: ["pl-b", "pl-a"],
    })
  })

  it("fetchLocalPlaylistTracks caches ok results and not failures", async () => {
    const cache = memoryCache()
    call
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce([{ id: "t1" }])

    const fail = await fetchLocalPlaylistTracks({
      rpc,
      playlistId: "pl-1",
      roomId: "room1",
      cache,
    })
    expect(fail.ok).toBe(false)
    expect(cache.store.size).toBe(0)

    const ok1 = await fetchLocalPlaylistTracks({
      rpc,
      playlistId: "pl-1",
      roomId: "room1",
      cache,
    })
    const ok2 = await fetchLocalPlaylistTracks({
      rpc,
      playlistId: "pl-1",
      roomId: "room1",
      cache,
    })
    expect(ok1).toEqual({ ok: true, tracks: [{ id: "t1" }] })
    expect(ok2).toEqual({ ok: true, tracks: [{ id: "t1" }] })
    expect(call).toHaveBeenCalledTimes(2)
  })
})
