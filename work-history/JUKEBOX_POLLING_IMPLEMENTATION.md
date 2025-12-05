# Jukebox Polling Implementation

## Issue

After room creation, the room wasn't reflecting what's currently playing on the user's Spotify account. The jukebox polling job existed but was never being registered when rooms were created.

## Root Cause

The `createJukeboxPollingJob` function existed in `packages/adapter-spotify/lib/jukeboxJob.ts` but was never called or registered with the JobService when a jukebox room was created.

## Solution Overview

Implemented automatic job registration when creating Spotify jukebox rooms:

1. **Detect jukebox room creation** with Spotify as playbackController
2. **Register polling job** that checks Spotify every 5 seconds
3. **Update room state** when track changes are detected
4. **Publish changes** to all connected clients via Redis PubSub

## Implementation Details

### 1. Made JobService Accessible in Context

**File:** `packages/types/AppContext.ts`

Added `jobService` to the AppContext interface:

```typescript
export interface AppContext {
  redis: RedisContext
  adapters: AdapterRegistry
  jobs: JobRegistration[]
  jobService?: {
    scheduleJob: (job: JobRegistration) => Promise<void>
    stop: () => Promise<void>
  }
}
```

### 2. Made scheduleJob Public

**File:** `packages/server/services/JobService.ts`

Changed `scheduleJob` from private to public and made it async:

```typescript
// Before: private scheduleJob(job: JobRegistration) {
// After:
async scheduleJob(job: JobRegistration) {
  // ... implementation
}
```

This allows external code (like room creation) to register jobs dynamically.

### 3. Added JobService to Context

**File:** `packages/server/index.ts`

Made JobService accessible via context:

```typescript
// Create context with adapters and jobs
this.context = createAppContext(config.REDIS_URL ?? "redis://localhost:6379")

// Initialize JobService
this.jobService = new JobService(this.context, this.cacheImplementation)

// Add jobService to context so it's accessible everywhere
this.context.jobService = this.jobService
```

### 4. Registered Job on Room Creation

**File:** `packages/server/controllers/roomsController.ts`

Added job registration after saving a Spotify jukebox room:

```typescript
await saveRoom({ context, room })

// Register jukebox polling job if this is a Spotify jukebox room
if (type === "jukebox" && playbackControllerId === "spotify") {
  const { createJukeboxPollingJob } = await import("@repo/adapter-spotify/lib/jukeboxJob")
  
  const job = createJukeboxPollingJob({
    context,
    roomId: id,
    userId: userId,
    onTrackChange: (track) => {
      console.log(`Track changed in room ${id}:`, track.name)
      
      // Transform track to QueueItem format
      const nowPlaying = {
        title: track.name,
        track,
        addedAt: Date.now(),
        addedBy: undefined,
        addedDuring: "nowPlaying" as const,
        playedAt: Date.now(),
      }
      
      // Update room's now playing data - fire and forget
      handleRoomNowPlayingData({
        context,
        roomId: id,
        nowPlaying,
        forcePublish: false,
      }).catch((err) => {
        console.error(`Error updating now playing data for room ${id}:`, err)
      })
    },
  })
  
  // Register the job with the JobService
  if (context.jobService) {
    await context.jobService.scheduleJob(job)
    console.log(`Registered jukebox polling job for room ${id}`)
  }
}
```

### 5. Exported Job Creator

**File:** `packages/adapter-spotify/index.ts`

Exported the job creator function:

```typescript
export { createJukeboxPollingJob } from "./lib/jukeboxJob"
```

## How It Works

### Job Lifecycle

```
User creates room
  ↓
POST /rooms → create() handler
  ↓
saveRoom() → Room saved to Redis
  ↓
Check: type === "jukebox" && playbackControllerId === "spotify"
  ↓
createJukeboxPollingJob() → Job definition created
  ↓
context.jobService.scheduleJob(job) → Job scheduled
  ↓
Cron runs every 5 seconds
  ↓
Poll Spotify API for currently playing track
  ↓
Track changed? → Call onTrackChange callback
  ↓
handleRoomNowPlayingData() → Update Redis + Publish to PubSub
  ↓
All connected clients receive update 🎉
```

### Job Details

**Cron Schedule:** `*/5 * * * * *` (every 5 seconds)

**What the job does:**
1. Retrieves user's Spotify credentials from Redis
2. Creates Spotify API client with access token
3. Calls `spotifyApi.player.getCurrentlyPlayingTrack()`
4. Compares current track ID with cached last track ID
5. If different, triggers `onTrackChange` callback
6. Updates cache with new track ID

