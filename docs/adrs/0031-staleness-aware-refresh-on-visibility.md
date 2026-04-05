# 0031. Staleness-Aware Refresh on Tab Visibility

**Date:** 2026-04-05
**Status:** Accepted

## Context

The web client maintains room state across many XState actors (chat, playlist, users, reactions, DJ, audio, settings, queue, plugin configs). When a user backgrounds the tab and the Socket.IO connection stays alive, the existing `handleVisibilityChange` handler only performs an incremental sync: an HTTP room fetch and a `GET_LATEST_ROOM_DATA` socket event that returns messages and playlist items since the last known timestamps.

This incremental sync does not refresh the users list, reactions, DJ state, audio/now-playing metadata, queue, or plugin configs. After a long absence (e.g., 30 minutes on mobile, hours on desktop), users return to stale data in those domains.

When the socket actually disconnects and reconnects, the auth machine already re-sends `LOGIN` with `fetchAllData: true`, which triggers a full `INIT` payload that refreshes every actor. The gap is exclusively in the "socket stayed connected but tab was backgrounded" path.

## Decision

Track the timestamp when the tab was last visible. When the tab returns to the foreground:

- **If the absence exceeds a threshold (5 minutes):** send a `FORCE_REFRESH` event to the auth machine, which resets the `initialized` flag and transitions through `retrieving` → `connecting`, re-sending `LOGIN` with `fetchAllData: true`. The server responds with a full `INIT` payload that every subscribed actor already handles.
- **If the absence is below the threshold:** keep the existing incremental sync (`fetchRoom` + `GET_LATEST_ROOM_DATA`).

This avoids inventing a new server-side refresh protocol; it re-uses the battle-tested `LOGIN` → `INIT` path. It also avoids `teardownRoom` + `initializeRoom`, which would emit `USER_LEFT` / `USER_JOINED` system events visible to other users.

## Consequences

- Users returning after a long absence see fresh data for all domains, not just messages and playlist.
- The 5-minute threshold is a module-level constant (`STALE_THRESHOLD_MS`) that can be tuned without architectural changes.
- The `FORCE_REFRESH` event is only handled in the `authenticated` state, so it cannot interfere with in-progress reconnection flows.
- A full `LOGIN` is slightly heavier than an incremental sync, but this only fires after extended absences where data freshness is more important than bandwidth.
- No server-side changes are required; the existing `LOGIN` handler with `fetchAllData` already supports this flow.
