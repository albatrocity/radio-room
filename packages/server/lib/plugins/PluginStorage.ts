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
   * Batch get multiple keys efficiently using Redis MGET
   */
  async mget(keys: string[]): Promise<(string | null)[]> {
    if (keys.length === 0) {
      return []
    }

    try {
      const namespacedKeys = keys.map((key) => this.makeKey(key))
      return await this.context.redis.pubClient.mGet(namespacedKeys)
    } catch (error) {
      console.error(`[PluginStorage] Error batch getting keys:`, error)
      return keys.map(() => null)
    }
  }

  async zadd(key: string, score: number, value: string): Promise<void> {
    try {
      await this.context.redis.pubClient.zAdd(this.makeKey(key), [{ score, value }])
    } catch (error) {
      console.error(`[PluginStorage] Error adding to zset ${key}:`, error)
    }
  }

  async zrem(key: string, value: string): Promise<void> {
    try {
      await this.context.redis.pubClient.zRem(this.makeKey(key), value)
    } catch (error) {
      console.error(`[PluginStorage] Error removing from zset ${key}:`, error)
    }
  }

  async zrank(key: string, value: string): Promise<number | null> {
    try {
      return await this.context.redis.pubClient.zRank(this.makeKey(key), value)
    } catch (error) {
      console.error(`[PluginStorage] Error getting zrank ${key}:`, error)
      return null
    }
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    try {
      return await this.context.redis.pubClient.zRange(this.makeKey(key), start, stop)
    } catch (error) {
      console.error(`[PluginStorage] Error getting zrange ${key}:`, error)
      return []
    }
  }

  async zrangeWithScores(
    key: string,
    start: number,
    stop: number,
  ): Promise<{ score: number; value: string }[]> {
    try {
      return await this.context.redis.pubClient.zRangeWithScores(this.makeKey(key), start, stop)
    } catch (error) {
      console.error(`[PluginStorage] Error getting zrangeWithScores ${key}:`, error)
      return []
    }
  }

  async zrevrank(key: string, value: string): Promise<number | null> {
    try {
      return await this.context.redis.pubClient.zRevRank(this.makeKey(key), value)
    } catch (error) {
      console.error(`[PluginStorage] Error getting zrevrank ${key}:`, error)
      return null
    }
  }

  async zincrby(key: string, increment: number, value: string): Promise<number> {
    try {
      return await this.context.redis.pubClient.zIncrBy(this.makeKey(key), increment, value)
    } catch (error) {
      console.error(`[PluginStorage] Error incrementing zset ${key}:`, error)
      return 0
    }
  }

  async zscore(key: string, value: string): Promise<number | null> {
    try {
      return await this.context.redis.pubClient.zScore(this.makeKey(key), value)
    } catch (error) {
      console.error(`[PluginStorage] Error getting zscore ${key}:`, error)
      return null
    }
  }
  async zrangebyscore(key: string, min: number, max: number): Promise<string[]> {
    try {
      return await this.context.redis.pubClient.zRangeByScore(this.makeKey(key), min, max)
    } catch (error) {
      console.error(`[PluginStorage] Error getting zrangebyscore ${key}:`, error)
      return []
    }
  }

  async zremrangebyscore(key: string, min: number, max: number): Promise<void> {
    try {
      await this.context.redis.pubClient.zRemRangeByScore(this.makeKey(key), min, max)
    } catch (error) {
      console.error(`[PluginStorage] Error removing from zset ${key}:`, error)
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
