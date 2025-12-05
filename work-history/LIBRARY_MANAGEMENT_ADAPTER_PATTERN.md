# Library Management Adapter Pattern

## Problem

The `ButtonAddToLibrary` component was using:
- Old PKCE authentication pattern (removed due to whitelist limits)
- Direct Spotify API calls from the frontend
- Spotify-specific implementation instead of adapter pattern

This meant:
- Guests with no authentication couldn't use the feature
- Code was tightly coupled to Spotify
- Didn't work with the new room creator token system

## Solution

Implemented library management using the adapter pattern:
- Added optional library methods to `MetadataSourceApi` interface
- Implemented methods in Spotify adapter
- Created server-side handlers that use `AdapterService`
- Updated frontend to use socket events
- Restricted feature to room creators (who have tokens)

---

## Implementation Details

### 1. **MetadataSource Interface** (`packages/types/MetadataSource.ts`)

Added optional library management methods:

```typescript
export interface MetadataSourceApi {
  // ... existing methods ...
  
  // ✅ NEW: Library management (optional)
  checkSavedTracks?: (trackIds: string[]) => Promise<boolean[]>
  addToLibrary?: (trackIds: string[]) => Promise<void>
  removeFromLibrary?: (trackIds: string[]) => Promise<void>
}
```

**Why optional?** Not all music services may support user libraries (e.g., Shoutcast doesn't have user accounts).

### 2. **Spotify Adapter Implementation** (`packages/adapter-spotify/lib/metadataSourceApi.ts`)

Implemented the library methods using Spotify Web API:

```typescript
const api: MetadataSourceApi = {
  // ... existing methods ...
  
  async checkSavedTracks(trackIds: string[]) {
    return await spotifyApi.currentUser.tracks.hasSavedTracks(trackIds)
  },
  async addToLibrary(trackIds: string[]) {
    await spotifyApi.currentUser.tracks.saveTracks(trackIds)
  },
  async removeFromLibrary(trackIds: string[]) {
    await spotifyApi.currentUser.tracks.removeSavedTracks(trackIds)
  },
}
```

### 3. **Server-Side Handlers** (`packages/server/handlers/djHandlersAdapter.ts`)

Created handlers that use `AdapterService` to get the room's metadata source:

```typescript
checkSavedTracks = async ({ socket }: HandlerConnections, trackIds: string[]) => {
  const { roomId, userId } = socket.data
  const metadataSource = await this.adapterService.getMetadataSourceForRoom(roomId, userId)

  if (!metadataSource?.api?.checkSavedTracks) {
    socket.emit("event", {
      type: "CHECK_SAVED_TRACKS_FAILURE",
      data: { message: "Library management not supported for this service" },
    })
    return
  }

  const results = await metadataSource.api.checkSavedTracks(trackIds)

  socket.emit("event", {
    type: "CHECK_SAVED_TRACKS_RESULTS",
    data: { results, trackIds },
  })
}
```

Similar implementations for `addToLibrary` and `removeFromLibrary`.

### 4. **Controller Registration** (`packages/server/controllers/djController.ts`)

Registered new socket events:

```typescript
socket.on("check saved tracks", async (trackIds: string[]) => {
  await handlers.checkSavedTracks(connections, trackIds)
})

socket.on("add to library", async (trackIds: string[]) => {
  await handlers.addToLibrary(connections, trackIds)
})

socket.on("remove from library", async (trackIds: string[]) => {
  await handlers.removeFromLibrary(connections, trackIds)
})
```

### 5. **Frontend Machine** (`apps/web/src/machines/spotifyAddToLibraryMachine.ts`)

Renamed to `addToLibraryMachine` and updated to use socket events:

**Before:** ❌
```typescript
// Direct Spotify API calls
async function checkSavedTracks(ctx: Context) {
  const res = await apiCheck({ accessToken: ctx.accessToken, ids: ctx.ids })
  return res
}
```

**After:** ✅
```typescript
// Socket event actions
sendCheckRequest: sendTo("socket", (ctx) => ({
  type: "check saved tracks",
  data: ctx.ids,
})),

// Listen for results
on: {
  CHECK_SAVED_TRACKS_RESULTS: {
    target: "checked",
    actions: ["setCheckedTracks"],
  },
}
```

### 6. **Button Component** (`apps/web/src/components/ButtonAddToLibrary.tsx`)

Updated to check for room creator (admin) instead of PKCE auth:

**Before:** ❌
```typescript
const isAuthed = useIsSpotifyAuthenticated()  // PKCE auth
const accessToken = useSpotifyAccessToken()

if (!isAuthed || !id) {
  return null
}
```

**After:** ✅
```typescript
const isAdmin = useIsAdmin()  // Room creator check

if (!isAdmin || !id) {
  return null
}
```

---

## User Experience

### Room Creator
1. Has access token (retrieved on login)
2. Sees heart icon on tracks
3. Can click to add/remove from their library
4. Works via server-side adapter calls

### Guest Users
1. No access token
2. Heart icon hidden (not admin)
3. Can still view and queue tracks

---

## Benefits

✅ **Adapter-based**: Works with any service that implements library methods
✅ **Secure**: Tokens stay on server, authenticated via room creator's credentials
✅ **Type-safe**: Optional methods with proper type checking
✅ **Graceful degradation**: Services without library support return helpful error
✅ **Consistent pattern**: Follows same socket event pattern as other features
✅ **Room creator only**: Only shows to users with valid tokens

---

## Socket Events

### Client → Server
- `check saved tracks` - Check if tracks are in user's library
  - Payload: `string[]` (track IDs)
- `add to library` - Add tracks to user's library
  - Payload: `string[]` (track IDs)
- `remove from library` - Remove tracks from user's library
  - Payload: `string[]` (track IDs)

### Server → Client
- `CHECK_SAVED_TRACKS_RESULTS` - Results of check
  - Payload: `{ results: boolean[], trackIds: string[] }`
- `CHECK_SAVED_TRACKS_FAILURE` - Check failed
  - Payload: `{ message: string }`
- `ADD_TO_LIBRARY_SUCCESS` - Successfully added
  - Payload: `{ trackIds: string[] }`
- `ADD_TO_LIBRARY_FAILURE` - Add failed
  - Payload: `{ message: string }`
- `REMOVE_FROM_LIBRARY_SUCCESS` - Successfully removed
  - Payload: `{ trackIds: string[] }`
- `REMOVE_FROM_LIBRARY_FAILURE` - Remove failed
  - Payload: `{ message: string }`

---

## Testing

1. **Create room as admin with Spotify**
   - Heart icon should appear on tracks
   - Click to add → track added to your Spotify library
   - Click again to remove → track removed

2. **Join as guest**
   - Heart icon should NOT appear
   - Can still queue and interact with other features

3. **Try with service without library support**
   - Should receive graceful error message
   - UI should handle failure appropriately

4. **Check server logs**
   ```
   Retrieved spotify access token for room creator abc123
   Library management not supported for this service (shoutcast)
   ```

