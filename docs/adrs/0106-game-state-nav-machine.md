# 0106. Game State nav stack in a machine

**Date:** 2026-08-20
**Status:** Partially superseded by [0130](0130-game-state-overlay-lifecycle-in-machines.md) (who sends `ACTIVATE`/`DEACTIVATE`)

## Context

[ADR 0104](0104-game-state-item-detail-subroute.md) put the Game State modal's per-tab item detail stack in a React context (`GameStateNavProvider`) holding `useState`. Around that context the modal hand-wired the coordination: four separate `stopTrackPreview()` calls (modal close, an `isDetail` effect, the breadcrumb Back handler, and the detail component's unmount), a `requestAnimationFrame` deferral so a React Strict Mode remount could re-apply the one-shot deep-link in `modalsMachine` before it was cleared, and an `activeTabId` `useState` prop-drilled into the provider. None of it was testable: the web app's vitest environment is `node`, so logic that only exists inside components has no test seam. [ADR 0004](0004-state-machines-for-ui-and-socket-events.md) calls for machines in exactly this situation, and [ADR 0105](0105-add-to-queue-ui-session-persistence.md) had just done the same for Add to Queue's modal chrome.

## Decision

1. **`gameStateNavMachine` / `gameStateNavActor` own the active tab and the per-tab stacks.** Supersedes point 1 of [ADR 0104](0104-game-state-item-detail-subroute.md); the rest of that ADR (opt-in via `detailView`, layouts, queueing rules) is unchanged.
2. **Preview audio is a state rule, not a call site.** `stopTrackPreview` is the `detail` state's `exit` action, plus an action on `PUSH_DETAIL` for detail-onto-detail, which does not leave the state. `GameStateItemDetail` keeps its own unmount guard for the case where the game session or payload disappears underneath it — that is not a navigation event.
3. **`index` / `detail` are derived by eventless (`always`) transitions** guarded on the active tab having a frame, so tab switches, pops, and deep-links all resolve through one place.
4. **Picking a tab returns that tab to its root**, including re-picking the tab already being viewed, which is how a viewer leaves a detail frame from the tab bar. Because `onValueChange` does not fire for the selected tab, each trigger also binds the same handler to `onClick`.
5. **Deep-links go straight to the actor.** `openGameStateItemDetail()` sends `OPEN_DETAIL_ON_TAB` and then opens the modal. The event is accepted while inactive and rendered on `ACTIVATE`, so `modalsMachine`'s `gameStateDetailDeepLink` one-shot, its `CLEAR_…` event, and the `requestAnimationFrame` workaround are all deleted.
6. **`ACTIVATE` / `DEACTIVATE` follow overlay open/close, not mount/unmount**, so a Strict Mode double effect cannot deactivate over a frame a deep-link just queued. `DEACTIVATE` keeps the frames — clearing them on close (as the old `resetAll()` did) swapped the modal body back to the tab index while the dialog was still animating out. Reopening resumes the detail view, the way the selected tab already persisted. Only `RESET`, sent by `roomLifecycle` on room exit, drops frames, since they belong to that room's game state. **Who sends these events** is [ADR 0130](0130-game-state-overlay-lifecycle-in-machines.md) (`modalsMachine` `gameState` entry/exit), not a surface `isOpen` effect.
7. **"Am I inside the modal?" is `state.matches("active")`.** `useOpenItemDetail` used the absence of the provider to decide between pushing a frame and deep-linking; that signal disappears with a singleton actor, so the machine state carries it.

## Consequences

- Twelve unit tests cover the stack, tab selection, deep-link-before-open, close vs. room-exit, and each way preview audio must stop.
- A detail view survives a close/reopen, so a frame for an item that has since been sold or consumed can come back with no definition behind it. It degrades to the frame title (and, for `trackList`, a fetch error), which is the same staleness [ADR 0105](0105-add-to-queue-ui-session-persistence.md) accepted for restored browse locations.
- `ModalUserGameState` loses three effects, the `rAF` dance, and its `gameStateTab` `useState`.
- Inventory and shop rows no longer re-render on every stack change, since they select from the actor instead of consuming a context value.
- Trade-off: nav state now outlives the components that use it, so anything that should clear it has to say so (`RESET` on room exit) rather than getting it free from unmounting.

## See also

- [0004. State machines for UI and socket event handling](0004-state-machines-for-ui-and-socket-events.md)
- [0130. Game State overlay lifecycle in machines](0130-game-state-overlay-lifecycle-in-machines.md)
- [0104. Game State item detail subroute](0104-game-state-item-detail-subroute.md)
- [0105. Add to Queue UI session persistence](0105-add-to-queue-ui-session-persistence.md)
- `apps/web/src/machines/gameStateNavMachine.ts`
- `apps/web/src/actors/gameStateNavActor.ts`
- `apps/web/src/components/Modals/ModalUserGameState.tsx`
