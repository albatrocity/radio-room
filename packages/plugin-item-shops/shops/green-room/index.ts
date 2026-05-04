import type { ItemShopsShopCatalogEntry } from "@repo/plugin-base/helpers"
import { HUMMUS_VEGGIES_SHORT_ID } from "../../items"

export const GREEN_ROOM_SHOP: ItemShopsShopCatalogEntry = {
  shopId: "green-room",
  name: "Green Room",
  openingMessage: "{{shopName}} is downstairs. There should be some stuff in the fridge for you.",
  availableItems: [{ shortId: HUMMUS_VEGGIES_SHORT_ID, coinValue: 50 }],
  listedBuybackRate: 0.1,
  unlistedBuybackRate: 0,
}
