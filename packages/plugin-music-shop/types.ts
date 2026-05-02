import { z } from "zod"
import type { ShopOfferTableRow } from "@repo/types"
import {
  buildShopItemsFromCatalog,
  shopBuyAction,
  shopStockStoreKey,
  type ShopCatalogEntry,
  type ShopItem,
} from "@repo/plugin-base"

export const SCRATCHED_CD_SHORT_ID = "scratched-cd"
export const ANALOG_DELAY_SHORT_ID = "analog-delay-pedal"
export const COMPRESSOR_SHORT_ID = "compressor-pedal"

export const MUSIC_SHOP_CATALOG: readonly ShopCatalogEntry[] = [
  {
    shortId: SCRATCHED_CD_SHORT_ID,
    name: "Scratched CD",
    description: "Skip the currently playing song instantly.",
    stackable: true,
    maxStack: 99,
    tradeable: true,
    consumable: true,
    coinValue: 100,
    icon: "disc-2",
    initialStock: 3,
    sellBackRatio: 0.5,
  },
  {
    shortId: ANALOG_DELAY_SHORT_ID,
    name: "Analog Delay Pedal",
    description:
      "Echoes every word in a user's chat messages for a limited time. Use on yourself or others.",
    stackable: true,
    maxStack: 99,
    tradeable: false,
    consumable: true,
    requiresTarget: "user",
    coinValue: 50,
    icon: "square-stack",
    initialStock: 5,
    sellBackRatio: 0,
  },
  {
    shortId: COMPRESSOR_SHORT_ID,
    name: "Compressor Pedal",
    description: "Makes chat messages very small for a limited time. Use on yourself or others.",
    stackable: true,
    maxStack: 99,
    tradeable: false,
    consumable: true,
    requiresTarget: "user",
    coinValue: 50,
    icon: "shrink",
    initialStock: 5,
    sellBackRatio: 0,
  },
]

export function getMusicShopCatalogEntry(shortId: string): ShopCatalogEntry | undefined {
  return MUSIC_SHOP_CATALOG.find((e) => e.shortId === shortId)
}

export function requireMusicShopCatalogEntry(shortId: string): ShopCatalogEntry {
  const row = getMusicShopCatalogEntry(shortId)
  if (!row) {
    throw new Error(`[music-shop] Unknown catalog item: ${shortId}`)
  }
  return row
}

export const musicShopConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /**
   * When false, the shop tab is hidden and purchases are blocked, but
   * users can still _use_ items they previously purchased. Toggle this to
   * close sales without disabling item effects.
   */
  isSellingItems: z.boolean().default(true),
  /** How long the Analog Delay chat echo lasts (default 10 minutes). */
  effectDurationMs: z
    .number()
    .int()
    .min(60_000)
    .max(60 * 60 * 1000)
    .default(10 * 60 * 1000),
})

export type MusicShopConfig = z.infer<typeof musicShopConfigSchema>

export const defaultMusicShopConfig: MusicShopConfig = {
  enabled: false,
  isSellingItems: true,
  effectDurationMs: 10 * 60 * 1000,
}

export function buildMusicShopItems(): ShopItem[] {
  return buildShopItemsFromCatalog(MUSIC_SHOP_CATALOG)
}

/** Rows for `shop-offer-table` — derived from `MUSIC_SHOP_CATALOG`. */
export function buildMusicShopOfferRows(): ShopOfferTableRow[] {
  return MUSIC_SHOP_CATALOG.map((entry) => ({
    icon: entry.icon,
    name: entry.name,
    description: entry.description,
    price: entry.coinValue,
    quantityStoreKey: shopStockStoreKey(entry.shortId),
    action: shopBuyAction(entry.shortId),
    buyLabel: "Buy",
    confirmMessage: `Spend ${entry.coinValue} coins on ${entry.name}?`,
    confirmText: "Buy",
  }))
}

/** `storeKeys` for `getComponentSchema`: stock keys from catalog + `sellPrice`. */
export function musicShopComponentStoreKeys(): string[] {
  return [...MUSIC_SHOP_CATALOG.map((e) => shopStockStoreKey(e.shortId)), "sellPrice"]
}
