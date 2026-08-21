import { describe, expect, it } from "vitest"
import { mapLocalPlaylistRow, mapLocalLibraryAlbumRow } from "./localMetadata"

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
