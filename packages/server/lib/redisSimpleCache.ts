import type { RedisClientType, SimpleCache } from "@repo/types"

export function createRedisSimpleCache(
  pubClient: RedisClientType<any, any, any>,
): SimpleCache {
  return {
    async get(key: string) {
      return pubClient.get(key)
    },
    async set(key: string, value: string, ttlSeconds: number) {
      await pubClient.set(key, value, { EX: ttlSeconds })
    },
    async delete(key: string) {
      await pubClient.del(key)
    },
  }
}
