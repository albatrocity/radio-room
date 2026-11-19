# 0210. Skipper own-track skip

**Date:** 2026-11-19
**Status:** Accepted

## Context

[ADR 0206](0206-skipper-persona-plugin.md) made the Skipper persona the only permission for the plugin Skip button. Room hosts also want listeners to undo a song they themselves queued while it is playing, without assigning Skipper or spending a per-persona skip limit. That is optional room policy, not a core queue privilege: listeners still cannot reorder or otherwise mutate the live queue ([ADR 0041](0041-queue-drag-reorder-authorization.md)), and polls moved to core only because every room needs them ([ADR 0061](0061-poll-voting-as-core-feature.md)).

`showWhen` is AND-only with membership operators ([ADR 0092](0092-plugin-showwhen-membership-and-add-to-queue-area.md)). Putting the queuer into `skipperUserIds` would imply they hold the persona.

## Decision

1. **Plugin setting.** `@repo/plugin-skipper` gains `skipOwnTracks` (boolean, default `false`), shown when the plugin is enabled. Enabling the plugin still registers the assignable Skipper persona; a room may leave it unassigned and use only own-track skip.
2. **Own-track permission.** When the plugin is enabled, `skipOwnTracks` is on, and the room is already skippable under ADR 0206 (app-controlled, waiting track, foreign pin rejected, auto-advance pause rule), the user on now-playing `addedBy.userId` may call `executeAction("skip")` without holding the Skipper persona. Tracks with no `addedBy` do not grant this. The skip does not write `skips-used:{userId}` and does not remove or assign the persona.
3. **Persona path preferred when both apply.** A Skipper who still has skips (or an unlimited limit) uses the existing claim / `afterSkip` path even when the playing song is theirs. An exhausted Skipper may still skip their own track under `skipOwnTracks` without re-granting the persona or changing the count.
4. **Separate store list and button.** The component store publishes `ownTrackUserIds` (empty, or the one `addedBy.userId` when the flag is on and `canSkip` is true). A second `playerControls` button shares the `skip` action and shows when `ownTrackUserIds` includes the viewer and `skipperUserIds` does not, so a Skipper with remaining skips sees one button.

## Consequences

- ADR 0206’s “persona is the permission” and “button only for `skipperUserIds`” no longer hold when `skipOwnTracks` is on; the rest of 0206 (waiting track, pause when auto-advance is off, skip limit for persona holders) still applies.
- Core gains no listener privilege to change what is playing; hosts that want this policy enable the Skipper plugin.
- Rooms that enable the plugin only for own-track skip still see the Skipper persona in the admin assign menu.

## See also

- [0206. Skipper persona plugin](0206-skipper-persona-plugin.md)
- [`packages/plugin-skipper/`](../../packages/plugin-skipper/)
