# Plugin Event Architecture - Domain Event Pattern

## Overview

This document describes how plugin lifecycle events are emitted in the Radio Room codebase. We use a **Domain Event Pattern** where plugin events are emitted from the operations layer, not from handlers or adapters.

## Quick Reference

### When to Emit Plugin Events

**✅ DO emit from operations** using `emitPluginEvent()`:
- `operations/` directory
- After business logic completes successfully
- When domain state changes

**❌ DON'T emit from**:
- Handlers (too close to transport layer)
- Services (too granular)
- Data layer (raw database operations)
- Adapters (infrastructure concerns)

### How to Emit an Event

```typescript
import { emitPluginEvent } from "../../lib/emitPluginEvent"

// In your operation
await emitPluginEvent(context, roomId, "trackChanged", {
  roomId,
  track: nowPlaying,
})
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Handlers (Socket.IO, HTTP Controllers)                 │
│ - Parse requests                                        │
│ - Call operations                                       │
│ - Emit to clients (Socket.IO)                          │
│ - NO PLUGIN EVENTS                                     │
└─────────────────────────────────────────────────────────┘
                        ↓ calls
┌─────────────────────────────────────────────────────────┐
│ Operations (Business Logic)                            │
│ - Execute business logic                               │
│ - Interact with services/data layer                    │
│ - ✅ EMIT PLUGIN EVENTS HERE                          │
│ - Return results                                       │
└─────────────────────────────────────────────────────────┘
                        ↓ uses
┌─────────────────────────────────────────────────────────┐
│ Services / Data Layer                                  │
│ - Database operations                                  │
│ - External API calls                                   │
│ - NO PLUGIN EVENTS                                     │
└─────────────────────────────────────────────────────────┘
```

## Current Plugin Events

All events are defined in `packages/types/Plugin.ts` under `PluginLifecycleEvents`:

| Event | Emitted From | When |
|-------|--------------|------|
| `trackChanged` | `operations/room/handleRoomNowPlayingData.ts` | When a new track starts playing |
| `reactionAdded` | `operations/reactions/addReaction.ts` | When a user adds a reaction |
| `reactionRemoved` | `operations/reactions/removeReaction.ts` | When a user removes a reaction |
| `roomDeleted` | `operations/data/rooms.ts` | When a room is deleted |
| `roomSettingsUpdated` | `handlers/adminHandlersAdapter.ts` | When room settings are updated |
| `configChanged` | `handlers/adminHandlersAdapter.ts` | When plugin config changes |
| `userJoined` | (not yet implemented) | When a user joins a room |
| `userLeft` | (not yet implemented) | When a user leaves a room |
| `userStatusChanged` | (not yet implemented) | When user status changes |

## File Structure

```
packages/server/
├── lib/
│   └── emitPluginEvent.ts        ← Helper function
├── operations/
│   ├── reactions/
│   │   ├── addReaction.ts        ← Emits reactionAdded
│   │   ├── removeReaction.ts     ← Emits reactionRemoved
│   │   └── index.ts
│   ├── room/
│   │   └── handleRoomNowPlayingData.ts  ← Emits trackChanged
│   └── data/
│       └── rooms.ts              ← Emits roomDeleted
├── handlers/
│   ├── activityHandlers.ts       ← Calls operations, emits to Socket.IO
│   └── adminHandlers.ts          ← Calls operations, emits to Socket.IO
└── services/
    ├── ActivityService.ts        ← Business logic only
    └── AdminService.ts           ← Business logic only
```

## Example: Current Implementation

### Reaction Flow

**1. Handler receives Socket.IO event:**

```typescript
// packages/server/handlers/activityHandlersAdapter.ts
addReaction = async ({ io, socket }, reaction) => {
  // Call operation (which handles plugin event)
  const result = await addReactionOp({
    context: socket.context,
    roomId: socket.data.roomId,
    reaction,
  })

  if (!result) return

  // Emit to Socket.IO clients
  io.to(getRoomPath(socket.data.roomId)).emit("event", {
    type: "REACTIONS",
    data: { reactions: result.reactions },
  })
}
```

**2. Operation executes business logic and emits plugin event:**

