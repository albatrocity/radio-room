# Plugin Development Guide

This guide explains how to create plugins for Radio Room. Plugins extend room functionality through an event-driven architecture with support for custom UI components, configuration forms, and data augmentation.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Quick Start](#quick-start)
- [BasePlugin Reference](#baseplugin-reference)
- [Event System](#event-system)
- [Configuration Schema](#configuration-schema)
- [Plugin Components](#plugin-components)
- [Data Augmentation](#data-augmentation)
- [Room Export](#room-export)
- [Storage API](#storage-api)
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

Called when room is deleted. Cleans up storage and calls `onCleanup()`.

#### `onCleanup(): Promise<void>` (optional override)

Custom cleanup logic (clear timers, etc.).

```typescript
protected async onCleanup(): Promise<void> {
  this.activeTimers.forEach(timer => clearTimeout(timer))
  this.activeTimers.clear()
}
```

## Event System

Plugins subscribe to system events using SCREAMING_SNAKE_CASE names.

### Available Events

| Event                   | Payload                                          | Description           |
| ----------------------- | ------------------------------------------------ | --------------------- |
| `TRACK_CHANGED`         | `{ roomId, track: QueueItem }`                   | Now playing changed   |
| `REACTION_ADDED`        | `{ roomId, reaction: ReactionPayload }`          | User added reaction   |
| `REACTION_REMOVED`      | `{ roomId, reaction: ReactionPayload }`          | User removed reaction |
| `MESSAGE_RECEIVED`      | `{ roomId, message: ChatMessage }`               | Chat message sent     |
| `USER_JOINED`           | `{ roomId, user: User }`                         | User joined room      |
| `USER_LEFT`             | `{ roomId, user: User }`                         | User left room        |
| `CONFIG_CHANGED`        | `{ roomId, pluginName, config, previousConfig }` | Plugin config updated |
| `ROOM_SETTINGS_UPDATED` | `{ roomId, room: Room }`                         | Room settings changed |
| `ROOM_DELETED`          | `{ roomId }`                                     | Room was deleted      |

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

| Area              | Location                        |
| ----------------- | ------------------------------- |
| `nowPlaying`      | Below now playing info          |
| `nowPlayingInfo`  | Inline with now playing details |
| `nowPlayingBadge` | Badge area near title           |
| `nowPlayingArt`   | Overlay on album art            |
| `playlistItem`    | Per-track in playlist           |
| `userList`        | User list section               |
| `userListItem`    | Per-user in list                |

### Component Types

| Type          | Description      | Key Props                                     |
| ------------- | ---------------- | --------------------------------------------- |
| `text`        | Inline text      | `content`, `variant`                          |
| `text-block`  | Block text       | `content`, `variant`                          |
| `heading`     | Section heading  | `content`, `level`                            |
| `emoji`       | Emoji display    | `emoji`, `size`                               |
| `icon`        | Icon display     | `icon`, `size`, `color`                       |
| `button`      | Clickable button | `label`, `icon`, `opensModal`                 |
| `badge`       | Status badge     | `label`, `variant`, `icon`, `tooltip`         |
| `leaderboard` | Ranked list      | `dataKey`, `title`, `rowTemplate`, `maxItems` |
| `countdown`   | Timer display    | `startKey`, `duration`, `text`                |
| `modal`       | Dialog container | `title`, `size`, `children`                   |

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

### 4. Clean Up Resources

```typescript
private readonly activeTimers = new Map<string, NodeJS.Timeout>()

protected async onCleanup(): Promise<void> {
  this.activeTimers.forEach(timer => clearTimeout(timer))
  this.activeTimers.clear()
}
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

## Complete Example

See the [Playlist Democracy Plugin](../packages/plugin-playlist-democracy) for a complete reference implementation featuring:

- Zod schema with validation
- Dynamic admin settings form
- UI components (countdown, badges)
- Event handling (track changes, reactions)
- Storage (vote tracking, skip data)
- Timer management
- Config change handling
- Playlist augmentation

## Plugin API Reference

### PluginAPI Methods

| Method                                         | Description                     |
| ---------------------------------------------- | ------------------------------- |
| `getNowPlaying(roomId)`                        | Get current track               |
| `getUsers(roomId)`                             | Get users in room               |
| `getReactions(params)`                         | Get reactions for track/message |
| `skipTrack(roomId, trackId)`                   | Skip current track              |
| `sendSystemMessage(roomId, message, options?)` | Send system chat message        |
| `getPluginConfig(roomId, pluginName)`          | Get plugin config               |
| `setPluginConfig(roomId, pluginName, config)`  | Update plugin config            |
| `updatePlaylistTrack(roomId, track)`           | Update track with pluginData    |
| `emit(eventName, data)`                        | Emit plugin event to frontend   |
| `queueSoundEffect(params)`                     | Play a sound effect in the room |

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
- Use reasonable volumes (0.3-0.7) to avoid startling users
- Sound effects use Web Audio API, separate from the radio stream

## Testing

See `packages/plugin-playlist-democracy/__tests__` for testing examples.

Key areas to test:

1. Plugin registration
2. Event handler responses
3. Config changes (enable/disable)
4. Storage operations
5. Timer cleanup
6. Component state
