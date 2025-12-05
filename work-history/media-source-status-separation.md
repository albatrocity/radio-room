# Media Source Status Separation

## Problem
Previously, we were conflating two separate concerns in the `TRACK_CHANGED` event:
1. **Track Information** - What's playing (title, artist, album, artwork)
2. **Media Source Status** - Whether the stream/player is online and available

The `bitrate` field in `RoomMeta` was being used as a proxy to determine if the media source was "online", which was confusing and room-type-specific.

## Solution: Separate Events

### Two Distinct Events

**1. `TRACK_CHANGED`** - Pure track information
```typescript
{
  type: "TRACK_CHANGED",
  data: {
    roomId: string,
    meta: {
      nowPlaying: QueueItem,     // Track data
      dj: User,                  // Who added it
      title: string,             // Display fields
      artist: string,
      album: string,
      artwork: string,
      lastUpdatedAt: string,
      stationMeta: Station,      // Radio station info
      release: any,              // Backward compat
      // ❌ NO bitrate - that's connection info!
    }
  }
}
```

**2. `MEDIA_SOURCE_STATUS_CHANGED`** - Connection/availability status
```typescript
{
  type: "MEDIA_SOURCE_STATUS_CHANGED",
  data: {
    roomId: string,
    status: "online" | "offline" | "connecting" | "error",
    sourceType: "jukebox" | "radio",
    bitrate?: number,     // ✅ Radio-specific metadata here
    error?: string,       // Error details if status is "error"
  }
}
```

## Benefits

### 1. Separation of Concerns
- **Track data** = What's playing
- **Status data** = Is the source available

### 2. Independent Updates
- Media source can go offline/online without track changes
- Track can change without affecting connection status
- Each adapter can report its status independently

### 3. Cleaner UI State
Frontend can now clearly distinguish:
- "Connecting..." (status: connecting, no track)
- "Nothing playing" (status: online, no track)  
- "Playing: Song Title" (status: online, has track)
- "Offline" (status: offline)

### 4. Adapter Independence
Each media source adapter can emit status independently:
- **Spotify adapter**: "online" when player active, "offline" when no device
- **Shoutcast adapter**: "online" when stream connected, "offline" when stream down
- **Future adapters**: Can define their own status logic

## Implementation

### Backend Changes

**1. Types** (`packages/types/`)
- Removed `bitrate` from `RoomMeta`
- Added `MediaSourceStatus` type
- Added `MEDIA_SOURCE_STATUS_CHANGED` to `PluginLifecycleEvents`

**2. Operations** (`packages/server/operations/room/handleRoomNowPlayingData.ts`)
- Removed `bitrate` from `completeMeta` construction
- Added separate `MEDIA_SOURCE_STATUS_CHANGED` emission for radio rooms
- Radio rooms emit "online" status with bitrate when track data arrives

**3. Future: Media Source Adapters**
Each adapter can emit status independently:
```typescript
// In Spotify adapter
await context.systemEvents.emit(roomId, "MEDIA_SOURCE_STATUS_CHANGED", {
  roomId,
  status: hasActiveDevice ? "online" : "offline",
  sourceType: "jukebox",
})

// In Shoutcast adapter  
await context.systemEvents.emit(roomId, "MEDIA_SOURCE_STATUS_CHANGED", {
  roomId,
  status: streamConnected ? "online" : "offline",
  sourceType: "radio",
  bitrate: streamInfo.bitrate,
})
```

### Frontend Changes

**1. Machine Context** (`apps/web/src/machines/audioMachine.ts`)
Added separate `mediaSourceStatus` field:
```typescript
interface Context {
  volume: number
  meta?: RoomMeta                  // Track info
  mediaSourceStatus: "online" | "offline" | "connecting" | "unknown"  // ← New
  participationStatus: "listening" | "participating"
}
```

**2. Event Handlers**
- `TRACK_CHANGED` - Updates meta only
- `MEDIA_SOURCE_STATUS_CHANGED` - Updates status only, transitions states
- `INIT` - Updates both meta and infers initial status

**3. State Transitions**
Status now drives the online/offline states:
```typescript
MEDIA_SOURCE_STATUS_CHANGED: [
  { target: "online", cond: "statusIsOnline" },
  { target: "offline" }
]
```

**4. Store Selector** (`apps/web/src/state/audioStore.ts`)
```typescript
export const useMediaSourceStatus = () =>
  useAudioStore((s) => s.state.context.mediaSourceStatus)
```

## Migration Path

### Current State (✅ Implemented)
- Radio rooms emit `MEDIA_SOURCE_STATUS_CHANGED` when track arrives
- Frontend tracks status separately from meta
- `bitrate` removed from `RoomMeta`

### Next Steps (Future)
1. Spotify/jukebox adapter emits status independently
2. Periodic status checks (heartbeat)
3. Error status with details
4. Connecting status during initial setup

## Example Scenarios

### Radio Room - Stream Offline
1. Stream goes down
2. Adapter emits: `MEDIA_SOURCE_STATUS_CHANGED` → status: "offline"
3. UI shows: "Radio stream offline"
4. Last track info still visible but grayed out

### Jukebox Room - No Device
1. User's Spotify has no active device
2. Adapter emits: `MEDIA_SOURCE_STATUS_CHANGED` → status: "offline"
3. UI shows: "No active Spotify device"
4. Previous track info still visible

### Track Change While Online
1. Adapter emits: `TRACK_CHANGED` → new track meta
2. Status stays "online"
3. UI updates track info seamlessly

This is much cleaner and more flexible! 🎯

