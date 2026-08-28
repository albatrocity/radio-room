# 0117. Integrated room panel slot (lg+)

**Date:** 2026-08-26
**Status:** Partially superseded by [0128](0128-add-to-queue-overlays-integrated-panel.md) (Add to Queue no longer replaces the panel slot)

## Context

Game State and Admin Settings use blocking center/top dialogs. While configuring a session or managing inventory/trades, users often need to read chat and interact with the room without closing the overlay. A portaled drawer still traps focus and dims the room; we want an **in-flow** column that shares the room grid with chat and the listeners sidebar.

## Decision

1. **Single integrated panel slot** at **lg (992px+)** — a fourth grid column to the right of the listeners/admin sidebar. Chat width shrinks; no backdrop or pointer-events trap.
2. **Slot registry** in `apps/web/src/lib/integratedPanelSlots.ts` maps `modalsMachine` states to panel content (`gameState`, `adminSettings`). At most one slot is active; mutual exclusion is inherited from `modalsMachine`, not a second state machine.
3. **Presentation switch** via `useIntegratedPanelPresentation()`: lg+ renders registered surfaces in the panel; below lg keeps existing modal/dialog behavior.
4. **Shared surfaces** — `UserGameStateSurface` and `AdminSettingsSurface` extract modal bodies; one mount path per viewport (panel in `Room`, modal in `Overlays`).
5. **Trigger toggles (panel mode)** — Game State and Admin Settings openers show active styling (`aria-pressed`) and click again to `CLOSE`.
6. **Animated width** on panel open/close; respect reduced motion via existing animation helpers.

## Consequences

- Chat and playlist/quick-access overlays remain usable while Game State or Admin is docked.
- Other `modalsMachine` modals still replace the panel slot (unchanged exclusivity).
- New surfaces can register in `INTEGRATED_PANEL_SLOTS` without new overlay infrastructure.
- Resize across lg handoffs panel ↔ modal while preserving `modalsMachine` open state.

## See also

- [0004. State machines for UI and socket event handling](0004-state-machines-for-ui-and-socket-events.md)
- [0106. Game State nav stack in a machine](0106-game-state-nav-machine.md)
- [0128. Add to Queue overlays the integrated panel](0128-add-to-queue-overlays-integrated-panel.md)
- `apps/web/src/components/IntegratedPanel/`
- `apps/web/src/lib/integratedPanelSlots.ts`