```typescript
// packages/server/operations/reactions/addReaction.ts
export async function addReaction({ context, roomId, reaction }) {
  // Business logic
  const activityService = new ActivityService(context)
  const result = await activityService.addReaction(roomId, reaction)

  if (!result) return null

  // Emit plugin event after successful operation
  await emitPluginEvent(context, roomId, "reactionAdded", {
    roomId,
    reaction,
  })

  return result
}
```

## Adding a New Plugin Event

### Step 1: Define the event type

```typescript
// packages/types/Plugin.ts
export type PluginLifecycleEvents = {
  // ... existing events
  playlistItemAdded: (data: { 
    roomId: string
    item: QueueItem
    addedBy: User 
  }) => Promise<void> | void
}
```

### Step 2: Create or update the operation

```typescript
// packages/server/operations/queue/addToQueue.ts
import { emitPluginEvent } from "../../lib/emitPluginEvent"

export async function addToQueue({ context, roomId, track, user }) {
  // Business logic
  const queueItem = await context.data.addToQueue({ roomId, track, user })

  // Emit plugin event
  await emitPluginEvent(context, roomId, "playlistItemAdded", {
    roomId,
    item: queueItem,
    addedBy: user,
  })

  return queueItem
}
```

### Step 3: Use the operation in handlers

```typescript
// packages/server/handlers/queueHandlers.ts
export class QueueHandlers {
  addToQueue = async ({ io, socket }, { trackId }) => {
    // Call operation (handles plugin event)
    const item = await addToQueue({
      context: socket.context,
      roomId: socket.data.roomId,
      track: { id: trackId },
      user: socket.data.user,
    })

    // Emit to Socket.IO clients
    io.to(socket.data.roomId).emit("event", {
      type: "QUEUE_UPDATED",
      data: { item }
    })
  }
}
```

## Benefits of This Pattern

1. **Clear Convention**: Always know where to emit events (operations)
2. **Discoverable**: Search `emitPluginEvent` to find all event emissions
3. **Type Safe**: TypeScript enforces event name and data structure
4. **Testable**: Operations are pure business logic
5. **Reusable**: Multiple handlers can use the same operation
6. **Maintainable**: Centralized error handling in `emitPluginEvent()`

## Helper Function

The `emitPluginEvent()` helper provides:
- Consistent error handling
- Type safety with autocomplete
- Single place to add monitoring/logging
- Clean API surface

```typescript
// packages/server/lib/emitPluginEvent.ts
export async function emitPluginEvent<K extends keyof PluginLifecycleEvents>(
  context: AppContext,
  roomId: string,
  event: K,
  data: Parameters<PluginLifecycleEvents[K]>[0],
): Promise<void> {
  if (!context.pluginRegistry) return
  
  try {
    await context.pluginRegistry.emit(roomId, event, data)
  } catch (error) {
    console.error(`[PluginEvents] Error emitting ${event}:`, error)
  }
}
```

## Migration Notes

Previously, plugin events were emitted directly in handlers:

```typescript
// OLD: Direct emission in handler ❌
if (socket.context.pluginRegistry) {
  try {
    await socket.context.pluginRegistry.emit(roomId, "reactionAdded", { ... })
  } catch (error) {
    console.error("Error:", error)
  }
}
```

Now, events are emitted in operations using the helper:

```typescript
// NEW: Emission in operation ✅
await emitPluginEvent(context, roomId, "reactionAdded", { ... })
```

This makes it clear that plugin events are **domain events** that happen when **domain logic** completes.

## Future Improvements

Potential enhancements to consider:

1. **Event Batching**: Batch multiple events for performance
2. **Event Monitoring**: Add metrics/telemetry to `emitPluginEvent()`
3. **Event Replay**: Store events for debugging/replay
4. **Async Events**: Make events truly async with message queue
5. **Event Filtering**: Allow plugins to filter events they receive

## Related Documentation

- Plugin System: `/packages/types/Plugin.ts`
- Plugin Registry: `/packages/server/lib/plugins/PluginRegistry.ts`
- Plugin API: `/packages/server/lib/plugins/PluginAPI.ts`
- Example Plugin: `/packages/plugin-playlist-democracy/index.ts`

