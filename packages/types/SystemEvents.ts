import type { PluginLifecycleEvents } from "./Plugin"

/**
 * SystemEvents interface for unified event emission
 * 
 * This is the public API for the SystemEvents class.
 * The actual implementation lives in @repo/server/lib/SystemEvents.ts
 */
export interface SystemEvents {
  /**
   * Emit a system event to all consumers (Redis PubSub + Plugin System)
   * 
   * @param roomId - Room where the event occurred
   * @param event - Event name (must match PluginLifecycleEvents)
   * @param data - Event payload (must match event signature)
   */
  emit<K extends keyof PluginLifecycleEvents>(
    roomId: string,
    event: K,
    data: Parameters<PluginLifecycleEvents[K]>[0],
  ): Promise<void>
}

