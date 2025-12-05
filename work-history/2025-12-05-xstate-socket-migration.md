# XState Socket Migration - ID-Based Subscriptions

**Date:** December 5, 2025  
**Status:** Implementation complete, testing needed

## Summary

Migrated component-local XState machines from a React hook-based socket subscription pattern to a framework-agnostic invoke pattern using ID-based subscriptions. This makes the codebase more portable (not tied to React) and resilient to React StrictMode's double-mounting behavior.

## Problem

Component-local machines (like `addToLibraryMachine`, `trackSearchMachine`, etc.) needed to receive socket events. Initial attempts using XState's `invoke` pattern failed due to React StrictMode:

1. StrictMode mounts/unmounts/remounts components for testing
2. Each mount cycle creates a new machine interpreter
3. When the interpreter stops, the invoke callback becomes invalid (no longer a function)
4. Even with ID-based subscriptions, the callback captured in the closure is invalid

**Key Learning**: The XState `invoke` pattern with `useMachine` fundamentally doesn't work for socket subscriptions because the callback is tied to the interpreter lifecycle. When React unmounts and stops the interpreter, the callback becomes invalid.

**Solution**: Use `useSocketMachine` hook which subscribes the stable interpreter reference directly, not a callback.

## Solution: ID-Based Subscriptions

Instead of using object references (which change on each invoke), use a **stable machine ID** for subscriptions:

1. **socketActor** now uses `Record<string, Subscriber>` (plain object) instead of `Set<AnyActorRef>`
   - Note: Using plain object instead of Map for better XState context compatibility
2. Re-subscribing with the same ID just updates the reference (idempotent)
3. No events are lost because there's always a valid subscriber for each ID

### Key Files Changed

#### `apps/web/src/actors/socketActor.ts`
- Changed `subscribers` from `Set<AnyActorRef>` to `Record<string, Subscriber>` (plain object)
- Note: Using plain object instead of Map for better XState context serialization
- Updated event types to include `id` in SUBSCRIBE/UNSUBSCRIBE
- Added `subscribeById()` and `unsubscribeById()` functions
- Kept `subscribeActor()` for backward compatibility with module-level actors
- Added defensive checks to skip invalid/undefined subscribers during broadcast

#### `apps/web/src/lib/socketCallback.ts`
- `createSocketCallback(machineId)` - Creates invoke callback for plugin machines
- **NOTE**: NOT used for component-local machines (use `useSocketMachine` instead)
- The invoke pattern doesn't work with React StrictMode because callbacks become invalid

#### `apps/web/src/hooks/useSocketMachine.ts` (restored)
- Hook that wraps `useMachine` and subscribes the interpreter to socket events
- Works with React StrictMode because it subscribes the stable interpreter reference
- Used for: `addToLibraryMachine`, `savedTracksMachine`, `trackSearchMachine`, `queueMachine`, `savePlaylistMachine`

#### Machines Updated (now use invoke pattern)
- `apps/web/src/machines/addToLibraryMachine.ts`
- `apps/web/src/machines/savedTracksMachine.ts`
- `apps/web/src/machines/trackSearchMachine.ts`
- `apps/web/src/machines/queueMachine.ts`
- `apps/web/src/machines/savePlaylistMachine.ts`

#### Components Reverted (back to standard useMachine)
- `apps/web/src/components/ButtonAddToLibrary.tsx`
- `apps/web/src/components/SavedTracks.tsx`
- `apps/web/src/components/TrackSearch.tsx`
- `apps/web/src/components/useAddToQueue.ts`
- `apps/web/src/components/Drawers/DrawerPlaylist.tsx`

#### `apps/web/src/machines/pluginComponentMachine.ts`
- Updated to use `subscribeById`/`unsubscribeById` instead of direct `socketActor.send`
- Uses unique ID per plugin instance: `plugin:${pluginName}:${timestamp}`

#### Deleted
- `apps/web/src/hooks/useSocketMachine.ts` - No longer needed

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      socketActor                             │
│  subscribers: { [machineId]: subscriber }                    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  "addToLibrary" → { send: callback }                 │   │
│  │  "track-search" → { send: callback }                 │   │
│  │  "saved-tracks" → { send: callback }                 │   │
│  │  "queue"        → { send: callback }                 │   │
│  │  "chatActor-xxx" → chatActor.send                    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  When SERVER_EVENT arrives:                                  │
│    Object.entries(subscribers).forEach(([id, sub]) =>       │
│      sub.send(event)                                         │
│    )                                                         │
└─────────────────────────────────────────────────────────────┘
         ▲                              │
         │ subscribeById(id, sub)       │ broadcast
         │ unsubscribeById(id)          ▼
┌─────────────────────┐        ┌─────────────────────┐
│  socketCallback     │        │  Component Machine   │
│  (invoke service)   │───────▶│  receives events     │
└─────────────────────┘        └─────────────────────┘
```

## Usage Pattern

### For component-local machines

```typescript
// In machine definition
import { createSocketCallback } from "../lib/socketCallback"

const myMachine = createMachine({
  id: "myMachine",
  invoke: {
    id: "socket",
    src: createSocketCallback("myMachine"),  // Use machine ID
  },
  on: {
    SOME_SERVER_EVENT: {
      // Handle events from server
    }
  }
})

// In component - just use standard useMachine
const [state, send] = useMachine(myMachine)
```

### For module-level actors (singletons)

```typescript
// These still use the subscribeActor/unsubscribeActor pattern
import { subscribeActor, unsubscribeActor } from "./socketActor"

export const chatActor = interpret(chatMachine).start()

export function subscribeChatActor() {
  subscribeActor(chatActor)  // Uses actor.id internally
}
```

## Testing Needed

1. **Spotify features** - Primary reason for this migration
   - Add to library (heart button)
   - Search tracks in Add to Queue modal
   - View saved/liked tracks
   - Queue songs
   - Save playlist to Spotify

2. **React StrictMode behavior**
   - Verify no duplicate subscriptions
   - Verify events don't get lost during mount cycles

3. **Socket reconnection**
   - All subscribers should receive SOCKET_RECONNECTED event
   - State should be consistent after reconnect

## Future Improvement: Framework-Agnostic Socket Subscriptions

**Goal**: Find a way to use XState's `invoke` pattern for socket subscriptions without relying on React-specific hooks.

**Current blocker**: React StrictMode invalidates invoke callbacks when interpreters stop during mount/unmount cycles.

**Potential solutions to explore**:
1. **XState v5 migration** - May have different invoke lifecycle behavior
2. **Actor spawning pattern** - Spawn a persistent socket-connected actor instead of using invoke
3. **Custom interpreter wrapper** - Create an interpreter that maintains callback validity
4. **Conditional StrictMode** - Disable in production (though this loses dev benefits)
5. **Event buffering** - Queue events during interpreter transitions

---

## Troubleshooting

### Events not reaching machine
1. Check console for socket actor logs
2. Verify machine ID matches between `createSocketCallback()` and machine definition
3. Check that invoke is at root level of machine (not inside a state)

### Duplicate events
1. Check that machine ID is unique across all component instances
2. If machine can have multiple instances, generate unique IDs

### Machine not receiving specific event types
1. Verify the event type matches exactly (case-sensitive)
2. Check that machine has handler for the event in `on: {}` block

## Related Files

- Previous migration learnings: `plans/xstate-v5-migration-learnings.md`
- State refactor goals: `plans/state-refactor.md`
- Room lifecycle management: `apps/web/src/actors/roomLifecycle.ts`
- Hooks layer: `apps/web/src/hooks/useActors.ts`

