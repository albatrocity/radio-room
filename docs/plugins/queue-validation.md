# Queue Validation


Plugins can intercept queue requests before they're processed by the core system. This enables features like:

- **Rate limiting**: Prevent users from adding too many songs in quick succession
- **Consecutive track prevention**: Stop users from monopolizing the queue
- **Duplicate detection**: Block the same song from being queued multiple times
- **Custom access policies**: Implement room-specific queue rules

### Implementing Queue Validation

Override the `validateQueueRequest` method to intercept queue requests:

```typescript
import {
  allowQueueRequest,
  rejectQueueRequest,
  type QueueValidationParams,
  type QueueValidationResult,
} from "@repo/types"

async validateQueueRequest(params: QueueValidationParams): Promise<QueueValidationResult> {
  const config = await this.getConfig()
  if (!config?.enabled) return allowQueueRequest()

  const { userId, trackId, roomId, username } = params

  // Example: Check if user is rate limited
  const lastQueueTime = await this.context!.storage.get(`lastQueue:${userId}`)
  if (lastQueueTime && Date.now() - Number(lastQueueTime) < config.cooldownMs) {
    return rejectQueueRequest("Please wait before adding another song")
  }

  return allowQueueRequest()
}
```

### Helper Functions

Use these helper functions from `@repo/types` for consistent, type-safe responses:

| Function                       | Returns                            | Description                                                  |
| ------------------------------ | ---------------------------------- | ------------------------------------------------------------ |
| `allowQueueRequest()`          | `{ allowed: true }`                | Allow the queue request to proceed                           |
| `rejectQueueRequest(reason)`   | `{ allowed: false, reason }`       | Block the request with a user-facing message                 |
| `deferQueueRequest(message)`   | `{ deferred: true, message }`      | Accept selection without enqueueing (client info toast)      |

```typescript
import { allowQueueRequest, rejectQueueRequest, deferQueueRequest } from "@repo/types"

// Allow the request
return allowQueueRequest()

// Reject with a message shown to the user
return rejectQueueRequest("You added the last song. Wait for another DJ to add one.")

// Hold until later (e.g. Round Robin early selection)
return deferQueueRequest("Song saved — it will be added when it's your turn")
```

### QueueValidationParams

The `params` object contains:

| Field             | Type     | Description                                              |
| ----------------- | -------- | -------------------------------------------------------- |
| `roomId`          | `string` | The room where the request originated                    |
| `userId`          | `string` | The user attempting to queue a song                      |
| `username`        | `string` | The user's display name                                  |
| `trackId`         | `string` | The track being queued                                   |
| `mediaSourceType` | `string?`| Metadata source for the track (`spotify`, `youtube`, …) |

Metadata source **access** (restricted sources / plugin grants) is evaluated before this hook. See [Metadata Source Access](metadata-source-access.md).

### Fail-Open Semantics

Queue validation uses **fail-open** semantics to ensure core functionality isn't blocked by plugin failures:

| Plugin Behavior                      | Result                                           |
| ------------------------------------ | ------------------------------------------------ |
| Returns `allowQueueRequest()`        | Allowed (continues to next plugin)               |
| Returns `rejectQueueRequest(reason)` | **Blocked** (stops processing)                   |
| Returns `deferQueueRequest(message)` | **Deferred** (stops processing; no enqueue)      |
| Throws an error                      | Allowed (error logged)                           |
| Times out (>500ms)                   | Allowed (timeout logged)                         |
| Doesn't implement method             | Allowed (skipped)                                |

**Important**: Only an explicit `rejectQueueRequest()` or `deferQueueRequest()` stops the enqueue. All error conditions allow the request to proceed, ensuring users can always add songs even if a plugin misbehaves. Deferred results emit `SONG_QUEUE_HELD` to the client (info toast) instead of `SONG_QUEUE_FAILURE`.

### Multiple Plugins

If multiple plugins implement `validateQueueRequest`:

1. Plugins are called sequentially
2. The **first rejection or defer wins** — remaining plugins are not called
3. If all plugins allow, the request proceeds

### Queue follow-ups before `QUEUE_CHANGED`

