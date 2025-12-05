# TRACK_CHANGED Standardization Complete

## Problem
After implementing SCREAMING_SNAKE_CASE events, the UI wasn't updating when tracks changed because:
1. `RoomMeta` type was incomplete (missing display fields like `title`, `artist`, `album`, etc.)
2. `makeJukeboxCurrentPayload()` created a complex nested structure
3. INIT and TRACK_CHANGED events had different payload structures
4. `audioMachine` used `hasBitrate` guard (radio-specific) instead of checking for track data

## Solution: Standardized RoomMeta

### 1. Extended `RoomMeta` Type
**File**: `packages/types/Room.ts`

Added all display fields directly to RoomMeta:
```typescript
export type RoomMeta = {
  nowPlaying?: QueueItem      // Core track data
  dj?: User                   // Who added the track
  bitrate?: number            // For radio streams
  title?: string              // ← New: Track title
  artist?: string             // ← New: Artist names
  album?: string              // ← New: Album title
  track?: string              // ← New: Track title (duplicate for compatibility)
  artwork?: string            // ← New: Artwork URL
  lastUpdatedAt?: string      // When last updated
  stationMeta?: Station       // Radio station info
  release?: any               // ← Legacy: For backward compatibility
}
```

### 2. Build Complete Meta at Source
**File**: `packages/server/operations/room/handleRoomNowPlayingData.ts`

Now builds complete RoomMeta with ALL display fields before saving to Redis:

```typescript
const completeMeta = {
  nowPlaying,
  dj: trackDj,                // Resolved from queue or current
  title: nowPlaying?.track?.title,
  artist: nowPlaying?.track?.artists?.map((a) => a.title).join(", "),
  album: nowPlaying?.track?.album?.title,
  track: nowPlaying?.track?.title,
  artwork: room?.artwork || nowPlaying?.track?.album?.images?.[0]?.url,
  bitrate: room?.type === "radio" && stationMeta?.bitrate ? Number(stationMeta.bitrate) : undefined,
  lastUpdatedAt: Date.now().toString(),
  stationMeta,
  release: nowPlaying,        // backward compatibility
}
```

**Benefits:**
- ✅ Computed once at source
- ✅ Stored in Redis with all fields
- ✅ Consistent for both INIT and TRACK_CHANGED
- ✅ Works for both jukebox and radio rooms

### 3. Simplified PubSub Handler
**File**: `packages/server/pubSub/handlers/jukebox.ts`

Removed `makeJukeboxCurrentPayload()` complexity:
```typescript
// Before: Complex transformation
const payload = await operations.rooms.makeJukeboxCurrentPayload(...)
io.emit("event", { type: "TRACK_CHANGED", data: { meta: payload?.data?.meta } })

// After: Simple pass-through
io.emit("event", { type: "TRACK_CHANGED", data: { roomId, meta: roomMeta } })
```

### 4. Simplified audioMachine Guard
**File**: `apps/web/src/machines/audioMachine.ts`

Changed from radio-specific `hasBitrate` to universal `hasTrack`:

```typescript
// Before: Only worked for radio rooms
hasBitrate: (_context, event) => {
  return !isEmpty(event.data.meta) && !isNil(event.data.meta.bitrate)
}

// After: Works for both jukebox and radio
hasTrack: (_context, event) => {
  return !isEmpty(event.data.meta) && !isNil(event.data.meta.nowPlaying)
}
```

## Event Flow

### INIT Event (Room Join)
```typescript
{
  type: "INIT",
  data: {
    users: User[],
    messages: ChatMessage[],
    meta: RoomMeta,        // ← Complete RoomMeta with all display fields
    playlist: QueueItem[],
    reactions: ReactionStore,
    ...
  }
}
```

### TRACK_CHANGED Event
```typescript
{
  type: "TRACK_CHANGED",
  data: {
    roomId: string,
    meta: RoomMeta,        // ← Same complete RoomMeta structure
  }
}
```

## UI Component Compatibility

Both `NowPlaying.tsx` and `PlayerUi.tsx` now work correctly because:

1. **Direct field access** (for display):
   ```typescript
   const { album, artist, track, title, artwork, dj } = meta || {}
   ```

2. **nowPlaying access** (for detailed data):
   ```typescript
   const release = nowPlaying?.track
   const trackId = meta?.nowPlaying?.mediaSource?.trackId
   ```

3. **Works for both room types**:
   - Jukebox: Has `nowPlaying` with Spotify/metadata source data
   - Radio: Has `nowPlaying` with parsed stream metadata + `stationMeta` + `bitrate`

## Benefits

✅ **Standardized**: Same payload structure everywhere  
✅ **Simple**: No complex transformations  
✅ **Consistent**: INIT and TRACK_CHANGED use same format  
✅ **Universal**: Works for jukebox AND radio rooms  
✅ **Type-safe**: Complete TypeScript types  
✅ **Efficient**: Computed once, cached in Redis  
✅ **Clean**: Removed `makeJukeboxCurrentPayload()` complexity  

Now Playing info renders correctly for all room types! 🎵

