import type { z } from "zod"
import {
  Plugin,
  PluginContext,
  PluginAugmentationData,
  PluginLifecycleEvents,
  PluginConfigSchema,
  PluginComponentSchema,
  PluginComponentState,
  QueueItem,
  SystemEventPayload,
} from "@repo/types"

/**
 * Base class for plugins that provides automatic storage cleanup,
 * typed config access, schema support, and a hook for custom cleanup logic.
 *
 * ARCHITECTURE: Each plugin instance handles exactly ONE room.
 * The PluginRegistry creates a new instance from the factory for each room.
 * This means you can safely use `this.context` in all handlers.
 *
 * Plugins can extend this class to get:
 * - Protected `context` property (set automatically by register())
 * - Typed `getConfig()` helper method with default config merging
 * - Automatic storage cleanup when cleanup() is called
 * - Optional `onCleanup()` hook for custom cleanup
 * - Schema support for dynamic form generation
 *
 * @example
 * ```typescript
 * import { z } from "zod"
 *
 * const myConfigSchema = z.object({
 *   enabled: z.boolean(),
 *   setting: z.string(),
 * })
 *
 * type MyPluginConfig = z.infer<typeof myConfigSchema>
 *
 * class MyPlugin extends BasePlugin<MyPluginConfig> {
 *   name = "my-plugin"
 *   version = "1.0.0"
 *   description = "A sample plugin"
 *
 *   // Define the Zod schema for validation
 *   static configSchema = myConfigSchema
 *
 *   // Define default configuration values
 *   static defaultConfig: MyPluginConfig = {
 *     enabled: false,
 *     setting: "default",
 *   }
 *
 *   // Optional: Define UI schema for form generation
 *   getConfigSchema(): PluginConfigSchema {
 *     return {
 *       jsonSchema: z.toJSONSchema(myConfigSchema),
 *       layout: ["enabled", "setting"],
 *       fieldMeta: {
 *         enabled: { type: "boolean", label: "Enable Plugin" },
 *         setting: { type: "string", label: "Setting Value" },
 *       },
 *     }
 *   }
 *
 *   async register(context: PluginContext) {
 *     await super.register(context)
 *
 *     this.on("TRACK_CHANGED", async (data) => {
 *       const config = await this.getConfig()
 *       if (!config?.enabled) return
 *       console.log(`Track changed to: ${data.track.title}`)
 *     })
 *   }
 * }
 *
 * // Export a factory function that accepts optional config overrides
 * export function createMyPlugin(configOverrides?: Partial<MyPluginConfig>): Plugin {
 *   return new MyPlugin(configOverrides)
 * }
 * ```
 */
export abstract class BasePlugin<TConfig = any> implements Plugin {
  abstract name: string
  abstract version: string
  description?: string

  /**
   * Zod schema for config validation.
   * Override in subclass as a static property.
   */
  static readonly configSchema?: z.ZodType<any>

  /**
   * Default configuration values.
   * Override in subclass as a static property.
   */
  static readonly defaultConfig?: Record<string, unknown>

  /**
   * Config overrides passed to the factory function.
   * These are merged with defaults when getDefaultConfig() is called.
   */
  protected configOverrides?: Partial<TConfig>

  /**
   * The plugin context for this room.
   * Set automatically when register() is called.
   */
  protected context: PluginContext | null = null

  /**
   * Create a new plugin instance with optional config overrides.
   * @param configOverrides - Partial config to merge with defaults
   */
  constructor(configOverrides?: Partial<TConfig>) {
    this.configOverrides = configOverrides
  }

  /**
   * Register the plugin for a room.
   * Call super.register(context) first to set up the context.
   */
  async register(context: PluginContext): Promise<void> {
    this.context = context
    console.log(`[${this.name}] Registered for room ${context.roomId}`)
  }

  /**
   * Register an event handler with automatic type inference.
   *
   * This is a convenience method that provides full type safety for event payloads.
   * The handler is automatically bound to `this`.
   *
   * @example
   * ```typescript
   * async register(context: PluginContext) {
   *   await super.register(context)
   *
   *   // Type of 'data' is automatically inferred!
   *   this.on("TRACK_CHANGED", async (data) => {
   *     console.log(data.track.title) // ✓ typed correctly
   *   })
   *
   *   this.on("MESSAGE_RECEIVED", async (data) => {
   *     console.log(data.message.content) // ✓ typed correctly
   *   })
   * }
   * ```
   */
  protected on<K extends keyof PluginLifecycleEvents>(
    event: K,
    handler: (data: SystemEventPayload<K>) => Promise<void> | void,
  ): void {
    if (!this.context) {
      console.warn(`[${this.name}] Cannot register handler for ${event}: context not initialized`)
      return
    }
    // Cast is needed because the handler signature doesn't include `this` binding
    this.context.lifecycle.on(event, handler.bind(this) as PluginLifecycleEvents[K])
  }

  /**
   * Unregister an event handler.
   */
  protected off<K extends keyof PluginLifecycleEvents>(
    event: K,
    handler: (data: SystemEventPayload<K>) => Promise<void> | void,
  ): void {
    if (!this.context) return
    this.context.lifecycle.off(event, handler.bind(this) as PluginLifecycleEvents[K])
  }

