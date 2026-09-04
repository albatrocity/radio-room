import type { AppContext, InventoryItem, ItemDefinition, ItemSellResult } from "@repo/types"

export type InventoryActionResultPayload = {
  success: boolean
  message?: string
  refund?: number
  title?: string
  duration?: number
  toastType?: "success" | "warning" | "error" | "info"
}

function pluginRegistry(context: AppContext):
  | {
      invokeOnItemSold?: (
        roomId: string,
        pluginName: string,
        userId: string,
        item: InventoryItem,
        definition: ItemDefinition,
        callContext: unknown,
      ) => Promise<ItemSellResult | null>
    }
  | undefined {
  return context.pluginRegistry as
    | {
        invokeOnItemSold?: (
          roomId: string,
          pluginName: string,
          userId: string,
          item: InventoryItem,
          definition: ItemDefinition,
          callContext: unknown,
        ) => Promise<ItemSellResult | null>
      }
    | undefined
}

/**
 * Sell an inventory item back to its owning plugin (typically a shop).
 * The plugin's `onItemSold` handler performs the sale.
 */
export async function sellInventoryItem(params: {
  roomId: string
  userId: string
  itemId?: string
  context: AppContext
}): Promise<InventoryActionResultPayload> {
  const inventory = params.context.inventory
  const registry = pluginRegistry(params.context)

  if (!inventory || !registry?.invokeOnItemSold) {
    return { success: false, message: "Inventory service not available" }
  }

  if (!params.itemId) {
    return { success: false, message: "Missing itemId" }
  }

  const inv = await inventory.getInventory(params.roomId, params.userId)
  const item = (inv.items as InventoryItem[]).find((i) => i.itemId === params.itemId)
  if (!item) {
    return { success: false, message: "Item not found in inventory" }
  }

  const definition = await inventory.getItemDefinition(params.roomId, item.definitionId)
  if (!definition) {
    return { success: false, message: "Item definition not found" }
  }

  const result = await registry.invokeOnItemSold(
    params.roomId,
    definition.sourcePlugin,
    params.userId,
    item,
    definition,
    undefined,
  )

  if (!result) {
    return { success: false, message: "This item can't be sold." }
  }

  return { success: result.success, message: result.message, refund: result.refund }
}
