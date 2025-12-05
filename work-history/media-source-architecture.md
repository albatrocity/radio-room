# MediaSource Architecture

## Overview

MediaSources are adapters that provide track information from external services (Spotify, Shoutcast/Icecast radio streams). They follow a clean separation of concerns where the adapter is purely a gateway to the external service.

## Layer Boundaries

### 1. MediaSource Adapter (Gateway Layer)

**Location**: `packages/adapter-spotify`, `packages/adapter-shoutcast`

**Responsibility**: Gateway to external service

**Does**:

- Fetch data from external APIs (Spotify, Shoutcast)
- Transform external data to `MetadataSourceTrack` format
- Register polling jobs that run on server infrastructure
- Submit track data via `JobApi.submitMediaData()`

**Does NOT**:

- Read/write Redis directly
- Access the application cache
- Persist data
- Emit system events
- Manage playlists or queues
- Determine if a track is "new" to the system (server's job)
- Construct `QueueItem` objects

### 2. JobApi (Limited Server Interface)

**Location**: `packages/server/lib/createJobApi.ts`

**Responsibility**: Provide a limited, focused API to job handlers

```typescript
interface JobApi {
  submitMediaData: (params: {
    roomId: string
    data?: MediaData // Track + source info
    error?: string // Error message for error state
  }) => Promise<void>
}

interface MediaData {
  track: MetadataSourceTrack // The track metadata
  mediaSource: MediaSourceInfo // Where media is streamed from
  metadataSource?: MetadataSourceInfo // Where metadata came from (if enriched)
  stationMeta?: Station // For radio streams
}
```

### 3. Server Operation (`handleRoomNowPlayingData`)

**Location**: `packages/server/operations/room/handleRoomNowPlayingData.ts`

**Responsibility**: All persistence, enrichment, and event emission

**Does**:

- Checks Redis for same-track detection (source of truth)
- Constructs `QueueItem` from `MediaData`
- Enriches with queue data (addedBy, addedAt)
- Persists to Redis
- Updates playlist/queue
- Emits events via SystemEvents:
  - `TRACK_CHANGED { roomId, track, roomMeta }`
  - `MEDIA_SOURCE_STATUS_CHANGED { roomId, status, sourceType, error? }`
  - `PLAYLIST_TRACK_ADDED { roomId, track }`

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    External Services                             │
│  ┌────────────┐   ┌──────────────┐   ┌─────────────────┐       │
│  │ Spotify API │   │ Shoutcast    │   │ Future Sources  │       │
│  └─────┬──────┘   └──────┬───────┘   └────────┬────────┘       │
│        │                 │                     │                 │
└────────┼─────────────────┼─────────────────────┼─────────────────┘
         │                 │                     │
         ▼                 ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MediaSource Adapters                          │
│  (Gateway Layer - Fetch and Transform Only)                     │
│                                                                  │
│  • Polls external API                                            │
│  • Transforms to MetadataSourceTrack                             │
│  • Submits via api.submitMediaData()                             │
│                                                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ JobApi.submitMediaData(MediaData)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              Server Operation (handleRoomNowPlayingData)         │
│                                                                  │
│  • Checks Redis for same-track (source of truth)                │
│  • Constructs QueueItem from MediaData                          │
│  • Enriches with queue data (addedBy, addedAt)                  │
│  • Persists to Redis                                             │
│  • Updates playlist/queue                                        │
│  • Emits events via SystemEvents                                │
│                                                                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ Emits via SystemEvents
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Event Subscribers                             │
│                                                                  │
│  ┌────────────┐   ┌────────────┐   ┌────────────┐              │
│  │ Socket.IO  │   │ Redis      │   │ Plugins    │              │
│  │ (Frontend) │   │ PubSub     │   │            │              │
│  └────────────┘   └────────────┘   └────────────┘              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Why JobApi?

The `JobApi` provides a clean boundary between MediaSource adapters and server internals:

1. **Isolation**: MediaSources don't know about Redis, caching, or event systems
2. **Testability**: Easy to mock `JobApi` for testing adapters
3. **Consistency**: All MediaSources use the same interface
4. **Flexibility**: Server can change internals without affecting adapters

## Status Handling

MediaSource status is determined by the data passed to `submitMediaData`:

| Scenario         | `data`      | `error`  | Emitted Status |
| ---------------- | ----------- | -------- | -------------- |
| Track playing    | `MediaData` | -        | `"online"`     |
| No track playing | `undefined` | -        | `"offline"`    |
| API error        | `undefined` | `string` | `"error"`      |

## Future Considerations

### Webhook-based MediaSources

Some future MediaSources might support webhooks instead of polling:

- The MediaSource would register a webhook endpoint
- On webhook callback, call `api.submitMediaData()` with the track data
- Same server operation handles all the logic

### Real-time APIs

Some services might provide WebSocket/SSE streams:

- MediaSource manages the connection
- On track change event, call `api.submitMediaData()`
- Same pattern, just different trigger mechanism

## Package Exports

### `@repo/adapter-spotify`

- `mediaSource: MediaSourceAdapter` - Gateway to Spotify
- `playbackController: PlaybackControllerAdapter` - Control Spotify playback
- `metadataSource: MetadataSourceAdapter` - Search Spotify for metadata
- `createSpotifyAuthRoutes` - OAuth routes
- `createSpotifyServiceAuthAdapter` - Per-user auth management
- `createPlayerQueryJob` - Creates the player polling job

### `@repo/adapter-shoutcast`

- `mediaSource: MediaSourceAdapter` - Gateway to Shoutcast/Icecast streams
