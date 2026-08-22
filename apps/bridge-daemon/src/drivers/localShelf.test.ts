import { beforeEach, describe, expect, it, vi } from "vitest"
import { LocalDriver } from "./local"

const navidrome = {
  url: "http://nd.test",
  username: "dj",
  password: "pw",
} as any

const mpv = { socketPath: "/tmp/localShelf.test.sock" } as any

function playlistResponse(entries: unknown[]) {
  return {
    ok: true,
    json: async () => ({ "subsonic-response": { playlist: { entry: entries } } }),
  } as unknown as Response
}

function coverResponse() {
  return {
    ok: true,
    headers: new Map([["content-type", "image/jpeg"]]) as unknown as Headers,
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  } as unknown as Response
}

describe("LocalDriver shelf browsing", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("lists playlist tracks with local resource urls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("getPlaylist.view")) {
          return playlistResponse([
            { id: "t1", title: "Only Shallow", artist: "MBV", albumId: "al1", duration: 257 },
            { id: "t2", title: "Loomer", artist: "MBV", albumId: "al1", duration: 142 },
          ])
        }
        if (url.includes("getCoverArt.view")) return coverResponse()
        throw new Error(`unexpected fetch: ${url}`)
      }),
    )

    const driver = new LocalDriver(navidrome, mpv)
    const tracks = await driver.listPlaylistTracks("nd-lp")

    expect(tracks.map((t) => t.id)).toEqual(["t1", "t2"])
    expect(tracks[0]?.title).toBe("Only Shallow")
    expect(tracks[0]?.urls[0]).toEqual({ type: "resource", url: "local:t1", id: "t1" })
    expect(tracks[0]?.duration).toBe(257000)
  })

  it("listPlaylistTrackIds returns ordered ids without cover fetches", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("getPlaylist.view")) {
        return playlistResponse([
          { id: "t1", albumId: "al1" },
          { id: "t2", albumId: "al1" },
          { id: "t3" },
        ])
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)

    const driver = new LocalDriver(navidrome, mpv)
    await expect(driver.listPlaylistTrackIds("nd-lp")).resolves.toEqual([
      { id: "t1", albumId: "al1" },
      { id: "t2", albumId: "al1" },
      { id: "t3" },
    ])
    expect(fetchMock.mock.calls.every((c) => !String(c[0]).includes("getCoverArt"))).toBe(true)
  })

  it("listAlbumTrackIds returns ordered ids from getAlbum without mapSong covers", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("getAlbum.view") && url.includes("id=al-1")) {
        return {
          ok: true,
          json: async () => ({
            "subsonic-response": {
              album: {
                id: "al-1",
                name: "Loveless",
                song: [
                  { id: "t1", albumId: "al-1" },
                  { id: "t2", albumId: "al-1" },
                ],
              },
            },
          }),
        } as unknown as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)

    const driver = new LocalDriver(navidrome, mpv)
    await expect(driver.listAlbumTrackIds("al-1")).resolves.toEqual(["t1", "t2"])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("getAlbum.view")
  })

  it("returns playlist cover art keyed by playlist id", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("getCoverArt.view")) return coverResponse()
      throw new Error(`unexpected fetch: ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)

    const driver = new LocalDriver(navidrome, mpv)
    const covers = await driver.getPlaylistCoverArt(["nd-lp", " ", "nd-lp"])

    expect(Object.keys(covers)).toEqual(["nd-lp"])
    expect(covers["nd-lp"]).toMatch(/^data:image\/jpeg;base64,/)
    // Deduplicated: one cover fetch, addressed by the playlist cover key.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("id=pl-nd-lp")
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("size=640")
  })

  it("fetches sm and lg variants when requested", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("getCoverArt.view")) return coverResponse()
      throw new Error(`unexpected fetch: ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)

    const driver = new LocalDriver(navidrome, mpv)
    const covers = await driver.getPlaylistCoverArt(["nd-lp"], ["sm", "lg"])

    expect(covers["nd-lp"]).toEqual({
      sm: expect.stringMatching(/^data:image\/jpeg;base64,/),
      lg: expect.stringMatching(/^data:image\/jpeg;base64,/),
    })
    const urls = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(urls.some((u) => u.includes("size=384"))).toBe(true)
    expect(urls.some((u) => u.includes("size=1200"))).toBe(true)
    expect(urls.every((u) => u.includes("id=pl-nd-lp"))).toBe(true)
  })

  it("lists playlists including comment when present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("getPlaylists.view")) {
          return {
            ok: true,
            json: async () => ({
              "subsonic-response": {
                playlists: {
                  playlist: [
                    { id: "nd-1", name: "[LP] Loveless", songCount: 11, comment: "  Discogs note  " },
                    { id: "nd-2", name: "Favorites", songCount: 40, comment: "" },
                    { id: "nd-3", name: "[CD] Kid A", songCount: 10 },
                  ],
                },
              },
            }),
          } as unknown as Response
        }
        throw new Error(`unexpected fetch: ${url}`)
      }),
    )

    const driver = new LocalDriver(navidrome, mpv)
    const playlists = await driver.listPlaylists()

    expect(playlists.find((p) => p.id === "nd-1")).toEqual({
      id: "nd-1",
      name: "[LP] Loveless",
      songCount: 11,
      comment: "Discogs note",
    })
    expect(playlists.find((p) => p.id === "nd-2")).toEqual({
      id: "nd-2",
      name: "Favorites",
      songCount: 40,
    })
    expect(playlists.find((p) => p.id === "nd-3")).toEqual({
      id: "nd-3",
      name: "[CD] Kid A",
      songCount: 10,
    })
  })

  it("skips playlists without artwork", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404 }) as unknown as Response),
    )

    const driver = new LocalDriver(navidrome, mpv)
    await expect(driver.getPlaylistCoverArt(["nd-lp"])).resolves.toEqual({})
  })

  it("lists library albums with coverArt keys only (no data URIs)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("getAlbumList2.view") && url.includes("offset=0")) {
          return {
            ok: true,
            json: async () => ({
              "subsonic-response": {
                albumList2: {
                  album: [
                    {
                      id: "al-1",
                      name: "Loveless",
                      artist: "MBV",
                      year: 1991,
                      songCount: 11,
                      coverArt: "al-cover-1",
                      userRating: "5",
                    },
                    {
                      id: "al-2",
                      name: "Kid A",
                      artist: "Radiohead",
                      songCount: 10,
                      userRating: 4,
                    },
                  ],
                },
              },
            }),
          } as unknown as Response
        }
        if (url.includes("getAlbumList2.view") && url.includes("offset=500")) {
          return {
            ok: true,
            json: async () => ({ "subsonic-response": { albumList2: { album: [] } } }),
          } as unknown as Response
        }
        throw new Error(`unexpected fetch: ${url}`)
      }),
    )

    const driver = new LocalDriver(navidrome, mpv)
    const albums = await driver.listLibraryAlbums()

    expect(albums).toEqual([
      {
        id: "al-1",
        name: "Loveless",
        artist: "MBV",
        year: 1991,
        songCount: 11,
        coverArt: "al-cover-1",
        userRating: 5,
      },
      { id: "al-2", name: "Kid A", artist: "Radiohead", songCount: 10, userRating: 4 },
    ])
    expect(albums.every((a) => !a.coverArt?.startsWith("data:"))).toBe(true)
  })

  it("fetches album cover art without pl- prefix", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("getCoverArt.view")) return coverResponse()
      throw new Error(`unexpected fetch: ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)

    const driver = new LocalDriver(navidrome, mpv)
    const covers = await driver.getAlbumCoverArt(["al-1"], ["sm"])

    expect(covers["al-1"]).toEqual({
      sm: expect.stringMatching(/^data:image\/jpeg;base64,/),
    })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("id=al-1")
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("id=pl-")
  })

  it("filters findById via albumId allowlist without getAlbum union", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("getSong.view") && url.includes("id=t-ok")) {
        return {
          ok: true,
          json: async () => ({
            "subsonic-response": {
              song: {
                id: "t-ok",
                title: "In",
                artist: "A",
                albumId: "al-ok",
                duration: 10,
              },
            },
          }),
        } as unknown as Response
      }
      if (url.includes("getSong.view") && url.includes("id=t-out")) {
        return {
          ok: true,
          json: async () => ({
            "subsonic-response": {
              song: {
                id: "t-out",
                title: "Out",
                artist: "B",
                albumId: "al-other",
                duration: 10,
              },
            },
          }),
        } as unknown as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)

    const driver = new LocalDriver(navidrome, mpv)
    await expect(driver.findById("t-ok", undefined, ["al-ok"])).resolves.toMatchObject({
      id: "t-ok",
      title: "In",
    })
    await expect(driver.findById("t-out", undefined, ["al-ok"])).resolves.toBeNull()
    expect(fetchMock.mock.calls.every((c) => !String(c[0]).includes("getAlbum.view"))).toBe(true)
  })

  it("checkPlaylistMembership returns playlist and album id bags via getSong", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("getPlaylist.view") && url.includes("id=pl-1")) {
          return playlistResponse([{ id: "t1" }])
        }
        if (url.includes("getPlaylist.view")) {
          return playlistResponse([{ id: "other" }])
        }
        if (url.includes("getSong.view") && url.includes("id=t1")) {
          return {
            ok: true,
            json: async () => ({
              "subsonic-response": {
                song: { id: "t1", albumId: "al-1" },
              },
            }),
          } as unknown as Response
        }
        throw new Error(`unexpected fetch: ${url}`)
      }),
    )

    const driver = new LocalDriver(navidrome, mpv)
    await expect(
      driver.checkPlaylistMembership("t1", ["pl-1", "pl-miss"], ["al-1", "al-miss"]),
    ).resolves.toEqual({ playlistIds: ["pl-1"], albumIds: ["al-1"] })
  })

  it("albumsContainingTrack does not fetch every album in the filter", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("getSong.view") && url.includes("id=t1")) {
        return {
          ok: true,
          json: async () => ({
            "subsonic-response": { song: { id: "t1", albumId: "al-2" } },
          }),
        } as unknown as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)

    const driver = new LocalDriver(navidrome, mpv)
    const manyAlbums = Array.from({ length: 500 }, (_, i) => `al-${i}`)
    await expect(driver.albumsContainingTrack("t1", manyAlbums)).resolves.toEqual(["al-2"])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("getSong.view")
  })

  it("includeTrackAlbumId returns the song album without an albumIds filter", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("getPlaylist.view")) {
          return playlistResponse([])
        }
        if (url.includes("getSong.view") && url.includes("id=t9")) {
          return {
            ok: true,
            json: async () => ({
              "subsonic-response": { song: { id: "t9", albumId: "al-derived" } },
            }),
          } as unknown as Response
        }
        throw new Error(`unexpected fetch: ${url}`)
      }),
    )

    const driver = new LocalDriver(navidrome, mpv)
    await expect(
      driver.checkPlaylistMembership("t9", [], [], { includeTrackAlbumId: true }),
    ).resolves.toEqual({ playlistIds: [], albumIds: ["al-derived"] })
  })
})
