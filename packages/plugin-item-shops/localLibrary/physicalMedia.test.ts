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
    })
    expect(parsePhysicalMediaName("[cd] Kid A")).toEqual({
      format: "CD",
      title: "Kid A",
      icon: "Disc",
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
      { "nd-1": "https://api.example/api/rooms/r1/images/pl-cover-nd-1-abcd1234" },
    )
    expect(items[0]?.definition.imageUrl).toBe(
      "https://api.example/api/rooms/r1/images/pl-cover-nd-1-abcd1234",
    )
    expect(items[1]?.definition.imageUrl).toBeUndefined()
    expect(items[1]?.definition.icon).toBe("Disc")
  })
})
