# 0009. SCREAMING_SNAKE_CASE for Socket Wire Protocol

**Date:** 2025-01-01
**Status:** Accepted

## Context

The codebase uses XState state machines extensively on the frontend, and XState conventions use `SCREAMING_SNAKE_CASE` for event names (e.g., `TRACK_CHANGED`, `USER_JOINED`). Initially, Socket.IO events used `camelCase` (e.g., `trackChanged`), which created mental context-switching friction for developers working across the socket layer and XState machines.

## Decision

Adopt **`SCREAMING_SNAKE_CASE`** as the wire format for Socket.IO events, aligning with XState's event naming convention.

- **Socket.IO wire protocol**: Events sent between server and client use `SCREAMING_SNAKE_CASE` (e.g., `TRACK_CHANGED`, `USER_JOINED`, `QUEUE_UPDATED`).
- **SystemEvents / Redis channels**: Use `SYSTEM:SCREAMING_SNAKE_CASE` (e.g., `SYSTEM:TRACK_CHANGED`).
- **Plugin internal events**: Plugins register handlers using the same `SCREAMING_SNAKE_CASE` names in `this.on()`.
- **Event type definitions**: Centralized in `packages/types/SystemEventTypes.ts`.

## Consequences

- **Consistency**: A `TRACK_CHANGED` event looks the same whether it's an XState event, a Socket.IO message, a Redis pub/sub channel, or a plugin handler registration.
- **Reduced context-switching**: Developers no longer need to mentally translate between `trackChanged` (socket) and `TRACK_CHANGED` (XState).
- **Grep-friendly**: Searching for `TRACK_CHANGED` finds all references across the entire stack.
- **Trade-off**: Deviates from typical JavaScript/Socket.IO convention of `camelCase` events, which may surprise new contributors unfamiliar with this codebase.
