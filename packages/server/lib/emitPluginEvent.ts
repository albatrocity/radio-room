import { AppContext, PluginLifecycleEvents } from "@repo/types"

/**
 * Helper function to emit plugin lifecycle events with consistent error handling
 *
 * This helper should ONLY be used from operations layer, not from handlers.
 * Plugin events are domain events and should be emitted when domain logic completes.
 *
 * @example
 * ```typescript
 * // In an operation file (e.g., operations/reactions/addReaction.ts)
 * await emitPluginEvent(context, roomId, "reactionAdded", { roomId, reaction })
 * ```
 *
 * @param context - Application context containing the plugin registry
 * @param roomId - ID of the room where the event occurred
 * @param event - Name of the plugin lifecycle event to emit
 * @param data - Event data matching the event type signature
 */
export async function emitPluginEvent<K extends keyof PluginLifecycleEvents>(
  context: AppContext,
  roomId: string,
  event: K,
  data: Parameters<PluginLifecycleEvents[K]>[0],
): Promise<void> {
  if (!context.pluginRegistry) {
    return
  }

  try {
    await context.pluginRegistry.emit(roomId, event, data)
  } catch (error) {
    console.error(`[PluginEvents] Error emitting ${event} for room ${roomId}:`, error)
  }
}
