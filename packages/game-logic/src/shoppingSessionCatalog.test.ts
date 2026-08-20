import { describe, expect, it } from "vitest"
import type { ItemCatalogEntry } from "./shoppingSessionCatalog"
import { buildItemCatalogMap, buildShoppingInstance } from "./shoppingSessionCatalog"

const PM_ENTRY: ItemCatalogEntry = {
  definition: {
    shortId: "pm-loveless",
    name: "LP: Loveless",
    description: "A LP from the Record Store.",
    icon: "Disc3",
    imageUrl: "/api/rooms/r1/images/pl-cover",
    imageUrlLarge: "/api/rooms/r1/images/pl-cover-lg",
    artworkFrame: "record-jacket",
    stackable: true,
    maxStack: 5,
    tradeable: true,
    consumable: false,
    coinValue: 20,
    rarity: "uncommon",
    slotPool: "collection",
  },
}

describe("buildShoppingInstance", () => {
  it("copies artworkFrame onto shop offers", () => {
    const catalogMap = buildItemCatalogMap([PM_ENTRY])
    const shop = {
      shopId: "record-store",
      name: "Record Store",
      availableItems: [{ shortId: "pm-loveless", coinValue: 20 }],
      listedBuybackRate: 0.5,
      unlistedBuybackRate: 0.25,
    }
    const instance = buildShoppingInstance(shop, ["pm-loveless"], catalogMap, Date.now())
    expect(instance.offers[0]?.artworkFrame).toBe("record-jacket")
    expect(instance.offers[0]?.imageUrl).toBe("/api/rooms/r1/images/pl-cover")
    expect(instance.offers[0]?.imageUrlLarge).toBe("/api/rooms/r1/images/pl-cover-lg")
  })
})
