# Backend Development

This document covers key architectural patterns and concepts in the Radio Room server.

## Table of Contents

- [SystemEvents](#systemevents)
- [Broadcaster Pattern](#broadcaster-pattern)
- [Plugin System](#plugin-system)

---

## SystemEvents

SystemEvents is the unified event emission layer for the server. When something significant happens in a room (track changes, user joins, etc.), a single `emit()` call broadcasts the event to multiple consumers.

### Consumers

1. **Redis PubSub** - For cross-server communication in a distributed environment
2. **Plugin System** - For in-process plugin event handlers
3. **Broadcasters** - For real-time frontend updates via Socket.IO

### Usage

```typescript
await context.systemEvents.emit(roomId, "TRACK_CHANGED", {
  roomId,
  track: nowPlaying,
  meta: roomMeta,
})
```

### Event Types

Events are defined in `packages/types/SystemEventTypes.ts`. Common events include:

- `TRACK_CHANGED` - Current track changed
- `USER_JOINED` / `USER_LEFT` - User entered/left a room
- `QUEUE_CHANGED` - Queue was modified
- `MESSAGE_RECEIVED` - Chat message received
- `REACTION_ADDED` / `REACTION_REMOVED` - Reaction changes

---

## Broadcaster Pattern

Broadcasters handle the delivery of system events to Socket.IO channels. This pattern separates **event emission** (what happened) from **event routing** (who should know about it).

### Architecture

```
SystemEvents.emit()
       │
       ├── Redis PubSub (cross-server)
       ├── Plugin System (in-process)
       └── BroadcasterRegistry
                 │
                 ├── RoomBroadcaster → room channels
                 └── LobbyBroadcaster → lobby channel
```

### Why Broadcasters?

Before the broadcaster pattern, SystemEvents directly emitted to Socket.IO rooms. This had issues:

1. **Mixed concerns** - Event emission logic was coupled with routing decisions
2. **Hard to extend** - Adding new channels (like lobby) meant modifying SystemEvents
3. **No filtering** - Every event went to rooms, even if not relevant

Broadcasters solve this by:

1. **Separation of concerns** - Each broadcaster controls its own routing logic
2. **Extensibility** - Add new broadcasters without touching SystemEvents
3. **Filtering** - Each broadcaster decides which events it cares about

### Broadcaster Interface

```typescript
interface Broadcaster {
  readonly name: string

  handleEvent<K extends SystemEventName>(
    roomId: string,
    event: K,
    data: SystemEventPayload<K>,
  ): void
}
```

### Built-in Broadcasters

#### RoomBroadcaster

Emits **all** events to the room's socket channel. Clients in a room receive events about that room.

```typescript
// Emits to: room:{roomId}
// Event format: { type: "TRACK_CHANGED", data: {...} }
```

#### LobbyBroadcaster

Emits **selected** events to the lobby channel with simplified payloads. Used by the public lobby for real-time room previews.

```typescript
// Listens for: TRACK_CHANGED, USER_JOINED, USER_LEFT
// Emits to: lobby
// Event: LOBBY_ROOM_UPDATE { roomId, userCount?, nowPlaying? }
```

### Creating a New Broadcaster

1. Create a class extending `SocketBroadcaster`:

```typescript
// packages/server/lib/broadcasters/MyBroadcaster.ts
import { SocketBroadcaster } from "./Broadcaster"

export class MyBroadcaster extends SocketBroadcaster {
  readonly name = "my-broadcaster"

  handleEvent<K extends SystemEventName>(
    roomId: string,
    event: K,
    data: SystemEventPayload<K>,
  ): void {
    // Filter events
    if (event !== "MY_EVENT") return

    // Transform and emit
    this.emit("my-channel", "MY_SOCKET_EVENT", {
      roomId,
      // ... transformed data
    })
  }
}
```

2. Register in `packages/server/index.ts`:

```typescript
broadcasterRegistry.register(new MyBroadcaster(this.io))
```

### Lobby Socket Channel

The lobby channel allows the public lobby page to receive real-time updates about all rooms without joining individual room channels.

**Client side:**

```typescript
// Join lobby
socket.emit("JOIN_LOBBY")

// Listen for updates
socket.on("LOBBY_ROOM_UPDATE", (update) => {
  // { roomId, userCount?, nowPlaying? }
})

// Leave lobby
socket.emit("LEAVE_LOBBY")
```

**Update payload:**

```typescript
interface LobbyRoomUpdate {
  roomId: string
  userCount?: number
  nowPlaying?: QueueItem | null // Full track metadata
}
```

---

## Plugin System

See [PLUGIN_DEVELOPMENT.md](./PLUGIN_DEVELOPMENT.md) for plugin documentation.
