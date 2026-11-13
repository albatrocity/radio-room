# 0206. Skipper persona plugin

**Date:** 2026-11-13
**Status:** Accepted

## Context

Room admins want to hand a listener (or themselves) the ability to skip the current track, without granting admin or the admin seek transport. Personas are display labels in core ([ADR 0057](0057-user-personas-system.md)); core does not map a persona to a privilege. Round Robin already gates the queue from inside a plugin that owns its persona ([ADR 0091](0091-round-robin-dj-plugin.md)). Polls went into core because every room needs them and the plugin UI could not express them ([ADR 0061](0061-poll-voting-as-core-feature.md)). A delegated skip is optional, and the plugin surface already has what it needs: admin-assignable personas, plugin `button` components in a host area, and `context.queue.skipTrack`.

The request also asked for a configurable sound on the DJ Mac when a track is skipped. `queueSoundEffect` plays in listener browsers. The Media Bridge can speak (`speak`, [ADR 0178](0178-media-bridge-tts-say-output.md)) but cannot play an arbitrary URL yet.

## Decision

1. **Plugin, not core.** `@repo/plugin-skipper` registers the persona `plugin:skipper:skipper` (label Skipper, icon `ShipWheel`, non-exclusive, `assignableByAdmin`, `decoratesUser`, `decoratesChatMessage`). Admins assign it from the listener ellipsis (`TOGGLE_PERSONA`), including on their own row.
2. **The persona is the permission.** `executeAction("skip")` requires the initiator to hold the persona. Being a room admin does not bypass it.
3. **Only with a waiting track.** Skip is allowed only in app-controlled rooms, when the Redis queue has at least one waiting track and the current track is not pinned by another plugin ([ADR 0198](0198-plugin-queue-blocks.md)). The plugin never calls `skipTrack` on an empty queue, because that path falls through to the controller's `skipToNextTrack`.
4. **Queue auto-advance off means pause.** When the room has `queueAutoAdvance: false`, a skip calls `context.playback.pausePlayback` and leaves the queue alone; the admin starts the next track. In that mode the button hides while the last `PLAYBACK_STATE_CHANGED` is paused or stopped. The waiting-track and pin rules still apply.
5. **UI from the component store.** A `button` in the `playerControls` area (the playlist / play / volume bar on desktop and mobile, added for this plugin) shows when the viewer is in the store's `skipperUserIds` and `canSkip` is true. No host React change.
6. **Optional per-Skipper limit.** `skipLimit` (0 = unlimited) caps skips per persona grant. The count lives in plugin storage (`skips-used:{userId}`), is claimed with `inc` before acting and rolled back if the skip fails. The last allowed skip removes the persona (`personas.remove`). `PERSONA_REMOVED` / `PERSONA_ASSIGNED` delete the count, so a reassignment starts fresh. Holders over the limit (for example after the limit is lowered) drop out of the store's `skipperUserIds`.
7. **DJ Mac skip sound deferred.** No sound URL setting until the bridge can play a URL. That caller belongs on `context.playback` ([ADR 0201](0201-plugin-capability-interfaces.md)), not `queueSoundEffect`.

## Consequences

- Rooms that do not enable the plugin are unaffected; core gains no persona-to-privilege mapping.
- An admin who wants the button must assign Skipper to themselves.
- `canSkip` is room-wide store state recomputed on queue and persona changes; a click that races a queue change gets a failure result instead of a skip.
- Non-app-controlled rooms (Spotify-native queue) never show the button.

## See also

- [`packages/plugin-skipper/`](../../packages/plugin-skipper/)
- [0057. User personas](0057-user-personas-system.md), [0091. Round Robin DJ](0091-round-robin-dj-plugin.md), [0201. Plugin capability interfaces](0201-plugin-capability-interfaces.md)
