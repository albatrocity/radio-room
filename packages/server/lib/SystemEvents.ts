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
   * Converts event name to Socket.IO format and broadcasts to room
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
      const socketEvent = this.getSocketIOEventName(event)
      const socketData = this.transformDataForSocketIO(event, data)

      this.io.to(getRoomPath(roomId)).emit("event", {
        type: socketEvent,
        data: socketData,
      })
    } catch (error) {
      console.error(`[SystemEvents] Socket.IO emission failed for ${event}:`, error)
    }
  }

  /**
   * Transform event data for Socket.IO format
   * Some events need special handling to match expected frontend format
   */
  private transformDataForSocketIO<K extends keyof PluginLifecycleEvents>(
    event: K,
    data: Parameters<PluginLifecycleEvents[K]>[0],
  ): any {
    // Handle special cases where Socket.IO expects different format
    switch (event) {
      case "trackChanged":
        // Frontend expects { track, meta } for NOW_PLAYING
        return {
          track: (data as any).track,
          meta: (data as any).roomMeta,
        }

      case "reactionAdded":
      case "reactionRemoved":
        // Frontend expects { reactions: ReactionStore } for REACTIONS
        // ReactionStore format: { message: {...}, track: {...} }
        return {
          reactions: (data as any).reactions || { message: {}, track: {} },
        }

      case "messageReceived":
        // Frontend expects just the message object for NEW_MESSAGE
        return (data as any).message

      case "userJoined":
        // Frontend expects { user, users } for USER_JOINED
        return {
          user: (data as any).user,
          users: (data as any).users,
        }

      case "messagesCleared":
        // Frontend expects { messages: [] } for SET_MESSAGES
        return { messages: [] }

      case "typingChanged":
        // Frontend expects { typing: [...] } for TYPING
        return { typing: (data as any).typing }

      case "roomSettingsUpdated":
        // Frontend expects { room } for ROOM_SETTINGS
        return { room: (data as any).room }

      case "playlistTrackAdded":
        // Frontend expects { track } for PLAYLIST_TRACK_ADDED
        return { track: (data as any).track }

      case "userKicked":
        // Frontend expects message and user info for KICKED
        return {
          userId: (data as any).userId,
          message: (data as any).message,
        }

      case "errorOccurred":
        // Frontend expects { status, message, error } for ERROR
        return {
          status: (data as any).status || 500,
          message: (data as any).message,
          error: (data as any).error,
        }

      default:
        // For most events, pass data as-is
        return data
    }
  }

  /**
   * Get Socket.IO event name from PluginLifecycleEvent name
   * Converts camelCase to SCREAMING_SNAKE_CASE
   */
  private getSocketIOEventName(event: keyof PluginLifecycleEvents): string {
    return SystemEvents.getSocketIOEventName(event)
  }

  /**
   * Get the Socket.IO event name for a given lifecycle event (exposed for testing/debugging)
   */
  public static getSocketIOEventName(event: keyof PluginLifecycleEvents): string {
    // Special mappings for events with custom names
    const specialMappings: Partial<Record<keyof PluginLifecycleEvents, string>> = {
      trackChanged: "NOW_PLAYING",
      reactionAdded: "REACTIONS",
      reactionRemoved: "REACTIONS",
      messageReceived: "NEW_MESSAGE",
      messagesCleared: "SET_MESSAGES",
      typingChanged: "TYPING",
      playlistTrackAdded: "PLAYLIST_TRACK_ADDED",
      userKicked: "KICKED",
      errorOccurred: "ERROR",
    }

    if (event in specialMappings) {
      return specialMappings[event as keyof typeof specialMappings]!
    }

    // Default: convert camelCase to SCREAMING_SNAKE_CASE
    const snakeCase = String(event)
      .replace(/([A-Z])/g, "_$1")
      .toUpperCase()
    return snakeCase.startsWith("_") ? snakeCase.substring(1) : snakeCase
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
