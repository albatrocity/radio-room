import type { InventoryItem, ItemDefinition, ItemUseResult } from "@repo/types"
import { createItem, type ItemShopsBehaviorDeps } from "../shared/types"

async function resolveItemDefinition(
  inventory: ItemShopsBehaviorDeps["context"]["inventory"],
  pluginName: string,
  definitionId: string,
): Promise<ItemDefinition | null> {
  const direct = await inventory.getItemDefinition(definitionId)
  if (direct) return direct
  if (!definitionId.includes(":")) {
    return inventory.getItemDefinition(`${pluginName}:${definitionId}`)
  }
  return null
}

async function useBuyout(
  deps: ItemShopsBehaviorDeps,
  userId: string,
  definition: ItemDefinition,
): Promise<ItemUseResult> {
  const { context, game, pluginName } = deps

  const inv = await context.inventory.getInventory(userId)

  /** Resolve definitions here so we match persisted rows that omit `sourcePlugin` or use bare shortIds. */
  const targets: { stack: InventoryItem; def: ItemDefinition }[] = []
  for (const stack of inv.items) {
    const def = await resolveItemDefinition(context.inventory, pluginName, stack.definitionId)
    if (def?.sourcePlugin !== pluginName) continue
    if (def.shortId === definition.shortId) continue
    targets.push({ stack, def })
  }

  if (targets.length === 0) {
    return { success: false, consumed: false, message: "You have no items to sell." }
  }

  let totalRefund = 0
  let itemsSold = 0

  for (const { stack, def } of targets) {
    const qty = Math.max(0, Math.floor(Number(stack.quantity)))
    if (qty <= 0) continue

    const refundPerUnit = (def.coinValue ?? 0) * 2
    const stackRefund = refundPerUnit * qty

    const removed = await context.inventory.removeItem(userId, stack.itemId, qty)
    if (!removed) continue

    if (stackRefund > 0) {
      await game.addScore(userId, "coin", stackRefund, `${pluginName}:buyout`)
    }
    totalRefund += stackRefund
    itemsSold += qty
  }

  if (itemsSold <= 0) {
    return {
      success: false,
      consumed: false,
      message: "Could not remove items from inventory (nothing liquidated).",
    }
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
