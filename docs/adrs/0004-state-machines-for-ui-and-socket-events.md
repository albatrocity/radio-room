# 0004. State Machines for UI and Socket Event Handling

**Date:** 2025-01-01
**Status:** Accepted

## Context

The Listening Room web client manages complex, concurrent state across many domains: authentication, room lifecycle, playback, chat, reactions, DJ queue, plugin components, modals, and more. These domains interact with a Socket.IO connection that delivers real-time events, and each domain has its own set of valid states and transitions. Managing this with ad-hoc state variables and effect hooks leads to impossible states, race conditions, and hard-to-trace bugs.

## Decision

Use **XState v5** state machines to manage all complex UI state and websocket event handling.

Key patterns:

- **Singleton actors**: Each domain has an XState actor (`apps/web/src/actors/`) created from a machine definition (`apps/web/src/machines/`). Actors are started once at app initialization and accessed via `useSelector` hooks from `@xstate/react`.
- **`socketActor`**: A central XState actor that owns the Socket.IO connection. All other actors subscribe to socket events through it via `SUBSCRIBE`/`UNSUBSCRIBE` events rather than accessing the socket directly.
- **`ACTIVATE`/`DEACTIVATE` lifecycle**: Room-scoped actors receive `ACTIVATE` (with `roomId`) when entering a room and `DEACTIVATE` when leaving. This provides a clean lifecycle for socket subscriptions, data fetching, and cleanup.
- **Room lifecycle coordination**: `roomLifecycle.ts` orchestrates `ACTIVATE`/`DEACTIVATE` fan-out to ~15 room-scoped actors, handles state persistence/rehydration, and manages visibility change refetching.
- **~35 machines** organized by domain: room/lobby, playback/audio, library/search, social/chat, auth/admin, UI/UX, plugins, and reusable primitives.

## Consequences

- **Impossible states are impossible**: Each machine explicitly defines valid states and transitions, eliminating entire classes of bugs.
- **Visualizable**: XState machines can be visualized with the XState inspector, aiding debugging and onboarding.
- **Testable**: Machines can be tested in isolation without rendering components.
- **Consistent socket handling**: The `socketActor` hub prevents duplicate subscriptions and centralizes connection lifecycle management.
- **Trade-off**: Learning curve for developers unfamiliar with state machines and XState's API.
- **Trade-off**: The volume of machines (~35) requires good naming conventions and documentation to navigate.
- **Convention**: Use `setup()` pattern, event objects (not strings), `guard` (not `cond`), `fromCallback` for side-effect actors.
