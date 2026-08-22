import { describe, expect, it } from "vitest"
import {
  albumIdsShadowedByPlaylists,
  cdEraDiscFormat,
  derivePhysicalMediaItems,
  derivePhysicalMediaItemsFromAlbums,
  inferPhysicalMediaFormat,
  parsePhysicalMediaName,
  rarityFromUserRating,
  splitPhysicalMediaArtistTitle,
  physicalMediaAlbumShortId,
  physicalMediaShortId,
  priceFromSongCount,
} from "./physicalMedia"

describe("physicalMedia derivation", () => {
  it("parses format prefixes and ignores unprefixed playlists", () => {
    expect(parsePhysicalMediaName("[LP] Loveless")).toEqual({
      format: "LP",
      title: "Loveless",
      icon: "Disc3",
      artworkFrame: "record-jacket",
    })
    expect(parsePhysicalMediaName("[cd] Kid A")).toEqual({
      format: "CD",
      title: "Kid A",
      icon: "Disc",
      artworkFrame: "jewel-case",
    })
    expect(parsePhysicalMediaName("Just a mixtape")).toBeNull()
  })

  it("parses optional rarity tags in any order with format", () => {
    expect(parsePhysicalMediaName("[LP][RARE] Loveless")).toMatchObject({
      format: "LP",
      title: "Loveless",
      rarity: "rare",
      artworkFrame: "record-jacket",
    })
    expect(parsePhysicalMediaName("[RARE][CD] Kid A")).toMatchObject({
      format: "CD",
      title: "Kid A",
      rarity: "rare",
    })
    expect(parsePhysicalMediaName("[legendary][45] Single")).toMatchObject({
      format: "45",
      title: "Single",
      rarity: "legendary",
    })
  })

  it("does not derive when an unrecognized bracket precedes the format tag", () => {
    expect(parsePhysicalMediaName("[LIVE][LP] Mix")).toBeNull()
  })

  it("stops at unrecognized brackets after recognized ones", () => {
    // Format+rarity consumed; [LIVE] ends the run — title keeps the rest including [LIVE].
    expect(parsePhysicalMediaName("[LP][RARE][LIVE] Mix")).toMatchObject({
      format: "LP",
      rarity: "rare",
      title: "[LIVE] Mix",
    })
  })

  it("splits artist from playlist titles and overrides", () => {
    expect(splitPhysicalMediaArtistTitle("Loveless")).toEqual({ title: "Loveless" })
    expect(splitPhysicalMediaArtistTitle("My Bloody Valentine — Loveless")).toEqual({
      artist: "My Bloody Valentine",
      title: "Loveless",
    })
    expect(splitPhysicalMediaArtistTitle("Radiohead - Kid A")).toEqual({
      artist: "Radiohead",
      title: "Kid A",
    })
  })

  it("derives durable collection items keyed by playlist id", () => {
    const { items, playlistMap } = derivePhysicalMediaItems(
      [
        { id: "nd-1", name: "[LP] Loveless", songCount: 11 },
        { id: "nd-skip", name: "Favorites", songCount: 40 },
        { id: "nd-2", name: "[45] Single", songCount: 2 },
      ],
      [{ playlistId: "nd-1", name: "My Bloody Valentine — Loveless", coinValue: 99 }],
    )
    expect(items.map((e) => e.definition.shortId)).toEqual([
      physicalMediaShortId("nd-1"),
      physicalMediaShortId("nd-2"),
    ])
    expect(items[0]?.definition.name).toBe("Loveless")
    expect(items[0]?.definition.artist).toBe("My Bloody Valentine")
    expect(items[0]?.definition.coinValue).toBe(99)
    expect(items[0]?.definition.rarity).toBe("common")
    expect(items[0]?.definition.slotPool).toBe("collection")
    expect(items[0]?.definition.detailView).toEqual({
      actionIcon: "Eye",
      actionLabel: "View",
      iconOnly: true,
      layout: "trackList",
    })
    expect(items[0]?.localLibraryGrant).toEqual({
      scope: "playlist",
      playlistKey: physicalMediaShortId("nd-1"),
      redemption: "durable",
    })
    expect(items[1]?.definition.name).toBe("45: Single")
    expect(items[1]?.definition.artist).toBeUndefined()
    expect(items[1]?.definition.coinValue).toBe(priceFromSongCount(2))
    expect(items[1]?.definition.rarity).toBe("common")
    expect(playlistMap[physicalMediaShortId("nd-1")]).toBe("nd-1")
  })

  it("applies title-tag rarity and keeps price from song count", () => {
    const { items } = derivePhysicalMediaItems([
      { id: "nd-1", name: "[LP][RARE] Loveless", songCount: 11 },
      { id: "nd-2", name: "[LEGENDARY][45] Single", songCount: 2 },
    ])
    expect(items[0]?.definition.rarity).toBe("rare")
    expect(items[0]?.definition.coinValue).toBe(priceFromSongCount(11))
    expect(items[0]?.definition.name).toBe("LP: Loveless")
    expect(items[1]?.definition.rarity).toBe("legendary")
    expect(items[1]?.definition.coinValue).toBe(priceFromSongCount(2))
  })

  it("lets physicalMediaOverrides.rarity win over title tags", () => {
    const { items } = derivePhysicalMediaItems(
      [{ id: "nd-1", name: "[LP][RARE] Loveless", songCount: 11 }],
      [{ playlistId: "nd-1", rarity: "legendary" }],
    )
    expect(items[0]?.definition.rarity).toBe("legendary")
  })

  it("uses shadowed album userRating when no override or title tag", () => {
    const { items } = derivePhysicalMediaItems(
      [{ id: "nd-1", name: "[LP] Loveless", songCount: 11 }],
      [],
      {},
      { "nd-1": 5 },
    )
    expect(items[0]?.definition.rarity).toBe("legendary")
    expect(items[0]?.definition.coinValue).toBe(priceFromSongCount(11))
  })

  it("does not let album rating override a title-tag rarity", () => {
    const { items } = derivePhysicalMediaItems(
      [{ id: "nd-1", name: "[LP][COMMON] Loveless", songCount: 11 }],
      [],
      {},
      { "nd-1": 5 },
    )
    expect(items[0]?.definition.rarity).toBe("common")
  })

  it("attaches playlist artwork to the derived definition when available", () => {
    const { items } = derivePhysicalMediaItems(
      [
        { id: "nd-1", name: "[LP] Loveless", songCount: 11 },
        { id: "nd-2", name: "[CD] Kid A", songCount: 10 },
      ],
      [],
      { "nd-1": { imageUrl: "https://api.example/api/rooms/r1/images/pl-cover-nd-1-abcd1234" } },
    )
    expect(items[0]?.definition.imageUrl).toBe(
      "https://api.example/api/rooms/r1/images/pl-cover-nd-1-abcd1234",
    )
    expect(items[0]?.definition.imageUrlLarge).toBeUndefined()
    expect(items[1]?.definition.imageUrl).toBeUndefined()
    expect(items[1]?.definition.icon).toBe("Disc")
  })

  it("attaches both cover variants when available", () => {
    const { items } = derivePhysicalMediaItems(
      [{ id: "nd-1", name: "[LP] Loveless", songCount: 11 }],
      [],
      {
        "nd-1": {
          imageUrl: "https://api.example/sm",
          imageUrlLarge: "https://api.example/lg",
        },
      },
    )
    expect(items[0]?.definition.imageUrl).toBe("https://api.example/sm")
    expect(items[0]?.definition.imageUrlLarge).toBe("https://api.example/lg")
  })

  it("maps each prefix to the correct artworkFrame", () => {
    const { items } = derivePhysicalMediaItems([
      { id: "cd", name: "[CD] Album", songCount: 10 },
      { id: "lp", name: "[LP] Album", songCount: 10 },
      { id: "tape", name: "[TAPE] Mix", songCount: 10 },
      { id: "45", name: "[45] Single", songCount: 2 },
    ])
    expect(items.map((e) => e.definition.artworkFrame)).toEqual([
      "jewel-case",
      "record-jacket",
      "cassette-case",
      "die-cut-jacket",
    ])
  })

  it("sets artworkFrame even when cover art is missing", () => {
    const { items } = derivePhysicalMediaItems([
      { id: "nd-1", name: "[LP] Loveless", songCount: 11 },
    ])
    expect(items[0]?.definition.artworkFrame).toBe("record-jacket")
    expect(items[0]?.definition.imageUrl).toBeUndefined()
  })

  it("omits cover art when blankDisc override is set", () => {
    const { items } = derivePhysicalMediaItems(
      [{ id: "nd-1", name: "[CD] Kid A", songCount: 10 }],
      [{ playlistId: "nd-1", blankDisc: true }],
      { "nd-1": { imageUrl: "https://api.example/sm", imageUrlLarge: "https://api.example/lg" } },
    )
    expect(items[0]?.definition.artworkFrame).toBe("jewel-case")
    expect(items[0]?.definition.imageUrl).toBeUndefined()
    expect(items[0]?.definition.imageUrlLarge).toBeUndefined()
  })

  it("pulls artist from a prefixed playlist remainder", () => {
    const { items } = derivePhysicalMediaItems([
      { id: "nd-1", name: "[LP] My Bloody Valentine — Loveless", songCount: 11 },
    ])
    expect(items[0]?.definition.name).toBe("LP: Loveless")
    expect(items[0]?.definition.artist).toBe("My Bloody Valentine")
  })

  it("uses the playlist comment as description when present", () => {
    const { items } = derivePhysicalMediaItems([
      {
        id: "nd-1",
        name: "[LP] Loveless",
        songCount: 11,
        comment: "My Bloody Valentine, 1991.\nhttps://www.discogs.com/master/123",
      },
    ])
    expect(items[0]?.definition.description).toBe(
      "My Bloody Valentine, 1991.\nhttps://www.discogs.com/master/123",
    )
  })

  it("falls back to the canned description when comment is missing or blank", () => {
    const canned = "A LP from the Record Store. Queue any track on it for the rest of the session."
    const { items } = derivePhysicalMediaItems([
      { id: "nd-1", name: "[LP] Loveless", songCount: 11 },
      { id: "nd-2", name: "[LP] Loveless", songCount: 11, comment: "   " },
    ])
    expect(items[0]?.definition.description).toBe(canned)
    expect(items[1]?.definition.description).toBe(canned)
  })
})

