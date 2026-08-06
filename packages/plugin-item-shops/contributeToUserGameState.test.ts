import { describe, expect, it, vi, beforeEach } from "vitest"
import { ShoppingSessionHelper } from "@repo/plugin-base"
import type { ItemDefinition, ShoppingSessionInstance } from "@repo/types"
import { ItemShopsPlugin } from "./index"
import { ITEM_CATALOG } from "./items/index"
import { SHOP_CATALOG } from "./shops"

function createStorage() {
  let active: string | null = null
  const instances = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => (key.includes("active") ? active : null)),
    set: vi.fn(async (key: string, value: string) => {
      if (key.includes("active")) active = value
    }),
    del: vi.fn(async (key: string) => {
      if (key.includes("active")) active = null
      if (key.includes("instances")) instances.clear()
    }),
    hget: vi.fn(async (_key: string, field: string) => instances.get(field) ?? null),
    hset: vi.fn(async (_key: string, field: string, value: string) => {
      instances.set(field, value)
    }),
    _setActive: (v: string | null) => {
      active = v
    },
    _setInstance: (userId: string, instance: ShoppingSessionInstance) => {
      instances.set(userId, JSON.stringify(instance))
    },
  }
}

describe("ItemShopsPlugin.contributeToUserGameState", () => {
  let plugin: ItemShopsPlugin
  let storage: ReturnType<typeof createStorage>

  beforeEach(() => {
    storage = createStorage()
    plugin = new ItemShopsPlugin({ enabled: true })
    const context = {
      roomId: "room-1",
      storage,
      api: {},
      game: {},
      inventory: {},
    } as any
    ;(plugin as any).context = context
    ;(plugin as any).shopping = new ShoppingSessionHelper(
      "item-shops",
      context,
      ITEM_CATALOG,
      SHOP_CATALOG,
    )
  })

  it("returns null instance when shopping round inactive", async () => {
    storage._setActive(null)
    const bag = await plugin.contributeToUserGameState("u1", { itemDefinitions: [] })
    expect(bag).toEqual({ currentShopInstance: null })
  })

  it("returns the user's instance when active", async () => {
    storage._setActive("true")
    storage._setInstance("u1", {
      shopId: "shop-a",
      shopName: "Corner",
      offers: [
        {
          offerId: 0,
          shortId: "cold-beer",
          name: "Cold Beer",
          description: "x",
          icon: "Beer",
          price: 10,
          available: true,
          rarity: "legendary",
        },
      ],
      openedAt: 1,
    })
    const bag = await plugin.contributeToUserGameState("u1", { itemDefinitions: [] })
    expect(bag?.currentShopInstance).toMatchObject({ shopName: "Corner" })
    expect((bag?.currentShopInstance as ShoppingSessionInstance).offers[0]?.rarity).toBe(
      "legendary",
    )
  })

  it("hydrates missing offer rarity from itemDefinitions", async () => {
    storage._setActive("true")
    storage._setInstance("u1", {
      shopId: "shop-a",
      shopName: "Corner",
      offers: [
        {
          offerId: 0,
          shortId: "cold-beer",
          name: "Cold Beer",
          description: "x",
          icon: "Beer",
          price: 10,
          available: true,
          rarity: undefined as unknown as "common",
        },
      ],
      openedAt: 1,
    })
    const defs: ItemDefinition[] = [
      {
        id: "item-shops:cold-beer",
        shortId: "cold-beer",
        name: "Cold Beer",
        description: "x",
        sourcePlugin: "item-shops",
        rarity: "uncommon",
        stackable: true,
        maxStack: 99,
        consumable: true,
        tradeable: true,
      },
    ]
    const bag = await plugin.contributeToUserGameState("u1", { itemDefinitions: defs })
    expect((bag?.currentShopInstance as ShoppingSessionInstance).offers[0]?.rarity).toBe(
      "uncommon",
    )
  })

  it("never returns another user's instance", async () => {
    storage._setActive("true")
    storage._setInstance("other", {
      shopId: "shop-a",
      shopName: "Theirs",
      offers: [],
      openedAt: 1,
    })
    const bag = await plugin.contributeToUserGameState("u1", { itemDefinitions: [] })
    expect(bag?.currentShopInstance).toBeNull()
  })
})
