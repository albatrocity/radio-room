# 0033. Track Detection Toggle and Streaming Mode

**Date:** 2026-04-06
**Status:** Accepted (revised)

## Context

Radio rooms poll station metadata (ICY/Shoutcast) for the now-playing display. When `fetchMeta` is enabled, this metadata is enriched via configured metadata sources (Spotify, Tidal, etc.) to show album art, links, and normalized track data. When `fetchMeta` is disabled, the raw station metadata (title, artist, album parsed from the pipe-delimited ICY string) was displayed as-is.

The original scope was limited to overriding display strings when `fetchMeta` was off. In practice, a broader "streaming mode" is needed: rooms hosting discussion segments, live performances, or other non-track content should not accumulate playlist entries or process track metadata at all.

## Decision

Repurpose `fetchMeta` as a **Track detection** toggle. The internal field name remains `fetchMeta` to avoid Redis data migration. Only UI labels and documentation change.

### Track detection ON (default behavior)

No changes. Metadata sources are polled, tracks are identified, enriched, displayed in Now Playing, and added to the playlist.

### Track detection OFF — streaming mode

When `fetchMeta` is `false` and `room.type === "radio"`, the room enters **streaming mode**:

1. **Early return in `handleRoomNowPlayingData`**: incoming media submissions are not processed into tracks. Station metadata (`stationMeta`) is still stored in Redis (for recovery on re-enable) and `MEDIA_SOURCE_STATUS_CHANGED` with `status: "online"` is emitted, but no `QueueItem` is built, no `TRACK_CHANGED` is emitted, and no playlist entry is added.

2. **`enterStreamingMode`** builds a minimal room-branding display:
   - `track.title` = room title
   - `track.artists` = active segment title (only when `showSchedulePublic` is true and `activeSegmentId` is set)
   - `artwork` = room artwork
   - No album, no DJ, no metadata source, no external URLs
   - Emits `TRACK_CHANGED` and `MEDIA_SOURCE_STATUS_CHANGED` so clients update

3. **Transitions**:
   - **ON → OFF**: `enterStreamingMode` clears track data and sets room branding
   - **OFF → ON**: `refreshNowPlayingFromStationMeta` rebuilds the last track from cached station meta
   - **Segment activation while OFF**: `enterStreamingMode` refreshes with the new segment title
   - **Display settings change while OFF** (`title`, `artwork`, `showSchedulePublic`): `enterStreamingMode` refreshes the branding display

4. **Centralized helpers** in `packages/server/lib/streamingMode.ts`: `isStreamingMode(room)`, `isTrackDetectionEnabled(room)`, and `streamingDisplayChanged(prev, next)` encapsulate mode checks so call sites remain simple.

### Segment override compatibility

`fetchMeta` remains part of `SegmentRoomSettingsOverride`, allowing segments to toggle track detection. This enables seamless transitions between discussion/live segments (track detection off) and music segments (track detection on).

## Consequences

- Radio rooms with track detection off show room branding instead of track metadata.
- No playlist entries accumulate during streaming mode, keeping history clean.
- The stream-online signal is preserved so clients can show audio controls.
- Jukebox rooms are unaffected (the early return only applies to `room.type === "radio"`).
- The `NowPlayingTrack` component on the client requires no changes — metadata-specific UI elements naturally hide when their data is absent.
- Plugin areas (`nowPlayingArt`, `nowPlayingBadge`, `nowPlayingInfo`) still render in streaming mode; plugins can use them for segment-specific content if desired.
