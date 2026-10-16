# 0203. Departed listener user records kept for two days

**Date:** 2026-10-16
**Status:** Accepted

## Context

Room export resolves each id in `room:{roomId}:userHistory` by reading `user:{userId}` ([ADR 0003](0003-redis-for-ephemeral-room-data.md)). Chat, playlist credits, and reactions snapshot a username at the time of the action, but the user-history list uses the live hash. When that hash is missing, the markdown export prints "Anonymous."

On disconnect, listeners who have not created a room get a TTL on `user:{id}`. That TTL was three hours. A show that ends around midnight and is exported the next morning (about eight hours later) loses every departed listener's name. Reconnecting calls `persistUser`, which clears the TTL for the session; disconnect starts it again.

User hashes are small (id, username, roles). Production Redis evicts only keys that have a TTL ([ADR 0186](0186-redis-coordination-s3-media.md)), so a longer window makes these hashes eviction candidates for two days instead of three hours. Room creators are not given a TTL.

## Decision

1. **TTL is two days** (`DEPARTED_USER_RECORD_TTL` in `packages/server/lib/constants.ts`), applied in `AuthService.disconnect` when `getUserRooms` is empty.
2. **Room creators stay persisted.** No TTL is set when the user has created a room.
3. **Login still clears the TTL** via `persistUser` for the duration of the visit.

## Consequences

- A next-morning (or next-day) export can still resolve usernames for people who left at the end of the show.
- Users who never chat, react, queue, or rename are still unnamed in an export made after the TTL. Those actions remain the only durable name snapshots.
- Two days of departed listener hashes occupy a little more Redis memory and are eligible for `volatile-lru` eviction under memory pressure.
- This does not restore hashes that already expired.

## See also

- [`packages/server/services/AuthService.ts`](../../packages/server/services/AuthService.ts) (`disconnect`)
- [`packages/server/services/ExportService.ts`](../../packages/server/services/ExportService.ts)
