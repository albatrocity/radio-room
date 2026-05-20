import type { ItemShopsShopCatalogEntry } from "@repo/plugin-base/helpers"
import { items } from "../items"
import { SWEETWATER_SHOP } from "./sweetwater"
import { GREEN_ROOM_SHOP } from "./green-room"
import { FARMERS_MARKET_SHOP } from "./farmers-market"
import { SPY_WORLD_SHOP } from "./spy-world"

/**
 * Master shop definitions — random shop per user each shopping round.
 */
export const SHOP_CATALOG: readonly ItemShopsShopCatalogEntry[] = [
  SWEETWATER_SHOP,
  GREEN_ROOM_SHOP,
  FARMERS_MARKET_SHOP,
]