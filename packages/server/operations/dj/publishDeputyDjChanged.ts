import type { AppContext } from "@repo/types"

/**
 * Emit DEPUTY_DJ_CHANGED after a successful deputy DJ membership change.
 * Call from operations/services that mutate `room:{id}:djs` / `isDeputyDj`.
 */
export async function publishDeputyDjChanged(params: {
  context: AppContext
  roomId: string
  userId: string
  isDeputyDj: boolean
}): Promise<void> {
  const { context, roomId, userId, isDeputyDj } = params
  if (!context.systemEvents) return

  await context.systemEvents.emit(roomId, "DEPUTY_DJ_CHANGED", {
    roomId,
    userId,
    isDeputyDj,
  })
}
