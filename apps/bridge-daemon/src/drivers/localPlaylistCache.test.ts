import { describe, expect, it, vi } from "vitest"
import {
  albumsFromMembership,
  artistsFromMembership,
  membershipFromPlaylistEntries,
  PlaylistMembershipCache,
  unionMembership,
} from "./localPlaylistCache"

describe("localPlaylistCache", () => {
  it("builds membership from playlist entries", () => {
    const m = membershipFromPlaylistEntries([
      {
        id: "t1",
        artistId: "a1",
        artist: "Artist One",
        albumId: "al1",
        album: "Album One",
      },
      {
        id: "t2",
        artistId: "a1",
        artist: "Artist One",
        albumId: "al2",
        album: "Album Two",
      },
    ])
    expect([...m.trackIds].sort()).toEqual(["t1", "t2"])
    expect(m.artists.get("a1")).toBe("Artist One")
    expect(m.albums.size).toBe(2)
  })

  it("unions membership sets", () => {
    const a = membershipFromPlaylistEntries([{ id: "t1", artistId: "a1", artist: "A" }])
    const b = membershipFromPlaylistEntries([{ id: "t2", artistId: "a2", artist: "B" }])
    const u = unionMembership([a, b])
    expect(u.trackIds.has("t1")).toBe(true)
    expect(u.trackIds.has("t2")).toBe(true)
    expect(u.artists.size).toBe(2)
  })

  it("builds browse artists/albums from membership", () => {
    const m = membershipFromPlaylistEntries([
      {
        id: "t1",
        artistId: "a1",
        artist: "Zebra",
        albumId: "al1",
        album: "Zoo",
      },
    ])
    expect(artistsFromMembership(m).map((x) => x.title)).toEqual(["Zebra"])
    expect(albumsFromMembership(m, "zo").map((x) => x.title)).toEqual(["Zoo"])
  })

  it("caches getPlaylist fetches until TTL", async () => {
    const fetchEntries = vi.fn(async (playlistId: string) =>
      playlistId === "pl-1" ? [{ id: "t1" }] : [{ id: "t9" }],
    )
    const cache = new PlaylistMembershipCache(fetchEntries, 60_000)
    await cache.get("pl-1")
    await cache.get("pl-1")
    expect(fetchEntries).toHaveBeenCalledTimes(1)
    const members = await cache.playlistsContainingTrack("t1", ["pl-1", "pl-2"])
    expect(members).toEqual(["pl-1"])
    expect(fetchEntries).toHaveBeenCalledTimes(2) // pl-2 miss
  })

  it("refetches after invalidate", async () => {
    const fetchEntries = vi.fn(async () => [{ id: "t1" }])
    const cache = new PlaylistMembershipCache(fetchEntries, 60_000)
    await cache.get("pl-1")
    cache.invalidate()
    await cache.get("pl-1")
    expect(fetchEntries).toHaveBeenCalledTimes(2)
  })

  it("memoizes getUnion for the same playlist set", async () => {
    const fetchEntries = vi.fn(async (playlistId: string) =>
      playlistId === "pl-1" ? [{ id: "t1" }] : [{ id: "t2" }],
    )
    const cache = new PlaylistMembershipCache(fetchEntries, 60_000)
    const a = await cache.getUnion(["pl-2", "pl-1"])
    const b = await cache.getUnion(["pl-1", "pl-2"])
    expect(a.trackIds.has("t1")).toBe(true)
    expect(a.trackIds.has("t2")).toBe(true)
    expect(b).toBe(a)
    expect(fetchEntries).toHaveBeenCalledTimes(2)
  })

  it("fetches playlistsContainingTrack in parallel and honors firstMatch", async () => {
    let inflight = 0
    let maxInflight = 0
    const fetchEntries = vi.fn(async (playlistId: string) => {
      inflight++
      maxInflight = Math.max(maxInflight, inflight)
      await new Promise((r) => setTimeout(r, 20))
      inflight--
      return playlistId === "pl-2" ? [{ id: "t1" }] : [{ id: "t9" }]
    })
    const cache = new PlaylistMembershipCache(fetchEntries, 60_000)
    const first = await cache.playlistsContainingTrack("t1", ["pl-1", "pl-2", "pl-3"], {
      firstMatch: true,
    })
    expect(first).toEqual(["pl-2"])
    expect(maxInflight).toBeGreaterThan(1)
  })

  it("evicts least-recently-used playlist when over max entries", async () => {
    const fetchEntries = vi.fn(async (playlistId: string) => [{ id: playlistId }])
    const cache = new PlaylistMembershipCache(fetchEntries, 60_000, 2)
    await cache.get("a")
    await cache.get("b")
    await cache.get("c")
    await cache.get("a")
    expect(fetchEntries).toHaveBeenCalledTimes(4)
  })
})
