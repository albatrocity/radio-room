# 0200. Queue follow-ups commit before QUEUE_CHANGED

**Date:** 2026-10-14
**Status:** Accepted

## Context

`QUEUE_CHANGED` used to go out, then a plugin could write the queue again, then core emitted a second time with `{ skipPlugins: true }` so broadcasters saw the repaired snapshot. Round Robin did that from `onQueueChanged`: it flushed a held track with `addToTrackQueue({ suppressQueueChanged: true })`, and `DJService` kept a dirty flag so it could rebuild and re-emit.

The second emit existed because the first payload was snapshotted before plugins ran. Plugins were writing a core aggregate from inside the event that announces that aggregate. [ADR 0008](0008-system-events-and-broadcaster-pattern.md) still wants one emit and three consumers. [ADR 0014](0014-emit-domain-events-from-operations-only.md) still wants domain events born with the write, not inside a plugin handler.

## Decision

1. **`DJService` is the only writer of the core queue.** After a primary enqueue (`queueSongAs`, `enqueueTracks`, segment injection), it asks `PluginRegistry.collectQueueFollowUps(roomId)` before `systemEvents.emit`. A follow-up is data:

   ```ts
   type QueueFollowUp = {
     type: "enqueue"
     trackId: string
     mediaSourceType?: string
     addedBy: QueueItemAttribution
     runPluginValidation: false
   }
   ```

   The registry forces `runPluginValidation: false` and tags each proposal with the plugin that returned it. `DJService` performs the Redis write, then calls that plugin's `onQueueFollowUpResult` with success or the enqueue error. Only then does `buildQueueChangedData` run, and only then does one `QUEUE_CHANGED` go out.

2. **Rounds continue until a collect returns nothing or a round applies nothing.** A live Round Robin enqueue flushes every later deputy's hold in that same commit, not one hold. The loop stops on the first failed follow-up and still emits the queue that did commit. Hard cap is `MAX_QUEUE_FOLLOW_UP_ROUNDS` (50), the same order as the enqueue batch cap.

3. **Plugins do not write the core queue from a system-event handler.** While `SystemEvents` is inside `pluginRegistry.emit` for a room, `PluginAPI` queue mutators throw `QueueMutationDuringEmitError`: `addToTrackQueue`, `removeFromTrackQueue`, `moveToTrackQueueTop`, `moveToTrackQueueBottom`, `moveTrackByPosition`, `shuffleTrackQueue`, `enqueueTracks`, `setQueueSplit`, `removeQueueSplit`, and `unpinQueueBlock`. The depth flag is per room and cleared in `finally`. Follow-ups never set it; they run before emit. Owner batching uses a private `deferQueueChanged` on `DJService.queueSongAs` that `PluginAPI` does not expose, then `finishDeferredQueueWrite`.

4. **`suppressQueueChanged` and `skipPlugins` are gone.** There is no dirty set and no second emit. `SystemEvents.emit` takes no options argument.

5. **Gates stay gates.** `validateQueueRequest`, `beforePlayQueuedTrack`, and `transformChatMessage` still run before their owning commit. Plugin-namespaced storage writes during `QUEUE_CHANGED` stay legal. `appContext` remains on `PluginContext`, and production plugins do not use it to write `room:{id}:queue_order` or `queued_track:*`.

6. **Turn changes that are not queue writes still flush directly.** Leave, roster, `advanceRound`, undo, and persona changes call `addToTrackQueue` from `flushHoldForCurrentTurn`. If that runs while plugins are being emitted to, the flush is deferred with `setTimeout(0)` so it is outside the guard. `applySuccessfulQueue` does not flush; a queue-write hold is a follow-up.

## Consequences

- Clients see one `QUEUE_CHANGED` that already includes flushed holds. A previous deputy's enqueue and every later held track share that payload.
- A plugin that still calls `addToTrackQueue` from `on("QUEUE_CHANGED")` fails the call. The suite expects `QueueMutationDuringEmitError`.
- Round Robin projects the turn the live enqueue will record, proposes the next sole eligible hold, and persists both turns in `onQueueFollowUpResult` before the broadcast. `onQueueChanged` then sees those users already recorded.
- A failed follow-up records the live enqueue, keeps the hold, and sends the existing error chat. Later holds in that chain are not attempted.
- There is still no room-wide lock on `queue_order`. Concurrent enqueues can interleave.
- Chat is unchanged: `sendMessage` can still emit `MESSAGE_RECEIVED` before the message is persisted.

## See also

- [0008](0008-system-events-and-broadcaster-pattern.md) — one emit, three consumers
- [0014](0014-emit-domain-events-from-operations-only.md) — domain events born with the write
- [0198](0198-plugin-queue-blocks.md) — `enqueueTracks` blocks and pins; the public `suppressQueueChanged` option is the clause this record replaces
