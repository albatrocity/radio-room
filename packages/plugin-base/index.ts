import { Plugin, PluginContext } from "@repo/types"

/**
 * Base class for plugins that provides automatic storage cleanup,
 * typed config access, and a hook for custom cleanup logic.
 *
 * Plugins can extend this class to get:
 * - Automatic storage cleanup when cleanup() is called
 * - Protected context property
 * - Typed getConfig() helper method
 * - Optional onCleanup() hook for custom cleanup
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
 *     this.context = context
 *     const config = await this.getConfig()
 *     // config is typed as MyPluginConfig | null
 *   }
 * }
 * ```
 */
export abstract class BasePlugin<TConfig = any> implements Plugin {
  abstract name: string
  abstract version: string

  protected context: PluginContext | null = null

  abstract register(context: PluginContext): Promise<void>

  /**
   * Get the plugin's configuration for the current room
   * Returns null if no context or no config found
   */
  protected async getConfig(): Promise<TConfig | null> {
    if (!this.context) return null
    return await this.context.api.getPluginConfig(this.context.roomId, this.name)
  }

  /**
   * Cleanup plugin resources and storage
   * Automatically cleans up plugin storage and calls onCleanup() if defined
   */
  async cleanup(): Promise<void> {
    if (!this.context) {
      return
    }
    
    console.log(`[${this.name}] Running cleanup`)
    
    // Cleanup storage (removes all keys for this plugin in this room)
    if (this.context.storage) {
      await (this.context.storage as any).cleanup?.()
    }
    
    // Call custom cleanup hook if defined
    await this.onCleanup?.()
    
    this.context = null
  }

  /**
   * Optional hook for plugins to implement custom cleanup logic
   * Called automatically by cleanup()
   */
  protected async onCleanup?(): Promise<void>
}

