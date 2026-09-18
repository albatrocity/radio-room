# Backend Development

This document covers key architectural patterns and concepts in the Listening Room server.

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

Fan-out order is **Redis PubSub → plugins → broadcasters**. Optional emit options:

```typescript
await context.systemEvents.emit(roomId, "QUEUE_CHANGED", payload, {
  skipPlugins: true, // PubSub + Socket.IO only; do not re-enter plugin handlers
})
```

| Option | Effect |
|--------|--------|
| `skipPlugins: true` | Skip in-process plugin handlers; still publish to Redis and broadcasters |

**Why `skipPlugins` exists:** Plugins may mutate domain state while handling an event (e.g. enqueue more tracks during `QUEUE_CHANGED`). The original emit’s payload was snapshotted *before* those handlers ran, so broadcasters would otherwise send a stale queue to clients after plugins return. `DJService.queueSongAs` rebuilds and re-emits with `{ skipPlugins: true }` only when a nested `suppressQueueChanged` add succeeded during plugin handling (dirty flag), not on every enqueue. See [Queue Validation — Cascading queue adds](plugins/queue-validation.md#cascading-queue-adds-during-queue_changed).

### Event Types

Events are defined in `packages/types/SystemEventTypes.ts`. Common events include:

- `TRACK_CHANGED` - Current track changed
- `USER_JOINED` / `USER_LEFT` - User entered/left a room
- `QUEUE_CHANGED` - Queue was modified
- `MESSAGE_RECEIVED` - Chat message received
- `REACTION_ADDED` / `REACTION_REMOVED` - Reaction changes
- `GIFT_*` / `TRADE_INVITE_*` / `TRADE_UPDATED` / `TRADE_COMPLETED` / `TRADE_CANCELLED` - Player gift and trade protocol (emitted from `operations/inventory/`, [ADR 0114](adrs/0114-player-item-gifting-and-trading.md)). `TRADE_TYPING` is socket-only, not a SystemEvent ([ADR 0120](adrs/0120-targeted-trade-typing.md)).

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

Private per-user lines use `sendUserSystemMessage` instead. Inventory metadata patches
(`INVENTORY_ITEM_UPDATED`) stay on this room fanout today; clients discard other users' stacks.
Per-user delivery for that event would be a new ADR.

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

---

## Redis (memory and sessions)

Redis holds show-critical room state (queues, presence, Socket.IO adapter, SystemEvents). Binary media must **not** live in Redis as base64 — see [ADR 0186](adrs/0186-redis-coordination-s3-media.md).

### Eviction policy (production)

Heroku Redis defaults to `noeviction`, which rejects every write once `maxmemory` is hit and can take down a show. Prefer **`volatile-lru`** so only keys that already have a TTL (sessions, media URL pointers) are evicted:

```bash
heroku redis:maxmemory -a rb-radio-listener -p volatile-lru
heroku redis:info -a rb-radio-listener
# Confirm Maxmemory policy: volatile-lru
```

`volatile-lru` never deletes keys without an expiry. Room state hashes without TTL stay. Idle rooms that `expireRoomIn` has TTL'd are eviction candidates — they are already scheduled for deletion.

### Express sessions (`s:`)

Cookie `maxAge` / connect-redis TTL is **90 days** (`SESSION_MAX_AGE` in `packages/server/lib/constants.ts`). Guest `userId` identity lives in browser `localStorage` ([ADR 0058](adrs/0058-client-session-localstorage.md)); shortening the cookie does not wipe inventory/game attribution.

Sessions created or touched after deploy get the new TTL (`resave: true` refreshes returning visitors). Sessions that never return keep their prior TTL until they expire.

### Reclaiming legacy image blobs

After media cutover (CDN URLs in payloads), run **off-show**:

```bash
# Dry-run first
REDIS_URL="$REDIS_URL" npx tsx packages/server/scripts/reclaimLegacyMediaBlobs.ts --dry-run

# One room, then all rooms
REDIS_URL="$REDIS_URL" npx tsx packages/server/scripts/reclaimLegacyMediaBlobs.ts --room <roomId>
REDIS_URL="$REDIS_URL" npx tsx packages/server/scripts/reclaimLegacyMediaBlobs.ts
```

The script `SCAN`s `room:*:images:*` and `room:*:track-previews:*`, and `UNLINK`s hashes that still have a `data` field (legacy base64). URL-only pointer hashes are left alone. Record `used_memory` before/after (printed by the script) in the deploy notes.

Manual equivalent via Heroku Redis CLI:

```bash
heroku redis:cli -a rb-radio-listener
# SCAN 0 MATCH room:{roomId}:images:al-cover-* COUNT 100
# UNLINK <keys...>
INFO memory
```

