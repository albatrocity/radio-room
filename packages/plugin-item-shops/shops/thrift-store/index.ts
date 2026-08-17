import type { ItemShopsShopCatalogEntry } from "@repo/plugin-base/helpers"
import { items } from "../../items"

export const THRIFT_STORE_SHOP_ID = "thrift-store"

export const THRIFT_STORE_SHOP: ItemShopsShopCatalogEntry = {
  shopId: THRIFT_STORE_SHOP_ID,
  name: "Thrift Store",
  openingMessage:
    "Welcome to the {{shopName}}! Dig around for Library stickers and coupons — everything's been loved already.",
  requiresPlaybackControllerId: "bridge",
  availableItems: [
    { shortId: items.bargainBinSticker.shortId, coinValue: 15 },
    { shortId: items.outOfPrintSticker.shortId, coinValue: 15 },
    { shortId: items.localHeroesSticker.shortId, coinValue: 25 },
    { shortId: items.unreleasedSticker.shortId, coinValue: 50 },
    { shortId: items.thriftStoreCoupon.shortId, coinValue: 100 },
    { shortId: items.scratchedCd.shortId, coinValue: 75 },
  ],
  listedBuybackRate: 0.1,
  unlistedBuybackRate: 0,
}
