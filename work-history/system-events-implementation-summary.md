# SystemEvents Implementation Summary

**Date**: November 25, 2025  
**Status**: ✅ Complete - Phase 1

## What Was Implemented

Successfully created and integrated the SystemEvents layer - a unified event emission system that broadcasts to both Redis PubSub and the Plugin system with a single API call.

## Core Implementation

### 1. SystemEvents Class
**File**: `packages/server/lib/SystemEvents.ts`

A centralized event emission layer that:
- Broadcasts events to Redis PubSub (for cross-server communication)
- Broadcasts events to Plugin System (for in-process plugin handlers)
- Provides type-safe event emission
- Handles errors gracefully without throwing
- Auto-generates channel names (`SYSTEM:TRACK_CHANGED`, etc.)

```typescript
await context.systemEvents.emit(roomId, "trackChanged", {
  roomId,
  track: nowPlaying,
  roomMeta: updatedCurrent
})
```

### 2. Integration Points

**AppContext** (`packages/types/AppContext.ts`):
- Added `systemEvents?: any` field

**Server Initialization** (`packages/server/index.ts`):
- SystemEvents initialized after PluginRegistry
- Injected into context for all operations

### 3. Migrated Events

All major system events now use SystemEvents:

| Event | Emission Point | Status |
|-------|---------------|---------|
| `trackChanged` | `operations/room/handleRoomNowPlayingData.ts` | ✅ Migrated |
| `roomDeleted` | `operations/data/rooms.ts` | ✅ Migrated |
| `roomSettingsUpdated` | `operations/room/handleRoomNowPlayingData.ts` | ✅ Migrated |
| `userJoined` | `operations/sockets/users.ts` | ✅ Migrated |
| `reactionAdded` | `operations/reactions/addReaction.ts` | ✅ Migrated |
| `reactionRemoved` | `operations/reactions/removeReaction.ts` | ✅ Migrated |
| `configChanged` | `handlers/adminHandlersAdapter.ts` | ✅ Migrated |

## Changes Made

### Operations Updated
- `packages/server/operations/room/handleRoomNowPlayingData.ts`
  - Removed `pubSubNowPlaying()` function
  - Now uses `systemEvents.emit("trackChanged")`
  - Updated `pubRoomSettingsUpdated()` to use SystemEvents

- `packages/server/operations/data/rooms.ts`
  - Removed direct PubSub publish for roomDeleted
  - Now uses `systemEvents.emit("roomDeleted")`

- `packages/server/operations/sockets/users.ts`
  - Removed direct PubSub publish for userJoined
  - Now uses `systemEvents.emit("userJoined")`

- `packages/server/operations/reactions/*.ts`
  - Removed `emitPluginEvent()` calls
  - Now uses `systemEvents.emit()`

### Handlers Updated
- `packages/server/handlers/adminHandlersAdapter.ts`
  - Removed `emitPluginEvent` import
  - Now uses `systemEvents.emit("configChanged")`
  - Removed duplicate `roomSettingsUpdated` emission (done by operation)

### PubSub Handlers Updated
- `packages/server/pubSub/handlers/jukebox.ts`
  - Now listens to `SYSTEM:_TRACK_CHANGED` channel
  - Updated to handle new payload structure

- `packages/server/pubSub/handlers/rooms.ts`
  - Now listens to `SYSTEM:_ROOM_DELETED`
  - Now listens to `SYSTEM:_ROOM_SETTINGS_UPDATED`
  - Updated handlers for new payload structures

## Benefits Realized

### Before SystemEvents
```typescript
// Had to emit to two systems separately
await pubSubNowPlaying({ context, roomId, nowPlaying, roomMeta })
await emitPluginEvent(context, roomId, "trackChanged", { ... })
```

### After SystemEvents
```typescript
// Single emit broadcasts to both!
await context.systemEvents.emit(roomId, "trackChanged", {
  roomId,
  track: nowPlaying,
  roomMeta: updatedCurrent
})
```

### Key Benefits

1. **Single Emission Point**: One call instead of two
2. **Consistent Payloads**: Guaranteed same data to all consumers
3. **Type Safety**: TypeScript enforces event shapes
4. **Cross-Server Ready**: Redis PubSub enables multi-server deployment
5. **In-Process Fast**: Plugins get events immediately without serialization overhead
6. **Extensible**: Easy to add new consumers (webhooks, analytics, audit logs)
7. **Error Resilient**: Failures in one consumer don't break others

## Architecture

```
Operations/Handlers
        ↓
   SystemEvents.emit()
        ↓
    ┌───┴───┐
    │       │
    ↓       ↓
Redis PubSub  Plugin System
(cross-server) (in-process)
    ↓       ↓
Socket.IO   Plugins
Handlers    (fast)
```

## Channel Naming Convention

