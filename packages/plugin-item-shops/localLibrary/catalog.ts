import type { ItemCatalogEntry, ItemShopsShopCatalogEntry } from "@repo/plugin-base/helpers"
import type { PhysicalMediaPick } from "@repo/types"
import { ITEM_CATALOG } from "../items/index"
import { SHOP_CATALOG } from "../shops"
import { buildGrantCatalogEntries } from "./grants"
import type { LocalLibraryGrantConfig } from "./config"
import { NO_PICK_STOCK, matchingPhysicalMedia, type PickStock } from "./physicalMediaStock"
import { RECORD_STORE_SHOP, RECORD_STORE_SHOP_ID, RECORD_STORE_FIXED_ITEMS } from "./shops/record-store"

export { RECORD_STORE_SHOP_ID } from "./shops/record-store"

export const LOCAL_LIBRARY_SHOP_IDS = [RECORD_STORE_SHOP.shopId] as const

export function defaultEnabledShopIds(): string[] {
  return [...SHOP_CATALOG.map((s) => s.shopId), ...LOCAL_LIBRARY_SHOP_IDS]
}

export function buildEffectiveItemCatalog(
  grants: readonly LocalLibraryGrantConfig[],
  derivedPhysicalMedia: readonly ItemCatalogEntry[] = [],
  pickedRecords: readonly ItemCatalogEntry[] = [],
): ItemCatalogEntry[] {
  const derivedIds = new Set(derivedPhysicalMedia.map((e) => e.definition.shortId))
  return [
    ...ITEM_CATALOG,
    ...buildGrantCatalogEntries(grants),
    ...derivedPhysicalMedia,
    ...pickedRecords.filter((e) => !derivedIds.has(e.definition.shortId)),
  ]
}

/**
 * A shop with its `physicalMedia` bin appended to `availableItems` (ADR 0214,
 * 0216): matching library records plus stockable picks, in one pool. Records
 * are one-off copies, so a stocked bin samples distinct offers.
 */
export function withPhysicalMediaStock(
  shop: ItemShopsShopCatalogEntry,
  derivedPhysicalMedia: readonly ItemCatalogEntry[],
  pickStock: PickStock = NO_PICK_STOCK,
): ItemShopsShopCatalogEntry {
  const stock = shop.physicalMedia
  if (!stock) return shop
  const library = stock.library ? matchingPhysicalMedia(derivedPhysicalMedia, stock.library) : []
  const picked = stock.picks?.length ? pickStock(stock.picks) : []
  const seen = new Set(shop.availableItems.map((item) => item.shortId))
  const bin = [...library, ...picked].filter((item) => {
    if (seen.has(item.shortId)) return false
    seen.add(item.shortId)
    return true
  })
  if (bin.length === 0) return shop
  return { ...shop, availableItems: [...shop.availableItems, ...bin], distinctOffers: true }
}

/** Picks that defined-in-code shops carry, registered like a site's (ADR 0216). */
export function codeShopPicks(): PhysicalMediaPick[] {
  return SHOP_CATALOG.flatMap((shop) => shop.physicalMedia?.picks ?? [])
}

export function buildEffectiveShopCatalog(
  grants: readonly LocalLibraryGrantConfig[],
  derivedPhysicalMedia: readonly ItemCatalogEntry[] = [],
  pickStock: PickStock = NO_PICK_STOCK,
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

  return shops.map((shop) => withPhysicalMediaStock(shop, derivedPhysicalMedia, pickStock))
}
