import type { z } from "zod"
import type { AppContext } from "./AppContext"
import type { Room } from "./Room"
import type { RoomExportData, PluginExportAugmentation, PluginMarkdownContext } from "./RoomExport"
import type { QueueItem } from "./Queue"
import type { Reaction } from "./Reaction"
import type { User } from "./User"
import type { ReactionSubject } from "./ReactionSubject"
import type { ChatMessage } from "./ChatMessage"
import type { SystemEventHandlers } from "./SystemEventTypes"
import type { PluginComponentSchema, PluginComponentState } from "./PluginComponent"

// ============================================================================
// Plugin Configuration Schema Types
// ============================================================================

/**
 * Semantic field types for UI hints.
 * These provide hints to the frontend about how to render form fields.
 */
export type PluginFieldType =
  | "boolean" // Checkbox or toggle
  | "string" // Text input
  | "number" // Number input
  | "enum" // Radio group or select
  | "emoji" // Emoji picker
  | "duration" // Duration input (stored in ms, displayed in seconds/minutes)
  | "percentage" // 0-100 with % suffix
  | "color" // Color picker
  | "url" // URL input with validation
  | "string-array" // Array of strings (e.g., list of words)

/** Condition for conditional visibility */
export interface ShowWhenCondition {
  field: string
  value: unknown
}

/**
 * Plugin UI schema element - for text blocks and sections in the form layout
 */
export interface PluginSchemaElement {
  type: "text-block" | "heading"
  /**
   * Content to display. Can be:
   * - A string with template placeholders like {{fieldName}} (simple text)
   * - A CompositeTemplate array (text mixed with components like emoji, username, etc.)
   *
   * String format supports formatters: {{fieldName:formatter}}
   * Available formatters:
   * - duration: converts milliseconds to human-readable (e.g., "60 seconds")
   * - percentage: adds % suffix
   */
  content: string | import("./PluginComponent").CompositeTemplate
  variant?: "info" | "warning" | "example"
  /**
   * Element is only shown when condition(s) are met.
   * If an array is provided, ALL conditions must be true (AND logic).
   */
  showWhen?: ShowWhenCondition | ShowWhenCondition[]
}

/**
 * Field-specific UI metadata not captured in JSON Schema
 */
export interface PluginFieldMeta {
  type: PluginFieldType
  label: string
  description?: string
  placeholder?: string
  /** For duration: display unit (default: seconds) */
  displayUnit?: "seconds" | "minutes"
  /** For duration: storage unit (default: milliseconds) */
  storageUnit?: "milliseconds" | "seconds"
  /**
   * Field is only shown when condition(s) are met.
   * If an array is provided, ALL conditions must be true (AND logic).
   */
  showWhen?: ShowWhenCondition | ShowWhenCondition[]
  /** For enum types: custom labels for each option */
  enumLabels?: Record<string, string>
}

/**
 * Plugin configuration schema definition.
 * Contains JSON Schema for validation and UI metadata for form generation.
 */
export interface PluginConfigSchema {
  /** JSON Schema generated from Zod via z.toJSONSchema() */
  jsonSchema: Record<string, unknown>
  /** UI layout - field order and text blocks */
  layout: (string | PluginSchemaElement)[]
  /** Field-specific UI hints not captured in JSON Schema */
  fieldMeta: Record<string, PluginFieldMeta>
}

/**
 * Response structure for plugin schema API endpoint
 */
export interface PluginSchemaInfo {
  name: string
  version: string
  description?: string
  defaultConfig?: Record<string, unknown>
  configSchema?: PluginConfigSchema
  componentSchema?: PluginComponentSchema
}

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
  /**
   * Execute multiple Redis commands in a pipeline for optimal performance.
   * Reduces multiple round trips to a single network call.
   *
   * @example
   * const results = await storage.pipeline([
   *   { op: 'get', key: 'config' },
   *   { op: 'get', key: 'votes:track1' },
   *   { op: 'exists', key: 'skipped:track1' }
   * ])
   */
  pipeline(
    commands: Array<
      { op: "get"; key: string } | { op: "exists"; key: string } | { op: "mget"; keys: string[] }
    >,
  ): Promise<Array<string | null | boolean | (string | null)[]>>
  /** Sorted Sets */
  zadd(key: string, score: number, value: string): Promise<void>
  zrem(key: string, value: string): Promise<void>
  zrank(key: string, value: string): Promise<number | null>
  zrevrank(key: string, value: string): Promise<number | null>
  zrange(key: string, start: number, stop: number): Promise<string[]>
  zrangeWithScores(
    key: string,
    start: number,
    stop: number,
  ): Promise<{ score: number; value: string }[]>
  zrangebyscore(key: string, min: number, max: number): Promise<string[]>
  zremrangebyscore(key: string, min: number, max: number): Promise<void>
  zscore(key: string, value: string): Promise<number | null>
  zincrby(key: string, increment: number, value: string): Promise<number>
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
  /** Look up users by their IDs (includes users who have left the room) */
  getUsersByIds(userIds: string[]): Promise<User[]>
  skipTrack(roomId: string, trackId: string): Promise<void>
  sendSystemMessage(roomId: string, message: string, meta?: ChatMessage["meta"]): Promise<void>
  getPluginConfig(roomId: string, pluginName: string): Promise<any | null>
  setPluginConfig(roomId: string, pluginName: string, config: any): Promise<void>
  /** Emit an update for a playlist track (e.g., when pluginData changes) */
  updatePlaylistTrack(roomId: string, track: QueueItem): Promise<void>
  /** Get the current queue for a room */
  getQueue(roomId: string): Promise<QueueItem[]>

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
  emit<T extends Record<string, unknown>>(eventName: string, data: T): Promise<void>

  /**
   * Queue a sound effect to be played on all clients in the room.
   *
   * Sound effects are played one at a time in order. If a sound is already
   * playing, the new sound will be added to a queue.
   *
   * @param params - Sound effect parameters
   * @param params.url - URL to the sound effect audio file
   * @param params.volume - Volume level (0.0 to 1.0, defaults to 1.0)
   *
   * @example
   * ```typescript
   * await this.context.api.queueSoundEffect({
   *   url: "https://example.com/sounds/ding.mp3",
   *   volume: 0.8,
   * })
   * ```
   */
  queueSoundEffect(params: { url: string; volume?: number }): Promise<void>
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
 * Style hints that plugins can provide to modify UI elements
 */
