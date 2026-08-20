# 0107. Game sessions independent of segment plugin activation

**Date:** 2026-08-20
**Status:** Accepted

## Context

[ADR 0042](0042-game-sessions-and-inventory.md) bound game-session lifetime to show segments: on every `activateRoomSegment`, the room’s active session was ended, and a new one started only when the segment had a `gameSessionPreset`.

In practice, hosts activate segments primarily to apply **plugin presets** (merge/replace) and room-settings overrides. That path was ending open game sessions even when the segment had no `gameSessionPreset`, which interrupted live games and was not the intended product behavior. Game sessions are started/ended by admins and plugins; they should not be collateral damage of schedule segment activation.

## Decision

1. **Plugin preset application does not touch game sessions.** Activating a segment with `presetMode` of `"merge"`, `"replace"`, or `"skip"` must not call `endSession` merely because a segment became active.
2. **Opt-in start only.** If the segment includes `gameSessionPreset` and `presetMode !== "skip"`, call `startSession` with that preset (tagging `segmentId`). `GameSessionService.startSession` remains responsible for ending any prior active session when starting a new one.
3. **No implicit end on segments without a game preset.** Leaving a segment that had started a session, or activating a segment without `gameSessionPreset`, leaves the current session running until an explicit end (admin UI, plugin action, or a later segment that starts a new session via `gameSessionPreset`).

This **partially supersedes** ADR 0042’s “Segment integration” bullet and the related “segment-bound games don’t bleed across segments” consequence: sessions are no longer ended on every activation.

## Consequences

- Hosts can merge/replace plugin configs mid-show without wiping scores, inventory, or modifiers.
- Operators who want a fresh session per segment must set `gameSessionPreset` on that segment (or end/start manually).
- `GameSessionConfig.segmentId` remains a correlating tag when a preset starts a session; it does not imply auto-end on the next activation.
- Plugin docs that described “activating any segment ends the prior session” are updated to match this rule.

## See also

- [0042. Game Sessions and Inventory](0042-game-sessions-and-inventory.md)
- [0021. Room-attached show and segment activation](0021-room-attached-show-and-segment-activation.md)
- `packages/server/operations/activateRoomSegment.ts`
