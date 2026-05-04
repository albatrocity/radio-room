---
name: Queue DnD reorder
overview: Add app-controlled queue reordering via the same @dnd-kit stack as the scheduler, a new authenticated Socket.IO mutation backed by existing `setQueue` Redis logic, server-side authorization (admins/creators always; listeners gated by room flag + optional plugin hook), INIT/session wiring so the UI can show handles only when allowed, touch-friendly sensors for mobile, and render dispatched-but-not-yet-on-air tracks as the first row(s) in the same queue list (visually identical to the rest; no user-facing “dispatched” concept) so nothing disappears during the Shoutcast delay.
todos:
  - id: server-reorder
    content: Add REORDER_QUEUE socket, DJService.reorderQueue + setQueue + QUEUE_CHANGED; permutation validation; auth (isRoomAdmin | room.allowListenerQueueReorder | PluginRegistry hook)
    status: completed
  - id: room-flag-types
    content: Add Room.allowListenerQueueReorder + Redis persistence + SET_ROOM_SETTINGS plumbing
    status: pending
  - id: plugin-hook
    content: Optional Plugin.canReorderQueue + PluginRegistry aggregate (fail-closed)
    status: pending
  - id: init-can-reorder
    content: Compute canReorderQueue in AuthService initData.user
    status: pending
  - id: dispatched-ui-actor
    content: Extend queue list actor (or sibling) for dispatchedTrack; INIT hydration + TRACK_DISPATCHED + clear on TRACK_CHANGED key match; QueuedTracksSection — prepend dispatched row(s) with same styling as queue rows, no DnD (no separate section label)
    status: pending
  - id: init-dispatched
    content: AuthService initData include dispatchedTrack from getDispatchedTrack for app-controlled rooms (reconnect mid-gap)
    status: pending
  - id: web-dnd
    content: "apps/web: add @dnd-kit deps; useCanReorderQueue; QueuedTracksSection + PlaylistItem handle + DragOverlay; emit REORDER_QUEUE; mobile sensors"
    status: pending
  - id: tests-adr
    content: Server tests + ADR + optional Admin UI toggle for allowListenerQueueReorder
    status: pending
isProject: false
---

# Drag-and-drop queue reorder (app-controlled)

## Context

