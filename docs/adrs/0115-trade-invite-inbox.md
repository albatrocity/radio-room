# 0115. Trade invite inbox and Trades/Gifts Game State tab

**Date:** 2026-08-25
**Status:** Accepted

## Context

[ADR 0114](0114-player-item-gifting-and-trading.md) introduced player gifting and trading with a **bind-on-invite** model: sending `TRADE_INVITE` immediately created a `TradeSession` with `status: pending_invite` and occupied the single active-trade slot for both parties via Redis `byUserKey`. That blocked the recipient from accepting other invites and blocked the sender from receiving invites while their outgoing invite was pending — availability griefing unrelated to an actual negotiation.

ADR 0114 also placed trade UI in a dedicated modal (`modalsMachine` `trade` state). Gifts lived on the Inventory tab. As both features grew, players needed one place to see pending gifts, trade invites, and the single active trade without leaving Game State.

Hosts also needed to disable gifting/trading mid-session (e.g. end-of-show) without ending the score/inventory session.

## Decision

1. **Two layers — invites vs sessions (mirror gifts).**
   - **Trade invites** are lightweight `TradeInvite` records in Redis indexes (like `GiftOffer`). Limits: one outgoing invite per sender; multiple incoming per recipient; no duplicate pair. **5-minute TTL** (`PLAYER_TRANSFER_TTL_MS`), lazy expiry on reads + best-effort `setTimeout` on persist. Invites do **not** set `byUserKey`.
   - **Active trade** remains a `TradeSession` with `status: open | completed | cancelled`. Occupying the trade slot happens only on **accept**, when a session is created and `byUserKey` is set. Still **one open trade per user**.

2. **Remove `pending_invite` from `TradeStatus`.** Invite lifecycle uses `TRADE_INVITE_*` system events; session lifecycle uses `TRADE_UPDATED`, `TRADE_COMPLETED`, `TRADE_CANCELLED`.

3. **Wire shape.** `USER_GAME_STATE` includes `pendingTradeInvites: { incoming, outgoing }` and `activeTrade` (open negotiation only). Socket names unchanged (`TRADE_INVITE`, `TRADE_RESPOND` passes `inviteId` as `tradeId`).

4. **Trades/Gifts built-in Game State tab** (visible when `allowTrading`). Trades section: active row (0–1) + invite lists. Gifts section: extracted pending-gifts panel. Trade negotiation drill-down via `GameStateDetailFrame` `{ kind: "trade" }` and nav stack — not a standalone modal.

5. **Attention + toasts.** Tab badge stays while any **incoming** gift or trade invite is pending (also set by live offer events and inviter “trade accepted”). That attention **bubbles to the Game State button** alongside plugin-tab attention. Viewing the tab dismisses offer toasts but does **not** clear the badge until the inbox is empty. Flash toasts via `giftInboxActor` + `gameStateTradesGiftsAttentionMachine`.

6. **Mid-session `allowTrading` toggle.** Admin `UPDATE_GAME_SESSION_CONFIG` patches the active session. Disabling runs gift/trade/invite cleanup (refunds, cancel sessions) **without** ending the session. Emits `GAME_SESSION_CONFIG_UPDATED` so clients refetch.

7. **Studio parity.** Game Studio sandbox and studio-bridge snapshot include `pendingTradeInvites` and emit invite events.

## Consequences

- Invites no longer block unrelated trade availability; only an **active** trade blocks new accepts.
- Extra Redis indexes and TTL sweep logic; lazy + timer expiry keeps UX timely across restarts.
- ADR 0114 §4 (trade modal) and bind-on-invite semantics are superseded for product UI and protocol.
- Inventory tab keeps row-level Gift only; Trades/Gifts tab is the hub for async offers and live negotiation.

## See also

- [0114. Player item gifting and trading](0114-player-item-gifting-and-trading.md) — core escrow protocol (partially superseded)
- [0043. Game state tabs](0043-game-state-tabs-and-composable-shop-helper.md)
- [0106. Game state nav machine](0106-game-state-nav-machine.md)
- [`packages/server/services/TradeService.ts`](../../packages/server/services/TradeService.ts)
- [`apps/web/src/components/Modals/GameState/TradesGiftsTab.tsx`](../../apps/web/src/components/Modals/GameState/TradesGiftsTab.tsx)
