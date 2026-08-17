import type { ItemShopsShopCatalogEntry } from "@repo/plugin-base/helpers"
import { items } from "../../items"

export const THRIFT_STORE_SHOP_ID = "thrift-store"

/**
 * Bridge-only shop. Local library grant SKUs are injected at runtime from
 * Item Shops `localLibraryGrants` config; only Scratched CD is static here.
 */
export const THRIFT_STORE_SHOP: ItemShopsShopCatalogEntry = {
  shopId: THRIFT_STORE_SHOP_ID,
  name: "Thrift Store",
  openingMessage: "Browse a variety of pre-loved items from your favorite thrift store.",
  requiresPlaybackControllerId: "bridge",
  availableItems: [{ shortId: items.scratchedCd.shortId, coinValue: 75 }],
  listedBuybackRate: 0.1,
  unlistedBuybackRate: 0,
}
