import { describe, expect, it } from "vitest"
import { mapNavidromeArtists, mapNavidromeBrowseAlbum } from "./local"

describe("mapNavidromeArtists", () => {
  it("flattens indexes and sorts by title", () => {
    const items = mapNavidromeArtists([
      { artist: [{ id: "2", name: "Zebra", albumCount: 1 }, { id: "1", name: "Alpha", albumCount: 3 }] },
      { artist: { id: "3", name: "Beta" } },
    ])
    expect(items.map((a) => a.title)).toEqual(["Alpha", "Beta", "Zebra"])
    expect(items[0]).toMatchObject({ id: "1", albumCount: 3 })
  })

  it("filters by query case-insensitively", () => {
    const items = mapNavidromeArtists(
      [{ artist: [{ id: "1", name: "The Beatles" }, { id: "2", name: "Beach House" }] }],
      "beach",
    )
    expect(items).toEqual([{ id: "2", title: "Beach House", albumCount: undefined }])
  })

  it("skips artists without id", () => {
    expect(mapNavidromeArtists([{ artist: [{ name: "No Id" }] }])).toEqual([])
  })
})

describe("mapNavidromeBrowseAlbum", () => {
  it("maps album fields", () => {
    expect(
      mapNavidromeBrowseAlbum({
        id: "a1",
        name: "Abbey Road",
        artist: "The Beatles",
        artistId: "b1",
        year: 1969,
        songCount: 17,
      }),
    ).toEqual({
      id: "a1",
      title: "Abbey Road",
      artists: [{ id: "b1", title: "The Beatles", urls: [] }],
      year: "1969",
      trackCount: 17,
    })
  })

  it("returns null without id", () => {
    expect(mapNavidromeBrowseAlbum({ name: "Nope" })).toBeNull()
  })
})
