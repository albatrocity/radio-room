import { describe, expect, it } from "vitest"
import {
  derivePhysicalMediaItems,
  parsePhysicalMediaName,
  physicalMediaShortId,
  priceFromSongCount,
  rarityFromSongCount,
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
    expect(items[0]?.definition.name).toBe("My Bloody Valentine — Loveless")
    expect(items[0]?.definition.coinValue).toBe(99)
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
    expect(items[1]?.definition.coinValue).toBe(priceFromSongCount(2))
    expect(items[1]?.definition.rarity).toBe(rarityFromSongCount(2))
    expect(playlistMap[physicalMediaShortId("nd-1")]).toBe("nd-1")
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
