# Final Event Name Fixes - SCREAMING_SNAKE_CASE Migration

## Issue
After the initial SCREAMING_SNAKE_CASE migration, several frontend machines were still sending lowercase/mixed-case event names to the backend, causing the events to not be received properly.

## Additional Fixes Made

### Frontend Outgoing Events (Fixed)

**authMachine.ts:**
- `"login"` → `"LOGIN"`
- `"change username"` → `"CHANGE_USERNAME"`
- `"user left"` → `"USER_LEFT"`
- `"nuke user"` → `"NUKE_USER"`
- `"check password"` → `"CHECK_PASSWORD"`

**djMachine.ts:**
- `"set DJ"` → `"SET_DJ"`

**roomFetchMachine.ts:**
- `"get latest room data"` → `"GET_LATEST_ROOM_DATA"`

**settingsMachine.ts:**
- `"get room settings"` → `"GET_ROOM_SETTINGS"`

**triggerEventsMachine.ts:**
- `"get trigger events"` → `"GET_TRIGGER_EVENTS"`
- `"set reaction trigger events"` → `"SET_REACTION_TRIGGER_EVENTS"`
- `"set message trigger events"` → `"SET_MESSAGE_TRIGGER_EVENTS"`

**trackSearchMachine.ts:**
- `"search track"` → `"SEARCH_TRACK"`

**savedTracksMachine.ts:**
- `"get saved tracks"` → `"GET_SAVED_TRACKS"`

**savePlaylistMachine.ts:**
- `"save playlist"` → `"SAVE_PLAYLIST"`

**queueMachine.ts:**
- `"queue song"` → `"QUEUE_SONG"`

**metadataSourceAuthMachine.ts:**
- `"get user service authentication status"` → `"GET_USER_SERVICE_AUTHENTICATION_STATUS"`
- `"logout service"` → `"LOGOUT_SERVICE"`

**addToLibraryMachine.ts:**
- `"check saved tracks"` → `"CHECK_SAVED_TRACKS"`
- `"add to library"` → `"ADD_TO_LIBRARY"`
- `"remove from library"` → `"REMOVE_FROM_LIBRARY"`

### Backend Fixes

**authHandlersAdapter.ts:**
- Fixed one remaining `"errorOccurred"` → `"ERROR_OCCURRED"`

## Impact

These were the **missed events** in the initial migration that were preventing:
- User login from working properly
- Room data fetching
- Track search
- Library management
- Playlist saving
- DJ session management
- Room settings retrieval

All Socket.IO events are now consistently using SCREAMING_SNAKE_CASE across the entire platform.

## Verification

All frontend `sendTo("socket")` calls now emit SCREAMING_SNAKE_CASE events that match the backend `socket.on()` listeners.

## Status

✅ **Complete** - All event names have been migrated to SCREAMING_SNAKE_CASE

