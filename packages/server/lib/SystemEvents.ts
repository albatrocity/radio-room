import { AppContext, SystemEventPayload, SystemEventName } from "@repo/types"
import type { SystemEvents as ISystemEvents } from "@repo/types"
import { PluginRegistry } from "./plugins/PluginRegistry"
import { BroadcasterRegistry } from "./broadcasters"

/**
 * SystemEvents - Unified event emission layer
 *
 * This class provides a single point of emission for system-level domain events.
 * Events are broadcast to THREE consumers:
 * 1. Redis PubSub (for cross-server communication)
 * 2. Plugin System (for in-process plugin event handling)
 * 3. Broadcasters (for real-time frontend updates via Socket.IO)
 *
 * Benefits:
 * - Single emit() call instead of separate emissions
 * - Consistent event payloads across all consumers
 * - Extensible broadcaster pattern for different socket channels
 * - Type-safe event definitions
 * - Centralized event discovery
 *
 * @example
 * ```typescript
 * await context.systemEvents.emit(roomId, "TRACK_CHANGED", {
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
    private readonly broadcasterRegistry?: BroadcasterRegistry,
  ) {}

  /**
   * Emit a system event to all consumers
   *
   * This broadcasts the event to:
   * 1. Redis PubSub (publishes to SYSTEM:{EVENT} channel)
   * 2. Plugin System (emits to in-process plugins)
   * 3. Broadcasters (each broadcaster decides how to handle the event)
   *
   * @param roomId - Room where the event occurred
   * @param event - Event name (must match SystemEventName)
   * @param data - Event payload (must match event signature)
   */
  async emit<K extends SystemEventName>(
    roomId: string,
    event: K,
    data: SystemEventPayload<K>,
  ): Promise<void> {
    try {
      // 1. Emit to Redis PubSub for cross-server communication
      await this.emitToPubSub(event, data)

      // 2. Emit to Plugin System for in-process handlers
      await this.emitToPlugins(roomId, event, data)

      // 3. Emit to Broadcasters for socket channel delivery
      this.emitToBroadcasters(roomId, event, data)
    } catch (error) {
      console.error(`[SystemEvents] Error emitting ${event} for room ${roomId}:`, error)
      // Don't throw - we want to continue even if one consumer fails
    }
  }

  /**
   * Emit event to Redis PubSub
   * Channel format: SYSTEM:{EVENT}
   */
  private async emitToPubSub<K extends SystemEventName>(
    event: K,
    data: SystemEventPayload<K>,
  ): Promise<void> {
    const channel = this.getChannelName(event)
    await this.redis.pubClient.publish(channel, JSON.stringify(data))
  }

  /**
   * Emit event to Plugin System
   */
  private async emitToPlugins<K extends SystemEventName>(
    roomId: string,
    event: K,
    data: SystemEventPayload<K>,
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
   * Emit event to all registered Broadcasters
   * Each broadcaster decides whether and how to handle the event
   */
  private emitToBroadcasters<K extends SystemEventName>(
    roomId: string,
    event: K,
    data: SystemEventPayload<K>,
  ): void {
    if (!this.broadcasterRegistry) {
      return
    }

    try {
      this.broadcasterRegistry.broadcast(roomId, event, data)
    } catch (error) {
      console.error(`[SystemEvents] Broadcaster emission failed for ${event}:`, error)
    }
  }

  /**
   * Get PubSub channel name for an event
   * Format: SYSTEM:{EVENT_NAME}
   *
   * Examples:
   * - TRACK_CHANGED -> SYSTEM:TRACK_CHANGED
   * - USER_JOINED -> SYSTEM:USER_JOINED
   */
  private getChannelName(event: SystemEventName): string {
    return SystemEvents.getChannelName(event)
  }

  /**
   * Get the channel name for a given event (exposed for testing/debugging)
   */
  public static getChannelName(event: SystemEventName): string {
    // Events are already in SCREAMING_SNAKE_CASE, just prepend SYSTEM:
    return `SYSTEM:${event as string}`
  }
}
