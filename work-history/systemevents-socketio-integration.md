# SystemEvents Socket.IO Integration

## Overview

Extended the `SystemEvents` layer to include Socket.IO as a third consumer, creating a unified event emission system that broadcasts to:

1. **Redis PubSub** (for cross-server communication)
2. **Plugin System** (for in-process plugin event handling)
3. **Socket.IO** (for real-time frontend updates)

## Benefits

- ✅ **Single source of truth**: One `emit()` call broadcasts to all consumers
- ✅ **Consistency**: Same event payloads across Redis, Plugins, and Frontend
- ✅ **Discoverability**: All system events defined in one place (`PluginLifecycleEvents`)
- ✅ **Type safety**: Compile-time checks for event names and payloads
- ✅ **Maintainability**: Easier to add new events and consumers

## Architecture

```typescript
// Before: Multiple emission points
io.to(roomId).emit("event", { type: "USER_JOINED", data: {...} })
redis.publish(PUBSUB_USER_JOINED, JSON.stringify({...}))
pluginRegistry.emit(roomId, "userJoined", {...})

// After: Single emission point
await context.systemEvents.emit(roomId, "userJoined", {
  roomId,
  user,
  users
})
```

## Implementation Details

### 1. Extended SystemEvents Class

**File**: `packages/server/lib/SystemEvents.ts`

- Added Socket.IO server instance to constructor
- Added `emitToSocketIO()` private method
- Added event name mapping (camelCase → SCREAMING_SNAKE_CASE)
- Added data transformation for Socket.IO format compatibility

**Key Features**:
- Special event name mappings (e.g., `trackChanged` → `NOW_PLAYING`)
- Data transformation layer for Socket.IO-specific formats
- Error handling that doesn't break other consumers

### 2. Updated Plugin Lifecycle Events

**File**: `packages/types/Plugin.ts`

Added new broadcast events:
- `messageReceived` → `NEW_MESSAGE`
- `messagesCleared` → `SET_MESSAGES`
- `typingChanged` → `TYPING`
- `playlistTrackAdded` → `PLAYLIST_TRACK_ADDED`
- `userKicked` → `KICKED`
- `errorOccurred` → `ERROR`

Enhanced existing events:
- `userJoined` now includes `users` array
- `reactionAdded` and `reactionRemoved` now include full `reactions` array for Socket.IO

### 3. Event Naming Convention

**All events now use consistent camelCase naming** across the entire platform:
- Backend plugins: `trackChanged`, `messageReceived`, `reactionAdded`, etc.
- Frontend Socket.IO: Same camelCase names
- Redis PubSub channels: Prefixed with `SYSTEM:` and converted to SCREAMING_SNAKE_CASE

| Event Name (camelCase) | Redis Channel | Purpose |
|----------------------|---------------|---------|
| `reactionAdded` | `SYSTEM:REACTION_ADDED` | React to message/track |
| `reactionRemoved` | `SYSTEM:REACTION_REMOVED` | Remove reaction |
| `trackChanged` | `SYSTEM:TRACK_CHANGED` | New track playing |
| `messageReceived` | `SYSTEM:MESSAGE_RECEIVED` | New chat message |
| `messagesCleared` | `SYSTEM:MESSAGES_CLEARED` | Clear all messages |
| `typingChanged` | `SYSTEM:TYPING_CHANGED` | User typing status |
| `userJoined` | `SYSTEM:USER_JOINED` | User joined room |
| `userLeft` | `SYSTEM:USER_LEFT` | User left room |
| `userStatusChanged` | `SYSTEM:USER_STATUS_CHANGED` | User status update |
| `roomDeleted` | `SYSTEM:ROOM_DELETED` | Room was deleted |
| `roomSettingsUpdated` | `SYSTEM:ROOM_SETTINGS_UPDATED` | Room settings changed |
| `configChanged` | `SYSTEM:CONFIG_CHANGED` | Config updated |
| `playlistTrackAdded` | `SYSTEM:PLAYLIST_TRACK_ADDED` | Track added to playlist |
| `userKicked` | `SYSTEM:USER_KICKED` | User kicked from room |
| `errorOccurred` | `SYSTEM:ERROR_OCCURRED` | Error occurred |

### 4. Migrated Broadcast Events

#### Operations Layer
- **`operations/sockets/users.ts`**: `pubUserJoined` → uses SystemEvents
- **`operations/reactions/addReaction.ts`**: emits via SystemEvents with full reactions array
- **`operations/reactions/removeReaction.ts`**: emits via SystemEvents with full reactions array
- **`lib/sendMessage.ts`**: messages emit via SystemEvents

#### Handlers Layer
- **`handlers/activityHandlersAdapter.ts`**: Removed direct Socket.IO emits for reactions
- **`handlers/messageHandlersAdapter.ts`**: 
  - Typing events use SystemEvents
  - Clear messages uses SystemEvents
  - New messages use SystemEvents (via `sendMessage`)

### 4. Event Name Mappings

