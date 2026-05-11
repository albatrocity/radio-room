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
    { shortId: items.hummusVeggies.shortId, coinValue: 10 },
    { shortId: items.emptyFridge.shortId, coinValue: 10 },
    { shortId: items.cateredMeal.shortId, coinValue: 25 },
    { shortId: items.buyout.shortId, coinValue: 25 },
    { shortId: items.vanCubby.shortId, coinValue: 80 },
    { shortId: items.gravityBong.shortId, coinValue: 50 },
  ],
  listedBuybackRate: 0.1,
  unlistedBuybackRate: 0,
  onBuy: greenRoomOnBuy,
}
