# 0195. Segment title and image as the streaming-mode Now Playing display

**Date:** 2026-09-30
**Status:** Accepted

## Context

[ADR 0033](0033-room-title-display-when-fetch-meta-off.md) defines streaming mode (track detection off on a radio/live room): Now Playing shows the room title, the active segment title as the artist line (only when `showSchedulePublic`), and **room artwork** as the cover. Broadcasters want each segment (a talk segment, a guest spot, a live set) to carry its own image and title, so Now Playing follows the show's timeline without editing room settings between segments, and without exposing the full schedule panel.

## Decision

1. **Storage** — nullable `segment.image_url` (Postgres) holds a CDN URL; exposed as `SegmentDTO.imageUrl`. Bytes live in S3 under `media/segments/v1/{sha256}.{ext}` (content-addressed, [ADR 0186](0186-redis-coordination-s3-media.md)). No Redis blob fallback: uploads return 503 when the asset bucket is not configured.
2. **Transport** — admin-only `POST /api/scheduling/segments/:id/image` (multipart field `image`, processed by `prepareRoomImage`) and `DELETE /api/scheduling/segments/:id/image`. Both return `{ segment }`.
3. **Snapshot** — `RoomScheduleSnapshotSegmentDTO.segment.imageUrl` carries the URL so streaming mode resolves it from Redis ([ADR 0028](0028-room-schedule-redis-snapshot.md)). The public local-remote picker does not expose it.
4. **Server display** — `enterStreamingMode`:
   - With an active segment found in the snapshot: heading (`track`, `title`, `nowPlaying.track.title`) is the **segment title only**; no room title, no artist line. Cover is the segment `imageUrl`, falling back to `room.artwork`.
   - Without one: room title and room artwork (ADR 0033 behavior).
   - `showSchedulePublic` no longer affects the streaming display, and is no longer part of `streamingDisplayChanged`.
5. **Artwork persistence** — `makeJukeboxCurrentPayload` (used by `setRoomCurrent`) keeps a caller-provided `meta.artwork` and only derives artwork from room/album images when the caller supplies none.
6. **Live refresh** — after upload/clear, the server refreshes schedule snapshots for every show containing the segment, then re-runs `enterStreamingMode` for rooms where that segment is active and `isStreamingMode(room)`.
7. **Client precedence** — in streaming mode, Now Playing and the Media Session prefer `RoomMeta.artwork` over `room.artwork` (`roomBrandingCoverUrl` in `apps/web/src/lib/metadataImages.ts`). With track detection on, cover rules are unchanged.

This partially supersedes ADR 0033 §2 (streaming-mode title, artist, and artwork) and its consequence that `NowPlayingTrack` needs no changes.

## Consequences

- Segment title and image swap automatically on activation in streaming mode; clearing the image falls back to room artwork.
- Listeners see the active segment title even when the schedule panel is private.
- Clearing an image does not delete the S3 object (shared content-addressed objects may be referenced elsewhere).
- Dynamic theme still extracts colors from album images only, so the segment image does not recolor the room.
- Local development without `ASSET_S3_BUCKET` cannot upload segment images.
