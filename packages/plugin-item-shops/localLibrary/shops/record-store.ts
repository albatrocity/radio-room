import type { ItemShopsShopCatalogEntry } from "@repo/plugin-base/helpers"
import { items } from "../../items"

export const RECORD_STORE_SHOP_ID = "record-store"

/** Broken-media SKUs sold alongside derived records (ADR 0155). */
export const RECORD_STORE_FIXED_ITEMS: { shortId: string; coinValue: number }[] = [
  { shortId: items.scratchedCd.shortId, coinValue: 75 },
  { shortId: items.dustyRecord.shortId, coinValue: 75 },
  { shortId: items.tangledTape.shortId, coinValue: 75 },
  { shortId: items.cdCleaner.shortId, coinValue: 25 },
  { shortId: items.dustCloth.shortId, coinValue: 25 },
  { shortId: items.pencil.shortId, coinValue: 25 },
  { shortId: items.cdPlayer.shortId, coinValue: 80 },
  { shortId: items.cassetteDeck.shortId, coinValue: 80 },
  { shortId: items.turntable.shortId, coinValue: 80 },
  { shortId: items.boombox.shortId, coinValue: 150 },
]

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
