import type {
  ItemShopsShopCatalogEntry,
  ShopBuyContext,
  ShopSessionContext,
} from "@repo/plugin-base/helpers"
import { items } from "../../items"

type GreenRoomUserState = { username: string }

/** Delay before returning a confiscated item after the shopping round ends */
const GREEN_ROOM_RETURN_MS = 5 * 60 * 1000

function greenRoomOnBuy(ctx: ShopBuyContext): void {
  ctx.setState<GreenRoomUserState>(ctx.userId, { username: ctx.username })
}

async function greenRoomOnSessionEnd(ctx: ShopSessionContext): Promise<void> {
  const userIds = ctx.getAllStateKeys()
  for (const userId of userIds) {
    const inv = await ctx.inventory.getInventory(userId)
    const stacks = inv.items.filter((s) => s.sourcePlugin === ctx.pluginName && s.quantity > 0)
    if (stacks.length === 0) {
      ctx.deleteState(userId)
      continue
    }

    const stack = stacks[Math.floor(Math.random() * stacks.length)]!
    const definition = await ctx.inventory.getItemDefinition(stack.definitionId)
    const itemName = definition?.name ?? "item"

    const removed = await ctx.inventory.removeItem(userId, stack.itemId, 1)
    if (!removed) {
      ctx.deleteState(userId)
      continue
    }

    await ctx.sendUserSystemMessage(
      userId,
      `Hey, you left your ${itemName}. We're closing up for the night but we'll get it back to you soon.`,
      { type: "alert", status: "info", title: "Message from the Green Room" },
    )

    const definitionId = stack.definitionId
    ctx.startTimer(`return:${userId}:${Date.now()}`, {
      duration: GREEN_ROOM_RETURN_MS,
      callback: async () => {
        const returned = await ctx.inventory.giveItem(
          userId,
          definitionId,
          1,
          undefined,
          "purchase",
        )
        if (!returned) return
        await ctx.sendUserSystemMessage(
          userId,
          `hey here's your ${itemName} back`,
          { type: "alert", status: "info", title: "Message from the Green Room" },
        )
      },
    })

    ctx.deleteState(userId)
  }
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
    { shortId: items.marsEgg.shortId, coinValue: 32 },
  ],
  listedBuybackRate: 0.1,
  unlistedBuybackRate: 0,
  onBuy: greenRoomOnBuy,
  onSessionEnd: greenRoomOnSessionEnd,
}
