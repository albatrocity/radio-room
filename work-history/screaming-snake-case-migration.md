# Socket.IO Event Convention Migration: SCREAMING_SNAKE_CASE

## Summary

Migrated all Socket.IO event names from camelCase to SCREAMING_SNAKE_CASE to align with XState community conventions and reduce cognitive load for frontend developers.

## Rationale

The frontend codebase is heavily XState-based, and XState has strong conventions for SCREAMING_SNAKE_CASE event names. Having Socket.IO events in camelCase created unnecessary mental context switching:

```typescript
// Before (awkward mixing):
on: {
  messageReceived: { actions: ["addMessage"] },  // From socket (camelCase)
  SUBMIT_MESSAGE: { actions: ["sendMessage"] }   // Internal event (SCREAMING_SNAKE_CASE)
}

// After (consistent):
on: {
  MESSAGE_RECEIVED: { actions: ["addMessage"] },  // From socket (SCREAMING_SNAKE_CASE)
  SUBMIT_MESSAGE: { actions: ["sendMessage"] }    // Internal event (SCREAMING_SNAKE_CASE)
}
```

## Event Naming Convention

| Layer | Convention | Example | Reasoning |
|-------|------------|---------|-----------|
| **Socket.IO Events** | SCREAMING_SNAKE_CASE | `MESSAGE_RECEIVED`, `USER_JOINED` | Aligns with XState, frontend consistency |
| **Backend Plugin Events** | camelCase | `messageReceived`, `userJoined` | TypeScript function signature convention |
| **Redis PubSub Channels** | SYSTEM:SCREAMING_SNAKE_CASE | `SYSTEM:MESSAGE_RECEIVED` | Distinguishes system events |

## Changes Made

### Backend

#### 1. SystemEvents.ts
Updated `getSocketIOEventName()` to convert camelCase plugin events to SCREAMING_SNAKE_CASE:

```typescript
public static getSocketIOEventName(event: keyof PluginLifecycleEvents): string {
  // Convert camelCase to SCREAMING_SNAKE_CASE
  const snakeCase = String(event)
    .replaceAll(/([A-Z])/g, "_$1")
    .toUpperCase()
  return snakeCase.startsWith("_") ? snakeCase.substring(1) : snakeCase
}
```

#### 2. Socket Controllers
Updated all `socket.on()` listeners:

**messageController.ts:**
- `"sendMessage"` → `"SEND_MESSAGE"`
- `"clearMessages"` → `"CLEAR_MESSAGES"`
- `"startTyping"` → `"START_TYPING"`
- `"stopTyping"` → `"STOP_TYPING"`

**activityController.ts:**
- `"startListening"` → `"START_LISTENING"`
- `"stopListening"` → `"STOP_LISTENING"`
- `"addReaction"` → `"ADD_REACTION"`
- `"removeReaction"` → `"REMOVE_REACTION"`

**adminController.ts:**
- `"setPassword"` → `"SET_PASSWORD"`
- `"kickUser"` → `"KICK_USER"`
- `"setRoomSettings"` → `"SET_ROOM_SETTINGS"`
- `"clearPlaylist"` → `"CLEAR_PLAYLIST"`

**authController.ts:**
- `"checkPassword"` → `"CHECK_PASSWORD"`
- `"submitPassword"` → `"SUBMIT_PASSWORD"`
- `"login"` → `"LOGIN"`
- `"changeUsername"` → `"CHANGE_USERNAME"`
- `"getUserServiceAuthenticationStatus"` → `"GET_USER_SERVICE_AUTHENTICATION_STATUS"`
- `"logoutService"` → `"LOGOUT_SERVICE"`
- `"getUserSpotifyAuthenticationStatus"` → `"GET_USER_SPOTIFY_AUTHENTICATION_STATUS"`
- `"logoutSpotify"` → `"LOGOUT_SPOTIFY"`
- `"nukeUser"` → `"NUKE_USER"`
- `"userLeft"` → `"USER_LEFT"`