describe("rarityFromUserRating", () => {
  it("maps stars to rarity tiers", () => {
    expect(rarityFromUserRating(undefined)).toBe("common")
    expect(rarityFromUserRating(0)).toBe("common")
    expect(rarityFromUserRating(1)).toBe("common")
    expect(rarityFromUserRating(2)).toBe("uncommon")
    expect(rarityFromUserRating(3)).toBe("uncommon")
    expect(rarityFromUserRating(4)).toBe("rare")
    expect(rarityFromUserRating(5)).toBe("legendary")
  })

  it("coerces Subsonic string ratings", () => {
    expect(rarityFromUserRating("5")).toBe("legendary")
    expect(rarityFromUserRating("4")).toBe("rare")
    expect(rarityFromUserRating(" 2 ")).toBe("uncommon")
  })
})

describe("inferPhysicalMediaFormat", () => {
  it("maps year and song count to format frames", () => {
    expect(inferPhysicalMediaFormat(1975, 2)).toMatchObject({
      format: "45",
      artworkFrame: "die-cut-jacket",
    })
    expect(inferPhysicalMediaFormat(1985, 10)).toMatchObject({
      format: "Cassette",
      artworkFrame: "cassette-case",
    })
    expect(inferPhysicalMediaFormat(1995, 12)).toMatchObject({
      format: "CD",
      artworkFrame: "jewel-case",
    })
    expect(inferPhysicalMediaFormat(1972, 10)).toMatchObject({
      format: "LP",
      artworkFrame: "record-jacket",
    })
  })

  it("treats short releases as 45s regardless of year", () => {
    expect(inferPhysicalMediaFormat(2005, 1).format).toBe("45")
    expect(inferPhysicalMediaFormat(1968, 3).format).toBe("45")
  })

  it("defaults long albums without a year to CD when no seed is given", () => {
    expect(inferPhysicalMediaFormat(undefined, 10)).toMatchObject({
      format: "CD",
      artworkFrame: "jewel-case",
    })
  })

  it("splits CD-era non-singles 60/40 CD vs LP from album seed", () => {
    const formats = new Set(
      Array.from({ length: 40 }, (_, i) => inferPhysicalMediaFormat(1995, 12, `id-${i}`).format),
    )
    expect(formats.has("CD")).toBe(true)
    expect(formats.has("LP")).toBe(true)
    expect(inferPhysicalMediaFormat(undefined, 10, "seed-lp")).toEqual(
      inferPhysicalMediaFormat(2001, 10, "seed-lp"),
    )
    expect(inferPhysicalMediaFormat(1985, 10, "any-seed")).toMatchObject({
      format: "Cassette",
    })
    expect(inferPhysicalMediaFormat(1972, 10, "any-seed")).toMatchObject({
      format: "LP",
    })
  })
})

