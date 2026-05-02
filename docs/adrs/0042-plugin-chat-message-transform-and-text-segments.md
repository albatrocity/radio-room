# 0042. Plugin Chat Message Transform Hook + Structured Text Segments

**Date:** 2026-05-02
**Status:** Accepted

## Context

Plugins could subscribe to `MESSAGE_RECEIVED` only after a message was finalized, persisted, and broadcast. There was no pre-send hook analogous to `validateQueueRequest` for the queue. `ChatMessage.content` was a single Markdown string with no typed model for per-span presentation, so effects like “duplicate each word with the second copy smaller” could not be expressed declaratively without leaking ad-hoc markup into `content`.

## Decision

1. Add **`Plugin.transformChatMessage(roomId, message): Promise<ChatMessage | null>`**, invoked sequentially by **`PluginRegistry.transformChatMessage`** from **`messageHandlersAdapter.newMessage`** immediately before **`sendMessage`**. Returning `null` leaves the message unchanged. Errors and per-plugin timeouts use **fail-open** semantics (500ms timeout), matching queue validation.
2. Extend **`ChatMessage`** with **`contentSegments?: TextSegment[]`** and a typed **`TextEffect`** discriminated union (initial variant: `{ type: "size", value: "small" | "normal" | "large" }`). **`content`** remains the canonical plain string and must stay in sync for persistence and exports.
3. The web client prefers **`contentSegments`** when present and maps effects to styles in **`apps/web/src/lib/textEffects.ts`** (declarative, similar in spirit to screen effects for animations).
4. **`@repo/plugin-base/helpers/chatTransform.ts`** provides **`tokenizeWords`** and **`buildSegments`** so plugins can build segments without custom parsers.

## Consequences

### Positive

- Chat mutations are a first-class, ordered pipeline with predictable ordering per room plugin map.
- Rich presentation is typed and versionable without embedding CSS in plugins.
- Optional **`contentSegments`** keeps backward compatibility for stored and historical messages.

### Negative / trade-offs

- Each implementing plugin may add latency on the hot path; timeouts mitigate stalls.
- Plugins must keep **`content`** and **`contentSegments`** aligned if both are used downstream.

## References

- [ADR 0006 — Plugin System](0006-plugin-system-for-room-features.md)
- [ADR 0008 — SystemEvents and Broadcasters](0008-system-events-and-broadcaster-pattern.md)
- `packages/server/lib/sendMessage.ts`
- `packages/server/lib/plugins/PluginRegistry.ts`
- `packages/server/handlers/messageHandlersAdapter.ts`
