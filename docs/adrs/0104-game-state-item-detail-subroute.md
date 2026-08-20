# 0104. Game State Item Detail Subroute

**Date:** 2026-08-20
**Status:** Accepted

## Context

Physical Media Collection used a secondary “Queue a track” action that left Game State (`EDIT_QUEUE` + `browseMediaKey` → Add to Queue → CatalogBrowse). Shop Preview used a nested dialog. Listeners need an in-tab item detail view (lore and/or track list) that stays in the game domain, works for any opted-in inventory item, and can be deep-linked from elsewhere.

## Decision

1. **Core owns a per-tab virtual stack** on the Game State modal (React context, not TanStack). The active tab stays selected; a breadcrumb under the tab bar returns to the tab index.
2. **Opt-in via `ItemDefinition.detailView`:** `{ actionLabel?; actionIcon?; iconOnly?; layout?: "default" | "trackList" }`. Presence shows a Details secondary action. Core never names “Physical Media”; plugins set `layout: "trackList"` and supply `mediaKey` on the nav frame.
3. **Deep-link** via `modalsMachine` `OPEN_GAME_STATE_ITEM_DETAIL` (one-shot payload, same pattern as `queueBrowseMediaKey`).
4. **`trackList` queue:** Add uses existing `QUEUE_SONG` / grants (`validateQueueRequest`). Shop detail is Play-only; inventory shows Add when the viewer may queue.
5. Collection’s “Queue a track” special case and the shop Preview dialog are replaced by Details → in-tab detail.

## Consequences

- Plugins stay config-based; Item Shops is the first consumer (derived records use `trackList` + “View record”).
- CatalogBrowse / Add to Queue Physical Media browse remains available for the Add to Queue modal itself.
- Extending layouts later (new enum values or section lists) does not require per-plugin routers.
