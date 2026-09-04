import { describe, expect, it, vi } from "vitest"
import type { InventoryItem, ItemDefinition, PluginContext, ShopOffer } from "@repo/types"
import { ShoppingSessionHelper } from "./ShoppingSessionHelper"
import {
  DEFAULT_RARITY_WEIGHTS,
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
      getActiveSession: vi.fn(async () => ({ id: "s1" })),
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
    const helper = new ShoppingSessionHelper(
      "item-shops",
      context,
      [PM, PEDAL],
      [SHOP],
      DEFAULT_RARITY_WEIGHTS,
      hooks,
    )
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
    const helper = new ShoppingSessionHelper(
      "item-shops",
      context,
      [PM, PEDAL],
      [SHOP],
      DEFAULT_RARITY_WEIGHTS,
      hooks,
    )
    const result = await helper.sell("u1", item, definition)
    expect(result.success).toBe(true)
    // listed price 20 * 0.45 condition * 0.5 buyback = 4
    expect(result.refund).toBe(4)
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
