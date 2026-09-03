import type { AppContext, InventoryItem } from "@repo/types"
import { getUser } from "../data/users"
import { resolveActorPresentedIdentity } from "../presentedIdentity"

/**
 * Resolve how `userId` should be labelled in room-visible output (ADR 0150).
 * When a `roomId` is provided the result honours presented-identity grants
 * (disguises, etc.); without one it falls back to the raw DB username.
 */
export async function displayName(
  context: AppContext,
  userId: string,
  roomId?: string,
): Promise<string> {
  if (roomId) {
    const resolved = await resolveActorPresentedIdentity({ context, roomId, userId })
    return resolved.label
  }
  const user = await getUser({ userId, context })
  return user?.username?.trim() || "Someone"
}

/**
 * Like {@link displayName} but also returns whether the label was masked, so
 * callers can populate `meta.maskedUserIds` for X-Ray pierce (ADR 0149).
 */
export async function displayNameWithMaskMeta(
  context: AppContext,
  roomId: string,
  userId: string,
): Promise<{ label: string; userId: string; masked: boolean }> {
  return resolveActorPresentedIdentity({ context, roomId, userId })
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
