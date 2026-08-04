# 0093. Client Socket Event Allowlists and Shared Plugin Component Actors

**Date:** 2026-08-04
**Status:** Accepted

## Context

Under busy rooms, two client hotspots wasted main-thread work:

1. `socketActor` broadcast every `SERVER_EVENT` to every subscriber. Machines that only handle a handful of events still received chat, reactions, etc., and ran XState transitions that no-oped.
2. `PluginArea` mounted `PluginComponentProvider` → `useMachine(pluginComponentMachine)` once per row (listeners, playlist items). Each instance fetched component state and subscribed to the socket hub.

ADR [0004](0004-state-machines-for-ui-and-socket-events.md) already requires the `socketActor` hub and singleton room actors; these choices refine that pattern for scale without changing the wire protocol.

## Decision

- **`subscribeById` optional `eventTypes`**: Subscribers may pass an allowlist of SERVER_EVENT type strings. `broadcastToSubscribers` skips non-matching events. Omitting `eventTypes` keeps unfiltered delivery (back-compat). `SOCKET_ONLINE` / `SOCKET_OFFLINE` / `SOCKET_RECONNECTING` always fan out via dedicated lifecycle broadcast helpers.
- **One `pluginComponentMachine` per `pluginName` per room**: `pluginComponentRegistry` creates/shares actors; `PluginComponentsRoomProvider` sets `roomId`, hosts modals once, and `teardownRoom` resets the registry. `PluginArea` rows only scope `itemContext` + config via a lightweight provider.

## Consequences

- Hot machines (playlist, queue, reactions, chat, etc.) avoid `.send()` on unrelated traffic.
- N listener rows with `userListItem` components cost 1 fetch + 1 socket sub per plugin, not N.
- Risk: incomplete allowlists drop needed events — cover with machine-focused tests when migrating. Plugin events stay filtered inside the plugin socket callback (dynamic `PLUGIN:{name}:*` names).

## See also

- [0004](0004-state-machines-for-ui-and-socket-events.md) — XState + socketActor hub
- `apps/web/src/actors/socketActor.ts`
- `apps/web/src/actors/pluginComponentRegistry.ts`
