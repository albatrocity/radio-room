import { describe, expect, it } from "vitest"
import type { ItemDefinition, ShoppingSessionInstance } from "@repo/types"
import type { ItemCatalogEntry, ShopCatalogEntry } from "./shoppingSessionCatalog"
import {
  appendExtraOffers,
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

describe("appendExtraOffers", () => {
  const empty: ShoppingSessionInstance = {
    shopId: "room-shop:s",
    shopName: "Shop",
    offers: [],
    openedAt: 1,
  }

  function defined(entry: ItemCatalogEntry, sourcePlugin: string): ItemDefinition {
    return {
      id: `${sourcePlugin}:${entry.definition.shortId}`,
      sourcePlugin,
      ...entry.definition,
    }
  }

  const scopeOpts = {
    catalogByShortId: buildItemCatalogMap([RADIO_ONLY, PM_ENTRY]),
    ownerPlugin: "item-shops",
    hooks: {
      decorateOffer(entry: ItemCatalogEntry, basePrice: number) {
        if (!entry.definition.mediaFormat) return {}
        return { condition: "poor" as const, price: Math.round(basePrice * 0.45) }
      },
    },
  }

  const foreign: ItemDefinition = {
    id: "road-trip:fix-a-flat",
    sourcePlugin: "road-trip",
    shortId: "fix-a-flat",
    name: "Fix-a-Flat",
    description: "Patch a blown tire.",
    stackable: true,
    maxStack: 5,
    tradeable: true,
    consumable: true,
    coinValue: 30,
  }

  it("drops a gated Item Shops offer in a jukebox room and keeps it in a radio room", () => {
    const extra = { definition: defined(RADIO_ONLY, "item-shops"), basePrice: 35 }
    const jukebox = appendExtraOffers(empty, [extra], null, { ...scopeOpts, roomType: "jukebox" })
    expect(jukebox.offers).toEqual([])

    const radio = appendExtraOffers(empty, [extra], null, { ...scopeOpts, roomType: "radio" })
    expect(radio.offers.map((offer) => offer.shortId)).toEqual(["oscilloscope"])
    expect(radio.offers[0]?.condition).toBeUndefined()
    expect(radio.offers[0]?.price).toBe(35)
  })

  it("applies decorateOffer condition and price on a Physical Media offer", () => {
    const instance = appendExtraOffers(
      empty,
      [{ definition: defined(PM_ENTRY, "item-shops"), basePrice: 20 }],
      null,
      { ...scopeOpts, roomType: "jukebox" },
    )
    expect(instance.offers[0]).toMatchObject({
      condition: "poor",
      price: 9,
      basePrice: 9,
      mediaFormat: "LP",
      artworkFrame: "record-jacket",
    })
  })

  it("leaves a foreign-plugin offer untouched", () => {
    const instance = appendExtraOffers(empty, [{ definition: foreign, basePrice: 25, stock: 2 }], null, {
      ...scopeOpts,
      roomType: "jukebox",
    })
    expect(instance.offers).toEqual([
      expect.objectContaining({
        offerId: 0,
        shortId: "fix-a-flat",
        definitionId: "road-trip:fix-a-flat",
        name: "Fix-a-Flat",
        basePrice: 25,
        price: 25,
        remaining: 2,
        available: true,
      }),
    ])
    expect(instance.offers[0]?.condition).toBeUndefined()
    expect(instance.offers[0]?.mediaFormat).toBeUndefined()
  })

  function mulberry32(seed: number): () => number {
    let a = seed >>> 0
    return () => {
      a |= 0
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  function plain(shortId: string, rarity: "common" | "legendary"): ItemDefinition {
    return {
      id: `road-trip:${shortId}`,
      sourcePlugin: "road-trip",
      shortId,
      name: shortId,
      description: shortId,
      stackable: true,
      maxStack: 5,
      tradeable: true,
      consumable: true,
      coinValue: 10,
      rarity,
    }
  }

  it("samples count distinct offers and returns the whole pool when count covers it", () => {
    const pool = ["a", "b", "c", "d"].map((id) => ({ definition: plain(id, "common"), basePrice: 1 }))
    const rng = mulberry32(7)
    for (let i = 0; i < 40; i++) {
      const picked = appendExtraOffers(empty, pool, null, {
        sample: { count: 3, weights: "even" },
        random: rng,
      }).offers.map((offer) => offer.shortId)
      expect(picked).toHaveLength(3)
      expect(new Set(picked).size).toBe(3)
      expect(picked.every((id) => ["a", "b", "c", "d"].includes(id))).toBe(true)
    }
    const whole = appendExtraOffers(empty, pool.slice(0, 2), null, {
      sample: { count: 8, weights: "rarity" },
      random: () => 0,
    })
    expect(whole.offers.map((offer) => offer.shortId)).toEqual(["a", "b"])
  })

  it("weights samples by rarity and can weight them evenly", () => {
    const extras = [
      { definition: plain("pebble", "common"), basePrice: 1 },
      { definition: plain("crown", "legendary"), basePrice: 1 },
    ]
    const trials = 2000
    const count = (weights: "rarity" | "even", seed: number) => {
      const rng = mulberry32(seed)
      let commons = 0
      for (let i = 0; i < trials; i++) {
        const offer = appendExtraOffers(empty, extras, null, {
          sample: { count: 1, weights },
          random: rng,
        }).offers[0]
        if (offer?.shortId === "pebble") commons++
      }
      return commons / trials
    }
    const rarity = count("rarity", 1)
    const even = count("even", 1)
    expect(rarity).toBeGreaterThan(0.7)
    expect(rarity).toBeLessThan(0.9)
    expect(even).toBeGreaterThan(0.4)
    expect(even).toBeLessThan(0.6)
  })

  it("never samples an offer gated out of the room", () => {
    const picked = appendExtraOffers(
      empty,
      [
        { definition: defined(RADIO_ONLY, "item-shops"), basePrice: 35 },
        { definition: plain("pebble", "common"), basePrice: 1 },
      ],
      null,
      { ...scopeOpts, roomType: "jukebox", sample: { count: 2, weights: "even" }, random: () => 0.99 },
    )
    expect(picked.offers.map((offer) => offer.shortId)).toEqual(["pebble"])
  })
})
