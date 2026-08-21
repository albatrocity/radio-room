# 0108. Local CatalogBrowse Result Cache

**Date:** 2026-08-21
**Status:** Accepted

## Context

Opening an album or Physical Media item in CatalogBrowse always emits `BROWSE_ALBUM` / `BROWSE_MEDIA_ITEM`, which fans out over Redis RPC to the DJ Mac Media Bridge. The daemon maps every song (cover-art data URIs, optional disk tags) and ships the JSON back over the WAN. Daemon-local playlist/cover LRUs do not skip that hop. Repeat opens of the same album during a show (breadcrumb back, modal remount, multiple DJs) re-tax the DJ Mac with no benefit.

[ADR 0086](0086-metadata-search-result-cache.md) already provides `AppContext.cache` / `SimpleCache` with Redis TTL strings. [ADR 0099](0099-physical-media-personal-libraries.md) §7 forbids caching Local **search** under a key that omits playlist scope (cross-user leakage). Album and playlist track listings are similarly grant-scoped: the same playlist membership set must share a key, and library-access users use a distinct `library` scope — never a raw user id.

## Decision

1. **Cache successful Local browse track payloads** in Redis via `SimpleCache`:
   - Album: `metadata:browse:v1:{roomId}:album:{albumId}:{scope}`
   - Playlist tracks: `metadata:browse:v1:{roomId}:playlist:{playlistId}`
   - `scope` = `library` when `playlistIds` is empty/absent; otherwise sorted unique playlist ids joined by `,`.
2. **TTL:** 10 minutes (aligned with daemon playlist/cover cache TTLs).
3. **Policy helper:** `withCachedJson` in `@repo/utils` (hit/miss, in-flight coalescing, JSON serialize). Do **not** store failures, `null`, or unreachable-bridge results.
4. **Invalidation:** `refreshLocalLibrary` / `invalidateLocalLibraryCache` continues to clear the daemon cache **and** deletes Redis keys under `metadata:browse:v1:{roomId}:` via `SimpleCache.deleteByPrefix`.
5. **Client session cache:** CatalogBrowse machine may keep a small bounded in-memory map of recent album/media results for the open modal; Redis remains the cross-listener / remount layer.
6. **Out of scope:** Local search (still uncached per ADR 0099), `listArtists` / `listAlbums` / `getArtist`, Spotify browse.

## Consequences

- Repeat album / Physical Media opens within TTL skip DJ Mac RPC and large data-URI round-trips.
- Results can be stale for up to 10 minutes until TTL expiry or admin library refresh.
- Redis keys grow with unique room+album+scope (and playlist) combinations; `EX` and prefix delete on refresh bound lifetime.
- Same grant set shares a key; different playlist scopes never leak across each other.

## See also

- [0086. Metadata search result cache](0086-metadata-search-result-cache.md)
- [0099. Physical Media personal libraries](0099-physical-media-personal-libraries.md)
- [`packages/utils/cachedJson.ts`](../../packages/utils/cachedJson.ts)
- [`packages/adapter-bridge/lib/localMetadata.ts`](../../packages/adapter-bridge/lib/localMetadata.ts)
