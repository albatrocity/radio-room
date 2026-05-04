# 0040. App-Controlled Spotify Playback and Ordered Redis Queue

**Date:** 2026-05-03  
**Status:** Accepted

## Context

Rooms with a PlaybackController (typically radio + Spotify) historically mirrored Spotify’s native queue: the app stored a copy of the queue and synced with Spotify’s queue API, which cannot reorder or remove arbitrary positions. To support future game mechanics that reorder the in-room queue, the app queue must be authoritative for **what plays next**.

Radio listeners hear audio via Shoutcast (delayed vs Spotify). Now Playing shown to users must stay aligned with what they hear, so Shoutcast remains the MediaSource for metadata while Spotify is advanced separately.

The legacy app queue used a Redis **SET** plus JSON blobs; member order was undefined.

## Decision

1. **`Room.playbackMode`**: Optional `"spotify-controlled"` (default when unset) vs `"app-controlled"`. App-controlled skips pushing new tracks into Spotify’s queue from `DJService.queueSong`; a scheduled job polls Spotify playback position and, near track end, **`ZPOPMIN`-style pops** the next item from an ordered Redis structure and calls **`PUT /me/player/play`** with that track’s URI.

2. **Ordered queue storage**: Replace the membership SET with a Redis **sorted set** `room:{roomId}:queue_order` whose members are canonical keys (`mediaSource.type:trackId`) and scores order FIFO (timestamps). Retain `room:{roomId}:queued_track:{trackKey}` JSON blobs. Lazy-migrate legacy SET data on first access by sorting loaded items by `addedAt`.

3. **Dispatched state**: After popping the head for playback but before Shoutcast reflects the new title, store the popped `QueueItem` under `room:{roomId}:dispatched_track` with a short TTL. When Shoutcast-driven `handleRoomNowPlayingData` runs, match against dispatched first so **DJ attribution** (`addedBy`) is preserved, then clear dispatched.

4. **Jobs**: Register both the existing queue-sync job (skips when app-controlled) and a new **track advance** job (skips when not app-controlled). Each tick checks `playbackMode` so toggling the room setting works without adapter re-registration.

5. **Queue payloads over the wire**: After dispatch (advance job or explicit Play), the popped item still appears in **`QUEUE_CHANGED`** as the first queue row with **`locked: true`** until Shoutcast matches now-playing and dispatched Redis state is cleared — clients do not need a separate dispatched concept or extra event.

## Consequences

- **Game-ready ordering**: Reordering is future `ZADD` score updates without storage migration.
- **Atomic next track**: Lua/`ZPOPMIN` semantics avoid races between job ticks.
- **Operational cost**: App-controlled rooms run an extra cron (every 3s) alongside existing jobs; track advance no-ops when mode is Spotify-controlled.
- **Disposable coupling**: Spotify Web API + polling assumptions are isolated in `@repo/adapter-spotify` jobs and can be revised if API behavior changes.

See also: [0005](0005-adapter-pattern-for-media-services.md), [0013](0013-track-identity-media-and-metadata-sources.md).
