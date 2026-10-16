import { describe, expect, it, vi } from "vitest"
import {
  getLocalAlbumComments,
  mapLocalPlaylistRow,
  mapLocalLibraryAlbumRow,
  normalizeAlbumCommentsResult,
} from "./localMetadata"
import type { BridgeRpcClient } from "./rpcClient"

describe("normalizeAlbumCommentsResult", () => {
  it("keeps trimmed non-empty strings and drops everything else", () => {
    expect(
      normalizeAlbumCommentsResult({ a: "  Notes  ", b: "   ", c: 3, d: null }),
    ).toEqual({ a: "Notes" })
    expect(normalizeAlbumCommentsResult([])).toEqual({})
    expect(normalizeAlbumCommentsResult(null)).toEqual({})
  })
})

describe("getLocalAlbumComments", () => {
  it("returns {} when the daemon does not know the method (old DJ Mac pack)", async () => {
    const rpc = {
      isPresent: vi.fn(async () => true),
      call: vi.fn(async () => {
        throw new Error("Unknown method: getAlbumComments")
      }),
    } as unknown as BridgeRpcClient
    await expect(getLocalAlbumComments({ rpc, albumIds: ["al-1"] })).resolves.toEqual({})
  })

  it("batches album ids and merges results", async () => {
    const call = vi.fn(async (_method: string, params: Record<string, unknown>) => {
      const ids = params.albumIds as string[]
      return Object.fromEntries(ids.map((id) => [id, `notes ${id}`]))
    })
    const rpc = { isPresent: vi.fn(async () => true), call } as unknown as BridgeRpcClient
    const ids = Array.from({ length: 10 }, (_, i) => `al-${i}`)
    const out = await getLocalAlbumComments({ rpc, albumIds: ids })
    expect(call).toHaveBeenCalledTimes(2)
    expect(Object.keys(out)).toHaveLength(10)
  })
})

describe("mapLocalPlaylistRow", () => {
  it("maps id, name, songCount, and trimmed comment", () => {
    expect(
      mapLocalPlaylistRow({
        id: "nd-1",
        name: "[LP] Loveless",
        songCount: 11,
        comment: "  Discogs: https://www.discogs.com/master/123  ",
      }),
    ).toEqual({
      id: "nd-1",
      name: "[LP] Loveless",
      songCount: 11,
      comment: "Discogs: https://www.discogs.com/master/123",
    })
  })

  it("omits comment when missing or blank (stale DJ Mac / empty Navidrome field)", () => {
    expect(mapLocalPlaylistRow({ id: "nd-1", name: "Favorites" })).toEqual({
      id: "nd-1",
      name: "Favorites",
    })
    expect(mapLocalPlaylistRow({ id: "nd-1", name: "Favorites", comment: "  " })).toEqual({
      id: "nd-1",
      name: "Favorites",
    })
  })

  it("returns null for rows without an id", () => {
    expect(mapLocalPlaylistRow(null)).toBeNull()
    expect(mapLocalPlaylistRow({ name: "x" })).toBeNull()
  })
})

describe("mapLocalLibraryAlbumRow", () => {
  it("copies a finite 1–5 userRating", () => {
    expect(
      mapLocalLibraryAlbumRow({
        id: "al-1",
        name: "Loveless",
        songCount: 11,
        userRating: 5,
      }),
    ).toEqual({
      id: "al-1",
      name: "Loveless",
      songCount: 11,
      userRating: 5,
    })
  })

  it("coerces string userRating / year / songCount from Subsonic JSON", () => {
    expect(
      mapLocalLibraryAlbumRow({
        id: "al-1",
        name: "Loveless",
        year: "1991",
        songCount: "11",
        userRating: "5",
      }),
    ).toEqual({
      id: "al-1",
      name: "Loveless",
      year: 1991,
      songCount: 11,
      userRating: 5,
    })
  })

  it("omits userRating when missing or out of range (stale pack / unrated)", () => {
    expect(mapLocalLibraryAlbumRow({ id: "al-1", name: "Kid A" })).toEqual({
      id: "al-1",
      name: "Kid A",
    })
    expect(mapLocalLibraryAlbumRow({ id: "al-1", name: "Kid A", userRating: 0 })).toEqual({
      id: "al-1",
      name: "Kid A",
    })
    expect(mapLocalLibraryAlbumRow({ id: "al-1", name: "Kid A", userRating: 6 })).toEqual({
      id: "al-1",
      name: "Kid A",
    })
  })
})
