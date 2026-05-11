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

async function useNineVoltBattery(
  deps: ItemShopsBehaviorDeps,
  userId: string,
  definition: ItemDefinition,
): Promise<ItemUseResult> {
  const { context, pluginName } = deps

  const inv = await context.inventory.getInventory(userId)
  const candidates: { stack: InventoryItem; def: ItemDefinition }[] = []

  for (const stack of inv.items) {
    const def = await resolveItemDefinition(context.inventory, pluginName, stack.definitionId)
    if (!def || def.shortId === definition.shortId) continue
    const qty = Math.max(0, Math.floor(Number(stack.quantity)))
    if (qty <= 0) continue
    candidates.push({ stack, def })
  }

  if (candidates.length === 0) {
    return {
      success: false,
      consumed: false,
      message: "You need at least one other item in your inventory to duplicate.",
    }
  }

  const pick = candidates[Math.floor(Math.random() * candidates.length)]!
  const granted = await context.inventory.giveItem(
    userId,
    pick.stack.definitionId,
    1,
    pick.stack.metadata,
    "plugin",
  )

  if (!granted) {
    return {
      success: false,
      consumed: false,
      message: "Your inventory is full — no room for a duplicate.",
    }
  }

  const [actor] = await context.api.getUsersByIds([userId])
  const username = actor?.username?.trim() || userId
  const label = pick.def.name ?? "an item"
  await context.api.sendSystemMessage(
    context.roomId,
    `${username} used a 9v Battery and duplicated ${label}!`,
  )

  return {
    success: true,
    consumed: true,
    message: `Duplicated ${label}.`,
  }
}

export const nineVoltBattery = createItem({
  shortId: "9v-battery",
  definition: {
    name: "9v Battery",
    description: "Creates a copy of a random item in your inventory.",
    stackable: true,
    maxStack: 3,
    tradeable: true,
    consumable: true,
    coinValue: 25,
    icon: "Battery",
    rarity: "uncommon",
  },
  use: useNineVoltBattery,
})
