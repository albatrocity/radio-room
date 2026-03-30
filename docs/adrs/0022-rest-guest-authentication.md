# 0022. REST guest authentication for listening-room clients

**Date:** 2026-03-30  
**Status:** Accepted

## Context

Platform operators and the scheduler app authenticate to the HTTP API with Better Auth ([ADR 0016](0016-better-auth-with-drizzle-for-platform-authentication.md)). The listening room uses a separate identity: a Redis-backed `userId` that the web client stores in `sessionStorage` under `radio-session-id` (see web `SESSION_ID` constant).

Several HTTP routes are mounted behind `requireAdmin`, which only accepts a Better Auth session with platform `admin` role. That blocks legitimate room UI that must call read-only scheduling data (for example the public show timeline) while the user is only a room participant, not a platform admin.

CORS restricts which browser origins may call the API; it does not authenticate callers. Any guest mechanism must validate credentials on the server.

## Decision

For **specific** REST endpoints that serve listening-room clients without Better Auth, use **dual authorization**:

1. **Platform admin:** If the request has a valid Better Auth session with `role === "admin"`, allow access (unchanged behavior for the scheduler and admin tools). Shared helper: `getPlatformAdminSession` in `@repo/auth/platformSession`.

2. **Guest REST auth:** Otherwise require:
   - HTTP header `X-Radio-Session-Id` whose value is the listening-room Redis user id (same as `radio-session-id` in sessionStorage).
   - Server validation with `getUser({ context, userId })` so the id refers to a real stored user.
   - For **resource-scoped reads**, an additional binding so the header alone cannot enumerate unrelated resources. The first use is `GET /api/scheduling/shows/:id`: require query parameter `roomId`, load the room with `findRoom`, and require `room.showId === :id` before returning the show.

Mount such routes **before** the blanket `requireAdmin` middleware on `/api/scheduling` (or equivalent), with dedicated middleware (e.g. `schedulingShowReadAuth` in `@repo/server`).

## Consequences

- New endpoints using this pattern must document their scope binding (headers, query params, and Redis checks) alongside the handler.
- Security is intentionally pragmatic: a valid Redis user id plus knowledge of `roomId` can read data scoped to that room’s attached show. Tighter checks (e.g. membership in `room:{roomId}:online_users`) can be added later if abuse appears.
- `@repo/server` depends on `@repo/auth` for `getPlatformAdminSession` only; `better-auth` is not added directly to `@repo/server` to avoid peer dependency conflicts with legacy `react-mentions` in that package.
- First concrete endpoint: `GET /api/scheduling/shows/:id` — handler `getSchedulingShowByIdHandler`; web client sends `X-Radio-Session-Id` and `roomId` via `fetchShow` in `schedulingApi.ts`.
