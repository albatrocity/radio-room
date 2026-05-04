# 0041. App-controlled queue reorder authorization and UX

**Date:** 2026-05-03  
**Status:** Accepted (amended: admin-only reorder)

## Context

App-controlled playback ([ADR 0040](0040-app-controlled-playback-and-ordered-queue.md)) stores queue order in Redis. Clients need a safe way to reorder without trusting arbitrary payloads. Reorder is a **privilege**: only people who can change room operation should change queue order; ordinary listeners add tracks but do not reorder for now.

When the advance job starts the next track before Shoutcast metadata reflects it, the popped item can disappear from the queue list briefly. That gap harms trust in the UI.

## Decision

1. **Socket contract:** Clients emit `REORDER_QUEUE` with `{ orderedKeys: string[] }` where each key is the canonical queue member id (`mediaSource.type` + `mediaSource.trackId`, via `canonicalQueueTrackKey`). The server rejects requests that are not an exact permutation of the current Redis-backed queue (same multiset of keys).

2. **Authorization:** Only **room admins** (room creator or members of `room:{id}:admins`, via `isRoomAdmin`) may reorder when playback is app-controlled. **Non-admin users cannot reorder**; there is no per-room “listeners may reorder” flag and no plugin hook for this at present.

3. **Domain events:** After a successful reorder, `QUEUE_CHANGED` is emitted via `SystemEvents` from the service layer after `setQueue`, consistent with [ADR 0014](0014-emit-domain-events-from-operations-only.md).

4. **Client capability:** The web app treats **room admin** (`isAdmin` on the session user from login, which reflects `isRoomAdmin` on the server) as the signal for showing drag-and-drop. It does not rely on a separate init-only reorder flag.

5. **INIT / dispatched track:** For app-controlled rooms, init may include a **dispatched track** snapshot when present so reconnects mid-metadata-gap still show the track as the first row in the queue list.

6. **Client UX:** The list shows **dispatched** tracks as leading rows using the same row styling as queued tracks—no separate section title or “dispatched” label. Those rows are **not** draggable; only Redis-backed rows participate in sortable reorder for admins.

7. **Virtualization:** When reorder is enabled, the queue list uses a non-virtualized render inside the scroll area (MVP); deep queues may revisit virtualized + DnD later.

## Consequences

- Clear server-side validation prevents spoofed or stale reorder payloads.
- Simple authorization model: reorder matches who can manage the room’s queue operationally.
- If listener or plugin-mediated reorder is needed later, it should be reintroduced deliberately (settings + server checks + UX).
