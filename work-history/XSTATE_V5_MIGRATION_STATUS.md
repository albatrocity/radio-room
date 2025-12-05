# XState v5 Migration - Progress Status

**Date**: November 23, 2025  
**Status**: 🚧 Phase 1 Complete - Utilities Migrated

## Summary

Successfully updated dependencies and migrated 5 utility state machines to XState v5. The remaining 23 machines follow the same patterns established here.

## ✅ Phase 1: Dependencies & Simple Machines (Complete)

### Dependencies Updated
- ✅ `xstate`: `^4.37.0` → `^5.18.1`
- ✅ `@xstate/react`: `^3.2.1` → `^4.1.0`
- ✅ `typescript`: `^4.9.5` → `^5.6.3`

### Machines Migrated (5/28)
1. ✅ `themeMachine.ts` - Theme persistence
2. ✅ `TimerMachine.ts` - Simple timer
3. ✅ `typingMachine.ts` - Typing indicators
4. ✅ `scrollFollowMachine.ts` - Scroll state
5. ✅ `allReactionsMachine.ts` - Reactions aggregation

## Migration Pattern Established

### Key Changes Applied

#### 1. Remove `predictableActionArguments`
```typescript
// ❌ Before
const machine = createMachine<Context>({
  predictableActionArguments: true,
  // ...
})

// ✅ After (default in v5)
const machine = createMachine({
  types: {} as {
    context: Context
    events: MyEvents
  },
  // ...
})
```

#### 2. Update Action Signatures
```typescript
// ❌ Before
actions: {
  myAction: (context, event) => { /* ... */ }
}

// ✅ After
actions: {
  myAction: ({ context, event }) => { /* ... */ }
}
```

#### 3. Update Assign Actions
```typescript
// ❌ Before
assign({
  foo: (_context, event) => event.data
})

// ✅ After
assign({
  foo: ({ event }) => event.data
})
```

#### 4. Add Type Definitions
```typescript
// ✅ New in v5
types: {} as {
  context: MyContext
  events: MyEvents
}
```

## 🚧 Phase 2: Remaining Machines (23/28)

### Core Machines (Priority 1) - 4 machines
These are the most critical and complex:

- [ ] **authMachine.ts** (649 lines) ⚠️ **MOST COMPLEX**
  - Handles authentication flow
  - Socket connection lifecycle
  - Password management
  - User state
  - **Requires**: `send()` → `raise()` migrations, guard updates

- [ ] **roomFetchMachine.ts** (242 lines)
  - Room data fetching
  - WebSocket integration
  - Visibility API
  - **Requires**: Service/actor updates

- [ ] **queueMachine.ts** (93 lines)
  - Queue management
  - Socket events

- [ ] **playlistMachine.ts** (86 lines)
  - Playlist state

### Spotify Machines (Priority 2) - 5 machines
- [ ] **spotifyAddToLibraryMachine.ts** (189 lines)
- [ ] **spotifyAuthMachine.ts** (99 lines)
- [ ] **spotifyUserAuthMachine.ts** (399 lines) ⚠️ **COMPLEX**
- [ ] **savedTracksMachine.ts** (83 lines)
- [ ] **trackSearchMachine.ts** (101 lines)

### UI State Machines (Priority 3) - 5 machines
- [ ] **modalsMachine.ts** (170 lines)
- [ ] **audioMachine.ts** (179 lines)
- [ ] **errorHandlerMachine.ts** (73 lines)
- [ ] **chatMachine.ts** (176 lines)
- [ ] **adminMachine.ts** (113 lines)

### Feature Machines (Priority 4) - 6 machines
- [ ] **reactionsMachine.ts** (136 lines)
- [ ] **djMachine.ts** (82 lines)
- [ ] **roomSetupMachine.ts** (134 lines)
- [ ] **savePlaylistMachine.ts** (124 lines)
- [ ] **createdRoomsFetchMachine.ts** (153 lines)
- [ ] **settingsMachine.ts** (108 lines)

### Simple Utility Machines (Priority 5) - 3 machines
- [ ] **debouncedInputMachine.ts** (61 lines)
- [ ] **toggleableCollectionMachine.ts** (95 lines)
- [ ] **triggerEventsMachine.ts** (67 lines)
- [ ] **usersMachine.ts** (69 lines)

