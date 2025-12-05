# Media Source Status Fix - Track Changes Now Display

## Problem
After implementing the separated `MEDIA_SOURCE_STATUS_CHANGED` event, the UI displayed correctly on initial load but tracks disappeared when they changed. This was because:

1. ✅ On INIT: audioMachine inferred status from track data and transitioned to "online"
2. ✅ On INIT: Track data rendered correctly
3. ❌ On TRACK_CHANGED: Meta updated but machine stayed in its current state
4. ❌ If machine was in "offline" for any reason, it never transitioned back to "online"
5. ❌ Only radio rooms were emitting `MEDIA_SOURCE_STATUS_CHANGED` events

## Root Cause

**Backend wasn't emitting status for jukebox rooms:**
```typescript
// Before - Only radio rooms got status updates
if (room?.type === "radio") {
  await context.systemEvents.emit(roomId, "MEDIA_SOURCE_STATUS_CHANGED", {...})
}
```

**Frontend state machine couldn't transition:**
- When in "offline" state, `TRACK_CHANGED` only updated meta, didn't transition to "online"
- Jukebox rooms never received status events to trigger state transitions

## Solution

### 1. Emit Status for Both Room Types
**File**: `packages/server/operations/room/handleRoomNowPlayingData.ts`

```typescript
// Now - Both room types get status updates
await context.systemEvents.emit(roomId, "MEDIA_SOURCE_STATUS_CHANGED", {
  roomId,
  status: "online" as const,
  sourceType: room?.type === "radio" ? ("radio" as const) : ("jukebox" as const),
  bitrate: room?.type === "radio" && stationMeta?.bitrate ? Number(stationMeta.bitrate) : undefined,
})
```

Also emit "offline" status when track is cleared:
```typescript
if (!nowPlaying && room?.fetchMeta) {
  await clearRoomCurrent({ context, roomId })
  
  // Emit offline status
  await context.systemEvents.emit(roomId, "MEDIA_SOURCE_STATUS_CHANGED", {
    roomId,
    status: "offline" as const,
    sourceType: room?.type === "radio" ? ("radio" as const) : ("jukebox" as const),
  })
  return null
}
```

### 2. Forward Status Events via PubSub
**File**: `packages/server/pubSub/handlers/jukebox.ts`

Added PubSub listener for MEDIA_SOURCE_STATUS_CHANGED:
```typescript
context.redis.subClient.pSubscribe(
  SystemEvents.getChannelName("MEDIA_SOURCE_STATUS_CHANGED"),
  (message, channel) => handleMediaSourceStatus({ io, message, channel, context }),
)
```

Added handler to forward to Socket.IO:
```typescript
async function handleMediaSourceStatus({ io, message }: ContextPubSubHandlerArgs) {
  const data = JSON.parse(message)
  io.to(getRoomPath(data.roomId)).emit("event", {
    type: "MEDIA_SOURCE_STATUS_CHANGED",
    data,
  })
}
```

### 3. Frontend Already Configured
The audioMachine was already set up correctly to handle these events:

```typescript
// In offline state
MEDIA_SOURCE_STATUS_CHANGED: [
  { target: "online", actions: ["setMediaSourceStatus"], cond: "statusIsOnline" },
  { target: "offline", actions: ["setMediaSourceStatus"] },
]
```

## Event Flow (Complete)

### Track Appears (Both Room Types)
```
Backend: Track data received
    ↓
handleRoomNowPlayingData()
    ├─ Emits: TRACK_CHANGED (track info)
    └─ Emits: MEDIA_SOURCE_STATUS_CHANGED (status: "online")
    ↓
Redis PubSub
    ↓
PubSub Handlers
    ├─ handleNowPlaying() forwards TRACK_CHANGED
    └─ handleMediaSourceStatus() forwards MEDIA_SOURCE_STATUS_CHANGED
    ↓
Frontend audioMachine
    ├─ TRACK_CHANGED → updates meta
    └─ MEDIA_SOURCE_STATUS_CHANGED → transitions to "online" state
    ↓
UI renders track info ✅
```

### Track Disappears
```
Backend: No track data
    ↓
handleRoomNowPlayingData()
    └─ Emits: MEDIA_SOURCE_STATUS_CHANGED (status: "offline")
    ↓
Frontend audioMachine
    └─ MEDIA_SOURCE_STATUS_CHANGED → transitions to "offline" state
    ↓
UI shows "Nothing playing" ✅
```

## Benefits

✅ **Jukebox rooms work**: Now get proper status updates  
✅ **Radio rooms work**: Continue to get status updates  
✅ **Track changes display**: UI updates when tracks change  
✅ **Online/offline tracking**: Machine correctly transitions states  
✅ **Consistent architecture**: Both room types use same event pattern  

## Testing Scenarios

### Jukebox Room
1. ✅ Join room with track playing → Shows track
2. ✅ Track changes → Updates to new track
3. ✅ Player goes offline → Shows "Nothing playing"
4. ✅ Player comes back online → Shows track again

### Radio Room  
1. ✅ Join room with stream active → Shows track
2. ✅ Track changes on stream → Updates to new track
3. ✅ Stream goes down → Shows "Radio offline"
4. ✅ Stream reconnects → Shows track again

Track changes now display correctly for both room types! 🎵

