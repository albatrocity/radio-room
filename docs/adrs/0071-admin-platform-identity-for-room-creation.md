# 0071. Admin Platform Identity for Room Creation

**Date:** 2026-07-20
**Status:** Accepted

## Context

Room creation historically required Spotify OAuth in addition to Better Auth `requireAdmin` ([ADR 0016](0016-better-auth-with-drizzle-for-platform-authentication.md)). The create wizard redirected to Spotify, stored tokens, and issued a short-lived Redis challenge. `POST /rooms` verified that challenge and set `room.creator` to the Spotify-derived Listening Room `userId`.

That made sense when Spotify was the ticket to host a multi-user room. The product is now a single broadcast operated by invite-only platform admins. Spotify outages (or missing Premium credentials) blocked creating a room for audience chat and Shoutcast/live playback even though those room types do not need Spotify to exist.

[ADR 0016](0016-better-auth-with-drizzle-for-platform-authentication.md) already gates HTTP room CRUD with Better Auth and keeps Spotify/Tidal OAuth as streaming credentials, not platform identity. In practice the create path still used Spotify as a second identity gate and as the source of `room.creator`.

## Decision

- Only Better Auth users with `role: "admin"` may create, list, or delete rooms (`requireAdmin` on `POST /rooms`, `GET /rooms/`, `DELETE /rooms/:id`).
- `room.creator` is the Better Auth platform user ID of the admin who created the room (`req.platformUser.id`), not a Spotify user ID.
- Spotify and Tidal OAuth remain optional **post-create** service linking ([ADR 0012](0012-server-side-oauth-no-client-tokens.md)). Tokens are stored under `room.creator` so playback and metadata adapters continue to look up credentials for the room creator.
- HTTP list and delete authorize against `platformUser.id` (match on `room.creator`), not the Express session Spotify/`userId` from OAuth.
- Socket.IO room admin is unchanged: `userId === room.creator` (or designated Redis room admins). After create, the client persists `room.creator` as its Listening Room `userId` so the creating admin receives in-room admin via the existing check — Socket.IO does not call Better Auth.

This partially supersedes [ADR 0016](0016-better-auth-with-drizzle-for-platform-authentication.md): platform identity may appear as `room.creator`, and Spotify OAuth is no longer part of room creation. Guest join, passwords, and designated room admins remain Redis/Socket.IO concerns.

## Consequences

- Admins can create radio/live (and jukebox) rooms during a Spotify outage; jukebox playback still needs a later Spotify link when required.
- Creator, list/delete, in-room admin, and service-token lookup share one durable ID (the platform user ID).
- Historical rooms whose `creator` is a Spotify ID are not migrated; operators manage them via designated room admins or leave them as-is.
- Trade-off: `room.creator` is no longer a pure ephemeral guest id for new rooms — it is a platform user id used as the room-layer creator key. The two-layer model remains for guests and Socket.IO auth.

## See also

- [ADR 0012](0012-server-side-oauth-no-client-tokens.md) — server-side streaming OAuth
- [ADR 0016](0016-better-auth-with-drizzle-for-platform-authentication.md) — Better Auth platform layer (partially superseded here)
- [ADR 0058](0058-client-session-localstorage.md) — client persistence of Listening Room `userId`
