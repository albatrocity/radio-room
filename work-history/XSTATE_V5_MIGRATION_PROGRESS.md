# XState v5 Migration - Current Progress

**Date**: November 23, 2025  
**Status**: 🚧 78.6% Complete (22/28 machines)

## ✅ Completed Migrations (22/28)

### Utility Machines (9/9) ✅
1. ✅ `themeMachine.ts` - Theme persistence
2. ✅ `TimerMachine.ts` - Countdown timer
3. ✅ `typingMachine.ts` - Typing indicators
4. ✅ `scrollFollowMachine.ts` - Scroll tracking
5. ✅ `allReactionsMachine.ts` - Reactions aggregation
6. ✅ `debouncedInputMachine.ts` - Input debouncing
7. ✅ `usersMachine.ts` - User list management
8. ✅ `toggleableCollectionMachine.ts` - Collections + factory function
9. ✅ `triggerEventsMachine.ts` - Event triggers

### Core Feature Machines (7/7) ✅
10. ✅ `queueMachine.ts` - Queue management with guards
11. ✅ `playlistMachine.ts` - Playlist state
12. ✅ `djMachine.ts` - DJ status management
13. ✅ `settingsMachine.ts` - Room settings
14. ✅ `roomSetupMachine.ts` - Room creation with fromPromise
15. ✅ `savePlaylistMachine.ts` - Save playlists to service
16. ✅ `createdRoomsFetchMachine.ts` - Fetch user's rooms

### UI State Machines (5/5) ✅
17. ✅ `errorHandlerMachine.ts` - Error handling + toasts
18. ✅ `adminMachine.ts` - Admin operations with fromPromise
19. ✅ `modalsMachine.ts` - Modal state management
20. ✅ `chatMachine.ts` - Chat with parallel states
21. ✅ `reactionsMachine.ts` - Reaction picker
22. ✅ `audioMachine.ts` - Audio player with parallel states

### Metadata/Search Machines (2/3) ✅
23. ✅ `savedTracksMachine.ts` - Saved tracks fetching
24. ✅ `trackSearchMachine.ts` - Track search

## 🚧 Remaining Machines (6/28)

### Spotify Auth Machines (3)
- [ ] **spotifyAuthMachine.ts** (99 lines) - Spotify auth status
- [ ] **spotifyUserAuthMachine.ts** (399 lines) ⚠️ **COMPLEX** - PKCE auth flow
- [ ] **spotifyAddToLibraryMachine.ts** (189 lines) - Add/remove from library

### Core Complex Machines (3)
- [ ] **authMachine.ts** (649 lines) ⚠️ **MOST COMPLEX** - Full auth flow
- [ ] **roomFetchMachine.ts** (242 lines) - Room data + visibility API
- [ ] One more to find...

## Key Migration Patterns Applied

### 1. Removed `predictableActionArguments` (all machines)
```typescript
// ❌ v4 (removed everywhere)
predictableActionArguments: true,
```

### 2. Added `types` property (all machines)
```typescript
// ✅ v5 (added everywhere)
types: {} as {
  context: MyContext
  events: MyEvents
}
```

### 3. Updated action signatures (all machines)
```typescript
// ✅ v5
actions: {
  myAction: ({ context, event }) => { /* ... */ }
}
```

### 4. Converted `cond` → `guard` (everywhere)
```typescript
// ✅ v5
on: {
  EVENT: {
    target: 'next',
    guard: 'isValid'  // was 'cond'
  }
}
```

### 5. Converted `send()` → `raise()` / `sendTo()` (everywhere)
```typescript
// ✅ v5
import { raise, sendTo } from 'xstate'
actions: raise({ type: 'NEXT' })
actions: sendTo('actorId', { type: 'EVENT' })
```

### 6. Upgraded invoked services to `fromPromise` (where applicable)
```typescript
// ✅ v5
invoke: {
  src: fromPromise(async ({ input }) => {
    return await fetchData(input.id)
  }),
  input: ({ context }) => ({ id: context.id })
}
```

## Special Cases Handled

### ✅ Factory Functions
- `createToggleableCollectionMachine()` - Restored for dynamic machine creation

### ✅ Parallel States
- `audioMachine` - volume + progress in parallel
- `chatMachine` - typing state in parallel

### ✅ Complex Guards
- `queueMachine` - Zustand store integration for canQueue check
- `adminMachine` - Auth store checks
- `modalsMachine` - Multiple guard conditions

### ✅ Promise Actors
- `adminMachine` - Room deletion
- `roomSetupMachine` - Room creation
- `createdRoomsFetchMachine` - Fetch rooms

## Estimated Remaining Time

- **spotifyAuthMachine**: 15-20 min (simple)
- **spotifyAddToLibraryMachine**: 30-40 min (medium)
- **spotifyUserAuthMachine**: 60-90 min (complex PKCE flow)
- **roomFetchMachine**: 45-60 min (visibility API + complex state)
- **authMachine**: 90-120 min (most complex, 649 lines)

**Total**: ~4-6 hours remaining

## Next Steps

1. ✅ Complete remaining Spotify machines (3)
2. ✅ Migrate roomFetchMachine
3. ✅ Migrate authMachine (save for last - most complex)
4. 🔲 Update React component hooks (`state` → `snapshot`, etc.)
5. 🔲 Build and test
6. 🔲 Fix any runtime errors

## Component Hook Updates Required

After machines are done, ALL components using XState need updates:

### Hook Changes
- `useMachine()` → `[snapshot, send]` (not `[state, send]`)
- `useInterpret()` → `useActorRef()`
- `send("TYPE", payload)` → `send({ type: "TYPE", ...payload })`

### Files to Update
Search for:
- `const [state, ` → should be `const [snapshot, `
- `useInterpret` → should be `useActorRef`
- `.send("` → should be `.send({ type: "`

Estimated: 50-100 component files to update


