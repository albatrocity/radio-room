import type { ItemShopsShopCatalogEntry, ShopBuyContext } from "@repo/plugin-base/helpers"
import { items } from "../../items"

function farmersMarketOnBuy(_ctx: ShopBuyContext): void {
  // TODO: Implement purchase side effects (state, timers, messages).
}

export const FARMERS_MARKET_SHOP: ItemShopsShopCatalogEntry = {
  shopId: "farmers-market",
  name: "Farmers Market",
  openingMessage: "(Howdy, friend! You strike me as somebody who appreciates a good piece of fresh produce. Come get you some at the {{shopName}}!)",
  availableItems: [
    { shortId: items.carrots.shortId, coinValue: 15 },
    { shortId: items.tomatoes.shortId, coinValue: 15 },
    { shortId: items.greenPeas.shortId, coinValue: 15 },
  ],
  listedBuybackRate: 0.5,
  unlistedBuybackRate: 0.25,
  onBuy: farmersMarketOnBuy,
}
