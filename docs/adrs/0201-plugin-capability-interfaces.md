# 0201. Plugin capability interfaces

**Date:** 2026-10-14
**Status:** Accepted

## Context

`PluginAPI` accumulated polls, durable schedules, queue reads and writes, playback transport, and catalog search on one interface. A plugin that opens a poll, and every test mock of that plugin, was typed as the whole host. `PluginContext` already keeps storage, game sessions, inventory, artifacts, and personas on their own fields. Those callers compile against the methods they use.

Splitting the remaining domains with a TypeScript `extends` on `PluginAPI` would not help: a value typed as the extended interface is still the whole surface.

Plugins stay in-process ([ADR 0006](0006-plugin-system-for-room-features.md)). Domain events stay emitted from operations ([ADR 0014](0014-emit-domain-events-from-operations-only.md)).

## Decision

Hang each domain on `PluginContext` as its own interface. `PluginRegistry` constructs the implementation with the same plugin name and room id as the scoped `PluginAPI`.

- `context.polls` — `PollsPluginAPI`
- `context.schedule` — `SchedulePluginAPI`. `BasePlugin.schedule` / `cancelSchedule` call this field.
- `context.queue` — `QueuePluginAPI` (reads and writes together; a second read-only type would still be combined by every writer)
- `context.playback` — `PlaybackPluginAPI`
- `context.catalog` — `CatalogPluginAPI`

`context.api` remains the residual host: chat, presence, sound and screen effects, config, and `emit`.

An unscoped capability fails closed the same way the old methods did (no placeholder plugin name on polls, schedules, pins, or queue splits).

## Consequences

- Plugin code and mocks name the domain they use.
- Item Shops touches several fields. Each call site is one field.
- Chat and presence stay on `PluginAPI` until a later split. They are used widely and are not one domain.
- Partially supersedes the "exposed on `PluginAPI`" clauses of [0152](0152-plugin-authored-core-polls.md) (point 6), [0153](0153-plugin-authored-queue-split.md), [0069](0069-playback-controller-volume-and-before-play-hook.md), [0088](0088-metadata-source-access-grants.md), [0178](0178-media-bridge-tts-say-output.md) (point 4), [0190](0190-durable-plugin-scheduler.md) (point 3), [0196](0196-plugin-playback-timeline.md), and [0197](0197-plugin-catalog-search.md). Behavior of those operations is unchanged.

## See also

- [0006. Plugin system for room features](0006-plugin-system-for-room-features.md)
- [0052. Global artifacts API](0052-global-artifacts-api.md) — the earlier `context.<capability>` shape
