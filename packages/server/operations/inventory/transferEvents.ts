import type { AppContext, InventoryItem } from "@repo/types"
import { getUser } from "../data/users"

export async function displayName(context: AppContext, userId: string): Promise<string> {
  const user = await getUser({ userId, context })
  return user?.username?.trim() || "Someone"
}

export async function emitInventoryTransferred(params: {
  context: AppContext
  roomId: string
  fromUserId: string
  toUserId: string
  item: InventoryItem
  quantity: number
}): Promise<void> {
  if (!params.context.systemEvents) return
  const sessionId = (await params.context.gameSessions?.getActiveSession(params.roomId))?.id ?? ""
  await params.context.systemEvents.emit(params.roomId, "INVENTORY_ITEM_TRANSFERRED", {
    roomId: params.roomId,
    sessionId,
    fromUserId: params.fromUserId,
    toUserId: params.toUserId,
    item: params.item,
    quantity: params.quantity,
  })
}