| Plugin Event | Socket.IO Event | Notes |
|--------------|----------------|-------|
| `trackChanged` | `NOW_PLAYING` | Includes `track` and `meta` |
| `reactionAdded` | `REACTIONS` | Includes full ReactionStore object |
| `reactionRemoved` | `REACTIONS` | Includes full ReactionStore object |
| `userJoined` | `USER_JOINED` | Includes `user` and `users` |
| `userLeft` | `USER_LEFT` | |
| `roomDeleted` | `ROOM_DELETED` | |
| `roomSettingsUpdated` | `ROOM_SETTINGS` | Includes full `room` object |
| `configChanged` | `CONFIG_CHANGED` | |
| `messageReceived` | `NEW_MESSAGE` | |
| `messagesCleared` | `SET_MESSAGES` | Returns `{ messages: [] }` |
| `typingChanged` | `TYPING` | |
| `playlistTrackAdded` | `PLAYLIST_TRACK_ADDED` | |
| `userKicked` | `KICKED` | |
| `errorOccurred` | `ERROR` | |

## Response vs Broadcast Events

**Not migrated to SystemEvents** (request/response pattern):
- `ROOM_SETTINGS` (individual request)
- `ROOM_DATA` (individual request)
- `SERVICE_ACCESS_TOKEN_REFRESHED` (user-specific)
- `SERVICE_AUTHENTICATION_STATUS` (user-specific)
- `TRACK_SEARCH_RESULTS` (user-specific)
- `CHECK_SAVED_TRACKS_RESULTS` (user-specific)
- `SAVE_PLAYLIST_FAILED` (user-specific)

These remain as direct `socket.emit()` calls because they are responses to specific requests, not system-wide broadcasts.

## Data Transformation Layer

The `transformDataForSocketIO()` method handles special cases where Socket.IO expects different data formats:

```typescript
// trackChanged: Frontend expects { track, meta }
{ track: data.track, meta: data.roomMeta }

// reactions: Frontend expects { reactions: [...] }
{ reactions: data.reactions }

// userJoined: Frontend expects { user, users }
{ user: data.user, users: data.users }

// messagesCleared: Frontend expects { messages: [] }
{ messages: [] }
```

## Server Initialization

**File**: `packages/server/index.ts`

```typescript
// SystemEvents now receives Socket.IO server instance
this.context.systemEvents = new SystemEvents(
  this.context.redis,
  this.io,           // Socket.IO server
  this.pluginRegistry
)
```

## Testing Recommendations

1. **Broadcast Events**: Verify all migrated events reach:
   - Frontend clients (Socket.IO)
   - Redis PubSub (for multi-server)
   - Plugins (for extensions)

2. **Event Payloads**: Ensure data format matches frontend expectations

3. **Response Events**: Verify non-migrated events still work as direct socket.emit()

4. **Error Handling**: Test that if one consumer fails, others continue to work

## Future Enhancements

1. **Webhook Consumer**: Add webhooks as 4th consumer
2. **Analytics Consumer**: Add analytics/metrics tracking
3. **Audit Log Consumer**: Add audit logging for compliance
4. **Event Replay**: Add event sourcing capabilities
5. **Rate Limiting**: Add per-consumer rate limiting

## Migration Notes

- All broadcast events should now go through `context.systemEvents.emit()`
- Direct `io.to().emit()` calls should only be used for request/response patterns
- PubSub handlers may need updates to avoid duplicate Socket.IO emissions
- Plugins automatically receive all new events

## Issues Fixed

### Issue 1: Messages Error ✅
**Problem**: Frontend was receiving `{ roomId, message }` instead of just the message object, causing an error about accessing `userId` on undefined.

**Solution**: Added `messageReceived` case in `transformDataForSocketIO` to extract just the message object.

### Issue 2: Reactions Not Appearing ✅
**Problem**: Reactions persisted to database but didn't show in frontend until page refresh.

**Root Cause**: Event name mismatch - SystemEvents was emitting `REACTION_ADDED`/`REACTION_REMOVED` but frontend was listening for `REACTIONS`.

**Solution**: Added special mappings in `getSocketIOEventName`:
```typescript
reactionAdded: "REACTIONS",
reactionRemoved: "REACTIONS",
```

### Issue 3: Type Mismatches ✅
**Problem**: TypeScript errors due to incorrect `reactions` type (was `any[]` but should be `ReactionStore`).

**Solution**: 
- Updated `PluginLifecycleEvents` to use `ReactionStore` type
- Fixed return types in reaction operations
- Added proper null checks for undefined reactions

## Related Files

- `packages/server/lib/SystemEvents.ts`
- `packages/types/Plugin.ts`
- `packages/types/SystemEvents.ts`
- `packages/types/AppContext.ts`
- `packages/types/Reaction.ts`
- `packages/server/index.ts`
- `packages/server/operations/sockets/users.ts`
- `packages/server/operations/reactions/*.ts`
- `packages/server/handlers/activityHandlersAdapter.ts`
- `packages/server/handlers/messageHandlersAdapter.ts`
- `packages/server/lib/sendMessage.ts`

