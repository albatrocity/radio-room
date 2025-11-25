import { AppContext, PluginLifecycleEvents } from "@repo/types"
import type { SystemEvents as ISystemEvents } from "@repo/types"
import { PluginRegistry } from "./plugins/PluginRegistry"

/**
 * SystemEvents - Unified event emission layer
 *
 * This class provides a single point of emission for system-level domain events.
 * Events are broadcast to multiple consumers:
 * - Redis PubSub (for cross-server communication and Socket.IO)
 * - Plugin System (for in-process plugin event handling)
 *
 * Benefits:
 * - Single emit() call instead of separate PubSub + Plugin emissions
 * - Consistent event payloads across all consumers
 * - Easy to add new consumers (webhooks, analytics, audit logs)
 * - Type-safe event definitions
 *
 * @example
 * ```typescript
 * await context.systemEvents.emit(roomId, "trackChanged", {
 *   roomId,
 *   track: nowPlaying,
 *   roomMeta: updatedCurrent
 * })
 * ```
 */
export class SystemEvents implements ISystemEvents {
  constructor(
    private readonly redis: AppContext["redis"],
    private readonly pluginRegistry?: PluginRegistry,
  ) {}

  /**
   * Emit a system event to all consumers
   *
   * This broadcasts the event to:
   * 1. Redis PubSub (publishes to SYSTEM:{EVENT} channel)
   * 2. Plugin System (emits to in-process plugins)
   *
   * @param roomId - Room where the event occurred
   * @param event - Event name (must match PluginLifecycleEvents)
   * @param data - Event payload (must match event signature)
   */
  async emit<K extends keyof PluginLifecycleEvents>(
    roomId: string,
    event: K,
    data: Parameters<PluginLifecycleEvents[K]>[0],
  ): Promise<void> {
    try {
      // 1. Emit to Redis PubSub for cross-server communication
      await this.emitToPubSub(event, data)

      // 2. Emit to Plugin System for in-process handlers
      await this.emitToPlugins(roomId, event, data)
    } catch (error) {
      console.error(`[SystemEvents] Error emitting ${event} for room ${roomId}:`, error)
      // Don't throw - we want to continue even if one consumer fails
    }
  }

  /**
   * Emit event to Redis PubSub
   * Channel format: SYSTEM:{EVENT}
   */
  private async emitToPubSub<K extends keyof PluginLifecycleEvents>(
    event: K,
    data: Parameters<PluginLifecycleEvents[K]>[0],
  ): Promise<void> {
    const channel = this.getChannelName(event)
    await this.redis.pubClient.publish(channel, JSON.stringify(data))
  }

  /**
   * Emit event to Plugin System
   */
  private async emitToPlugins<K extends keyof PluginLifecycleEvents>(
    roomId: string,
    event: K,
    data: Parameters<PluginLifecycleEvents[K]>[0],
  ): Promise<void> {
    if (!this.pluginRegistry) {
      return
    }

    try {
      await this.pluginRegistry.emit(roomId, event, data)
    } catch (error) {
      console.error(`[SystemEvents] Plugin emission failed for ${event}:`, error)
    }
  }

  /**
   * Get PubSub channel name for an event
   * Format: SYSTEM:{EVENT_NAME_UPPERCASE}
   *
   * Examples:
   * - trackChanged -> SYSTEM:TRACK_CHANGED
   * - userJoined -> SYSTEM:USER_JOINED
   */
  private getChannelName(event: keyof PluginLifecycleEvents): string {
    return SystemEvents.getChannelName(event)
  }

  /**
   * Get the channel name for a given event (exposed for testing/debugging)
   */
  public static getChannelName(event: keyof PluginLifecycleEvents): string {
    // Convert camelCase to UPPER_SNAKE_CASE
    const snakeCase = String(event)
      .replace(/([A-Z])/g, "_$1")
      .toUpperCase()
    return `SYSTEM:${snakeCase}`
  }
}
