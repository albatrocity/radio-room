import type { ItemShopsShopCatalogEntry } from "@repo/plugin-base/helpers"
import { items } from "../../items"

export const RECORD_STORE_SHOP_ID = "record-store"

/**
 * Bridge-only shop. Physical Media SKUs are injected at runtime from
 * prefix-derived Navidrome playlists; Scratched CD is static here.
 */
export const RECORD_STORE_SHOP: ItemShopsShopCatalogEntry = {
  shopId: RECORD_STORE_SHOP_ID,
  name: "Record Store",
  openingMessage: "Flip through the bins and buy a record to expand your queuing options.",
  requiresPlaybackControllerId: "bridge",
  distinctOffers: true,
  availableItems: [{ shortId: items.scratchedCd.shortId, coinValue: 75 }],
  listedBuybackRate: 0.1,
  unlistedBuybackRate: 0,
}
