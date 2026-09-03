# 0091. Round Robin DJ Plugin

**Date:** 2026-08-03
**Status:** Partially superseded by [0101](0101-queue-add-undo-and-round-robin-turn-restore.md)

## Context

Deputy DJ rooms need fair turn-taking when multiple deputies can queue. Client-side `useCanAddToQueue` only hides UI; the server does not enforce whose turn it is. Metadata source grants ([ADR 0088](0088-metadata-source-access-grants.md)) unlock restricted bridge sources but are not a general queue gate. Personas ([ADR 0057](0057-user-personas-system.md)) remain display labels in core.

Individual deputize/undepetize previously emitted only socket `START/END_DEPUTY_DJ_SESSION` plus `USER_JOINED`, which forced plugins to diff listener lists.

## Decision

1. **Plugin package** `@repo/plugin-round-robin-dj` owns round-robin turn state in plugin storage and gates enqueue via `validateQueueRequest`. Room admins always bypass. Restricted metadata access is unlocked for currently eligible deputies via `grantMetadataSourceAccess` (same eligibility helper).

2. **Modes:** `sequential` (discover order from first-round queue sequence, then enforce turns) and `nonSequential` (FCFS within each round). Config `autoAdvanceRounds` (default true) plus Quick Access action `advanceRound` ([ADR 0074](0074-quick-access-admin-panels.md)).

3. **Early selection (sequential):** optional `deferOutOfTurnQueues`. After order is locked, out-of-turn deputies may select one track that is held in plugin storage and auto-enqueued on their turn via `deferQueueRequest` / `SONG_QUEUE_HELD`. During open discovery (first round), a deputy who already queued may hold a second track for the next round (same hold/flush path). Robin remains on who may enqueue *now*; metadata grants also cover deputies who may hold. Removing a queued track does not restore a turn in v1.

4. **Robin persona** (`plugin:round-robin-dj:robin`): `assignableByAdmin`, decorates user/chat. Non-exclusive when multiple deputies are eligible; exclusive when a single turn or admin-forced Robin. Enqueue gating keys off turn eligibility; grants use enqueue-or-hold. Admin persona assignment reorders (sequential) or forces exclusive turn (non-sequential).

5. **`DEPUTY_DJ_CHANGED` SystemEvent** `{ roomId, userId, isDeputyDj }` is emitted after successful single toggle (`DJService.deputizeUser`) and once per affected user during segment bulk deputize/dedeputize. Plugins prefer this for roster sync. `DEPUTY_BULK_APPLIED` remains for existing consumers. Join/`deputizeOnJoin` does not emit this event; plugins may still use `USER_JOINED` for rejoin-while-deputy.

6. **Leave** removes the user from the round-robin roster only (core Redis DJ set is unchanged) and clears any held track.

## Consequences

- Fair queueing is server-enforced when the plugin is enabled, alongside optional `queue-hygiene`.
- Bridge rooms with restricted sources can unlock search/queue for the current Robin/eligible set (and early selectors when deferred) without core mapping persona → privilege.
- Clients may still show Add-to-Queue for all deputies; out-of-turn requests reject or hold (`SONG_QUEUE_HELD`) depending on config.
- Extra SystemEvent traffic on bulk deputize (one `DEPUTY_DJ_CHANGED` per user) is acceptable for show-sized rooms.
- `@repo/plugin-round-robin-dj` coalesces per-user `DEPUTY_DJ_CHANGED` (and join-while-deputy via `USER_JOINED`) onto one macrotask for Robin/`QUEUE_STATUS` sync, and reconciles the roster once on `DEPUTY_BULK_APPLIED` so bulk segment activate does not N× persona sync.
- `QueueValidationResult` may be `{ deferred: true }` so plugins can accept a selection without enqueueing.

## See also

- [0006. Plugin system](0006-plugin-system-for-room-features.md)
- [0057. User personas](0057-user-personas-system.md)
- [0088. Metadata source access grants](0088-metadata-source-access-grants.md)
- [0092. Plugin showWhen membership and `addToQueue` area](0092-plugin-showwhen-membership-and-add-to-queue-area.md) — Add to Queue entitlement messages
- [`packages/plugin-round-robin-dj/`](../../packages/plugin-round-robin-dj/)
- [`packages/server/operations/dj/publishDeputyDjChanged.ts`](../../packages/server/operations/dj/publishDeputyDjChanged.ts)
- [0101. Queue-add undo and Round Robin turn restore](0101-queue-add-undo-and-round-robin-turn-restore.md)
- [0151. Round Robin forward-and-back mode](0151-round-robin-forward-and-back-mode.md)
