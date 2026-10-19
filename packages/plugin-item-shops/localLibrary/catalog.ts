import type { ItemCatalogEntry, ItemShopsShopCatalogEntry } from "@repo/plugin-base/helpers"
import { ITEM_CATALOG } from "../items/index"
import { SHOP_CATALOG } from "../shops"
import { buildGrantCatalogEntries } from "./grants"
import type { LocalLibraryGrantConfig } from "./config"
import { matchingPhysicalMedia } from "./physicalMediaStock"
import { RECORD_STORE_SHOP, RECORD_STORE_SHOP_ID, RECORD_STORE_FIXED_ITEMS } from "./shops/record-store"

export { RECORD_STORE_SHOP_ID } from "./shops/record-store"

export const LOCAL_LIBRARY_SHOP_IDS = [RECORD_STORE_SHOP.shopId] as const

export function defaultEnabledShopIds(): string[] {
  return [...SHOP_CATALOG.map((s) => s.shopId), ...LOCAL_LIBRARY_SHOP_IDS]
}

export function buildEffectiveItemCatalog(
  grants: readonly LocalLibraryGrantConfig[],
  derivedPhysicalMedia: readonly ItemCatalogEntry[] = [],
): ItemCatalogEntry[] {
  return [...ITEM_CATALOG, ...buildGrantCatalogEntries(grants), ...derivedPhysicalMedia]
}

/**
 * A shop with its `physicalMedia` bin appended to `availableItems` (ADR 0214).
 * Records are one-off copies, so a stocked bin samples distinct offers.
 */
export function withPhysicalMediaStock(
  shop: ItemShopsShopCatalogEntry,
  derivedPhysicalMedia: readonly ItemCatalogEntry[],
): ItemShopsShopCatalogEntry {
  if (!shop.physicalMedia) return shop
  const bin = matchingPhysicalMedia(derivedPhysicalMedia, shop.physicalMedia)
  if (bin.length === 0) return shop
  return { ...shop, availableItems: [...shop.availableItems, ...bin], distinctOffers: true }
}

export function buildEffectiveShopCatalog(
  grants: readonly LocalLibraryGrantConfig[],
  derivedPhysicalMedia: readonly ItemCatalogEntry[] = [],
): ItemShopsShopCatalogEntry[] {
  const shops: ItemShopsShopCatalogEntry[] = [...SHOP_CATALOG]

  if (derivedPhysicalMedia.length > 0) {
    const extraGrantStock = grants
      .filter((g) => g.scope === "playlist")
      .map((g) => ({ shortId: g.shortId, coinValue: g.coinValue ?? 0 }))
    shops.push({
      ...RECORD_STORE_SHOP,
      availableItems: [...RECORD_STORE_FIXED_ITEMS, ...extraGrantStock],
    })
  }

  return shops.map((shop) => withPhysicalMediaStock(shop, derivedPhysicalMedia))
}
