# 0130. Game State overlay lifecycle lives in machines

**Date:** 2026-08-28
**Status:** Accepted

## Context

[ADR 0106](0106-game-state-nav-machine.md) moved the Game State tab stack into `gameStateNavMachine`, but the overlay surface (`UserGameStateSurface`) still orchestrated open/close and tab-visible side effects with about ten `useEffect`s: nav `ACTIVATE`/`DEACTIVATE` from `isOpen`, `REFRESH` on open, admin-listener and trade-actor lifecycle, invalid-tab snap, plugin-tab seen, Trades/Gifts toasts, and trade-detail viewed. Two of those duplicated click handlers in `selectTab`. Stored artifacts were a one-shot socket fetch in component `useState`.

That glue is not testable in the web app’s node vitest environment, and it is tied to the surface mounting. [ADR 0117](0117-integrated-room-panel-slot.md) uses one mount path per viewport, so closing the lg+ panel unmounts the surface without re-running an `isOpen` effect; child-actor `DEACTIVATE` ran from effect cleanup, but nav `DEACTIVATE` had no cleanup and could be skipped. [ADR 0004](0004-state-machines-for-ui-and-socket-events.md) already requires machines for this kind of coordination. Admin Settings never had this problem because `modalsMachine` already owns that flow.

## Decision

1. **`modalsMachine` `gameState` entry/exit send nav `ACTIVATE`/`DEACTIVATE` and `REFRESH`.** Overlay open follows the modal region, not a React `isOpen` effect or mount. Repeated `VIEW_GAME_STATE` while already in `gameState` does not reenter (same as today: refresh only on a false → true open).
2. **Tab-visible and child-actor work are actions on `gameStateNavMachine`.** `active` entry/exit, `SET_ACTIVE_TAB` while active, `PUSH_DETAIL` / `OPEN_DETAIL_ON_TAB` while active, and `SESSION_SNAPSHOT` while active call a shared `syncGameStateChildActors` helper (admin listener, trade actor, plugin-tab `TAB_VIEWED`, Trades/Gifts view, accepted-trade toast, trade-detail viewed). Picking a tab still returns that tab to its root ([ADR 0106](0106-game-state-nav-machine.md) point 4); `selectTab` is only `SET_ACTIVE_TAB`.
3. **Invalid tabs snap on `SET_AVAILABLE_TABS`, not a targetless `always`.** The surface (the only place that knows plugin tab ids, stored-tab visibility, admin, and trading) sends `SET_AVAILABLE_TABS`. Until that arrives, `availableTabIds` is `null` and the snap does not run. A targetless `always` while `active` re-checks eventless transitions until XState’s max and **stops the actor**, after which tab clicks (`SET_ACTIVE_TAB`) are ignored. Guard the snap with the incoming `event.tabIds` (the assign has not run yet). `active` entry still snaps if the already-stored list omits the current tab.
4. **Session fields that child actors need (`allowTrading`, `activeTrade`) arrive as `SESSION_SNAPSHOT`.** `userGameStateMachine` notifies via a sink (`notifyGameStateNavSession`) so the payload machine does not import the nav actor. Nav stores the snapshot and syncs if already `active`.
5. **Stored artifacts live on `userGameStateMachine`**, fetched with `GET_STORED_ARTIFACTS` when a session is present on `USER_GAME_STATE`, not in the view.
6. **Attention while already viewing that tab is a no-op.** `TAB_ATTENTION` for the active plugin tab, and gift/trade-invite toasts while the Trades/Gifts tab is showing, do not badge or toast.

This **partially supersedes [ADR 0106](0106-game-state-nav-machine.md) point 6**: `ACTIVATE`/`DEACTIVATE` still follow overlay open/close rather than mount, and frames are still kept on close; the sender is `modalsMachine` `gameState` entry/exit, not a surface `useEffect`. Points 1–5 and 7 of 0106 are unchanged.

Do **not** add a `userGameStateSurfaceMachine`. The surface stays presentational (drawer vs panel chrome, context snapshot, tab list).

## Consequences

- Game State child actors stay in sync across the lg panel ↔ modal handoff and when the surface is unmounted.
- Tab-visible rules (including reopen onto a persisted tab) have a test seam on `gameStateNavMachine`.
- Trade-off: `SET_AVAILABLE_TABS` is still fed from React, because plugin tab ids are derived in the tree. That is data in, not orchestration.
- Trade-off: nav side effects are centralized in `syncGameStateChildActors`; tests mock that helper rather than every child actor.

## See also

- [0004. State machines for UI and socket event handling](0004-state-machines-for-ui-and-socket-events.md)
- [0106. Game State nav stack in a machine](0106-game-state-nav-machine.md)
- [0117. Integrated room panel slot (lg+)](0117-integrated-room-panel-slot.md)
- `apps/web/src/machines/gameStateNavMachine.ts`
- `apps/web/src/lib/gameStateNavEffects.ts`
- `apps/web/src/components/Modals/UserGameStateSurface.tsx`
