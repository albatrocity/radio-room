import { describe, expect, it } from "vitest"
import { parseSpotifyAlbumId, spotifyAlbumLore } from "./albumPicks"

const ID = "3Y4GAg6Wb4ZQZ9GzNhpQnn"

describe("parseSpotifyAlbumId", () => {
  it("accepts an id, a URL, and a URI", () => {
    expect(parseSpotifyAlbumId(ID)).toBe(ID)
    expect(parseSpotifyAlbumId(`https://open.spotify.com/album/${ID}?si=abc`)).toBe(ID)
    expect(parseSpotifyAlbumId(`https://open.spotify.com/intl-de/album/${ID}`)).toBe(ID)
    expect(parseSpotifyAlbumId(`spotify:album:${ID}`)).toBe(ID)
  })

  it("rejects tracks, other hosts, and junk", () => {
    expect(parseSpotifyAlbumId(`https://open.spotify.com/track/${ID}`)).toBeNull()
    expect(parseSpotifyAlbumId(`https://example.com/album/${ID}`)).toBeNull()
    expect(parseSpotifyAlbumId("harvest")).toBeNull()
  })
})

describe("spotifyAlbumLore", () => {
  it("joins year, label, and the phonogram line", () => {
    expect(
      spotifyAlbumLore({
        release_date: "1972-02-01",
        label: "Reprise",
        copyrights: [
          { text: "© 1972 Reprise Records", type: "C" },
          { text: "1972 Reprise Records", type: "P" },
        ],
      }),
    ).toBe("Released 1972 on Reprise. ℗ 1972 Reprise Records")
  })

  it("is undefined with nothing to say", () => {
    expect(spotifyAlbumLore({})).toBeUndefined()
  })
})
