# XState v5 Migration Learnings

**Date:** December 2024  
**Branch:** `refactor/xstate-machine-spawn-structure`  
**Outcome:** Abandoned - too many edge cases, reverting to zustand store

---

## Goal

Remove `zustand` and `zustand-middleware-xstate` dependencies to:

1. Upgrade to XState v5 (the middleware only supports v4)
2. Decouple state from React for potential future framework migration
3. Centralize state management in a single `appMachine`

---

## What Was Accomplished

### Successfully Migrated

- Upgraded all machines to XState v5 syntax (`setup()`, `assign({ context, event })`, `guard` instead of `cond`)
- Created a single `appMachine` with consolidated context
- Implemented socket handling via `fromCallback` actor
- Session persistence to `sessionStorage`
- Basic auth flow (login, room joining)
- Chat messages, reactions, playlist display
- Modal and drawer state management

### XState v5 Patterns That Worked

1. **Debounce machine using `after` with `reenter: true`:**

```typescript
states: {
  debouncing: {
    on: {
      INPUT: { target: "debouncing", reenter: true, actions: "setValue" },
    },
    after: {
      debounceDelay: { target: "idle", actions: "onDebounced" },
    },
  },
}
```

2. **Socket actor with `fromCallback`:**

```typescript
const socketActor = fromCallback(({ sendBack, receive }) => {
  socket.on("event", (e) => sendBack({ type: e.type, data: e.data }))
  receive((event) => socket.emit(event.type, event.data))
  return () => {
    /* cleanup */
  }
})
```

3. **Action overrides via `.provide()`:**

```typescript
const machineWithActions = baseMachine.provide({
  actions: {
    myAction: ({ context }) => {
      /* custom implementation */
    },
  },
})
```

4. **Stable selector fallbacks to prevent infinite re-renders:**

```typescript
const EMPTY_ARRAY: never[] = []
export function useMessages() {
  return useSelector(appActor, (s) => s.context.messages ?? EMPTY_ARRAY)
}
```

---

## Issues Encountered

### 1. Event/Data Shape Mismatches

Many components expected different data shapes than what the consolidated machine provided:

- `ChatMessage` has no `id` field (uses `timestamp`)
- Track IDs at `meta.nowPlaying.mediaSource.trackId` not `meta.track.id`
- Socket events with `{ type, data }` wrapper vs direct payloads

### 2. Missing Event Handlers

As features were tested, we kept finding events not wired up:

- `SET_SETTINGS`, `CLEAR_PLAYLIST`, `DEPUTIZE_DJ` for admin actions
- `BOOKMARK_MESSAGE`, `UNBOOKMARK_MESSAGE` for chat bookmarks
- Various drawer/modal state events

### 3. Child Actor References

Old hooks expected child actor refs (`metadataAuthRef`, `adminRef`) that didn't exist in the single-machine architecture:

```typescript
// Old pattern - looking for spawned child
const adminRef = useSelector(appActor, (s) => s.context.adminRef)
adminRef?.send(event)

// New pattern - send directly to appMachine
appActor.send(event)
```

### 4. Action Signature Changes (v4 → v5)

```typescript
// v4
assign((context, event) => ({ ... }))

// v5
assign(({ context, event }) => ({ ... }))
```

### 5. useMachine with Provided Actions

Actions provided via `useMachine(machine, { actions: {...} })` didn't work reliably. Better to use:

```typescript
const machineWithActions = useMemo(() =>
  machine.provide({ actions: {...} }),
[deps])
const [state, send] = useMachine(machineWithActions)
```

### 6. Complexity of Single Machine

The single `appMachine` grew to ~970 lines with:

- 50+ event types
- 30+ actions
- Complex nested states
- Hard to trace event flow

---

## Key Learnings

1. **Start smaller:** Migrate one feature at a time with full testing before moving on
2. **Type everything:** XState v5's types are strict - leverage them to catch mismatches early
3. **Keep socket handling simple:** Direct `socket.emit()` in effects is often cleaner than actor abstractions
4. **Avoid over-engineering:** Simple React state + useEffect is often better than a state machine for one-off async operations
5. **Test incrementally:** The "big bang" consolidation made debugging very difficult

---

## Recommendations for Future Attempt

1. **Keep zustand for simple global state**, use XState only for complex flows (auth, room lifecycle)
2. **Use multiple small machines** instead of one giant machine
3. **Create a migration checklist** with specific test cases for each feature
4. **Consider @xstate/store** for simpler state management needs (new in XState ecosystem)
5. **Don't fight the framework** - if React patterns work well, use them

---

## Files of Interest

- `apps/web/src/machines/appMachine.ts` - The consolidated machine
- `apps/web/src/actors/appActor.ts` - Module-level actor singleton
- `apps/web/src/hooks/useApp.ts` - Selector hooks
- `apps/web/src/machines/debouncedInputMachine.ts` - Clean debounce pattern
- `apps/web/src/lib/socketActor.ts` - Socket.io actor wrapper
