# 0198. Plugin queue blocks and pins

**Date:** 2026-10-01
**Status:** Accepted

## Context

Plugins move one track at a time (`addToTrackQueue`, top/bottom, delta moves). Queuing an album side, a DJ set, or "this EP plays next, intact" takes N adds, N `QUEUE_CHANGED` broadcasts, and a reorder, and nothing stops a listener or admin from moving a track into the middle afterwards.

`QueueItem.locked` already exists but is wire-only: it marks the dispatched head row in `getQueueWithDispatched` and is never persisted. It cannot double as a hold.

## Decision

1. **`PluginAPI.enqueueTracks(roomId, tracks, { at, pin?, addedBy?, suppressQueueChanged? })`**, `tracks: { trackId, mediaSourceType? }[]`, cap 50. Each track resolves through `DJService.queueSongAs` (no plugin validation, nested `QUEUE_CHANGED` suppressed), then one `setQueue` places the block and one `QUEUE_CHANGED` goes out. Duplicates and lookup failures are reported in `skipped`; the call fails only if nothing was queued.
2. **Placement.** `at: "end"` (default) appends, or lands just above the queue split anchor when one exists ([ADR 0067](0067-queue-split-reserved-segment.md)). `at: "next"` is index 0 of the waiting queue (after the dispatched head). A number is a clamped index. Placement never lands ahead of, or inside, another plugin's pinned block; it is moved to just after it. `"next"` and numeric indexes are app-controlled only.
3. **Pin.** `pin: true` (app-controlled only) stamps a persisted `pin: { pluginName, blockId }` on each item's Redis blob. `pin` is separate from `locked`, and it rides `QUEUE_CHANGED` so clients can disable drag on pinned rows. `unpinQueueBlock(roomId, blockId)` clears it for the owning plugin.
4. **What a pin holds.** For anyone but the owning plugin (admins, listeners, other plugins):
   - pinned rows cannot be removed or played out of order;
   - reorders and moves are rejected if any foreign block would split, change internal order, or move later in the queue (moving earlier, because something ahead of it left, is fine);
   - shuffle keeps everything up to the last foreign pinned row in place and shuffles only the rows after it;
   - `playQueuedTrack` is rejected for a row that sits after a foreign pinned row, or for a pinned row that is not at the head;
   - `PluginAPI.skipTrack` is rejected while the now-playing track carries a foreign pin.
   Natural advance (track end, `popNextFromQueue`) still plays the block in order. The pin rides from the queue blob onto `nowPlaying` so skip gating sees it, and is stripped from the room playlist entry.
5. **Enforcement lives in `DJService`** (`reorderQueue`, `removeFromQueueDirect`, `removeTrackFromQueue`, `moveTrackTo`, `moveTrackByPosition`, `shuffleQueue`, `playQueuedTrack`) through one shared check in `operations/dj/queuePins.ts`. Plugin callers pass `actorPluginName` so owners are exempt. Socket handlers do not change.

## Consequences

- Plugins can schedule sets and hold them without fighting the room.
- Admins cannot drag a held block either. The owning plugin is the only release; a disabled or broken plugin leaves the block pinned until it plays out.
- One broadcast per block instead of one per track. Track lookups are still one `findById` per id, which is why the cap is 50.

## See also

- [0067](0067-queue-split-reserved-segment.md) — queue split
- [0153](0153-plugin-authored-queue-split.md) — plugin trust model
- [0041](0041-queue-drag-reorder-authorization.md) — queue reorder authorization
