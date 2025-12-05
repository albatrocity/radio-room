# Job Registration Fix

## Problem

When checking the `/debug/jobs` endpoint, it returned:
```json
{"totalJobs":0,"jobs":[]}
```

Even though:
1. JobService was starting correctly
2. Room polling jobs were being scheduled when rooms were created
3. The jobs were actually running (cron tasks executing)

## Root Causes

### Issue 1: Initial Jobs Not Registered
The rooms cleanup/maintenance job existed in `packages/server/jobs/rooms/index.ts` but was never registered at server startup.

### Issue 2: Dynamic Jobs Not Added to Array
When `context.jobService.scheduleJob()` was called (e.g., when creating a room), it:
- ✅ Created a cron task
- ✅ Started the task
- ✅ Added to `scheduledJobs` map
- ❌ Did NOT add to `context.jobs` array

Since `getJobStatus()` reads from `context.jobs` array, dynamically scheduled jobs were invisible.

## Solutions

### Fix 1: Register System Jobs at Startup

**File:** `packages/server/index.ts`

Added a new method to register initial system jobs:

```typescript
async registerSystemJobs() {
  // Register rooms cleanup job
  const roomsJobHandler = (await import("./jobs/rooms/index")).default
  const roomsJob = {
    name: "rooms",
    description: "Maintains rooms - cleanup and token refresh",
    cron: "0 * * * * *", // Every minute
    enabled: true,
    runAt: Date.now(),
    handler: roomsJobHandler,
  }
  this.context.jobs.push(roomsJob)
  console.log("Registered system job: rooms")
}
```

Called before starting JobService:

```typescript
async start() {
  // ... socket setup

  bindPubSubHandlers(this.io, this.context)

  // Register initial system jobs
  await this.registerSystemJobs()  // ✅ NEW

  // Start job service
  await this.jobService.start()

  this.onStart()
}
```

### Fix 2: Add Jobs to Array When Scheduling

**File:** `packages/server/services/JobService.ts`

Updated `scheduleJob()` to add jobs to `context.jobs` array:

```typescript
async scheduleJob(job: JobRegistration) {
  try {
    // Validate cron expression
    if (!cron.validate(job.cron)) {
      console.error(`Invalid cron expression for job ${job.name}: ${job.cron}`)
      return
    }

    // ✅ Add job to context.jobs array if not already present
    const existingJob = this.context.jobs.find((j) => j.name === job.name)
    if (!existingJob) {
      this.context.jobs.push(job)
    }

    console.log(`Scheduling job: ${job.name} (${job.description}) with cron: ${job.cron}`)

    // ... rest of scheduling logic
  }
}
```

## How It Works Now

### Startup Flow

```
Server starts
  ↓
registerSystemJobs() called
  ↓
System jobs added to context.jobs[]
  ↓
JobService.start() called
  ↓
Loops through context.jobs[]
  ↓
Schedules each job with cron
  ↓
System jobs now running ✅
```

### Room Creation Flow

```
Room created with playbackControllerId="spotify"
  ↓
adapter.onRoomCreated() called
  ↓
createJukeboxPollingJob() creates job definition
  ↓
context.jobService.scheduleJob(job) called
  ↓
Job added to context.jobs[] (if not exists)
  ↓
Job scheduled with cron
  ↓
Room polling job now running ✅
```

### Job Status Visibility

```
GET /debug/jobs
  ↓
jobService.getJobStatus() called
  ↓
Reads from context.jobs[]
  ↓
Returns all jobs (system + dynamic) ✅
```

## Verification

After these fixes, `/debug/jobs` will return:

```json
{
  "totalJobs": 2,
  "jobs": [
    {
      "name": "rooms",
      "description": "Maintains rooms - cleanup and token refresh",
      "cron": "0 * * * * *",
      "enabled": true,
      "scheduled": true
    },
    {
      "name": "spotify-jukebox-abc123",
      "description": "Polls Spotify currently playing track for room abc123",
      "cron": "*/5 * * * * *",
      "enabled": true,
      "scheduled": true
    }
  ]
}
```

## Testing

### 1. Restart the API server

```bash
docker-compose restart api
```

### 2. Check jobs on startup

```bash
curl http://localhost:3000/debug/jobs
```

