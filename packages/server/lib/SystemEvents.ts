import { AppContext, PluginLifecycleEvents } from "@repo/types"
import type { SystemEvents as ISystemEvents } from "@repo/types"
import type { Server } from "socket.io"
import { PluginRegistry } from "./plugins/PluginRegistry"
import { getRoomPath } from "./getRoomPath"

/**
 * SystemEvents - Unified event emission layer
 *
 * This class provides a single point of emission for system-level domain events.
 * Events are broadcast to THREE consumers:
 * 1. Redis PubSub (for cross-server communication)
 * 2. Plugin System (for in-process plugin event handling)
 * 3. Socket.IO (for real-time frontend updates)
 *
 * Benefits:
 * - Single emit() call instead of separate PubSub + Plugin + Socket.IO emissions
 * - Consistent event payloads across all consumers
 * - Easy to add new consumers (webhooks, analytics, audit logs)
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
    private readonly io?: Server,
    private readonly pluginRegistry?: PluginRegistry,
  ) {}

  /**
   * Emit a system event to all consumers
   *
   * This broadcasts the event to:
   * 1. Redis PubSub (publishes to SYSTEM:{EVENT} channel)
   * 2. Plugin System (emits to in-process plugins)
   * 3. Socket.IO (broadcasts to frontend clients in the room)
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

      // 3. Emit to Socket.IO for real-time frontend updates
      this.emitToSocketIO(roomId, event, data)
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
   * Emit event to Socket.IO
   * Broadcasts standardized event to frontend clients in the room
   */
  private emitToSocketIO<K extends keyof PluginLifecycleEvents>(
    roomId: string,
    event: K,
    data: Parameters<PluginLifecycleEvents[K]>[0],
  ): void {
    if (!this.io) {
      return
    }

    try {
      this.io.to(getRoomPath(roomId)).emit("event", {
        type: event as string,
        data,
      })
    } catch (error) {
      console.error(`[SystemEvents] Socket.IO emission failed for ${event}:`, error)
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
  private getChannelName(event: keyof PluginLifecycleEvents): string {
    return SystemEvents.getChannelName(event)
  }

  /**
   * Get the channel name for a given event (exposed for testing/debugging)
   */
  public static getChannelName(event: keyof PluginLifecycleEvents): string {
    // Events are already in SCREAMING_SNAKE_CASE, just prepend SYSTEM:
    return `SYSTEM:${event as string}`
  }
}