export interface PluginStyleHints {
  /** Styles for the track title */
  title?: React.CSSProperties
  /** Styles for subtitles or secondary text */
  subtitle?: React.CSSProperties
  /** Badge configuration */
  badge?: {
    variant?: "success" | "warning" | "error" | "info"
    label?: string
  }
}

/**
 * Plugin data returned from augmentation methods.
 * Can include style hints and any plugin-specific metadata.
 */
export interface PluginAugmentationData {
  /** Optional style modifications for UI elements */
  styles?: PluginStyleHints
  /** Any other plugin-specific data */
  [key: string]: any
}

/**
 * Base plugin interface
 */
export interface Plugin {
  name: string
  version: string
  description?: string

  /**
   * Zod schema for config validation.
   * Used to generate JSON Schema for the frontend.
   */
  configSchema?: z.ZodType<any>

  /**
   * Default configuration values.
   * Merged with stored config when getConfig() is called.
   */
  defaultConfig?: Record<string, unknown>

  /**
   * Get the UI schema for form generation.
   * Returns JSON Schema + layout + field metadata.
   */
  getConfigSchema?(): PluginConfigSchema

  /**
   * Get the merged default config (defaults + factory overrides).
   */
  getDefaultConfig?(): Record<string, unknown> | undefined

  /**
   * Get the UI component schema for this plugin.
   * Defines declarative components that the frontend can render.
   */
  getComponentSchema?(): PluginComponentSchema

  /**
   * Get the current component state for hydration.
   * Called when a user joins a room to populate component stores.
   */
  getComponentState?(): Promise<PluginComponentState>

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

  /**
   * Augment the now playing track with plugin-specific data and style hints.
   * Called when now playing data is fetched.
   *
   * @param item - The currently playing track
   * @returns Augmentation data including optional style hints
   *
   * @example
   * async augmentNowPlaying(item: QueueItem): Promise<PluginAugmentationData> {
   *   const skipData = await this.storage.get(`skipped:${item.mediaSource.trackId}`)
   *   if (skipData) {
   *     return {
   *       skipped: true,
   *       skipData: JSON.parse(skipData),
   *       styles: { title: { textDecoration: 'line-through', opacity: 0.7 } }
   *     }
   *   }
   *   return {}
   * }
   */
  augmentNowPlaying?(item: QueueItem): Promise<PluginAugmentationData>

  // ============================================================================
  // Room Export Methods
  // ============================================================================

  /**
   * Add additional data to room export.
   * Called once per export to add top-level plugin data and/or markdown sections.
   *
   * @param exportData - The complete room export data
   * @returns Object with optional data (added to pluginExports) and markdownSections
   *
   * @example
   * async augmentRoomExport(exportData: RoomExportData): Promise<PluginExportAugmentation> {
   *   const skippedCount = exportData.playlist.filter(
   *     item => item.pluginData?.['playlist-democracy']?.skipped
   *   ).length
   *   return {
   *     data: { totalSkipped: skippedCount },
   *     markdownSections: [`## Playlist Democracy\n\n${skippedCount} tracks were skipped by vote.`]
   *   }
   * }
   */
  augmentRoomExport?(exportData: RoomExportData): Promise<PluginExportAugmentation>

  /**
   * Format plugin's augmented data as markdown for individual items.
   * Called for each item that has this plugin's data in pluginData.
   *
   * @param pluginData - The plugin's data from item.pluginData[pluginName]
   * @param context - What type of item (playlist track, chat message, etc.)
   * @returns Markdown string to include, or null to skip
   *
   * @example
   * formatPluginDataMarkdown(pluginData: any, context: PluginMarkdownContext): string | null {
   *   if (context.type === 'playlist' && pluginData.skipped) {
   *     const { voteCount, requiredCount } = pluginData.skipData
   *     return `⏭️ Skipped (${voteCount}/${requiredCount} votes)`
   *   }
   *   return null
   * }
   */
  formatPluginDataMarkdown?(pluginData: unknown, context: PluginMarkdownContext): string | null
}

/**
 * Plugin factory function signature.
 * Accepts optional config overrides that are merged with defaults.
 */
export type PluginFactory<TConfig = any> = (configOverrides?: Partial<TConfig>) => Plugin
