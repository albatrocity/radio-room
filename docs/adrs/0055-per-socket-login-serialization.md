# 0055. Per-Socket LOGIN Serialization

**Date:** 2026-05-12
**Status:** Accepted

## Context

The web client's auth state machine (`apps/web/src/machines/authMachine.ts`)
re-fires the `LOGIN` socket event from several places:

1. `connecting` state entry action (initial join)
2. `connecting` state `SOCKET_ONLINE` handler with `reenter: true` (retry on transport recovery — see [ADR 0038](0038-socket-io-client-never-give-up-reconnection.md))
3. `connecting` state `after: 3000` retry timer
4. `authenticated` state `SOCKET_ONLINE` handler (re-login after reconnect)
5. `authenticated` state `FORCE_REFRESH` handler (visibility staleness — see [ADR 0031](0031-staleness-aware-refresh-on-visibility.md))

On initial page load there is a race where the `connecting` entry fires `LOGIN`
just before the socket finishes its first connect; the resulting `SOCKET_ONLINE`
broadcast re-enters `connecting`, firing a second `LOGIN` while the first is
still being processed on the server. Because Socket.IO callbacks for the same
socket run concurrently in Node's event loop (each suspending at every `await`),
both `LOGIN` handlers observed `socket.request.session.user === undefined` at
the same instant and each independently called `generateId()` +
`generateAnonName()` in `AuthService.login`.

The result was two distinct user records (e.g. `Anonymous Horse` and
`Anonymous Pig`) added to the room's Redis `online_users` set for a single
socket. `socket.data.userId` was overwritten by the last `LOGIN` to complete,
so the `socket.on("disconnect")` handler only ever removed one of them. The
other became a "phantom" listener that:

- appeared in the listener list,
- could not be kicked (its stored `id` pointed to a dead socket, so
  `io.sockets.sockets.get(socketId)?.disconnect()` was a no-op and nothing
  removed it from `online_users`),
- survived until the next server restart cleared Redis state.

## Decision

1. **Serialize `LOGIN` per socket.** In
   [`packages/server/controllers/authController.ts`](../../packages/server/controllers/authController.ts)
   the `socket.on("LOGIN", …)` callback is wrapped in a per-socket promise
   chain so the second `LOGIN` waits for the first to fully resolve. After the
   first handler returns, `socket.request.session.user` is populated
   (synchronously, even before the async `session.save()` settles), so the
   second handler resolves `existingUserId` via `sessionUser?.userId` and
   reuses the existing record instead of generating a new anonymous user.

2. **Kick robustness for phantom listeners.** In
   [`packages/server/handlers/adminHandlersAdapter.ts`](../../packages/server/handlers/adminHandlersAdapter.ts)
   the `kickUser` flow now falls back to an explicit cleanup path when
   `io.sockets.sockets.get(socketId)` returns `undefined`: it removes the user
   from `online_users` directly and broadcasts `USER_LEFT` via
   `SystemEvents`. This lets admins clean up any phantom listeners that
   existed before this change rolled out or that originate from future
   unrelated races.

The fix is local to the auth controller and the admin adapter; the client auth
machine, `AuthService`, and the existing `SOCKET_ONLINE` / reconnect strategy
([ADR 0038](0038-socket-io-client-never-give-up-reconnection.md)) are
unchanged. Other socket handlers do not need similar serialization because
their idempotency does not depend on `socket.request.session` being populated
between concurrent callbacks.

## Consequences

- A second concurrent `LOGIN` on the same socket no longer creates a phantom
  user; it is treated as an idempotent re-login that re-sends `INIT` with the
  existing user.
- The second handler is delayed by a few hundred milliseconds (the time to
  finish the first `LOGIN`). This is invisible to the user because the first
  handler is the one that drives the initial `INIT`.
- An admin kicking a user whose socket is already gone now updates Redis and
  broadcasts `USER_LEFT` instead of silently failing.
- The serialization is per-socket (closure over the controller invocation),
  so unrelated sockets remain fully concurrent.
- The auth client state machine retains its multiple `LOGIN` emission sites —
  changing the client to emit only once would require coordinating across
  reconnect, retry, and visibility flows and is out of scope here. Defending
  on the server is sufficient and centralizes the invariant.
