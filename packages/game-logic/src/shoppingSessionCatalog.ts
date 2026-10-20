import type {
  ChatMessage,
  EconomyScaleState,
  InventoryAcquisitionSource,
  InventoryItem,
  ItemDefinition,
  ItemRarity,
  LucideIconName,
  MediaCondition,
  PhysicalMediaStock,
  RecordAlbumRef,
  RoomShopSample,
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

  /** Schedule a durable callback (ADR 0190). Id is auto-prefixed with shopId. */
  schedule: (params: {
    id: string
    kind: string
    durationMs: number
    payload?: unknown
  }) => Promise<{ ok: true; fireAt: number } | { ok: false; message: string }>
  /** Cancel a durable schedule (ADR 0190). Id is auto-prefixed with shopId. */
  cancelSchedule: (id: string) => Promise<boolean>

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
  schedule: ShopBuyContext["schedule"]
  cancelSchedule: ShopBuyContext["cancelSchedule"]

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
  /**
   * Assignment rarity for shopping-round shop picks (ADR 0175). Uses the same
   * weight ladder as item offers (`DEFAULT_RARITY_WEIGHTS`). Omitted = common.
   */
  rarity?: ItemRarity
  openingMessage?: string
  /**
   * When `false`, the opening line is saved on the visit but not DM'd.
   * A room shop does this when the caller posts that line to the room.
   */
  postOpeningMessage?: boolean
  /** Chat meta for the private opening DM (e.g. `{ type: "alert", status: "info" }`). */
  openingMessageMeta?: ChatMessage["meta"]
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
  /**
   * The record bin this shop stocks beside `availableItems` (ADR 0214, 0216):
   * designer picks plus, with `library`, matching derived records
   * (`library: {}` = every record). Omitted = none.
   */
  physicalMedia?: PhysicalMediaStock
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
   * A record whose album lives on a non-local source (a picked Spotify album,
   * ADR 0216). Holding it unlocks that album's tracks when the source is restricted.
   */
  recordAlbum?: RecordAlbumRef
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

export function resolveShopRarity(shop: Pick<ShopCatalogEntry, "rarity">): ItemRarity {
  return shop.rarity ?? "common"
}

const ITEM_RARITIES: ReadonlySet<string> = new Set([
  "common",
  "uncommon",
  "rare",
  "legendary",
])

function isItemRarity(value: unknown): value is ItemRarity {
  return typeof value === "string" && ITEM_RARITIES.has(value)
}

/**
 * Stamp room-scoped rarity overrides onto a shop pool (ADR 0176).
 * Sparse map: only shops with a valid override that differs from catalog are cloned.
 * Unknown shop ids and non-enum values are ignored.
 */
export function applyShopRarityOverrides<T extends ShopCatalogEntry>(
  shops: readonly T[],
  overrides: Record<string, unknown> | null | undefined,
): T[] {
  if (!overrides || Object.keys(overrides).length === 0) {
    return shops as T[]
  }
  let changed = false
  const next = shops.map((shop) => {
    const raw = overrides[shop.shopId]
    if (!isItemRarity(raw)) return shop
    const catalog = resolveShopRarity(shop)
    if (raw === catalog) return shop
    changed = true
    return { ...shop, rarity: raw }
  })
  return changed ? next : (shops as T[])
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

export type WeightedEntry<T> = { value: T; weight: number }

/**
 * Single weighted pick. Returns `undefined` when the pool is empty or all weights are ≤ 0.
 */
export function pickWeightedOne<T>(
  candidates: readonly WeightedEntry<T>[],
  random: () => number = Math.random,
): T | undefined {
  if (candidates.length === 0) return undefined
  const total = candidates.reduce((s, c) => s + c.weight, 0)
  if (total <= 0) return undefined
  let r = random() * total
  let chosen = candidates[0]!
  for (const c of candidates) {
    r -= c.weight
    if (r <= 0) {
      chosen = c
      break
    }
  }
  return chosen.value
}

/**
 * Rarity-weighted shop assignment among an eligible pool (ADR 0175).
 * Omitted shop `rarity` is treated as common.
 */
export function pickWeightedShop(
  shops: readonly ShopCatalogEntry[],
  rarityWeights: Record<ItemRarity, number> = DEFAULT_RARITY_WEIGHTS,
  random: () => number = Math.random,
): ShopCatalogEntry | undefined {
  const candidates: WeightedEntry<ShopCatalogEntry>[] = shops.map((shop) => ({
    value: shop,
    weight: rarityWeights[resolveShopRarity(shop)] ?? rarityWeights.common,
  }))
  return pickWeightedOne(candidates, random)
}

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
  const picked: string[] = []
  for (let i = 0; i < count; i++) {
    const shortId = pickWeightedOne(
      candidates.map((c) => ({ value: c.shortId, weight: c.weight })),
      random,
    )
    if (shortId === undefined) break
    picked.push(shortId)
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

/** A room shop's custom offer: another plugin's item added to every instance (ADR 0206). */
export type ShoppingExtraOffer = {
  definition: ItemDefinition
  /** Unscaled price. */
  basePrice: number
  /** Units each user can buy; 1 when omitted. */
  stock?: number
}

/** Options for composed (custom) offers that belong to the shop owner's catalog. */
export type AppendExtraOffersOptions = {
  catalogByShortId?: ReadonlyMap<string, ItemCatalogEntry>
  hooks?: ShopEconomyHooks
  roomType?: RoomTypeForShopFilter | null
  /**
   * Extras whose `sourcePlugin` is this id and whose `shortId` is in
   * `catalogByShortId` are room-gated and run through `hooks.decorateOffer`.
   * Other plugins' items stay ungated and undecorated.
   */
  ownerPlugin?: string
  /** Draw this many distinct offers per traveler. Gating and decoration run first. */
  sample?: RoomShopSample
  /** Used for `sample`. Defaults to `Math.random`. */
  random?: () => number
}

function ownedCatalogEntry(
  extra: ShoppingExtraOffer,
  opts?: AppendExtraOffersOptions,
): ItemCatalogEntry | undefined {
  if (!opts?.ownerPlugin || extra.definition.sourcePlugin !== opts.ownerPlugin) return undefined
  return opts.catalogByShortId?.get(extra.definition.shortId)
}

/**
 * Drop the owner's catalog extras that `availableInRoomTypes` excludes from
 * `roomType`. Without a room type, or for any other plugin's item, nothing is dropped.
 */
export function retainComposableExtras(
  extras: readonly ShoppingExtraOffer[],
  opts?: AppendExtraOffersOptions,
): ShoppingExtraOffer[] {
  if (!opts?.roomType) return [...extras]
  const roomType = opts.roomType
  return extras.filter((extra) => {
    const entry = ownedCatalogEntry(extra, opts)
    if (!entry) return true
    return isItemAvailableInRoomType(entry, roomType)
  })
}

/** Load warnings for catalog extras this room type will not sell. */
export function composableOfferWarnings(
  extras: readonly ShoppingExtraOffer[],
  opts?: AppendExtraOffersOptions,
): string[] {
  if (!opts?.roomType) return []
  const roomType = opts.roomType
  return extras.flatMap((extra) => {
    const entry = ownedCatalogEntry(extra, opts)
    if (!entry || isItemAvailableInRoomType(entry, roomType)) return []
    return [`${extra.definition.name} isn't sold in ${roomType} rooms; the van still stops`]
  })
}

function offerFromExtra(
  extra: ShoppingExtraOffer,
  offerId: number,
  economy: ReturnType<typeof resolveEconomy>,
  entry: ItemCatalogEntry | undefined,
  hooks?: ShopEconomyHooks,
): ShopOffer {
  const decorated = entry ? hooks?.decorateOffer?.(entry, extra.basePrice) : undefined
  const basePrice = decorated?.price ?? extra.basePrice
  const definition = entry?.definition ?? extra.definition
  return {
    offerId,
    shortId: extra.definition.shortId,
    definitionId: extra.definition.id,
    name: definition.name,
    description: definition.description,
    ...(entry && definition.artist?.trim() ? { artist: definition.artist.trim() } : {}),
    icon: definition.icon ?? ("package" as LucideIconName),
    ...(definition.imageUrl ? { imageUrl: definition.imageUrl } : {}),
    ...(entry && definition.imageUrlLarge ? { imageUrlLarge: definition.imageUrlLarge } : {}),
    ...(entry && definition.artworkFrame ? { artworkFrame: definition.artworkFrame } : {}),
    ...(entry && definition.mediaFormat ? { mediaFormat: definition.mediaFormat } : {}),
    ...(decorated?.condition ? { condition: decorated.condition } : {}),
    basePrice,
    price: scalePrice(basePrice, economy.costScale, economy.priceRounding),
    available: true,
    ...(extra.stock && extra.stock > 1 ? { remaining: extra.stock } : {}),
    rarity: definition.rarity ?? "common",
  }
}

/**
 * Distinct weighted picks from an already gated and decorated pool.
 * A count that covers the pool returns the pool in shelf order. Duplicates
 * (by `shortId`) collapse to the first. Generic so Game Studio's "Preview a
 * traveler" samples with this exact function instead of a copy.
 */
export function sampleComposableOffers<T extends Pick<ShopOffer, "shortId" | "rarity">>(
  offers: readonly T[],
  sample: RoomShopSample,
  random: () => number = Math.random,
): T[] {
  const unique: T[] = []
  const seen = new Set<string>()
  for (const offer of offers) {
    if (seen.has(offer.shortId)) continue
    seen.add(offer.shortId)
    unique.push(offer)
  }
  if (sample.count >= unique.length) return unique
  const even = sample.weights === "even"
  const picked = pickWeightedDistinctShortIds(
    unique.map((offer) => ({
      shortId: offer.shortId,
      weight: even ? 1 : (DEFAULT_RARITY_WEIGHTS[offer.rarity] ?? DEFAULT_RARITY_WEIGHTS.common),
    })),
    sample.count,
    random,
  )
  const byShortId = new Map(unique.map((offer) => [offer.shortId, offer]))
  return picked.map((shortId) => byShortId.get(shortId)!)
}

/**
 * Append custom offers after the sampled catalog ones, continuing `offerId`.
 * The owner's own catalog items are room-gated and decorated like a catalog
 * offer; every other extra is appended as given. `sample` then draws distinct
 * picks from that pool. Catalog-shop sampling is separate and is not merged in.
 */
export function appendExtraOffers(
  instance: ShoppingSessionInstance,
  extras: readonly ShoppingExtraOffer[],
  economy?: EconomyScaleState | null,
  opts?: AppendExtraOffersOptions,
): ShoppingSessionInstance {
  const kept = retainComposableExtras(extras, opts)
  if (kept.length === 0) return instance
  const resolved = resolveEconomy(economy)
  const built = kept.map((extra, i) =>
    offerFromExtra(extra, i, resolved, ownedCatalogEntry(extra, opts), opts?.hooks),
  )
  const chosen = opts?.sample
    ? sampleComposableOffers(built, opts.sample, opts.random ?? Math.random)
    : built
  const start = instance.offers.length
  const offers = chosen.map((offer, i) => ({ ...offer, offerId: start + i }))
  return { ...instance, offers: [...instance.offers, ...offers] }
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
