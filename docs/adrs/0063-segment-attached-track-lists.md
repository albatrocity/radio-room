# 0063. Segment-attached track lists and scheduler catalog search

**Date:** 2026-06-25  
**Status:** Accepted

## Context

Show segments in the scheduler describe programming blocks (e.g. a Guess the Tune round). Operators need to curate an **ordered list of Spotify tracks per segment placement on a show** — not per reusable segment entity — so the same segment type can appear multiple times on one show with different songs. When a host activates that placement in a listening room, admins should be prompted to inject those tracks into the queue (top or bottom) without re-searching.

Constraints:

- A segment may appear **more than once** on a show; activation and track lookup must be keyed by **`show_segment.id`** (placement id), not `segmentId` alone ([ADR 0021](0021-room-attached-show-and-segment-activation.md) originally keyed activation by `segmentId` only).
- Scheduler curation happens **before any room exists**, so room-creator OAuth ([ADR 0023](0023-publish-playlists-use-room-creator-oauth.md)) cannot drive catalog search in the scheduler app.
- `@repo/server` must not depend on `@repo/adapter-spotify` (adapter already depends on server); catalog search lives in a small **`@repo/spotify-catalog`** package.
- Injection at activation time must **re-resolve** tracks through the room's metadata source at queue time ([ADR 0013](0013-track-identity-media-and-metadata-sources.md)); stored `trackPayload` is for scheduler display only.

## Decision

1. **Persistence (`show_segment_track`)**  
   Ordered rows keyed by `show_segment.id` (cascade delete with placement). Fields mirror publish playlist tracks: position, title, source ids, `trackPayload` (`MetadataSourceTrack` jsonb). CRUD via `PUT /api/scheduling/show-segments/:id/tracks` and `SchedulingService.findShowSegmentTracks(showSegmentId)`.

2. **Scheduler search**  
   `GET /api/scheduling/spotify/search?q=` uses **client-credentials** token from `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` via `@repo/spotify-catalog` (`searchSpotifyCatalog`, shared `trackItemSchema`). No per-user OAuth in the scheduler.

3. **Placement-based activation**  
   Extend room state with `activeShowSegmentId` alongside `activeSegmentId`. Redis schedule snapshot segments include `showSegmentId`. `SET_ACTIVE_SEGMENT` accepts optional `showSegmentId`; `activateRoomSegment` resolves placement by id with `segmentId`-only fallback for stale clients.

4. **Activation prompt (targeted socket, not SystemEvents)**  
   After successful activation, if the placement has tracks, the admin handler emits **`SEGMENT_TRACKS_AVAILABLE`** to the activating socket only: `{ showSegmentId, segmentTitle, count, allowTop }` where `allowTop = isAppControlledPlayback(room)`.

5. **Queue injection**  
   Admin sends **`INJECT_SEGMENT_TRACKS`** `{ showSegmentId, placement: "top" | "bottom" }`. Operation `injectSegmentTracksToQueue`:
   - Loads tracks by placement id; enqueues via `DJService.queueSongAs` with plugin attribution `{ type: "plugin", pluginName: "scheduler", displayName: <segment title> }` and `runPluginValidation: false`.
   - Rejects `top` for spotify-controlled rooms; bottom works in both modes.
   - Skips duplicates (`queueSongAs` already dedupes); emits one `QUEUE_CHANGED` after batch (`suppressQueueChanged` on intermediate adds).
   - Top placement: batch enqueue then single `setQueue` reorder (app-controlled only).

6. **Studio bridge**  
   Stub `SET_ACTIVE_SEGMENT`, `INJECT_SEGMENT_TRACKS`, `SEGMENT_TRACKS_AVAILABLE`, and `SEGMENT_TRACKS_INJECTED` in [`apps/studio-bridge`](../../apps/studio-bridge) so Game Studio preview does not ignore unknown admin events. Optional `segmentTracksStub` on `BridgeSnapshot` drives the inject prompt in sandbox.

## Consequences

- **Positive:** Guess-the-tune (and similar) rounds get distinct track lists per show and per placement; activation + inject is one admin flow.
- **Positive:** Scheduler search works without room OAuth; `@repo/spotify-catalog` breaks the server ↔ adapter-spotify cycle.
- **Trade-off:** Spotify-only catalog search for now; other metadata sources need parallel catalog helpers later.
- **Trade-off:** `SEGMENT_TRACKS_AVAILABLE` is a direct socket emit (like other admin UX), not a SystemEvents domain event — plugins and Redis subscribers do not see the prompt.
- **Related:** Room schedule snapshot shape extended per [ADR 0028](0028-room-schedule-redis-snapshot.md); segment activation baseline in [ADR 0021](0021-room-attached-show-and-segment-activation.md).

## See also

- [`packages/server/operations/injectSegmentTracksToQueue.ts`](../../packages/server/operations/injectSegmentTracksToQueue.ts)
- [`packages/spotify-catalog/`](../../packages/spotify-catalog/)
- Scheduler UI: `SegmentTrackPicker` in `apps/scheduler`
