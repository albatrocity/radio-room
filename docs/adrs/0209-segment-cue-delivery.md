# 0209. Segment cue delivery

**Date:** 2026-11-18
**Status:** Accepted

## Context

[ADR 0204](0204-device-trust-boundary.md) pushes `SEGMENT_ACTIVATED` to the DJ Mac as a `segment` event on `/device`. The first cut of that path emitted only to the socket.io room `segment:{roomId}`. `watch` joined that room with a fire-and-forget `socket.join`. When the join did not stick, the process that held the socket still had it in the in-memory device map, and the cue never arrived. The Mac's Test button sends OSC from the form and does not use this path, so a successful UDP test said nothing about whether a segment cue had been delivered.

The API runs more than one process ([ADR 0003](0003-redis-for-ephemeral-room-data.md)). The socket and the activation can land on different processes. The in-memory map does not cross processes.

## Decision

1. `watch` records the room on the in-memory device socket before it awaits the socket.io join. A cue in that turn can already see the socket.
2. A segment cue is delivered three ways, with the same payload (`at` included):
   - `emit` on every in-memory `/device` socket whose room matches, on the process that is emitting
   - `emit` to the socket.io room `segment:{roomId}`, which the Redis adapter carries to the process that holds the socket
   - publish on Redis channel `device:segment-cue`. Every API process subscribes on its own connection and repeats the in-memory emit. A process ignores its own publish.
3. local-remote treats a second event with the same `at`, segment id, and cue as one cue, so the three paths do not play the tile twice.
4. The join snapshot stays `cue: "snapshot"` and still does not replay the segment the Mac already has. An activation still plays, including a repeat. Reconnect does not restart the theme.

## Consequences

- **Positive:** The process that accepted `watch` delivers the cue even when the socket.io room join did not stick.
- **Positive:** A cue handled on another API process still reaches the Mac through the room and through `device:segment-cue`.
- **Negative:** One activation can arrive twice. The Mac keys that off `at` and does not send OSC for the copy.
- **Supersedes:** The sentence in [ADR 0204](0204-device-trust-boundary.md) that segment cues go only through the `/device` room and not the in-memory registry. Auth, now playing, bridge playback, and the snapshot rule are unchanged.

## See also

- [0204](0204-device-trust-boundary.md)
- [0003](0003-redis-for-ephemeral-room-data.md)
- `packages/server/lib/deviceSegmentFanout.ts`
- `apps/local-remote/daemon/src/segment_socket.rs`
