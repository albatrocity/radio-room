import { z } from "zod"
import { buildShopItemsFromCatalog, type ShopCatalogEntry, type ShopItem } from "@repo/plugin-base"

export const MUSIC_SHOP_CATALOG: readonly ShopCatalogEntry[] = [
  {
    shortId: "skip-token",
    name: "Scratched CD",
    description: "Skip the currently playing song instantly.",
    stackable: true,
    maxStack: 99,
    tradeable: true,
    consumable: true,
    coinValue: 100,
    icon: "skip-forward",
    initialStock: 3,
    sellBackRatio: 0.5,
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
})

export type MusicShopConfig = z.infer<typeof musicShopConfigSchema>

export const defaultMusicShopConfig: MusicShopConfig = {
  enabled: false,
  isSellingItems: true,
}

export function buildMusicShopItems(): ShopItem[] {
  return buildShopItemsFromCatalog(MUSIC_SHOP_CATALOG)
}
