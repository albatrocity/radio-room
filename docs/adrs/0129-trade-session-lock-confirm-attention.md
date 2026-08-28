# 0129. Trade session lock/confirm notifications and session attention

**Date:** 2026-08-28
**Status:** Accepted

## Context

[ADR 0115](0115-trade-invite-inbox.md) badges Trades/Gifts for incoming gifts/invites and flashes attention on “trade accepted.” Viewing the **tab** dismisses invite toasts; the badge stays until the inbox is empty. That is the right rule for pending offers.

Live negotiation is different. If the counterpart locks or confirms while you are not looking at the trade session, you need a toast and a badge. Opening the Trades/Gifts **list** is not enough — the badge should stay until the **trade session view** is open. Accepted-invite toasts should dismiss when that session is visited, not linger over the negotiation UI.

## Decision

1. **Inbox attention (unchanged from 0115).** Incoming gifts/invites keep the tab and Game State button badged until the inbox is empty. Viewing the Trades/Gifts tab still dismisses invite toasts and clears the *inbox flash* flag when nothing incoming remains.

2. **Session attention** is a separate flag (`sessionUnseen` on `gameStateTradesGiftsAttentionMachine`). Set it when:
   - the counterpart accepts your invite
   - the counterpart locks their offer
   - the counterpart confirms and you have not yet confirmed
   Clear it only when Game State is open on that trade’s detail frame (`kind: "trade"`). Viewing the tab index does not clear it.

3. **Toasts for lock/confirm** fire only when the trade session view is **not** open (nav inactive or a different frame). Skip while the viewer is on that trade. Each toast has a stable id and an Open action that deep-links to the session.

4. **Accepted-invite toasts** use a stable id (`trade-accepted-{tradeId}`). Opening Game State dismisses that toast; opening the trade session view also dismisses accepted / lock / confirm toasts for that `tradeId`.

5. **Detection** is client-side on `TRADE_UPDATED`: diff the counterpart’s `locked` / `confirmed` against the last snapshot in `giftInboxActor`. No new SystemEvent.

## Consequences

- The Game State button and Trades/Gifts tab can stay badged after the user opens the tab list until they enter the trade.
- Lock/confirm toasts do not stack on top of the live session UI.
- ADR 0115 point 5 still governs inbox offers; session attention is additive.

## See also

- [0115. Trade invite inbox](0115-trade-invite-inbox.md)
- [`apps/web/src/actors/giftInboxActor.ts`](../../apps/web/src/actors/giftInboxActor.ts)
- [`apps/web/src/lib/tradeSessionNotifications.ts`](../../apps/web/src/lib/tradeSessionNotifications.ts)
