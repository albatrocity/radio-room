# 0101. Queue-add undo: cancel held picks and restore Round Robin turns

**Date:** 2026-08-18
**Status:** Accepted

## Context

Add to Queue grouping rows and track rows look similar, so listeners often queue a track when they meant to drill into an artist, album, or Physical Media item. An Undo control on the success toast must reverse both a live enqueue and a Round Robin **held** pick ([ADR 0091](0091-round-robin-dj-plugin.md) `deferQueueRequest` / `SONG_QUEUE_HELD`).

Holds live in plugin storage, not the Redis queue, so `REMOVE_FROM_QUEUE` cannot clear them. ADR 0091 also stated that removing a queued track does not restore a turn; that left Undo as a trap: the song leaves the queue but the deputy has spent their round.

## Decision

1. **Live enqueue Undo** uses existing `REMOVE_FROM_QUEUE` `{ trackId }` (app-controlled only). Success is silent; failure toasts. The queue trash button stays on the same socket.

2. **Held-pick Undo** uses new socket `CANCEL_HELD_QUEUE` `{ trackId }` on the caller’s socket. Ack `CANCEL_HELD_QUEUE_SUCCESS` / `_FAILURE`. Optional `Plugin.cancelHeldQueue({ roomId, userId, trackId })` → `{ cancelled: boolean }`. `PluginRegistry.cancelHeldQueue` takes the first `cancelled: true`; errors/timeouts fail-open (`false`). Round Robin clears the hold only when `hold.trackId` matches (a later pick must not be wiped by a stale toast).

3. **Turn restore on live removal:** optional `Plugin.onQueueItemRemoved({ roomId, item, remainingQueue })`, invoked from `DJService.removeFromQueueDirect` after a successful Redis remove (same fail-open timeout as `validateQueueRequest`). Toast Undo and trash share this hook — no extra socket.

4. **Round Robin restore** (`restoreTurnToEndOfRound`):
   - Skip if the owner still has another row in `remainingQueue`, is not a participant, or never spent a turn this round (admin bypass).
   - **Open discovery:** drop from `queuedThisRound` and `order`.
   - **Locked sequential:** drop from `queuedThisRound`, move the id to the **end** of `order`, keep the current eligible deputy’s turn.
   - **`nonSequential`:** unmark `queuedThisRound` only.
   - **`roundComplete`:** reopen `locked` (or `open`) onto the undoer when they are the last remaining slot.
   - **Auto-advanced empty next round:** rewind only when `lastTurn` says this user completed round N, `state.round === N+1`, and `queuedThisRound` is empty. `lastTurn` is written by `recordSuccessfulQueue`. Admin `advanceRound` clears `lastTurn` so trashing an old row cannot rewind.

5. **Too late:** if the next round has already started (someone else queued), do not restore. Removing the track still succeeds.

This **partially supersedes** [ADR 0091](0091-round-robin-dj-plugin.md) decision 3’s sentence “Removing a queued track does not restore a turn in v1.” All other 0091 decisions remain in force. Holds never spent a turn; cancelling a hold does not call restore.

## Consequences

- Mistaken Add to Queue clicks are reversible without teaching a second dequeue protocol.
- Deputies who undo a live add wait until the end of the current round instead of skipping the rest of the room or losing the round entirely.
- Auto-advance rewind depends on `lastTurn`; a missing bookmark (old process memory) skips rewind and only restores when the user is still in `queuedThisRound`.
- Game Studio must stub `CANCEL_HELD_QUEUE` so preview sockets do not hang.

## See also

- [0091. Round Robin DJ plugin](0091-round-robin-dj-plugin.md)
- [0006. Plugin system](0006-plugin-system-for-room-features.md)
- [0009. SCREAMING_SNAKE_CASE for socket wire protocol](0009-screaming-snake-case-for-socket-events.md)
- [`packages/plugin-round-robin-dj/state.ts`](../../packages/plugin-round-robin-dj/state.ts)
- [`apps/web/src/lib/queueToastUndo.ts`](../../apps/web/src/lib/queueToastUndo.ts)
