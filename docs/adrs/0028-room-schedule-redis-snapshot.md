# 0028. Room schedule snapshot in Redis + SHOW_SCHEDULE_UPDATED

**Date:** 2026-04-04  
**Status:** Accepted

## Context

[ADR 0021](0021-room-attached-show-and-segment-activation.md) originally pointed the listening-room UI at `GET /api/scheduling/shows/:id` for the timeline. Operators and tools with Redis-only access should be able to read segment ids and titles, and the web client should stay in sync when the scheduler edits the show without calling the scheduling HTTP API.

## Decision

1. **Redis key:** `room:{roomId}:schedule_snapshot` — a **string** value containing JSON [`RoomScheduleSnapshotDTO`](../../packages/types/Scheduling.ts) (`version`, `showId`, `showTitle`, `startTime`, `updatedAt`, ordered `segments` with `segmentId`, `title`, `position`, `durationMinutes`, `durationOverride`, and `segment.pluginPreset` for activation UX). Duration rules match the lobby schedule: `durationOverride ?? segment.duration ?? 0`. **No TTL** by default.

2. **Write-through:** After mutations that change the timeline for attached rooms, the server runs `refreshRoomScheduleSnapshot` / `refreshScheduleSnapshotForShow` in [`packages/server/operations/scheduleRedisSnapshot.ts`](../../packages/server/operations/scheduleRedisSnapshot.ts). On failure, log and do not fail the primary mutation.

3. **Socket.IO / SystemEvents:** After a successful snapshot write or delete, emit **`SHOW_SCHEDULE_UPDATED`** with `{ roomId, showId, snapshot }` where `snapshot` is the full DTO or `null`. Clients hydrate from `GET /rooms/:id` (`scheduleSnapshot` field) and apply socket updates without refetching the scheduling API.

4. **Relationship to Postgres:** Postgres remains the source of truth; the snapshot is denormalized for Redis-first consumers and push freshness.

## Consequences

- **Positive:** `redis-cli GET room:{id}:schedule_snapshot` exposes the timeline; schedule panel updates live from room channel events.
- **Positive:** `SHOW_SCHEDULE_UPDATED` publishes to `SYSTEM:SHOW_SCHEDULE_UPDATED` like other system events.
- **Negative:** Every mutation path that alters show/segment composition must call the refresher; new scheduling endpoints must follow the same pattern.
