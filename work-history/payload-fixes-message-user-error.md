# Payload Fixes - MESSAGE_RECEIVED Error Resolution

## Issue
Error: `undefined is not an object (evaluating 'message.user')` in `ChatWindow.tsx` when removing deputyDj status from a user.

## Root Cause
After standardizing payloads, several direct Socket.IO emits were still using the **old payload format** without the wrapper structure `{ roomId, ... }`.

## Files Fixed

### 1. `packages/server/handlers/adminHandlersAdapter.ts`
**Line 66**: Direct emit when kicking a user
```typescript
// Before
io.to(result.socketId).emit("event", { 
  type: "MESSAGE_RECEIVED", 
  data: result.message 
})

// After
io.to(result.socketId).emit("event", {
  type: "MESSAGE_RECEIVED",
  data: {
    roomId: socket.data.roomId,
    message: result.message,
  },
})
```

**Line 153**: Broadcast room settings update
```typescript
// Before
data: {
  room: result.room,
  playlistDemocracy: updatedPlaylistDemocracy,
}

// After
data: {
  roomId: socket.data.roomId,
  room: result.room,
  playlistDemocracy: updatedPlaylistDemocracy,
}
```

### 2. `packages/server/handlers/djHandlersAdapter.ts`
**Line 30**: Direct emit when deputizing a user
```typescript
// Before
data: result.systemMessage

// After
data: {
  roomId: socket.data.roomId,
  message: result.systemMessage,
}
```

### 3. `packages/server/handlers/authHandlersAdapter.ts`
**Line 121 & 161**: Broadcast user joined events
```typescript
// Before
data: {
  user: result.newUser,
  users: result.newUsers,
}

// After  
data: {
  roomId: socket.data.roomId,
  user: result.newUser,
  users: result.newUsers,
}
```

### 4. Frontend Type Updates
**`apps/web/src/machines/settingsMachine.ts`**
```typescript
// Added roomId to type
type: "ROOM_SETTINGS_UPDATED"; 
data: { roomId: string; room: Room; playlistDemocracy?: PlaylistDemocracyConfig }
```

**`apps/web/src/machines/roomFetchMachine.ts`**
```typescript
// Added roomId to type
type: "ROOM_SETTINGS_UPDATED"; 
data: { roomId: string; room: Omit<Room, "password"> }
```

## Pattern Identified

**Direct Socket.IO emits** (targeting specific sockets or broadcasting to rooms) must still follow the **standardized payload structure**:

### Broadcast Events (via SystemEvents)
```typescript
await context.systemEvents.emit(roomId, "EVENT_NAME", {
  roomId,
  ...eventSpecificData
})
```

### Direct Socket Emits (request/response)
```typescript
io.to(socketId).emit("event", {
  type: "EVENT_NAME",
  data: {
    roomId,  // ← Always include for consistency
    ...eventSpecificData
  }
})
```

## Why This Matters

1. **Frontend expects consistent structure**: All event handlers now expect `event.data.message` not `event.data`
2. **roomId provides context**: Every event should include roomId for proper context tracking
3. **Easier debugging**: Consistent payloads make it clear which room events belong to

## Testing Checklist

- [x] Messages send and display correctly
- [x] Deputizing/un-deputizing users works without errors
- [x] Kicking users shows system message correctly
- [x] Room settings updates propagate with plugin configs
- [x] User join/leave events include all required data
- [x] No TypeScript/linter errors

All payload inconsistencies resolved! ✅

