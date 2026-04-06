# 0032. Room Public Visibility Flag

**Date:** 2026-04-06
**Status:** Accepted

## Context

All rooms were unconditionally listed in the public lobby. Admins had no way to create a room that was accessible only via its direct URL -- useful for private sessions, testing, or invite-only events.

## Decision

Add an optional `public` boolean field to the `Room` type (default `true` for backward compatibility with existing rooms).

- **Lobby API (`GET /rooms/all`)** filters out rooms where `public === false` before returning results.
- **LobbyBroadcaster** handles `ROOM_SETTINGS_UPDATED` events. When a room's visibility changes it emits `LOBBY_ROOM_ADDED` (room became public) or `LOBBY_ROOM_REMOVED` (room became private) to the `"lobby"` socket channel so connected lobby clients update in real time.
- **Admin settings** expose the flag as a "List in lobby" checkbox in the Content settings panel.
- **Room creation** exposes the same checkbox in `SharedSettings`, persisted through the OAuth redirect via `sessionStorage`.
- **Redis storage** uses the same `Bool` (`"true"` / `"false"`) string convention as other boolean room fields. `parseRoom` treats a missing value as `true`.

## Consequences

- Existing rooms without the field are treated as public (no migration needed).
- Non-public rooms remain fully functional -- they are accessible at their direct URL, support all features, and appear in the admin room list (`GET /rooms/`).
- Lobby clients receive instant visibility updates via two new socket events (`LOBBY_ROOM_ADDED`, `LOBBY_ROOM_REMOVED`), avoiding the need for polling or full refetch.