A plugin that needs another track on the queue after someone else's enqueue proposes that track as data. `DJService` writes it, then emits once. Do not call `addToTrackQueue` from a `QUEUE_CHANGED` handler. That throws `QueueMutationDuringEmitError`.

| Hook | When | Role |
|------|------|------|
| `collectQueueFollowUps(roomId)` | After the primary write, before emit | Return `{ type: "enqueue", trackId, mediaSourceType?, addedBy, runPluginValidation: false }[]`. Default is `[]`. |
| `onQueueFollowUpResult(result)` | After each applied follow-up, still before emit | `result.success` means the track is in Redis. Clear holds, advance turns, or send the error chat here. |

**Contract:**

1. The primary enqueue commits in `DJService`.
2. The registry asks each room plugin for follow-ups. `runPluginValidation` is forced to `false` — the proposal was already accepted.
3. `DJService` enqueues each proposal, then delivers the result to the plugin that proposed it.
4. That repeats until a collect is empty, a round applies nothing, or a follow-up fails. A failure stops the chain. The cap is 50 rounds.
5. One `QUEUE_CHANGED` goes out with the queue that includes every successful follow-up.

Turn changes that are not themselves queue writes (a deputy leaving, an admin advancing the round) may still call `addToTrackQueue` from outside an emit. If that call happens to run while plugins are being notified, defer it until the emit returns.

Reference implementation: `@repo/plugin-round-robin-dj` hold flush. Decision: [ADR 0200](../adrs/0200-queue-follow-ups-before-queue-changed.md).

### Example: Rate Limiting Plugin

```typescript
export class RateLimitPlugin extends BasePlugin<RateLimitConfig> {
  name = "rate-limit"
  version = "1.0.0"

  async register(context: PluginContext): Promise<void> {
    await super.register(context)
    this.on("QUEUE_CHANGED", this.onQueueChanged.bind(this))
  }

  async validateQueueRequest(params: QueueValidationParams): Promise<QueueValidationResult> {
    const config = await this.getConfig()
    if (!config?.enabled) return allowQueueRequest()

    // Check if user should be rate limited
    const lastQueueTime = await this.context!.storage.get(`lastQueue:${params.userId}`)

    if (lastQueueTime) {
      const elapsed = Date.now() - Number(lastQueueTime)
      if (elapsed < config.cooldownMs) {
        const remaining = Math.ceil((config.cooldownMs - elapsed) / 1000)
        return rejectQueueRequest(`Please wait ${remaining}s before adding another song`)
      }
    }

    return allowQueueRequest()
  }

  // Track when users add songs
  private async onQueueChanged(data: { roomId: string; queue: QueueItem[] }): Promise<void> {
    const config = await this.getConfig()
    if (!config?.enabled) return

    // Find the most recently added track
    const mostRecent = [...data.queue].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))[0]

    if (mostRecent?.addedBy?.userId && mostRecent.addedAt) {
      // Only track if added within last 5 seconds (new addition)
      if (Date.now() - mostRecent.addedAt < 5000) {
        await this.context!.storage.set(
          `lastQueue:${mostRecent.addedBy.userId}`,
          String(mostRecent.addedAt),
          config.cooldownMs / 1000 + 60, // TTL with buffer
        )
      }
    }
  }
}
```

### Example: Consecutive Track Prevention

```typescript
async validateQueueRequest(params: QueueValidationParams): Promise<QueueValidationResult> {
  const config = await this.getConfig()
  if (!config?.enabled || !config.preventConsecutive) {
    return allowQueueRequest()
  }

  // Check if user added the last track in the queue
  const queue = await this.context!.api.getQueue(this.context!.roomId)
  const lastTrack = queue[queue.length - 1]

  return allowQueueRequest()
}
```

### Cancelling a held pick (ADR 0101)

`deferQueueRequest` does not enqueue. To undo that pick, implement `cancelHeldQueue({ roomId, userId, trackId })` and return `{ cancelled: true }` only when the stored hold matches `trackId`. The client emits `CANCEL_HELD_QUEUE`. After a live `REMOVE_FROM_QUEUE`, `onQueueItemRemoved` runs so plugins can restore a spent turn (Round Robin moves the deputy to the end of the round).
