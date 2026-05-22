# 0058. Client session persistence in localStorage (`clientSession`)

**Date:** 2026-05-22  
**Status:** Accepted

## Context

The listening-room web client assigns each guest a Redis-backed `userId` at socket `LOGIN` ([ADR 0003](0003-redis-for-ephemeral-room-data.md)). Platform operators use Better Auth ([ADR 0016](0016-better-auth-with-drizzle-for-platform-authentication.md)); almost everyone in a room is an anonymous guest, not a Better Auth user.

Originally, the client stored guest identity in **`sessionStorage`** under keys such as `radio-session-id` (`SESSION_ID`). That was an intentional design choice: guests were expected to be infrequent and ephemeral—one tab, one visit, identity discarded when the tab closed. That matched early product assumptions and avoided long-lived client identifiers.

As the project matured, stable guest `userId`s matter more:

- **Queue attribution** (`addedBy.userId`) must match the same person still in `room:{roomId}:online_users` when a track plays. Plugins such as **absent-dj** compare those ids; drift produces false “absent DJ” skips.
- **Game sessions, inventory, personas, and shop flows** ([ADR 0042](0042-game-sessions-and-inventory.md), [ADR 0057](0057-user-personas-system.md)) key state by `userId`.
- **REST guest auth** ([ADR 0022](0022-rest-guest-authentication.md)) sends `X-Radio-Session-Id` from the same client store for scheduling reads and uploads.

The server also keeps a 1-year `express-session` cookie (`session.user.userId`), and `AuthService.login` uses `incomingUserId ?? sessionUser?.userId` before minting a new id. In practice, relying on the cookie alone is fragile (Safari ITP, in-app browsers, blocked cookies, private browsing). **`sessionStorage` made the problem worse**: closing the tab or opening the room in a new tab dropped the local copy entirely, so the client often sent no `incomingUserId` even when the user was clearly the same person on the same device.

We rejected **username-based** presence or identity fallback: usernames are not unique and can change. **Cross-browser session handoff** (claim links, QR) remains out of scope for UX complexity.

## Decision

1. **Persist guest session fields in `localStorage`**, not `sessionStorage`, via a single module [`apps/web/src/lib/clientSession.ts`](../../apps/web/src/lib/clientSession.ts).

2. **Encapsulate all client-side session key access** in that module. Other code calls domain functions (`getStoredUserId`, `setStoredUserId`, `getStoredUsername`, `getStoredPassword`, `getStoredIsAdmin`, `clearStoredUser`) and does not import `SESSION_*` constants or touch `localStorage` / `sessionStorage` directly. Thin wrappers remain for existing APIs:
   - [`getCurrentUser.ts`](../../apps/web/src/lib/getCurrentUser.ts) / [`passwordOperations.ts`](../../apps/web/src/lib/passwordOperations.ts) (auth machine)
   - [`serverApi.ts`](../../apps/web/src/lib/serverApi.ts) / [`schedulingApi.ts`](../../apps/web/src/lib/schedulingApi.ts) (`X-Radio-Session-Id` header)

3. **Migration semantics** (no flag day for open tabs at deploy):
   - **Read:** `localStorage` first; if missing, fall back to legacy `sessionStorage` for the same key.
   - **Write:** `localStorage` only; remove the matching `sessionStorage` entry so the next read has one source of truth.
   - **Clear:** remove from both stores for user id and username (password unchanged from prior behavior—cleared only via explicit password helpers / logout flows as before).

4. **Browser guard:** storage operations no-op when `window` is undefined (SSR-safe); use a runtime `isBrowser()` check, not a module-load constant.

5. **Unchanged:** server-side identity resolution (`AuthService.login`, Redis `user:{userId}`, cookie session). This ADR only changes **where the browser caches the id** the client sends on `LOGIN` and REST calls.

Other `sessionStorage` uses (room creation wizard, OAuth redirect paths, theme, metadata preference, game-state tab ids, etc.) are **not** part of guest session identity and stay on `sessionStorage` where tab-scoped ephemeral state is still appropriate.

## Consequences

### Positive

- Same browser profile keeps the same anonymous `userId` across tab close, reopen, and new tabs—reducing false plugin behavior (e.g. absent-dj) and stabilizing game/inventory attribution.
- One module owns keys and storage backend; future changes (e.g. TTL, encryption, handoff tokens) stay localized.
- Deploy-time migration preserves in-flight tabs that still only have `sessionStorage` until the next save (typically LOGIN → INIT).

### Negative / limitations

- **`localStorage` is per-origin, not per-device.** Instagram in-app browser vs mobile Safari, or desktop vs phone, still get different ids. No change to that without a separate handoff feature.
- **Clearing site data** still resets identity; that is acceptable for anonymous guests.
- [ADR 0022](0022-rest-guest-authentication.md) is **partially superseded** by this ADR for client storage only; its REST dual-auth pattern remains authoritative.

### Follow-up (optional, not required by this ADR)

- Session handoff across browser contexts remains a future product decision.

## References

- Implementation: [`apps/web/src/lib/clientSession.ts`](../../apps/web/src/lib/clientSession.ts), tests in [`clientSession.test.ts`](../../apps/web/src/lib/clientSession.test.ts)
- Server login: [`packages/server/services/AuthService.ts`](../../packages/server/services/AuthService.ts)
- Cookie session: [`packages/server/index.ts`](../../packages/server/index.ts) (`express-session`, 1-year `maxAge`)
