# Job Restoration on Server Restart

## Problem

When the server restarts, all dynamically registered adapter jobs (like jukebox polling jobs) are cleared from memory. This means:
- Existing jukebox rooms stop getting "now playing" updates
- Users don't see track changes until they create a new room
- The polling job only exists for newly created rooms, not existing ones

## Solution

Added a `restoreAdapterJobs()` method to `RadioRoomServer` that:
1. Runs during server startup (after system jobs, before JobService starts)
2. Queries Redis for all existing room IDs
3. For each room, checks if it has a `playbackControllerId`
4. Calls the adapter's `onRoomCreated` hook to re-register polling jobs

## Implementation

### Server Startup Flow

```typescript
async start() {
  // ... initialize Redis, Socket.IO, etc ...
  
  // Register initial system jobs (cleanup, token refresh)
  await this.registerSystemJobs()
  
  // ✅ NEW: Restore adapter jobs for existing rooms
  await this.restoreAdapterJobs()
  
  // Start job service (now includes restored jobs)
  await this.jobService.start()
}
```

### Restore Logic

```typescript
async restoreAdapterJobs() {
  const roomIds = await this.context.redis.pubClient.sMembers("rooms")
  
  for (const roomId of roomIds) {
    const room = await findRoom({ context: this.context, roomId })
    
    if (room?.playbackControllerId) {
      const adapter = this.context.adapters.playbackControllerModules.get(
        room.playbackControllerId
      )
      
      if (adapter?.onRoomCreated) {
        await adapter.onRoomCreated({
          roomId,
          userId: room.creator,
          roomType: room.type,
          context: this.context,
        })
      }
    }
  }
}
```

### Duplicate Prevention

Added a check in the Spotify adapter to prevent duplicate job registration:

```typescript
onRoomCreated: async ({ roomId, userId, roomType, context }) => {
  const job = createJukeboxPollingJob({ ... })
  
  // ✅ Check if job already exists
  const existingJob = context.jobs.find((j) => j.name === job.name)
  if (existingJob) {
    console.log(`Job already registered, skipping`)
    return
  }
  
  await context.jobService.scheduleJob(job)
}
```

## Benefits

✅ Jukebox rooms continue working after server restart
✅ No manual intervention needed
✅ Works for all adapters that implement `onRoomCreated`
✅ Prevents duplicate job registration
✅ Graceful error handling per room

## Testing

1. Create a jukebox room
2. Verify "now playing" updates are working
3. Restart the API server
4. Verify "now playing" updates continue working without creating a new room
5. Check logs for: "Restoring spotify jobs for room X (jukebox)"
6. Verify no duplicate jobs using `/debug/jobs` endpoint

