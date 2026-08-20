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
})
