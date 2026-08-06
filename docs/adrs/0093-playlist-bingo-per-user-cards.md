# 0093. Playlist Bingo per-user cards via GET_MY_GAME_STATE

**Date:** 2026-08-06
**Status:** Partially superseded by [0094](0094-plugin-contribute-to-user-game-state.md)

## Context

Playlist Bingo deals a private randomized bingo card to each listener. Plugin component stores fan out room-wide ([ADR 0061](0061-poll-voting-as-core-feature.md)), so putting card grids in the plugin store would leak every user's card. Item Shops already solved per-user secrecy by attaching data to the socket-scoped `GET_MY_GAME_STATE` / `USER_GAME_STATE` payload ([ADR 0049](0049-item-shops-and-shopping-sessions.md)).

## Decision

1. **New plugin** `@repo/plugin-playlist-bingo` (`playlist-bingo`) owns round lifecycle, criterion matching, scoring, and the Bingo Winner persona.
2. **Per-user cards** live in plugin Redis storage: round meta + a `cards` hash (`userId` → JSON card). Never broadcast full cards via the room-wide plugin component store.
3. ~~**`GET_MY_GAME_STATE`** includes `bingoCard` for the requesting user only, by reading playlist-bingo storage (same controller pattern as `currentShopInstance`).~~ **Superseded by [0094](0094-plugin-contribute-to-user-game-state.md):** the plugin implements `contributeToUserGameState` and returns `{ card }` under `pluginUserState["playlist-bingo"]`.
4. ~~**Clients** refetch game state when namespaced plugin events fire (`PLUGIN:playlist-bingo:ROUND_*`, `BINGO`, etc.).~~ **Superseded by [0094](0094-plugin-contribute-to-user-game-state.md):** contributors auto-emit `USER_GAME_STATE_INVALIDATED`; tab badging uses `requestGameStateTabAttention`.
5. **Public plugin store** may hold only non-secret round status (active flag, category label, status message).
6. ~~A future generic "plugin contributes to `USER_GAME_STATE`" hook is desirable but **out of scope**.~~ **Superseded by [0094](0094-plugin-contribute-to-user-game-state.md).**

## Consequences

### Positive

- Reuses a proven per-user delivery path; no new socket protocol for card secrecy.
- Cards stay private to each listener while still rendering in the game-state modal tab.

### Negative / trade-offs

- v1 coupled `roomsController` to bingo storage keys (removed in 0094).

## See also

- [ADR 0042](0042-game-sessions-and-inventory.md) — core game sessions
- [ADR 0043](0043-game-state-tabs-and-composable-shop-helper.md) — `gameStateTab`
- [ADR 0049](0049-item-shops-and-shopping-sessions.md) — per-user shop instances
- [ADR 0094](0094-plugin-contribute-to-user-game-state.md) — generic contribution hook
- `packages/plugin-playlist-bingo/`
