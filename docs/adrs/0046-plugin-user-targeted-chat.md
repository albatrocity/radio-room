# 0046. Plugin User-Targeted Chat (Private Socket Delivery)

**Date:** 2026-05-02
**Status:** Accepted

## Context

Plugins sometimes need to notify **one** participant without broadcasting to the room or writing chat history (for example, loyalty rewards, moderation notices).

[`PluginAPI.sendSystemMessage`](../../packages/server/lib/plugins/PluginAPI.ts) routes through [`sendMessage`](../../packages/server/lib/sendMessage.ts), which emits `MESSAGE_RECEIVED` via `SystemEvents` and **persists** the line. That is the right default for public system lines.

The admin **kick** path already sends a `MESSAGE_RECEIVED` payload to a **single socket** with `io.to(socketId).emit` (see admin handlers), bypassing persistence and the full-room pipeline.

## Decision

Add **`PluginAPI.sendUserSystemMessage(roomId, userId, content, meta?)`** that:

1. Resolves the recipient’s current socket id via [`getRoomUsers`](../../packages/server/operations/data/users.ts) (same source as other plugin APIs).
2. Builds a message with [`systemMessage`](../../packages/server/lib/systemMessage.ts).
3. Emits **only** to that socket: `io.to(socketId).emit("event", { type: "MESSAGE_RECEIVED", data: { roomId, message } })`.
4. **Does not** call `persistMessage` or `systemEvents.emit` for this path.

This mirrors the kick notification delivery model and keeps user-targeted lines off the shared chat transcript unless we add an explicit persistence policy later.

## Consequences

- **Positive:** Simple implementation; clients already handle `MESSAGE_RECEIVED` (e.g. chat machine); works with Socket.IO Redis adapter for targeted emits when the socket is on the correct node.
- **Negative:** No cross-process chat history for these lines; no Redis PubSub fan-out (not needed for a single client).
- **Operational:** If `userId` has no connected socket in the room (idle tab, reconnect gap), the send is a no-op with a warning log.
