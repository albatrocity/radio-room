# Plugin Development Guide

This guide explains how to create plugins for Listening Room. Plugins extend room functionality through an event-driven architecture with support for custom UI components, configuration forms, and data augmentation.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Quick Start](#quick-start)
- [BasePlugin Reference](#baseplugin-reference)
- [Event System](#event-system)
- [Configuration Schema](#configuration-schema)
- [Plugin Actions](#plugin-actions)
- [Plugin Components](#plugin-components)
- [Data Augmentation](#data-augmentation)
- [Room Export](#room-export)
- [Storage API](#storage-api)
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

| Area              | Location                        | Item Context Available |
| ----------------- | ------------------------------- | ---------------------- |
| `nowPlaying`      | Below now playing info          | No                     |
| `nowPlayingInfo`  | Inline with now playing details | No                     |
| `nowPlayingBadge` | Badge area near title           | No                     |
| `nowPlayingArt`   | Overlay on album art            | No                     |
| `playlistItem`    | Per-track in playlist           | Yes (track data)       |
| `userList`        | User list section               | No                     |
| `userListItem`    | Per-user in list                | Yes (user data)        |

### Component Types

| Type         | Description      | Key Props                     |
| ------------ | ---------------- | ----------------------------- |
| `text`       | Inline text      | `content`, `variant`          |
| `text-block` | Block text       | `content`, `variant`          |
| `heading`    | Section heading  | `content`, `level`            |
| `emoji`      | Emoji display    | `emoji`, `size`               |
| `icon`       | Icon display     | `icon`, `size`, `color`       |
| `button`     | Clickable button | `label`, `icon`, `opensModal` |

**Available Icons:**

`trophy`, `star`, `medal`, `award`, `heart`, `skip-forward`, `swords`
| `badge` | Status badge | `label`, `variant`, `icon`, `tooltip` |
| `leaderboard` | Ranked list | `dataKey`, `title`, `rowTemplate`, `maxItems` |
| `countdown` | Timer display | `startKey`, `duration`, `text` |
| `modal` | Dialog container | `title`, `size`, `children` |

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

| Method | Return Type | Description |
| --- | --- | --- |
| `startTimer<T>(id, config)` | `void` | Start a timer; replaces existing timer with same ID |
| `clearTimer(id)` | `boolean` | Clear a timer; returns `true` if found |
| `clearAllTimers()` | `void` | Clear all active timers |
| `getTimer<T>(id)` | `Timer<T> \| null` | Get timer info (without internal handle) |
| `getAllTimers()` | `Timer[]` | Get all active timers |
| `resetTimer(id)` | `boolean` | Restart timer from beginning; returns `true` if found |
| `getTimerRemaining(id)` | `number \| null` | Get remaining ms, or `null` if not found |

### Timer Types

```typescript
interface TimerConfig<T = unknown> {
  duration: number                         // Duration in milliseconds
  callback: () => Promise<void> | void     // Function to call when timer expires
  data?: T                                 // Optional metadata attached to timer
}

interface Timer<T = unknown> {
  id: string
  startTime: number   // Date.now() when timer was started
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

### 9. Use Screen Effects Thoughtfully

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