describe("cdEraDiscFormat", () => {
  it("is stable for a given album id", () => {
    expect(cdEraDiscFormat("al-1")).toBe(cdEraDiscFormat("al-1"))
  })

  it("lands near 60% CD across many ids", () => {
    let cds = 0
    for (let i = 0; i < 1000; i++) {
      if (cdEraDiscFormat(`album-${i}`) === "CD") cds++
    }
    expect(cds).toBeGreaterThan(520)
    expect(cds).toBeLessThan(680)
  })
})

describe("derivePhysicalMediaItemsFromAlbums", () => {
  it("derives durable collection items keyed by album id", () => {
    const { items, albumMap } = derivePhysicalMediaItemsFromAlbums([
      {
        id: "al-1",
        name: "Loveless",
        artist: "My Bloody Valentine",
        year: 1991,
        songCount: 11,
      },
      { id: "al-2", name: "Single", year: 1975, songCount: 2 },
    ])
    expect(items.map((e) => e.definition.shortId)).toEqual([
      physicalMediaAlbumShortId("al-1"),
      physicalMediaAlbumShortId("al-2"),
    ])
    const lovelessFormat = inferPhysicalMediaFormat(1991, 11, "al-1")
    expect(items[0]?.definition.name).toBe(`${lovelessFormat.format}: Loveless`)
    expect(items[0]?.definition.artworkFrame).toBe(lovelessFormat.artworkFrame)
    expect(items[0]?.definition.artist).toBe("My Bloody Valentine")
    expect(items[0]?.definition.rarity).toBe("common")
    expect(items[0]?.definition.coinValue).toBe(priceFromSongCount(11))
    expect(items[0]?.definition.slotPool).toBe("collection")
    expect(items[0]?.definition.detailView).toEqual({
      actionIcon: "Eye",
      actionLabel: "View",
      iconOnly: true,
      layout: "trackList",
    })
    expect(items[0]?.localLibraryGrant).toEqual({
      scope: "album",
      albumKey: physicalMediaAlbumShortId("al-1"),
      redemption: "durable",
    })
    expect(items[1]?.definition.name).toBe("45: Single")
    expect(items[1]?.definition.artist).toBeUndefined()
    expect(items[1]?.definition.artworkFrame).toBe("die-cut-jacket")
    expect(albumMap[physicalMediaAlbumShortId("al-1")]).toBe("al-1")
  })

  it("uses userRating for rarity and song count for price", () => {
    const { items } = derivePhysicalMediaItemsFromAlbums([
      {
        id: "al-1",
        name: "Loveless",
        year: 1991,
        songCount: 11,
        userRating: 5,
      },
    ])
    expect(items[0]?.definition.rarity).toBe("legendary")
    expect(items[0]?.definition.coinValue).toBe(20)
  })

  it("omits albums in omitAlbumIds", () => {
    const { items } = derivePhysicalMediaItemsFromAlbums(
      [
        { id: "al-1", name: "Keep", songCount: 10, year: 1995 },
        { id: "al-2", name: "Skip", songCount: 10, year: 1995 },
      ],
      {},
      new Set(["al-2"]),
    )
    expect(items.map((e) => e.definition.shortId)).toEqual([physicalMediaAlbumShortId("al-1")])
  })

  it("attaches album artwork when available", () => {
    const { items } = derivePhysicalMediaItemsFromAlbums(
      [{ id: "al-1", name: "Kid A", artist: "Radiohead", year: 2000, songCount: 10 }],
      { "al-1": { imageUrl: "https://api.example/sm", imageUrlLarge: "https://api.example/lg" } },
    )
    expect(items[0]?.definition.imageUrl).toBe("https://api.example/sm")
    expect(items[0]?.definition.imageUrlLarge).toBe("https://api.example/lg")
  })
})

