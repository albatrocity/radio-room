# BasePlugin Reference


### Properties

| Property      | Type                    | Description                         |
| ------------- | ----------------------- | ----------------------------------- |
| `name`        | `string`                | Unique plugin identifier (required) |
| `version`     | `string`                | Plugin version (required)           |
| `description` | `string`                | Human-readable description          |
| `context`     | `PluginContext \| null` | Set after `register()` is called    |

### Static Properties

```typescript
class MyPlugin extends BasePlugin<MyConfig> {
  // Zod schema for validation
  static readonly configSchema = myConfigSchema

  // Default configuration values
  static readonly defaultConfig = {
    enabled: false,
    // ...
  }
}
```

### Methods

#### `register(context: PluginContext): Promise<void>`

Called when plugin is initialized for a room. Always call `super.register(context)` first.

```typescript
async register(context: PluginContext): Promise<void> {
  await super.register(context)
  // Register event handlers here
}
```

#### `on<K>(event: K, handler): void`

Type-safe event handler registration. Automatically binds `this`.

```typescript
this.on("TRACK_CHANGED", async (data) => {
  // data is typed as { roomId: string; track: QueueItem }
  console.log(data.track.title)
})
```

#### `onConfigChange(handler): void`

Register a handler for THIS plugin's config changes only. Automatically filters `CONFIG_CHANGED` events.

```typescript
this.onConfigChange(async (data) => {
  const wasEnabled = data.previousConfig?.enabled === true
  const isEnabled = data.config?.enabled === true

  if (!wasEnabled && isEnabled) {
    console.log("Plugin was just enabled!")
  }
})
```

#### `emit<T>(eventName: string, data: T): Promise<void>`

Emit a custom plugin event to the frontend. Events are namespaced as `PLUGIN:{pluginName}:{eventName}`.

```typescript
await this.emit("WORD_DETECTED", {
  word: "hello",
  userId: "user123",
  count: 5,
})
// Frontend receives: PLUGIN:my-plugin:WORD_DETECTED
```

If the plugin implements `contributeToUserGameState`, each `emit` also queues a room-wide `USER_GAME_STATE_INVALIDATED` (deduped per tick) unless you pass `{ invalidatesUserState: false }`. See [Per-User State](per-user-state.md) and [ADR 0154](../adrs/0154-plugin-emit-invalidates-user-state-opt-out.md).

#### `serialize(fn): Promise<T>` (protected)

Run `fn` after any previously serialized work on this instance, including when the previous run rejected. Use this when overlapping event handlers must not interleave (e.g. `TRACK_CHANGED` plus `POLL_VOTE_CAST` closing and opening a poll).

```typescript
this.on("TRACK_CHANGED", (data) =>
  this.serialize(async () => {
    await this.closeAndSettle(data.track)
  }),
)
```

#### `contributeToUserGameState?(userId, ctx)` (optional — **no BasePlugin default**)

Contribute private per-user data to `GET_MY_GAME_STATE` / `USER_GAME_STATE` under `pluginUserState[pluginName]`. BasePlugin intentionally does **not** provide a default — implementing the method opts the plugin into refetch invalidation. See [Per-User State](per-user-state.md) and [ADR 0097](../adrs/0097-plugin-contribute-to-user-game-state.md).

#### `getConfig(): Promise<TConfig | null>`

Get the plugin's typed configuration for the current room. Results are cached in memory until `CONFIG_CHANGED` for this plugin (avoids Redis on every hot-path call).

```typescript
const config = await this.getConfig()
if (!config?.enabled) return
```

#### `getDefaultConfig(): Record<string, unknown> | undefined`

Returns merged default config (static defaults + factory overrides).

#### `cleanup(): Promise<void>`

Called when room is deleted. Automatically clears all timers, cleans up storage, and calls `onCleanup()`.

#### `onCleanup(): Promise<void>` (optional override)

Custom cleanup logic. Note: timers are automatically cleared by the base class, so you typically don't need to handle them here.

```typescript
protected async onCleanup(): Promise<void> {
  // Only needed for non-timer cleanup (e.g., external connections)
  this.externalConnection?.close()
}
```

#### Timer Management

