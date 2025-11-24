import { AppContext, PluginStorage } from "@repo/types"

/**
 * Implementation of plugin storage
 * Automatically namespaces keys to prevent conflicts between plugins
 */
export class PluginStorageImpl implements PluginStorage {
  constructor(
    private context: AppContext,
    private pluginName: string,
    private roomId: string,
  ) {}

  /**
   * Generate a namespaced key for this plugin
   */
  private makeKey(key: string): string {
    return `plugin:${this.pluginName}:room:${this.roomId}:${key}`
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.context.redis.pubClient.get(this.makeKey(key))
    } catch (error) {
      console.error(`[PluginStorage] Error getting key ${key}:`, error)
      return null
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      const namespacedKey = this.makeKey(key)
      await this.context.redis.pubClient.set(namespacedKey, value)
      
      if (ttl) {
        await this.context.redis.pubClient.expire(namespacedKey, ttl)
      }
    } catch (error) {
      console.error(`[PluginStorage] Error setting key ${key}:`, error)
    }
  }

  async inc(key: string, by: number = 1): Promise<number> {
    try {
      return await this.context.redis.pubClient.incrBy(this.makeKey(key), by)
    } catch (error) {
      console.error(`[PluginStorage] Error incrementing key ${key}:`, error)
      return 0
    }
  }

  async dec(key: string, by: number = 1): Promise<number> {
    try {
      return await this.context.redis.pubClient.decrBy(this.makeKey(key), by)
    } catch (error) {
      console.error(`[PluginStorage] Error decrementing key ${key}:`, error)
      return 0
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.context.redis.pubClient.del(this.makeKey(key))
    } catch (error) {
      console.error(`[PluginStorage] Error deleting key ${key}:`, error)
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.context.redis.pubClient.exists(this.makeKey(key))
      return result > 0
    } catch (error) {
      console.error(`[PluginStorage] Error checking existence of key ${key}:`, error)
      return false
    }
  }

  /**
   * Cleanup all keys for this plugin in this room
   */
  async cleanup(): Promise<void> {
    try {
      const pattern = this.makeKey("*")
      const keys = await this.context.redis.pubClient.keys(pattern)
      
      if (keys.length > 0) {
        await this.context.redis.pubClient.del(keys)
        console.log(`[PluginStorage] Cleaned up ${keys.length} keys for plugin ${this.pluginName}`)
      }
    } catch (error) {
      console.error(`[PluginStorage] Error during cleanup:`, error)
    }
  }
}

