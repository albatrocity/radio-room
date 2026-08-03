# 0091. Round Robin DJ Plugin

**Date:** 2026-08-03
**Status:** Accepted

## Context

Deputy DJ rooms need fair turn-taking when multiple deputies can queue. Client-side `useCanAddToQueue` only hides UI; the server does not enforce whose turn it is. Metadata source grants ([ADR 0088](0088-metadata-source-access-grants.md)) unlock restricted bridge sources but are not a general queue gate. Personas ([ADR 0057](0057-user-personas-system.md)) remain display labels in core.

Individual deputize/undepetize previously emitted only socket `START/END_DEPUTY_DJ_SESSION` plus `USER_JOINED`, which forced plugins to diff listener lists.

## Decision

1. **Plugin package** `@repo/plugin-round-robin-dj` owns round-robin turn state in plugin storage and gates enqueue via `validateQueueRequest`. Room admins always bypass. Restricted metadata access is unlocked for currently eligible deputies via `grantMetadataSourceAccess` (same eligibility helper).

2. **Modes:** `sequential` (discover order from first-round queue sequence, then enforce turns) and `nonSequential` (FCFS within each round). Config `autoAdvanceRounds` (default true) plus Quick Access action `advanceRound` ([ADR 0074](0074-quick-access-admin-panels.md)).

3. **Robin persona** (`plugin:round-robin-dj:robin`): `assignableByAdmin`, decorates user/chat. Non-exclusive when multiple deputies are eligible; exclusive when a single turn or admin-forced Robin. Grants and validation key off eligibility storage, not persona membership alone. Admin persona assignment reorders (sequential) or forces exclusive turn (non-sequential).

4. **`DEPUTY_DJ_CHANGED` SystemEvent** `{ roomId, userId, isDeputyDj }` is emitted after successful single toggle (`DJService.deputizeUser`) and once per affected user during segment bulk deputize/dedeputize. Plugins prefer this for roster sync. `DEPUTY_BULK_APPLIED` remains for existing consumers. Join/`deputizeOnJoin` does not emit this event; plugins may still use `USER_JOINED` for rejoin-while-deputy.

5. **Leave** removes the user from the round-robin roster only (core Redis DJ set is unchanged).

## Consequences

- Fair queueing is server-enforced when the plugin is enabled, alongside optional `queue-hygiene`.
- Bridge rooms with restricted sources can unlock search/queue for the current Robin/eligible set without core mapping persona → privilege.
- Clients may still show Add-to-Queue for all deputies; out-of-turn requests get a rejection reason toast until a future UI hint.
- Extra SystemEvent traffic on bulk deputize (one `DEPUTY_DJ_CHANGED` per user) is acceptable for show-sized rooms.

## See also

- [0006. Plugin system](0006-plugin-system-for-room-features.md)
- [0057. User personas](0057-user-personas-system.md)
- [0088. Metadata source access grants](0088-metadata-source-access-grants.md)
- [`packages/plugin-round-robin-dj/`](../../packages/plugin-round-robin-dj/)
- [`packages/server/operations/dj/publishDeputyDjChanged.ts`](../../packages/server/operations/dj/publishDeputyDjChanged.ts)
