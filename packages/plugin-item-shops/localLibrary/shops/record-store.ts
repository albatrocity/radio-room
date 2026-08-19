import type { ItemShopsShopCatalogEntry } from "@repo/plugin-base/helpers"

export const RECORD_STORE_SHOP_ID = "record-store"

/**
 * Bridge-only shop. Physical Media SKUs are injected at runtime from
 * prefix-derived Navidrome playlists and extra playlist-scoped grant rows.
 */
export const RECORD_STORE_SHOP: ItemShopsShopCatalogEntry = {
  shopId: RECORD_STORE_SHOP_ID,
  name: "Record Store",
  openingMessage: "Flip through the bins and buy a record to expand your queuing options.",
  requiresPlaybackControllerId: "bridge",
  distinctOffers: true,
  availableItems: [],
  listedBuybackRate: 0.1,
  unlistedBuybackRate: 0,
}
