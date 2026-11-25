import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { listLibraryAlbums, mergeAlbumUserRatings } from "./recordPicks.js"
import { resetRecordLibrarySourceForTests, setRecordLibrarySource } from "./recordLibrarySource.js"

describe("mergeAlbumUserRatings", () => {
  it("fills a star rating when only the highest list has one", () => {
    const merged = mergeAlbumUserRatings([{ id: "a", name: "Abbey" }], new Map([["a", 4]]))
    expect(merged[0]).toMatchObject({ id: "a", userRating: 4 })
  })

  it("keeps a rating already on the alphabetical page", () => {
    const merged = mergeAlbumUserRatings(
      [{ id: "a", name: "Abbey", userRating: 2 }],
      new Map([["a", 5]]),
    )
    expect(merged[0]?.userRating).toBe(2)
  })
})

describe("listLibraryAlbums live overlay", () => {
  const envKeys = ["NAVIDROME_URL", "NAVIDROME_USER", "NAVIDROME_PASSWORD"] as const
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))

  afterEach(() => {
    resetRecordLibrarySourceForTests()
    vi.unstubAllGlobals()
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  })

  it("overlays highest-list stars onto getAlbumList2 rows", async () => {
    const dir = mkdtempSync(join(tmpdir(), "studio-live-"))
    setRecordLibrarySource({ mode: "live" }, join(dir, "studio-library.json"))
    process.env.NAVIDROME_URL = "http://nd.test"
    process.env.NAVIDROME_USER = "dj"
    process.env.NAVIDROME_PASSWORD = "pw"
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input)
        const body = url.includes("getAlbumList2")
          ? {
              "subsonic-response": {
                status: "ok",
                albumList2: { album: [{ id: "a", name: "Abbey", artist: "Beatles" }] },
              },
            }
          : {
              "subsonic-response": {
                status: "ok",
                albumList: { album: [{ id: "a", userRating: 4 }] },
              },
            }
        return new Response(JSON.stringify(body), { status: 200 })
      }),
    )

    const albums = await listLibraryAlbums()
    expect(albums[0]).toMatchObject({ id: "a", name: "Abbey", userRating: 4 })
  })
})
