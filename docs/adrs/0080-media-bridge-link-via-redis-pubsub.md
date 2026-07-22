# 0080. Media Bridge Link via Redis Pub/Sub

**Date:** 2026-07-22
**Status:** Accepted

## Context

Admins need to attach a DJ-Mac Media Bridge daemon to a bridge-powered room without copying room ids into the CLI. The operator clicking **Link to Media Bridge** in the Listening Room web UI is usually **not** on the DJ Mac, so browser → `127.0.0.1` control API probing is unreliable ([ADR 0077](0077-bridge-daemon-local-control-ui.md) localhost UI remains for on-box config only).

The API and daemon already share Redis for room-scoped RPC and presence ([ADR 0075](0075-bridge-composite-playback-controller.md)).

## Decision

1. **Global control channel** — `BRIDGE:CONTROL` carries `LINK_REQUEST` / `LINK_ACK` / `LINK_NACK` (schemas in `@repo/adapter-bridge/protocol`).
2. **Standby daemon** — `bridge-daemon serve` (and `connect --ui`) keeps a Redis connection, heartbeats `bridge:daemon:{daemonId}:presence`, and subscribes to `BRIDGE:CONTROL` even when not connected to a room.
3. **Socket handshake** — Admin emits `LINK_MEDIA_BRIDGE`; API publishes `LINK_REQUEST`, waits for matching ACK/NACK (timeout aligned with RPC), replies with success/failure events. Authz: room admin + `playbackControllerId === "bridge"`.
4. **Offline UX** — No standby presence and/or ACK timeout ⇒ “No Media Bridge is online” (start `serve` with Redis aimed at this environment). NACK surfaces the daemon error string.
5. **v1 multi-daemon** — First ACK wins; document one bridge process per Redis environment. Local control UI stays for config/room picker on the Mac.

## Consequences

### Positive

- Link works from any admin browser on the same Redis as the DJ Mac.
- Failures are explicit when the daemon is down.
- No CORS/localhost coupling to the Listening Room web origin.

### Negative / trade-offs

- Multiple daemons on one Redis may race (ops constraint for v1).
- Plain `connect` without `--ui` / without `serve` does not listen for link requests.
- Redis remains the trust boundary (unsigned control messages).

## See also

- [0075](0075-bridge-composite-playback-controller.md) / [0077](0077-bridge-daemon-local-control-ui.md)
- `docs/BRIDGE_LOCAL_TESTING.md`
- [0081](0081-media-bridge-connection-status-to-clients.md) — client status surface
