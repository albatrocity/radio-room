# Storage API


Sandboxed Redis storage namespaced as `plugin:{pluginName}:room:{roomId}:{key}`.

### Basic Operations

```typescript
// Get/Set
const value = await this.context.storage.get("myKey")
await this.context.storage.set("myKey", "myValue")
await this.context.storage.set("tempKey", "value", 3600) // TTL in seconds

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

### Sorted Sets (Leaderboards)

```typescript
// Add to sorted set
await this.context.storage.zadd("leaderboard", score, memberId)

// Get range with scores
const entries = await this.context.storage.zrangeWithScores("leaderboard", 0, 9)
// Returns: [{ value: string, score: number }, ...]

// Increment score
await this.context.storage.zincrby("leaderboard", 1, memberId)
```
