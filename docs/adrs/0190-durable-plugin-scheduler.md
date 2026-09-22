# 0190. Durable plugin scheduler

**Date:** 2026-09-22
**Status:** Accepted

## Context

`BasePlugin.startTimer` is an in-memory `setTimeout`. Process restarts drop every
pending timer; multi-dyno deployments can fire the same callback more than once.
Plugins that need durable deadlines (Kickstarter funding, quiz/lyric auto-advance,
absent-DJ skip, queue pacer, auto-shop, Fed/loyalty ticks, etc.) either re-armed on
`register` (fragile) or lost work after a restart.

Poll auto-close ([ADR 0189](0189-poll-closes-at-auto-close.md)) already proved a
restart-safe, multi-dyno-safe pattern: Redis ZSET + 1s sweep + `ZREM` claim.

## Decision

1. **Redis schedule store:** ZSET `plugin:schedules` (score = `fireAt`, member =
   `${roomId}:${pluginName}:${scheduleId}`) plus hash `plugin:schedules:payload`
   holding `{ kind, payload }`.

2. **Claimed sweep:** system job `plugin-schedule-sweep` every second (quiet).
   Shared `claimDueMembers` Lua/`ZREM` claim (also used by poll auto-close).

3. **PluginAPI:** `schedule({ id, kind, at | durationMs, payload })`,
   `cancelSchedule(id)`, `getSchedule(id)`. Same `id` replaces. Bounds: 1s–7d.

4. **Dispatch:** `PluginRegistry.dispatchScheduled` ensures the room plugin
   instance exists (initializes if needed), skips when `config.enabled === false`,
   then calls `plugin.handleScheduled(kind, payload, scheduleId)`.

5. **BasePlugin:** `onScheduled(kind, handler)`, `schedule` / `cancelSchedule`
   wrappers. `startTimer` remains for short, disposable UI timing only.

## Consequences

- Plugins migrate durable timers to `schedule` + `onScheduled` and drop
  reconcile-on-register re-arming where the ZSET survives restarts.
- ~1s precision matches poll auto-close.
- `startTimer` must not be used for multi-second game/economy deadlines.

## See also

- [0189](0189-poll-closes-at-auto-close.md) — poll `closesAt` auto-close (template)
- [0006](0006-plugin-system-for-room-features.md) — plugin system
