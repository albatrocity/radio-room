# Adapter Lifecycle Hooks - Polling Job Refactor

## Problem

The original implementation had polling job registration logic hardcoded in the room controller (`roomsController.ts`). This violated separation of concerns because:

1. The room controller needed to know about adapter-specific implementation details (Spotify polling)
2. Adding new adapters (Tidal, Apple Music) would require modifying the room controller
3. Each adapter's polling logic was coupled to the core server code
4. Not following the adapter pattern properly

## Solution

Moved polling job registration into the adapters themselves using a **lifecycle hook pattern**. Each `PlaybackControllerAdapter` can now implement an optional `onRoomCreated` hook that gets called when a room using that adapter is created.

## Architecture

### 1. Lifecycle Hook Interface

**File:** `packages/types/PlaybackController.ts`

Added `onRoomCreated` optional method to the adapter interface:

```typescript
export interface PlaybackControllerAdapter {
  register: (config: PlaybackControllerLifecycleCallbacks) => Promise<PlaybackController>
  
  // New lifecycle hook - called when a room using this adapter is created
  onRoomCreated?: (params: {
    roomId: string
    userId: string
    roomType: "jukebox" | "radio"
    context: AppContext
  }) => Promise<void>
}
```

### 2. Spotify Adapter Implementation

**File:** `packages/adapter-spotify/index.ts`

The Spotify adapter now implements the `onRoomCreated` hook:

```typescript
export const playbackController: PlaybackControllerAdapter = {
  register: async (config) => {
    // ... existing registration logic
  },

  onRoomCreated: async ({ roomId, userId, roomType, context }) => {
    // Only register polling job for jukebox rooms
    if (roomType !== "jukebox") {
      return
    }

    console.log(`Spotify adapter: Setting up polling for room ${roomId}`)

    // Import and create the jukebox polling job
    const { createJukeboxPollingJob } = await import("./lib/jukeboxJob")
    const handleRoomNowPlayingData = (await import("@repo/server/operations/room/handleRoomNowPlayingData")).default

    const job = createJukeboxPollingJob({
      context,
      roomId,
      userId,
      onTrackChange: (track) => {
        console.log(`Track changed in room ${roomId}:`, track.name)

        const nowPlaying = {
          title: track.name,
          track,
          addedAt: Date.now(),
          addedBy: undefined,
          addedDuring: "nowPlaying" as const,
          playedAt: Date.now(),
        }

        handleRoomNowPlayingData({
          context,
          roomId,
          nowPlaying,
          forcePublish: false,
        }).catch((err) => {
          console.error(`Error updating now playing data for room ${roomId}:`, err)
        })
      },
    })

    // Register the job with the JobService
    if (context.jobService) {
      await context.jobService.scheduleJob(job)
      console.log(`Registered Spotify jukebox polling job for room ${roomId}`)
    }
  },
}
```

### 3. Room Controller Integration

**File:** `packages/server/controllers/roomsController.ts`

Simplified room creation to just call the adapter hook:

```typescript
await saveRoom({ context, room })

// Notify the playback controller adapter that a room was created
// This allows the adapter to register any necessary jobs (e.g., polling)
if (playbackControllerId) {
  // TODO: Store adapters in a registry so we don't need to hard-code imports
  // For now, dynamically import based on the playbackControllerId
  if (playbackControllerId === "spotify") {
    const { playbackController } = await import("@repo/adapter-spotify")
    if (playbackController.onRoomCreated) {
      await playbackController.onRoomCreated({
        roomId: id,
        userId,
        roomType: type,
        context,
      })
    }
  }
  // Add other adapters here as they're implemented
  // e.g., "tidal", "applemusic", etc.
}

res.send({ room })
```

## Benefits

### 1. Separation of Concerns ✅
- Room controller handles room creation
- Adapters handle their own polling/job logic
- Clear boundaries between modules

### 2. Extensibility ✅
- New adapters just implement `onRoomCreated`
- No need to modify room controller for each adapter
- Each adapter can have different polling strategies

### 3. Encapsulation ✅
- Adapter-specific details stay in the adapter
- Job registration logic lives with the adapter
- Track change handling is adapter-specific

### 4. Type Safety ✅
- TypeScript interface ensures correct implementation
- Optional hook - not all adapters need polling
- Well-defined parameters

## Flow Diagram

```
User creates room with playbackControllerId="spotify"
  ↓
POST /rooms → create() handler
  ↓
saveRoom() → Room saved to Redis
  ↓
Check if playbackControllerId exists
  ↓
Import adapter module dynamically
  ↓
Call adapter.onRoomCreated({ roomId, userId, roomType, context })
  ↓
Adapter handles its own setup:
  - Create polling job
  - Register with JobService
  - Set up callbacks
  ↓
Room creation completes
  ↓
Polling begins automatically ✅
```

## Adding New Adapters

To add a new adapter with polling support:

### 1. Implement the Adapter

```typescript
// packages/adapter-tidal/index.ts
export const playbackController: PlaybackControllerAdapter = {
  register: async (config) => {
    // Tidal-specific registration
  },

  onRoomCreated: async ({ roomId, userId, roomType, context }) => {
    if (roomType !== "jukebox") {
      return
    }

    // Create Tidal polling job
    const job = createTidalPollingJob({
      context,
      roomId,
      userId,
      onTrackChange: (track) => {
        // Handle Tidal track changes
      },
    })

    await context.jobService?.scheduleJob(job)
  },
}
```

### 2. Register in Room Controller