  /**
   * Register a handler for when THIS plugin's config changes.
   * Automatically filters CONFIG_CHANGED events to only this plugin's changes.
   *
   * @example
   * ```typescript
   * this.onConfigChange(async (data) => {
   *   const wasEnabled = data.previousConfig?.enabled === true
   *   const isEnabled = data.config?.enabled === true
   *   if (!wasEnabled && isEnabled) {
   *     console.log("Plugin was just enabled!")
   *   }
   * })
   * ```
   */
  protected onConfigChange(
    handler: (data: {
      roomId: string
      pluginName: string
      config: Record<string, unknown>
      previousConfig: Record<string, unknown>
    }) => Promise<void> | void,
  ): void {
    this.on("CONFIG_CHANGED", async (data) => {
      // Only handle config changes for this plugin
      if (data.pluginName === this.name) {
        await handler(data)
      }
    })
  }

  /**
   * Emit a custom plugin event to the frontend.
   *
   * Events are automatically namespaced as `PLUGIN:{pluginName}:{eventName}`
   * and broadcast to all clients in the room via Socket.IO.
   *
   * @example
   * ```typescript
   * // Define your event types for type safety
   * interface MyPluginEvents {
   *   WORD_DETECTED: { word: string; userId: string }
   * }
   *
   * // Emit with full type safety
   * await this.emit<MyPluginEvents["WORD_DETECTED"]>("WORD_DETECTED", {
   *   word: "hello",
   *   userId: "user123",
   * })
   *
   * // Frontend receives: PLUGIN:my-plugin:WORD_DETECTED
   * ```
   */
  protected async emit<T extends Record<string, unknown>>(
    eventName: string,
    data: T,
  ): Promise<void> {
    if (!this.context) {
      console.warn(`[${this.name}] Cannot emit event: context not initialized`)
      return
    }
    await this.context.api.emit(eventName, data)
  }

  /**
   * Get the merged default config (static defaults + factory overrides).
   * Override this if you need custom default config logic.
   */
  getDefaultConfig(): Record<string, unknown> | undefined {
    const ctor = this.constructor as typeof BasePlugin
    if (!ctor.defaultConfig) return undefined
    return { ...ctor.defaultConfig, ...this.configOverrides } as Record<string, unknown>
  }

  /**
   * Get the UI schema for form generation.
   * Override in subclass to enable dynamic form rendering.
   * Returns undefined by default (no dynamic form).
   */
  getConfigSchema?(): PluginConfigSchema

  /**
   * Get the component schema for UI rendering.
   * Override in subclass to define declarative UI components.
   * Returns undefined by default (no components).
   *
   * @example
   * ```typescript
   * getComponentSchema(): PluginComponentSchema {
   *   return {
   *     components: [
   *       {
   *         id: "leaderboard-button",
   *         type: "button",
   *         area: "userList",
   *         label: "Leaderboard",
   *         opensModal: "leaderboard-modal"
   *       },
   *       {
   *         id: "leaderboard-modal",
   *         type: "modal",
   *         area: "userList",
   *         title: "Word Leaderboard",
   *         children: [...]
   *       }
   *     ],
   *     storeKeys: ["usersLeaderboard"]
   *   }
   * }
   * ```
   */
  getComponentSchema?(): PluginComponentSchema

  /**
   * Get the current component state for hydration.
   * Called when a user joins a room to populate component stores.
   * Override in subclass if your plugin has UI components.
   *
   * @example
   * ```typescript
   * async getComponentState(): Promise<PluginComponentState> {
   *   if (!this.context) return {}
   *   return {
   *     usersLeaderboard: await this.context.storage.zrangeWithScores("leaderboard", 0, -1),
   *     totalCount: await this.context.storage.get("total-count")
   *   }
   * }
   * ```
   */
  async getComponentState(): Promise<PluginComponentState> {
    return {}
  }

  /**
   * Get the plugin's configuration for the current room.
   * Merges stored config with defaults: stored values take precedence.
   * Returns null if no context, or defaults if no stored config.
   */
  protected async getConfig(): Promise<TConfig | null> {
    if (!this.context) return null

    const stored = await this.context.api.getPluginConfig(this.context.roomId, this.name)
    const defaults = this.getDefaultConfig() as TConfig | undefined

    // If no stored config and no defaults, return null
    if (!stored && !defaults) return null

    // If no stored config, return defaults
    if (!stored) return defaults ?? null

    // If no defaults, return stored
    if (!defaults) return stored as TConfig

    // Merge: stored config takes precedence over defaults
    return { ...defaults, ...stored } as TConfig
  }

  /**
   * Cleanup plugin resources and storage.
   * Automatically cleans up plugin storage and calls onCleanup() if defined.
   */
  async cleanup(): Promise<void> {
    if (!this.context) {
      return
    }

    console.log(`[${this.name}] Running cleanup for room ${this.context.roomId}`)

    // Cleanup storage (removes all keys for this plugin in this room)
    if (this.context.storage) {
      await (this.context.storage as any).cleanup?.()
    }

    // Call custom cleanup hook if defined
    await this.onCleanup?.()

    this.context = null
  }

  /**
   * Optional hook for plugins to implement custom cleanup logic.
   * Called automatically by cleanup().
   */
  protected async onCleanup?(): Promise<void>

  /**
   * Optional method to augment playlist items with plugin-specific metadata.
   * Override this method to add custom data to playlist items at read-time.
   *
   * @param items - Array of playlist items to augment
   * @returns Array of augmentation data objects, one per item (in same order)
   *
   * @example
   * ```typescript
   * async augmentPlaylistBatch(items: QueueItem[]): Promise<PluginAugmentationData[]> {
   *   const trackIds = items.map(item => item.mediaSource.trackId)
   *   const skipData = await this.context?.storage.mget(trackIds.map(id => `skipped:${id}`))
   *   return (skipData || []).map(data => data ? { skipped: true } : {})
   * }
   * ```
   */
  async augmentPlaylistBatch?(items: QueueItem[]): Promise<PluginAugmentationData[]>
}
