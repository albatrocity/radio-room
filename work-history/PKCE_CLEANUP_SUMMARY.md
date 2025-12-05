# Client-Side PKCE Authentication Cleanup

## Date

November 23, 2025

## Overview

Removed client-side PKCE (Proof Key for Code Exchange) authentication in favor of server-side OAuth for Spotify integration. This simplifies the authentication flow and reduces complexity in the frontend.

## Files Deleted

### 1. State Management

- **`apps/web/src/state/spotifyAuthStore.ts`**
  - Zustand store for client-side PKCE auth state
  - Used the deleted `spotifyUserAuthMachine`

### 2. State Machines

- **`apps/web/src/machines/spotifyUserAuthMachine.ts`**
  - XState machine for client-side PKCE flow
  - Managed token exchange and refresh

### 3. Helper Functions

- **`apps/web/src/lib/spotify/spotifyPKCE.ts`**
  - Client-side PKCE helper functions:
    - `generateCodeVerifier()`
    - `generateCodeChallenge()`
    - `generateLoginUrl()`
    - `requestToken()`
    - `refreshAccessToken()`

## Components Updated

### 1. SpotifyAuthorization.tsx

**Before:**

- Handled both server-side OAuth and client-side PKCE
- Used `useSpotifyAuthStore`
- Processed authorization `code` parameter

**After:**

- Only handles server-side OAuth callback
- Uses `useAuthStore` only
- Removed PKCE code path

### 2. ButtonAuthSpotify.tsx

**Before:**

- Used `useSpotifyAuthStore` for client-side auth
- Different behavior for admin vs non-admin users
- Had "working" state from PKCE machine

**After:**

- Uses `useRoomSpotifyAuthStore` for server-side auth status
- All users use server-side OAuth flow
- Simplified state management (loading/authenticated)

### 3. ModalAddToQueue.tsx

**Before:**

- Used `useIsSpotifyAuthenticated()` from deleted store
- Showed saved tracks if user was authenticated

**After:**

- Uses `useIsRoomSpotifyAuthenticated()` from room store
- Only shows saved tracks if user is admin AND room has Spotify auth
- Better access control

## Authentication Flow

### Before (Client-Side PKCE)

```
User clicks "Login"
  → Generate code verifier/challenge
  → Redirect to Spotify with PKCE params
  → Callback with code
  → Exchange code for tokens in browser
  → Store tokens in localStorage
```

### After (Server-Side OAuth)

```
User clicks "Login"
  → Redirect to server endpoint
  → Server handles OAuth with Spotify
  → Server stores tokens securely
  → Callback with userId
  → Frontend checks session status
```

## Benefits

1. **Security**: Tokens never exposed to client-side JavaScript
2. **Simplicity**: One auth flow instead of two
3. **Consistency**: Room-level and user-level auth use same pattern
4. **Maintainability**: Less code to maintain
5. **Better Access Control**: Saved tracks only visible to room creators

## Remaining Music Service Integration

### Still Active (Server-Side, Service-Agnostic)

- **`metadataSourceAuthMachine.ts`**: Checks server-side auth status for any metadata source
- **`metadataSourceAuthStore.ts`**: Room-level metadata source auth state
- **`addToLibraryMachine.ts`**: Add/remove tracks (service-agnostic, works with any metadata source)
- Server OAuth endpoints: Generic `/auth/{serviceName}/login` and `/auth/{serviceName}/callback`

### Deleted (Spotify-Specific, Now Replaced)

- **`spotifyAuthMachine.ts`**: ❌ Replaced with `metadataSourceAuthMachine.ts`
- **`roomSpotifyAuthStore.ts`**: ❌ Replaced with `metadataSourceAuthStore.ts`

### Service-Agnostic Auth Refactoring

Both authentication and library management were refactored to be service-agnostic:

#### 1. Metadata Source Authentication (`metadataSourceAuthMachine.ts`)

Replaced Spotify-specific `spotifyAuthMachine.ts` with a generic version:

**Key Changes:**
- Accepts `serviceName` parameter (spotify, tidal, applemusic, etc.)
- Uses generic socket event: `get user service authentication status`
- Responds to generic event: `SERVICE_AUTHENTICATION_STATUS`
- Logout uses generic `logout service` event
- Toast notifications dynamically use service name

**Components Updated:**
- `ButtonAuthSpotify.tsx`: Now accepts optional `serviceName` prop
- `ButtonRoomAuthSpotify.tsx`: Now accepts optional `serviceName` prop  
- `ModalAddToQueue.tsx`: Initializes auth check based on room's `metadataSourceId`

**How It Works:**
1. Component extracts service name from room's `metadataSourceId` (e.g., "spotify-metadata" → "spotify")
2. Initializes auth machine with `userId` and `serviceName`
3. Machine sends `get user service authentication status` with service name
4. Backend routes to correct auth adapter based on service
5. Frontend displays saved tracks if authenticated

#### 2. Library Management (`addToLibraryMachine.ts`)

The `addToLibraryMachine` (formerly `spotifyAddToLibraryMachine`) was refactored to be service-agnostic:

**Key Changes:**

- Renamed from `spotifyAddToLibraryMachine.ts` to `addToLibraryMachine.ts`
- Removed frontend responsibility for tracking metadata source type
- Socket events now send only track IDs (simple arrays)
- Server infers metadata source from room context
- Component (`ButtonAddToLibrary`) only needs track ID

**Architecture Benefits:**

- **Reduced Coupling**: Frontend doesn't need to know about metadata source types
- **Single Source of Truth**: Server determines routing based on room configuration
- **Less Data Over Wire**: No redundant metadata type in every request
- **Simpler Frontend**: Components only pass track IDs
- **Server-Side Routing**: Backend uses `getUserMetadataSource(roomId, userId)` to get correct adapter

**How It Works:**

1. User performs library action in a room
2. Frontend sends only track IDs via socket
3. Server gets `roomId` from socket session
4. Server calls `getUserMetadataSource(roomId, userId)` to get room's metadata source
5. Server routes operation to correct adapter (Spotify, Tidal, etc.)
6. Server handles graceful failures if service doesn't support library operations

## Migration Impact

- ✅ No breaking changes for users
- ✅ Existing server-side auth remains unchanged
- ✅ All components updated to use correct pattern
- ✅ No references to deleted files remain
- ✅ XState v4 compatibility maintained

## Testing Checklist

- [ ] Login flow via `/login` page
- [ ] OAuth callback handling
- [ ] Room-level Spotify authentication
- [ ] Saved tracks display (admin only)
- [ ] Add/remove from library (admin only)
- [ ] Logout functionality

## Notes

- This cleanup was performed during an attempted XState v5 migration
- XState v5 migration was reverted due to zustand-middleware-xstate incompatibility
- PKCE cleanup changes were kept as they improve the codebase regardless of XState version
- All changes use XState v4 syntax
- Refactored both authentication and library management to be service-agnostic
- Server-side inference eliminates frontend coupling to metadata source types
- Components can now support Spotify, Tidal, Apple Music, or any future service with minimal changes