**Handled Cases:**
- No Spotify auth found → Log error and skip
- Rate limiting (429) → Log warning
- Other errors → Log error with details
- Track changes → Update room state and notify clients

### Data Flow

```typescript
// Spotify API Response
{
  item: {
    id: "track-id",
    name: "Track Name",
    artists: [...],
    album: {...},
    // ... more track data
  },
  is_playing: true
}

// Transformed to QueueItem
{
  title: "Track Name",
  track: {
    id: "track-id",
    name: "Track Name",
    // ... MetadataSourceTrack format
  },
  addedAt: Date.now(),
  addedBy: undefined,
  addedDuring: "nowPlaying",
  playedAt: Date.now()
}

// Stored in Redis
room:{roomId}:current → {
  nowPlaying: { ... },
  lastUpdatedAt: "timestamp"
}

// Published to PubSub
channel: "jukebox:{roomId}"
message: {
  type: "META",
  data: {
    nowPlaying: { ... },
    // ... room metadata
  }
}
```

## Benefits

### 1. Automatic Registration
- No manual job setup required
- Jobs created only when needed
- Room-specific job instances

### 2. Per-Room Isolation
- Each room has its own polling job
- Independent polling schedules
- Room-specific user credentials

### 3. Real-Time Updates
- 5-second polling interval
- Immediate track change detection
- PubSub broadcasts to all clients

### 4. Clean Architecture
- Job definition in adapter package
- Registration in room controller
- Context provides access to JobService

## Testing

To verify the implementation:

1. **Create a Spotify jukebox room**
   ```bash
   POST /rooms
   {
     "type": "jukebox",
     "playbackControllerId": "spotify",
     "title": "My Room",
     // ... other fields
   }
   ```

2. **Check logs for job registration**
   ```
   Scheduling job: spotify-jukebox-{roomId} (Polls Spotify currently playing track for room {roomId}) with cron: */5 * * * * *
   Registered jukebox polling job for room {roomId}
   ```

3. **Play music on Spotify**
   - Start playback on your Spotify account
   - Within 5 seconds, room should update

4. **Verify Redis updates**
   ```bash
   redis-cli
   > HGETALL room:{roomId}:current
   # Should show nowPlaying data
   ```

5. **Verify client receives updates**
   - Connect to room via Socket.IO
   - Listen for `event` with type `META`
   - Should receive track info every 5 seconds

## Edge Cases Handled

### 1. No Spotify Auth
```typescript
if (!auth) {
  console.error(`No Spotify auth found for user ${userId}`)
  return
}
```

### 2. Rate Limiting
```typescript
if (error.status === 429) {
  console.warn(`Spotify rate limited for room ${roomId}`)
  // Job continues to run, will retry in 5 seconds
}
```

### 3. Track Not Changed
```typescript
if (lastTrackId !== currentTrackId) {
  // Only update if track actually changed
  onTrackChange(track)
}
```

### 4. No Track Playing
```typescript
if (nowPlaying && nowPlaying.item && "id" in nowPlaying.item) {
  // Only process if there's actually a track
}
```

## Future Enhancements

### 1. Dynamic Polling Interval
- Faster polling when room is active
- Slower polling when room is idle
- Based on user count or activity

### 2. Backoff on Errors
- Exponential backoff for rate limits
- Retry logic for transient errors
- Circuit breaker pattern

### 3. Job Cleanup
- Stop job when room is deleted
- Stop job when room is empty
- Resume job when users rejoin

### 4. Multiple Service Support
- Similar pattern for Apple Music
- Similar pattern for Tidal
- Generic polling interface

## Related Files

### Modified:
- ✅ `packages/types/AppContext.ts` - Added jobService to context
- ✅ `packages/server/services/JobService.ts` - Made scheduleJob public
- ✅ `packages/server/index.ts` - Added jobService to context
- ✅ `packages/server/controllers/roomsController.ts` - Register job on room creation
- ✅ `packages/adapter-spotify/index.ts` - Export createJukeboxPollingJob

### Referenced:
- `packages/adapter-spotify/lib/jukeboxJob.ts` - Job implementation
- `packages/server/operations/room/handleRoomNowPlayingData.ts` - Update room state
- `packages/server/operations/data/serviceAuthentications.ts` - Get user auth

## Summary

**Before:**
- Jukebox job existed but was never registered ❌
- Rooms didn't reflect currently playing track ❌
- Manual job registration required ❌

**After:**
- Jobs automatically registered on room creation ✅
- Spotify tracks update every 5 seconds ✅
- Real-time sync with user's playback ✅

The jukebox feature now works as intended, automatically syncing the room's "now playing" state with the room creator's Spotify account! 🎉

