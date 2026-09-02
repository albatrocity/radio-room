# 0131. Completed trades toast both parties; Inventory nav if viewing the session

**Date:** 2026-08-28
**Status:** Accepted

## Context

When both parties confirm, the server emits `TRADE_COMPLETED` to the room. The client already toasted “Trade complete” and opened Game State on the Trades/Gifts tab (`giftInboxActor`). That leaves a dead trade-detail frame (“session ended”) and, for someone still on the session, an empty inbox instead of the bag that just changed.

Lock/confirm toasts in [ADR 0129](0129-trade-session-lock-confirm-attention.md) are skipped while the session view is open. Completion is the opposite for **toasts**: both parties need a success signal. Navigation is only needed for whoever is still looking at the finished session.

## Decision

1. **On `TRADE_COMPLETED`, both participants** (anyone in `trade.participants`) get a success toast, even if Game State is open on that session. Stable id `trade-complete-{tradeId}`. Copy names the counterpart.
2. **Inventory navigation only if that client is viewing this trade session** (`isViewingTradeSession`). Then `TRADE_SESSION_COMPLETED` with `goToInventory: true`: active tab is inventory (root). Do **not** `VIEW_GAME_STATE` — the overlay is already open. A party with Game State closed or on another tab stays put.
3. **Always drop the finished trade frame** on the Trades/Gifts stack (`goToInventory: false` still clears it) so reopen cannot show a dead session.
4. **Detection stays on the existing `TRADE_COMPLETED` SystemEvent** (operations emit it — [ADR 0014](0014-emit-domain-events-from-operations-only.md) / [ADR 0114](0114-player-item-gifting-and-trading.md)). No new wire event. `giftInboxActor` remains the toast + nav sender.

This replaces the post-complete `openGameStateOnTab({ tabId: TRADES_GIFTS_TAB })` path. [ADR 0129](0129-trade-session-lock-confirm-attention.md) lock/confirm skip-while-viewing is unchanged.

## Consequences

- Completing a trade while on the session lands on Inventory, where the new items show after `USER_GAME_STATE` refetch.
- Completing while Game State is closed (or on another tab) only toasts; the overlay is not forced open.
- The finished trade frame is cleared even when the viewer is elsewhere.

## See also

- [0114. Player item gifting and trading](0114-player-item-gifting-and-trading.md)
- [0129. Trade session lock/confirm notifications](0129-trade-session-lock-confirm-attention.md)
- [0130. Game State overlay lifecycle in machines](0130-game-state-overlay-lifecycle-in-machines.md)
- `apps/web/src/actors/giftInboxActor.ts`
- `apps/web/src/lib/tradeInboxNotifications.ts`
- `apps/web/src/machines/gameStateNavMachine.ts`
