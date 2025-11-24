# Plugin Development Guide

This guide explains how to create plugins for the Radio Room server. Plugins are self-contained modules that extend the functionality of rooms through an event-driven architecture.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Getting Started](#getting-started)
- [Plugin API Reference](#plugin-api-reference)
- [Lifecycle Events](#lifecycle-events)
- [Storage API](#storage-api)
- [Best Practices](#best-practices)
- [Example Plugin](#example-plugin)

## Architecture Overview

Plugins are isolated modules that interact with the Radio Room system through a well-defined API:

```
┌─────────────────────────────────────────┐
│         Plugin Registry                 │
│  (Manages plugin lifecycle per room)   │
└─────────────────────────────────────────┘
                  │
                  ├─ Provides PluginContext
                  │  ├─ PluginAPI (safe methods)
                  │  ├─ PluginStorage (namespaced Redis)
                  │  ├─ PluginLifecycle (event system)
                  │  └─ AppContext (core services)
                  │
                  ▼
┌─────────────────────────────────────────┐
│            Your Plugin                  │
│  (Extends BasePlugin<TConfig>)          │
└─────────────────────────────────────────┘
```

### Key Principles

1. **Event-Driven**: Plugins react to system events (track changes, reactions, etc.)
2. **Sandboxed**: Each plugin has isolated storage namespaced by room ID
3. **Type-Safe**: Full TypeScript support with generic config types
4. **Self-Contained**: All plugin logic lives within the plugin package
5. **Lifecycle-Managed**: Automatic cleanup when rooms are deleted

## Getting Started

### 1. Create a Plugin Package

```bash
# In packages/
mkdir plugin-my-feature
cd plugin-my-feature
npm init -y
```

### 2. Install Dependencies

```json
{
  "name": "@repo/plugin-my-feature",
  "version": "1.0.0",
  "dependencies": {
    "@repo/types": "*",
    "@repo/plugin-base": "*"
  }
}
```

### 3. Define Your Plugin Config Type

```typescript
// types.ts
export type MyFeatureConfig = {
  enabled: boolean
  threshold: number
  notificationMessage: string
}
```

### 4. Implement Your Plugin

```typescript
// index.ts
import { BasePlugin } from "@repo/plugin-base"
import { PluginContext } from "@repo/types"
import packageJson from "./package.json"
import type { MyFeatureConfig } from "./types"

export class MyFeaturePlugin extends BasePlugin<MyFeatureConfig> {
  name = "my-feature"
  version = packageJson.version

  async register(context: PluginContext): Promise<void> {
    this.context = context

    // Subscribe to events
    context.lifecycle.on("trackChanged", this.onTrackChanged.bind(this))
    context.lifecycle.on("configChanged", this.onConfigChanged.bind(this))

    console.log(`[${this.name}] Registered for room ${context.roomId}`)
  }

  private async onTrackChanged(data: { roomId: string; track: QueueItem }): Promise<void> {
    const config = await this.getConfig()
    if (!config?.enabled) return

    // Your logic here
    console.log(`Track changed: ${data.track.title}`)
  }

  private async onConfigChanged(data: { roomId: string; config: any }): Promise<void> {
    console.log(`Config updated:`, data.config)
  }
}

// Export factory function
export function createMyFeaturePlugin() {
  return new MyFeaturePlugin()
}

export default createMyFeaturePlugin
```

### 5. Register Your Plugin

In `packages/server/index.ts`:

```typescript
import { createMyFeaturePlugin } from "@repo/plugin-my-feature"

// In the initializePlugins() method:
private initializePlugins() {
  this.pluginRegistry.registerPlugin("my-feature", createMyFeaturePlugin())
}
```

## Plugin API Reference

### BasePlugin<TConfig>

The base class all plugins should extend. Provides automatic storage cleanup and typed config access.

#### Properties

- `name: string` (required) - Unique plugin identifier
- `version: string` (required) - Plugin version (usually from package.json)
- `context: PluginContext | null` (protected) - The plugin's context

#### Methods

##### `register(context: PluginContext): Promise<void>`

Called when the plugin is initialized for a room. Store the context and subscribe to events here.

##### `getConfig(): Promise<TConfig | null>`

Returns the plugin's configuration for the current room, typed to your config interface.

##### `cleanup(): Promise<void>`

Called when a room is deleted. Automatically cleans up storage and calls `onCleanup()`.

##### `onCleanup(): Promise<void>` (optional)

Override this to perform custom cleanup (e.g., clearing timers, canceling jobs).

```typescript
protected async onCleanup(): Promise<void> {
  // Clear any timers
  this.timers.forEach(timer => clearTimeout(timer))
  this.timers.clear()
}
```

### PluginContext

The context object provided to your plugin during registration.

#### Properties

- `roomId: string` - The current room ID
- `api: PluginAPI` - Safe methods to interact with the system
- `storage: PluginStorage` - Sandboxed Redis storage
- `lifecycle: PluginLifecycle` - Event subscription system
- `appContext: AppContext` - Access to core services (Redis, Socket.IO, etc.)
- `getRoom(): Promise<Room | null>` - Fetch current room data

### PluginAPI

Safe, high-level methods for plugins to interact with the system.

#### Methods

##### `getNowPlaying(roomId: string): Promise<QueueItem | null>`

Get the currently playing track for a room.

```typescript
const nowPlaying = await this.context.api.getNowPlaying(this.context.roomId)
if (nowPlaying) {
  console.log(`Now playing: ${nowPlaying.title}`)
}
```

##### `getReactions(params): Promise<Reaction[]>`

Get reactions for a specific subject (track or message).

```typescript
const reactions = await this.context.api.getReactions({
  roomId: this.context.roomId,
  reactTo: { type: "track", id: trackId },
  filterEmoji: "thumbsup", // optional
})
```

##### `getUsers(roomId: string, params?): Promise<User[]>`

Get users in a room, optionally filtered by status.

```typescript
// Get all listening users
const listeners = await this.context.api.getUsers(this.context.roomId, {
  status: "listening",
})

// Get all participating users (listening + online)
const participants = await this.context.api.getUsers(this.context.roomId, {
  status: "participating",
})

// Get all users
const allUsers = await this.context.api.getUsers(this.context.roomId)
```

##### `skipTrack(roomId: string, trackId: string): Promise<void>`

Skip the current track.

```typescript
await this.context.api.skipTrack(this.context.roomId, trackId)
```

##### `sendSystemMessage(roomId: string, message: string): Promise<void>`

Send a system message to the room's chat.

```typescript
await this.context.api.sendSystemMessage(this.context.roomId, "🎵 Plugin event triggered!")
```

##### `getPluginConfig(roomId: string, pluginName: string): Promise<any | null>`

Get configuration for any plugin (usually you'd use `this.getConfig()` for your own).

##### `setPluginConfig(roomId: string, pluginName: string, config: any): Promise<void>`

Update plugin configuration (usually done from the admin UI).

## Lifecycle Events

Plugins subscribe to events via `context.lifecycle.on(eventName, handler)`.

### Available Events

#### `trackChanged`

Fired when the currently playing track changes.

```typescript
context.lifecycle.on("trackChanged", async (data: { roomId: string; track: QueueItem }) => {
  console.log(`Track changed in room ${data.roomId}: ${data.track.title}`)
})
```

#### `reactionAdded`

Fired when a user adds a reaction to a track or message.

```typescript
context.lifecycle.on(
  "reactionAdded",
  async (data: { roomId: string; reaction: ReactionPayload }) => {
    if (data.reaction.reactTo.type === "track") {
      console.log(`User reacted to track with ${data.reaction.emoji.shortcodes}`)
    }
  },
)
```

#### `reactionRemoved`

Fired when a user removes a reaction.

```typescript
context.lifecycle.on(
  "reactionRemoved",
  async (data: { roomId: string; reaction: ReactionPayload }) => {
    // Handle reaction removal
  },
)
```

#### `configChanged`

Fired when the plugin's configuration is updated.

```typescript
context.lifecycle.on(
  "configChanged",
  async (data: { roomId: string; config: any; previousConfig: any }) => {
    const wasEnabled = data.previousConfig?.enabled
    const isEnabled = data.config?.enabled

    if (!wasEnabled && isEnabled) {
      console.log("Plugin was just enabled!")
    }
  },
)
```

#### `roomDeleted`

Fired when the room is deleted. Use this to trigger cleanup.

```typescript
context.lifecycle.on("roomDeleted", async (data: { roomId: string }) => {
  await this.cleanup()
})
```

#### `roomSettingsUpdated`

Fired when room settings change.

```typescript
context.lifecycle.on("roomSettingsUpdated", async (data: { roomId: string; room: Room }) => {
  // React to room settings changes
})
```

#### `userJoined`, `userLeft`, `userStatusChanged`

Track user activity in the room.

```typescript
context.lifecycle.on("userJoined", async (data: { roomId: string; user: User }) => {
  await this.context.api.sendSystemMessage(data.roomId, `👋 ${data.user.username} joined!`)
})
```

## Storage API

Each plugin gets sandboxed Redis storage automatically namespaced as:

```
plugin:{pluginName}:room:{roomId}:{key}
```

### Methods

#### `get(key: string): Promise<string | null>`

Get a value from storage.

```typescript
const value = await this.context.storage.get("myKey")
```

#### `set(key: string, value: string, ttl?: number): Promise<void>`

Store a value, optionally with a TTL (in seconds).

```typescript
await this.context.storage.set("myKey", "myValue")
await this.context.storage.set("tempKey", "value", 3600) // Expires in 1 hour
```

#### `inc(key: string, by?: number): Promise<number>`

Increment a numeric value.

```typescript
const newCount = await this.context.storage.inc("voteCount")
const newCount2 = await this.context.storage.inc("voteCount", 5) // Increment by 5
```

#### `dec(key: string, by?: number): Promise<number>`

Decrement a numeric value.

```typescript
const newCount = await this.context.storage.dec("countdown")
```

#### `del(key: string): Promise<void>`

Delete a key.

```typescript
await this.context.storage.del("oldKey")
```

#### `exists(key: string): Promise<boolean>`

Check if a key exists.

```typescript
if (await this.context.storage.exists("myKey")) {
  // Key exists
}
```

### Automatic Cleanup

When a room is deleted, all storage keys for your plugin in that room are automatically cleaned up by `BasePlugin.cleanup()`.

## Best Practices

### 1. Always Check if Config is Enabled

```typescript
private async onSomeEvent() {
  const config = await this.getConfig()
  if (!config?.enabled) return

  // Your logic here
}
```

### 2. Bind Event Handlers

Always bind `this` when registering event handlers:

```typescript
context.lifecycle.on("trackChanged", this.onTrackChanged.bind(this))
```

### 3. Clean Up Resources

Override `onCleanup()` to clear timers, intervals, or other resources:

```typescript
protected async onCleanup(): Promise<void> {
  this.timers.forEach(timer => clearTimeout(timer))
  this.timers.clear()

  if (this.interval) {
    clearInterval(this.interval)
  }
}
```

### 4. Handle Errors Gracefully

```typescript
private async onTrackChanged(data: { roomId: string; track: QueueItem }): Promise<void> {
  try {
    // Your logic
  } catch (error) {
    console.error(`[${this.name}] Error in onTrackChanged:`, error)
  }
}
```

### 5. Use Typed Configs

Always define a TypeScript interface for your config:

```typescript
export type MyPluginConfig = {
  enabled: boolean
  setting1: string
  setting2: number
}

export class MyPlugin extends BasePlugin<MyPluginConfig> {
  // config is now typed!
}
```

### 6. Store Plugin Version in package.json

```typescript
import packageJson from "./package.json"

export class MyPlugin extends BasePlugin<MyPluginConfig> {
  name = "my-plugin"
  version = packageJson.version // DRY!
}
```

### 7. Export Config Types

Export your config types so the frontend can use them:

```typescript
// types.ts
export type MyPluginConfig = {
  enabled: boolean
  // ...
}

// index.ts
export type { MyPluginConfig } from "./types"
```

## Example Plugin

Here's a complete example: a "Track Announcer" plugin that sends a system message when a new track starts.

### types.ts

```typescript
export type TrackAnnouncerConfig = {
  enabled: boolean
  includeArtist: boolean
  customPrefix: string
}
```

### index.ts

```typescript
import { BasePlugin } from "@repo/plugin-base"
import { PluginContext, QueueItem } from "@repo/types"
import packageJson from "./package.json"
import type { TrackAnnouncerConfig } from "./types"

export type { TrackAnnouncerConfig } from "./types"

export class TrackAnnouncerPlugin extends BasePlugin<TrackAnnouncerConfig> {
  name = "track-announcer"
  version = packageJson.version

  async register(context: PluginContext): Promise<void> {
    this.context = context

    // Subscribe to track changes
    context.lifecycle.on("trackChanged", this.onTrackChanged.bind(this))
    context.lifecycle.on("configChanged", this.onConfigChanged.bind(this))

    console.log(`[${this.name}] Registered for room ${context.roomId}`)
  }

  private async onTrackChanged(data: { roomId: string; track: QueueItem }): Promise<void> {
    if (!this.context) return

    const config = await this.getConfig()
    if (!config?.enabled) return

    try {
      const { track } = data
      let message = config.customPrefix || "🎵 Now playing:"

      if (config.includeArtist && track.artist) {
        message += ` ${track.title} by ${track.artist}`
      } else {
        message += ` ${track.title}`
      }

      await this.context.api.sendSystemMessage(this.context.roomId, message)
    } catch (error) {
      console.error(`[${this.name}] Error announcing track:`, error)
    }
  }

  private async onConfigChanged(data: {
    roomId: string
    config: TrackAnnouncerConfig | null
    previousConfig: TrackAnnouncerConfig | null
  }): Promise<void> {
    const wasEnabled = data.previousConfig?.enabled
    const isEnabled = data.config?.enabled

    if (!wasEnabled && isEnabled) {
      await this.context?.api.sendSystemMessage(
        this.context.roomId,
        "📢 Track announcements enabled",
      )
    } else if (wasEnabled && !isEnabled) {
      await this.context?.api.sendSystemMessage(
        this.context.roomId,
        "📢 Track announcements disabled",
      )
    }
  }
}

export function createTrackAnnouncerPlugin() {
  return new TrackAnnouncerPlugin()
}

export default createTrackAnnouncerPlugin
```

## Testing Your Plugin

See the tests in `packages/plugin-playlist-democracy/__tests__` for examples of how to test plugins.

Key things to test:

1. Plugin registration
2. Event handler subscriptions
3. Config changes (enable/disable)
4. Storage operations
5. API interactions (mock the PluginAPI)
6. Cleanup (timers, storage, etc.)

## Next Steps

- Review the [Playlist Democracy Plugin](../packages/plugin-playlist-democracy) as a reference implementation
- Check out the [BasePlugin source](../packages/plugin-base) for additional details
- See [PluginAPI implementation](../packages/server/lib/plugins/PluginAPI.ts) for full API details
