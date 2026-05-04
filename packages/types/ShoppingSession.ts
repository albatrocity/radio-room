/**
 * Shopping session instances (per-user, ephemeral to a "shopping round").
 * See ADR 0049.
 */

export type ItemRarity = "common" | "uncommon" | "rare" | "legendary"

/**
 * One offer row in the user's current shop instance.
 */
export interface ShopOffer {
  shortId: string
  name: string
  description: string
  icon: string
  price: number
  /** false after the user purchased the single available unit. */
  available: boolean
}

/**
 * A user's active shop visit for the current shopping round.
 */
export interface ShoppingSessionInstance {
  shopId: string
  shopName: string
  /** Interpolated opening line (DM), if any. */
  openingMessage?: string
  offers: ShopOffer[]
  /** When this instance was created (unix ms). */
  openedAt: number
  /**
   * Multiplier on shop list price when selling an item this shop lists (matches `ShopCatalogEntry.listedBuybackRate`).
   * Omitted on legacy persisted instances (shopping rounds started before this field existed).
   */
  listedBuybackRate?: number
  /**
   * Multiplier on catalog `coinValue` when selling an item not listed by this shop (`unlistedBuybackRate`).
   */
  unlistedBuybackRate?: number
  /**
   * `shortId`s that this shop lists (same as `ShopCatalogEntry.availableItems`), for client sell quotes.
   * Omitted on legacy instances — client falls back to unlisted-only math for quoting.
   */
  listedShortIds?: string[]
  /**
   * Per-`shortId` shop price overrides when `availableItems` set `coinValue` (mirrors `resolveShopItemPrice`).
   */
  listedPriceOverrides?: Record<string, number>
}

/** Plugin name for storage + API wiring. */
export const ITEM_SHOPS_PLUGIN_NAME = "item-shops" as const

/**
 * Keys used in plugin storage (values are namespaced by room + plugin in Redis).
 * Keep in sync with `ShoppingSessionHelper` in @repo/plugin-base.
 */
export const ITEM_SHOPS_SESSION_STORAGE_KEYS = {
  ACTIVE: "shopping-session:active",
  INSTANCES: "shopping-session:instances",
} as const
