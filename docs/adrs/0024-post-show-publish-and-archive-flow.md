# 0024. Post-show publish and archive flow

**Date:** 2026-03-30  
**Status:** Accepted

## Context

Shows attached to listening rooms produce rich ephemeral state in Redis (playlist history, chat, etc.). Admins need a deliberate **post-show** path to capture artifacts, update scheduling state, and retire the room without losing an archive of what happened.

## Decision

1. **Flow:** `publish/prepare` → admin refines Markdown in the scheduler → `publish/finalize` marks the export published, sets the show to `published`, archives non-recurring segments on that show, clears the ephemeral Postgres pointer `show.room_id`, then deletes the Redis room. Playlist rows and export Markdown are durable in PostgreSQL before/alongside finalize as specified in implementation.

2. **Ephemeral vs durable:** Redis rooms remain temporary. Durable artifacts are `room_export` (Markdown) and `room_playlist_track` (normalized playlist snapshot) in Postgres, keyed by show (and optional FK from playlist rows to `room_export`).

3. **`show.room_id`:** An ephemeral reverse pointer from Postgres to the active room id for scheduler UX (e.g. Publish CTA). It is set when a room attaches a show and cleared after successful publish finalization; a defensive Redis lookup by `showId` may still be used for resilience during rollout.

4. **Persistent rooms:** While `room.showId` is set, the room is marked `persistent` so the default empty-room TTL behavior does not schedule cleanup for 24h ([ADR 0003](0003-redis-for-ephemeral-room-data.md), [ADR 0021](0021-room-attached-show-and-segment-activation.md)).

5. **Playlist OAuth:** Initial playlist export uses the room creator’s linked services; see [ADR 0023](0023-publish-playlists-use-room-creator-oauth.md).

6. **Scheduler UX:** For `published` shows, the show detail is read-only timeline (no segment browser); the Markdown export remains editable and can be re-saved as published.

7. **Security:** `room_export.markdown` is stored as raw Markdown. Any separate archive app that renders it must treat it as untrusted content and sanitize rendered HTML (or disable raw HTML) before display.

## Consequences

- **Positive:** Clear lifecycle from live room to published archive; scheduler and archive consumers have stable Postgres APIs.
- **Positive:** Normalized playlist rows enable future features (e.g. export to another account after publish, play-frequency metrics) without Redis.
- **Trade-off:** Room deletion after publish must be reliable; failures should be logged/retried so Redis does not leak stale rooms.
- **Out of scope (documented):** Archive app UI, admin-targeted playlist export after publish, analytics dashboards.
