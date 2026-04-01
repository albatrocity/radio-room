# 0026. Segment room settings overrides

**Date:** 2026-04-01  
**Status:** Accepted

## Context

Segments already support optional plugin presets applied on activation with a merge/replace/skip choice. Broadcasters also need predictable listening-room toggles (auto-deputize, queue UI, fetch metadata) when switching between modes, without pasting JSON or confirming non-plugin changes.

## Decision

1. **Storage**  
   Add nullable JSONB `room_settings_override` on the scheduling `segment` row. Type `SegmentRoomSettingsOverride` in `@repo/types` holds optional booleans: `deputizeOnJoin`, `showQueueCount`, `showQueueTracks`, `fetchMeta`, plus optional `deputyBulkAction`: `deputize_all` | `dedeputize_all`. Only keys present in the object are applied on activation.

2. **Activation**  
   In `activateRoomSegment`, merge boolean fields into Redis room state together with `activeSegmentId`, before plugin preset handling. This runs for every activation regardless of `presetMode` (which continues to apply only to plugin configs).

3. **Bulk deputy DJs**  
   When `deputyBulkAction` is set, `applySegmentDeputyBulkAction` runs after room save: `dedeputize_all` clears the room’s deputy DJ set and `isDeputyDj` on those users; `deputize_all` deputizes all currently online users. Emits `USER_JOINED` with the refreshed user list when applicable.

4. **Fetch metadata parity**  
   When `fetchMeta` changes during activation, run the same transition logic as admin `setRoomSettings` via shared `applyFetchMetaTransitionEffects` so station meta / now-playing behavior stays consistent.

5. **Scheduler UI**  
   Configure overrides with per-field radios: True, False, or Unchanged (omit key); a separate tri-state controls bulk deputy actions (de-deputize all, deputize all, unchanged). No confirmation dialog in the listening room for these overrides; the existing dialog remains only for plugin preset application.

## Consequences

- **Positive:** Clear separation between plugin JSON presets and first-class room toggles; fewer manual room changes when switching segments.
- **Positive:** Partial overrides per segment without touching unspecified room fields.
- **Neutral:** Requires a DB migration for `room_settings_override`.
