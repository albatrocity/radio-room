# 0145. Feedback Topics as a Core Feature

**Date:** 2026-09-02
**Status:** Accepted

## Context

Hosts need long-running, optional feedback on named topics (e.g. Physical Media, Bingo) plus a quiet place for listeners to report bugs — without crowding Chat or using one-shot Polls ([ADR 0061](0061-poll-voting-as-core-feature.md)). Topics must be editable live, responses private to the author and room admins, and durable enough to appear in room exports ([ADR 0003](0003-redis-for-ephemeral-room-data.md)).

A room plugin was considered ([ADR 0006](0006-plugin-system-for-room-features.md)). It fails for the same reasons polls did: dynamic admin lists, per-user secrecy (comment bodies must not fan out via plugin stores), clean `INIT` / `ROOM_DATA` hydration, every room type, and first-party export.

Unseen-topic and admin-inbox indicators must use the client notification center ([ADR 0144](0144-client-notification-center.md)), not a parallel localStorage badge store.

## Decision

### Core, not plugin

Feedback is core infrastructure: Redis under `room:{roomId}:feedback:*`, operations → SystemEvents, Socket.IO handlers, web `feedbackActor`, Preferences modal, Admin Settings section.

### Data model

- **Topics** (admin-authored): HASH `room:{id}:feedback:topics` + order STRING (JSON array of active ids). Status `active` | `archived`. Archived stay in Redis for inbox/export.
- **General feedback**: sentinel `id: "general"` — always last in UI, not stored in the topics list, never drives the listener indicator.
- **Responses**: per-topic HASH `userId → { vote, comment, updatedAt }`. Vote `"up" | "down" | null`; comment may be `""`. Changing vote does not wipe comment. Named topics: comment-only saves rejected without a stored vote. **General** may be comment-only (`vote: null`).
- Redis only for v1 (no Postgres).

### Privacy and wire

- Topic list is public (`FEEDBACK_TOPICS_CHANGED` via SystemEvents → RoomBroadcaster).
- `myFeedbackResponses` private on INIT / ROOM_DATA and `FEEDBACK_RESPONSE_SAVED` to the submitting socket.
- Full inbox admin-only: `GET_FEEDBACK_INBOX` / `FEEDBACK_INBOX` / `FEEDBACK_INBOX_UPDATED` via `emitToUserSocket` to each admin (**creator ∪ `getAdmins`**; creator is not in the admins set). Response bodies never go on room-wide SystemEvents.

### Attention (ADR 0144)

- Listener unseen topics: `NotificationTarget` `{ surface: "feedback" }`, `clearOn: "view"`, `persist: true`, no toast. Source-owned viewed-id set in localStorage (0144 persist only keeps *active* records).
- Admin inbox: `{ surface: "adminSettings", tabId: "feedback" }` with toast. Location fed from `modalsMachine` entry/exit.

### Export

`RoomExportData.feedback` includes topics (active + archived + general) with per-user responses and up/down tallies; Markdown section after Polls.

## Consequences

- **Positive:** Same patterns as polls; clear secrecy; indicators reuse 0144; export artifact without Postgres.
- **Trade-off:** More core surface area (types, Redis, handlers, actors, UI).
- **Trade-off:** First hydrate badges existing unviewed topics (unlike plugin tabs); viewed-set prevents repeat after open.
- **Deferred:** Scheduler presets, public tallies, clearing votes; comment-without-vote on named topics (General allows it).

## See also

- [0061. Poll voting as a core feature](0061-poll-voting-as-core-feature.md)
- [0144. Client notification center](0144-client-notification-center.md)
- [0003. Redis for ephemeral room data](0003-redis-for-ephemeral-room-data.md)
- [0014. Emit domain events from operations only](0014-emit-domain-events-from-operations-only.md)
