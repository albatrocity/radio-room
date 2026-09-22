# 0191. Claimed modifier expiry sweep

**Date:** 2026-09-22
**Status:** Accepted

## Context

`GameSessionService.start()` ran an in-process `setInterval` that scanned every
active room for expired modifiers and emitted `GAME_MODIFIER_REMOVED`. With
more than one dyno, each process ran its own ticker, so the same expiry could
emit more than once. The ticker was also the last in-memory piece of an otherwise
Redis-backed game session layer ([ADR 0042](0042-game-sessions-and-inventory.md)).

Poll auto-close ([ADR 0189](0189-poll-closes-at-auto-close.md)) and the durable
plugin scheduler ([ADR 0190](0190-durable-plugin-scheduler.md)) already use a
Redis ZSET plus a shared `claimDueMembers` Lua/`ZREM` claim.

## Decision

1. **Expiry index:** when a timed modifier is applied (including `extend` score
   updates), `ZADD game:modifiers:expiring` with member
   `${roomId}:${sessionId}:${userId}:${modifierId}` and score `endAt`. Manual
   remove, replace, and max-stack eviction `ZREM` the corresponding member.

2. **Shared claim helper:** `claimDueMembers(key, now)` in
   `operations/data/claimDueMembers.ts` is used by polls, plugin schedules, and
   this sweep.

3. **Sweep job:** system job `modifier-expiry-sweep` every second (quiet). It
   claims due members, then calls `GameSessionService.expireClaimedModifier`,
   which persists the pruned state, emits `GAME_MODIFIER_REMOVED` with
   `reason: "expired"` once, and clears any presented-identity grant bound to
   that modifier id.

4. **Lazy prune on read stays:** `getUserState` still drops expired modifiers
   for callers when a sweep has not run yet; it does not emit.

5. **In-process ticker removed:** `GameSessionService.start()` / `stop()` are
   no-ops retained for call-site compatibility.

## Consequences

- Multi-dyno deployments no longer double-emit modifier expiry.
- Expiry survives process restarts via the ZSET (same ~1s precision as polls).
- Orphan ZSET members (session ended before claim) are claimed and skipped
  without emitting.

## See also

- [0042](0042-game-sessions-and-inventory.md) — game sessions (in-process ticker superseded here)
- [0189](0189-poll-closes-at-auto-close.md) — poll `closesAt` auto-close (template)
- [0190](0190-durable-plugin-scheduler.md) — durable plugin scheduler / shared claim
