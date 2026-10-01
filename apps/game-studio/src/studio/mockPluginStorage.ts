import type { PluginStorage } from "@repo/types"
import type { PluginKvStore, StudioRoom } from "./studioRoom"

function ensureHash(store: PluginKvStore, key: string): Map<string, string> {
  let h = store.hashes.get(key)
  if (!h) {
    h = new Map()
    store.hashes.set(key, h)
  }
  return h
}

function readList(store: PluginKvStore, key: string): string[] {
  const raw = store.kv.get(key)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []
  } catch {
    return []
  }
}

/**
 * Resolves `room.ensurePluginStore(pluginName)` on each call so hydration / reset can replace
 * `room.pluginStores` without orphaning the plugin's Redis-shaped mock.
 */
export function createMockPluginStorage(
  room: StudioRoom,
  pluginName: string,
  onMutate?: () => void,
): PluginStorage & {
  cleanup(): Promise<void>
} {
  const touch = () => onMutate?.()
  const store = (): PluginKvStore => room.ensurePluginStore(pluginName)

  return {
    async get(key: string): Promise<string | null> {
      return store().kv.get(key) ?? null
    },
    async set(key: string, value: string): Promise<void> {
      store().kv.set(key, value)
      touch()
    },
    async compareAndSet(
      key: string,
      expected: string | null,
      value: string,
    ): Promise<boolean> {
      const current = store().kv.get(key) ?? null
      if (current !== expected) return false
      store().kv.set(key, value)
      touch()
      return true
    },
    async inc(): Promise<number> {
      throw new Error("MockPluginStorage.inc not implemented")
    },
    async dec(): Promise<number> {
      throw new Error("MockPluginStorage.dec not implemented")
    },
    async del(key: string): Promise<void> {
      const s = store()
      s.kv.delete(key)
      s.hashes.delete(key)
      s.zsets.delete(key)
      touch()
    },
    async exists(key: string): Promise<boolean> {
      const s = store()
      return s.kv.has(key) || s.hashes.has(key) || s.zsets.has(key)
    },
    async mget(keys: string[]): Promise<(string | null)[]> {
      const s = store()
      return keys.map((k) => s.kv.get(k) ?? null)
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
      return ensureHash(store(), key).get(field) ?? null
    },
    async hset(key: string, field: string, value: string): Promise<void> {
      ensureHash(store(), key).set(field, value)
      touch()
    },
    async hgetall(key: string): Promise<Record<string, string>> {
      const h = store().hashes.get(key)
      if (!h) return {}
      return Object.fromEntries(h)
    },
    async hsetnx(key: string, field: string, value: string): Promise<boolean> {
      const h = ensureHash(store(), key)
      if (h.has(field)) return false
      h.set(field, value)
      touch()
      return true
    },
    async getJson<T>(key: string): Promise<{ raw: string | null; value: T | null }> {
      const raw = store().kv.get(key) ?? null
      if (raw == null) return { raw: null, value: null }
      try {
        return { raw, value: JSON.parse(raw) as T }
      } catch {
        return { raw, value: null }
      }
    },
    async setJson(key: string, value: unknown): Promise<void> {
      store().kv.set(key, JSON.stringify(value))
      touch()
    },
    async updateJson<T>(key: string, fn: (prev: T | null) => T): Promise<T> {
      const raw = store().kv.get(key)
      const next = fn(raw == null ? null : (JSON.parse(raw) as T))
      store().kv.set(key, JSON.stringify(next))
      touch()
      return next
    },
    // Lists live in `kv` as JSON arrays so the persisted studio snapshot shape is unchanged.
    async lrange(key: string, start: number, stop: number): Promise<string[]> {
      const list = readList(store(), key)
      const end = stop < 0 ? list.length + stop + 1 : stop + 1
      return list.slice(start < 0 ? Math.max(0, list.length + start) : start, end)
    },
    async appendCapped(key: string, entry: unknown, max: number): Promise<void> {
      const list = [JSON.stringify(entry), ...readList(store(), key)].slice(0, max)
      store().kv.set(key, JSON.stringify(list))
      touch()
    },
    async cleanup(): Promise<void> {
      const s = store()
      s.kv.clear()
      s.hashes.clear()
      s.zsets.clear()
      touch()
    },
  }
}
