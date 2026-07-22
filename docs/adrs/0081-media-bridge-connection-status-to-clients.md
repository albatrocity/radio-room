# 0081. Media Bridge Connection Status to Clients

**Date:** 2026-07-22
**Status:** Accepted

## Context

Admins need to see whether the DJ Mac Media Bridge is already connected to the current room before (or after) using **Link to Media Bridge** ([ADR 0080](0080-media-bridge-link-via-redis-pubsub.md)). Room-scoped Redis presence already exists (`bridge:{roomId}:presence`); it was not surfaced to the web client.

## Decision

1. Emit system event `MEDIA_BRIDGE_STATUS_CHANGED` `{ roomId, connected, services? }` when bridge capability flips (CAPABILITIES / DISCONNECTING) and after a successful link.
2. Admin socket `GET_MEDIA_BRIDGE_STATUS` reads the presence key and replies with the same payload shape (socket-local event) for initial UI hydrate.
3. Admin **Link to Media Bridge** button reflects connected vs disconnected from these events via a room-scoped XState actor (`mediaBridgeActor`: subscribe, poll, link handshake).

## Consequences

- Link button can show “linked” without probing localhost.
- Status is room-scoped (daemon connected to **this** room), not merely standby-online.
- Client status/link UX follows the same ACTIVATE/DEACTIVATE actor lifecycle as other room domains.

## See also

- [0080](0080-media-bridge-link-via-redis-pubsub.md)
- `apps/web/src/machines/mediaBridgeMachine.ts`