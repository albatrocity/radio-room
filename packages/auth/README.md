# @repo/auth

Shared authentication package for the Listening Room platform. Wraps [Better-Auth](https://www.better-auth.com/) with the admin and invite-only plugins, Drizzle adapter, and Express middleware.

## Exports

The package exposes three entry points:

| Export | Path | Environment | Purpose |
|--------|------|-------------|---------|
| `@repo/auth/server` | `src/server.ts` | Node.js (server) | Better-Auth instance (`auth`) |
| `@repo/auth/middleware` | `src/middleware.ts` | Node.js (server) | Express `requireAdmin` middleware |
| `@repo/auth/client` | `src/client.ts` | Browser (React) | `authClient`, `useSession`, `signIn`, `signUp`, `signOut` |

## Server Usage

### Mounting the auth handler (Express)

Better-Auth handles its own request parsing. Mount the handler **before** `express.json()` to avoid body conflicts.

```typescript
import { toNodeHandler } from "better-auth/node"
import { auth } from "@repo/auth/server"

app.all("/api/auth/*splat", toNodeHandler(auth))

// Then mount express.json() and other middleware
app.use(express.json())
```

All Better-Auth routes (sign-up, sign-in, session, OAuth callbacks, invite-only endpoints) are served under `/api/auth/`.

### Protecting routes with `requireAdmin`

The middleware validates the Better-Auth session cookie, checks the user's role, and either calls `next()` or responds with `401`/`403`.

```typescript
import { requireAdmin } from "@repo/auth/middleware"

app.post("/rooms", requireAdmin, roomsController.create)
app.get("/rooms", requireAdmin, roomsController.list)
app.delete("/rooms/:id", requireAdmin, roomsController.delete)
```

On success, the middleware attaches two properties to the request:

- `req.platformUser` — the authenticated user object (includes `id`, `email`, `name`, `role`)
- `req.platformSession` — the session object (includes `id`, `token`, `expiresAt`)

### Server-side API

The `auth` instance exposes a server-side API for operations that bypass HTTP (useful in scripts, seed commands, or server-side logic):

```typescript
import { auth } from "@repo/auth/server"

// Create a user (bypasses invite-only gate)
const result = await auth.api.signUpEmail({
  body: { email: "admin@example.com", password: "password", name: "Admin" },
})

// Promote to admin
await auth.api.setRole({
  body: { userId: result.user.id, role: "admin" },
})

// Look up a session
const session = await auth.api.getSession({
  headers: fromNodeHeaders(req.headers),
})
```

## Client Usage (React)

### Session hook

```tsx
import { authClient } from "@repo/auth/client"

function AdminPage() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) return <Spinner />
  if (!session) return <Redirect to="/login" />

  return <p>Welcome, {session.user.name}</p>
}
```

### Sign in

```typescript
import { authClient } from "@repo/auth/client"

// Email/password
await authClient.signIn.email({ email, password })

// Google OAuth
await authClient.signIn.social({ provider: "google", callbackURL: "/admin" })
```

### Sign up (invite-gated)

All registration requires a valid invite code. Without one, sign-up is blocked.

```typescript
// Email/password with invite code
await authClient.signUp.email({ email, password, name, inviteCode })

// Google OAuth with invite code (register only — use `setInviteCodeCookieForOAuth` in production when API is on another subdomain)
import { setInviteCodeCookieForOAuth } from "@repo/auth/client"
setInviteCodeCookieForOAuth(inviteCode)
await authClient.signIn.social({
  provider: "google",
  callbackURL: `${window.location.origin}/admin`,
  requestSignUp: true,
})
```

### Sign out

```typescript
await authClient.signOut()
```

### Invitation management (admin only)

```typescript
// Create an invitation
const { data } = await authClient.inviteOnly.createInvitation({ email: "new@example.com" })
// data.code contains the invite code — build the URL: /register?invite=CODE

// Validate a code (public, no auth required)
const { data } = await authClient.inviteOnly.validateInviteCode({ code })
// data.valid === true | false

// List all invitations
const { data } = await authClient.inviteOnly.listInvitations({})

// Revoke an invitation
await authClient.inviteOnly.revokeInvitation({ id: invitationId })
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (used by `@repo/db`) |
| `BETTER_AUTH_SECRET` | Yes | Secret for session encryption (min 32 chars) |
| `GOOGLE_CLIENT_ID` | For Google OAuth | Google Cloud Console OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | For Google OAuth | Google Cloud Console OAuth client secret |

Google OAuth redirect URIs:

- Local: `http://127.0.0.1:3000/api/auth/callback/google`
- Production: `https://api.listeningroom.club/api/auth/callback/google`

### Google signup vs login (invite-gated)

- **Register** (`/register`): call `signIn.social` with `requestSignUp: true` and set the invite cookie (`ba-invite-code`) before redirect so the API can require a valid pending invitation for **new** Google accounts only.
- **Login** (`/login`): call `signIn.social` **without** `requestSignUp`. Implicit Google signup is disabled in auth config, so existing users can sign in even if the original invitation row was deleted or already consumed.
- **Production** with the API on a different subdomain than the web app: set `VITE_AUTH_COOKIE_DOMAIN` on the **web** build (e.g. `.listeningroom.club`) so the invite cookie is sent to the API on the OAuth callback. Keep `APP_URL` as the web origin and `API_URL` / `ENVIRONMENT=production` on the API so Better Auth’s `baseURL` matches the callback host (see server env helpers in `packages/auth/src/server.ts`).
- **Email/password** registration and sign-in stay gated by the invite-only plugin on `/sign-up/email` and are unchanged.

## Auth Architecture

This package implements the **platform auth** layer. It coexists with, but does not replace, the existing **room auth** layer:

| Concern | Layer | Technology |
|---------|-------|------------|
| Admin login, room CRUD, invite management | Platform auth (`@repo/auth`) | Better-Auth + PostgreSQL |
| Guest identity, room join, Socket.IO `LOGIN` | Room auth (unchanged) | Express sessions + Redis |
| Spotify/Tidal playback credentials | Service OAuth (unchanged) | Adapter packages + Redis |

The `requireAdmin` middleware only applies to HTTP routes. Socket.IO handlers and guest login flows are completely unaffected.

## Plugins

- **`admin`** (`better-auth/plugins`) — adds `role` field to users (`"user"` or `"admin"`), provides `setRole` API
- **`inviteOnly`** (`better-auth-invitation-only`) — gates email signup and invitation APIs; OAuth callback invite checks are implemented in `oauthSignupInviteHooks.ts` so returning Google users are not blocked by consumed or deleted invitations

## Testing

Integration tests use an in-memory SQLite database (via `better-sqlite3` and `drizzle-orm/better-sqlite3`) so they run without a PostgreSQL instance.

```bash
npm test          # run all tests
npm run test:watch  # watch mode
```

See also: [ADR 0016](../../docs/adrs/0016-better-auth-with-drizzle-for-platform-authentication.md)