See [Timer API](timers.md#timer-api) for full documentation on the built-in timer management system.

#### Game sessions & inventory (`this.game` / `this.inventory`)

See [Game Sessions & Inventory](game-sessions.md#game-sessions--inventory). After `super.register(context)`, use:

- **`this.game`** — Session lifecycle, `addScore` / `setScore`, modifiers, leaderboards.
- **`this.inventory`** — Register item definitions, `giveItem`, `transferItem`, `useItem`.
- **`onItemUsed`** — Override to handle `useItem` for definitions owned by your plugin.

#### `executeAction(action: string): Promise<{ success: boolean; message?: string }>`

Handle action buttons from the admin config UI. Override this to implement custom actions.

```typescript
async executeAction(action: string): Promise<{ success: boolean; message?: string }> {
  if (action === "resetLeaderboards") {
    await this.clearAllLeaderboards()
    return { success: true, message: "Leaderboards have been reset" }
  }
  return { success: false, message: `Unknown action: ${action}` }
}
```

#### `validateQueueRequest(params): Promise<QueueValidationResult>` (optional)

Intercept queue requests before they're processed. Use this to implement rate limiting, duplicate detection, or other queue access policies. `params.mediaSourceType` is set when known.

See [Queue Validation](queue-validation.md#queue-validation) for full documentation.

#### `cancelHeldQueue(params): Promise<{ cancelled: boolean }>` (optional)

Clear a deferred / held pick when the listener undoes `SONG_QUEUE_HELD` ([ADR 0101](../adrs/0101-queue-add-undo-and-round-robin-turn-restore.md)). Return `{ cancelled: true }` only if this plugin owned a hold matching `trackId`.

#### `onQueueItemRemoved(params): Promise<void>` (optional)

Called after a successful app-controlled `REMOVE_FROM_QUEUE`. Fail-open (500ms). Use this to restore Round Robin turns; do not treat a cancelled hold as a spent turn.

#### `grantMetadataSourceAccess(params): Promise<"grant" | "abstain">` (optional)

Grant a user access to a **restricted** metadata source on bridge rooms (search/queue). Any `"grant"` wins; errors/timeouts abstain (fail-closed). Discover source ids via `this.context.api.listMetadataSources(roomId)`.

See [Metadata Source Access](metadata-source-access.md).

```typescript
async validateQueueRequest(params: QueueValidationParams): Promise<QueueValidationResult> {
  const config = await this.getConfig()
  if (!config?.enabled) return allowQueueRequest()

  if (await this.wouldViolatePolicy(params.userId)) {
    return rejectQueueRequest("Please wait before adding another song")
  }
  return allowQueueRequest()
}
```

#### `transformChatMessage(roomId, message): Promise<ChatMessageTransformResult>` (optional)

Transform a chat message **after** it is parsed (mentions, Mustache) but **before** it is broadcast and persisted. Plugins are called **in order**; each receives the previous plugin’s result. Return type is `ChatMessageTransformResult`:

| Return value | Effect |
| ------------ | ------ |
| `null` | Leave the message unchanged (pass through to the next plugin). |
| `ChatMessage` | Use this message as input for the next plugin (and for send if no later plugin changes it). |
| `{ drop: true, reason?: string }` | **Skip** persistence and broadcast for this user message. `sendMessage` is not called; the drop is silent on the wire. Plugins may still send separate system messages. Short-circuits the plugin chain. |

Fail-open on errors and timeouts (500ms per plugin), like `validateQueueRequest`. Use `{ drop: true }` when a message would spoil hidden room state in inclusive participation modes (see [ADR 0062](../adrs/0062-participation-mode-pvp-vs-pvg.md)). Matching and scoring for inclusive mode SHOULD happen in this hook so the drop decision is atomic with the award.

To express per-span presentation (e.g. smaller text on part of a line), set **`message.contentSegments`** (typed `TextSegment[]` with declarative `TextEffect`s) and keep **`message.content`** as a matching plain string. See [ADR 0044](../adrs/0044-plugin-chat-message-transform-and-text-segments.md). Helpers: `tokenizeWords` / `buildSegments` in `@repo/plugin-base/helpers`.

#### `executeAction(action: string): Promise<{ success: boolean; message?: string }>`

Handle action buttons from the admin config UI. Override this to implement custom actions.

```typescript
async executeAction(action: string): Promise<{ success: boolean; message?: string }> {
  if (action === "resetLeaderboards") {
    await this.clearAllLeaderboards()
    return { success: true, message: "Leaderboards have been reset" }
  }
  return { success: false, message: `Unknown action: ${action}` }
}
```
