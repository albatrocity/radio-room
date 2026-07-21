# 0073. Plugin User-Targeted Screen Effects

**Date:** 2026-07-21
**Status:** Accepted

## Context

[`PluginAPI.queueScreenEffect`](../../packages/server/lib/plugins/PluginAPI.ts) always broadcasts `SCREEN_EFFECT_QUEUED` via `SystemEvents` to every client in the room. Inclusive (PvG) game plugins need to animate a plugin component (e.g. a quiz question card) only for the guesser so other participants are not tipped off by shared motion.

[ADR 0072](0072-plugin-user-targeted-sound-effects.md) already established optional per-user socket delivery for sound effects. Screen effects need the same delivery model without inventing a parallel API for plugin components — `target: "plugin"` already selects the DOM node.

`target: "user"` already means “animate this user’s list row.” Delivery scoping must not reuse that meaning.

## Decision

Extend **`PluginAPI.queueScreenEffect`** with optional **`recipientUserId`**:

1. **Omit `recipientUserId`** — existing room-wide path: `systemEvents.emit(roomId, "SCREEN_EFFECT_QUEUED", { roomId, target, targetId, effect, duration })`.
2. **Set `recipientUserId`** — resolve the recipient’s socket via `getRoomUsers`, then emit only to that socket: `io.to(socketId).emit("event", { type: "SCREEN_EFFECT_QUEUED", data })`. Do **not** call `systemEvents.emit` for this path.
3. If `recipientUserId` has no connected socket in the room, no-op with a warning log (parity with ADR 0048 / 0072).

**Naming:** `recipientUserId` is **client delivery scope**. It is orthogonal to `target: "user"` / `targetId`, which select which **DOM node** to animate.

Clients continue to handle a single `SCREEN_EFFECT_QUEUED` event shape; no client-side recipient filtering is required for the targeted path.

## Consequences

- **Positive:** Any screen-effect target (plugin card, now playing, message, etc.) can be room-wide or per-user with one API; PvG quiz cues stay private to the guesser; existing callers are unchanged.
- **Negative:** Targeted effects do not fan out via Redis PubSub / SystemEvents (same trade-off as ADR 0048 / 0072).
- **See also:** [ADR 0048](0048-plugin-user-targeted-chat.md), [ADR 0072](0072-plugin-user-targeted-sound-effects.md), [ADR 0062](0062-participation-mode-pvp-vs-pvg.md).
