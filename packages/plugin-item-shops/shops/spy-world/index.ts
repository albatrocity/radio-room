import type { ItemShopsShopCatalogEntry } from "@repo/plugin-base/helpers"
import { items } from "../../items"

export const SPY_WORLD_SHOP: ItemShopsShopCatalogEntry = {
  shopId: "spy-world",
  name: "Spy World",
  openingMessage:
    "Welcome to {{shopName}} — discretion is our specialty. Off-the-record essentials only.",
  availableItems: [{ shortId: items.skiMask.shortId, coinValue: 38 }],
  listedBuybackRate: 0.35,
  unlistedBuybackRate: 0.12,
}
