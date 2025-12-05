# Room Deletion Cleanup - Job Lifecycle Management

## Problem

When rooms were deleted (either manually or via expiration), the polling jobs continued running indefinitely, wasting resources and potentially causing errors when trying to update non-existent rooms.

## Solution

Implemented an `onRoomDeleted` lifecycle hook that allows adapters to clean up their resources (jobs, connections, etc.) when a room is deleted.

## Implementation

### 1. Added Cleanup Lifecycle Hook

**File:** `packages/types/PlaybackController.ts`

Added `onRoomDeleted` to the adapter interface:

```typescript
export interface PlaybackControllerAdapter {
  register: (config: PlaybackControllerLifecycleCallbacks) => Promise<PlaybackController>
  
  onRoomCreated?: (params: {
    roomId: string
    userId: string
    roomType: "jukebox" | "radio"
    context: AppContext
  }) => Promise<void>
  
  // New: Cleanup hook when room is deleted
  onRoomDeleted?: (params: {
    roomId: string
    context: AppContext
  }) => Promise<void>
}
```

### 2. Added disableJob to JobService Interface

**File:** `packages/types/AppContext.ts`

Exposed `disableJob` method on the jobService:

```typescript
export interface AppContext {
  redis: RedisContext
  adapters: AdapterRegistry
  jobs: JobRegistration[]
  jobService?: {
    scheduleJob: (job: JobRegistration) => Promise<void>
    disableJob: (jobName: string) => void  // ✅ Added
    stop: () => Promise<void>
  }
}
```

### 3. Implemented Cleanup in Spotify Adapter

**File:** `packages/adapter-spotify/index.ts`

The Spotify adapter now stops its polling job when a room is deleted:

```typescript
export const playbackController: PlaybackControllerAdapter = {
  register: async (config) => { /* ... */ },
  
  onRoomCreated: async ({ roomId, userId, roomType, context }) => {
    // Start polling job
    const jobName = `spotify-jukebox-${roomId}`
    await context.jobService?.scheduleJob(job)
  },
  
  onRoomDeleted: async ({ roomId, context }) => {
    console.log(`Spotify adapter: Cleaning up polling for room ${roomId}`)

    // Stop the polling job for this room
    const jobName = `spotify-jukebox-${roomId}`
    if (context.jobService) {
      context.jobService.disableJob(jobName)
      console.log(`Stopped Spotify jukebox polling job for room ${roomId}`)
    }
  },
}
```

### 4. Integrated Hook into Room Deletion

**File:** `packages/server/operations/data/rooms.ts`

The `deleteRoom` operation now calls the adapter's cleanup hook:

```typescript
export async function deleteRoom({ context, roomId }: DeleteRoomParams) {
  const room = await findRoom({ context, roomId })
  if (!room) {
    return
  }

  // Notify the playback controller adapter that the room is being deleted
  // This allows the adapter to clean up any jobs or resources (e.g., stop polling)
  if (room.playbackControllerId) {
    const adapter = context.adapters.playbackControllerModules.get(room.playbackControllerId)
    if (adapter?.onRoomDeleted) {
      try {
        await adapter.onRoomDeleted({ roomId, context })
      } catch (error) {
        console.error(`Error calling onRoomDeleted for adapter ${room.playbackControllerId}:`, error)
      }
    }
  }

  // Get all keys relating to room
  const keys = await getAllRoomDataKeys({ context, roomId })
  // delete them
  await Promise.all(keys.map((k) => context.redis.pubClient.unlink(k)))
  // remove room from room list and user's room list
  await removeRoomFromRoomList({ context, roomId: room.id })
  await removeRoomFromUserRoomList({ context, room })
  await context.redis.pubClient.publish(PUBSUB_ROOM_DELETED, roomId)
}
```

## How It Works

### Room Deletion Flow

```
Room deletion triggered (manual or automatic)
  ↓
deleteRoom() operation called
  ↓
Retrieve room details
  ↓
Call adapter.onRoomDeleted({ roomId, context })
  ↓
Adapter stops polling job via context.jobService.disableJob()
  ↓
Job removed from scheduler
  ↓
Delete room data from Redis
  ↓
Publish room deletion event
  ↓
Cleanup complete ✅
```

### JobService.disableJob()

**What it does:**
1. Finds the job by name
2. Sets `job.enabled = false`
3. Calls `task.stop()` to stop the cron schedule
4. Removes job from the scheduled jobs map

**Code:**
```typescript
disableJob(jobName: string) {
  const job = this.context.jobs.find((j) => j.name === jobName)
  if (job) {
    job.enabled = false
    const task = this.scheduledJobs.get(jobName)
    if (task) {
      task.stop()  // Stop the cron task
      this.scheduledJobs.delete(jobName)  // Remove from registry
    }
  }
}
```

## Benefits

### 1. Resource Management ✅
- Polling jobs stop when rooms are deleted
- No orphaned jobs consuming CPU/memory
- No unnecessary Spotify API calls

### 2. Error Prevention ✅
- Jobs won't try to update non-existent rooms
- Prevents Redis errors from missing keys
- Clean separation of concerns

### 3. Scalability ✅
- System can handle many room creations/deletions
- Resources freed up immediately
- No manual cleanup required

### 4. Extensibility ✅
- Works for any adapter that implements the hook
- Easy to add other cleanup tasks (close connections, etc.)
- Consistent pattern across all adapters

## Deletion Scenarios

### 1. Manual Deletion

**Triggered by:** User clicking "Delete Room" button

**Flow:**
```
DELETE /rooms/:id
  ↓
HTTP handler: deleteRoom(req, res)
  ↓
Operation: deleteRoom({ context, roomId })
  ↓
Adapter cleanup: adapter.onRoomDeleted({ roomId, context })
  ↓
Job stopped ✅
```

