# Parent Machine Architecture Design

> **Overview:** Design a framework-independent parent machine architecture to replace zustand stores, enabling conditional actor spawning, centralized socket handling, and elimination of React useEffect orchestration patterns.

## Current State Analysis

**15 zustand stores** wrapping XState machines, with:

- **21 machines** invoking `socketService` independently
- **Cross-store dependencies**: `authStore` referenced by 6 machines; `djStore` by 2; `chatStore`/`playlistStore` by 1 each
- **33 useEffect calls** for orchestration (many sending machine events on mount/unmount)
- Dependencies locked to XState v4.37 due to `zustand-middleware-xstate`

## Proposed Actor Hierarchy

```
appMachine (root)
├── socketActor (shared, always running)
├── authMachine (always running)
├── themeMachine (always running)
├── settingsMachine (always running)
│
└── [authenticated]
    ├── roomMachine
    ├── errorsMachine
    ├── modalsMachine
    │
    └── [inRoom]
        ├── audioMachine
        ├── chatMachine
        ├── usersMachine
        ├── playlistMachine
        ├── reactionsMachine
        ├── djMachine
        ├── bookmarkedChatMachine
        │
        └── [isAdmin]
            └── adminMachine
```

## Key Design Decisions

### 1. Centralized Socket Handling

Instead of 21 machines each invoking `socketService`, the parent machine owns socket lifecycle:

```typescript
// appMachine routes socket events to children
on: {
  'SOCKET.*': { actions: 'broadcastToChildren' },
  'TRACK_CHANGED': { actions: sendTo('audio', (_, e) => e) },
  'MESSAGE_RECEIVED': { actions: sendTo('chat', (_, e) => e) },
  // ... routing table
}
```

**Benefits**: Single socket connection, clear event flow, easier debugging

### 2. Conditional Actor Spawning

Actors spawn based on state, not import:

| State             | Spawned Actors                                           |
| ----------------- | -------------------------------------------------------- |
| `unauthenticated` | auth, theme, settings, socket                            |
| `authenticated`   | + room, errors, modals                                   |
| `inRoom`          | + audio, chat, users, playlist, reactions, dj, bookmarks |
| `inRoom.admin`    | + admin                                                  |

**Benefits**: No wasted resources, cleaner state on logout/room exit

### 3. Entry/Exit Actions Replace useEffect

Current pattern (`apps/web/src/routes/rooms/$roomId.tsx` lines 32-44):

```typescript
useEffect(() => {
  roomSend("FETCH", { data: { id: roomId } })
  return () => {
    roomSend("RESET")
  }
}, [roomId])
```

Becomes:

```typescript
// In appMachine
inRoom: {
  entry: sendTo('room', ({ context }) => ({ type: 'FETCH', data: { id: context.roomId } })),
  exit: sendTo('room', { type: 'RESET' }),
}
```

### 4. Cross-Machine Communication

Current pattern (`apps/web/src/state/roomStore.ts` lines 30-36):

```typescript
const authState = useAuthStore.getState()
authState.send("SET_PASSWORD_REQUIREMENT", { ... })
```

Becomes:

```typescript
// Child sends to parent, parent routes
sendParent({ type: 'AUTH.SET_PASSWORD_REQUIREMENT', ... })

// Or via parent's event routing
on: {
  'ROOM.LOADED': {
    actions: sendTo('auth', ({ event }) => ({
      type: 'SET_PASSWORD_REQUIREMENT',
      passwordRequired: event.room.passwordRequired
    }))
  }
}
```

## Module Structure

```
src/
├── actors/
│   ├── appActor.ts          # Root actor (module-level singleton)
│   ├── index.ts             # Exports getAppActor(), actor selectors
│   └── types.ts             # Shared types for parent-child communication
├── machines/
│   ├── appMachine.ts        # Parent machine definition
│   ├── audioMachine.ts      # (updated to work as child)
│   └── ...
├── hooks/
│   └── useAppActor.ts       # React bindings (useSelector wrappers)
└── state/                   # (deprecated, migrate away)
```

## React Bindings (Framework-Independent Core)

```typescript
// actors/appActor.ts - Framework independent
import { createActor } from "xstate"
export const appActor = createActor(appMachine).start()

// hooks/useAppActor.ts - React-specific (thin layer)
import { useSelector } from "@xstate/react"
import { appActor } from "../actors/appActor"

export const useAuthState = () => useSelector(appActor, (s) => s.context.authRef?.getSnapshot())

export const useIsPlaying = () =>
  useSelector(
    appActor,
    (s) => s.context.audioRef?.getSnapshot()?.matches("online.progress.playing") ?? false,
  )
```

## Migration Phases

### Phase 1: Infrastructure

- Create `appMachine` with socket handling
- Create `appActor` module-level singleton
- Create React hooks layer

### Phase 2: Auth Flow

- Migrate `authMachine` as always-running child
- Implement authenticated/unauthenticated states
- Update components to use new hooks

### Phase 3: Room Flow

- Migrate `roomMachine`, `chatMachine`, `audioMachine`
- Implement `inRoom` state with entry/exit actions
- Remove useEffect orchestration from route components

