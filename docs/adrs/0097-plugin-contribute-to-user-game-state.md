# 0097. Plugin contributeToUserGameState for private per-user payloads

**Date:** 2026-08-06
**Status:** Accepted

## Context

Item Shops ([ADR 0049](0049-item-shops-and-shopping-sessions.md)) and Playlist Bingo ([ADR 0096](0096-playlist-bingo-per-user-cards.md)) both need private per-user data on the socket-scoped `GET_MY_GAME_STATE` / `USER_GAME_STATE` payload. v1 hard-coded plugin storage reads in `roomsController` and listed plugin event names in `userGameStateMachine` for refetch. That coupled core to plugin names, storage key layouts, and enrichment logic.

The room-wide plugin component store is unsuitable for secrets — it fans out to every client.

## Decision

1. **Optional plugin hook** `contributeToUserGameState(userId, { itemDefinitions })` returns a bag (or `null`). Core does **not** provide a BasePlugin default — `typeof === "function"` is the contributor check (implementing the hook opts into invalidation).
2. **`PluginRegistry.invokeContributeToUserGameState`** fans out with `Promise.all`, fail-open per plugin, merges by plugin name into `pluginUserState` on the payload.
3. **Wire shape:** `USER_GAME_STATE` carries `pluginUserState: Record<pluginName, Record<string, unknown>>`. Well-known bags: item-shops `{ currentShopInstance }`, playlist-bingo `{ card }`.
4. **Filtered `itemDefinitions`:** the payload includes only definitions referenced by the user's inventory, active modifiers, and optional plugin extras via `referencedItemDefinitionIdsForUser` (Item Shops uses this for open shop-offer `detailView`). Core must not HGETALL the full room catalog — album-mode Physical Media can register thousands of unused SKUs.
5. **Auto-invalidation:** when a contributor calls `api.emit()`, the scoped `PluginAPI` also emits room-wide `USER_GAME_STATE_INVALIDATED` (deduped once per room per event-loop turn). User-targeted APIs (`sendUserSystemMessage`, `requestGameStateTabAttention`, etc.) do **not** invalidate.
6. **Tab attention:** `PluginAPI.requestGameStateTabAttention({ userId, tabId })` emits user-targeted `PLUGIN_TAB_ATTENTION`. Clients badge the game button / tab without per-plugin event wiring.
7. **Clients** refetch on `USER_GAME_STATE_INVALIDATED` (debounced) and read bags via `getPluginState(pluginName)` / `getPluginUserState`.

## Consequences

### Positive

- Core no longer imports plugin names or storage keys for game-state assembly.
- New plugins can add private per-user UI without touching `roomsController` or the game-state machine.
- Room-wide cell-cover style signals no longer require N broadcasts that would multiply refetches.
- Large inventory definition catalogs (catalog-mode Physical Media) do not inflate every `USER_GAME_STATE` payload.

### Negative / trade-offs

- Contributors must accept that every `api.emit()` invalidates user game state for the room (mitigated by per-tick dedupe + client debounce).
- Template components that need private data must live under the game-state modal context (or refetch themselves).
- Clients must not assume `itemDefinitions` is the full room catalog (admin give-item uses plugin config actions, not this payload).
## See also

- [ADR 0049](0049-item-shops-and-shopping-sessions.md) — item shops (superseded delivery path)
- [ADR 0096](0096-playlist-bingo-per-user-cards.md) — playlist bingo (superseded delivery path)
- [Per-User State guide](../plugins/per-user-state.md)
