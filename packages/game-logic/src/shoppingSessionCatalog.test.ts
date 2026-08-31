import { describe, expect, it } from "vitest"
import type { ItemCatalogEntry, ShopCatalogEntry } from "./shoppingSessionCatalog"
import {
  buildItemCatalogMap,
  buildShoppingInstance,
  filterShopCatalogByRoomType,
  isItemAvailableInRoomType,
} from "./shoppingSessionCatalog"

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

const RADIO_ONLY: ItemCatalogEntry = {
  definition: {
    shortId: "oscilloscope",
    name: "Oscilloscope",
    description: "Scope",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: false,
    coinValue: 35,
    rarity: "rare",
  },
  availableInRoomTypes: ["radio"],
}

const UNRESTRICTED: ItemCatalogEntry = {
  definition: {
    shortId: "fuzz-pedal",
    name: "Fuzz Pedal",
    description: "Blur",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    coinValue: 25,
  },
}

describe("isItemAvailableInRoomType / filterShopCatalogByRoomType", () => {
  const catalogMap = buildItemCatalogMap([RADIO_ONLY, UNRESTRICTED])

  it("treats missing availableInRoomTypes as unrestricted", () => {
    expect(isItemAvailableInRoomType(UNRESTRICTED, "jukebox")).toBe(true)
    expect(isItemAvailableInRoomType(undefined, "radio")).toBe(true)
  })

  it("keeps radio-only SKUs in radio rooms and drops them elsewhere", () => {
    expect(isItemAvailableInRoomType(RADIO_ONLY, "radio")).toBe(true)
    expect(isItemAvailableInRoomType(RADIO_ONLY, "jukebox")).toBe(false)
    expect(isItemAvailableInRoomType(RADIO_ONLY, "live")).toBe(false)
  })

  it("filters shop availableItems by room type", () => {
    const shop: ShopCatalogEntry = {
      shopId: "sweetwater",
      name: "Sweetwater",
      availableItems: [
        { shortId: "fuzz-pedal", coinValue: 25 },
        { shortId: "oscilloscope", coinValue: 35 },
      ],
      listedBuybackRate: 0.5,
      unlistedBuybackRate: 0.25,
    }

    const radioShops = filterShopCatalogByRoomType([shop], catalogMap, "radio")
    expect(radioShops[0]?.availableItems.map((i) => i.shortId)).toEqual([
      "fuzz-pedal",
      "oscilloscope",
    ])

    const jukeboxShops = filterShopCatalogByRoomType([shop], catalogMap, "jukebox")
    expect(jukeboxShops[0]?.availableItems.map((i) => i.shortId)).toEqual(["fuzz-pedal"])

    const liveShops = filterShopCatalogByRoomType([shop], catalogMap, "live")
    expect(liveShops[0]?.availableItems.map((i) => i.shortId)).toEqual(["fuzz-pedal"])
  })
})

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
    expect(instance.offers[0]?.artist).toBeUndefined()
  })

  it("copies artist onto shop offers when present", () => {
    const catalogMap = buildItemCatalogMap([
      {
        ...PM_ENTRY,
        definition: { ...PM_ENTRY.definition, artist: "My Bloody Valentine" },
      },
    ])
    const shop = {
      shopId: "record-store",
      name: "Record Store",
      availableItems: [{ shortId: "pm-loveless", coinValue: 20 }],
      listedBuybackRate: 0.5,
      unlistedBuybackRate: 0.25,
    }
    const instance = buildShoppingInstance(shop, ["pm-loveless"], catalogMap, Date.now())
    expect(instance.offers[0]?.artist).toBe("My Bloody Valentine")
    expect(instance.offers[0]?.name).toBe("LP: Loveless")
  })
})