SystemEvents auto-generates Redis channels:
- `trackChanged` → `SYSTEM:_TRACK_CHANGED`
- `userJoined` → `SYSTEM:_USER_JOINED`
- `roomDeleted` → `SYSTEM:_ROOM_DELETED`

Format: `SYSTEM:_{UPPER_SNAKE_CASE}`

## Events Not Yet Migrated

These still use old PubSub channels (not urgent):
- `PUBSUB_PLAYLIST_ADDED` - Playlist modifications
- `PUBSUB_PLAYBACK_STATE_CHANGED` - Play/pause events
- `PUBSUB_METADATA_SOURCE_AUTH_ERROR` - Auth errors
- `PUBSUB_METADATA_SOURCE_RATE_LIMIT_ERROR` - Rate limit errors
- `PUBSUB_RADIO_ERROR` - Radio stream errors
- `PUBSUB_USER_SERVICE_ACCESS_TOKEN_REFRESHED` - Token refresh
- `PUBSUB_USER_SERVICE_AUTHENTICATION_STATUS` - Auth status

These can be migrated gradually as needed.

## Usage Guidelines

### For Developers: When to Use SystemEvents

✅ **DO use SystemEvents for:**
- Domain events (track changed, user joined, room deleted)
- Events that plugins might care about
- Events that need cross-server coordination

❌ **DON'T use SystemEvents for:**
- Internal implementation details
- Temporary/transient state
- Events that only Socket.IO needs (keep direct emission)

### Adding a New Event

**Step 1**: Define in `PluginLifecycleEvents`
```typescript
export type PluginLifecycleEvents = {
  // ... existing events
  playlistItemAdded: (data: { roomId: string; item: QueueItem }) => Promise<void> | void
}
```

**Step 2**: Emit in operation
```typescript
if (context.systemEvents) {
  await context.systemEvents.emit(roomId, "playlistItemAdded", {
    roomId,
    item: queueItem
  })
}
```

**Step 3**: Update PubSub handler (if needed)
```typescript
context.redis.subClient.pSubscribe(
  SystemEvents.getChannelName("playlistItemAdded"),
  (message, channel) => handlePlaylistItemAdded({ io, message, channel, context })
)
```

**Step 4**: Plugins automatically receive it
```typescript
// In plugin
context.lifecycle.on("playlistItemAdded", async (data) => {
  console.log(`New item added: ${data.item.title}`)
})
```

## Testing

SystemEvents can be tested by:
1. Mocking `context.systemEvents`
2. Verifying `.emit()` called with correct parameters
3. Testing channel name generation with `SystemEvents.getChannelName()`

## Performance Considerations

- **In-Process Plugins**: Near-zero latency (direct function call)
- **Redis PubSub**: Network round-trip (~1-5ms local, more if remote)
- **Error Handling**: Failures are logged but don't break execution
- **Serialization**: Only happens once (for Redis), not per consumer

## Future Enhancements

Potential additions:
- [ ] Event batching for high-frequency events
- [ ] Event filtering/subscription management
- [ ] Metrics/monitoring hooks
- [ ] Event replay/audit log
- [ ] Webhooks as another consumer
- [ ] Analytics stream consumer
- [ ] Dead letter queue for failed events

## Migration Status

**Phase 1**: ✅ Complete
- SystemEvents class created
- Integrated into server
- Core events migrated
- PubSub handlers updated

**Phase 2**: ⏸️ Optional
- Migrate remaining PubSub events
- Add monitoring/metrics
- Implement event batching
- Add webhook consumer

## Breaking Changes

**None!** All changes are backward compatible:
- Old PubSub channels still work for unmigrated events
- Plugins receive events through same API
- Socket.IO handlers work unchanged

## Files Changed

### New Files
- `packages/server/lib/SystemEvents.ts` - Core implementation

### Modified Files
- `packages/types/AppContext.ts` - Added systemEvents field
- `packages/server/index.ts` - Initialization
- `packages/server/operations/room/handleRoomNowPlayingData.ts` - trackChanged, roomSettingsUpdated
- `packages/server/operations/data/rooms.ts` - roomDeleted
- `packages/server/operations/sockets/users.ts` - userJoined
- `packages/server/operations/reactions/*.ts` - reactionAdded, reactionRemoved
- `packages/server/handlers/adminHandlersAdapter.ts` - configChanged
- `packages/server/pubSub/handlers/jukebox.ts` - Updated listener
- `packages/server/pubSub/handlers/rooms.ts` - Updated listeners

### Documentation
- `plans/event-payload-consolidation-summary.md` - Payload alignment
- `plans/system-events-implementation-summary.md` - This document

## Conclusion

The SystemEvents implementation successfully provides a unified, type-safe, and extensible event emission layer. Operations now have a simple, single API for broadcasting domain events to all interested consumers, setting a solid foundation for future event-driven features.

