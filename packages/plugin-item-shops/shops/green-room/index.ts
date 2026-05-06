import type { ItemShopsShopCatalogEntry, ShopBuyContext } from "@repo/plugin-base/helpers"
import { items } from "../../items"

type GreenRoomUserState = { username: string }

function greenRoomOnBuy(ctx: ShopBuyContext): void {
  ctx.setState<GreenRoomUserState>(ctx.userId, { username: ctx.username })
}

export const GREEN_ROOM_SHOP: ItemShopsShopCatalogEntry = {
  shopId: "green-room",
  name: "Green Room",
  openingMessage: "{{shopName}} is downstairs. There should be some stuff in the fridge for you.",
  availableItems: [
    { shortId: items.hummusVeggies.shortId, coinValue: 50 },
    { shortId: items.emptyFridge.shortId, coinValue: 50 },
    { shortId: items.cateredMeal.shortId, coinValue: 75 },
  ],
  listedBuybackRate: 0.1,
  unlistedBuybackRate: 0,
  onBuy: greenRoomOnBuy,
}
