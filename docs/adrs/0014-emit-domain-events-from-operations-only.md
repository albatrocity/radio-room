# 0014. Emit Domain Events from Operations Only

**Date:** 2025-01-01
**Status:** Accepted

## Context

The server codebase has a layered architecture: **Handlers** (Socket.IO transport) → **Operations** (business logic) → **Services** (external integrations and data access). SystemEvents need to be emitted when domain state changes occur, but the question is: which layer should trigger `systemEvents.emit()`?

Emitting from handlers couples transport to side effects. Emitting from services scatters event triggers across data access code. Emitting from multiple layers risks duplicate events or missed events.

## Decision

**SystemEvents are emitted exclusively from the `operations/` layer**, after successful business logic execution.

- **Handlers** are responsible for transport concerns only: receiving socket events, calling operations, and returning responses.
- **Operations** contain business logic and are the single place where `context.systemEvents.emit(roomId, "EVENT_NAME", data)` is called.
- **Services** handle external API calls and data access without triggering domain events.

A centralized `emitPluginEvent` helper was introduced to standardize the emit call pattern, making all event emissions discoverable via grep.

## Consequences

- **Single responsibility per layer**: Handlers handle transport, operations handle business logic and events, services handle data.
- **Discoverability**: Searching for `systemEvents.emit` or `emitPluginEvent` in `operations/` reveals all event trigger points.
- **Testability**: Operations can be tested with a mock `systemEvents` to verify correct events are emitted for given inputs.
- **Reusable operations**: The same operation can be called from different transports (Socket.IO, REST, cron jobs) and events will be emitted consistently.
- **Trade-off**: Requires discipline to avoid the convenience of emitting directly from handlers, especially for simple pass-through cases.

See also: [work-history/plugin-event-architecture.md](../../work-history/plugin-event-architecture.md)
