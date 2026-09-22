# Storage API


Sandboxed Redis storage namespaced as `plugin:{pluginName}:room:{roomId}:{key}`.

### Basic Operations

```typescript
// Get/Set
const value = await this.context.storage.get("myKey")
await this.context.storage.set("myKey", "myValue")
await this.context.storage.set("tempKey", "value", 3600) // TTL in seconds

// Compare-and-set (optimistic concurrency across dynos)
const ok = await this.context.storage.compareAndSet("ledger", previousRaw, nextRaw)
// `previousRaw` null means the key must be absent

// Increment/Decrement
const count = await this.context.storage.inc("counter")
const count2 = await this.context.storage.dec("counter")

// Delete
await this.context.storage.del("myKey")

// Check existence
if (await this.context.storage.exists("myKey")) {
  // ...
}
```

### Batch Operations

```typescript
// Get multiple keys at once
const keys = ["key1", "key2", "key3"]
const values = await this.context.storage.mget(keys)
// Returns: [string | null, string | null, string | null]
```

### Redis Pipelining

For high-performance batch operations:

```typescript
// Pipeline multiple commands in one round trip
const results = (await this.context.storage.pipeline([
  { op: "get", key: "key1" },
  { op: "get", key: "key2" },
  { op: "inc", key: "counter" },
])) as [string | null, string | null, number]
```

### JSON helpers (CAS-safe)

Prefer these over hand-rolled `get` → `JSON.parse` / `JSON.stringify` → `set` ([ADR 0192](../adrs/0192-plugin-storage-and-leaderboard-helpers.md)):

```typescript
// Read JSON (raw is the wire string for compareAndSet)
const { raw, value } = await this.context.storage.getJson<MyState>("state")

// Write JSON (optional TTL in seconds)
await this.context.storage.setJson("state", nextState)

// Atomic read-modify-write (retries on CAS conflict; default 5)
await this.context.storage.updateJson<MyState>("state", (current) => {
  const base = current ?? defaultState
  return { ...base, count: base.count + 1 }
})

// Capped list log (LPUSH + LTRIM) — e.g. tick history
await this.context.storage.appendCapped("ticks", tickEntry, 120)
const recent = await this.context.storage.lrange("ticks", 0, 119)
```

Use `updateJson` whenever two dynos might mutate the same key. Use `appendCapped` for bounded append-only logs instead of growing a JSON array in a string key.

### Sorted Sets (Leaderboards)

Low-level sorted-set ops:

```typescript
// Add to sorted set
await this.context.storage.zadd("leaderboard", score, memberId)

// Get range with scores
const entries = await this.context.storage.zrangeWithScores("leaderboard", 0, 9)
// Returns: [{ value: string, score: number }, ...]

// Increment score
await this.context.storage.zincrby("leaderboard", 1, memberId)
```

### Plugin board vs session leaderboard

| Need | Use |
| ---- | --- |
| Cross-plugin `score` / `coin`, session UI templates (`game-leaderboard`) | Core session API: `this.game.addScore` / `getLeaderboard` — see [Game Sessions](game-sessions.md) |
| Plugin-local standings (quiz, bingo, special-words, etc.) | `createLeaderboard` from `@repo/plugin-base` on a plugin storage key |

```typescript
import { createLeaderboard, HOT_LEADERBOARD_TOP_N } from "@repo/plugin-base"

const board = createLeaderboard({
  storage: this.context.storage,
  api: this.context.api,
  key: "leaderboard",
})

await board.increment(userId, 1)
const top = await board.top({ topN: HOT_LEADERBOARD_TOP_N })
// [{ score, value: userId, username }, ...]
await board.reset()
```

Keep duplicate scores alongside `game.addScore` when you also want the shared session economy — the plugin board does not replace core attributes.
