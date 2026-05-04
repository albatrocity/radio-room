import type { ItemShopsShopCatalogEntry } from "@repo/plugin-base/helpers"
import {
  ANALOG_DELAY_SHORT_ID,
  BOOST_SHORT_ID,
  COMPRESSOR_SHORT_ID,
  GATE_SHORT_ID,
  JOKER_PEDAL_SHORT_ID,
  SAMPLE_HOLD_SHORT_ID,
} from "./items"

/**
 * Master shop definitions — random shop per user each shopping round.
 */
export const SHOP_CATALOG: readonly ItemShopsShopCatalogEntry[] = [
  {
    shopId: "sweetwater",
    name: "Sweetwater",
    openingMessage:
      "{{shopName}} would love to guide you on your gear journey! Check out our selection in the Item Shop tab and reach out to one of our friendly gear experts!",
    availableItems: [
      { shortId: ANALOG_DELAY_SHORT_ID, coinValue: 10 },
      { shortId: COMPRESSOR_SHORT_ID, coinValue: 15 },
      { shortId: BOOST_SHORT_ID, coinValue: 20 },
      { shortId: GATE_SHORT_ID, coinValue: 25 },
      { shortId: JOKER_PEDAL_SHORT_ID, coinValue: 28 },
      { shortId: SAMPLE_HOLD_SHORT_ID, coinValue: 30 },
    ],
    listedBuybackRate: 0.5,
    unlistedBuybackRate: 0.25,
  },
  {
    shopId: "startup-guy",
    name: "Startup Guy",
    openingMessage: "{{shopName}} wants to acquire some of your assets!",
    availableItems: [{ shortId: BOOST_SHORT_ID, coinValue: 200 }],
    listedBuybackRate: 4.0,
    unlistedBuybackRate: 2.0,
  },
]
