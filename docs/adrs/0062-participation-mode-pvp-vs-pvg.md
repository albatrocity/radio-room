# 0062. Participation Mode (Competitive vs Inclusive)

**Date:** 2026-06-15
**Status:** Accepted

## Context

Platform game-mechanic plugins (Guess the Tune today; potentially others) often gate scarce rewards on user actions. The default pattern is **first-actor-wins** (competitive / PvP): one user resolves the round and others get nothing for the same action. At scale — many listeners in a room — this collapses to a handful of fast typers earning everything, which suppresses participation.

Coin earning is a foundational platform incentive. We need a sanctioned, reusable **inclusive** alternative where every participant can earn independently, while still supporting competitive modes where appropriate.

Guess the Tune is the first plugin to adopt both modes explicitly. Related patterns already exist elsewhere (special words, playlist democracy) but were not named or shared.

## Decision

### Participation modes

Plugins that gate rewards on user actions SHOULD support two named modes when feasible:

| Mode | Alias | Behavior |
|------|-------|----------|
| `competitive` | PvP | A single user resolves the round for everyone; others cannot earn for the same action. |
| `inclusive` | PvG | Each user has an independent opportunity to earn, scored against the room/track itself rather than against each other. Leaderboards remain. |

**Default:** New plugins SHOULD default to `inclusive`.

Shared config helpers live in `@repo/game-logic` (`participationModeSchema`, `participationModeFieldMeta`, `isInclusiveMode`).

### Per-user UI reveals

Per-user UI overrides live in `QueueItem.pluginData[pluginName].userReveals[userId]`:

- The map is **broadcast to all clients** (via existing playlist/now-playing augmentation).
- Each client **only consults its own row** when resolving obscured now-playing fields (extends ADR 0039's `elementProps` with a per-viewer dimension).
- Payload size is bounded: plugins SHOULD cap `userReveals` (e.g. 200 entries, viewer always included) rather than thread `userId` through socket-aware augmentation.

This avoids private socket fan-out for every reveal while keeping the augmentation API unchanged.

### Chat message drops (inclusive mode)

In inclusive mode, chat messages that would spoil hidden state (e.g. a correct guess text) MUST NOT be persisted or broadcast. Plugins return `{ drop: true }` from `transformChatMessage` (extends ADR 0044). Matching and scoring for inclusive mode SHOULD happen in `transformChatMessage` so the drop decision is atomic with the award.

System messages announce success to the room; the original user message is dropped silently.

### Admin global reveals

Admin-driven reveals (e.g. "reveal title for everyone") remain **global** in both modes and are enforced at the plugin level via `PluginAPI.isRoomAdmin`.

### Candidate adopters

| Feature | Notes |
|---------|-------|
| `plugin-special-words` | Already inclusive — cite as exemplar. |
| `plugin-playlist-democracy` | Voting is already inclusive. |
| `plugin-guess-the-tune` | First explicit adopter of the shared mode field and `userReveals`. |
| Future games (lyric race, BPM/year guess, name the sample) | SHOULD ship `inclusive` first. |
| Inventory item-targeting (ADR 0045, 0050) | Explicitly **competitive** — adversarial by design; out of scope. |

## Consequences

### Positive

- **More participation at scale.** Inclusive mode extends coin-earning opportunities without removing leaderboard competition.
- **Shared vocabulary.** `competitive` / `inclusive` and `@repo/game-logic` helpers reduce one-off plugin semantics.
- **Reuses existing infrastructure.** `elementProps` (ADR 0039), `transformChatMessage` (ADR 0044), and plugin augmentation — extended, not replaced.

### Negative / trade-offs

- **`userReveals` broadcast size.** Capped maps trade perfect completeness for bounded payloads; clients only need their own row.
- **Dual code paths.** Plugins supporting both modes maintain competitive (`MESSAGE_RECEIVED`) and inclusive (`transformChatMessage` + drop) paths.
- **Drop is silent.** The sender's client does not see their suppressed message (no optimistic chat UI); acceptable for guess-the-tune spoilers.

## References

- [ADR 0006 — Plugin System](0006-plugin-system-for-room-features.md)
- [ADR 0039 — Plugin elementProps for Now Playing](0039-plugin-element-properties-for-now-playing.md)
- [ADR 0044 — Plugin Chat Message Transform](0044-plugin-chat-message-transform-and-text-segments.md) (amended by this ADR for `{ drop: true }`)
- [ADR 0048 — Plugin User-Targeted Chat](0048-plugin-user-targeted-chat.md)
- `packages/game-logic/src/participationMode.ts`
