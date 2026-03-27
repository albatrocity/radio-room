# 0015. PostgreSQL for Persistent User Data

**Date:** 2026-03-27
**Status:** Accepted

## Context

All data in the Listening Room is currently stored in Redis. Per [ADR 0003](0003-redis-for-ephemeral-room-data.md), Redis is the right choice for ephemeral room data (queues, users, playback state, chat) because rooms are inherently short-lived. However, the platform now requires persistent user data that must survive Redis restarts and outlive any individual room session:

- **Admin accounts** with email/password or Google OAuth credentials need to persist indefinitely.
- **Sessions** for platform-level authentication must be durable.
- **Invitations** for gated registration need an audit trail.
- Future features (member accounts, scheduling) will also require durable storage.

Redis is not suitable for this data. It is designed for ephemeral, in-memory use. While Redis persistence (RDB/AOF) exists, it is not a substitute for a relational database when data durability and queryability are requirements.

## Decision

Introduce **PostgreSQL** as a second data store, dedicated to persistent user and authentication data. Redis continues to own all ephemeral room-related state.

Responsibilities are split as follows:

| Data | Store | Rationale |
|------|-------|-----------|
| Room state, queues, chat, playback | Redis | Ephemeral, real-time, pub/sub (ADR 0003) |
| Service OAuth tokens (Spotify, Tidal) | Redis | Tied to room lifecycle, refreshed in-memory |
| Express sessions (Socket.IO / room) | Redis | Ephemeral, high-throughput |
| Platform user accounts | PostgreSQL | Must persist across restarts |
| Platform sessions (admin auth) | PostgreSQL | Must persist, tied to user accounts |
| Invitations | PostgreSQL | Audit trail, relational to users |
| Future: member accounts, scheduling | PostgreSQL | Durable, queryable |

Database access is abstracted through **Drizzle ORM** in a shared `@repo/db` package. This allows any monorepo app to import the schema and client without coupling to a specific driver or hosting provider (Neon, Heroku Postgres, local Docker).

## Consequences

- **Durability**: Admin accounts, sessions, and invitations survive Redis restarts and redeployments.
- **Queryability**: SQL enables relational queries (e.g., "list all invitations by a user") without manual index maintenance.
- **Shared schema**: The `@repo/db` package centralizes migrations and schema definitions for all monorepo apps.
- **Trade-off**: Adds operational complexity — a second data store to provision, back up, and monitor.
- **Trade-off**: Developers must reason about which store owns which data. The boundary is clear (persistent user data vs. ephemeral room data) but must be documented.
- **Trade-off**: Local development now requires a PostgreSQL instance (added to `compose.yml`).