## Complex Migration Patterns

### Pattern 1: `send()` → `raise()` or `sendTo()`

**Before (v4)**:
```typescript
actions: [
  send({ type: 'NEXT' }),
  send({ type: 'EVENT' }, { to: 'actorId' })
]
```

**After (v5)**:
```typescript
import { raise, sendTo } from 'xstate'

actions: [
  raise({ type: 'NEXT' }),
  sendTo('actorId', { type: 'EVENT' })
]
```

### Pattern 2: Guards (`cond` → `guard`)

**Before (v4)**:
```typescript
on: {
  EVENT: {
    target: 'next',
    cond: 'isValid'
  }
}
```

**After (v5)**:
```typescript
on: {
  EVENT: {
    target: 'next',
    guard: 'isValid'
  }
}
```

### Pattern 3: Invoke Data → Input

**Before (v4)**:
```typescript
invoke: {
  src: 'fetchData',
  data: { id: (context) => context.id }
}
```

**After (v5)**:
```typescript
invoke: {
  src: 'fetchData',
  input: ({ context }) => ({ id: context.id })
}
```

### Pattern 4: Service → Actor

**Before (v4)**:
```typescript
services: {
  fetchData: (context, event) => fetch(/*...*/)
}
```

**After (v5)**:
```typescript
actors: {
  fetchData: fromPromise(({ input }) => fetch(/*...*/))
}
```

## React Hooks Updates

After machine migration, update component usage:

**Before (v4)**:
```typescript
import { useMachine, useInterpret } from '@xstate/react'

const [state, send] = useMachine(machine)
const service = useInterpret(machine)
```

**After (v5)**:
```typescript
import { useMachine, useActorRef } from '@xstate/react'

const [snapshot, send] = useMachine(machine)  // state → snapshot
const actorRef = useActorRef(machine)         // useInterpret → useActorRef
```

## Recommended Next Steps

### Option 1: Systematic Migration (Recommended)
1. Start with **Priority 5** (simple utilities) - 4 machines
2. Move to **Priority 4** (features) - 6 machines
3. Tackle **Priority 3** (UI state) - 5 machines
4. Handle **Priority 2** (Spotify) - 5 machines
5. Finally migrate **Priority 1** (core) - 4 machines
6. Update all React component hooks

### Option 2: Critical Path First
1. Migrate **authMachine.ts** (most complex, most critical)
2. Migrate **roomFetchMachine.ts** (second most critical)
3. Test authentication and room joining flows
4. Continue with remaining machines

### Option 3: Incremental Testing
1. Migrate 3-5 machines at a time
2. Run `npm install` and build
3. Test affected features
4. Continue to next batch

## Testing Checklist

After migration, verify:
- [ ] App builds without TypeScript errors
- [ ] Authentication flow works
- [ ] Room creation and joining
- [ ] Queue management
- [ ] Spotify integration
- [ ] Audio playback
- [ ] Chat functionality
- [ ] Reactions system

## Files to Review After Migration

1. **Hook Usage** - Search for:
   - `useMachine` - check if using `state` (should be `snapshot`)
   - `useInterpret` - replace with `useActorRef`
   - `.send()` calls - ensure they're passing objects not strings

2. **State Machines** - Search for:
   - `predictableActionArguments` - remove
   - `cond:` - replace with `guard:`
   - `send(` in actions - replace with `raise(` or `sendTo(`
   - `services:` in options - replace with `actors:`
   - `data:` in invoke - replace with `input:`

## Estimated Effort

- **Simple machines** (< 100 lines): ~5-10 min each
- **Medium machines** (100-200 lines): ~15-30 min each
- **Complex machines** (> 200 lines): ~30-60 min each
- **Hook updates**: ~2-3 hours (search & replace across components)
- **Testing**: ~2-4 hours

**Total estimated time**: ~10-15 hours for complete migration

## Current Status

**Progress**: 5/28 machines migrated (17.9%)  
**Next**: Continue with remaining utility machines or tackle core machines


