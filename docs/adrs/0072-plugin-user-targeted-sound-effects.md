# 0072. Plugin User-Targeted Sound Effects

**Date:** 2026-07-21
**Status:** Accepted

## Context

[`PluginAPI.queueSoundEffect`](../../packages/server/lib/plugins/PluginAPI.ts) always broadcasts `SOUND_EFFECT_QUEUED` via `SystemEvents` to every client in the room. Inclusive (PvG) game plugins need to play a correct-answer cue only for the guesser so other participants are not tipped off by shared audio.

[ADR 0048](0048-plugin-user-targeted-chat.md) already established private socket delivery for per-user system chat (`io.to(socketId).emit` after resolving the recipient via `getRoomUsers`). Sound effects need the same delivery model without inventing a parallel client event.

## Decision

Extend **`PluginAPI.queueSoundEffect({ url, volume?, userId? })`**:

1. **Omit `userId`** — existing room-wide path: `systemEvents.emit(roomId, "SOUND_EFFECT_QUEUED", { roomId, url, volume })`.
2. **Set `userId`** — resolve the recipient’s socket via `getRoomUsers`, then emit only to that socket: `io.to(socketId).emit("event", { type: "SOUND_EFFECT_QUEUED", data: { roomId, url, volume, userId } })`. Do **not** call `systemEvents.emit` for this path.
3. If `userId` has no connected socket in the room, no-op with a warning log (parity with ADR 0048).

Clients continue to handle a single `SOUND_EFFECT_QUEUED` event shape; no client-side user filtering is required for the targeted path.

## Consequences

- **Positive:** Plugins can choose room-wide vs per-user SFX with one API; PvG quiz (and similar) cues stay private to the guesser; room-wide callers are unchanged.
- **Negative:** Targeted SFX do not fan out via Redis PubSub / SystemEvents (same trade-off as ADR 0048); multi-tab users only hear the effect on the connected socket that is in the room user list.
- **See also:** [ADR 0048](0048-plugin-user-targeted-chat.md), [ADR 0062](0062-participation-mode-pvp-vs-pvg.md).
