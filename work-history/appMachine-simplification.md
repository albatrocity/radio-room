# AppMachine Architecture & Simplification Options

## Current Responsibilities

The `appMachine` currently handles:

1. **Socket Service** - Listens to socket.io events and routes them
2. **Actor Lifecycle** - Spawns/stops child actors based on state
3. **Event Routing** - Forwards events to appropriate child actors
4. **State Transitions** - Manages auth flow and room join/leave

## Current State Hierarchy

```
app
├── initializing     (waiting for first event)
├── unauthenticated  (not logged in)
└── authenticated    (logged in)
    ├── lobby        (not in a room)
    └── inRoom       (in a room)
        ├── active   (regular user)
        └── admin    (admin user)
```

## Complexity Sources

### 1. Duplicate Event Handlers

The same events (INIT, SOCKET\_\*, etc.) are handled in multiple states with nearly identical logic. This is necessary because XState doesn't inherit event handlers from parent states.

### 2. Conditional Actor Spawning

Actors are spawned/stopped based on state transitions, which adds complexity to entry/exit actions.

### 3. Event Broadcasting

Domain events must be manually forwarded to all child actors.

## Simplification Options

### Option A: Flatten the State Machine

Instead of nested states, use a simpler flat structure:

```
app
├── disconnected
├── authenticating
├── lobby
├── inRoom
└── inRoomAdmin
```

**Pros**: Easier to understand, less nesting
**Cons**: Some duplication of shared behavior

### Option B: Always-Running Actors

Instead of spawning/stopping actors based on state, spawn all actors at startup and let them handle their own "active/inactive" state.

```typescript
// Each domain actor manages its own lifecycle
const audioMachine = setup({...}).createMachine({
  initial: "inactive",
  states: {
    inactive: { on: { INIT: "active" } },
    active: { on: { LEAVE_ROOM: "inactive" } }
  }
})
```

**Pros**: Simpler appMachine, actors own their lifecycle
**Cons**: More memory usage, actors need to handle inactive state

### Option C: Split into Multiple Machines

Break the appMachine into smaller, focused machines:

1. `socketMachine` - Just handles socket lifecycle
2. `routerMachine` - Just handles navigation/routing
3. `sessionMachine` - Just handles auth state

**Pros**: Each machine is simpler and testable
**Cons**: Need coordination between machines

### Option D: Use XState v5 Actor System

XState v5 has a built-in actor system that can simplify spawning:

```typescript
const system = createActorSystem({
  actors: { auth, audio, chat, ... },
  // System handles spawning/stopping
})
```

**Pros**: Built-in actor management
**Cons**: Requires learning new patterns

## Recommendation

**Option B (Always-Running Actors)** seems most promising for this codebase because:

1. It eliminates conditional spawning logic from appMachine
2. Each actor owns its lifecycle (single responsibility)
3. The broadcast pattern still works
4. Easier to reason about - actors are always there

The appMachine would become primarily an event router, not an actor lifecycle manager.

## Next Steps

1. Test current implementation thoroughly
2. If stable, consider refactoring to Option B in a future iteration
3. Document the event flow for future contributors