### Phase 4: Remaining Actors

- Migrate remaining 12 machines
- Remove zustand dependencies
- Upgrade to XState v5

## Files to Create/Modify

**New files:**

- `apps/web/src/actors/appActor.ts` - Root actor singleton
- `apps/web/src/machines/appMachine.ts` - Parent machine
- `apps/web/src/hooks/useAppActor.ts` - React bindings

**Modified files:**

- `apps/web/src/machines/authMachine.ts` - Adapt for parent-child communication
- `apps/web/src/machines/audioMachine.ts` - Remove direct socketService invoke
- `apps/web/src/lib/socketService.ts` - May need adapter for parent machine

---

## Design Decisions (Resolved)

### Socket Event Routing: Broadcast Default + Explicit Orchestration

**Two categories of actors with different routing strategies:**

#### Orchestration Actors (Explicit Routing)

High-level "routing" machines that manage app flow and cross-domain coordination:

- `authMachine` - authentication flow, password requirements
- `roomMachine` - room lifecycle, setup sequencing
- `modalsMachine` - UI flow coordination

```typescript
// Parent explicitly routes events for orchestration
on: {
  'ROOM.LOADED': {
    actions: [
      sendTo('auth', ({ event }) => ({ type: 'SET_PASSWORD_REQUIREMENT', ... })),
      // Sequential: auth setup completes before room is "ready"
    ]
  },
  'AUTH.AUTHENTICATED': {
    target: 'authenticated',
    actions: 'spawnRoomActors'
  },
}
```

#### Domain Actors (Broadcast)

Independent UI-attached machines that react to domain events:

- `audioMachine`, `chatMachine`, `playlistMachine`, `reactionsMachine`, `usersMachine`, etc.

```typescript
// Parent broadcasts socket events to all spawned domain actors
// Each actor handles only the events it has handlers for
invoke: {
  id: 'socketBroadcaster',
  src: fromCallback(({ sendBack, system }) => {
    socketService((event) => {
      // Broadcast to all domain actors
      for (const actorRef of getDomainActors(system)) {
        actorRef.send(event);
      }
    });
  })
}
```

**Benefits:**

- Orchestration flow is explicit and traceable
- Domain actors are self-contained and independently testable
- Adding new domain events doesn't require parent changes
- Multiple actors can react to same event (fan-out pattern)

### State Persistence: sessionStorage

Persist parent machine state to sessionStorage for instant recovery on refresh:

```typescript
// actors/appActor.ts
const persistedState = sessionStorage.getItem("app-state")

export const appActor = createActor(appMachine, {
  snapshot: persistedState ? JSON.parse(persistedState) : undefined,
  inspect: (event) => {
    if (event.type === "@xstate.snapshot") {
      // Persist on state changes (debounced)
      sessionStorage.setItem("app-state", JSON.stringify(event.snapshot))
    }
  },
}).start()
```

**Considerations:**

- Only persist serializable context (no functions, actor refs)
- Child actors will need to be re-spawned from persisted parent state
- Include version number for migration handling

### Devtools: XState Inspector Integration

Enable Stately Inspector for the full actor hierarchy:

```typescript
import { createBrowserInspector } from "@stately/inspect"

const inspector = createBrowserInspector()

export const appActor = createActor(appMachine, {
  inspect: inspector.inspect,
}).start()
```

This provides:

- Visual state chart for parent + all children
- Event timeline and state history
- Context inspection
- Time-travel debugging

---

## Implementation Status

### Phase 1: Infrastructure (COMPLETED)

- [x] Design socket event routing table for parent machine
- [x] Implement appMachine with conditional spawning and socket handling
- [x] Create module-level appActor singleton
- [x] Create React hooks layer (useAppActor, selectors)
- [x] Upgrade to XState v5.24.0

### Phase 2: Auth Flow (COMPLETED)

- [x] Migrate authMachine to v5 (`authMachine.v5.ts`)
- [x] Spawn auth actor from appMachine
- [x] Create useAuth hooks

### Phase 3: Room Flow (COMPLETED)

- [x] Migrate roomFetchMachine to v5 (`roomFetchMachine.v5.ts`)
- [x] Migrate audioMachine to v5 (`audioMachine.v5.ts`)
- [x] Migrate chatMachine to v5 (`chatMachine.v5.ts`)
- [x] Migrate usersMachine to v5 (`usersMachine.v5.ts`)
- [x] Migrate playlistMachine to v5 (`playlistMachine.v5.ts`)
- [x] Migrate allReactionsMachine to v5 (`allReactionsMachine.v5.ts`)
- [x] Create hooks: useAudio, useChat, useUsers, usePlaylist, useReactions, useRoom
- [x] Conditional spawning of domain actors when entering room

### Phase 4: Remaining Work

- [ ] Migrate remaining machines: dj, modals, settings, theme, errors, admin
- [ ] Update components to use new hooks instead of zustand stores
- [ ] Remove old zustand stores and zustand-middleware-xstate
- [ ] Add XState Inspector integration
