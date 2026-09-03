import type { AppContext } from "@repo/types"
import { getPresentedIdentity } from "./getPresentedIdentity"
import { deletePresentedIdentityKey } from "./keys"

/**
 * Clear a user's presented-identity grant and notify the room (ADR 0150).
 * Returns false when there was nothing to clear.
 */
export async function clearPresentedIdentity(params: {
  context: AppContext
  roomId: string
  userId: string
}): Promise<boolean> {
  const { context, roomId, userId } = params
  const existing = await getPresentedIdentity({ context, roomId, userId })
  await deletePresentedIdentityKey(context, roomId, userId)
  if (!existing) return false

  if (context.systemEvents) {
    await context.systemEvents.emit(roomId, "PRESENTED_IDENTITY_CHANGED", {
      roomId,
      userId,
      grant: null,
    })
  }
  return true
}
