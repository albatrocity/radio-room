# 0152. Plugin-authored core polls

**Date:** 2026-09-03
**Status:** Accepted

## Context

Core polls ([ADR 0061](0061-poll-voting-as-core-feature.md)) are created and closed only by room admins through Socket.IO handlers. Game plugins such as Queue Theme need to open a poll per track and close it on the next track (or when every eligible listener has voted) without a human admin on every transition, while still using the first-class `PollCard` UI and one-active-poll invariant.

Plugins already trust-call sensitive APIs such as `skipTrack`. Extending poll operations for a plugin source is preferable to a second, plugin-owned voting UI.

## Decision

1. **`createPoll` / `closePoll` accept optional `source?: { pluginName: string }`.** When `source.pluginName` is set, skip the `isRoomAdmin` check. Socket/admin callers omit `source` and keep the existing admin gate. `createdBy` remains the passed `userId` (typically the host who started the game round).

2. **Optional `announce?: boolean`** (default `true`). When `false`, skip the system chat lines that announce poll publish/close/results. Plugins that want custom payout messaging pass `announce: false`.

3. **Still one active poll per room.** Plugin create returns 409 if another poll is open — plugins must not steal foreign polls.

4. **`getPollVoterIds(roomId, pollId)`** returns the set of user ids that have voted (keys of the votes hash). Used for all-voted quorum without exposing per-option choices to clients.

5. **`getPollVotes(roomId, pollId)`** returns the full `userId → optionId` hash for plugin-side tallying (e.g. excluding the track DJ, rewarding Decoy accusations). Votes remain after close; never broadcast to clients.

6. **`PluginAPI`** exposes `createPoll`, `closePoll`, `getActivePoll`, `getPollVoterIds`, and `getPollVotes`. Each method takes an explicit `roomId` (same as the rest of `PluginAPI`; the implementation does not compare it to the scoped `this.roomId`). Plugin create/close require a scoped `pluginName` and pass `source: { pluginName }`; an unscoped `PluginAPIImpl` fails closed rather than using a placeholder name.

Ownership of “this poll belongs to my game round” lives in **plugin storage**, not on the `Poll` wire type.

## Consequences

- Game plugins can drive the core poll slot for a round without inventing parallel vote UI.
- Hosts cannot run a manual poll while a plugin holds the slot; plugins should fail `startRound` if a poll is already active and should not close polls they did not open.
- Silent polls reduce chat noise for high-frequency game loops; plugins own their own announce copy.

## See also

- [0061. Poll voting as a core feature](0061-poll-voting-as-core-feature.md)
- [0014. Emit domain events from operations only](0014-emit-domain-events-from-operations-only.md)
- [0153. Plugin-authored queue split](0153-plugin-authored-queue-split.md)
