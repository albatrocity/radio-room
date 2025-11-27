# Listening Room

A web app to create chat rooms around Shoutcast servers, or use as a remote control for a Spotify account.

## Dev

- Install dependencies with `npm`
- `docker compose up`

## Architecture

### MediaSource → Server Data Flow

MediaSources submit raw media data via a standard DTO. The server handles enrichment, deduplication, and event emission.

```
┌─────────────────────────────────────────────────────────────────┐
│                     MediaSource Adapters                         │
│                                                                  │
│  ┌─────────────────────┐     ┌───────────────────────────────┐  │
│  │ Spotify             │     │ Shoutcast                     │  │
│  │ - trackId           │     │ - trackId (hashed title)      │  │
│  │ - title, artist     │     │ - title, artist, album        │  │
│  │ - enrichedTrack ✓   │     │ - stationMeta                 │  │
│  │ - metadataSource ✓  │     │ (no enrichment - just raw)    │  │
│  └──────────┬──────────┘     └───────────────┬───────────────┘  │
└─────────────┼────────────────────────────────┼──────────────────┘
              │   MediaSourceSubmission        │
              v                                v
┌─────────────────────────────────────────────────────────────────┐
│              handleRoomNowPlayingData (Server)                   │
│                                                                  │
│  1. Check if same track (early exit)                            │
│  2. resolveTrackData():                                         │
│     - If enrichedTrack provided → use it (skip enrichment)      │
│     - Else if room.fetchMeta && room.metadataSourceId →         │
│       → call MetadataSource.search() to enrich                  │
│     - Else → use raw data (createRawTrack)                      │
│  3. Construct QueueItem                                         │
│  4. Persist to Redis, emit events                               │
└─────────────────────────────────────────────────────────────────┘
```

#### Key Concepts

- **MediaSource**: Fetches raw media data (what's currently playing)
- **MetadataSource**: Enriches tracks with album art, artist info, etc.
- **MediaSourceSubmission**: Standard DTO submitted by all MediaSources
- **enrichedTrack**: Optional pre-enriched data (when MediaSource = MetadataSource, e.g., Spotify)

#### Benefits

- **Separation of concerns**: MediaSources just fetch media data
- **Centralized enrichment**: Server handles all metadata enrichment
- **Easy to add MediaSources**: Just submit raw data, server does the rest
- **Consistent behavior**: All rooms use the same enrichment path
