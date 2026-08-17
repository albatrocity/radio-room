import { LruCache } from "./lruCache"

export const COVER_CACHE_TTL_MS = 10 * 60 * 1000
export const COVER_CACHE_MAX_ENTRIES = 200

type CoverEntry = { dataUri: string; fetchedAt: number }

/**
 * Bounded TTL cache of cover-art data URIs, keyed by album/coverArt id
 * (not song id — tracks on the same record share one cover).
 */
export class CoverArtCache {
  private readonly cache: LruCache<CoverEntry>
  private readonly inflight = new Map<string, Promise<string | undefined>>()

  constructor(
    private readonly fetchBytes: (coverKey: string) => Promise<string | undefined>,
    private readonly ttlMs: number = COVER_CACHE_TTL_MS,
    maxEntries: number = COVER_CACHE_MAX_ENTRIES,
  ) {
    this.cache = new LruCache(maxEntries)
  }

  invalidate(): void {
    this.cache.clear()
    this.inflight.clear()
  }

  async get(coverKey: string): Promise<string | undefined> {
    const key = coverKey.trim()
    if (!key) return undefined
    const existing = this.cache.get(key)
    if (existing && Date.now() - existing.fetchedAt < this.ttlMs) {
      return existing.dataUri
    }
    const pending = this.inflight.get(key)
    if (pending) return pending
    const promise = this.fetchBytes(key)
      .then((dataUri) => {
        if (dataUri) this.cache.set(key, { dataUri, fetchedAt: Date.now() })
        return dataUri
      })
      .finally(() => {
        this.inflight.delete(key)
      })
    this.inflight.set(key, promise)
    return promise
  }
}

/** Prefer album coverArt, then album id, then song id. */
export function coverCacheKey(song: {
  coverArt?: string
  albumId?: string
  id?: string
}): string {
  return String(song.coverArt || song.albumId || song.id || "").trim()
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const cap = Math.max(1, limit)
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(cap, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!)
    }
  })
  await Promise.all(workers)
  return out
}
