# 0006. Plugin System for Room Features

**Date:** 2025-01-01
**Status:** Accepted

## Context

Rooms in the Listening Room can benefit from a variety of optional features: democratic voting on playlists, special word detection, automatic DJ rotation when a DJ goes absent, queue hygiene rules, and more. Building all of these into the core server would bloat the codebase, couple unrelated features, and make it impossible for room creators to pick only the features they want.

## Decision

Implement a **plugin system** that allows room features to be developed as isolated packages and opted into per room.

Architecture:

- **`BasePlugin`** (`@repo/plugin-base`): Abstract class that all plugins extend. Provides typed event handling, config management, storage, timers, and UI hooks.
- **One instance per room**: `PluginRegistry` maintains a factory per plugin name and creates a new instance for each room that enables it. Instances are cleaned up when rooms are deleted.
- **Event-driven**: Plugins subscribe to system events via `this.on("EVENT_NAME", handler)` with type-safe payloads from `SystemEventPayload<K>`.
- **Zod config schemas**: Each plugin defines a Zod schema for its configuration. This schema is used for validation and to auto-generate admin UI forms.
- **Declarative UI**: Plugins define UI components via `getComponentSchema()` returning JSON descriptors. No React code in plugins; the web client renders components from the schema.
- **Redis-namespaced storage**: Each plugin gets isolated storage at `room:{roomId}:plugins:{pluginName}:storage:{key}`, with pipeline support for batch operations.
- **Plugin events**: Plugins emit events to the frontend via `this.emit(eventName, data)`, namespaced as `PLUGIN:{pluginName}:{eventName}`.
- **Queue validation**: Plugins can validate queue additions. The system uses a **fail-open** policy: only an explicit `rejectQueueRequest()` blocks an enqueue. Errors or timeouts default to allowing the request. First rejection wins across sequential plugins.
- **Augmentation hooks**: Optional `augmentPlaylistBatch()` and `augmentNowPlaying()` let plugins enrich data before it reaches clients.
- **Actions**: Admin-triggered actions via `executeAction()` with type-safe action names.

Current plugins: `playlist-democracy`, `special-words`, `absent-dj`, `queue-hygiene`.

## Consequences

- **Room customization**: Room creators pick exactly the features they want; new plugins can be developed without touching the core.
- **Isolation**: Plugin bugs are contained; `BasePlugin` catches errors in event handlers and timers.
- **Consistent lifecycle**: `cleanup()` handles timer cancellation and storage cleanup automatically.
- **Trade-off**: Declarative UI limits visual complexity; plugins cannot render arbitrary React components.
- **Trade-off**: Sequential queue validation means plugin order can matter; fail-open means a plugin must be explicit about rejections.
- **Trade-off**: Plugin developers must understand the event system and component schema API.
