# Room Creation Auth Flow Fix

## Issue
After submitting the room creation form, users were redirected to an unhandled route:
```
http://localhost:3000/login?roomType=jukebox&roomTitle=My%20Room&deputizeOnJoin=true&redirect=/rooms/create
```

This resulted in a 404 because `/login` doesn't exist as a server route.

## Root Cause

The `createRoomFormMachine` was redirecting to the wrong endpoint:

```typescript
// ❌ WRONG: Redirected to non-existent /login route
navigate(
  `${process.env.GATSBY_API_URL}/login?roomType=${ctx.type}&roomTitle=${ctx.title}&deputizeOnJoin=${ctx.deputizeOnJoin}&redirect=/rooms/create`
)
```

## The Correct Auth Flow

1. User fills out room form → settings stored in `sessionStorage`
2. User clicks "Login & Create" → store redirect path in `sessionStorage`
3. Redirect to `/auth/spotify/login?redirect=/callback`
4. Server handles Spotify OAuth
5. Server redirects to `/callback?userId=...&challenge=...`
6. `SpotifyAuthorization` component reads `postSpotifyAuthRedirect` from `sessionStorage`
7. Redirects to `/rooms/create`
8. `/rooms/create` page reads room settings from `sessionStorage` and creates room

## Solution

Updated `createRoomFormMachine.ts` line 93-99:

```typescript
redirectToLogin: (ctx, event) => {
  if (event.type === "NEXT") {
    // Store redirect path for after OAuth completes
    sessionStorage.setItem("postSpotifyAuthRedirect", "/rooms/create")
    
    // Redirect to Spotify OAuth flow
    window.location.href = `${process.env.GATSBY_API_URL}/auth/spotify/login?redirect=/callback`
  }
},
```

### Key Changes

1. ✅ **Correct endpoint**: `/auth/spotify/login` (not `/login`)
2. ✅ **Store redirect path**: `sessionStorage.setItem("postSpotifyAuthRedirect", "/rooms/create")`
3. ✅ **Remove URL params**: Room settings already in sessionStorage, no need to pass in URL
4. ✅ **Use window.location.href**: For external API redirects (consistent with other auth flows)

## Why This Works

### SessionStorage Pattern

The app uses sessionStorage in two places:

**1. Room settings** (lines 70-92):
```typescript
storeRoomSettings(ctx) {
  sessionStorage.setItem("createRoomTitle", ctx.title)
  sessionStorage.setItem("createRoomType", ctx.type)
  sessionStorage.setItem("createRoomDeputizeOnJoin", ctx.deputizeOnJoin.toString())
  // ...
}
```

**2. Post-auth redirect** (line 96, now fixed):
```typescript
sessionStorage.setItem("postSpotifyAuthRedirect", "/rooms/create")
```

### Flow After Fix

```
User submits form
  ↓
Room settings → sessionStorage
  ↓
Redirect path → sessionStorage
  ↓
window.location.href → /auth/spotify/login?redirect=/callback
  ↓
User authenticates with Spotify
  ↓
Server → /callback?userId=X&challenge=Y
  ↓
SpotifyAuthorization reads postSpotifyAuthRedirect
  ↓
navigate("/rooms/create")
  ↓
/rooms/create reads room settings from sessionStorage
  ↓
Room created with challenge + userId ✅
```

## Verification

The fixed flow matches existing patterns in the codebase:

### ButtonRoomAuthSpotify.tsx (line 30):
```typescript
sessionStorage.setItem("postSpotifyAuthRedirect", location.pathname)
```

### ButtonAuthSpotify.tsx (line 22):
```typescript
sessionStorage.setItem("postSpotifyAuthRedirect", location.pathname)
```

### login.tsx (line 12):
```typescript
window.location.href = `${apiUrl}/auth/spotify/login?redirect=/callback`
```

## Related Files

- ✅ Fixed: `apps/web/src/components/Lobby/createRoomFormMachine.ts`
- Used by: `apps/web/src/components/Lobby/ModalCreateRoom.tsx`
- Auth handler: `apps/web/src/components/SpotifyAuthorization.tsx`
- Destination: `apps/web/src/pages/rooms/create.tsx`

## Testing

To verify the fix:

1. Navigate to lobby
2. Click "Create Room"
3. Select room type (jukebox/radio)
4. Click "Next"
5. Fill in room settings
6. Click "Login & Create"
7. Should redirect to Spotify OAuth
8. After auth, should redirect to `/callback`
9. Should automatically redirect to `/rooms/create`
10. Room should be created with stored settings ✅

## Summary

**Before:** Redirected to non-existent `/login` route with URL params  
**After:** Redirects to `/auth/spotify/login` using sessionStorage pattern  
**Result:** Room creation flow now works correctly ✅

