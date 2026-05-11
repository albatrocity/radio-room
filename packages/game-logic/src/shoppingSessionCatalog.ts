import type {
  ChatMessage,
  InventoryAcquisitionSource,
  InventoryItem,
  ItemDefinition,
  ItemRarity,
  LucideIconName,
  ShoppingSessionInstance,
  UserInventory,
} from "@repo/types"

/** Shop-specific listing (subset of the master item catalog). */
export type ShopAvailableItem = {
  shortId: string
  /** Optional per-shop price override (buy + listed sell-back base). */
  coinValue?: number
}

/**
 * Context passed to shop `onBuy` callbacks with APIs for timers, messaging, and state.
 */
export type ShopBuyContext = {
  roomId: string
  userId: string
  username: string
  itemShortId: string
  itemName: string

  /** Start a timer scoped to this shop (id is auto-prefixed with shopId). */
  startTimer: <T = unknown>(
    id: string,
    config: { duration: number; callback: () => Promise<void> | void; data?: T },
  ) => void
  /** Get a timer by id (auto-prefixed with shopId). */
  getTimer: <T = unknown>(id: string) => { id: string; data?: T } | null
  /** Clear a timer by id (auto-prefixed with shopId). */
  clearTimer: (id: string) => boolean

  /** Send a system message to the room. */
  sendSystemMessage: (
    message: string,
    meta?: ChatMessage["meta"],
    mentions?: string[],
  ) => Promise<void>

  /** Send a system message visible only to a specific user. */
  sendUserSystemMessage: (
    userId: string,
    message: string,
    meta?: ChatMessage["meta"],
  ) => Promise<void>

  /** Check if the shopping round is still active (per-room item-shops session). */
  isShoppingActive: () => Promise<boolean>
  /** Check if a game session is currently active in the room. */
  isGameSessionActive: () => Promise<boolean>
  /** Check if a user is still in the room. */
  isUserInRoom: (userId: string) => Promise<boolean>

  /** Get shop-scoped state by key. */
  getState: <T>(key: string) => T | undefined
  /** Set shop-scoped state by key. */
  setState: <T>(key: string, value: T) => void
  /** Delete shop-scoped state by key. */
  deleteState: (key: string) => void
}

/**
 * Context passed to shop `onSessionStart` / `onSessionEnd` lifecycle hooks (timers, messaging,
 * shop-scoped state, inventory reads/mutations scoped to the Item Shops plugin room instance).
 */
export type ShopSessionContext = {
  roomId: string
  shopId: string
  /** Owning plugin name (Item Shops); use when filtering inventory stacks by `sourcePlugin`. */
  pluginName: string

  startTimer: ShopBuyContext["startTimer"]
  getTimer: ShopBuyContext["getTimer"]
  clearTimer: ShopBuyContext["clearTimer"]

  sendSystemMessage: ShopBuyContext["sendSystemMessage"]
  sendUserSystemMessage: ShopBuyContext["sendUserSystemMessage"]

  getState: ShopBuyContext["getState"]
  setState: ShopBuyContext["setState"]
  deleteState: ShopBuyContext["deleteState"]
  /** Keys currently present in this shop's state store (e.g. user ids tracked by `onBuy`). */
  getAllStateKeys: () => string[]

  inventory: {
    getInventory: (userId: string) => Promise<UserInventory>
    getItemDefinition: (definitionId: string) => Promise<ItemDefinition | null>
    removeItem: (userId: string, itemId: string, quantity?: number) => Promise<boolean>
    giveItem: (
      userId: string,
      definitionId: string,
      quantity?: number,
      metadata?: Record<string, unknown>,
      source?: InventoryAcquisitionSource,
    ) => Promise<InventoryItem | null>
  }
}

export type ShopCatalogEntry = {
  shopId: string
  name: string
  openingMessage?: string
  availableItems: ShopAvailableItem[]
  listedBuybackRate: number
  unlistedBuybackRate: number
  /** Called after a successful purchase. Use for shop-specific follow-up behaviors. */
  onBuy?: (ctx: ShopBuyContext) => void | Promise<void>
  /** Called after a shopping round starts for this shop (subset of eligible shops for the round). */
  onSessionStart?: (ctx: ShopSessionContext) => void | Promise<void>
  /**
   * Called when a shopping round ends (admin ends sessions or starts a new round while one is active).
   * Not called on room game session end; the plugin clears shop timers and state then.
   */
  onSessionEnd?: (ctx: ShopSessionContext) => void | Promise<void>
}