Should see the "rooms" job:
```json
{
  "totalJobs": 1,
  "jobs": [
    {
      "name": "rooms",
      "description": "Maintains rooms - cleanup and token refresh",
      "cron": "0 * * * * *",
      "enabled": true,
      "scheduled": true
    }
  ]
}
```

### 3. Create a room

Create a Spotify jukebox room through the UI or API.

### 4. Check jobs again

```bash
curl http://localhost:3000/debug/jobs
```

Should now see both jobs:
```json
{
  "totalJobs": 2,
  "jobs": [
    {
      "name": "rooms",
      ...
    },
    {
      "name": "spotify-jukebox-{roomId}",
      "description": "Polls Spotify currently playing track for room {roomId}",
      "cron": "*/5 * * * * *",
      "enabled": true,
      "scheduled": true
    }
  ]
}
```

### 5. Verify jobs are running

Check logs:
```bash
docker-compose logs -f api | grep -E "Running job|Track changed"
```

Every minute:
```
Running job: rooms
```

Every 5 seconds (for your room):
```
Running job: spotify-jukebox-{roomId}
```

When track changes:
```
Track changed in room {roomId}: Song Name
```

## System Jobs

Currently registered system jobs:

| Job Name | Description | Schedule | Function |
|----------|-------------|----------|----------|
| `rooms` | Maintains all rooms | Every minute | Refreshes service tokens, cleans up expired rooms |

## Dynamic Jobs

Jobs registered when events occur:

| Job Pattern | Description | Schedule | Trigger |
|-------------|-------------|----------|---------|
| `spotify-jukebox-{roomId}` | Polls Spotify for track changes | Every 5 seconds | Room created with Spotify playback |

## Benefits

### 1. Visibility ✅
- All jobs visible via `/debug/jobs` endpoint
- Can see what's running, what's scheduled
- Easier to debug and monitor

### 2. Consistency ✅
- System jobs and dynamic jobs handled the same way
- Single source of truth: `context.jobs` array
- `getJobStatus()` reflects reality

### 3. Debugging ✅
- Can verify jobs are registered
- Can see job configurations
- Can check scheduled vs. enabled status

### 4. Maintainability ✅
- Clear separation: `registerSystemJobs()` for startup jobs
- Dynamic jobs added via `scheduleJob()`
- Easy to add new system jobs

## Future Improvements

### 1. Job Management Endpoints

Add more debug/admin endpoints:

```typescript
// Enable/disable a job
POST /debug/jobs/:name/enable
POST /debug/jobs/:name/disable

// Trigger a job manually
POST /debug/jobs/:name/run

// Get job execution history
GET /debug/jobs/:name/history
```

### 2. Job Execution Tracking

Track when jobs run and if they succeed:

```typescript
interface JobExecution {
  jobName: string
  startTime: number
  endTime: number
  success: boolean
  error?: string
}

// Store in Redis or memory
const jobExecutions: JobExecution[] = []
```

### 3. Job Health Monitoring

Alert when jobs fail or don't run:

```typescript
// Check if jobs are running as expected
if (lastRunTime + expectedInterval * 2 < Date.now()) {
  console.error(`Job ${jobName} hasn't run in ${timeSinceLastRun}ms`)
  // Send alert
}
```

### 4. Job Dependencies

Allow jobs to depend on other jobs:

```typescript
{
  name: "job-b",
  dependsOn: ["job-a"],
  handler: async () => {
    // Only runs after job-a completes
  }
}
```

## Related Files

### Modified:
- ✅ `packages/server/services/JobService.ts` - Add jobs to array when scheduling
- ✅ `packages/server/index.ts` - Register system jobs, add debug endpoint

### Related:
- `packages/server/jobs/rooms/index.ts` - Rooms maintenance job
- `packages/adapter-spotify/lib/jukeboxJob.ts` - Spotify polling job
- `packages/server/controllers/roomsController.ts` - Calls adapter.onRoomCreated()

## Summary

**Before:** ❌
- System jobs not registered
- Dynamic jobs invisible to status endpoint
- `/debug/jobs` returned empty array
- Hard to verify jobs were running

**After:** ✅
- System jobs registered at startup
- Dynamic jobs added to array when scheduled
- `/debug/jobs` shows all jobs
- Easy to monitor and debug

The job system is now fully visible and debuggable! 🎉