describe("albumIdsShadowedByPlaylists", () => {
  it("omits albums whose ordered track ids match a playlist", () => {
    const shadowed = albumIdsShadowedByPlaylists(
      [{ trackIds: ["t1", "t2", "t3"] }],
      [
        { id: "al-1", trackIds: ["t1", "t2", "t3"] },
        { id: "al-2", trackIds: ["t1", "t2"] },
      ],
    )
    expect([...shadowed]).toEqual(["al-1"])
  })

  it("keeps albums when playlist is shuffled, subset, or has extras", () => {
    const shadowed = albumIdsShadowedByPlaylists(
      [
        { trackIds: ["t2", "t1", "t3"] },
        { trackIds: ["t1", "t2"] },
        { trackIds: ["t1", "t2", "t3", "t4"] },
      ],
      [{ id: "al-1", trackIds: ["t1", "t2", "t3"] }],
    )
    expect(shadowed.size).toBe(0)
  })

  it("never shadows when either side is empty", () => {
    expect(albumIdsShadowedByPlaylists([], [{ id: "al-1", trackIds: ["t1"] }]).size).toBe(0)
    expect(
      albumIdsShadowedByPlaylists([{ trackIds: [] }], [{ id: "al-1", trackIds: ["t1"] }]).size,
    ).toBe(0)
    expect(
      albumIdsShadowedByPlaylists([{ trackIds: ["t1"] }], [{ id: "al-1", trackIds: [] }]).size,
    ).toBe(0)
  })
})
