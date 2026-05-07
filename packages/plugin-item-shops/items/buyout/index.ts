import type { ItemDefinition, ItemUseResult } from "@repo/types"
import { createItem, type ItemShopsBehaviorDeps } from "../shared/types"

async function useBuyout(
  deps: ItemShopsBehaviorDeps,
  userId: string,
  definition: ItemDefinition,
): Promise<ItemUseResult> {
  const { context, game, pluginName } = deps

  const inv = await context.inventory.getInventory(userId)
  const stacks = inv.items.filter(
    (s) => s.sourcePlugin === pluginName && s.definitionId !== definition.id,
  )

  if (stacks.length === 0) {
    return { success: false, consumed: false, message: "You have no items to sell." }
  }

  let totalRefund = 0
  let itemsSold = 0

  for (const stack of stacks) {
    const def = await context.inventory.getItemDefinition(stack.definitionId)
    if (!def) continue

    const refundPerUnit = (def.coinValue ?? 0) * 2
    const stackRefund = refundPerUnit * stack.quantity

    await context.inventory.removeItem(userId, stack.itemId, stack.quantity)
    if (stackRefund > 0) {
      await game.addScore(userId, "coin", stackRefund, `${pluginName}:buyout`)
    }
    totalRefund += stackRefund
    itemsSold += stack.quantity
  }

  const [user] = await context.api.getUsersByIds([userId])
  const username = user?.username?.trim() || userId
  await context.api.sendSystemMessage(
    context.roomId,
    `${username} used Buyout and liquidated ${itemsSold} item(s) for ${totalRefund} coins!`,
  )

  return {
    success: true,
    consumed: true,
    message: `Sold ${itemsSold} item(s) for ${totalRefund} coins.`,
  }
}

export const buyout = createItem({
  shortId: "buyout",
  definition: {
    name: "Buyout",
    description: "Sell all your items for 2x their value.",
    stackable: false,
    maxStack: 1,
    tradeable: false,
    consumable: true,
    coinValue: 25,
    icon: "hand-coins",
    rarity: "rare",
  },
  use: useBuyout,
})
