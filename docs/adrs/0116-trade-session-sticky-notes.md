# 0116. Trade session sticky notes

**Date:** 2026-08-26
**Status:** Accepted

## Context

Open trades already expose a two-column negotiation UI ([ADR 0115](0115-trade-invite-inbox.md)). Parties need a light way to clarify asks (“need one more,” “swap?”) without using room chat or building a transcript UI inside Game State.

## Decision

1. **Sticky notes, not chat.** Each `TradeParticipantState` may hold a single optional `message` (trimmed, max `TRADE_MESSAGE_MAX_LENGTH` = 160). A new send **replaces** the previous note; empty/whitespace **clears**. No history, markdown, or room `MESSAGE_RECEIVED`.

2. **Persist on the open session.** Notes live on the Redis `TradeSession` and ride `TRADE_UPDATED` / `USER_GAME_STATE.activeTrade` so refresh/reconnect keeps the latest note. Notes are dropped when the trade completes, cancels, or is cleaned up with the session.

3. **Compose UX.** One shared “Say something…” field below the trade columns (mobile-friendly); notes still **display under each column** heading.

4. **Typing is out-of-band.** `TRADE_TYPING` `{ tradeId, userId, typing }` is broadcast only (no Redis). Clients show a soft “typing…” on the counterparty column. Idle debounce (~1.5s), blur, and send clear typing.

5. **Sockets.** `TRADE_SET_MESSAGE` → `TradeService.setMessage` → `TRADE_UPDATED` (ops emit only, [ADR 0014](0014-emit-domain-events-from-operations-only.md)). Lock/confirm does not clear notes.

## Consequences

- Minimal protocol surface; no competition with room chat.
- Typing can desync briefly on reconnect (acceptable for v1).
- Studio-bridge mirrors `TRADE_SET_MESSAGE` / `TRADE_TYPING`.

## See also

- [0114. Player item gifting and trading](0114-player-item-gifting-and-trading.md)
- [0115. Trade invite inbox](0115-trade-invite-inbox.md)
- [`packages/server/services/TradeService.ts`](../../packages/server/services/TradeService.ts)
- [`apps/web/src/components/Modals/GameState/TradeDetailPanel.tsx`](../../apps/web/src/components/Modals/GameState/TradeDetailPanel.tsx)
