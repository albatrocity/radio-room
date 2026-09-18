# 0186. Redis coordination and content-addressed S3 media

**Date:** 2026-09-18
**Status:** Accepted

## Context

Production Redis hit `maxmemory` and rejected writes (`OOM command not allowed…`), crashing the web dyno during a live show. The dominant growth was **base64 cover art and similar blobs** in `room:{id}:images:*` (Physical Media `al-cover-` / `pl-cover-`, queue `qimg-`, chat uploads) with **no TTL**. Heroku Redis defaulted to `noeviction`. Admin join runs `persistRoom`, which `PERSIST`s every `room:{id}:*` key and strips TTLs from any room-scoped cache (including 4h track previews).

Redis remains essential for room state, presence, Socket.IO, and SystemEvents ([ADR 0003](0003-redis-for-ephemeral-room-data.md)). It must not hold file bytes.

## Decision

1. **Eviction:** Production Redis uses **`volatile-lru`**. Only keys with TTLs are eviction candidates. Room state without TTL stays.
2. **Runtime guard:** Blob writers refuse values over a size ceiling (`assertRedisValueSize`) instead of attempting a write that can OOM the instance. A periodic job logs when `used_memory / maxmemory` is high.
3. **Sessions:** Express/connect-redis cookie TTL is **90 days**. Guest `userId` remains in `localStorage` ([ADR 0058](0058-client-session-localstorage.md)).
4. **`persistRoom` / `expireRoomIn`:** Skip room cache suffixes (`:images:`, `:track-previews:`, `:track-preview-id:`) so TTLs survive admin join.
5. **Binaries in S3:** Covers, previews, chat, and room artwork live under `media/` on the asset bucket, served via CloudFront. Redis holds **small TTL'd URL pointers** (via `SimpleCache`), not base64.
6. **Content-addressed object keys:** S3 keys use full sha256 of cover bytes / track fingerprint / chat bytes. **Navidrome ids never appear in S3 keys** (library-local; collide across Macs; rebuild on rescan).
7. **Two-key rule:** Lookup/pointer keys may use identity or Navidrome ids; object keys are intrinsic hashes only. Version segment `v1` in every key family.
8. **API owns Head/Put:** DJ Mac stays RPC-only (no AWS). On miss, existing cover/preview RPCs return bytes once; the API puts to S3 and caches the CDN URL.
9. **Cover pointers** are identity-keyed (stable playlist name or `artist|album`) with positive (30d) and negative (7d) records so reconnects do not re-RPC. Preview pointers are fingerprint-keyed across rooms/libraries.

## Consequences

- Redis memory tracks active sessions and pointers, not library size.
- First miss still costs daemon ffmpeg / getCoverArt; subsequent rooms and rescans hit S3/pointers.
- CloudFront must allow `GetObject` on `media/*` before cutover; IAM needs `s3:GetObject` for Head.
- Legacy blob keys must be `UNLINK`ed after cutover (`volatile-lru` cannot evict no-TTL keys).
- Partial supersession: storage clauses of [0099](0099-physical-media-personal-libraries.md) §8, [0103](0103-physical-media-track-previews.md) §1/§4, [0134](0134-chat-image-server-processing.md) (Redis as blob store).

## See also

- [`packages/server/services/MediaObjectCache.ts`](../../packages/server/services/MediaObjectCache.ts)
- [`packages/server/services/mediaFingerprint.ts`](../../packages/server/services/mediaFingerprint.ts)
- [`docs/BACKEND_DEVELOPMENT.md`](../BACKEND_DEVELOPMENT.md) (Redis memory / reclaim)
