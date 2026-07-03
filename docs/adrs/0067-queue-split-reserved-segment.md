# 0067. Queue split for reserved lower segment (app-controlled)

**Date:** 2026-07-03  
**Status:** Accepted

## Context

App-controlled playback ([ADR 0040](0040-app-controlled-playback-and-ordered-queue.md)) gives the app an ordered Redis queue suitable for reorder ([ADR 0041](0041-queue-drag-reorder-authorization.md)). Show hosts sometimes want to **pivot** the upper queue toward a themed segment while **preserving** tracks already scheduled below — without manually shuffling or losing the lower block.

An integer index for the divider would require maintenance on every reorder, shuffle, and removal. Split state must stay consistent across all `QUEUE_CHANGED` emit paths and reconnect (`INIT`).

## Decision

1. **Scope:** Queue split applies only when `Room.playbackMode === "app-controlled"`. Non-app-controlled rooms never store or broadcast split state.

2. **Storage:** One Redis string per room: `room:{roomId}:queue_split` = `belowKey`, a `canonicalQueueTrackKey` for the **first track below the divider**. The divider renders **above** the row whose canonical key equals `belowKey`. Absent key means no split. Only one split per room.

3. **Normalize on send:** Before every `QUEUE_CHANGED` and app-controlled `INIT`, `getNormalizedQueueSplit` loads the key and current `getQueue` (unlocked rows only for index math). If `belowKey` is missing from the queue or is at index **0** (nothing above it), clear Redis and return `null`. All emit sites use shared `buildQueueChangedData` so drain and reorder stay consistent without per-path arithmetic.

4. **Re-anchor on removal:** When the anchor track is removed via `removeFromQueue`, re-anchor **before** `ZREM`: if the removed key is the split anchor, set split to the successor in `queue_order` or clear if none. Head drains via `ZPOPMIN` do not re-anchor; normalization clears the split when the anchor reaches index 0.

5. **Split-aware enqueue:** In `DJService.queueSongAs`, after `addToQueue`, if app-controlled and a normalized split exists, splice the new item immediately **before** `belowKey` and `setQueue`. `belowKey` is unchanged; each add pushes the divider down visually.

6. **Authorization:** Same gate as queue reorder ([ADR 0041](0041-queue-drag-reorder-authorization.md)): room admins only (`userCanReorderQueueInRoom` / `useCanReorderQueue`). **All viewers** see the divider; only admins add, drag, or remove it.

7. **Socket contract:** Clients emit `SET_QUEUE_SPLIT` `{ belowKey: string }` and `REMOVE_QUEUE_SPLIT` `{}`. Handlers ack `*_SUCCESS` / `*_FAILURE` on the requesting socket; applied state arrives via `QUEUE_CHANGED`. Setting split with `belowKey` at index 0 clears the split (same as remove).

8. **Wire payload:** `QUEUE_CHANGED` and app-controlled `INIT` include `splitKey: string | null` alongside `queue`. `clearQueue` clears split state.

9. **Client UX:** `queueListMachine` holds `splitKey`. `QueuedTracksSection` renders a divider above the anchor row for everyone; admins get a sortable sentinel (`queue-split-divider`) in the same DnD group as queue rows. Divider drag emits split events; track drag emits `REORDER_QUEUE` with track keys only.

10. **Game Studio preview:** `studio-bridge` stores optional `splitKey` on `BridgeSnapshot`, echoes split socket handlers locally, and includes `splitKey` in INIT / `QUEUE_CHANGED` so `make game-studio` preview stays aligned.

## Consequences

- **Themed pivots without losing the tail:** New requests land in the upper segment; the lower block stays reserved until played or manually reordered.
- **Anchor stability:** Reorder and shuffle move the divider with its anchor track; no index counter in Redis.
- **Automatic cleanup:** Draining the upper section removes the split when normalization sees index 0 — no orphan divider at the head.
- **Single split limit:** Multiple reserved bands would need a new model (list of anchors or segments).
- **Bridge parity:** Split in preview is bridge-local state; Game Studio sandbox queue mutations do not model split-aware enqueue unless extended later.

See also: [0040](0040-app-controlled-playback-and-ordered-queue.md), [0041](0041-queue-drag-reorder-authorization.md), [0014](0014-emit-domain-events-from-operations-only.md), [0013](0013-track-identity-media-and-metadata-sources.md), [0051](0051-game-studio-client-sandbox.md).