### 2. Automatic Expiration

**Triggered by:** Cleanup job when room is empty

**Flow:**
```
Cron job runs every minute
  ↓
cleanupRoom(context, roomId)
  ↓
Room creator offline & not persistent & TTL expired
  ↓
Operation: deleteRoom({ context, roomId })
  ↓
Adapter cleanup: adapter.onRoomDeleted({ roomId, context })
  ↓
Job stopped ✅
```

### 3. User Account Deletion

**Triggered by:** Deleting all of a user's rooms

**Flow:**
```
nukeUserRooms({ context, userId })
  ↓
Get all user's rooms
  ↓
For each room:
  ↓
  Operation: deleteRoom({ context, roomId })
  ↓
  Adapter cleanup: adapter.onRoomDeleted({ roomId, context })
  ↓
All jobs stopped ✅
```

## Testing

### 1. Manual Deletion

```bash
# Create a room
POST /rooms { "type": "jukebox", "playbackControllerId": "spotify" }

# Wait for job to start
# Check logs: "Registered Spotify jukebox polling job for room {roomId}"

# Delete the room
DELETE /rooms/{roomId}

# Check logs: "Stopped Spotify jukebox polling job for room {roomId}"

# Verify job is gone
# Job should no longer appear in scheduled jobs list
```

### 2. Automatic Cleanup

```bash
# Create a room and leave it
POST /rooms { "type": "jukebox", "playbackControllerId": "spotify" }

# Disconnect all users (room becomes empty)

# Wait for cleanup job to run (runs every minute)

# Check logs: "Spotify adapter: Cleaning up polling for room {roomId}"

# Verify job stopped and room deleted
```

### 3. Verify No Orphaned Jobs

```typescript
// Check JobService status
const status = jobService.getJobStatus()
const orphanedJobs = status.filter(job => 
  job.name.startsWith('spotify-jukebox-') && 
  job.scheduled
)

// Should be 0 after all rooms are deleted
expect(orphanedJobs.length).toBe(0)
```

## Error Handling

The cleanup is wrapped in try-catch to prevent deletion from failing if cleanup errors occur:

```typescript
if (adapter?.onRoomDeleted) {
  try {
    await adapter.onRoomDeleted({ roomId, context })
  } catch (error) {
    console.error(`Error calling onRoomDeleted for adapter ${room.playbackControllerId}:`, error)
    // Deletion continues even if cleanup fails
  }
}
```

**Why:** Room data should still be deleted even if job cleanup fails, preventing stuck rooms.

## Future Enhancements

### 1. Batch Cleanup

For deleting multiple rooms efficiently:

```typescript
async onRoomsDeleted({ roomIds, context }: {
  roomIds: string[]
  context: AppContext
}) {
  // Batch stop all jobs at once
  const jobNames = roomIds.map(id => `spotify-jukebox-${id}`)
  jobNames.forEach(name => context.jobService?.disableJob(name))
}
```

### 2. Cleanup Verification

Track cleanup success:

```typescript
onRoomDeleted: async ({ roomId, context }) => {
  const jobName = `spotify-jukebox-${roomId}`
  context.jobService?.disableJob(jobName)
  
  // Verify job was actually stopped
  const stillScheduled = context.jobService?.getJobStatus()
    .some(j => j.name === jobName && j.scheduled)
  
  if (stillScheduled) {
    console.error(`Failed to stop job ${jobName}`)
  }
}
```

### 3. Resource Tracking

Add metrics to monitor cleanup:

```typescript
// Track active polling jobs per adapter
context.metrics?.gauge('adapter.spotify.active_jobs', activeJobCount)
context.metrics?.increment('adapter.spotify.room_deleted')
```

### 4. Graceful Shutdown

Allow jobs to finish their current iteration:

```typescript
onRoomDeleted: async ({ roomId, context }) => {
  const jobName = `spotify-jukebox-${roomId}`
  
  // Mark for deletion but let current iteration finish
  context.jobService?.markForDeletion(jobName)
  
  // Wait up to 5 seconds for job to finish
  await waitForJobCompletion(jobName, 5000)
  
  // Force stop if still running
  context.jobService?.disableJob(jobName)
}
```

## Complete Lifecycle

```
Room Lifecycle with Job Management:

CREATE ROOM
  ↓
  adapter.onRoomCreated()
  ↓
  Job registered & starts polling
  ↓
ROOM ACTIVE
  ↓
  Job polls every 5 seconds
  ↓
  Track changes detected
  ↓
  Room state updated
  ↓
DELETE ROOM (manual or automatic)
  ↓
  adapter.onRoomDeleted()
  ↓
  Job disabled & removed
  ↓
  Room data deleted
  ↓
CLEANUP COMPLETE ✅
```

## Related Files

### Modified:
- ✅ `packages/types/PlaybackController.ts` - Added onRoomDeleted hook
- ✅ `packages/types/AppContext.ts` - Added disableJob to jobService
- ✅ `packages/adapter-spotify/index.ts` - Implemented onRoomDeleted
- ✅ `packages/server/operations/data/rooms.ts` - Call adapter cleanup

### Referenced:
- `packages/server/services/JobService.ts` - Job management
- `packages/server/jobs/rooms/cleanupRooms.ts` - Automatic cleanup
- `packages/server/controllers/roomsController.ts` - Manual deletion

## Summary

**Before:** ❌
- Polling jobs ran indefinitely after room deletion
- Wasted resources on non-existent rooms
- Potential errors from missing room data

**After:** ✅
- Jobs automatically stopped when rooms deleted
- Clean resource management
- Works for both manual and automatic deletion
- Extensible to all adapters

The room lifecycle is now complete with proper job cleanup! 🎉

