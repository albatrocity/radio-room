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
    async deleteByPrefix(prefix: string) {
      const match = `${prefix}*`
      let cursor = 0
      do {
        const result = await pubClient.scan(cursor, { MATCH: match, COUNT: 100 })
        cursor = typeof result.cursor === "number" ? result.cursor : Number(result.cursor)
        const keys = result.keys ?? []
        if (keys.length > 0) {
          await pubClient.del(keys)
        }
      } while (cursor !== 0)
    },
  }
}
