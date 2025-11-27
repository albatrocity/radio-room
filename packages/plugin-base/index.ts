import { Plugin, PluginContext, PluginAugmentationData, QueueItem } from "@repo/types"

/**
 * Base class for plugins that provides automatic storage cleanup,
 * typed config access, and a hook for custom cleanup logic.
 *
 * ARCHITECTURE: Each plugin instance handles exactly ONE room.
 * The PluginRegistry creates a new instance from the factory for each room.
 * This means you can safely use `this.context` in all handlers.
 *
 * Plugins can extend this class to get:
 * - Protected `context` property (set automatically by register())
 * - Typed `getConfig()` helper method
 * - Automatic storage cleanup when cleanup() is called
 * - Optional `onCleanup()` hook for custom cleanup
 *
 * @example
 * ```typescript
 * interface MyPluginConfig {
 *   enabled: boolean
 *   setting: string
 * }
 *
 * class MyPlugin extends BasePlugin<MyPluginConfig> {
 *   name = "my-plugin"
 *   version = "1.0.0"
 *
 *   async register(context: PluginContext) {
 *     await super.register(context)
 *
 *     // Register event handlers - they can use this.context directly
 *     context.lifecycle.on("TRACK_CHANGED", this.onTrackChanged.bind(this))
 *   }
 *
 *   private async onTrackChanged(data: { roomId: string; track: QueueItem }) {
 *     // No need to look up context by roomId - this instance is for ONE room
 *     const config = await this.getConfig()
 *     if (!config?.enabled) return
 *
 *     // Use this.context.api, this.context.storage, etc.
 *     await this.context!.api.sendSystemMessage(this.context!.roomId, "Track changed!")
 *   }
 * }
 *
 * // Export a factory function (not an instance)
 * export function createMyPlugin(): Plugin {
 *   return new MyPlugin()
 * }
 * ```
 */
export abstract class BasePlugin<TConfig = any> implements Plugin {
  abstract name: string
  abstract version: string

  /**
   * The plugin context for this room.
   * Set automatically when register() is called.
   */
  protected context: PluginContext | null = null

  /**
   * Register the plugin for a room.
   * Call super.register(context) first to set up the context.
   */
  async register(context: PluginContext): Promise<void> {
    this.context = context
    console.log(`[${this.name}] Registered for room ${context.roomId}`)
  }

  /**
   * Get the plugin's configuration for the current room.
   * Returns null if no context or no config found.
   */
  protected async getConfig(): Promise<TConfig | null> {
    if (!this.context) return null
    return await this.context.api.getPluginConfig(this.context.roomId, this.name)
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
