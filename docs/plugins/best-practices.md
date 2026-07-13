# Best Practices


### 1. Always Check Config

```typescript
private async onTrackChanged(data: { roomId: string; track: QueueItem }): Promise<void> {
  const config = await this.getConfig()
  if (!config?.enabled) return
  // ...
}
```

### 2. Use Typed Event Handlers

```typescript
// Good - fully typed
this.on("TRACK_CHANGED", async (data) => {
  console.log(data.track.title) // TypeScript knows this exists
})

// Avoid - loses type safety
context.lifecycle.on("TRACK_CHANGED", handler as any)
```

### 3. Handle Config Changes Properly

```typescript
this.onConfigChange(async (data) => {
  const config = data.config as MyConfig
  const prev = data.previousConfig as MyConfig | null

  // Handle enable/disable transitions
  if (!prev?.enabled && config?.enabled) {
    await this.startMonitoring()
  } else if (prev?.enabled && !config?.enabled) {
    this.stopMonitoring()
  }
})
```

### 4. Use Built-in Timer API

Use the built-in timer methods instead of managing `setTimeout` manually:

```typescript
// Good - uses built-in timer API (auto-cleanup)
this.startTimer("countdown", {
  duration: 30000,
  callback: async () => {
    await this.handleTimeout()
  },
})

// Avoid - manual timer management
private readonly activeTimers = new Map<string, NodeJS.Timeout>()
const timeout = setTimeout(() => { ... }, 30000)
this.activeTimers.set("countdown", timeout)
```

### 5. Don't Call cleanup() When Disabling

```typescript
// Wrong - destroys plugin context
private async disablePlugin() {
  await this.cleanup()  // ❌ Can't re-enable later!
}

// Right - just clear state
private async disablePlugin() {
  this.clearAllTimers()  // ✓ Can re-enable
}
```

### 6. Use Redis Pipelining for Performance

```typescript
// Instead of multiple round trips
const a = await this.context.storage.get("key1")
const b = await this.context.storage.get("key2")

// Use pipeline for single round trip
const [a, b] = (await this.context.storage.pipeline([
  { op: "get", key: "key1" },
  { op: "get", key: "key2" },
])) as [string | null, string | null]
```

### 7. Emit Events for UI Updates

```typescript
// Keep frontend in sync
await this.emit("STATE_CHANGED", {
  showCountdown: true,
  trackStartTime: Date.now(),
})
```

### 8. Use Sound Effects Sparingly

```typescript
// Play a sound effect on important events
await this.context.api.queueSoundEffect({
  url: "https://example.com/sounds/ding.mp3",
  volume: 0.5, // Don't blast users at full volume
})
```

### 9. Prefer global game APIs for shared scores and items

If multiple plugins should interact with the same points or inventory, use `this.game` and `this.inventory` instead of duplicating sorted sets in `storage`. Keep plugin-local storage when the feature is intentionally isolated.

### 10. Use Screen Effects Thoughtfully

```typescript
// Animate plugin components to draw attention
await this.context.api.queueScreenEffect({
  target: "plugin",
  targetId: "my-button", // Component id from your schema
  effect: "pulse",
})

// For chat messages, prefer non-scaling effects to avoid clipping
await this.context.api.queueScreenEffect({
  target: "message",
  targetId: message.timestamp,
  effect: "shakeX", // Good: doesn't scale
  // effect: "tada", // May clip in scroll container
})
```


## Complete Example

See the [Playlist Democracy Plugin](../../packages/plugin-playlist-democracy) for a complete reference implementation featuring:

- Zod schema with validation
- Dynamic admin settings form
- UI components (countdown, badges)
- Event handling (track changes, reactions)
- Storage (vote tracking, skip data)
- Timer API usage (countdowns, delayed checks)
- Config change handling
- Playlist augmentation

See the [Queue Hygiene Plugin](../../packages/plugin-queue-hygiene) for a queue validation example featuring:

- Queue request interception (`validateQueueRequest`)
- Dynamic rate limiting based on room activity
- Consecutive track prevention
- Admin exemption logic

For **cross-plugin score, coin, modifiers, leaderboards, and inventory**, see [Game Sessions & Inventory](game-sessions.md#game-sessions--inventory) and [ADR 0042](../adrs/0042-game-sessions-and-inventory.md).


## Testing

See `packages/plugin-playlist-democracy/index.test.ts` and `packages/plugin-base/index.test.ts` for testing examples.

Key areas to test:

1. Plugin registration
2. Event handler responses
3. Config changes (enable/disable)
4. Storage operations
5. Timer behavior (use `vi.useFakeTimers()` for timer tests)
6. Component state
