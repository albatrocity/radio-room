# 0153. Plugin-authored queue split

**Date:** 2026-09-03
**Status:** Accepted

## Context

Queue split ([ADR 0067](0067-queue-split-reserved-segment.md) §6) is authorized the same way as queue reorder: room admins only (`userCanReorderQueueInRoom`). Game plugins such as Queue Theme need to park the existing queue below a divider when a round starts, without a human admin dragging the sentinel.

Plugins already trust-call sensitive APIs such as `skipTrack`. Poll create/close already skip the admin gate when `source.pluginName` is set ([ADR 0152](0152-plugin-authored-core-polls.md)). Queue split should use that same source shape rather than a second, plugin-owned copy of split semantics.

## Decision

1. **`DJService.setQueueSplit` / `removeQueueSplit` accept optional `source?: { pluginName: string }`.** When `source.pluginName` is set, skip only the `userCanReorderQueueInRoom` check. Socket/admin callers omit `source` and keep the existing admin gate. App-controlled playback, index validation, index-0-clears-split, and `buildQueueChangedData` → `QUEUE_CHANGED` stay in `DJService` (ADR 0067 §3).

2. **`PluginAPI.setQueueSplit` / `removeQueueSplit` delegate to `DJService`** with `source: { pluginName }` from the scoped API. They do not re-implement room lookup, persist, or emit. An unscoped `PluginAPIImpl` (`pluginName` unset) fails closed rather than using a placeholder name.

3. **Socket handlers are unchanged.** Clients still emit `SET_QUEUE_SPLIT` / `REMOVE_QUEUE_SPLIT`; those paths never pass `source`.

4. **Methods take an explicit `roomId`.** Same as the rest of `PluginAPI`; the implementation does not compare it to the scoped `this.roomId`.

## Consequences

- Trusted plugins can reserve the lower queue for a themed round without an admin on the wire.
- Split semantics have one owner (`DJService`); future re-anchor / split-aware enqueue changes cannot drift from the plugin path.
- The plugin-source bypass is as powerful as `skipTrack`. Callers must go through a scoped `PluginAPI` (set by `PluginRegistry`).

## See also

- [0067. Queue split for reserved lower segment](0067-queue-split-reserved-segment.md)
- [0152. Plugin-authored core polls](0152-plugin-authored-core-polls.md)
- [0041. App-controlled queue reorder authorization](0041-queue-drag-reorder-authorization.md)