**djController.ts:**
- `"djDeputizeUser"` → `"DEPUTIZE_DJ"`
- `"queueSong"` → `"QUEUE_SONG"`
- `"searchTrack"` → `"SEARCH_TRACK"`
- `"savePlaylist"` → `"SAVE_PLAYLIST"`
- `"checkSavedTracks"` → `"CHECK_SAVED_TRACKS"`
- `"addToLibrary"` → `"ADD_TO_LIBRARY"`
- `"removeFromLibrary"` → `"REMOVE_FROM_LIBRARY"`
- `"getSavedTracks"` → `"GET_SAVED_TRACKS"`

**roomsController.ts:**
- `"getRoomSettings"` → `"GET_ROOM_SETTINGS"`
- `"getLatestRoomData"` → `"GET_LATEST_ROOM_DATA"`

#### 3. Direct socket.emit() Calls
Updated all handlers that emit events directly:

- `"errorOccurred"` → `"ERROR_OCCURRED"`
- `"unauthorized"` → `"UNAUTHORIZED"`
- `"userJoined"` → `"USER_JOINED"`
- `"roomSettingsUpdated"` → `"ROOM_SETTINGS_UPDATED"`
- `"messageReceived"` → `"MESSAGE_RECEIVED"`
- `"playlist"` → `"PLAYLIST"`

### Frontend

#### 1. XState Machines - Incoming Events

**chatMachine.ts:**
- `messageReceived` → `MESSAGE_RECEIVED`
- `messagesCleared` → `MESSAGES_CLEARED`

**reactionsMachine.ts & allReactionsMachine.ts:**
- `reactionAdded` → `REACTION_ADDED`
- `reactionRemoved` → `REACTION_REMOVED`

**playlistMachine.ts:**
- `playlistTrackAdded` → `PLAYLIST_TRACK_ADDED`

**typingMachine.ts:**
- `typingChanged` → `TYPING_CHANGED`

**usersMachine.ts:**
- `userJoined` → `USER_JOINED`
- `userLeft` → `USER_LEFT`

**authMachine.ts:**
- `userKicked` → `USER_KICKED`
- `unauthorized` → `UNAUTHORIZED`

**roomFetchMachine.ts:**
- `roomSettingsUpdated` → `ROOM_SETTINGS_UPDATED`
- `roomDeleted` → `ROOM_DELETED`

**errorHandlerMachine.ts:**
- `errorOccurred` → `ERROR_OCCURRED`

#### 2. XState Machines - Outgoing Events (sendTo)

**chatMachine.ts:**
- `"sendMessage"` → `"SEND_MESSAGE"`
- `"startTyping"` → `"START_TYPING"`
- `"stopTyping"` → `"STOP_TYPING"`
- `"clearMessages"` → `"CLEAR_MESSAGES"`

**reactionsMachine.ts:**
- `"addReaction"` → `"ADD_REACTION"`
- `"removeReaction"` → `"REMOVE_REACTION"`

**audioMachine.ts:**
- `"startListening"` → `"START_LISTENING"`
- `"stopListening"` → `"STOP_LISTENING"`

**adminMachine.ts:**
- `"deputizeDj"` → `"DEPUTIZE_DJ"`
- `"setRoomSettings"` → `"SET_ROOM_SETTINGS"`
- `"clearPlaylist"` → `"CLEAR_PLAYLIST"`

**authMachine.ts:**
- `"kickUser"` → `"KICK_USER"`
- `"submitPassword"` → `"SUBMIT_PASSWORD"`

## Complete Event Reference

### Broadcast Events (via SystemEvents)

