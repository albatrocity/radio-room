import type {
  ChatMessage,
  EconomyScaleState,
  InventoryAcquisitionSource,
  InventoryItem,
  ItemDefinition,
  ItemRarity,
  LucideIconName,
  MediaCondition,
  ShoppingSessionInstance,
  ShopOffer,
  UserInventory,
} from "@repo/types"
import { resolveEconomy, scalePrice } from "./economyScale"

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
  /**
   * When set, this shop is only eligible for shopping-session assignment if the
   * room's `playbackControllerId` matches (e.g. `"bridge"`).
   */
  requiresPlaybackControllerId?: string
  /**
   * When true, sampled offers never repeat a shortId within a visit
   * (`pickWeightedDistinctShortIds`).
   */
  distinctOffers?: boolean
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

export type LocalLibraryGrant =
  | { scope: "library"; redemption?: "durable" | "perQueue" }
  | { scope: "playlist"; playlistKey: string; redemption?: "durable" | "perQueue" }
  | { scope: "album"; albumKey: string; redemption?: "durable" | "perQueue" }

export type ItemCatalogEntry = {
  definition: Omit<ItemDefinition, "id" | "sourcePlugin">
  /**
   * When set, holding this item can unlock restricted Local (library) access.
   * `library` = full catalog; `playlist` / `album` = scoped to a Navidrome
   * playlist or album key resolved via Item Shops derived maps / config.
   */
  localLibraryGrant?: LocalLibraryGrant
  /**
   * When set, shopping offers omit this SKU unless `room.type` is in the list.
   * Gift/trade into other room types remains allowed; the item is inert there.
   * Omitted = available in every room type.
   */
  availableInRoomTypes?: ReadonlyArray<"jukebox" | "radio" | "live">
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

export type RoomTypeForShopFilter = "jukebox" | "radio" | "live"

/**
 * Whether a catalog SKU may appear in shopping offers for `roomType`.
 * Missing `availableInRoomTypes` = unrestricted.
 */
export function isItemAvailableInRoomType(
  entry: ItemCatalogEntry | undefined,
  roomType: RoomTypeForShopFilter,
): boolean {
  const allowed = entry?.availableInRoomTypes
  if (!allowed || allowed.length === 0) return true
  return allowed.includes(roomType)
}

/**
 * Drop shop `availableItems` whose catalog entry restricts room types and
 * does not include `roomType`. Shops with an empty list after filtering remain
 * (assignment may yield no offers — callers that need to hide empty shops
 * should filter further).
 */
export function filterShopCatalogByRoomType<T extends ShopCatalogEntry>(
  shops: readonly T[],
  catalogByShortId: Map<string, ItemCatalogEntry>,
  roomType: RoomTypeForShopFilter,
): T[] {
  return shops.map((shop) => {
    const availableItems = shop.availableItems.filter((ai) =>
      isItemAvailableInRoomType(catalogByShortId.get(ai.shortId), roomType),
    )
    if (availableItems.length === shop.availableItems.length) {
      return shop
    }
    return { ...shop, availableItems }
  })
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

export type ShopEconomyHooks = {
  decorateOffer?(
    entry: ItemCatalogEntry,
    basePrice: number,
  ): { price?: number; condition?: MediaCondition }
  adjustSellBase?(item: InventoryItem, definition: ItemDefinition, base: number): number
}

/** Re-price offers from `basePrice` against the live cost scale. */
export function applyLiveCostScale(
  instance: ShoppingSessionInstance,
  economy?: EconomyScaleState | null,
): ShoppingSessionInstance {
  const resolved = resolveEconomy(economy)
  const offers: ShopOffer[] = instance.offers.map((offer) => {
    const base = offer.basePrice ?? offer.price
    return {
      ...offer,
      basePrice: base,
      price: scalePrice(base, resolved.costScale, resolved.priceRounding),
    }
  })
  return { ...instance, offers }
}

export function buildShoppingInstance(
  shop: ShopCatalogEntry,
  shortIds: string[],
  catalogByShortId: Map<string, ItemCatalogEntry>,
  openedAt: number,
  hooks?: ShopEconomyHooks,
  economy?: EconomyScaleState | null,
): ShoppingSessionInstance {
  const offers = shortIds.map((sid, index) => {
    const entry = catalogByShortId.get(sid)
    if (!entry) {
      throw new Error(`Unknown catalog item in instance: ${sid}`)
    }
    const {
      name,
      description,
      artist,
      icon = "package" as LucideIconName,
      imageUrl,
      imageUrlLarge,
      artworkFrame,
      mediaFormat,
      rarity,
    } = entry.definition
    const catalogBase = resolveShopItemPrice(shop, sid, catalogByShortId)
    const extra = hooks?.decorateOffer?.(entry, catalogBase)
    const basePrice = extra?.price ?? catalogBase
    const resolved = resolveEconomy(economy)
    return {
      offerId: index,
      shortId: sid,
      name,
      description,
      ...(artist?.trim() ? { artist: artist.trim() } : {}),
      icon,
      ...(imageUrl ? { imageUrl } : {}),
      ...(imageUrlLarge ? { imageUrlLarge } : {}),
      ...(artworkFrame ? { artworkFrame } : {}),
      ...(mediaFormat ? { mediaFormat } : {}),
      basePrice,
      price: scalePrice(basePrice, resolved.costScale, resolved.priceRounding),
      ...(extra?.condition ? { condition: extra.condition } : {}),
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
    costScaleAtIssue: resolveEconomy(economy).costScale,
  }
}
