# Timer API

Plugins have two timing tools. Prefer the **durable scheduler** for anything that must survive restarts or multi-dyno deploys. Use **`startTimer`** only for short, in-memory UI timing.

See [ADR 0190](../adrs/0190-durable-plugin-scheduler.md).

## Durable schedules (`schedule` / `onScheduled`)

Core stores deadlines in Redis (`plugin:schedules`), sweeps every second, and claims with `ZREM` so only one process fires each schedule. Bounds: **1 second–7 days**.

Register handlers in `register()` (or equivalent setup), then schedule by `id` + `kind`. Re-scheduling the same `id` replaces the pending entry.

```typescript
// In register / setup
this.onScheduled("auto-advance", async (payload, scheduleId) => {
  await this.advanceRound()
  // Self-reschedule if the loop continues
  await this.schedule({
    id: "round-advance",
    kind: "auto-advance",
    durationMs: 30_000,
  })
})

// Arm a deadline
await this.schedule({
  id: "round-advance",
  kind: "auto-advance",
  durationMs: 30_000,
  payload: { roundId: "abc" }, // optional; passed to the handler
})

// Or absolute time
await this.schedule({
  id: "funding-close",
  kind: "funding-close",
  at: Date.now() + 60_000,
})

await this.cancelSchedule("round-advance")
const pending = await this.context.api.getSchedule("round-advance")
// { id, kind, fireAt, payload } | null
```

| Method | Description |
| ------ | ----------- |
| `onScheduled(kind, handler)` | Register handler `(payload, scheduleId) => …` for a kind |
| `schedule({ id, kind, at?, durationMs?, anchor?, payload? })` | Arm or replace a durable schedule |
| `cancelSchedule(id)` | Cancel a pending schedule |
| `api.getSchedule(id)` | Read pending schedule metadata (`paused: true` for a paused anchor) |
| `onScheduleRevised(handler)` | Observe an anchored schedule pausing, resuming, moving, or being cancelled |

**When to use:** game/economy deadlines, auto-advance, item return timers, recurring ticks (self-reschedule from the handler), anything that must fire after a process restart.

**Do not** use `startTimer` for those cases — in-memory timers are lost on restart and can double-fire across dynos.

### Playback-anchored schedules (`anchor`)

Wall-clock schedules keep counting while the room is paused. When a timer describes the music, pass `anchor` instead of `at` / `durationMs` ([ADR 0196](../adrs/0196-plugin-playback-timeline.md)):

| Anchor | Fires when |
| ------ | ---------- |
| `{ afterPlaybackMs }` | that much playback has elapsed |
| `{ atProgressMs }` | the playhead reaches that position |
| `{ leadMs }` | `leadMs` before the track ends |

All three pause while the room is not playing. Add `trackId` (`QueueItem.mediaSource.trackId`) to cancel the schedule when a different track starts.

```typescript
this.onScheduleRevised(async ({ scheduleId, paused, fireAt, remainingMs, cancelled }) => {
  // Keep countdown UI honest: freeze on pause, restart from fireAt on resume
})

const result = await this.schedule({
  id: "skip-countdown",
  kind: "countdown",
  anchor: { trackId: track.mediaSource.trackId, afterPlaybackMs: 60_000 },
})
// result.anchored === false → playback was unreadable; fell back to wall clock
// result.paused === true → room is paused; the countdown starts on resume
```

`afterPlaybackMs` falls back to wall clock when the room has no readable playback controller. `atProgressMs` and `leadMs` fail instead. Game timers that are not about the music (round auto-advance, answer windows) should stay on `durationMs`.

Plugins can also drive transport directly in app-controlled rooms: `api.getPlayback(roomId)` (any room whose controller reports state), `api.pausePlayback`, `api.resumePlayback`, and `api.seekPlayback(roomId, positionMs)`.

## In-memory timers (`startTimer`)

`startTimer` is a plain `setTimeout` on the plugin instance. Timers are cleared on plugin cleanup / room deletion. They do **not** survive restarts.

Use only for short, disposable UI timing (e.g. debounce a local emit). Prefer `schedule` for multi-second game logic.

### Starting Timers

