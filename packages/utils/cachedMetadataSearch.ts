import type { MetadataSourceTrack, SimpleCache } from "@repo/types"

const inflightSearches = new Map<string, Promise<MetadataSourceTrack[]>>()

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ")
}

export function metadataSearchCacheKey(sourceId: string, normalizedQuery: string): string {
  // Encode the normalized query (DJ queries are short) — collision-free, no node:crypto
  return `metadata:search:v1:${sourceId}:${encodeURIComponent(normalizedQuery)}`
}

export async function withCachedMetadataSearch(params: {
  cache?: SimpleCache
  sourceId: string
  query: string
  ttlSeconds: number
  fetch: () => Promise<MetadataSourceTrack[]>
}): Promise<MetadataSourceTrack[]> {
  const { cache, sourceId, query, ttlSeconds, fetch } = params
  const normalized = normalizeSearchQuery(query)
  if (!normalized) return []

  if (!cache) {
    return fetch()
  }

  const key = metadataSearchCacheKey(sourceId, normalized)

  try {
    const cached = await cache.get(key)
    if (cached != null) {
      return JSON.parse(cached) as MetadataSourceTrack[]
    }
  } catch (e) {
    console.warn(`[metadata-search-cache] get failed for ${sourceId}:`, e)
  }

  const existing = inflightSearches.get(key)
  if (existing) {
    return existing
  }

  const promise = (async () => {
    const tracks = await fetch()
    try {
      await cache.set(key, JSON.stringify(tracks), ttlSeconds)
    } catch (e) {
      console.warn(`[metadata-search-cache] set failed for ${sourceId}:`, e)
    }
    return tracks
  })().finally(() => {
    inflightSearches.delete(key)
  })

  inflightSearches.set(key, promise)
  return promise
}

/** Test helper: clear in-flight coalescing map. */
export function clearCachedMetadataSearchInflight(): void {
  inflightSearches.clear()
}
