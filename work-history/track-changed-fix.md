# TRACK_CHANGED Event Fix

## Issue
The UI was not updating on track changes because the frontend was listening for `META` events but the backend was emitting `TRACK_CHANGED` events via SystemEvents.

## Root Cause
After standardizing event names to SCREAMING_SNAKE_CASE:
1. Backend emits `TRACK_CHANGED` via `SystemEvents`
2. Redis PubSub receives it on `SYSTEM:TRACK_CHANGED` channel
3. PubSub handler built the payload using `makeJukeboxCurrentPayload()` which returns `{ type: "META", data: {...} }`
4. Handler emitted this directly to Socket.IO: `io.emit("event", payload)` 
5. Frontend `audioMachine` was still listening for `META`, not `TRACK_CHANGED`

## Solution

### Backend Fix (`packages/server/pubSub/handlers/jukebox.ts`)
Updated `handleNowPlaying` to emit standardized `TRACK_CHANGED` event:

```typescript
// Before
io.to(getRoomPath(roomId)).emit("event", payload)

// After
io.to(getRoomPath(roomId)).emit("event", {
  type: "TRACK_CHANGED",
  data: {
    roomId,
    track,
    meta: payload?.data?.meta,
  },
})
```

### Frontend Fix (`apps/web/src/machines/audioMachine.ts`)
Updated all `META` event listeners to `TRACK_CHANGED`:

**Changes made:**
- Line 35: `META:` → `TRACK_CHANGED:`
- Line 63: `META:` → `TRACK_CHANGED:` (in playing state)
- Line 82: `META:` → `TRACK_CHANGED:` (in stopped state)
- Line 138: `META:` → `TRACK_CHANGED:` (in offline state)

## Payload Structure

### INIT Event (unchanged)
```typescript
{
  type: "INIT",
  data: {
    users: User[],
    messages: ChatMessage[],
    meta: RoomMeta,        // ← audioMachine uses this
    playlist: QueueItem[],
    reactions: ReactionStore,
    user: User,
    ...
  }
}
```

### TRACK_CHANGED Event (standardized)
```typescript
{
  type: "TRACK_CHANGED",
  data: {
    roomId: string,
    track: QueueItem,
    meta: RoomMeta,        // ← audioMachine uses this
  }
}
```

Both event types now provide `event.data.meta` which the `audioMachine.setMeta` action expects:
```typescript
setMeta: assign((_context, event) => {
  return { meta: event.data.meta }
})
```

## Testing Checklist
- [ ] Track changes appear in UI immediately
- [ ] Track artwork updates correctly
- [ ] Track info (title, artist, album) displays
- [ ] Audio player shows correct metadata
- [ ] DJ attribution shows correctly
- [ ] INIT event still provides track info on room join

All track change events now use standardized `TRACK_CHANGED` name! ✅

