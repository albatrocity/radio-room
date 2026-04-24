# 0038. Socket.IO Client — Never-Give-Up Reconnection

**Date:** 2026-04-14
**Status:** Accepted

## Context

The web client uses a singleton Socket.IO connection shared across room lifecycle, auth, and domain actors. Mobile browsers and long-backgrounded tabs often suspend JavaScript; the Engine.IO/WebSocket connection can drop while timers and the client reconnection manager still run (or exhaust a finite retry budget before the user returns).

Previously the client set `reconnectionAttempts: 10`. After those attempts, Socket.IO emitted `reconnect_failed`, the manager became inactive (`socket.active === false`), and no code path called `socket.connect()` when the tab became visible again. Users could remain stuck until a full page refresh.

Visibility-based staleness refresh ([ADR 0031](0031-staleness-aware-refresh-on-visibility.md)) syncs room data when the tab is visible but assumes a working socket for `LOGIN` / `GET_LATEST_ROOM_DATA`.

## Decision

1. **Client `reconnectionAttempts`:** Set to `Infinity` (Socket.IO default) in [`apps/web/src/lib/socket.ts`](../../apps/web/src/lib/socket.ts) so the built-in manager does not permanently stop retrying while the app is open. Keep bounded backoff via `reconnectionDelay` / `reconnectionDelayMax`.

2. **Visibility nudge:** On tab visible, if the socket is not connected and the manager is inactive, call `socket.connect()` from:
   - [`apps/web/src/actors/roomLifecycle.ts`](../../apps/web/src/actors/roomLifecycle.ts) (`handleVisibilityChange`)
   - [`apps/web/src/machines/authMachine.ts`](../../apps/web/src/machines/authMachine.ts) (`visibilityService` before notifying auth of disconnect)

3. **Socket actor safety net:** In [`apps/web/src/actors/socketActor.ts`](../../apps/web/src/actors/socketActor.ts), while the machine is in the `disconnected` state, a delayed transition every 30 seconds re-enters `disconnected` and runs an action that calls `socket.connect()` only when `!socket.connected && !socket.active`, avoiding duplicate nudges while the manager is already reconnecting.

Server-side Engine.IO `pingInterval` / `pingTimeout` ([`packages/server/index.ts`](../../packages/server/index.ts)) are unchanged.

4. **Subscriber lifecycle events (web app):** The socket actor broadcasts a small semantic surface to XState actors via `subscribeActor` / `subscribeById`: `SOCKET_ONLINE` (includes optional `attemptNumber` after reconnect), `SOCKET_OFFLINE` (includes `reason`), and `SOCKET_RECONNECTING` (includes `attemptNumber`). This replaces a larger set of raw Socket.IO–mirrored event names so auth can run a single re-`LOGIN` on `SOCKET_ONLINE` per recovery.

## Consequences

- Tabs that wake from long suspension can recover the transport without a refresh, then existing `LOGIN` / `INIT` and visibility sync paths can refresh data.
- With infinite client retries, the app may keep trying against a permanently down host until the user leaves; backoff caps load. The 30s socket-actor nudge only applies when the machine considers itself disconnected and the manager is inactive.
- Slightly more console noise from reconnect attempts in pathological network conditions; acceptable for correctness.
