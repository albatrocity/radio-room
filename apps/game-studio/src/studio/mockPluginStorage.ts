import type { PluginStorage } from "@repo/types"
import type { PluginKvStore } from "./studioRoom"

function ensureHash(store: PluginKvStore, key: string): Map<string, string> {
  let h = store.hashes.get(key)
  if (!h) {
    h = new Map()
    store.hashes.set(key, h)
  }
  return h
}

export function createMockPluginStorage(
  store: PluginKvStore,
  onMutate?: () => void,
): PluginStorage & {
  cleanup(): Promise<void>
} {
  const touch = () => onMutate?.()

  return {
    async get(key: string): Promise<string | null> {
      return store.kv.get(key) ?? null
    },
    async set(key: string, value: string): Promise<void> {
      store.kv.set(key, value)
      touch()
    },
    async inc(): Promise<number> {
      throw new Error("MockPluginStorage.inc not implemented")
    },
    async dec(): Promise<number> {
      throw new Error("MockPluginStorage.dec not implemented")
    },
    async del(key: string): Promise<void> {
      store.kv.delete(key)
      store.hashes.delete(key)
      store.zsets.delete(key)
      touch()
    },
    async exists(key: string): Promise<boolean> {
      return store.kv.has(key) || store.hashes.has(key) || store.zsets.has(key)
    },
    async mget(keys: string[]): Promise<(string | null)[]> {
      return keys.map((k) => store.kv.get(k) ?? null)
    },
    async pipeline(): Promise<Array<string | null | boolean | (string | null)[]>> {
      return []
    },
    async zadd(): Promise<void> {
      throw new Error("MockPluginStorage.zadd not implemented")
    },
    async zrem(): Promise<void> {
      throw new Error("MockPluginStorage.zrem not implemented")
    },
    async zrank(): Promise<number | null> {
      return null
    },
    async zrevrank(): Promise<number | null> {
      return null
    },
    async zrange(): Promise<string[]> {
      return []
    },
    async zrangeWithScores(): Promise<{ score: number; value: string }[]> {
      return []
    },
    async zrangebyscore(): Promise<string[]> {
      return []
    },
    async zremrangebyscore(): Promise<void> {},
    async zscore(): Promise<number | null> {
      return null
    },
    async zincrby(): Promise<number> {
      return 0
    },
    async hget(key: string, field: string): Promise<string | null> {
      return ensureHash(store, key).get(field) ?? null
    },
    async hset(key: string, field: string, value: string): Promise<void> {
      ensureHash(store, key).set(field, value)
      touch()
    },
    async hgetall(key: string): Promise<Record<string, string>> {
      const h = store.hashes.get(key)
      if (!h) return {}
      return Object.fromEntries(h)
    },
    async hsetnx(key: string, field: string, value: string): Promise<boolean> {
      const h = ensureHash(store, key)
      if (h.has(field)) return false
      h.set(field, value)
      touch()
      return true
    },
    async cleanup(): Promise<void> {
      store.kv.clear()
      store.hashes.clear()
      store.zsets.clear()
      touch()
    },
  }
}
