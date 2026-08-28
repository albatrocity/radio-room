# 0128. Add to Queue overlays the integrated panel

**Date:** 2026-08-28
**Status:** Accepted

## Context

[ADR 0117](0117-integrated-room-panel-slot.md) docks Game State and Admin Settings in an in-flow column at lg+. The docked slot is whatever `modalsMachine` currently matches (`gameState` / `settings`). That machine was a single exclusive region, so **Add to Queue** (`EDIT_QUEUE` → `queue`) replaced the panel slot and collapsed the column.

Add to Queue is a blocking overlay (dialog / bottom sheet), not a panel slot. Listeners use it while Game State or Settings is docked — the same reason playlist and chat stay usable beside the panel. Collapsing the panel on every queue open forces them to reopen Game State and lose place.

## Decision

1. **`modalsMachine` is parallel** with two regions:
   - `modal` — exclusive surfaces that can dock (`gameState`, `settings`) or overlay (`username`, `help`, …). `CLOSE` targets `modal.closed`.
   - `queue` — Add to Queue only (`closed` | `open`). `EDIT_QUEUE` targets `queue.open` without leaving `modal`. `CLOSE_QUEUE` targets `queue.closed`.
2. **The integrated panel stays up** while Add to Queue is open, because `resolveIntegratedPanelSlot` still matches `modal.gameState` / `modal.settings`.
3. **Other overlays** (help, username, listeners, …) still replace the `modal` region and therefore still replace the panel. Only Add to Queue is carved out.
4. Match helpers live in `apps/web/src/lib/modalsState.ts` so UI keeps asking `matchesModals(state, "gameState")` instead of encoding region paths at every call site.

## Consequences

- Opening Add to Queue from the player (or `ctrl+a`) no longer collapses a docked Game State / Settings column; dismissing the queue returns to the same panel.
- Two layers can be open at once (panel + queue). Dismiss events are scoped: panel chrome still sends `CLOSE`; the queue dialog sends `CLOSE_QUEUE`.
- Call sites that used `state.matches("queue")` or `state.matches("closed")` must use the helpers (or `queue.open` / `{ modal: "closed", queue: "closed" }`).
- Follow-up: other overlays could move to the `queue` pattern if they should also sit on the panel; that is not implied here.

## See also

- [0117. Integrated room panel slot (lg+)](0117-integrated-room-panel-slot.md)
- [0004. State machines for UI and socket event handling](0004-state-machines-for-ui-and-socket-events.md)
- [0105. Add to Queue UI session persistence](0105-add-to-queue-ui-session-persistence.md)
- `apps/web/src/machines/modalsMachine.ts`
- `apps/web/src/lib/modalsState.ts`
