# 0095. Room Plugin Config Name Index SET

**Date:** 2026-08-04
**Status:** Accepted

## Context

Listing which plugins have stored config for a room previously relied on Redis `KEYS room:{id}:plugins:*:config` during INIT and admin merges. That pattern is O(keyspace) and blocks under load. Config itself remains split across public/private keys per [ADR 0068](0068-private-scoped-plugin-config-fields.md).

## Decision

- Maintain a Redis **SET** at `room:{id}:plugins:index` whose members are plugin names with stored config for that room.
- Seed the SET with a non-plugin sentinel member `__index_ready__` so an empty-but-migrated room is distinguishable from a never-migrated key. Read paths use Redis `EXISTS` (not “non-empty SMEMBERS”) to decide whether migration is needed.
- **Write paths** (`setPluginConfig` and related, including private-scoped writes) add/remove names via `SADD` / `SREM` when config is written or cleared.
- **Read paths** (`listPluginNames`, merged config fetches) prefer `SMEMBERS` on the index and filter out the sentinel.
- Missing index (key does not exist) may still use a one-time `KEYS` migration fallback to discover names and seed the SET; steady-state traffic should not depend on `KEYS`.

## Consequences

- INIT and admin config listing avoid scanning the Redis keyspace once the index key exists.
- Index maintenance is part of the config write contract — forgetting `SADD`/`SREM` causes stale discovery until migration fallback runs.
- Complements [ADR 0068](0068-private-scoped-plugin-config-fields.md); does not change public vs private field splitting.

## See also

- [0003](0003-redis-for-ephemeral-room-data.md) — Redis for room data
- [0068](0068-private-scoped-plugin-config-fields.md) — public/private config keys
- `packages/server/operations/data/pluginConfigs.ts`
