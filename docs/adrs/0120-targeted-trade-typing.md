# 0120. Targeted TRADE_TYPING (not a SystemEvent)

**Date:** 2026-08-27
**Status:** Accepted

## Context

[ADR 0116](0116-trade-session-sticky-notes.md) defined trade sticky notes and an out-of-band `TRADE_TYPING` signal, specified as **room-broadcast** with no Redis. At room scale that wakes every client's trade UI. Typing is ephemeral UX, not a domain state change: it must not fan out through SystemEvents (plugins, Redis Pub/Sub, RoomBroadcaster).

A first delivery put `io.to` inside `tradeTyping` in operations. That violates [ADR 0014](0014-emit-domain-events-from-operations-only.md) (operations emit domain events; handlers own Socket.IO) and [ADR 0008](0008-system-events-and-broadcaster-pattern.md) (no ad-hoc socket emits from ops).

## Decision

1. **`TRADE_TYPING` is a socket-only wire event**, not a SystemEvents domain event. Do not call `context.systemEvents.emit(..., "TRADE_TYPING", ...)`. Plugins cannot observe it via `this.on("TRADE_TYPING")`.

2. **Delivery is counterpart-only**, using the same private-socket model as kick / `PluginAPI.sendUserSystemMessage` ([ADR 0048](0048-plugin-user-targeted-chat.md)): `SISMEMBER` on `room:{roomId}:online_users` plus that user’s hash (`getOnlineUserSocketId`) and `io.to(socketId).emit`. Do **not** call `getRoomUsers` (that hydrates every online user and personas). Warn and no-op when the counterpart has no connected socket.

3. **Handlers own the emit.** `tradeTyping` in operations validates membership and returns `{ success, counterpartUserId }`. `GiftTradeHandlers.tradeTyping` calls `emitToUserSocket`. No `socket.io` `Server` in `operations/`.

4. **No Redis.** Idle debounce, blur, and send still clear typing on the client. Sticky-note persistence, `TRADE_SET_MESSAGE` → `TRADE_UPDATED`, and compose UX remain as in ADR 0116.

5. The `TRADE_TYPING` payload type may remain on `SystemEventHandlers` as the shared wire shape; that does **not** authorize `systemEvents.emit`.

This **partially supersedes** ADR 0116 decision point 4 (broadcast-only typing).

## Consequences

- Bystanders and plugins do not see typing; reconnect can still desync the indicator (same as 0116).
- Socket lookup is O(1) Redis (membership + one user hash), not O(online users).
- Studio-bridge should target the counterpart socket when two preview sockets exist; skip emit if the counterpart is not connected (do not room-broadcast).
- Follow-up ephemeral peer signals should copy this handler-owned path, not thread `io` through operations.

## See also

- [0008. SystemEvents and Broadcaster Pattern](0008-system-events-and-broadcaster-pattern.md)
- [0014. Emit Domain Events from Operations Only](0014-emit-domain-events-from-operations-only.md)
- [0048. Plugin user-targeted chat](0048-plugin-user-targeted-chat.md)
- [0116. Trade session sticky notes](0116-trade-session-sticky-notes.md)
- [`packages/server/lib/emitToUserSocket.ts`](../../packages/server/lib/emitToUserSocket.ts)
- [`packages/server/operations/data/users.ts`](../../packages/server/operations/data/users.ts) (`getOnlineUserSocketId`)
- [`packages/server/handlers/giftTradeHandlersAdapter.ts`](../../packages/server/handlers/giftTradeHandlersAdapter.ts)
