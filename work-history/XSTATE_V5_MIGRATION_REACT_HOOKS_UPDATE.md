# XState v5 Migration: React Hooks Update

## Overview
This document summarizes the updates made to React components to follow XState v5 conventions after migrating all state machines.

## Date
November 23, 2025

## Changes Made

### 1. Removed Client-Side PKCE Authentication

**Deleted Files:**
- `apps/web/src/state/spotifyAuthStore.ts` - Used deleted `spotifyUserAuthMachine`
- `apps/web/src/lib/spotify/spotifyPKCE.ts` - Client-side PKCE authentication functions
- `apps/web/src/machines/spotifyUserAuthMachine.ts` - Client-side PKCE state machine (deleted earlier)
- `apps/web/src/machines/spotifyAddToLibraryMachine.ts` - Spotify-specific library machine (replaced by generic version)

**Updated Components:**
- `SpotifyAuthorization.tsx` - Removed PKCE fallback logic, kept server-side OAuth only
- `ButtonAuthSpotify.tsx` - Updated to use `roomSpotifyAuthStore` instead of `spotifyAuthStore`
- `ModalAddToQueue.tsx` - Updated to check `isAdmin && isRoomSpotifyAuthenticated` for showing saved tracks

### 2. Updated `useMachine` Hook Usage

Changed `state` to `snapshot` and updated `send` calls to use object syntax in 8 components:

#### Updated Components:

**`ButtonAddToLibrary.tsx`**
- Changed `state` → `snapshot`
- Updated `send` calls to use `{ type: "EVENT_NAME", ...data }` format
- Fixed TypeScript lint errors (readonly props, removed context option)

**`useAddToQueue.ts`**
- Changed `state` → `snapshot`
- Updated return value to maintain backward compatibility: `{ state: snapshot, send, addToQueue }`

**`TrackSearch.tsx`**
- Changed `state` → `snapshot`, `inputState` → `inputSnapshot`
- Updated all `send` calls to object format

**`ChatWindow.tsx`**
- Changed `state` → `snapshot`
- Updated `send` calls in `atBottomStateChange` callback

**`DrawerPlaylist.tsx`**
- Changed `state` → `snapshot`, `filterState` → `filterSnapshot`, `selectedPlaylistState` → `selectedPlaylistSnapshot`
- Updated all `send` calls across 3 machines (save playlist, filter, selection)

**`ReactionCounter.tsx`**
- Changed `state` → `snapshot`
- Updated all `send` calls to object format

**`ReactionTriggerActions.tsx`**
- Changed `state` → `snapshot`
- Updated `send` call to use proper object syntax

**`MessageTriggerActions.tsx`**
- Changed `state` → `snapshot`
- Updated `send` call to use proper object syntax

### 3. Event Syntax Updates

**Before (XState v4):**
```typescript
send("EVENT_NAME", { data: value })
send("EVENT_NAME")
```

**After (XState v5):**
```typescript
send({ type: "EVENT_NAME", data: value })
send({ type: "EVENT_NAME" })
```

### 4. Machine Configuration Updates

**Before (XState v4):**
```typescript
const [state, send] = useMachine(machine, {
  context: { foo: "bar" }
})
```

**After (XState v5):**
```typescript
const [snapshot, send] = useMachine(machine, {
  input: { foo: "bar" }
})
```

## Benefits

1. **Consistency**: All components now follow XState v5 conventions
2. **Type Safety**: Better TypeScript support with proper event typing
3. **Clarity**: `snapshot` more accurately describes the returned value (immutable snapshot vs mutable state)
4. **Simplified Auth**: Removed confusing dual auth patterns (PKCE vs server-side)
5. **Better Separation**: Room-level vs user-level Spotify authentication is now clearer

## Testing Recommendations

### Critical Paths to Test:

1. **Authentication Flow:**
   - User login via `/login` page
   - OAuth callback handling
   - Room-level Spotify authentication (ButtonAuthSpotify)

2. **Queue Management:**
   - Adding tracks to queue
   - Viewing saved tracks (admin only, when room has Spotify auth)
   - Track search functionality

3. **Playlist Features:**
   - Saving playlists
   - Filtering playlist items
   - Selecting/deselecting tracks

4. **Chat Features:**
   - Scroll-to-bottom functionality
   - New message indicators

5. **Reactions:**
   - Adding reactions to messages/tracks
   - Viewing reaction counts

6. **Library Management:**
   - Adding tracks to Spotify library (admin only)
   - Removing tracks from library
   - Checking saved status

## Migration Statistics

- **Machines Migrated**: 25+ state machines
- **Components Updated**: 8 React components
- **Files Deleted**: 4 (PKCE-related)
- **Breaking Changes**: None (backward-compatible return values maintained where needed)

## Next Steps

1. ✅ Update package.json to XState v5
2. ✅ Migrate all state machines
3. ✅ Update React hooks usage
4. 🔄 Clean up and simplify machines (in progress)
5. ⏳ Test and verify all functionality

## Notes

- The `useAddToQueue` hook maintains backward compatibility by returning `{ state: snapshot, send, addToQueue }`
- All `useMachine` hooks now return `[snapshot, send]` but existing code referring to `.state` will need updates
- Zustand stores still use `.state` property (different from `useMachine` snapshots)

