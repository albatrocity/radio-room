import type { AppContext } from "./AppContext"
import type { Room } from "./Room"
import type { QueueItem } from "./Queue"
import type { Reaction } from "./Reaction"
import type { User } from "./User"
import type { ReactionSubject } from "./ReactionSubject"
import type { ChatMessage } from "./ChatMessage"
import type { SystemEventHandlers } from "./SystemEventTypes"

/**
 * Plugin storage API - provides sandboxed Redis access
 * All keys are automatically namespaced to prevent conflicts
 */
export interface PluginStorage {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttl?: number): Promise<void>
  inc(key: string, by?: number): Promise<number>
  dec(key: string, by?: number): Promise<number>
  del(key: string): Promise<void>
  exists(key: string): Promise<boolean>
  /** Batch get multiple keys efficiently */
  mget(keys: string[]): Promise<(string | null)[]>
}

/**
 * Base payload for all plugin events.
 * All plugin events automatically include roomId.
 */
export interface PluginEventPayload {
  roomId: string
  [key: string]: unknown
}

/**
 * Plugin API - provides safe methods for plugins to interact with the system
 */
export interface PluginAPI {
  getNowPlaying(roomId: string): Promise<QueueItem | null>
  getReactions(params: {
    roomId: string
    reactTo: ReactionSubject
    filterEmoji?: string
  }): Promise<Reaction[]>
  getUsers(roomId: string, params?: { status?: "listening" | "participating" }): Promise<User[]>
  skipTrack(roomId: string, trackId: string): Promise<void>
  sendSystemMessage(roomId: string, message: string, meta?: ChatMessage["meta"]): Promise<void>
  getPluginConfig(roomId: string, pluginName: string): Promise<any | null>
  setPluginConfig(roomId: string, pluginName: string, config: any): Promise<void>
  /** Emit an update for a playlist track (e.g., when pluginData changes) */
  updatePlaylistTrack(roomId: string, track: QueueItem): Promise<void>

  /**
   * Emit a custom plugin event.
   *
   * Events are automatically namespaced as `PLUGIN:{pluginName}:{eventName}`
   * and broadcast to all clients in the room via Socket.IO.
   *
   * @param eventName - The event name (will be namespaced with plugin name)
   * @param data - Event payload (roomId is added automatically)
   *
   * @example
   * ```typescript
   * // In your plugin:
   * await this.context.api.emit("SPECIAL_WORD_DETECTED", {
   *   word: "hello",
   *   userId: message.user.userId,
   * })
   *
   * // Frontend receives: PLUGIN:my-plugin:SPECIAL_WORD_DETECTED
   * // with data: { roomId, word, userId }
   * ```
   */
  emit<T extends Record<string, unknown>>(
    eventName: string,
    data: T,
  ): Promise<void>
}

/**
 * Lifecycle events that plugins can listen to
 *
 * This is an alias for SystemEventHandlers - plugins use the same event
 * definitions as the rest of the system.
 */
export type PluginLifecycleEvents = SystemEventHandlers

/**
 * Lifecycle event registration interface
 */
export interface PluginLifecycle {
  on<K extends keyof PluginLifecycleEvents>(event: K, handler: PluginLifecycleEvents[K]): void
  off<K extends keyof PluginLifecycleEvents>(event: K, handler: PluginLifecycleEvents[K]): void
}

/**
 * Context provided to each plugin instance
 */
export interface PluginContext {
  roomId: string
  api: PluginAPI
  storage: PluginStorage
  lifecycle: PluginLifecycle
  getRoom: () => Promise<Room | null>
  appContext: AppContext
}

/**
 * Plugin data returned from augmentPlaylistBatch
 * Maps trackId to plugin-specific metadata
 */
export type PluginAugmentationData = Record<string, any>

/**
 * Base plugin interface
 */
export interface Plugin {
  name: string
  version: string
  register(context: PluginContext): Promise<void>
  cleanup(): Promise<void>

  /**
   * Optional method to augment playlist items with plugin-specific metadata.
   * Called at read-time when fetching playlists.
   *
   * @param items - Array of playlist items to augment
   * @returns Array of augmentation data objects, one per item (in same order)
   *
   * @example
   * // Returns [{ skipped: true }, {}, { skipped: true }] for items where 1st and 3rd were skipped
   * async augmentPlaylistBatch(items: QueueItem[]): Promise<PluginAugmentationData[]> {
   *   const trackIds = items.map(item => item.mediaSource.trackId)
   *   const skipData = await this.storage.mget(trackIds.map(id => `skipped:${id}`))
   *   return skipData.map(data => data ? { skipped: true } : {})
   * }
   */
  augmentPlaylistBatch?(items: QueueItem[]): Promise<PluginAugmentationData[]>
}

/**
 * Plugin factory function signature
 */
export type PluginFactory = (appContext: AppContext) => Plugin
