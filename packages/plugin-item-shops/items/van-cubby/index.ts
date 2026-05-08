import type { ItemUseResult } from "@repo/types"
import { ITEM_SHOPS_PLUGIN_NAME } from "@repo/types"
import { createItem } from "../shared/types"

const STORAGE_SHORT_IDS = new Set(["van-cubby", "merch-cash-box"])

export const vanCubby = createItem({
  shortId: "van-cubby",
  definition: {
    name: "Van Cubby",
    description:
      "Store another inventory item with a password. Anyone who knows the password can retrieve it later from Stored Items.",
    stackable: false,
    maxStack: 1,
    tradeable: true,
    consumable: true,
    requiresTarget: "inventoryItem",
    coinValue: 50,
    icon: "Archive",
    rarity: "rare",
  },
  use: async (deps, userId, definition, callContext): Promise<ItemUseResult> => {
    const ctx = callContext as
      | { targetInventoryItemId?: string; password?: string }
      | undefined
    const targetInventoryItemId = ctx?.targetInventoryItemId?.trim()
    const password = typeof ctx?.password === "string" ? ctx.password : ""

    if (!targetInventoryItemId) {
      return { success: false, consumed: false, message: "Select an item to store." }
    }
    if (!password) {
      return { success: false, consumed: false, message: "Enter a password to lock storage." }
    }

    const { context, pluginName } = deps
    const inv = await context.inventory.getInventory(userId)
    const target = inv.items.find((i) => i.itemId === targetInventoryItemId)
    if (!target) {
      return { success: false, consumed: false, message: "That item is not in your inventory." }
    }

    const targetDef = await context.inventory.getItemDefinition(target.definitionId)
    if (
      target.sourcePlugin === ITEM_SHOPS_PLUGIN_NAME &&
      targetDef?.shortId &&
      STORAGE_SHORT_IDS.has(targetDef.shortId)
    ) {
      return { success: false, consumed: false, message: "You can't store that item." }
    }

    const qty = target.quantity
    const removed = await context.inventory.removeItem(userId, target.itemId, qty)
    if (!removed) {
      return { success: false, consumed: false, message: "Could not remove the item from inventory." }
    }

    try {
      await context.artifacts.store({
        storingPlugin: pluginName,
        storingItemId: definition.shortId,
        artifactType: "item",
        itemDefinitionId: target.definitionId,
        itemName: targetDef?.name ?? target.definitionId,
        itemQuantity: qty,
        storedAt: Date.now(),
        storedByUserId: userId,
        storedByUsername:
          (await context.api.getUsersByIds([userId]).then((u) => u[0]?.username?.trim())) ||
          "Unknown",
        password,
      })
    } catch (e) {
      await context.inventory.giveItem(userId, target.definitionId, qty, target.metadata, "plugin")
      console.error("[van-cubby] store failed, refunded item", e)
      return { success: false, consumed: false, message: "Could not store the artifact." }
    }

    const [actor] = await context.api.getUsersByIds([userId])
    const label = targetDef?.name ?? "an item"
    await context.api.sendSystemMessage(
      context.roomId,
      `${actor?.username ?? "Someone"} stashed ${label} in the Van Cubby.`,
    )

    return { success: true, consumed: true, message: "Item locked away in storage." }
  },
})
