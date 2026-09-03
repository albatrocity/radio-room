import type { ItemShopsShopCatalogEntry } from "@repo/plugin-base/helpers"
import { SWEETWATER_SHOP } from "./sweetwater"
import { GREEN_ROOM_SHOP } from "./green-room"
import { FARMERS_MARKET_SHOP } from "./farmers-market"
import { SPY_WORLD_SHOP } from "./spy-world"

/**
 * Master shop definitions — random shop per user each shopping round.
 * Record Store is contributed by `localLibrary/` when the room is on the
 * Media Bridge and derived Physical Media exists.
 */
export const SHOP_CATALOG: readonly ItemShopsShopCatalogEntry[] = [
  SWEETWATER_SHOP,
  GREEN_ROOM_SHOP,
  FARMERS_MARKET_SHOP,
  SPY_WORLD_SHOP,
]
