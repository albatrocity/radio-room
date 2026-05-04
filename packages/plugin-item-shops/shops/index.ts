import type { ItemShopsShopCatalogEntry } from "@repo/plugin-base/helpers"
import { BOOST_SHORT_ID } from "../items"
import { SWEETWATER_SHOP } from "./sweetwater"
import { GREEN_ROOM_SHOP } from "./green-room"

/**
 * Master shop definitions — random shop per user each shopping round.
 */
export const SHOP_CATALOG: readonly ItemShopsShopCatalogEntry[] = [
  SWEETWATER_SHOP,
  GREEN_ROOM_SHOP,
  {
    shopId: "startup-guy",
    name: "Startup Guy",
    openingMessage: "{{shopName}} wants to acquire some of your assets!",
    availableItems: [{ shortId: BOOST_SHORT_ID, coinValue: 200 }],
    listedBuybackRate: 4.0,
    unlistedBuybackRate: 2.0,
  },
]
