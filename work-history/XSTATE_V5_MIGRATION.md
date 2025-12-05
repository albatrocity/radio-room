# XState v5 Migration Plan

**Date**: November 23, 2025  
**Status**: 🚧 In Progress

## Overview

Migrating the Radio Room web app from XState v4 to v5. This involves:
- 28 state machine files to migrate
- React hooks updates (@xstate/react v3 → v4)
- Cleanup and simplification of machine definitions

## Package Updates

✅ **Dependencies Updated**:
- `xstate`: `^4.37.0` → `^5.18.1`
- `@xstate/react`: `^3.2.1` → `^4.1.0`  
- `typescript`: `^4.9.5` → `^5.6.3`

## Key API Changes

### Machine Creation
- ✅ `createMachine()` (already using this)
- ❌ Remove `predictableActionArguments: true` (default in v5)

### Actions & Guards
**Before (v4)**:
```typescript
actions: {
  myAction: (context, event) => { /* ... */ }
}
guards: {
  myGuard: (context, event) => true
}
```

**After (v5)**:
```typescript
actions: {
  myAction: ({ context, event }) => { /* ... */ }
}
guards: {
  myGuard: ({ context, event }) => true
}
```

### Sending Events
**Before (v4)**:
```typescript
// In actions
send({ type: 'EVENT' })
send({ type: 'EVENT' }, { to: 'actorId' })
```

**After (v5)**:
```typescript
// raise() for self
raise({ type: 'EVENT' })
// sendTo() for other actors
sendTo('actorId', { type: 'EVENT' })
```

### Guarded Transitions
**Before (v4)**:
```typescript
on: {
  EVENT: {
    target: 'someState',
    cond: 'myGuard'
  }
}
```

**After (v5)**:
```typescript
on: {
  EVENT: {
    target: 'someState',
    guard: 'myGuard'
  }
}
```

### Invoked Services
**Before (v4)**:
```typescript
invoke: {
  src: 'myService',
  data: { foo: 'bar' }
}
```

**After (v5)**:
```typescript
invoke: {
  src: 'myService',
  input: { foo: 'bar' }
}
```

### React Hooks
**Before (v4)**:
```typescript
const [state, send] = useMachine(machine)
const service = useInterpret(machine)
const [state, send] = useActor(actorRef)
```

**After (v5)**:
```typescript
const [snapshot, send] = useMachine(machine)  // state → snapshot
const actorRef = useActorRef(machine)          // useInterpret → useActorRef
const [snapshot, send] = useActor(actorRef)   // unchanged
```

## Machine Migration Checklist

### Core Machines (Priority 1)
- [ ] `authMachine.ts` - Authentication flow
- [ ] `roomFetchMachine.ts` - Room data fetching
- [ ] `queueMachine.ts` - Queue management
- [ ] `playlistMachine.ts` - Playlist management

### UI State Machines (Priority 2)
- [ ] `modalsMachine.ts` - Modal state
- [ ] `audioMachine.ts` - Audio player
- [ ] `themeMachine.ts` - Theme switching
- [ ] `errorHandlerMachine.ts` - Error handling

### Spotify-Specific Machines (Priority 3)
- [ ] `spotifyAddToLibraryMachine.ts`
- [ ] `spotifyAuthMachine.ts`
- [ ] `spotifyUserAuthMachine.ts`
- [ ] `savedTracksMachine.ts`
- [ ] `trackSearchMachine.ts`

### Feature Machines (Priority 4)
- [ ] `chatMachine.ts`
- [ ] `djMachine.ts`
- [ ] `reactionsMachine.ts`
- [ ] `adminMachine.ts`
- [ ] `roomSetupMachine.ts`
- [ ] `savePlaylistMachine.ts`
- [ ] `createdRoomsFetchMachine.ts`

### Utility Machines (Priority 5)
- [ ] `debouncedInputMachine.ts`
- [ ] `toggleableCollectionMachine.ts`
- [ ] `triggerEventsMachine.ts`
- [ ] `typingMachine.ts`
- [ ] `usersMachine.ts`
- [ ] `scrollFollowMachine.ts`
- [ ] `settingsMachine.ts`
- [ ] `allReactionsMachine.ts`
- [ ] `TimerMachine.ts`

## Common Patterns to Clean Up

### 1. Remove `predictableActionArguments`
```typescript
// ❌ Remove this
const machine = createMachine({
  predictableActionArguments: true,
  // ...
})

// ✅ It's default in v5
const machine = createMachine({
  // ...
})
```

### 2. Simplify Action Signatures
```typescript
// ❌ Old way
assign((context, event) => ({
  foo: event.data
}))

// ✅ New way
assign(({ context, event }) => ({
  foo: event.data
}))
```

### 3. Use `raise()` Instead of `send()`
```typescript
// ❌ Old way
actions: send({ type: 'NEXT' })

// ✅ New way
actions: raise({ type: 'NEXT' })
```

### 4. Replace `cond` with `guard`
```typescript
// ❌ Old way
on: {
  EVENT: {
    target: 'next',
    cond: 'isValid'
  }
}

// ✅ New way
on: {
  EVENT: {
    target: 'next',
    guard: 'isValid'
  }
}
```

## Testing Strategy

1. **Install dependencies**: `npm install` in web app
2. **Build check**: Ensure TypeScript compiles
3. **Runtime testing**: Test key flows:
   - Authentication
   - Room joining
   - Queue management
   - Audio playback
   - Spotify integration

## Notes

- XState v5 requires TypeScript 5.0+
- Actions are ordered by default (no more `predictableActionArguments`)
- Transitions are internal by default
- Implementation functions receive single object argument

