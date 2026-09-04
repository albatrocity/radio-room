import type { AppContext } from "@repo/types"
import type { InventoryActionResultPayload } from "./sellInventoryItem"

/**
 * Use an inventory item. Core validates ownership and dispatches to the
 * source plugin's `onItemUsed` handler.
 */
export async function useInventoryItem(params: {
  roomId: string
  userId: string
  itemId?: string
  callContext?: Record<string, unknown>
  context: AppContext
}): Promise<InventoryActionResultPayload> {
  const inventory = params.context.inventory
  if (!inventory) {
    return { success: false, message: "Inventory service not available" }
  }

  if (!params.itemId) {
    return { success: false, message: "Missing itemId" }
  }

  const result = await inventory.useItem(
    params.roomId,
    params.userId,
    params.itemId,
    params.callContext,
  )

  return {
    success: result.success,
    message: result.message,
    ...(result.title != null ? { title: result.title } : {}),
    ...(result.duration != null ? { duration: result.duration } : {}),
    ...(result.toastType != null ? { toastType: result.toastType } : {}),
  }
}
