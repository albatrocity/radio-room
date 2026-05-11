import type { ItemShopsShopCatalogEntry } from "@repo/plugin-base/helpers"
import { items } from "../items"
import { SWEETWATER_SHOP } from "./sweetwater"
import { GREEN_ROOM_SHOP } from "./green-room"
import { SPY_WORLD_SHOP } from "./spy-world"

/**
 * Master shop definitions — random shop per user each shopping round.
 */
export const SHOP_CATALOG: readonly ItemShopsShopCatalogEntry[] = [
  SWEETWATER_SHOP,
  GREEN_ROOM_SHOP,
  SPY_WORLD_SHOP,
  {
    shopId: "Pawn-Shop",
    name: "Pawn Shop",
    openingMessage: "A {{shopName}}! Might be able to find some deals or make some cash. ",
    availableItems: [{ shortId: items.boostPedal.shortId, coinValue: 8 }
      , { shortId: items.compressorPedal.shortId, coinValue: 8}
      ,{ shortId: items.emptyFridge.shortId, coinValue: 10},
      { shortId: items.scratchedCd.shortId, coinValue: 18},
      { shortId: items.sampleHold.shortId, coinValue: 15},
      { shortId: items.analogDelayPedal.shortId, coinValue: 15},
      { shortId: items.jokerPedal.shortId, coinValue: 10},
    ],
    listedBuybackRate: 4.0,
    unlistedBuybackRate: 2.0,
  },
]