export type ItemCatalogEntry = {
  definition: Omit<ItemDefinition, "id" | "sourcePlugin">
}

export const DEFAULT_RARITY_WEIGHTS: Record<ItemRarity, number> = {
  common: 4,
  uncommon: 3,
  rare: 2,
  legendary: 1,
}

export function resolveItemRarity(def: Pick<ItemDefinition, "rarity">): ItemRarity {
  return def.rarity ?? "common"
}

export function buildItemCatalogMap(
  catalog: readonly ItemCatalogEntry[],
): Map<string, ItemCatalogEntry> {
  const m = new Map<string, ItemCatalogEntry>()
  for (const e of catalog) {
    m.set(e.definition.shortId, e)
  }
  return m
}

/**
 * Price for buying / listed sell-back base.
 */
export function resolveShopItemPrice(
  shop: ShopCatalogEntry,
  shortId: string,
  catalogByShortId: Map<string, ItemCatalogEntry>,
): number {
  const catalogEntry = catalogByShortId.get(shortId)
  if (!catalogEntry) {
    throw new Error(`Unknown catalog item: ${shortId}`)
  }
  const override = shop.availableItems.find((a) => a.shortId === shortId)?.coinValue
  return override ?? catalogEntry.definition.coinValue ?? 0
}

export function isShopListedItem(shop: ShopCatalogEntry, shortId: string): boolean {
  return shop.availableItems.some((a) => a.shortId === shortId)
}

export function resolveUnlistedSellBasePrice(
  catalogByShortId: Map<string, ItemCatalogEntry>,
  shortId: string,
): number {
  const catalogEntry = catalogByShortId.get(shortId)
  if (!catalogEntry) return 0
  return catalogEntry.definition.coinValue ?? 0
}

export type WeightedCandidate = { shortId: string; weight: number }

export function pickWeightedDistinctShortIds(
  candidates: WeightedCandidate[],
  count: number,
  random: () => number = Math.random,
): string[] {
  const pool = [...candidates]
  const picked: string[] = []
  while (picked.length < count && pool.length > 0) {
    const total = pool.reduce((s, c) => s + c.weight, 0)
    if (total <= 0) break
    let r = random() * total
    let idx = 0
    for (; idx < pool.length; idx++) {
      r -= pool[idx].weight
      if (r <= 0) break
    }
    const chosen = pool.splice(idx, 1)[0]!
    picked.push(chosen.shortId)
  }
  return picked
}

/**
 * Weighted random picks with replacement — the same `shortId` may appear multiple times.
 */
export function pickWeightedShortIds(
  candidates: WeightedCandidate[],
  count: number,
  random: () => number = Math.random,
): string[] {
  if (candidates.length === 0 || count <= 0) return []
  const total = candidates.reduce((s, c) => s + c.weight, 0)
  if (total <= 0) return []

  const picked: string[] = []
  for (let i = 0; i < count; i++) {
    let r = random() * total
    let chosen = candidates[0]!
    for (const c of candidates) {
      r -= c.weight
      if (r <= 0) {
        chosen = c
        break
      }
    }
    picked.push(chosen.shortId)
  }
  return picked
}

export function buildShoppingInstance(
  shop: ShopCatalogEntry,
  shortIds: string[],
  catalogByShortId: Map<string, ItemCatalogEntry>,
  openedAt: number,
): ShoppingSessionInstance {
  const offers = shortIds.map((sid, index) => {
    const entry = catalogByShortId.get(sid)
    if (!entry) {
      throw new Error(`Unknown catalog item in instance: ${sid}`)
    }
    const { name, description, icon = "package" as LucideIconName, rarity } = entry.definition
    return {
      offerId: index,
      shortId: sid,
      name,
      description,
      icon,
      price: resolveShopItemPrice(shop, sid, catalogByShortId),
      available: true,
      rarity: rarity ?? "common",
    }
  })
  const listedPriceOverrides = Object.fromEntries(
    shop.availableItems.filter((a) => a.coinValue != null).map((a) => [a.shortId, a.coinValue!]),
  ) as Record<string, number>

  return {
    shopId: shop.shopId,
    shopName: shop.name,
    offers,
    openedAt,
    listedBuybackRate: shop.listedBuybackRate,
    unlistedBuybackRate: shop.unlistedBuybackRate,
    listedShortIds: shop.availableItems.map((a) => a.shortId),
    ...(Object.keys(listedPriceOverrides).length > 0 ? { listedPriceOverrides } : {}),
  }
}
