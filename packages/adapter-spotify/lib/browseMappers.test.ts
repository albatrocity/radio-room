import { describe, expect, it } from "vitest"
import { mapSpotifyAlbumTrack, mapSpotifyBrowseAlbum, mapSpotifyBrowseArtist } from "./browseMappers"

describe("mapSpotifyBrowseArtist", () => {
  it("maps id title and images", () => {
    expect(
      mapSpotifyBrowseArtist({
        id: "a1",
        name: "Radiohead",
        images: [{ url: "https://img/a", height: 64, width: 64 }],
      }),
    ).toEqual({
      id: "a1",
      title: "Radiohead",
      images: [{ type: "image", url: "https://img/a", id: "64x64" }],
    })
  })
})

describe("mapSpotifyBrowseAlbum", () => {
  it("maps year from release_date", () => {
    expect(
      mapSpotifyBrowseAlbum({
        id: "al1",
        name: "OK Computer",
        artists: [{ id: "a1", name: "Radiohead" }],
        release_date: "1997-05-21",
        total_tracks: 12,
      }),
    ).toMatchObject({
      id: "al1",
      title: "OK Computer",
      year: "1997",
      trackCount: 12,
      artists: [{ id: "a1", title: "Radiohead", urls: [] }],
    })
  })
})

describe("mapSpotifyAlbumTrack", () => {
  it("parses simplified track with parent album envelope", () => {
    const track = mapSpotifyAlbumTrack(
      {
        id: "t1",
        name: "Paranoid Android",
        uri: "spotify:track:t1",
        duration_ms: 383000,
        explicit: false,
        track_number: 2,
        disc_number: 1,
        artists: [{ id: "a1", name: "Radiohead", uri: "spotify:artist:a1" }],
      },
      {
        id: "al1",
        name: "OK Computer",
        uri: "spotify:album:al1",
        images: [{ url: "https://img/al", height: 300, width: 300 }],
        artists: [{ id: "a1", name: "Radiohead", uri: "spotify:artist:a1" }],
        release_date: "1997-05-21",
        release_date_precision: "day",
        total_tracks: 12,
      },
    )
    expect(track.id).toBe("t1")
    expect(track.title).toBe("Paranoid Android")
    expect(track.album.title).toBe("OK Computer")
    expect(track.artists[0]?.title).toBe("Radiohead")
  })
})
