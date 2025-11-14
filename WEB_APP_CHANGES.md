# Web App Changes for New Server Architecture

## 📋 Summary

**Good News**: The web app requires **minimal changes** to work with the new server architecture! Most of the API contracts remain the same.

## ✅ What Already Works

- Room creation API (`POST /api/rooms`)
- Room fetching API (`GET /api/rooms/:id`)
- Socket.io connections
- User authentication
- Session management

## 🔧 Required Changes

### 1. Fix Spotify Auth URL ⚠️ **CRITICAL**

**File**: `apps/web/src/components/ButtonAuthSpotify.tsx:36`

**Current**:

```typescript
href={
  isAdmin
    ? `${process.env.GATSBY_API_URL}/login?userId=${userId ?? currentUser.userId}`
    : undefined
}
```

**Fixed**:

```typescript
href={
  isAdmin
    ? `${process.env.GATSBY_API_URL}/auth/spotify/login?userId=${userId ?? currentUser.userId}`
    : undefined
}
```

**Why**: The auth route moved from `/login` to `/auth/spotify/login` to support multiple services.

---

### 2. Add Environment Variable

**File**: `apps/web/.env.development` (create if doesn't exist)

```env
GATSBY_API_URL=http://localhost:3000
```

**File**: `apps/web/.env.production`

```env
GATSBY_API_URL=https://your-api-domain.com
```

---

## 🎨 Optional Enhancements

These changes enable new features but aren't required for basic functionality.

### 3. Update Room Type Definitions

**File**: `apps/web/src/types/Room.ts`

Add new adapter-related fields:

```typescript
export type Room = {
  id: string
  creator: string
  type: "jukebox" | "radio"
  title: string
  fetchMeta: boolean
  extraInfo: string | undefined
  password: string | null
  passwordRequired?: boolean
  artwork?: string
  enableSpotifyLogin: boolean
  deputizeOnJoin: boolean

  // Legacy fields (keep for backward compatibility)
  radioMetaUrl?: string
  radioListenUrl?: string
  radioProtocol?: StationProtocol

  // NEW: Adapter configuration
  playbackControllerId?: string
  metadataSourceId?: string
  mediaSourceId?: string
  mediaSourceConfig?: { url: string }

  createdAt: string
  spotifyError?: RoomError
  radioError?: RoomError
  lastRefreshedAt: string
  announceNowPlaying?: boolean
  announceUsernameChanges?: boolean
  persistent?: boolean
}

export type RoomSetup = {
  type: "jukebox" | "radio"
  title: string
  radioMetaUrl?: string
  radioListenUrl?: string | null
  radioProtocol?: StationProtocol
  deputizeOnJoin?: boolean

  // NEW: Adapter configuration
  playbackControllerId?: string
  metadataSourceId?: string
  mediaSourceId?: string
  mediaSourceConfig?: { url: string }
}
```

---

### 4. Update Room Creation Machine

**File**: `apps/web/src/machines/roomSetupMachine.ts:19-32`

Add adapter fields to room creation:

```typescript
async function createRoom(ctx: RoomSetupContext) {
  const res = await apiCreateRoom({
    room: {
      type: ctx.room?.type ?? "jukebox",
      title: ctx.room?.title ?? "My Room",
      radioListenUrl: ctx.room?.radioListenUrl ?? undefined,
      radioMetaUrl: ctx.room?.radioMetaUrl ?? undefined,
      radioProtocol: ctx.room?.radioProtocol ?? undefined,
      deputizeOnJoin: ctx.room?.deputizeOnJoin ?? false,

      // NEW: Add adapter configuration
      playbackControllerId: ctx.room?.playbackControllerId ?? "spotify",
      metadataSourceId: ctx.room?.metadataSourceId ?? "spotify",
      mediaSourceId: ctx.room?.mediaSourceId,
      mediaSourceConfig: ctx.room?.mediaSourceConfig,
    },
    challenge: ctx.challenge ?? "",
    userId: ctx.userId ?? "",
  })
  return res
}
```

---

### 5. Add Adapter Selection UI

**File**: `apps/web/src/components/Lobby/ModalCreateRoom.tsx`

Add adapter selection to the create room form:

```tsx
import { FormControl, FormLabel, Select } from "@chakra-ui/react"

// Inside the form, after room type selection:

{
  /* NEW: Playback Controller Selection */
}
{
  roomType === "jukebox" && (
    <FormControl>
      <FormLabel>Playback Source</FormLabel>
      <Select
        name="playbackControllerId"
        defaultValue="spotify"
        onChange={(e) => {
          sessionStorage.setItem("createRoomPlaybackControllerId", e.target.value)
        }}
      >
        <option value="spotify">Spotify</option>
        {/* Future options: */}
        {/* <option value="tidal">Tidal</option> */}
        {/* <option value="apple-music">Apple Music</option> */}
      </Select>
    </FormControl>
  )
}

{
  /* NEW: Metadata Source Selection */
}
{
  roomType === "jukebox" && (
    <FormControl>
      <FormLabel>Search Music From</FormLabel>
      <Select
        name="metadataSourceId"
        defaultValue="spotify"
        onChange={(e) => {
          sessionStorage.setItem("createRoomMetadataSourceId", e.target.value)
        }}
      >
        <option value="spotify">Spotify</option>
        {/* Future options: */}
        {/* <option value="tidal">Tidal</option> */}
      </Select>
    </FormControl>
  )
}

{
  /* NEW: Media Source Selection for Radio */
}
{
  roomType === "radio" && (
    <FormControl>
      <FormLabel>Stream Type</FormLabel>
      <Select
        name="mediaSourceId"
        defaultValue="shoutcast"
        onChange={(e) => {
          sessionStorage.setItem("createRoomMediaSourceId", e.target.value)
        }}
      >
        <option value="shoutcast">Shoutcast/Icecast</option>
        {/* Future options: */}
        {/* <option value="youtube">YouTube</option> */}
        {/* <option value="soundcloud">SoundCloud</option> */}
      </Select>
    </FormControl>
  )
}
```

---

### 6. Update Room Creation Page

**File**: `apps/web/src/pages/rooms/create.tsx:39-57`

Read adapter configuration from session storage:

```typescript
send("SET_REQUIREMENTS", {
  data: {
    challenge,
    userId,
    room: {
      type: sessionStorage.getItem("createRoomType") ?? "jukebox",
      title: sessionStorage.getItem("createRoomTitle") ?? "My Room",
      radioMetaUrl: sessionStorage.getItem("createRoomradioMetaUrl") ?? undefined,
      radioListenUrl: sessionStorage.getItem("createRoomRadioListenUrl"),
      deputizeOnJoin: sessionStorage.getItem("createRoomDeputizeOnJoin") === "true",
      radioProtocol:
        (sessionStorage.getItem("createRoomRadioProtocol") as StationProtocol) ?? "shoutcastv2",

      // NEW: Read adapter configuration
      playbackControllerId: sessionStorage.getItem("createRoomPlaybackControllerId") ?? "spotify",
      metadataSourceId: sessionStorage.getItem("createRoomMetadataSourceId") ?? "spotify",
      mediaSourceId: sessionStorage.getItem("createRoomMediaSourceId"),
    },
  },
})
```

---

## 🎯 Migration Strategy

### Phase 1: Minimal Changes (Now)

1. ✅ Fix Spotify auth URL
2. ✅ Add environment variable
3. ✅ Test basic functionality

### Phase 2: Type Updates (Optional)

4. Update Room type definitions
5. Update room creation machine
6. Test with new fields

### Phase 3: UI Enhancements (Future)

7. Add adapter selection UI
8. Update session storage handling
9. Add UI for multiple services

## 🧪 Testing Checklist

After making changes, test:

- [ ] Spotify authentication works
- [ ] Can create a jukebox room
- [ ] Can create a radio room
- [ ] Can join existing rooms
- [ ] Playback controls work
- [ ] Search works
- [ ] Queue management works
- [ ] Real-time updates work

## 🔄 Backward Compatibility

The server maintains backward compatibility:

- Old rooms without adapter fields will continue to work
- Legacy `radioMetaUrl` and `radioListenUrl` fields are still supported
- Existing API routes unchanged
- Socket.io events unchanged

## 📝 Notes

### Why Minimal Changes?

The new architecture was designed to be **backward compatible**:

- Server-side adapter selection happens transparently
- Frontend doesn't need to know about adapter implementation details
- API contracts remain the same

### When to Add UI Changes?

Add UI for adapter selection when:

1. You want users to choose between multiple services
2. You've added additional adapters (Tidal, Apple Music, etc.)
3. You want to expose advanced configuration options

### Future Enhancements

Possible future UI additions:

- Adapter status indicators
- Service-specific settings
- Multi-service authentication
- Adapter health monitoring
- Service selection per room

## 🚀 Quick Start

**Minimum viable changes**:

1. Update `ButtonAuthSpotify.tsx` line 36
2. Add `GATSBY_API_URL` to environment
3. Test!

That's it! Everything else is optional enhancements.
