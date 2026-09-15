import { describe, expect, it } from "vitest"
import type { ItemCatalogEntry, ShopCatalogEntry } from "./shoppingSessionCatalog"
import {
  applyShopRarityOverrides,
  buildItemCatalogMap,
  buildShoppingInstance,
  filterShopCatalogByRoomType,
  isItemAvailableInRoomType,
  pickWeightedShop,
  resolveShopRarity,
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
    mediaFormat: "LP" as const,
    stackable: false,
    maxStack: 1,
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

  it("applies decorateOffer price and condition on PM offers only", () => {
    const pedal: ItemCatalogEntry = {
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
    const pm: ItemCatalogEntry = {
      ...PM_ENTRY,
      localLibraryGrant: { scope: "playlist", playlistKey: "pm-loveless", redemption: "durable" },
    }
    const catalogMap = buildItemCatalogMap([pm, pedal])
    const shop: ShopCatalogEntry = {
      shopId: "record-store",
      name: "Record Store",
      availableItems: [
        { shortId: "pm-loveless", coinValue: 20 },
        { shortId: "fuzz-pedal", coinValue: 25 },
      ],
      listedBuybackRate: 0.5,
      unlistedBuybackRate: 0.25,
    }
    const instance = buildShoppingInstance(
      shop,
      ["pm-loveless", "fuzz-pedal"],
      catalogMap,
      Date.now(),
      {
        decorateOffer(entry, basePrice) {
          if (!entry.localLibraryGrant) return {}
          return { condition: "poor", price: Math.round(basePrice * 0.45) }
        },
      },
    )
    expect(instance.offers[0]?.condition).toBe("poor")
    expect(instance.offers[0]?.price).toBe(9)
    expect(instance.offers[0]?.mediaFormat).toBe("LP")
    expect(instance.offers[1]?.condition).toBeUndefined()
    expect(instance.offers[1]?.price).toBe(25)
  })
})

describe("pickWeightedShop / resolveShopRarity", () => {
  const shops: ShopCatalogEntry[] = [
    {
      shopId: "record-store",
      name: "Record Store",
      rarity: "common",
      availableItems: [],
      listedBuybackRate: 0.1,
      unlistedBuybackRate: 0,
    },
    {
      shopId: "farmers-market",
      name: "Farmers Market",
      rarity: "common",
      availableItems: [],
      listedBuybackRate: 0.5,
      unlistedBuybackRate: 0.25,
    },
    {
      shopId: "sweetwater",
      name: "Sweetwater",
      rarity: "common",
      availableItems: [],
      listedBuybackRate: 0.5,
      unlistedBuybackRate: 0.25,
    },
    {
      shopId: "green-room",
      name: "Green Room",
      rarity: "rare",
      availableItems: [],
      listedBuybackRate: 0.1,
      unlistedBuybackRate: 0,
    },
    {
      shopId: "spy-world",
      name: "SPY WORLD",
      rarity: "legendary",
      availableItems: [],
      listedBuybackRate: 0.35,
      unlistedBuybackRate: 0.12,
    },
  ]

  it("treats omitted rarity as common", () => {
    expect(resolveShopRarity({ rarity: undefined })).toBe("common")
    expect(resolveShopRarity({ rarity: "legendary" })).toBe("legendary")
  })

  it("picks the heaviest shop when random hits the start of the weight range", () => {
    // Weights: common×3=12, rare=2, legendary=1 → total 15. r=0 → first common.
    const picked = pickWeightedShop(shops, undefined, () => 0)
    expect(picked?.shopId).toBe("record-store")
  })

  it("picks Spy World when random hits the legendary tail", () => {
    // Total weight 15; last slot is legendary. Use just under 1.0.
    const picked = pickWeightedShop(shops, undefined, () => 0.999)
    expect(picked?.shopId).toBe("spy-world")
  })

  it("returns undefined for an empty pool", () => {
    expect(pickWeightedShop([])).toBeUndefined()
  })
})

describe("applyShopRarityOverrides", () => {
  const shops: ShopCatalogEntry[] = [
    {
      shopId: "spy-world",
      name: "SPY WORLD",
      rarity: "legendary",
      availableItems: [],
      listedBuybackRate: 0.35,
      unlistedBuybackRate: 0.12,
    },
    {
      shopId: "green-room",
      name: "Green Room",
      rarity: "rare",
      availableItems: [],
      listedBuybackRate: 0.1,
      unlistedBuybackRate: 0,
    },
  ]

  it("returns the same array reference when overrides are empty", () => {
    expect(applyShopRarityOverrides(shops, {})).toBe(shops)
    expect(applyShopRarityOverrides(shops, undefined)).toBe(shops)
    expect(applyShopRarityOverrides(shops, null)).toBe(shops)
  })

  it("stamps a valid override that differs from catalog", () => {
    const next = applyShopRarityOverrides(shops, { "spy-world": "common" })
    expect(next).not.toBe(shops)
    expect(next.find((s) => s.shopId === "spy-world")?.rarity).toBe("common")
    expect(next.find((s) => s.shopId === "green-room")?.rarity).toBe("rare")
  })

  it("ignores unknown shop ids and non-enum values", () => {
    const next = applyShopRarityOverrides(shops, {
      "not-a-shop": "common",
      "spy-world": "ultra",
    })
    expect(next).toBe(shops)
  })

  it("does not clone when override matches catalog rarity", () => {
    const next = applyShopRarityOverrides(shops, { "spy-world": "legendary" })
    expect(next).toBe(shops)
  })
})
