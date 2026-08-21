import type { SimpleCache } from "@repo/types"

const inflight = new Map<string, Promise<unknown>>()

export async function withCachedJson<T>(params: {
  cache?: SimpleCache
  key: string
  ttlSeconds: number
  fetch: () => Promise<T>
  /** When true, the value is returned but not stored (failures / null). */
  skipCache?: (value: T) => boolean
}): Promise<T> {
  const { cache, key, ttlSeconds, fetch, skipCache } = params

  if (!cache) {
    return fetch()
  }

  try {
    const cached = await cache.get(key)
    if (cached != null) {
      return JSON.parse(cached) as T
    }
  } catch (e) {
    console.warn(`[cached-json] get failed for ${key}:`, e)
  }

  const existing = inflight.get(key)
  if (existing) {
    return existing as Promise<T>
  }

  const promise = (async () => {
    const value = await fetch()
    if (!skipCache?.(value)) {
      try {
        await cache.set(key, JSON.stringify(value), ttlSeconds)
      } catch (e) {
        console.warn(`[cached-json] set failed for ${key}:`, e)
      }
    }
    return value
  })()

  // `.finally()` re-rejects if `promise` rejects. Swallow that so Node's
  // unhandledRejection cannot take down the process when fetch throws.
  void promise
    .finally(() => {
      if (inflight.get(key) === promise) {
        inflight.delete(key)
      }
    })
    .catch(() => {})

  inflight.set(key, promise)
  return promise
}

/** Test helper: clear in-flight coalescing map. */
export function clearCachedJsonInflight(): void {
  inflight.clear()
}
