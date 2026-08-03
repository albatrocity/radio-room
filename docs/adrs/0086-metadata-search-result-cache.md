# 0086. Metadata search result cache

**Date:** 2026-07-31
**Status:** Accepted

## Context

DJ track search fans out across metadata sources. YouTube Data API `search.list` is especially expensive (~100 quota units per call, with a tight daily search bucket). Identical queries during a show (retries, tab switches, multiple DJs) burn quota with no benefit.

[`SimpleCache`](../../packages/types/SimpleCache.ts) already existed as an optional server injection point but was a no-op stub and unused. Other sources (Spotify, Tidal) may want the same pattern later with different TTLs.

## Decision

1. Repurpose **`SimpleCache`** to a TTL string cache: `get` → `string | null`, `set(key, value, ttlSeconds)`, `delete`. Drop unused `clear`.
2. Provide a Redis-backed implementation (`createRedisSimpleCache`) on **`AppContext.cache`** / `RadioRoomServer.cache`, replacing the no-op default.
3. Pass optional `cache?: SimpleCache` on **`MetadataSourceAdapterConfig`** so adapters receive it at `register()` without importing `@repo/server`.
4. Put search caching policy in **`withCachedMetadataSearch`** (`@repo/utils`): normalize query, key `metadata:search:v1:{sourceId}:{encodeURIComponent(query)}`, hit/miss, process-local in-flight coalescing, JSON-serialized `MetadataSourceTrack[]`. Adapters opt in by calling the helper; they do not talk to Redis directly.
5. **YouTube adopts first** with a **24-hour** TTL on the enriched search result list (post-`videos.list`). Other sources remain uncached until they call the same helper.

## Consequences

- Repeat YouTube queries within TTL skip both `search.list` and `videos.list`, preserving daily quota.
- Results can be stale for up to the TTL; acceptable for DJ-scale search during a show day.
- Redis key volume grows with unique normalized queries; keys expire via `EX`.
- Extending to Spotify/Tidal requires only calling `withCachedMetadataSearch` with a chosen TTL—no further AdapterService wiring.

## See also

- [`packages/utils/cachedMetadataSearch.ts`](../../packages/utils/cachedMetadataSearch.ts)
- [`packages/adapter-bridge/lib/youtubeMetadata.ts`](../../packages/adapter-bridge/lib/youtubeMetadata.ts)
- [`packages/server/lib/redisSimpleCache.ts`](../../packages/server/lib/redisSimpleCache.ts)
- [0003. Redis for Ephemeral Room Data](0003-redis-for-ephemeral-room-data.md)
- [0011. Dependency Injection via AppContext](0011-dependency-injection-via-app-context.md)