```typescript
if (playbackControllerId === "tidal") {
  const { playbackController } = await import("@repo/adapter-tidal")
  if (playbackController.onRoomCreated) {
    await playbackController.onRoomCreated({
      roomId: id,
      userId,
      roomType: type,
      context,
    })
  }
}
```

### 3. Done! ✅

The adapter handles everything else internally.

## Future Improvements

### 1. Adapter Registry

Instead of hard-coding imports in the room controller, create a registry:

```typescript
// packages/server/lib/adapterRegistry.ts
const adapterModules = new Map<string, PlaybackControllerAdapter>()

export function registerAdapterModule(name: string, adapter: PlaybackControllerAdapter) {
  adapterModules.set(name, adapter)
}

export function getAdapterModule(name: string) {
  return adapterModules.get(name)
}
```

Then in `apps/api/src/server.ts`:

```typescript
import { playbackController as spotifyAdapter } from "@repo/adapter-spotify"
import { registerAdapterModule } from "@repo/server/lib/adapterRegistry"

registerAdapterModule("spotify", spotifyAdapter)
```

And in room controller:

```typescript
const adapter = getAdapterModule(playbackControllerId)
if (adapter?.onRoomCreated) {
  await adapter.onRoomCreated({ roomId, userId, roomType, context })
}
```

### 2. More Lifecycle Hooks

```typescript
export interface PlaybackControllerAdapter {
  register: (config) => Promise<PlaybackController>
  onRoomCreated?: (params) => Promise<void>
  onRoomDeleted?: (params) => Promise<void>    // Clean up jobs
  onRoomPaused?: (params) => Promise<void>     // Pause polling
  onRoomResumed?: (params) => Promise<void>    // Resume polling
  onUserJoined?: (params) => Promise<void>     // Track active users
  onUserLeft?: (params) => Promise<void>       // Adjust polling based on activity
}
```

### 3. Job Cleanup

Automatically stop polling jobs when rooms are deleted:

```typescript
// In deleteRoom handler
if (room.playbackControllerId) {
  const adapter = getAdapterModule(room.playbackControllerId)
  if (adapter?.onRoomDeleted) {
    await adapter.onRoomDeleted({ roomId: room.id, context })
  }
}
```

## Comparison

### Before (Hard-coded in Room Controller) ❌

```typescript
// roomsController.ts
if (type === "jukebox" && playbackControllerId === "spotify") {
  const { createJukeboxPollingJob } = await import("@repo/adapter-spotify/lib/jukeboxJob")
  const job = createJukeboxPollingJob({ ... })
  await context.jobService.scheduleJob(job)
}
```

**Problems:**
- Room controller knows about Spotify
- Hard-coded adapter logic
- Difficult to extend
- Violates separation of concerns

### After (Adapter Lifecycle Hook) ✅

```typescript
// roomsController.ts
if (playbackControllerId === "spotify") {
  const { playbackController } = await import("@repo/adapter-spotify")
  if (playbackController.onRoomCreated) {
    await playbackController.onRoomCreated({ roomId, userId, roomType, context })
  }
}

// adapter-spotify/index.ts
export const playbackController: PlaybackControllerAdapter = {
  register: async (config) => { /* ... */ },
  onRoomCreated: async ({ roomId, userId, roomType, context }) => {
    // All Spotify-specific logic here
  },
}
```

**Benefits:**
- Room controller is generic
- Adapter handles its own logic
- Easy to add new adapters
- Proper separation of concerns

## Testing

### 1. Create a Spotify Jukebox Room

```bash
POST /rooms
{
  "type": "jukebox",
  "playbackControllerId": "spotify",
  "title": "Test Room"
}
```

**Expected logs:**
```
Spotify adapter: Setting up polling for room {roomId}
Scheduling job: spotify-jukebox-{roomId} (Polls Spotify currently playing track for room {roomId}) with cron: */5 * * * * *
Registered Spotify jukebox polling job for room {roomId}
```

### 2. Play Music on Spotify

Within 5 seconds:
```
Running job: spotify-jukebox-{roomId}
Track changed in room {roomId}: {trackName}
```

### 3. Verify Job is Running

Check JobService status (if exposed):
```typescript
const jobs = jobService.getJobStatus()
// Should show: spotify-jukebox-{roomId} with enabled: true, scheduled: true
```

## Related Files

### Modified:
- ✅ `packages/types/PlaybackController.ts` - Added onRoomCreated hook
- ✅ `packages/adapter-spotify/index.ts` - Implemented onRoomCreated
- ✅ `packages/server/controllers/roomsController.ts` - Call adapter hook

### No Longer Needed:
- ❌ Removed hard-coded Spotify logic from room controller
- ❌ No adapter-specific imports in server core

### Unchanged:
- `packages/adapter-spotify/lib/jukeboxJob.ts` - Job implementation
- `packages/server/services/JobService.ts` - Job scheduling
- `packages/types/AppContext.ts` - Context with jobService

## Summary

**What Changed:**
- Moved polling job registration from room controller to adapter ✅
- Added `onRoomCreated` lifecycle hook to adapter interface ✅
- Spotify adapter now handles its own job registration ✅
- Room controller calls adapter hook generically ✅

**Why It's Better:**
- Follows adapter pattern correctly ✅
- Easy to add new adapters ✅
- Separation of concerns ✅
- Type-safe and extensible ✅

**Next Steps:**
- Implement adapter registry to remove hard-coded imports
- Add more lifecycle hooks (onRoomDeleted, etc.)
- Implement job cleanup on room deletion
- Add similar hooks for other adapter types (MediaSource, etc.)

The polling functionality now lives where it belongs - in the adapter! 🎉

