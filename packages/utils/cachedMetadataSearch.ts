import type { MetadataSourceTrack, SimpleCache } from "@repo/types"
import { clearCachedJsonInflight, withCachedJson } from "./cachedJson"

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

  return withCachedJson({
    cache,
    key: metadataSearchCacheKey(sourceId, normalized),
    ttlSeconds,
    fetch,
  })
}

/** Test helper: clear in-flight coalescing map (shared with {@link withCachedJson}). */
export function clearCachedMetadataSearchInflight(): void {
  clearCachedJsonInflight()
}
