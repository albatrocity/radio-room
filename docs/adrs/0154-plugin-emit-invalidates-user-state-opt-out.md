# 0154. Plugin emit may skip USER_GAME_STATE_INVALIDATED

**Date:** 2026-09-03
**Status:** Accepted

## Context

[ADR 0097](0097-plugin-contribute-to-user-game-state.md) opts a plugin into room-wide `USER_GAME_STATE_INVALIDATED` on every `api.emit()` once it implements `contributeToUserGameState`. That is the right default for events that change private per-user bags (round start/end, bingo deal).

Queue Theme ([ADR 0152](0152-plugin-authored-core-polls.md)) also emits `POLL_CYCLE` and `STANDINGS_UPDATED` on every track. Those payloads are room-public (standings, round flags) and do not change `pluginUserState`. Combined with a per-track poll loop, every client refetched the full `GET_MY_GAME_STATE` payload (session, inventory, all plugin bags) once per track even though Queue Theme's brief only changes at round boundaries.

## Decision

1. **`PluginAPI.emit(eventName, data, options?)` accepts `invalidatesUserState?: boolean`.** Default is `true` so existing contributors keep today's refetch behavior. Pass `false` to skip the room-wide invalidation for that emit.

2. **Contributor check is unchanged.** Implementing `contributeToUserGameState` still opts the plugin in; the new flag is a per-call opt-out, not a second registration.

3. **Use `false` only when the emit does not change any user's `contributeToUserGameState` bag.** Queue Theme passes `false` on `POLL_CYCLE` and `STANDINGS_UPDATED`, and leaves the default on `ROUND_STARTED` / `ROUND_ENDED`.

4. **Deduped invalidation (one per room per event-loop turn) still applies** when `invalidatesUserState` is not `false`.

This amends ADR 0097 decision 5 (auto-invalidation on every `api.emit()`). The rest of 0097 stands.

## Consequences

- High-frequency public plugin events no longer force N clients to refetch private game state.
- A plugin that relied on poll-cycle (or similar) invalidation to refresh private bags will go stale until it emits an invalidating event or the client refetches for another reason. Callers must pass `false` only when they mean it.
- `BasePlugin.emit` forwards the options object; Game Studio's mock accepts and ignores it.

## See also

- [0097. Plugin contributeToUserGameState](0097-plugin-contribute-to-user-game-state.md)
- [Per-User State guide](../plugins/per-user-state.md)
- [0152. Plugin-authored core polls](0152-plugin-authored-core-polls.md)