- [ADR 0040](docs/adrs/0040-app-controlled-playback-and-ordered-queue.md) already stores order in a Redis ZSET; [`setQueue`](packages/server/operations/data/djs.ts) rewrites scores + blobs atomically for a given ordered `QueueItem[]`.
- The web queue UI is [`QueuedTracksSection.tsx`](apps/web/src/components/QueuedTracksSection.tsx): `@tanstack/react-virtual` inside Chakra `ScrollArea` — **virtualized lists and DnD need an explicit strategy** (see below).
- The scheduler’s pattern to mirror: [`@dnd-kit/react`](https://github.com/clauderic/dnd-kit) + [`@dnd-kit/helpers`](apps/scheduler/package.json) `move()` — e.g. [`$showId.publish.playlist.tsx`](apps/scheduler/src/routes/shows/$showId.publish.playlist.tsx) and [`PlaylistTrackRow.tsx`](apps/scheduler/src/components/tracks/PlaylistTrackRow.tsx) (`useSortable`, `DragOverlay`).

### Dispatched vs queue vs Now Playing (ADR 0040 gap)

- When app-controlled playback advances, the next item is **popped from Redis**, stored under [`dispatched_track`](packages/server/operations/data/djs.ts), and started on Spotify; [**`TRACK_DISPATCHED`**](packages/types/SystemEventTypes.ts) is emitted (e.g. from [`DJService.playQueuedTrack`](packages/server/services/DJService.ts) after pop).
- Clients already receive **all** system events on the room channel as `{ type, data }` via [`RoomBroadcaster`](packages/server/lib/broadcasters/RoomBroadcaster.ts); [`queueListMachine`](apps/web/src/machines/queueListMachine.ts) today only handles **`INIT`** and **`QUEUE_CHANGED`**, so **`TRACK_DISPATCHED` is ignored** and the row vanishes until Shoutcast metadata catches up and [`TRACK_CHANGED`](packages/server/operations/room/handleRoomNowPlayingData.ts) fires (after [`clearDispatchedTrack`](packages/server/operations/data/djs.ts)).
- **Product fix**: still show the track in the queue list as the **first row(s)** (before Redis-backed items), using the **same** row component and visual treatment as the rest of the queue—**no** section title, badge, or other copy that reveals “dispatched” vs “queued.” The only intentional difference: those rows are **not** in the sortable context (no reorder). End users should not be introduced to a second category of track in the UI.

## Backend

**1. Socket event and handler**

- Register e.g. `REORDER_QUEUE` in [`packages/server/controllers/djController.ts`](packages/server/controllers/djController.ts) (alongside `REMOVE_FROM_QUEUE`).
- Implement `DJHandlers.reorderQueue` in [`packages/server/handlers/djHandlersAdapter.ts`](packages/server/handlers/djHandlersAdapter.ts) delegating to `DJService`.

**2. `DJService.reorderQueue(roomId, userId, orderedCanonicalKeys: string[])`** (new method)

- `findRoom`; require [`isAppControlledPlayback(room)`](packages/server/services/DJService.ts) (same guard style as `removeFromQueueDirect`).
- `const current = await getQueue(...)`; build multiset of `canonicalQueueTrackKey(item)` for each item.
- **Validate** payload is a **permutation** of current keys (same length, every key present exactly once). Reject otherwise (prevents spoofing or drift).
- **Authorize**:
  - If [`isRoomAdmin`](packages/server/operations/data/admins.ts) → allow.
  - Else require **listener path**: `room.allowListenerQueueReorder === true` **OR** a new **plugin-registry aggregate** (see below). If neither → `{ success: false, message: ... }`.
- Map keys back to `QueueItem[]` in the requested order; call existing [`setQueue`](packages/server/operations/data/djs.ts); emit **`QUEUE_CHANGED`** via `systemEvents` the same way other queue mutations do (align with [ADR 0014](docs/adrs/0014-emit-domain-events-from-operations-only.md) — keep emission inside the service/operation layer, not ad-hoc in the handler).

**3. Room flag (optional but useful)**

- Add optional `allowListenerQueueReorder?: boolean` to [`Room`](packages/types/Room.ts), [`StoredRoom`](packages/types/Room.ts) bool string mapping, [`packages/server/operations/data/rooms.ts`](packages/server/operations/data/rooms.ts) read/write, [`createRoom`](packages/server/operations/createRoom.ts) default (`false`), and admin save path used by `SET_ROOM_SETTINGS` (same pattern as `allowChatImages`).
- Expose in room payload to the client so the UI can update when settings change without reconnect.

**4. Plugin hook (for “sometimes” / per-plugin logic)**

- Extend [`Plugin`](packages/types/Plugin.ts) with an optional method, e.g. `canReorderQueue?(params: { roomId: string; userId: string; username?: string }): Promise<boolean>`.
- Add `PluginRegistry.userMayReorderQueueFromPlugins(params)` (OR semantics: **any** plugin returning `true` grants listener reorder when combined with room rules). Use a **short timeout** and **fail-closed** on timeout/error for **authorization** (unlike queue validation’s fail-open — reorder is a privilege).

**5. INIT capability**

- In [`AuthService.login`](packages/server/services/AuthService.ts) where `initData` is built, compute `canReorderQueue: boolean` once (same logic as service authorize: admin **or** listener path). Attach to **`initData.user`** (or a dedicated field) so the client does not guess.

**5b. INIT dispatched snapshot (for reconnect)**

- For **app-controlled** rooms, call [`getDispatchedTrack`](packages/server/operations/data/djs.ts) during login and add e.g. **`initData.dispatchedTrack: QueueItem | null`** (or nest under `queue` payload consistently). Ensures users who refresh mid-gap still see the first list row without waiting for the next socket event.

**6. Tests**

- Extend [`packages/server/controllers/djController.test.ts`](packages/server/controllers/djController.test.ts) expectations for the new listener count.
- Add `DJService` / handler tests: forbidden when not app-controlled; non-admin rejected without flag/plugin; happy path permutation.

## Frontend

**1. Dependencies**

- Add to [`apps/web/package.json`](apps/web/package.json): `@dnd-kit/react` and `@dnd-kit/helpers` **same versions as scheduler** (`^0.3.2`).

**2. Auth / hooks**

- Extend [`apps/web/src/types/User.ts`](apps/web/src/types/User.ts) (or auth context only) with optional `canReorderQueue?: boolean` from INIT.
- In [`authMachine`](apps/web/src/machines/authMachine.ts), store `canReorderQueue` from INIT; **do not treat stale localStorage as authoritative** — default false until INIT after reconnect.
- Add [`useCanReorderQueue`](apps/web/src/hooks/useActors.ts) (or similar) implementing:

  `playbackMode === 'app-controlled' && (isAdmin || room.allowListenerQueueReorder || user.canReorderQueueFromServer)`

  where `user.canReorderQueueFromServer` comes from INIT for **plugin-only** grants, and `allowListenerQueueReorder` tracks room settings (from [`settingsMachine`](apps/web/src/machines/settingsMachine.ts) / `roomActor`). Adjust if you prefer a single server-computed flag refreshed only on INIT (simpler but plugin-only UX updates may need a follow-up emit).

**3. Queue UI**

- **Dispatched row(s) (non-DnD):** When `dispatchedTrack != null`, render it **first** in the same vertical list as the Redis queue—same [`PlaylistItem`](apps/web/src/components/PlaylistItem.tsx) styling, separators, and spacing as other rows. **Do not** add headings, badges, or explanatory text. **Exclude** these rows from `DragDropProvider` / `useSortable` so only Redis-backed items reorder.
- **Reorderable list:** Wrap **only** the Redis-backed rows in `DragDropProvider` when `useCanReorderQueue()` is true; use a dedicated sortable `group` id (constant). Structure the DOM so one scroll area can contain the prepended non-sortable row(s) plus the sortable block without visual seams (single unified list appearance).
- Use `useSortable` on each row with **`id` = canonical key** (`${mediaSource.type}:${mediaSource.trackId}` from each [`QueueItem`](packages/types/Queue.ts)), matching server validation — **not** raw `track.id` alone.
- On `onDragEnd`, call `move()` like [`PublishPlaylistPage`](apps/scheduler/src/routes/shows/$showId.publish.playlist.tsx), then `emitToSocket('REORDER_QUEUE', { orderedKeys })` (exact payload name TBD).
- Optional `DragOverlay` using a slim preview (reuse styling ideas from `PlaylistTrackDragPreview` in scheduler) so mobile drags are visible.
- **Drag handle**: a grip/icon column on each [`PlaylistItem`](apps/web/src/components/PlaylistItem.tsx) when `sortable` + `handleRef` — keeps buttons (play/remove) from stealing the gesture (scheduler uses `handleRef` this way).

**3b. Actor / state for dispatched tracks**

- **Extend [`queueListMachine`](apps/web/src/machines/queueListMachine.ts)** (preferred: single queue subscription surface) with:
  - Context: `dispatchedTrack: QueueItem | null`.
  - **`TRACK_DISPATCHED`**: set `dispatchedTrack` from `event.data.track` (payload shape in [`SystemEventTypes`](packages/types/SystemEventTypes.ts)).
  - **`INIT`**: set from `initData.dispatchedTrack` when present.
  - **Clear dispatched** when the stream reports that track as Now Playing: on **`TRACK_CHANGED`**, compare canonical identity (`mediaSource.type` + `mediaSource.trackId` or full [`canonicalQueueTrackKey`](packages/server/operations/data/djs.ts) / client helper mirroring it) to `dispatchedTrack`; if match, set `dispatchedTrack` to `null`. (Server already clears Redis dispatched in [`handleRoomNowPlayingData`](packages/server/operations/room/handleRoomNowPlayingData.ts) when `queueMatchSource === 'dispatched'`; no new server event strictly required if client-side match is reliable.)
- Wire **`roomLifecycle` / auth `INIT`** so `queueListActor` receives dispatched snapshot the same way it receives `queue` today (may require threading `dispatchedTrack` through the existing INIT fan-out from [`authMachine`](apps/web/src/machines/authMachine.ts)).
- **Activation**: keep subscription in the existing ACTIVATE/DEACTIVATE pattern used by `queueListMachine` (already uses [`subscribeById`](apps/web/src/actors/socketActor.ts) on the socket hub — all room `event` types arrive at subscribers).

**Optional hardening:** If metadata latency or edge cases make client-side “clear on TRACK_CHANGED” flaky, add a small **`DISPATCHED_CLEARED`** system event emitted next to `clearDispatchedTrack` (still via operations + SystemEvents per ADR 0014). Treat as follow-up only if needed.

**4. Virtualization vs DnD**

Pick one approach (document in PR):

- **Pragmatic MVP**: when reorder is enabled, **render a non-virtualized list** inside the same scroll container (queue depth is often modest; you already cap visual height). Simplest integration with `@dnd-kit/react` sortable.
- **If long queues matter**: keep virtualization and adopt a virtual+Dnd recipe (TanStack + dnd-kit constraints) in a follow-up.

**5. Mobile**

- Configure sensors explicitly (Pointer + Touch) with `activationConstraint` (e.g. small distance) and/or TouchSensor `delay` so **vertical scroll still works** when not dragging from the handle. Follow [@dnd-kit docs](https://docs.dndkit.com/api-documentation/sensors) for recommended touch patterns.

## Documentation / ADR

- Add a short ADR (next index in [`docs/adrs/index.md`](docs/adrs/index.md)) describing: reorder authorization model (admin vs listener flag vs plugin hook), socket contract, fail-closed plugin semantics, and **client UX**: dispatched tracks folded into the queue list presentation (no user-visible dispatched concept; reorder capability differs only where implemented).

## Out of scope / follow-ups

- Real-time refresh of plugin-only `canReorderQueue` without reconnect (would need a targeted socket event when plugin storage changes eligibility).
- Admin UI toggle for `allowListenerQueueReorder` in [`apps/web/src/components/Modals/Admin`](apps/web/src/components/Modals/Admin) (include if you want the flag usable day one).
