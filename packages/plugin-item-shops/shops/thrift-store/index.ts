import type { ItemShopsShopCatalogEntry } from "@repo/plugin-base/helpers"
import { items } from "../../items"

export const THRIFT_STORE_SHOP_ID = "thrift-store"

export const THRIFT_STORE_SHOP: ItemShopsShopCatalogEntry = {
  shopId: THRIFT_STORE_SHOP_ID,
  name: "Thrift Store",
  openingMessage:
    "Welcome to the {{shopName}}! Everything's been loved already. Dig around — you might find a coupon for the Library.",
  requiresPlaybackControllerId: "bridge",
  availableItems: [
    { shortId: items.thriftStoreCoupon.shortId, coinValue: 20 },
    { shortId: items.scratchedCd.shortId, coinValue: 75 },
  ],
  listedBuybackRate: 0.1,
  unlistedBuybackRate: 0,
}
