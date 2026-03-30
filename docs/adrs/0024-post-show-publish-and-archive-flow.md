# 0024. Post-show publish and archive flow

**Date:** 2026-03-30  
**Status:** Accepted

## Context

Shows attached to listening rooms produce rich ephemeral state in Redis (playlist history, chat, etc.). Admins need a deliberate **post-show** path to capture artifacts, update scheduling state, and retire the room without losing an archive of what happened. Playlist history in Redis can include mistakes (e.g. skipped or accidental plays); admins should curate the track list before creating streaming playlists and the archived Markdown export.

## Decision

1. **Multi-step publish flow (show `ready`):**
   - **`POST .../publish/sync-playlist`** — Ensures a draft [`room_export`](../../packages/db/src/schema/scheduling.ts) row (`markdown` empty, `playlistLinks` cleared). Returns the current **Redis** playlist (`getRoomPlaylist`) as JSON for the scheduler. **Does not** write or delete [`room_playlist_track`](../../packages/db/src/schema/scheduling.ts) rows.
   - **Playlist review (scheduler)** — Admins reorder and remove tracks in **client state** only (no separate PUT for partial saves).
   - **`POST .../publish/continue`** — Body: ordered **`tracks`** (`QueueItem[]`). In one server flow: replace `room_playlist_track` for the show (this is the first persistence of curated rows and where removals take effect), create Spotify/Tidal playlists (room creator OAuth, non-blocking per service), generate Markdown (including YAML frontmatter) using the **curated** playlist while other export sections still come from the live room, then update `room_export` (`markdown`, `playlistLinks`).
   - **Markdown step** — Admin edits Markdown in the scheduler, then **`POST .../publish/finalize`** as before (first publish: mark published, archive segments, clear `show.room_id`, delete Redis room; republish: Markdown-only update).

2. **Ephemeral vs durable:** Redis rooms remain temporary. Durable artifacts are `room_export` (Markdown) and `room_playlist_track` (normalized playlist snapshot) in Postgres, keyed by show. **`room_playlist_track` is not deleted or replaced until `continue`** (not on sync).

3. **`show.room_id`:** An ephemeral reverse pointer from Postgres to the active room id for scheduler UX (e.g. Publish CTA). It is set when a room attaches a show and cleared after successful publish finalization; a defensive Redis lookup by `showId` may still be used for resilience during rollout.

4. **Persistent rooms:** While `room.showId` is set, the room is marked `persistent` so the default empty-room TTL behavior does not schedule cleanup for 24h ([ADR 0003](0003-redis-for-ephemeral-room-data.md), [ADR 0021](0021-room-attached-show-and-segment-activation.md)).

5. **Playlist OAuth:** Curated list from `continue` uses the room creator’s linked services; see [ADR 0023](0023-publish-playlists-use-room-creator-oauth.md). OAuth/API failures for a service do not block Markdown export.

6. **Scheduler UX:** For `published` shows, the show detail is read-only timeline (no segment browser); the Markdown export remains editable and can be re-saved as published (no sync/continue playlist step).

7. **Finalize guard:** Finalize rejects empty or whitespace-only `markdown` so the flow cannot complete without generated or edited content.

8. **Security:** `room_export.markdown` is stored as raw Markdown. Any separate archive app that renders it must treat it as untrusted content and sanitize rendered HTML (or disable raw HTML) before display.

## Consequences

- **Positive:** Clear lifecycle from live room to published archive; admins can fix playlist errors before OAuth export and Markdown.
- **Positive:** Normalized playlist rows enable future features without Redis.
- **Trade-off:** Room deletion after publish must be reliable; failures should be logged/retried so Redis does not leak stale rooms.
- **Trade-off:** Refreshing the playlist editor without navigation state requires running sync again (client list only until continue).
- **Out of scope (documented):** Archive app UI, admin-targeted playlist export after publish, analytics dashboards.
