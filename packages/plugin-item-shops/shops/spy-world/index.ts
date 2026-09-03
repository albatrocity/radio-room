import type { ItemShopsShopCatalogEntry } from "@repo/plugin-base/helpers"
import { items } from "../../items"

export const SPY_WORLD_SHOP: ItemShopsShopCatalogEntry = {
  shopId: "spy-world",
  name: "SPY WORLD",
  openingMessage:
    "THE EYE IN THE SKY IS WATCHING... TAKE REFUGE IN {{shopName}}",
  availableItems: [
    { shortId: items.disguise.shortId, coinValue: 30 },
    { shortId: items.honeypot.shortId, coinValue: 30 },
    { shortId: items.rubberBand.shortId, coinValue: 30 },
    { shortId: items.blackBag.shortId, coinValue: 100 },
    { shortId: items.xRay.shortId, coinValue: 60 },
  ],
  listedBuybackRate: 0.35,
  unlistedBuybackRate: 0.12,
}
