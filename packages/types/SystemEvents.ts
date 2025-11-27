import type { SystemEventHandlers, SystemEventPayload, SystemEventName } from "./SystemEventTypes"

/**
 * SystemEvents interface for unified event emission
 *
 * This is the public API for the SystemEvents class.
 * The actual implementation lives in @repo/server/lib/SystemEvents.ts
 */
export interface SystemEvents {
  /**
   * Emit a system event to all consumers (Redis PubSub + Plugin System + Socket.IO)
   *
   * @param roomId - Room where the event occurred
   * @param event - Event name (must be a valid SystemEventName)
   * @param data - Event payload (must match event signature)
   */
  emit<K extends SystemEventName>(
    roomId: string,
    event: K,
    data: SystemEventPayload<K>,
  ): Promise<void>
}

// Re-export for convenience
export type { SystemEventHandlers, SystemEventPayload, SystemEventName }
