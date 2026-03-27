# 0008. SystemEvents and Broadcaster Pattern

**Date:** 2025-01-01
**Status:** Accepted

## Context

Before this pattern was adopted, server-side event emission was tightly coupled to Socket.IO. Operations would directly emit to Socket.IO rooms, which mixed concerns (business logic with transport), made it hard to extend (e.g., adding a lobby view that shows a subset of events), and provided no filtering or fan-out to other consumers like plugins.

The system needed a unified way to say "something happened in this room" and let multiple independent consumers react.

## Decision

Introduce a **`SystemEvents`** class (`packages/server/lib/SystemEvents.ts`) that provides a single `emit(roomId, event, data)` method. This one call fans out to three consumers:

1. **Redis Pub/Sub**: Publishes to `SYSTEM:{EVENT_NAME}` channels for cross-instance distribution.
2. **PluginRegistry**: Delivers events to all plugins registered for the room (in-process).
3. **BroadcasterRegistry**: Routes events to Socket.IO channels via registered `Broadcaster` instances.

**Broadcasters** (`packages/server/lib/broadcasters/`) decouple "what happened" from "who receives it":

- **`RoomBroadcaster`**: Sends all events to the room's Socket.IO channel as `{ type: event, data }`.
- **`LobbyBroadcaster`**: Filters to a subset of events (`TRACK_CHANGED`, `USER_JOINED`, `USER_LEFT`) and emits `LOBBY_ROOM_UPDATE` to the lobby channel.

Error isolation: if any single consumer (broadcaster, plugin, or Redis publish) throws, the error is logged but other consumers still receive the event.

Event types are defined centrally in `packages/types/SystemEventTypes.ts` using `SCREAMING_SNAKE_CASE`.

## Consequences

- **Single emit, multiple consumers**: Adding a new consumer (e.g., analytics, webhooks) means registering a new broadcaster or subscriber, not modifying existing code.
- **Clean separation**: Operations emit domain events without knowing who listens; broadcasters handle transport routing.
- **Resilient**: One failing consumer cannot block others.
- **Plugin integration**: Plugins receive the same events as Socket.IO clients, through the same mechanism.
- **Trade-off**: Indirection makes it harder to trace "who receives this event" without reading the broadcaster/plugin registrations.
- **Trade-off**: All events go through a single choke point; if `emit` itself has issues, all consumers are affected.

See also: [docs/BACKEND_DEVELOPMENT.md](../BACKEND_DEVELOPMENT.md)
