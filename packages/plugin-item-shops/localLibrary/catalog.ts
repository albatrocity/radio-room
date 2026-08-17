import type { ItemCatalogEntry, ItemShopsShopCatalogEntry } from "@repo/plugin-base/helpers"
import { ITEM_CATALOG } from "../items/index"
import { SHOP_CATALOG } from "../shops"
import { items } from "../items"
import { buildGrantCatalogEntries } from "./grants"
import type { LocalLibraryGrantConfig } from "./config"
import { PUBLIC_LIBRARY_SHOP } from "./shops/public-library"
import { RECORD_STORE_SHOP, RECORD_STORE_SHOP_ID } from "./shops/record-store"

export { RECORD_STORE_SHOP_ID } from "./shops/record-store"
export { PUBLIC_LIBRARY_SHOP_ID } from "./shops/public-library"

export const LOCAL_LIBRARY_SHOP_IDS = [RECORD_STORE_SHOP.shopId, PUBLIC_LIBRARY_SHOP.shopId] as const

export function defaultEnabledShopIds(): string[] {
  return [...SHOP_CATALOG.map((s) => s.shopId), ...LOCAL_LIBRARY_SHOP_IDS]
}

export function buildEffectiveItemCatalog(
  grants: readonly LocalLibraryGrantConfig[],
  derivedPhysicalMedia: readonly ItemCatalogEntry[] = [],
): ItemCatalogEntry[] {
  return [...ITEM_CATALOG, ...buildGrantCatalogEntries(grants), ...derivedPhysicalMedia]
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
      availableItems: [
        ...derivedPhysicalMedia.map((e) => ({
          shortId: e.definition.shortId,
          coinValue: e.definition.coinValue ?? 0,
        })),
        ...extraGrantStock,
        { shortId: items.scratchedCd.shortId, coinValue: 75 },
      ],
    })
  }

  shops.push(PUBLIC_LIBRARY_SHOP)
  return shops
}
