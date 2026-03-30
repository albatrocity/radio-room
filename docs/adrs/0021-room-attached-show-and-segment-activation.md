# 0021. Room-attached show and segment activation

**Date:** 2026-03-30  
**Status:** Accepted

## Context

Shows and segments live in PostgreSQL (scheduling). Listening rooms live in Redis with ephemeral state. Admins need to attach a **ready** show to a room by **id** only (not a cached DTO), surface the show timeline in the web room UI, and **activate** one segment at a time with optional plugin preset application and chat announcements.

## Decision

1. **Room fields (Redis `room:{id}:details`)**  
   Store `showId`, `activeSegmentId`, `showSchedulePublic`, and `announceActiveSegment` on [`Room`](../../packages/types/Room.ts). Timeline data is always loaded from `GET /api/scheduling/shows/:id` using the stored id.

2. **Activation transport**  
   Admins use socket event `SET_ACTIVE_SEGMENT` with `{ segmentId, presetMode: "merge" | "replace" | "skip" }`. Server validates membership (segment belongs to the room’s show), updates `activeSegmentId`, optionally applies segment `pluginPreset` (with replace = delete all room plugin configs then apply; merge = update only keys present in the preset), emits **`SEGMENT_ACTIVATED`** via [`SystemEvents`](../../packages/server/lib/SystemEvents.ts) (Redis `SYSTEM:SEGMENT_ACTIVATED` + Socket.IO + plugins), optionally sends a chat system message, then emits **`ROOM_SETTINGS_UPDATED`** with fresh plugin configs.

3. **Business logic location**  
   Core logic lives in [`activateRoomSegment`](../../packages/server/operations/activateRoomSegment.ts); the admin handler is a thin adapter (aligns with [ADR 0014](0014-emit-domain-events-from-operations-only.md) intent for testability and single side-effect surface).

4. **Show attachment at room creation**  
   HTTP `POST /rooms` accepts optional `showId`; server loads the show and rejects unless `status === "ready"`.

## Consequences

- **Positive:** Host-side or future daemons can subscribe to Redis `SYSTEM:SEGMENT_ACTIVATED` without coupling to Socket.IO. Room state stays small and schedule edits in Postgres are reflected on next timeline fetch.
- **Positive:** Preset apply modes match admin expectations (merge vs full replace vs skip).
- **Trade-off:** Removing `showId` requires `HDEL` on hash fields (see `hDelRoomDetailsFields`); null merges alone are insufficient with `HSET`-only writes.
