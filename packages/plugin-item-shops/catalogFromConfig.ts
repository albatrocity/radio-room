import type { PluginFieldMeta } from "@repo/types"
import type { ItemCatalogEntry, ShopCatalogEntry } from "@repo/plugin-base/helpers"
import { ITEM_CATALOG } from "./items/index"
import { SHOP_CATALOG } from "./shops"
import { THRIFT_STORE_SHOP_ID } from "./shops/thrift-store"
import { items } from "./items"
import {
  buildGrantCatalogEntries,
  LOCAL_LIBRARY_GRANT_USE_MESSAGE,
} from "./localLibraryGrants"
import type { LocalLibraryGrantConfig } from "./types"

/** Shared labels for object-array rows built from itemDefinitionAuthoringSchema keys. */
export function itemDefinitionAuthoringFieldMetas(options?: {
  showWhenEnabled?: boolean
}): { name: string; meta: PluginFieldMeta }[] {
  const showWhen = options?.showWhenEnabled
    ? { field: "enabled" as const, value: true }
    : undefined
  const base = (meta: PluginFieldMeta): PluginFieldMeta =>
    showWhen ? { ...meta, showWhen } : meta

  return [
    { name: "shortId", meta: base({ type: "string", label: "Item id (shortId)", description: "Stable id; changing it orphans existing inventory stacks." }) },
    { name: "name", meta: base({ type: "string", label: "Name" }) },
    { name: "description", meta: base({ type: "string", label: "Description" }) },
    { name: "icon", meta: base({ type: "string", label: "Icon (Lucide)", description: "e.g. Sticker, Ticket" }) },
    {
      name: "rarity",
      meta: base({
        type: "enum",
        label: "Rarity",
        options: [
          { value: "common", label: "Common" },
          { value: "uncommon", label: "Uncommon" },
          { value: "rare", label: "Rare" },
          { value: "legendary", label: "Legendary" },
        ],
      }),
    },
    { name: "coinValue", meta: base({ type: "number", label: "Shop price (coins)" }) },
  ]
}

export function buildEffectiveItemCatalog(
  grants: readonly LocalLibraryGrantConfig[],
): ItemCatalogEntry[] {
  return [...ITEM_CATALOG, ...buildGrantCatalogEntries(grants)]
}

export function buildEffectiveShopCatalog(
  grants: readonly LocalLibraryGrantConfig[],
): ShopCatalogEntry[] {
  const grantStock = grants.map((g) => ({
    shortId: g.shortId,
    coinValue: g.coinValue ?? 0,
  }))
  return SHOP_CATALOG.map((shop) => {
    if (shop.shopId !== THRIFT_STORE_SHOP_ID) return shop
    return {
      ...shop,
      availableItems: [
        ...grantStock,
        { shortId: items.scratchedCd.shortId, coinValue: 75 },
      ],
    }
  })
}

export { LOCAL_LIBRARY_GRANT_USE_MESSAGE }
