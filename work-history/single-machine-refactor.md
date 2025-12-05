# Single Machine Refactor Plan

## Goal

Replace the complex parent/child actor hierarchy with a single `appMachine` that holds all application state in its context. This makes state easy to reason about, debug, and extend.

## Current Pain Points

- Event forwarding complexity (INIT, domain events, etc.)
- Timing issues (events arriving before actors spawn)
- Hard to understand where state lives
- Multiple levels of indirection for reading/writing state

## New Architecture

### Single Machine Structure

```typescript
const appMachine = createMachine({
  id: "app",
  initial: "disconnected",

  context: {
    // Connection
    socketConnected: false,

    // Auth
    currentUser: null,
    isAdmin: false,
    isAuthenticated: false,

    // Room
    roomId: null,
    roomSettings: null,

    // Domain data (previously in child machines)
    users: [],
    messages: [],
    playlist: [],
    currentTrack: null,
    reactions: {},

    // DJ state
    isDj: false,
    isDeputyDj: false,

    // UI state
    activeModal: null,
    theme: "default",
  },

  // Socket service runs always
  invoke: { id: "socket", src: socketService },

  states: {
    disconnected: {
      on: { SOCKET_CONNECTED: "connected" },
    },
    connected: {
      initial: "unauthenticated",
      states: {
        unauthenticated: {
          on: { INIT: { target: "inRoom", actions: "setInitData" } },
        },
        lobby: {
          on: { NAVIGATE_TO_ROOM: "joiningRoom" },
        },
        joiningRoom: {
          entry: "sendLogin",
          on: { INIT: { target: "inRoom", actions: "setInitData" } },
        },
        inRoom: {
          on: {
            LEAVE_ROOM: "lobby",
            // All domain events handled here
            TRACK_CHANGED: { actions: "setCurrentTrack" },
            MESSAGE_RECEIVED: { actions: "addMessage" },
            USER_JOINED: { actions: "setUsers" },
            PLAYLIST: { actions: "setPlaylist" },
            // etc.
          },
        },
      },
    },
  },
})
```

### Hooks (Simplified)

```typescript
// One actor, created at module level
export const appActor = createActor(appMachine).start()

// Simple hooks using useSelector
export function useCurrentUser() {
  return useSelector(appActor, (s) => s.context.currentUser)
}

export function useMessages() {
  return useSelector(appActor, (s) => s.context.messages)
}

export function useIsInRoom() {
  return useSelector(appActor, (s) => s.matches("connected.inRoom"))
}

export function useAppSend() {
  return appActor.send
}
```

### Components Read Directly

```typescript
function ChatWindow() {
  const messages = useMessages()
  const send = useAppSend()

  return (
    <div>
      {messages.map(m => <Message key={m.id} {...m} />)}
      <input onSubmit={(text) => send({ type: "SEND_MESSAGE", text })} />
    </div>
  )
}
```

## Migration Steps

### Phase 1: Consolidate Context

1. Define the complete `AppContext` type with all data
2. Create all the `assign` actions for each event type
3. Move socket event handling into the single machine

### Phase 2: Simplify Hooks

1. Replace child-actor-based hooks with simple selectors
2. Remove `useXxxActor` hooks, replace with `useXxx` data hooks
3. All hooks use `useSelector(appActor, selector)`

### Phase 3: Remove Child Machines

1. Delete domain machine files (audioMachine, chatMachine, etc.)
2. Keep UI-only machines if needed (forms, modals) as local component state
3. Clean up types and exports

### Phase 4: Clean Up

1. Remove actor spawning/stopping logic
2. Remove event forwarding logic
3. Simplify state hierarchy
4. Update tests

## What This Eliminates

- ❌ `getDomainActors()` and broadcasting
- ❌ `spawn()` / `stopChild()` complexity
- ❌ Event forwarding to child actors
- ❌ Timing issues with INIT
- ❌ Multiple levels of `useSelector`
- ❌ 15+ machine files

## What We Keep

- ✅ Single source of truth
- ✅ State machine benefits (finite states, transitions, guards)
- ✅ XState inspector for debugging
- ✅ `useSelector` for performant reads
- ✅ Type safety

## Files to Delete (Eventually)

- `machines/audioMachine.ts`
- `machines/chatMachine.ts`
- `machines/usersMachine.ts`
- `machines/playlistMachine.ts`
- `machines/allReactionsMachine.ts`
- `machines/djMachine.ts`
- `machines/settingsMachine.ts`
- `machines/bookmarkedChatMachine.ts`
- `machines/adminMachine.ts`
- `machines/errorHandlerMachine.ts`
- `actors/types.ts` (most of it)

## Files to Simplify

- `machines/appMachine.ts` - becomes the ONE machine
- `actors/appActor.ts` - simpler, no persistence complexity
- `hooks/*.ts` - all become simple selectors

## Estimated Effort

- Phase 1: 2-3 hours
- Phase 2: 1-2 hours
- Phase 3: 1 hour
- Phase 4: 1 hour

Total: ~6-8 hours of focused work

## Decision

This is a significant refactor but will dramatically simplify the codebase. The current architecture has grown too complex for the problem it solves.