```typescript
// Simple timer (prefer this.schedule for durable work)
this.startTimer("countdown", {
  duration: 30000, // 30 seconds
  callback: async () => {
    await this.skipTrack()
  },
})

// Timer with typed metadata
interface CountdownData {
  trackId: string
  userId: string
}

this.startTimer<CountdownData>("track-countdown", {
  duration: 60000,
  callback: async () => {
    const timer = this.getTimer<CountdownData>("track-countdown")
    console.log(`Timer expired for track ${timer?.data?.trackId}`)
  },
  data: {
    trackId: "abc123",
    userId: "user456",
  },
})
```

If a timer with the same ID already exists, it will be cleared and replaced.

### Timer Methods

| Method                      | Return Type        | Description                                           |
| --------------------------- | ------------------ | ----------------------------------------------------- |
| `startTimer<T>(id, config)` | `void`             | Start a timer; replaces existing timer with same ID   |
| `clearTimer(id)`            | `boolean`          | Clear a timer; returns `true` if found                |
| `clearAllTimers()`          | `void`             | Clear all active timers                               |
| `getTimer<T>(id)`           | `Timer<T> \| null` | Get timer info (without internal handle)              |
| `getAllTimers()`            | `Timer[]`          | Get all active timers                                 |
| `resetTimer(id)`            | `boolean`          | Restart timer from beginning; returns `true` if found |
| `getTimerRemaining(id)`     | `number \| null`   | Get remaining ms, or `null` if not found              |

### Timer Types

```typescript
interface TimerConfig<T = unknown> {
  duration: number // Duration in milliseconds
  callback: () => Promise<void> | void // Function to call when timer expires
  data?: T // Optional metadata attached to timer
}

interface Timer<T = unknown> {
  id: string
  startTime: number // Date.now() when timer was started
  duration: number
  data?: T
}
```

### Examples

#### Countdown Timer

```typescript
private startCountdown(trackId: string, duration: number): void {
  this.startTimer("skip-countdown", {
    duration,
    callback: async () => {
      await this.context!.api.skipTrack(this.context!.roomId, trackId)
    },
    data: { trackId },
  })

  // Emit to frontend with start time for UI countdown
  const timer = this.getTimer("skip-countdown")
  this.emit("COUNTDOWN_STARTED", {
    startTime: timer?.startTime,
    duration,
  })
}
```

#### Checking Remaining Time

```typescript
async getComponentState(): Promise<PluginComponentState> {
  const timer = this.getTimer("skip-countdown")
  if (!timer) {
    return { showCountdown: false }
  }

  const remaining = this.getTimerRemaining("skip-countdown")
  return {
    showCountdown: remaining !== null && remaining > 0,
    startTime: timer.startTime,
    duration: timer.duration,
  }
}
```

#### Cancelling a Timer

```typescript
private async onUserReturned(userId: string): Promise<void> {
  const timer = this.getTimer<{ absentUserId: string }>("absent-check")

  if (timer?.data?.absentUserId === userId) {
    this.clearTimer("absent-check")
    await this.emit("COUNTDOWN_CANCELLED", { showCountdown: false })
  }
}
```

#### Resetting a Timer

```typescript
private onUserActivity(): void {
  // User is active, reset the inactivity timer
  if (this.resetTimer("inactivity-timeout")) {
    console.log("Inactivity timer reset")
  }
}
```

#### Multiple Independent Timers

```typescript
// Track multiple timers with unique IDs
this.startTimer(`vote:${trackId}`, {
  duration: config.voteTimeout,
  callback: () => this.finalizeVote(trackId),
})

// Clear specific timer without affecting others
this.clearTimer(`vote:${trackId}`)

// Or clear all timers at once
this.clearAllTimers()
```

### Automatic Cleanup

Timers are automatically cleared when:

1. `cleanup()` is called (room deletion)
2. A new timer is started with the same ID (replacement)
3. The timer callback completes (self-cleanup)

You typically don't need to manually clear timers in `onCleanup()` unless you have specific cleanup logic.

### Error Handling

Timer callbacks are wrapped in try/catch. Errors are logged but don't crash the plugin:

```typescript
this.startTimer("risky-operation", {
  duration: 5000,
  callback: async () => {
    // If this throws, it's logged and the timer is still cleaned up
    await this.riskyOperation()
  },
})
```
