import { LruCache } from "./lruCache"

export const COVER_CACHE_TTL_MS = 10 * 60 * 1000
/** Raised from 200: playlist sleeves now occupy two size slots each. */
export const COVER_CACHE_MAX_ENTRIES = 400

type CoverEntry = { dataUri: string; fetchedAt: number }

type CoverFetch = (coverKey: string, sizePx: number) => Promise<string | undefined>

function cacheKey(coverKey: string, sizePx: number): string {
  return `${coverKey}@${sizePx}`
}

/**
 * Bounded TTL cache of cover-art data URIs, keyed by album/coverArt id + size
 * (not song id — tracks on the same record share one cover).
 */
export class CoverArtCache {
  private readonly cache: LruCache<CoverEntry>
  private readonly inflight = new Map<string, Promise<string | undefined>>()

  constructor(
    private readonly fetchBytes: CoverFetch,
    private readonly ttlMs: number = COVER_CACHE_TTL_MS,
    maxEntries: number = COVER_CACHE_MAX_ENTRIES,
  ) {
    this.cache = new LruCache(maxEntries)
  }

  invalidate(): void {
    this.cache.clear()
    this.inflight.clear()
  }

  async get(coverKey: string, sizePx: number): Promise<string | undefined> {
    const key = coverKey.trim()
    if (!key) return undefined
    const storedKey = cacheKey(key, sizePx)
    const existing = this.cache.get(storedKey)
    if (existing && Date.now() - existing.fetchedAt < this.ttlMs) {
      return existing.dataUri
    }
    const pending = this.inflight.get(storedKey)
    if (pending) return pending
    const promise = this.fetchBytes(key, sizePx)
      .then((dataUri) => {
        if (dataUri) this.cache.set(storedKey, { dataUri, fetchedAt: Date.now() })
        return dataUri
      })
      .finally(() => {
        this.inflight.delete(storedKey)
      })
    this.inflight.set(storedKey, promise)
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
