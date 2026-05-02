# Plugin Development Guide

This guide explains how to create plugins for Listening Room. Plugins extend room functionality through an event-driven architecture with support for custom UI components, configuration forms, and data augmentation.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Quick Start](#quick-start)
- [BasePlugin Reference](#baseplugin-reference)
- [Event System](#event-system)
- [Queue Validation](#queue-validation)
- [Configuration Schema](#configuration-schema)
- [Plugin Actions](#plugin-actions)
- [Plugin Components](#plugin-components)
- [Data Augmentation](#data-augmentation)
- [Room Export](#room-export)
- [Storage API](#storage-api)
- [Game Sessions & Inventory](#game-sessions--inventory)
- [Shop Helper](#shop-helper)
- [Game State Tabs](#game-state-tabs)
- [Timer API](#timer-api)
- [Best Practices](#best-practices)
- [Complete Example](#complete-example)

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                     Plugin Registry                         │
│              (Creates instance per room)                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ├─ Creates PluginContext
                            │   ├─ api: PluginAPI
                            │   ├─ storage: PluginStorage
                            │   ├─ game: GameSessionPluginAPI (room-scoped)
                            │   ├─ inventory: InventoryPluginAPI (room-scoped)
                            │   ├─ lifecycle: Event handlers
                            │   └─ roomId: string
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Your Plugin                             │
│               extends BasePlugin<TConfig>                   │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Config      │  │ Components   │  │ Event Handlers    │  │
│  │ Schema      │  │ Schema       │  │ & Business Logic  │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
│                                                             │
│  ┌────────────────── Composable Helpers ──────────────────┐│
│  │ ShopHelper / ShopPlugin · (future: RoundsHelper, …)   ││
│  └────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Frontend                               │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Dynamic     │  │ Plugin       │  │ Socket Event      │  │
│  │ Settings    │  │ Components   │  │ Updates           │  │
│  │ Forms       │  │ (Declarative)│  │                   │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Key Concepts

1. **One Instance Per Room**: Each room gets its own plugin instance with isolated state
2. **Event-Driven**: Plugins react to system events (TRACK_CHANGED, REACTION_ADDED, etc.)
3. **Declarative UI**: Define UI components via JSON schema - no React code in plugins
4. **Type-Safe**: Full TypeScript support with Zod schema validation
5. **Sandboxed Storage**: Redis storage namespaced by plugin and room
6. **Optional Global Game State**: Core services expose `context.game` (sessions, score/coin, modifiers, leaderboards) and `context.inventory` (cross-plugin items). Use these when you want shared economy or UI across plugins; keep plugin-local sorted sets when scores should stay private to one plugin.

## Quick Start

### 1. Create Plugin Package

```bash
mkdir packages/plugin-my-feature
cd packages/plugin-my-feature
```

### 2. Package Configuration

```json
{
  "name": "@repo/plugin-my-feature",
  "version": "1.0.0",
  "main": "index.ts",
  "dependencies": {
    "@repo/types": "*",
    "@repo/plugin-base": "*",
    "zod": "^4.0.0"
  }
}
```

### 3. Define Types

```typescript
// types.ts
import { z } from "zod"

export const myFeatureConfigSchema = z.object({
  enabled: z.boolean().default(false),
  threshold: z.number().min(1).max(100).default(50),
  message: z.string().default("Hello!"),
})

export type MyFeatureConfig = z.infer<typeof myFeatureConfigSchema>

export const defaultMyFeatureConfig: MyFeatureConfig = {
  enabled: false,
  threshold: 50,
  message: "Hello!",
}
```

### 4. Implement Plugin

```typescript
// index.ts
import { z } from "zod"
import { BasePlugin } from "@repo/plugin-base"
import type { Plugin, PluginContext, PluginConfigSchema, QueueItem } from "@repo/types"
import packageJson from "./package.json"
import { myFeatureConfigSchema, defaultMyFeatureConfig, type MyFeatureConfig } from "./types"

export class MyFeaturePlugin extends BasePlugin<MyFeatureConfig> {
  name = "my-feature"
  version = packageJson.version
  description = "A sample plugin"

  // Static schema and defaults
  static readonly configSchema = myFeatureConfigSchema
  static readonly defaultConfig = defaultMyFeatureConfig

  async register(context: PluginContext): Promise<void> {
    await super.register(context)

    // Register event handlers using typed helper
    this.on("TRACK_CHANGED", this.onTrackChanged.bind(this))
    this.on("REACTION_ADDED", this.onReactionAdded.bind(this))

    // Register filtered config change handler
    this.onConfigChange(this.handleConfigChange.bind(this))
  }

  private async onTrackChanged(data: { roomId: string; track: QueueItem }): Promise<void> {
    const config = await this.getConfig()
    if (!config?.enabled) return

    console.log(`[${this.name}] Track changed: ${data.track.title}`)
  }

  private async onReactionAdded(data: { roomId: string; reaction: any }): Promise<void> {
    // Handle reaction
  }

  private async handleConfigChange(data: {
    roomId: string
    config: Record<string, unknown>
    previousConfig: Record<string, unknown>
  }): Promise<void> {
    const config = data.config as MyFeatureConfig
    const previousConfig = data.previousConfig as MyFeatureConfig | null

    if (!previousConfig?.enabled && config?.enabled) {
      await this.context!.api.sendSystemMessage(this.context!.roomId, "✨ My Feature enabled!")
    }
  }

  // Optional: Define admin settings form
  getConfigSchema(): PluginConfigSchema {
    return {
      jsonSchema: z.toJSONSchema(myFeatureConfigSchema),
      layout: ["enabled", "threshold", "message"],
      fieldMeta: {
        enabled: {
          type: "boolean",
          label: "Enable Feature",
        },
        threshold: {
          type: "number",
          label: "Threshold",
          description: "Value between 1-100",
        },
        message: {
          type: "string",
          label: "Custom Message",
        },
      },
    }
  }
}

// Factory function
export function createMyFeaturePlugin(configOverrides?: Partial<MyFeatureConfig>): Plugin {
  return new MyFeaturePlugin(configOverrides)
}

export default createMyFeaturePlugin
```

### 5. Register Plugin

In `apps/api/src/server.ts`:

```typescript
import { createMyFeaturePlugin } from "@repo/plugin-my-feature"

// In registerAdapters():
await registerAdapters(context, {
  plugins: [
    createPlaylistDemocracyPlugin,
    createSpecialWordsPlugin,
    createMyFeaturePlugin, // Add your plugin
  ],
})
```

## BasePlugin Reference

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

#### `getConfig(): Promise<TConfig | null>`

Get the plugin's typed configuration for the current room.

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

See [Timer API](#timer-api) for full documentation on the built-in timer management system.

#### Game sessions & inventory (`this.game` / `this.inventory`)

See [Game Sessions & Inventory](#game-sessions--inventory). After `super.register(context)`, use:

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

Intercept queue requests before they're processed. Use this to implement rate limiting, duplicate detection, or other queue access policies.

See [Queue Validation](#queue-validation) for full documentation.

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

#### `transformChatMessage(roomId, message): Promise<ChatMessage | null>` (optional)

Transform a chat message **after** it is parsed (mentions, Mustache) but **before** it is broadcast and persisted. Plugins are called **in order**; each receives the previous plugin’s result. Return `null` to leave the message unchanged. Fail-open on errors and timeouts (500ms), like `validateQueueRequest`.

To express per-span presentation (e.g. smaller text on part of a line), set **`message.contentSegments`** (typed `TextSegment[]` with declarative `TextEffect`s) and keep **`message.content`** as a matching plain string. See [ADR 0042](adrs/0042-plugin-chat-message-transform-and-text-segments.md). Helpers: `tokenizeWords` / `buildSegments` in `@repo/plugin-base/helpers`.

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

## Event System

Plugins subscribe to system events using SCREAMING_SNAKE_CASE names.

### Available Events

| Event                   | Payload                                          | Description                        |
| ----------------------- | ------------------------------------------------ | ---------------------------------- |
| `TRACK_CHANGED`         | `{ roomId, track: QueueItem }`                   | Now playing changed                |
| `REACTION_ADDED`        | `{ roomId, reaction: ReactionPayload }`          | User added reaction                |
| `REACTION_REMOVED`      | `{ roomId, reaction: ReactionPayload }`          | User removed reaction              |
| `MESSAGE_RECEIVED`      | `{ roomId, message: ChatMessage }`               | Chat message sent                  |
| `USER_JOINED`           | `{ roomId, user: User }`                         | User joined room                   |
| `USER_LEFT`             | `{ roomId, user: User }`                         | User left room                     |
| `CONFIG_CHANGED`        | `{ roomId, pluginName, config, previousConfig }` | Plugin config updated              |
| `ROOM_SETTINGS_UPDATED` | `{ roomId, room: Room }`                         | Room settings changed              |
| `ROOM_DELETED`          | `{ roomId }`                                     | Room was deleted                   |
| `SEGMENT_ACTIVATED`     | `{ roomId, showId, segmentId, segmentTitle }`    | Admin activated a schedule segment |

### Game & inventory events

These fire when [game sessions & inventory](#game-sessions--inventory) are in use:

| Event                        | Payload (summary)                                             |
| ---------------------------- | ------------------------------------------------------------- |
| `GAME_SESSION_STARTED`       | `{ roomId, sessionId, config }`                               |
| `GAME_SESSION_ENDED`         | `{ roomId, sessionId, results }`                              |
| `GAME_STATE_CHANGED`         | `{ roomId, sessionId, userId, changes }`                      |
| `GAME_MODIFIER_APPLIED`      | `{ roomId, sessionId, userId, modifier }`                     |
| `GAME_MODIFIER_REMOVED`      | `{ roomId, sessionId, userId, modifierId, reason }`           |
| `INVENTORY_ITEM_ACQUIRED`    | `{ roomId, sessionId, userId, item, source }`                 |
| `INVENTORY_ITEM_USED`        | `{ roomId, sessionId, userId, item, result }`                 |
| `INVENTORY_ITEM_REMOVED`     | `{ roomId, sessionId, userId, itemId, quantity }`             |
| `INVENTORY_ITEM_TRANSFERRED` | `{ roomId, sessionId, fromUserId, toUserId, item, quantity }` |

### Example Event Handlers

```typescript
async register(context: PluginContext): Promise<void> {
  await super.register(context)

  this.on("TRACK_CHANGED", async (data) => {
    const config = await this.getConfig()
    if (!config?.enabled) return

    await this.context!.api.sendSystemMessage(
      data.roomId,
      `🎵 Now playing: ${data.track.title}`
    )
  })

  this.on("REACTION_ADDED", async (data) => {
    if (data.reaction.reactTo.type === "track") {
      const emoji = data.reaction.emoji.shortcodes
      console.log(`User reacted with ${emoji}`)
    }
  })

  this.on("USER_LEFT", async (data) => {
    // Check if any admins remain
    const users = await this.context!.api.getUsers(data.roomId)
    if (!users.some(u => u.isAdmin)) {
      // Disable plugin if no admins
    }
  })
}
```

## Queue Validation

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

## Configuration Schema

Define a schema to generate dynamic admin settings forms.

### Basic Schema

```typescript
getConfigSchema(): PluginConfigSchema {
  return {
    // JSON Schema from Zod
    jsonSchema: z.toJSONSchema(myConfigSchema),

    // Field order and layout elements
    layout: [
      { type: "heading", content: "My Plugin Settings" },
      {
        type: "text-block",
        content: "Configure your plugin settings below.",
        variant: "info",
      },
      "enabled",
      "threshold",
      "message",
    ],

    // Field-specific metadata
    fieldMeta: {
      enabled: {
        type: "boolean",
        label: "Enable Plugin",
        description: "Turn the plugin on or off",
      },
      threshold: {
        type: "number",
        label: "Threshold Value",
        showWhen: { field: "enabled", value: true },
      },
    },
  }
}
```

### Field Types

| Type         | Description      | Options                          |
| ------------ | ---------------- | -------------------------------- |
| `boolean`    | Toggle switch    | -                                |
| `string`     | Text input       | -                                |
| `number`     | Numeric input    | -                                |
| `enum`       | Dropdown select  | `enumLabels: { value: "Label" }` |
| `emoji`      | Emoji picker     | -                                |
| `duration`   | Time duration    | `displayUnit`, `storageUnit`     |
| `percentage` | Percentage input | -                                |

### Conditional Fields

Show/hide fields based on other values:

```typescript
fieldMeta: {
  threshold: {
    type: "number",
    label: "Threshold",
    showWhen: { field: "enabled", value: true },
  },
  // Multiple conditions (AND logic)
  advancedSetting: {
    type: "string",
    showWhen: [
      { field: "enabled", value: true },
      { field: "advancedMode", value: true },
    ],
  },
}
```

### Layout Elements

```typescript
layout: [
  // Heading
  { type: "heading", content: "Section Title" },

  // Text block with variant
  {
    type: "text-block",
    content: "Informational text here.",
    variant: "info", // "info" | "warning" | "example"
    showWhen: { field: "enabled", value: true },
  },

  // Text with template interpolation
  {
    type: "text-block",
    content: "Threshold is set to {{threshold:percentage}}.",
    variant: "example",
  },

  // Rich content with embedded components
  {
    type: "text-block",
    content: [
      { type: "text", content: "React with " },
      { type: "component", name: "emoji", props: { shortcodes: ":{{reactionType}}:" } },
      { type: "text", content: " to vote!" },
    ],
  },

  // Field reference (string = field name)
  "myFieldName",

  // Action button (see Plugin Actions section)
  {
    type: "action",
    action: "resetData",
    label: "Reset Data",
    variant: "destructive",
    confirmMessage: "Are you sure? This cannot be undone.",
    confirmText: "Reset",
  },
]
```

### Duration Fields

```typescript
fieldMeta: {
  timeLimit: {
    type: "duration",
    label: "Time Limit",
    description: "How long to wait (10-300 seconds)",
    displayUnit: "seconds",   // Show as seconds in UI
    storageUnit: "milliseconds", // Store as milliseconds
    showWhen: { field: "enabled", value: true },
  },
}
```

## Plugin Actions

Add action buttons to your plugin's config form to trigger server-side operations like resetting data, syncing state, or performing maintenance tasks.

### Defining Action Buttons

Add action elements to your config schema's `layout` array:

```typescript
getConfigSchema(): PluginConfigSchema {
  return {
    jsonSchema: z.toJSONSchema(myConfigSchema),
    layout: [
      "enabled",
      "threshold",
      // Action button at the end of the form
      {
        type: "action",
        action: "resetLeaderboards",      // Unique action identifier
        label: "Reset Leaderboards",      // Button text
        variant: "destructive",           // "solid" | "outline" | "ghost" | "destructive"
        confirmMessage: "Are you sure you want to reset all leaderboards? This cannot be undone.",
        confirmText: "Reset Leaderboards", // Confirmation button text
        showWhen: { field: "enabled", value: true }, // Optional conditional visibility
      },
    ],
    fieldMeta: { /* ... */ },
  }
}
```

### Action Element Properties

| Property         | Type     | Required | Description                                                      |
| ---------------- | -------- | -------- | ---------------------------------------------------------------- |
| `type`           | `string` | Yes      | Must be `"action"`                                               |
| `action`         | `string` | Yes      | Unique identifier passed to `executeAction()`                    |
| `label`          | `string` | Yes      | Button label text                                                |
| `variant`        | `string` | No       | Button style: `"solid"`, `"outline"`, `"ghost"`, `"destructive"` |
| `confirmMessage` | `string` | No       | If provided, shows confirmation dialog before executing          |
| `confirmText`    | `string` | No       | Text for the confirmation button (default: "Confirm")            |
| `showWhen`       | `object` | No       | Conditional visibility (same as field `showWhen`)                |

### Handling Actions

Override the `executeAction` method to handle action button clicks:

```typescript
async executeAction(action: string): Promise<{ success: boolean; message?: string }> {
  switch (action) {
    case "resetLeaderboards":
      return this.resetLeaderboards()
    case "syncData":
      return this.syncData()
    default:
      return { success: false, message: `Unknown action: ${action}` }
  }
}

private async resetLeaderboards(): Promise<{ success: boolean; message?: string }> {
  if (!this.context) {
    return { success: false, message: "Plugin not initialized" }
  }

  try {
    // Clear leaderboard data from storage
    const leaderboard = await this.context.storage.zrangeWithScores("leaderboard", 0, -1)
    for (const entry of leaderboard) {
      await this.context.storage.zrem("leaderboard", entry.value)
    }

    // IMPORTANT: Emit event with updated store keys to refresh frontend
    await this.emit("LEADERBOARDS_RESET", {
      usersLeaderboard: [],      // Include store keys in event data
      allWordsLeaderboard: [],   // Frontend will update its store
    })

    return { success: true, message: "Leaderboards have been reset" }
  } catch (error) {
    return { success: false, message: `Error: ${error}` }
  }
}
```

### Updating Frontend After Actions

When an action modifies data that's displayed in plugin components, you must emit an event containing the updated store keys. The frontend's `pluginComponentMachine` listens for `PLUGIN:{pluginName}:*` events and updates its store when event data contains any of the plugin's `storeKeys`.

```typescript
// Component schema defines which keys to watch
getComponentSchema(): PluginComponentSchema {
  return {
    components: [ /* ... */ ],
    storeKeys: ["usersLeaderboard", "allWordsLeaderboard"], // Keys that trigger updates
  }
}

// Event must include the store keys for frontend to update
await this.emit("DATA_RESET", {
  usersLeaderboard: [],      // ✓ Frontend will update
  allWordsLeaderboard: [],   // ✓ Frontend will update
})

// This won't update the frontend (no store keys in payload)
await this.emit("DATA_RESET", {})  // ✗ Frontend won't know to update
```

### Event Flow

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Admin clicks "Reset Leaderboards" button                                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Frontend emits EXECUTE_PLUGIN_ACTION via Socket.IO                      │
│   { pluginName: "special-words", action: "resetLeaderboards" }          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Server: PluginRegistry.executePluginAction() calls plugin.executeAction │
│   (optional second arg: initiator { userId, username } from admin socket) │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Plugin: executeAction("resetLeaderboards")                              │
│   1. Clear data from storage                                            │
│   2. Emit event with new store values                                   │
│   3. Return { success: true, message: "..." }                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Frontend receives:                                                       │
│   1. PLUGIN_ACTION_RESULT → Shows success/error toast                   │
│   2. PLUGIN:special-words:LEADERBOARDS_RESET → Updates component store  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Complete Example

```typescript
// schema.ts
export function getConfigSchema(): PluginConfigSchema {
  return {
    jsonSchema: z.toJSONSchema(myConfigSchema),
    layout: [
      { type: "heading", content: "My Plugin" },
      "enabled",
      "words",
      "showLeaderboard",
      // Destructive action with confirmation
      {
        type: "action",
        action: "resetLeaderboards",
        label: "Reset Leaderboards",
        variant: "destructive",
        confirmMessage: "Are you sure? All scores will be lost.",
        confirmText: "Reset",
        showWhen: { field: "enabled", value: true },
      },
      // Simple action without confirmation
      {
        type: "action",
        action: "syncNow",
        label: "Sync Now",
        variant: "outline",
        showWhen: { field: "enabled", value: true },
      },
    ],
    fieldMeta: {
      /* ... */
    },
  }
}
```

```typescript
// index.ts
async executeAction(action: string): Promise<{ success: boolean; message?: string }> {
  switch (action) {
    case "resetLeaderboards":
      return this.resetLeaderboards()
    case "syncNow":
      return this.syncNow()
    default:
      return { success: false, message: `Unknown action: ${action}` }
  }
}

private async resetLeaderboards(): Promise<{ success: boolean; message?: string }> {
  // ... clear data ...

  // Update frontend components
  await this.emit("LEADERBOARDS_RESET", {
    usersLeaderboard: [],
    allWordsLeaderboard: [],
  })

  return { success: true, message: "Leaderboards reset successfully" }
}

private async syncNow(): Promise<{ success: boolean; message?: string }> {
  // ... perform sync ...
  return { success: true, message: "Sync completed" }
}
```

## Plugin Components

Define declarative UI components that render in the frontend without React code in your plugin.

### Component Schema

```typescript
import type { PluginComponentSchema, PluginComponentState } from "@repo/types"

getComponentSchema(): PluginComponentSchema {
  return {
    components: [
      // Text with countdown timer
      {
        id: "countdown-text",
        type: "text-block",
        area: "nowPlaying",
        showWhen: { field: "showCountdown", value: true },
        content: [
          { type: "text", content: "React with " },
          { type: "component", name: "emoji", props: { emoji: "{{config.reactionType}}" } },
          { type: "text", content: " to keep playing" },
        ],
      },

      // Countdown timer
      {
        id: "countdown-timer",
        type: "countdown",
        area: "nowPlaying",
        showWhen: { field: "showCountdown", value: true },
        startKey: "trackStartTime",      // Read from store
        duration: "config.timeLimit",     // Read from config
      },

      // Badge
      {
        id: "skipped-badge",
        type: "badge",
        area: "nowPlayingBadge",
        showWhen: { field: "isSkipped", value: true },
        label: "Skipped",
        variant: "warning",
        icon: "skip-forward",
        tooltip: "{{voteCount}}/{{requiredCount}} votes",
      },

      // Button that opens modal
      {
        id: "leaderboard-button",
        type: "button",
        area: "userList",
        showWhen: { field: "enabled", value: true },
        label: "{{config.wordLabel:pluralize:2}} Leaderboard",
        icon: "trophy",
        opensModal: "leaderboard-modal",
      },

      // Modal with nested components
      {
        id: "leaderboard-modal",
        type: "modal",
        area: "userList",
        title: "{{config.wordLabel:pluralize:2}} Leaderboard",
        size: "lg",
        children: [
          {
            id: "users-leaderboard",
            type: "leaderboard",
            area: "userList",
            dataKey: "usersLeaderboard",
            title: "Top Users",
            rowTemplate: [
              { type: "component", name: "username", props: { userId: "{{value}}" } },
              { type: "text", content: ": {{score}} {{config.wordLabel:pluralize:score}}" },
            ],
            maxItems: 10,
            showRank: true,
          },
        ],
      },
    ],

    // Keys that trigger component updates from plugin events
    storeKeys: ["showCountdown", "trackStartTime", "isSkipped", "voteCount", "requiredCount"],
  }
}
```

### Component Areas

| Area              | Location                             | Item Context Available |
| ----------------- | ------------------------------------ | ---------------------- |
| `nowPlaying`      | Below now playing info               | No                     |
| `nowPlayingInfo`  | Inline with now playing details      | No                     |
| `nowPlayingBadge` | Badge area near title                | No                     |
| `nowPlayingArt`   | Overlay on album art                 | No                     |
| `playlistItem`    | Per-track in playlist                | Yes (track data)       |
| `userList`        | User list section                    | No                     |
| `userListItem`    | Per-user in list                     | Yes (user data)        |
| `gameStateTab`    | Tab content in user game state modal | No                     |

### Component Types

| Type               | Description                | Key Props                                                       |
| ------------------ | -------------------------- | --------------------------------------------------------------- |
| `text`             | Inline text                | `content`, `variant`                                            |
| `text-block`       | Block text                 | `content`, `variant`                                            |
| `heading`          | Section heading            | `content`, `level`                                              |
| `emoji`            | Emoji display              | `emoji`, `size`                                                 |
| `icon`             | Icon display               | `icon`, `size`, `color`                                         |
| `button`           | Clickable button           | `label`, `icon`, `opensModal`, `action`                         |
| `badge`            | Status badge               | `label`, `variant`, `icon`, `tooltip`                           |
| `leaderboard`      | Ranked list                | `dataKey`, `title`, `rowTemplate`, `maxItems`                   |
| `countdown`        | Timer display              | `startKey`, `duration`, `text`                                  |
| `modal`            | Dialog container           | `title`, `size`, `children`                                     |
| `tab`              | Tab in game state modal    | `label`, `icon?`, `children` (only in `gameStateTab`)           |
| `game-leaderboard` | Session leaderboard        | `leaderboardId`, `title?`, `maxItems`, `showRank`               |
| `game-attribute`   | One attribute value        | `attribute`, `format?`, `icon?`, `label?`                       |
| `modifier-badge`   | Active modifier hint       | `modifier`, `variant?`, `label?`, `icon?`                       |
| `inventory-button` | Opens inventory modal      | `label`, `opensModal`, `icon?`                                  |
| `inventory-grid`   | Item grid (often in modal) | `showQuantity`, `allowUse`, `allowTrade`, `filterSourcePlugin?` |
| `item-badge`       | Owns-item indicator        | `definitionId`, `showQuantity`                                  |

**Available Icons:**

`trophy`, `star`, `medal`, `award`, `heart`, `skip-forward`, `swords`,
`coins`, `shopping-cart`, `package`

### Per-Item Components

Components in `userListItem` or `playlistItem` areas render once per item (user or track). These areas provide an `itemContext` with item-specific data that can be used in `showWhen` conditions.

#### User List Item Context

For `userListItem` components, the following fields are available:

| Field        | Type      | Description                      |
| ------------ | --------- | -------------------------------- |
| `userId`     | `string`  | The user's unique ID             |
| `isDeputyDj` | `boolean` | Whether the user is a deputy DJ  |
| `isDj`       | `boolean` | Whether the user is currently DJ |
| `isAdmin`    | `boolean` | Whether the user is room admin   |

#### Using Item Context in showWhen

Use the `item.` prefix to check item context values:

```typescript
{
  id: "deputy-badge",
  type: "icon",
  area: "userListItem",
  icon: "star",
  color: "yellow.400",
  showWhen: [
    { field: "enabled", value: true },           // Check plugin config
    { field: "item.isDeputyDj", value: true },   // Check item context
  ],
}
```

#### Example: Competitive Mode Icon

Show a sword icon next to deputy DJs when competitive mode is enabled:

```typescript
getComponentSchema(): PluginComponentSchema {
  return {
    components: [
      {
        id: "competitive-user-icon",
        type: "icon",
        area: "userListItem",
        icon: "swords",
        size: "sm",
        color: "orange.400",
        showWhen: [
          { field: "enabled", value: true },
          { field: "competitiveModeEnabled", value: true },
          { field: "item.isDeputyDj", value: true },
        ],
      },
      // ... other components
    ],
    storeKeys: ["competitiveModeEnabled"],
  }
}
```

The icon will only appear for users where:

1. The plugin is enabled (`config.enabled === true`)
2. Competitive mode is on (`config.competitiveModeEnabled === true` or `store.competitiveModeEnabled === true`)
3. The specific user is a deputy DJ (`itemContext.isDeputyDj === true`)

### Component State

Provide initial state for components:

```typescript
async getComponentState(): Promise<PluginComponentState> {
  if (!this.context) return {}

  const config = await this.getConfig()
  if (!config?.enabled) {
    return { showCountdown: false }
  }

  const nowPlaying = await this.context.api.getNowPlaying(this.context.roomId)

  return {
    showCountdown: true,
    trackStartTime: nowPlaying?.playedAt
      ? new Date(nowPlaying.playedAt).getTime()
      : null,
    isSkipped: false,
    voteCount: 0,
    requiredCount: 5,
  }
}
```

### Updating Component State

Emit plugin events to update component state. The frontend automatically updates `storeKeys` from event payloads:

```typescript
// When track starts
await this.emit("TRACK_STARTED", {
  showCountdown: true,
  trackStartTime: Date.now(),
})

// When track is skipped
await this.emit("TRACK_SKIPPED", {
  isSkipped: true,
  voteCount: 3,
  requiredCount: 5,
})

// When plugin is disabled
await this.emit("PLUGIN_DISABLED", {
  showCountdown: false,
})
```

### Template Interpolation

Use `{{field}}` syntax in component props:

| Syntax                      | Description              |
| --------------------------- | ------------------------ |
| `{{field}}`                 | Simple value             |
| `{{field:duration}}`        | Format as duration       |
| `{{field:percentage}}`      | Format as percentage     |
| `{{field:pluralize:count}}` | Pluralize based on count |
| `{{config.fieldName}}`      | Value from plugin config |

### Composite Templates

Mix text and components:

```typescript
content: [
  { type: "text", content: "User " },
  { type: "component", name: "username", props: { userId: "{{value}}" } },
  { type: "text", content: " scored {{score}} points" },
]
```

## Data Augmentation

Add plugin-specific metadata to playlist items and now playing tracks.

### Playlist Augmentation

```typescript
async augmentPlaylistBatch(items: QueueItem[]): Promise<PluginAugmentationData[]> {
  if (!this.context || items.length === 0) {
    return items.map(() => ({}))
  }

  // Batch fetch for efficiency
  const trackIds = items.map(item => item.mediaSource.trackId)
  const skipKeys = trackIds.map(id => `skipped:${id}`)
  const skipDataStrings = await this.context.storage.mget(skipKeys)

  return skipDataStrings.map(dataStr => {
    if (!dataStr) return {}
    try {
      const skipData = JSON.parse(dataStr)
      return { skipped: true, skipData }
    } catch {
      return {}
    }
  })
}
```

### Now Playing Augmentation

```typescript
async augmentNowPlaying(item: QueueItem): Promise<PluginAugmentationData> {
  if (!this.context) return {}

  const config = await this.getConfig()
  if (!config?.enabled) return {}

  const skipData = await this.context.storage.get(`skipped:${item.mediaSource.trackId}`)
  if (!skipData) return {}

  return {
    skipped: true,
    skipData: JSON.parse(skipData),
    // Style hints for the now playing UI
    styles: {
      title: {
        textDecoration: "line-through",
        opacity: 0.7,
      },
    },
  }
}
```

## Room Export

Plugins can contribute to room exports in two ways:

1. **Add export data and markdown sections** via `augmentRoomExport()`
2. **Format per-item plugin data** via `formatPluginDataMarkdown()`

Note: Data from `augmentPlaylistBatch` and `augmentNowPlaying` is automatically included in exports via `item.pluginData`.

### Export Augmentation

Add summary data and/or additional markdown sections to exports:

```typescript
import type { RoomExportData, PluginExportAugmentation } from "@repo/types"

async augmentRoomExport(exportData: RoomExportData): Promise<PluginExportAugmentation> {
  // Count tracks that were skipped by this plugin
  const skippedTracks = exportData.playlist.filter(
    item => item.pluginData?.["playlist-democracy"]?.skipped
  )

  // Calculate stats
  const totalSkipped = skippedTracks.length
  const totalVotes = skippedTracks.reduce(
    (sum, item) => sum + (item.pluginData?.["playlist-democracy"]?.skipData?.voteCount || 0),
    0
  )

  return {
    // Data added to export.pluginExports["playlist-democracy"]
    data: {
      totalSkipped,
      totalVotes,
      averageVotesPerSkip: totalSkipped > 0 ? totalVotes / totalSkipped : 0,
    },

    // Additional markdown sections appended to export
    markdownSections: [
      `## Playlist Democracy Stats\n\n` +
      `- **Tracks Skipped:** ${totalSkipped}\n` +
      `- **Total Votes Cast:** ${totalVotes}\n` +
      `- **Average Votes per Skip:** ${(totalVotes / totalSkipped).toFixed(1)}`,
    ],
  }
}
```

### Per-Item Markdown Formatting

Format your plugin's augmented data as markdown for playlist items, chat messages, etc.:

```typescript
import type { PluginMarkdownContext } from "@repo/types"

formatPluginDataMarkdown(
  pluginData: unknown,
  context: PluginMarkdownContext
): string | null {
  // Only format for playlist items
  if (context.type !== "playlist") return null

  const data = pluginData as { skipped?: boolean; skipData?: { voteCount: number; requiredCount: number } }

  if (!data.skipped || !data.skipData) return null

  const { voteCount, requiredCount } = data.skipData
  return `⏭️ Skipped (${voteCount}/${requiredCount} votes)`
}
```

This method is called for each item that has your plugin's data in `pluginData`. The returned string appears in the "Notes" column of playlist tables in markdown exports.

### Context Types

The `context.type` parameter indicates what kind of item is being formatted:

| Type         | Description                 |
| ------------ | --------------------------- |
| `playlist`   | Historical playlist item    |
| `chat`       | Chat message                |
| `queue`      | Track in the upcoming queue |
| `nowPlaying` | Currently playing track     |

### Export Data Structure

The `RoomExportData` passed to `augmentRoomExport` contains:

```typescript
interface RoomExportData {
  exportedAt: string // ISO timestamp
  room: RoomExportInfo // Room metadata
  users: User[] // Current users
  playlist: QueueItem[] // With pluginData from augmentation
  chat: ChatMessage[] // Chat history
  queue: QueueItem[] // Upcoming tracks
  reactions: ReactionStore // All reactions by type/id
  pluginExports?: Record<string, unknown> // Plugin data added here
}
```

### Example: Complete Export Implementation

```typescript
import type { RoomExportData, PluginExportAugmentation, PluginMarkdownContext } from "@repo/types"

export class MyPlugin extends BasePlugin<MyConfig> {
  // ... other methods ...

  async augmentRoomExport(exportData: RoomExportData): Promise<PluginExportAugmentation> {
    const config = await this.getConfig()

    // Get plugin-specific stats
    const stats = await this.calculateExportStats(exportData)

    return {
      data: {
        enabled: config?.enabled ?? false,
        ...stats,
      },
      markdownSections: config?.enabled ? [this.generateMarkdownSection(stats)] : [],
    }
  }

  formatPluginDataMarkdown(pluginData: unknown, context: PluginMarkdownContext): string | null {
    const data = pluginData as MyPluginData | undefined
    if (!data) return null

    switch (context.type) {
      case "playlist":
        return data.highlighted ? "⭐ Featured" : null
      case "chat":
        return data.specialWord ? `🎯 ${data.specialWord}` : null
      default:
        return null
    }
  }

  private async calculateExportStats(exportData: RoomExportData) {
    // Analyze export data for plugin-specific metrics
    return {
      itemsProcessed: exportData.playlist.length,
      // ... more stats
    }
  }

  private generateMarkdownSection(stats: any): string {
    return `## My Plugin Summary\n\n- Items processed: ${stats.itemsProcessed}`
  }
}
```

## Storage API

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

## Game Sessions & Inventory

Listening Room provides **core infrastructure** for cross-plugin game state so plugins can share `score` / `coin`, timed modifiers, configurable leaderboards, and a single inventory per user—without each plugin rolling its own Redis keys.

**Architecture:** See [ADR 0040: Game Sessions and Inventory](adrs/0040-game-sessions-and-inventory.md).

### When to use what

| Approach                                     | Use when                                                                                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **`this.context.storage`** (`zincrby`, etc.) | Scoreboards or state that should stay **isolated** to your plugin (current behaviour for Guess the Tune, etc.).                           |
| **`this.game` / `this.inventory`**           | **Shared** economy (`coin`), unified leaderboards, buffs/debuffs that affect multiple plugins, items another plugin can award or consume. |

Access APIs via **`this.game`** and **`this.inventory`** on `BasePlugin` (aliases for `this.context!.game` / `this.context!.inventory`). They are room-scoped: you never pass `roomId`; the server ties calls to the plugin’s room.

If `GameSessionService` is not running (should not happen in production), methods no-op or return empty values safely.

### Attributes

- **Core attributes** — `score` and `coin`. Any plugin may read and write them (cross-plugin economy).
- **Plugin attributes** — Namespaced as `"<plugin-name>:<key>"` (e.g. `"guess-the-tune:streak"`). Convention: only the **owning** plugin writes its namespace; everyone may read.

Register metadata for your custom attributes so UIs can discover them:

```typescript
await super.register(context)

this.game.registerAttributes([
  {
    name: "streak",
    type: "counter",
    description: "Correct guesses in a row",
    defaultValue: 0,
    label: "Streak",
  },
])
```

### Game session API (`this.game`)

| Method                                         | Description                                                                                                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getActiveSession()`                           | Current `GameSession` or `null`.                                                                                                                                                         |
| `startSession(config)`                         | Starts a session; ends any existing active session for the room. Pass at least `{ name: string }`; other fields get defaults (`enabledAttributes`, leaderboards, inventory flags, etc.). |
| `endSession()`                                 | Ends the active session; returns `GameSessionResults` or `null`.                                                                                                                         |
| `registerAttributes(defs)`                     | Registers `PluginAttributeDefinition[]` (fire-and-forget).                                                                                                                               |
| `addScore(userId, attribute, amount, reason?)` | Adds to an attribute; applies active **multiplier** / **additive** modifiers; returns new value. **Lock** effects block changes.                                                         |
| `setScore(userId, attribute, value, reason?)`  | Sets absolute value (ignores multiplier/additive on that write path).                                                                                                                    |
| `applyModifier(userId, modifier)`              | Applies a modifier with your own `startAt` / `endAt` (ms); `source` is set to your plugin name. Omit `id` and `source` from the payload.                                                                               |
| `applyTimedModifier(userId, durationMs, modifier)` | Same as `applyModifier`, but sets `startAt = Date.now()` and `endAt = startAt + durationMs`. Omit `startAt`, `endAt`, `id`, and `source` from the payload.                                                        |
| `removeModifier(userId, modifierId)`           | Removes one modifier instance.                                                                                                                                                           |
| `getUserState(userId)`                         | Full `UserGameState` or `null` if no active session.                                                                                                                                     |
| `getLeaderboard(leaderboardId)`                | Hydrated rows (`GameLeaderboardEntry[]`) for a `LeaderboardConfig.id`.                                                                                                                   |

**Modifiers** support `stackBehavior`: `"replace"` | `"stack"` | `"extend"`, plus optional `maxStacks`. Effects include `multiplier`, `additive`, `set`, `lock`, and `flag` on targets — see `@repo/types` (`GameStateModifier`, `GameStateEffect`, `GameStateEffectWithMeta`). Per-effect metadata may include optional **`icon`** (e.g. Lucide name for UIs) and **`intent`** (`"positive"` \| `"negative"` \| `"neutral"`) for styling (e.g. modifier lists).

### Inventory API (`this.inventory`)

Items are **defined** by plugins and **stored** by core so any plugin can `giveItem` using another plugin’s `definitionId`.

Register definitions in `register()` (ids are built as `"<your-plugin-name>:<shortId>"`):

```typescript
this.inventory.registerItemDefinitions([
  {
    shortId: "speed-potion",
    name: "Speed Potion",
    description: "2× score for 60 seconds",
    stackable: true,
    maxStack: 99,
    tradeable: true,
    consumable: true,
    coinValue: 10,
  },
])
```

| Method                                                          | Description                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `registerItemDefinitions(defs)`                                 | One or more definitions without `id` / `sourcePlugin` (set automatically).                             |
| `giveItem(userId, definitionId, quantity?, metadata?, source?)` | Awards items; respects stacking, slot limits, session config.                                          |
| `removeItem(userId, itemId, quantity?)`                         | Removes quantity from a stack.                                                                         |
| `transferItem(fromUserId, toUserId, itemId, quantity?)`         | Only if `ItemDefinition.tradeable` and the active session allows trading.                              |
| `useItem(userId, itemId, context?)`                             | Validates ownership, calls the **defining** plugin’s `onItemUsed`, may decrement if result `consumed`. |
| `getInventory(userId)`                                          | `UserInventory` (items + `maxSlots`).                                                                  |
| `hasItem(userId, definitionId, minQuantity?)`                   | Convenience check.                                                                                     |
| `getItemDefinition(definitionId)`                               | Async lookup.                                                                                          |
| `getAllItemDefinitions()`                                       | All definitions registered for the room.                                                               |

### Handling item use (`onItemUsed`)

Override on your plugin class when you register consumables or usable items. The server routes `useItem` to the plugin that **owns** the item definition.

```typescript
async onItemUsed(
  userId: string,
  item: InventoryItem,
  definition: ItemDefinition,
  _context?: unknown,
): Promise<ItemUseResult> {
  if (definition.shortId === "speed-potion") {
    await this.game.applyTimedModifier(userId, 60_000, {
      name: "speed_boost",
      effects: [{ type: "multiplier", target: "score", value: 2 }],
      stackBehavior: "extend",
    })
    return { success: true, consumed: true, message: "Speed boost!" }
  }
  return { success: false, consumed: false, message: "Unknown item" }
}
```

`BasePlugin` provides a default implementation that returns “not handled”; override only when you define items.

For **`effects` of type `"flag"`**, derive booleans with **`getActiveFlags(userState.modifiers, Date.now())`** from **`@repo/types`** (see [ADR 0044](adrs/0044-derived-modifier-flags.md)). For items with **`requiresTarget: "user"`**, the socket passes **`callContext`** as **`{ targetUserId?: string }`** — validate the user is still in the room before applying effects to them.

### Handling item sell-back (`onItemSold`)

When a user sells an item from their inventory (via the built-in **Inventory** tab in the User Game State modal, which emits `SELL_INVENTORY_ITEM`), the server routes the sale to the plugin that owns the item definition through `onItemSold`. The plugin is responsible for the full sale: removing the item from inventory, refunding coins, restocking, and emitting any UI updates.

When implementing a shop, prefer the [`ShopHelper`](#shop-helper) (or extend [`ShopPlugin`](#shop-helper)) rather than rolling this logic by hand.

```typescript
async onItemSold(
  userId: string,
  item: InventoryItem,
  definition: ItemDefinition,
): Promise<ItemSellResult> {
  const config = await this.getConfig()
  return this.shop.sell({ userId }, item.itemId, { basePrice: config.skipTokenPrice })
}
```

If a plugin defines tradeable items but doesn't implement `onItemSold`, attempting to sell those items returns "this item can't be sold" to the client.

### System events (subscribe via `this.on`)

Emitters use `SystemEvents` (same pipeline as other domain events). Useful payloads:

| Event                        | When                                                              |
| ---------------------------- | ----------------------------------------------------------------- |
| `GAME_SESSION_STARTED`       | `{ roomId, sessionId, config }`                                   |
| `GAME_SESSION_ENDED`         | `{ roomId, sessionId, results }`                                  |
| `GAME_STATE_CHANGED`         | `{ roomId, sessionId, userId, changes }` — attribute deltas       |
| `GAME_MODIFIER_APPLIED`      | Modifier applied or extended                                      |
| `GAME_MODIFIER_REMOVED`      | Expired or manually removed                                       |
| `INVENTORY_ITEM_ACQUIRED`    | Item given (source: `plugin` \| `trade` \| `purchase` \| `admin`) |
| `INVENTORY_ITEM_USED`        | After `useItem` completes                                         |
| `INVENTORY_ITEM_REMOVED`     | Partial/full stack removal                                        |
| `INVENTORY_ITEM_TRANSFERRED` | Player-to-player transfer                                         |

### Segment-bound sessions (scheduling)

If a show segment includes **`gameSessionPreset`** on `SegmentDTO`, activating that segment **ends** any prior game session for the room and **starts** a new one from the preset (when preset apply mode is not `"skip"`). Presets are partial configs plus a required `name`; optional `segmentId` is filled at activation.

This ties session lifetime to segment changes without extra plugin code.

### UI components (declarative)

Add these to `getComponentSchema()` like other template-backed components. Types live in `@repo/types` (`PluginComponentDefinition`).

| Type               | Typical area             | Purpose                                             |
| ------------------ | ------------------------ | --------------------------------------------------- |
| `game-leaderboard` | `userList`, `nowPlaying` | Ranks by `leaderboardId` from active session config |
| `game-attribute`   | `userListItem`           | Single attribute (`score`, `coin`, or namespaced)   |
| `modifier-badge`   | `userListItem`           | Show when a named modifier is active                |
| `inventory-button` | `userList`               | Opens a modal (`opensModal`)                        |
| `inventory-grid`   | Inside a `modal`         | Grid with optional use/trade                        |
| `item-badge`       | `userListItem`           | Badge when user owns `definitionId`                 |

Frontends must implement these template names alongside existing ones (`leaderboard`, `badge`, etc.). Until implemented, they may no-op.

### Session configuration snapshot

`GameSessionConfig` includes `enabledAttributes`, `initialValues`, `leaderboards`, timing (`startsAt` / `endsAt` / `duration`), `mode` (`individual` \| `team`), optional `teams`, `segmentId`, and inventory flags: `inventoryEnabled`, `maxInventorySlots`, `allowTrading`, `allowSelling`.

---

## Shop Helper

Plugins that sell items for in-game `coin` (e.g. Music Shop) can compose a **`ShopHelper`** from `@repo/plugin-base/helpers` instead of writing stock / purchase / sell logic by hand. The helper:

- Stores per-item stock in plugin storage (`shop:stock:<shortId>`).
- Performs purchase / sell flows atomically and refunds on failure (sold out, can't afford, inventory full).
- Generates declarative UI components for an entire shop tab.
- Provides default `storeKeys` and a `getComponentState` snapshot of stock levels for the renderer.

`ShopHelper` is intentionally **composable** rather than an inheritance layer, so a single plugin can mix multiple helpers (e.g. shop + game) without single-inheritance conflicts.

**`ShopPlugin`:** For a typical coin shop, you can extend **`ShopPlugin<TConfig>`** from `@repo/plugin-base` instead of hand-wiring `ShopHelper`, `executeAction`, `onItemSold`, and stock-related plugin events. It composes `ShopHelper` internally; subclasses provide `shopItems`, `isShopEnabled`, and `isSellingItems`, and may override hooks for item behaviour. See [ADR 0045: ShopPlugin base class](adrs/0045-shop-plugin-base-class.md). Prefer raw **`ShopHelper`** when you need to compose multiple helpers or avoid a shop-specific base class.

### `ShopItem`

```typescript
interface ShopItem {
  // Item definition (registered via inventory.registerItemDefinitions)
  definition: Omit<ItemDefinition, "id" | "sourcePlugin">
  // Starting stock per game session (restocked on `restockAll`)
  initialStock: number
  // Fraction of price refunded when sold back (0-1)
  sellBackRatio: number
}
```

### ShopHelper Methods

| Method                                                       | Purpose                                                                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `getItem(shortId)`                                           | Look up the registered `ShopItem`.                                                                                                    |
| `getDefinitionId(shortId)`                                   | Fully-qualified id (`"<plugin>:<shortId>"`).                                                                                          |
| `getSellPrice(shortId, basePrice?)`                          | Computed sell price (`floor(price * sellBackRatio)`).                                                                                 |
| `registerItems()`                                            | Forwards every item definition to `inventory.registerItemDefinitions`.                                                                |
| `getStock(shortId)` / `getAllStock()`                        | Read current stock.                                                                                                                   |
| `setStock`, `decrementStock`, `incrementStock`, `restockAll` | Stock mutations (atomic where it matters).                                                                                            |
| `purchase(initiator, shortId, price)`                        | Atomic buy: stock check → coin debit → `giveItem`, with refunds on any failure.                                                       |
| `purchaseCatalogItem(initiator, shortId)`                    | Same as `purchase` using the item’s catalog `coinValue` (common case for fixed prices).                                            |
| `matchBuyAction(action, buyPrefix?)`                        | Returns the `shortId` if `action` matches the generated buy action for an item (default prefix `buy`, e.g. `buySkipToken`).            |
| `sell(initiator, itemId, options?)`                          | Sell-back: validates ownership + source plugin → `removeItem` → coin credit → restock.                                                |
| `generateComponents(options?)`                               | Build declarative UI for every item (heading + description + buy button). Suitable for placing inside a `tab` component's `children`. |
| `getStoreKeys()`                                             | Default store keys to expose to the frontend (`<shortIdCamel>Stock`).                                                                 |
| `getComponentState()`                                        | Stock snapshot for `getComponentState` (per-item stock keys).                                                                          |
| `getComponentStateWithSellPrice(quoteShortId)`              | Stock snapshot plus a `sellPrice` field from `getSellPrice(quoteShortId)` (e.g. for `STOCK_CHANGED` / UI).                           |

### Usage

Define items in a static catalog using `ShopCatalogEntry`, then convert to `ShopItem[]`:

```typescript
// types.ts
import {
  buildShopItemsFromCatalog,
  type ShopCatalogEntry,
  type ShopItem,
} from "@repo/plugin-base"

export const CATALOG: readonly ShopCatalogEntry[] = [
  {
    shortId: "skip-token",
    name: "Skip Token",
    description: "Skip the currently playing song instantly.",
    stackable: true,
    maxStack: 99,
    tradeable: true,
    consumable: true,
    coinValue: 100,
    icon: "skip-forward",
    initialStock: 3,
    sellBackRatio: 0.5,
  },
]

export function buildShopItems(): ShopItem[] {
  return buildShopItemsFromCatalog(CATALOG)
}

export function getCatalogEntry(shortId: string): ShopCatalogEntry {
  const entry = CATALOG.find((e) => e.shortId === shortId)
  if (!entry) throw new Error(`Unknown item: ${shortId}`)
  return entry
}
```

```typescript
// index.ts
import { BasePlugin, ShopHelper } from "@repo/plugin-base"
import { buildShopItems, getCatalogEntry } from "./types"

class MusicShopPlugin extends BasePlugin<MusicShopConfig> {
  name = "music-shop"
  private shop!: ShopHelper

  async register(context: PluginContext) {
    await super.register(context)
    this.shop = new ShopHelper(this.name, context, buildShopItems())
    this.shop.registerItems()
    this.on("GAME_SESSION_STARTED", () => this.shop.restockAll())
  }

  async executeAction(action: string, initiator?: PluginActionInitiator) {
    if (action === "buySkipToken") {
      const config = await this.getConfig()
      if (!config?.isSellingItems) {
        return { success: false, message: "Shop is closed." }
      }
      const price = getCatalogEntry("skip-token").coinValue
      return this.shop.purchase(initiator, "skip-token", price)
    }
    return { success: false, message: `Unknown action: ${action}` }
  }

  async onItemSold(userId: string, item: InventoryItem) {
    const price = getCatalogEntry("skip-token").coinValue
    return this.shop.sell({ userId }, item.itemId, { basePrice: price })
  }
}
```

### Composing multiple helpers

Because `ShopHelper` is a member rather than a base class, a plugin can hold several helpers without inheritance conflicts:

```typescript
class TriviaPlugin extends BasePlugin<TriviaConfig> {
  private shop!: ShopHelper
  // Future: private rounds!: RoundsHelper
  // Future: private leaderboard!: LeaderboardHelper

  async register(context: PluginContext) {
    await super.register(context)
    this.shop = new ShopHelper(this.name, context, this.hintItems)
    this.shop.registerItems()
  }
}
```

### Recommended `isSellingItems` config flag

Shop plugins should expose a separate boolean for "actively selling" so admins can pause sales without disabling item effects:

| `enabled` | `isSellingItems` | Behavior                                                                 |
| --------- | ---------------- | ------------------------------------------------------------------------ |
| `true`    | `true`           | Shop tab visible, can buy, can use, can sell back.                       |
| `true`    | `false`          | Shop tab hidden, purchases blocked. Items still **usable** and sellable. |
| `false`   | -                | Plugin fully off (item effects also blocked).                            |

The Music Shop plugin's `executeAction("buySkipToken", ...)` rejects when `config.isSellingItems` is false even though the plugin itself is enabled.

---

## Game State Tabs

The user's **Game State modal** (opened via the game state button in the room header) is a tabbed container. The first tab is always the built-in **Inventory** tab (with attribute stats, items, and Use / Sell buttons). Plugins can register additional tabs declaratively.

### Registering a tab

Use the `gameStateTab` area together with the `tab` component type in `getComponentSchema()`:

```typescript
getComponentSchema(): PluginComponentSchema {
  return {
    components: [
      {
        id: "music-shop-tab",
        type: "tab",
        area: "gameStateTab",
        label: "Shop",
        icon: "shopping-cart",
        // Tab is hidden when these conditions don't match.
        showWhen: [
          { field: "enabled", value: true },
          { field: "isSellingItems", value: true },
        ],
        children: [
          // Anything renderable in `gameStateTab`. Reuse template
          // components like `text-block`, `heading`, `button`,
          // `game-attribute`, etc.
          {
            id: "shop-coin-balance",
            type: "game-attribute",
            area: "gameStateTab",
            attribute: "coin",
            label: "Your balance",
            icon: "coins",
          },
          {
            id: "shop-skip-token-stock",
            type: "text-block",
            area: "gameStateTab",
            content: "{{skipTokenStock}} in stock",
          },
          {
            id: "shop-buy-skip-token",
            type: "button",
            area: "gameStateTab",
            label: "Buy ({{config.skipTokenPrice}} coins)",
            action: "buySkipToken",
          },
        ],
      },
    ],
    storeKeys: ["skipTokenStock"],
  }
}
```

Tabs render in **registration order**; the built-in **Inventory** tab is always first.

### `game-attribute` and `UserGameStateContext`

Plugin tab content is rendered inside a `UserGameStateContext`, which exposes the current user's attributes, inventory, and active session. The `game-attribute` template component reads from this context, so `{ type: "game-attribute", attribute: "coin" }` displays the user's live coin balance without any additional wiring.

If you need to read game state from custom React components, import the hook:

```tsx
import { useUserGameState } from "@/components/Modals/UserGameStateContext"

function MyTabContent() {
  const gs = useUserGameState()
  if (!gs) return null
  return <span>{gs.getAttribute("coin")} coins</span>
}
```

The context is `null` outside the game state modal, so components can render meaningful fallbacks when used elsewhere.

### Inventory actions

The built-in Inventory tab exposes per-item buttons:

- **Use** – emitted as `USE_INVENTORY_ITEM { itemId, targetUserId? }`. Optional **`targetUserId`** is sent when the item’s definition has **`requiresTarget: "user"`** (target picker in the inventory tab). Passed through as **`callContext`** to `onItemUsed`. See [ADR 0043](adrs/0043-inventory-item-targeting.md).
- **Sell** – emitted as `SELL_INVENTORY_ITEM { itemId }`. Routes to the source plugin's `onItemSold` (typically `ShopHelper.sell`).

The buttons render automatically based on the `ItemDefinition` flags: **Use** appears for `consumable` items, **Sell** appears for `tradeable` items with a positive `coinValue`. The server responds with `INVENTORY_ACTION_RESULT { success, message, refund? }`.

---

## Timer API

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

## Best Practices

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

See the [Playlist Democracy Plugin](../packages/plugin-playlist-democracy) for a complete reference implementation featuring:

- Zod schema with validation
- Dynamic admin settings form
- UI components (countdown, badges)
- Event handling (track changes, reactions)
- Storage (vote tracking, skip data)
- Timer API usage (countdowns, delayed checks)
- Config change handling
- Playlist augmentation

See the [Queue Hygiene Plugin](../packages/plugin-queue-hygiene) for a queue validation example featuring:

- Queue request interception (`validateQueueRequest`)
- Dynamic rate limiting based on room activity
- Consecutive track prevention
- Admin exemption logic

For **cross-plugin score, coin, modifiers, leaderboards, and inventory**, see [Game Sessions & Inventory](#game-sessions--inventory) and [ADR 0040](adrs/0040-game-sessions-and-inventory.md).

## Plugin API Reference

### PluginAPI Methods

| Method                                         | Description                      |
| ---------------------------------------------- | -------------------------------- |
| `getNowPlaying(roomId)`                        | Get current track                |
| `getUsers(roomId)`                             | Get users in room                |
| `getReactions(params)`                         | Get reactions for track/message  |
| `skipTrack(roomId, trackId)`                   | Skip current track               |
| `sendSystemMessage(roomId, message, options?)` | Send system chat message         |
| `getPluginConfig(roomId, pluginName)`          | Get plugin config                |
| `setPluginConfig(roomId, pluginName, config)`  | Update plugin config             |
| `updatePlaylistTrack(roomId, track)`           | Update track with pluginData     |
| `emit(eventName, data)`                        | Emit plugin event to frontend    |
| `queueSoundEffect(params)`                     | Play a sound effect in the room  |
| `queueScreenEffect(params)`                    | Play a CSS animation in the room |

### Game & inventory APIs (`PluginContext`)

Available as **`context.game`** and **`context.inventory`** (and **`this.game`** / **`this.inventory`** on `BasePlugin`). Full reference: [Game Sessions & Inventory](#game-sessions--inventory); types: `GameSessionPluginAPI`, `InventoryPluginAPI` in `@repo/types`.

### Queue Validation Helpers

Helper functions exported from `@repo/types` for use in `validateQueueRequest`:

| Function                             | Returns                      | Description                        |
| ------------------------------------ | ---------------------------- | ---------------------------------- |
| `allowQueueRequest()`                | `{ allowed: true }`          | Allow the queue request to proceed |
| `rejectQueueRequest(reason: string)` | `{ allowed: false, reason }` | Block with user-facing message     |

### System Message Options

```typescript
await this.context.api.sendSystemMessage(roomId, "Message text", {
  type: "alert", // "info" | "alert"
  status: "info", // "info" | "success" | "warning" | "error"
})
```

### Sound Effects

Play audio sound effects in the room. Sound effects are queued and played one at a time on all connected clients.

```typescript
await this.context.api.queueSoundEffect({
  url: "https://example.com/sounds/notification.mp3",
  volume: 0.5, // 0.0 to 1.0, defaults to 1.0
})
```

**Parameters:**

| Parameter | Type     | Required | Description                                 |
| --------- | -------- | -------- | ------------------------------------------- |
| `url`     | `string` | Yes      | URL to the audio file (mp3, wav, ogg, etc)  |
| `volume`  | `number` | No       | Volume level from 0.0 to 1.0 (default: 1.0) |

**Example: Play sound on special event**

```typescript
private async onReactionAdded(data: { roomId: string; reaction: any }): Promise<void> {
  const config = await this.getConfig()
  if (!config?.enabled || !config.soundEffectUrl) return

  // Play sound when someone reacts with the target emoji
  if (data.reaction.emoji.shortcodes === config.targetEmoji) {
    await this.context!.api.queueSoundEffect({
      url: config.soundEffectUrl,
      volume: config.soundEffectVolume ?? 0.5,
    })
  }
}
```

**Notes:**

- Sound effects play on all clients in the room simultaneously
- Multiple sound effects are queued and played sequentially (one at a time)
- Audio files must be accessible via HTTPS and support CORS
- Sound effect volume is capped at the user's current volume setting (sound effects will never be louder than the radio)
- If a user has muted audio, sound effects are skipped
- Sound effects use Web Audio API, separate from the radio stream

### Screen Effects

Play CSS animations (from animate.css) on UI elements in the room. Screen effects are queued and played one at a time on all connected clients.

```typescript
await this.context.api.queueScreenEffect({
  target: "nowPlaying",
  effect: "pulse",
  duration: 1000, // optional, in milliseconds
})
```

**Parameters:**

| Parameter  | Type                 | Required | Description                                                                            |
| ---------- | -------------------- | -------- | -------------------------------------------------------------------------------------- |
| `target`   | `ScreenEffectTarget` | Yes      | What to animate: `room`, `nowPlaying`, `message`, `plugin`, or `user`                  |
| `targetId` | `string`             | No       | For `message`: timestamp or `"latest"`. For `plugin`: component ID. For `user`: userId |
| `effect`   | `ScreenEffectName`   | Yes      | Animation name (see available effects below)                                           |
| `duration` | `number`             | No       | Custom duration in milliseconds (default varies by effect)                             |

**Target Types:**

| Target       | Description             | `targetId` Usage                |
| ------------ | ----------------------- | ------------------------------- |
| `room`       | Entire room UI          | Not needed                      |
| `nowPlaying` | Now playing section     | Not needed                      |
| `message`    | Specific chat message   | Message timestamp or `"latest"` |
| `plugin`     | Plugin's own components | Component `id` from your schema |
| `user`       | Specific user in list   | User's `userId`                 |

**Available Effects (animate.css attention seekers):**

`bounce`, `flash`, `pulse`, `rubberBand`, `shakeX`, `shakeY`, `headShake`, `swing`, `tada`, `wobble`, `jello`, `heartBeat`

**Example: Animate plugin component on event**

```typescript
private async onWordDetected(word: string, message: ChatMessage): Promise<void> {
  const config = await this.getConfig()
  if (!config?.enabled) return

  // Pulse the leaderboard button when a special word is detected
  await this.context!.api.queueScreenEffect({
    target: "plugin",
    targetId: "leaderboard-button", // matches component id in schema
    effect: "pulse",
  })
}
```

**Example: Animate a chat message**

```typescript
// Shake the message that triggered an event
await this.context!.api.queueScreenEffect({
  target: "message",
  targetId: message.timestamp,
  effect: "shakeX",
})

// Or animate the most recent message
await this.context!.api.queueScreenEffect({
  target: "message",
  targetId: "latest",
  effect: "flash",
})
```

**Example: Animate the now playing section**

```typescript
// Celebrate when a popular track starts
await this.context!.api.queueScreenEffect({
  target: "nowPlaying",
  effect: "tada",
  duration: 1500,
})
```

**Example: Animate a specific user**

```typescript
// Pulse a user when they earn a point
await this.context!.api.queueScreenEffect({
  target: "user",
  targetId: userId, // The user's userId
  effect: "pulse",
})
```

**Notes:**

- Screen effects play on all clients in the room simultaneously
- Multiple screen effects are queued and played sequentially (one at a time)
- Users can disable animations via the "Reduce Motion" preference in settings
- The system also respects the OS-level `prefers-reduced-motion` setting
- Plugins can only animate their own components (using component `id` from schema)
- For chat messages, use animations that don't scale (`flash`, `shakeX`, `shakeY`, `headShake`) to avoid clipping issues in scroll containers

## Testing

See `packages/plugin-playlist-democracy/index.test.ts` and `packages/plugin-base/index.test.ts` for testing examples.

Key areas to test:

1. Plugin registration
2. Event handler responses
3. Config changes (enable/disable)
4. Storage operations
5. Timer behavior (use `vi.useFakeTimers()` for timer tests)
6. Component state
