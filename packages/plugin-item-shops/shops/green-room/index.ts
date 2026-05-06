import type { ItemShopsShopCatalogEntry, ShopBuyContext } from "@repo/plugin-base/helpers"
import { HUMMUS_VEGGIES_SHORT_ID, CATERED_MEAL_SHORT_ID, EMPTY_FRIDGE_SHORT_ID } from "../../items"

type GreenRoomUserState = { username: string }

function greenRoomOnBuy(ctx: ShopBuyContext): void {
  ctx.setState<GreenRoomUserState>(ctx.userId, { username: ctx.username })
}

export const GREEN_ROOM_SHOP: ItemShopsShopCatalogEntry = {
  shopId: "green-room",
  name: "Green Room",
  openingMessage: "{{shopName}} is downstairs. There should be some stuff in the fridge for you.",
  availableItems: [
    { shortId: HUMMUS_VEGGIES_SHORT_ID, coinValue: 50 },
    { shortId: EMPTY_FRIDGE_SHORT_ID, coinValue: 50 },
    { shortId: CATERED_MEAL_SHORT_ID, coinValue: 75 },
  ],
  listedBuybackRate: 0.1,
  unlistedBuybackRate: 0,
  onBuy: greenRoomOnBuy,
}
