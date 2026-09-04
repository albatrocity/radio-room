import { describe, expect, it, vi } from "vitest"
import type { InventoryItem, ItemDefinition, PluginContext, ShopOffer } from "@repo/types"
import { ShoppingSessionHelper } from "./ShoppingSessionHelper"
import {
  type ItemCatalogEntry,
  type ShopCatalogEntry,
  type ShopEconomyHooks,
} from "./shoppingSessionCatalog"

const PM: ItemCatalogEntry = {
  definition: {
    shortId: "pm-loveless",
    name: "LP: Loveless",
    description: "A LP",
    icon: "Disc3",
    artworkFrame: "record-jacket",
    mediaFormat: "LP",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: false,
    coinValue: 20,
    rarity: "uncommon",
    slotPool: "collection",
  },
  localLibraryGrant: { scope: "playlist", playlistKey: "pm-loveless", redemption: "durable" },
}

const PEDAL: ItemCatalogEntry = {
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

const SHOP: ShopCatalogEntry = {
  shopId: "record-store",
  name: "Record Store",
  availableItems: [
    { shortId: "pm-loveless", coinValue: 20 },
    { shortId: "fuzz-pedal", coinValue: 25 },
  ],
  listedBuybackRate: 0.5,
  unlistedBuybackRate: 0,
}

function makeContext(params?: {
  giveItem?: ReturnType<typeof vi.fn>
  removeItem?: ReturnType<typeof vi.fn>
  instance?: { shopId: string; offers: ShopOffer[] }
}) {
  const instance = params?.instance ?? {
    shopId: "record-store",
    offers: [
      {
        offerId: 0,
        shortId: "pm-loveless",
        name: "LP: Loveless",
        description: "A LP",
        icon: "Disc3",
        price: 9,
        available: true,
        rarity: "uncommon" as const,
        condition: "poor" as const,
        mediaFormat: "LP" as const,
      },
    ],
  }
  const giveItem = params?.giveItem ?? vi.fn(async () => ({ itemId: "new-1" }))
  const removeItem = params?.removeItem ?? vi.fn(async () => true)
  const addScore = vi.fn(async () => {})
  const context = {
    roomId: "room-1",
    storage: {
      get: vi.fn(async () => "true"),
      hget: vi.fn(async () => JSON.stringify(instance)),
      hset: vi.fn(async () => {}),
    },
    game: {
      getActiveSession: vi.fn(async () => ({ id: "s1", config: {} })),
      getUserState: vi.fn(async () => ({ attributes: { coin: 100 } })),
      addScore,
    },
    inventory: { giveItem, removeItem },
  } as unknown as PluginContext
  return { context, giveItem, removeItem, addScore }
}

describe("ShoppingSessionHelper purchase / sell hooks", () => {
  const hooks: ShopEconomyHooks = {
    decorateOffer(entry, basePrice) {
      if (!entry.localLibraryGrant) return {}
      return { condition: "poor", price: Math.round(basePrice * 0.45) }
    },
    adjustSellBase(_item, definition, base) {
      if (!definition.mediaFormat) return base
      return Math.round(base * 0.45)
    },
  }

  it("forwards offer.condition as giveItem metadata", async () => {
    const { context, giveItem } = makeContext()
    const helper = new ShoppingSessionHelper("item-shops", context, [PM, PEDAL], [SHOP], { hooks })
    const result = await helper.purchase({ userId: "u1", username: "U" }, 0)
    expect(result.success).toBe(true)
    expect(giveItem).toHaveBeenCalledWith(
      "u1",
      "item-shops:pm-loveless",
      1,
      { condition: "poor" },
      "purchase",
    )
  })

  it("scales sell refunds through adjustSellBase", async () => {
    const item: InventoryItem = {
      itemId: "pm-1",
      definitionId: "item-shops:pm-loveless",
      sourcePlugin: "item-shops",
      quantity: 1,
      acquiredAt: 1,
      metadata: { condition: "poor" },
    }
    const definition: ItemDefinition = {
      id: "item-shops:pm-loveless",
      sourcePlugin: "item-shops",
      ...PM.definition,
    }
    const { context } = makeContext()
    const helper = new ShoppingSessionHelper("item-shops", context, [PM, PEDAL], [SHOP], { hooks })
    const result = await helper.sell("u1", item, definition)
    expect(result.success).toBe(true)
    // listed price 20 * 0.45 condition * 0.5 buyback = 4
    expect(result.refund).toBe(4)
  })

  it("charges the live scaled price and refunds that exact debit", async () => {
    const { context, addScore } = makeContext({
      giveItem: vi.fn(async () => null),
    })
    context.game.getActiveSession = vi.fn(async () => ({
      id: "s1",
      config: {
        economy: {
          costScale: 2,
          earnScale: 1,
          scaledAttributes: ["coin"],
          priceRounding: 1,
          updatedAt: 1,
        },
      },
    })) as PluginContext["game"]["getActiveSession"]
    const helper = new ShoppingSessionHelper("item-shops", context, [PM, PEDAL], [SHOP])
    const result = await helper.purchase({ userId: "u1", username: "U" }, 0)
    expect(result.success).toBe(false)
    // persisted offer price 9, no basePrice → treat 9 as base → scalePrice(9, 2) = 18
    expect(addScore).toHaveBeenNthCalledWith(1, "u1", "coin", -18, "item-shops:purchase", {
      intent: "exact",
    })
    expect(addScore).toHaveBeenNthCalledWith(2, "u1", "coin", 18, "item-shops:refund", {
      intent: "exact",
    })
  })

  it("scales sell proceeds once from the catalog base", async () => {
    const item: InventoryItem = {
      itemId: "fuzz-1",
      definitionId: "item-shops:fuzz-pedal",
      sourcePlugin: "item-shops",
      quantity: 1,
      acquiredAt: 1,
    }
    const definition: ItemDefinition = {
      id: "item-shops:fuzz-pedal",
      sourcePlugin: "item-shops",
      ...PEDAL.definition,
    }
    const { context, addScore } = makeContext()
    context.game.getActiveSession = vi.fn(async () => ({
      id: "s1",
      config: {
        economy: {
          costScale: 2,
          earnScale: 4,
          scaledAttributes: ["coin"],
          priceRounding: 1,
          updatedAt: 1,
        },
      },
    })) as PluginContext["game"]["getActiveSession"]
    const helper = new ShoppingSessionHelper("item-shops", context, [PM, PEDAL], [SHOP])
    const result = await helper.sell("u1", item, definition)
    expect(result.success).toBe(true)
    // listed 25 * 2 costScale = 50, * 0.5 buyback = 25. Must not also apply earnScale.
    expect(result.refund).toBe(25)
    expect(addScore).toHaveBeenCalledWith("u1", "coin", 25, "item-shops:sale", { intent: "exact" })
  })

  it("names the full slot pool when giveItem fails", async () => {
    const deck: ItemCatalogEntry = {
      definition: {
        shortId: "cassette-deck",
        name: "Cassette Deck",
        description: "A deck",
        icon: "Disc3",
        stackable: false,
        maxStack: 1,
        tradeable: true,
        consumable: false,
        coinValue: 80,
        rarity: "uncommon",
        slotPool: "playback",
      },
    }

    async function buy(entry: ItemCatalogEntry) {
      const { context } = makeContext({
        giveItem: vi.fn(async () => null),
        instance: {
          shopId: "record-store",
          offers: [
            {
              offerId: 0,
              shortId: entry.definition.shortId,
              name: entry.definition.name,
              description: entry.definition.description,
              icon: entry.definition.icon ?? "Disc3",
              price: 10,
              available: true,
              rarity: entry.definition.rarity ?? "common",
            },
          ],
        },
      })
      const helper = new ShoppingSessionHelper(
        "item-shops",
        context,
        [entry],
        [
          {
            ...SHOP,
            availableItems: [{ shortId: entry.definition.shortId, coinValue: 10 }],
          },
        ],
      )
      return helper.purchase({ userId: "u1", username: "U" }, 0)
    }

    await expect(buy(PEDAL)).resolves.toMatchObject({
      success: false,
      message: "Inventory is full — could not add Fuzz Pedal.",
    })
    await expect(buy(PM)).resolves.toMatchObject({
      success: false,
      message: "Collection is full — could not add LP: Loveless.",
    })
    await expect(buy(deck)).resolves.toMatchObject({
      success: false,
      message: "Playback Devices are full — could not add Cassette Deck.",
    })
  })
})
