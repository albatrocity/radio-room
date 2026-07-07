# Timer API


BasePlugin provides a built-in timer management system for scheduling delayed operations. Timers are automatically cleaned up when the plugin is cleaned up or when a room is deleted.

### Starting Timers

```typescript
// Simple timer
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
