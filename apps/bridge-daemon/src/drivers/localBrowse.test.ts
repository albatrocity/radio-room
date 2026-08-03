import { describe, expect, it } from "vitest"
import {
  coverArtImages,
  mapNavidromeAlbumList,
  mapNavidromeArtists,
  mapNavidromeBrowseAlbum,
} from "./local"

const coverArtUrl = (id: string) => `https://nd.example/rest/getCoverArt.view?id=${id}&size=128`

describe("coverArtImages", () => {
  it("returns undefined without coverArt or url fn", () => {
    expect(coverArtImages(undefined, coverArtUrl)).toBeUndefined()
    expect(coverArtImages("ar-1")).toBeUndefined()
  })

  it("builds a single image entry", () => {
    expect(coverArtImages("ar-1", coverArtUrl)).toEqual([
      { type: "image", url: "https://nd.example/rest/getCoverArt.view?id=ar-1&size=128", id: "ar-1" },
    ])
  })
})

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
    expect(items).toEqual([
      { id: "2", title: "Beach House", albumCount: undefined, images: undefined },
    ])
  })

  it("maps coverArt to images when url fn provided", () => {
    const items = mapNavidromeArtists(
      [{ artist: [{ id: "1", name: "Alpha", coverArt: "ar-1" }] }],
      undefined,
      coverArtUrl,
    )
    expect(items[0]?.images).toEqual([
      { type: "image", url: "https://nd.example/rest/getCoverArt.view?id=ar-1&size=128", id: "ar-1" },
    ])
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
      images: undefined,
    })
  })

  it("maps coverArt to images when url fn provided", () => {
    expect(
      mapNavidromeBrowseAlbum(
        { id: "a1", name: "Abbey Road", coverArt: "al-1" },
        coverArtUrl,
      )?.images,
    ).toEqual([
      { type: "image", url: "https://nd.example/rest/getCoverArt.view?id=al-1&size=128", id: "al-1" },
    ])
  })

  it("returns null without id", () => {
    expect(mapNavidromeBrowseAlbum({ name: "Nope" })).toBeNull()
  })
})

describe("mapNavidromeAlbumList", () => {
  it("maps array of albums and skips invalid", () => {
    const items = mapNavidromeAlbumList([
      { id: "1", name: "A", artist: "X", year: 2000 },
      { name: "no-id" },
      { id: "2", name: "B" },
    ])
    expect(items.map((a) => a.id)).toEqual(["1", "2"])
  })
})
