# 0016. Better-Auth with Drizzle for Platform Authentication

**Date:** 2026-03-27
**Status:** Accepted

## Context

The platform needs a persistent admin authentication layer. Currently, the only identity mechanism is ephemeral: guests generate a random `userId` on socket connection, and room creators authenticate via Spotify/Tidal OAuth solely to link their streaming service credentials. There is no persistent user account, no email/password login, and no way to gate actions (like room creation) behind a durable identity.

Requirements:

- Admin accounts with email/password and Google OAuth login, not tied to streaming service accounts.
- Invite-only registration (no open signup).
- Admin-gated room creation, listing, and deletion.
- Shared across the monorepo so future apps can reuse the same auth layer.
- Guest room access must remain unchanged — no authentication required to join a room.

Several options were considered:

1. **Third-party auth providers** (Auth0, Clerk, Supabase Auth): Rejected. Adds vendor lock-in, recurring per-user costs, and data is not self-hosted.
2. **Custom auth from scratch**: Rejected. Password hashing, session management, CSRF protection, OAuth flows, and role-based access are well-solved problems. Rolling our own is high-effort and high-risk.
3. **Better-Auth**: Open-source, self-hosted TypeScript auth framework. Built-in email/password, social OAuth, admin plugin with roles, Drizzle ORM adapter. Express integration via `toNodeHandler`.

For the ORM:

1. **No ORM**: Maximum control but high boilerplate for schema management, migrations, and query building.
2. **Prisma**: Established but requires a binary engine (~30MB), code generation step, and has higher cold-start latency.
3. **Drizzle ORM**: SQL-first, no code generation, native TypeScript inference, ~70% smaller bundle, 3x faster queries. Better-Auth provides a first-party Drizzle adapter.

## Decision

Use **Better-Auth** with the **Drizzle ORM adapter** and **PostgreSQL** (per [ADR 0015](0015-postgresql-for-persistent-user-data.md)) for platform-level authentication.

### Two-Layer Auth Architecture

The system maintains two independent authentication layers:

| Layer | Technology | Scope | Persistence |
|-------|-----------|-------|-------------|
| **Platform auth** (new) | Better-Auth + PostgreSQL | Admin login, room CRUD authorization, invite management | Durable |
| **Room auth** (existing) | Express sessions + Redis + Socket.IO | Guest identity, `isCreator`/`isAdminMember` checks, room passwords | Ephemeral |

Platform auth does not leak into room-level concerns. The `isCreator` check (`userId === room.creator`) and designated room-admin logic remain in Redis/Socket.IO. The `requireAdmin` Express middleware gates HTTP routes (`POST /rooms`, `GET /rooms`, `DELETE /rooms/:id`) without touching the Socket.IO `LOGIN` handler.

### Packages

- **`@repo/db`**: Drizzle ORM schema, client, and migrations. Shared across the monorepo.
- **`@repo/auth`**: Better-Auth server instance, admin plugin, `better-auth-invitation-only` plugin, `requireAdmin` middleware, and React client. Depends on `@repo/db`.

### Plugins

- **Admin plugin** (`better-auth/plugins`): Adds `role` field to users (`"admin"` or `"user"`), provides `setRole` API.
- **Invite-only plugin** (`better-auth-invitation-only`): Gates all registration (email/password and Google OAuth) behind admin-issued invite codes. Codes are SHA-256 hashed, auto-consumed on signup, with expiration and revocation support.

### Streaming Service OAuth

Spotify and Tidal OAuth (per [ADR 0012](0012-server-side-oauth-no-client-tokens.md)) remains completely separate. These flows link streaming service credentials to a room creator for playback and metadata operations. They are not used for platform identity.

## Consequences

- **Self-hosted auth**: No vendor dependency, no per-user costs. All data in our PostgreSQL instance.
- **Invite-only registration**: The platform is closed by default. Admins control who can register.
- **Shared auth package**: Future monorepo apps import `@repo/auth` and share sessions on the same TLD.
- **Guest access preserved**: The Socket.IO `LOGIN` flow and room-level admin checks are completely untouched.
- **Trade-off**: Two session systems coexist (Better-Auth sessions in PostgreSQL, Express sessions in Redis). Developers must understand which applies where.
- **Trade-off**: Dependency on `better-auth` and `better-auth-invitation-only` — both are open-source but relatively young projects.
- **Trade-off**: Drizzle ORM is newer than Prisma with a smaller ecosystem, though it is rapidly growing and has strong TypeScript integration.