| Plugin Event (camelCase) | Socket.IO (SCREAMING_SNAKE_CASE) | Redis Channel |
|--------------------------|----------------------------------|---------------|
| `messageReceived` | `MESSAGE_RECEIVED` | `SYSTEM:MESSAGE_RECEIVED` |
| `messagesCleared` | `MESSAGES_CLEARED` | `SYSTEM:MESSAGES_CLEARED` |
| `typingChanged` | `TYPING_CHANGED` | `SYSTEM:TYPING_CHANGED` |
| `reactionAdded` | `REACTION_ADDED` | `SYSTEM:REACTION_ADDED` |
| `reactionRemoved` | `REACTION_REMOVED` | `SYSTEM:REACTION_REMOVED` |
| `trackChanged` | `TRACK_CHANGED` | `SYSTEM:TRACK_CHANGED` |
| `playlistTrackAdded` | `PLAYLIST_TRACK_ADDED` | `SYSTEM:PLAYLIST_TRACK_ADDED` |
| `userJoined` | `USER_JOINED` | `SYSTEM:USER_JOINED` |
| `userLeft` | `USER_LEFT` | `SYSTEM:USER_LEFT` |
| `userStatusChanged` | `USER_STATUS_CHANGED` | `SYSTEM:USER_STATUS_CHANGED` |
| `userKicked` | `USER_KICKED` | `SYSTEM:USER_KICKED` |
| `roomDeleted` | `ROOM_DELETED` | `SYSTEM:ROOM_DELETED` |
| `roomSettingsUpdated` | `ROOM_SETTINGS_UPDATED` | `SYSTEM:ROOM_SETTINGS_UPDATED` |
| `configChanged` | `CONFIG_CHANGED` | `SYSTEM:CONFIG_CHANGED` |
| `errorOccurred` | `ERROR_OCCURRED` | `SYSTEM:ERROR_OCCURRED` |

### Request/Response Events (Direct Socket.IO)

| Frontend Sends | Backend Receives | Purpose |
|----------------|------------------|---------|
| `LOGIN` | `LOGIN` | User login |
| `SUBMIT_PASSWORD` | `SUBMIT_PASSWORD` | Submit room password |
| `CHANGE_USERNAME` | `CHANGE_USERNAME` | Update username |
| `SEND_MESSAGE` | `SEND_MESSAGE` | Send chat message |
| `START_TYPING` | `START_TYPING` | Indicate typing |
| `STOP_TYPING` | `STOP_TYPING` | Stop typing |
| `CLEAR_MESSAGES` | `CLEAR_MESSAGES` | Clear all messages |
| `ADD_REACTION` | `ADD_REACTION` | Add reaction |
| `REMOVE_REACTION` | `REMOVE_REACTION` | Remove reaction |
| `START_LISTENING` | `START_LISTENING` | Start listening mode |
| `STOP_LISTENING` | `STOP_LISTENING` | Stop listening mode |
| `QUEUE_SONG` | `QUEUE_SONG` | Add song to queue |
| `SEARCH_TRACK` | `SEARCH_TRACK` | Search for tracks |
| `SAVE_PLAYLIST` | `SAVE_PLAYLIST` | Save playlist |
| `DEPUTIZE_DJ` | `DEPUTIZE_DJ` | Deputize user as DJ |
| `SET_ROOM_SETTINGS` | `SET_ROOM_SETTINGS` | Update room settings |
| `SET_PASSWORD` | `SET_PASSWORD` | Set room password |
| `KICK_USER` | `KICK_USER` | Kick user from room |
| `CLEAR_PLAYLIST` | `CLEAR_PLAYLIST` | Clear playlist |
| `GET_ROOM_SETTINGS` | `GET_ROOM_SETTINGS` | Fetch room settings |

## Benefits

1. ✅ **XState Consistency**: All events in XState machines now use SCREAMING_SNAKE_CASE
2. ✅ **Reduced Cognitive Load**: No mental translation needed between socket events and XState events
3. ✅ **Better Readability**: Events stand out visually in the frontend codebase
4. ✅ **Community Alignment**: Follows XState community best practices
5. ✅ **Maintained Type Safety**: Backend plugins still use idiomatic TypeScript camelCase

## Deployment

This is a **breaking change** requiring coordinated deployment:

1. Deploy backend with SCREAMING_SNAKE_CASE support
2. Frontend will break until deployed
3. Deploy frontend expecting SCREAMING_SNAKE_CASE
4. Consider maintenance window for the deployment

## Migration Date

Completed: [Current Date]

## Related Documentation

- `plans/event-standardization-completion.md` - Previous camelCase standardization
- `plans/systemevents-socketio-integration.md` - SystemEvents architecture
- `packages/types/Plugin.ts` - Plugin event type definitions

