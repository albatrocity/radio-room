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

| Function                     | Returns                      | Description                                  |
| ---------------------------- | ---------------------------- | -------------------------------------------- |
| `allowQueueRequest()`        | `{ allowed: true }`          | Allow the queue request to proceed           |
| `rejectQueueRequest(reason)` | `{ allowed: false, reason }` | Block the request with a user-facing message |

```typescript
import { allowQueueRequest, rejectQueueRequest } from "@repo/types"

// Allow the request
return allowQueueRequest()

// Reject with a message shown to the user
return rejectQueueRequest("You added the last song. Wait for another DJ to add one.")
```

### QueueValidationParams

The `params` object contains:

| Field      | Type     | Description                           |
| ---------- | -------- | ------------------------------------- |
| `roomId`   | `string` | The room where the request originated |
| `userId`   | `string` | The user attempting to queue a song   |
| `username` | `string` | The user's display name               |
| `trackId`  | `string` | The track being queued                |

### Fail-Open Semantics

Queue validation uses **fail-open** semantics to ensure core functionality isn't blocked by plugin failures:

| Plugin Behavior                      | Result                                |
| ------------------------------------ | ------------------------------------- |
| Returns `allowQueueRequest()`        | ✅ Allowed (continues to next plugin) |
| Returns `rejectQueueRequest(reason)` | ❌ **Blocked** (stops processing)     |
| Throws an error                      | ✅ Allowed (error logged)             |
| Times out (>500ms)                   | ✅ Allowed (timeout logged)           |
| Doesn't implement method             | ✅ Allowed (skipped)                  |

**Important**: Only an explicit `rejectQueueRequest()` will block the enqueue. All error conditions allow the request to proceed, ensuring users can always add songs even if a plugin misbehaves.

### Multiple Plugins

If multiple plugins implement `validateQueueRequest`:

1. Plugins are called sequentially
2. The **first rejection wins** - remaining plugins are not called
3. If all plugins allow, the request proceeds

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

  if (lastTrack?.addedBy?.userId === params.userId) {
    return rejectQueueRequest("Please wait for another DJ to add a song first")
  }

  return allowQueueRequest()
}
```
