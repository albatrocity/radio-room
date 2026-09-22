# 0192. Plugin storage and leaderboard helpers

**Date:** 2026-09-22
**Status:** Accepted

## Context

Eight plugins independently implement the same JSON read/write pattern on `PluginStorage`: `get` → `JSON.parse`, `JSON.stringify` → `set`. This pattern is error-prone (missing try/catch, no atomicity on read-modify-write) and duplicates boilerplate.

Six plugins independently build leaderboards from a Redis sorted set with username hydration via `getUsersByIds`. Each copy fetches the zset, maps user ids to usernames, and falls back to userId — identical logic duplicated across guess-the-tune, quiz-sessions, lyric-hero, special-words, queue-theme, and playlist-democracy.

The Kickstarter campaign state already uses `compareAndSet` for optimistic concurrency, but the retry loop is hand-rolled at every call site.

## Decision

### PluginStorage JSON helpers

Add to `PluginStorage` (interface in `@repo/types`, implementation in `packages/server/lib/plugins/PluginStorage.ts`):

- **`getJson<T>(key)`** — returns `{ raw: string | null; value: T | null }`. The `raw` field supports `compareAndSet` callers that need the wire value.
- **`setJson(key, value, ttl?)`** — `JSON.stringify` + `set`.
- **`updateJson<T>(key, fn, { retries? })`** — atomic read-modify-write built on `compareAndSet`. Retries up to `retries` (default 5) on CAS conflict, then throws.

### List / capped log helpers

- **`lrange(key, start, stop)`** — reads a Redis list range.
- **`appendCapped(key, entry, max)`** — `LPUSH JSON.stringify(entry)` + `LTRIM 0 (max - 1)`. Used by the-fed's tick log (previously a JSON array stored in a single string key).

### Leaderboard helper

Add `createLeaderboard({ storage, api, key })` to `packages/plugin-base/helpers/leaderboard.ts`. Returns:

- **`increment(userId, n)`** — `ZINCRBY`.
- **`top({ topN? })`** — hydrate usernames via `getUsersByIds`, fallback to userId. When `topN` is set, reads only the top N entries.
- **`all()`** — alias for `top()` with no cap.
- **`reset()`** — `DEL` (single O(1) command instead of looping `ZREM`).

Exported from `@repo/plugin-base` alongside the existing `fetchTopZsetEntries` and `HOT_LEADERBOARD_TOP_N`.

## Consequences

- **Reduced duplication**: eight plugins' load/save helpers collapse to one-line `getJson`/`setJson` calls. Six hand-rolled leaderboards become `createLeaderboard` instances.
- **Safer concurrency**: `updateJson` wraps the retry loop so plugins don't need to manage CAS manually. The Kickstarter `updateCampaign` function demonstrates the reference pattern.
- **Efficient resets**: `reset()` uses `DEL` instead of iterating `ZREM` per member — O(1) instead of O(N).
- **The-fed tick data format change**: ticks move from a single JSON-array string to a Redis LIST. `readTicks` now uses `lrange` and parses each element individually. Existing tick data is not migrated (the list starts empty on first `appendCapped`).
- **MemoryRedisClient updated**: `lPush`, `lTrim`, `lRange` added for test coverage of the new list operations.
