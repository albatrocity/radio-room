# 0183. Item-use handlers reach shop state through `shopAccess`

**Date:** 2026-09-16
**Status:** Accepted

## Context

Sweetwater's sales rep keeps DMing a buyer every ten minutes for the rest of the show
([`shops/sweetwater/index.ts`](../../packages/plugin-item-shops/shops/sweetwater/index.ts)).
The nag loop lives entirely in that shop's in-memory state store and its
`shop:sweetwater:followup:{userId}` timer, both created through `ShopBuyContext` and both
wiped on `GAME_SESSION_ENDED` by `clearShopTimersAndStateForGameEnd`.

Call Screener is a Spy World SKU whose whole job is to stop those DMs. Item-use handlers
receive `ItemShopsBehaviorDeps` (`context`, `game`, inventory helpers) and had no way to
touch another shop's state or timers. Three options:

1. Special-case the SKU inside `ItemShopsPlugin.onItemUsed` — the plugin would need to
   know an item name, which is exactly what the `ITEM_USE_BEHAVIORS` registry exists to
   avoid.
2. Model screening as a game-state timed modifier — it would render an effect bar for a
   non-effect, be interceptable by Warranty / Honeypot / Rubber Band, and need a duration
   when the mechanic is "the rest of this session."
3. Give item behaviors the same scoped state/timer seam shops already have.

## Decision

1. **`ItemShopsBehaviorDeps.shopAccess`** exposes `getState` / `setState` / `deleteState` /
   `getTimer` / `clearTimer`, each taking `(shopId, key)`. The plugin implements it in
   `onItemUsed` over the existing `getShopStateStore(shopId)` map and the same
   `shop:{shopId}:` timer prefix used by `createShopBuyContext`, so items and shops share
   one namespace with no second store.

2. **No SKU branching in the plugin.** Cross-shop reach stays in the item module
   (`items/call-screener/`) and in shop-owned helpers. `onItemUsed` keeps dispatching
   purely through `ITEM_USE_BEHAVIORS[definition.shortId]`.

3. **Shop-owned key helpers, not raw string keys at the call site.** A shop that wants to
   be influenced from outside exports the keys and predicates as a leaf module
   ([`shops/sweetwater/followUps.ts`](../../packages/plugin-item-shops/shops/sweetwater/followUps.ts)),
   which items import. Leaf modules avoid an `items` ↔ `shops` import cycle, since shop
   modules already import `items`.

4. **`shopAccess` is optional on the type** so direct-call tests and any future non-plugin
   host keep compiling; the shared `createMockDeps` provides a Map-backed implementation.
   Handlers must degrade gracefully when it is absent.

5. **Lifetime is the game session, and it is not persisted.** Cross-shop flags are
   in-memory like all shop state, so a server restart forgets them. Anything that must
   survive a restart belongs in plugin storage instead.

## Consequences

- A Spy World item can neutralize a Sweetwater mechanic without either side importing the
  other's shop entry, and without core learning any item name.
- Shop state is now a small cross-item contract rather than a private detail. Shops that
  expect outside influence should export helpers (as Sweetwater does) instead of letting
  callers guess key strings.
- Screening does not survive a server restart, and it is invisible to game state — no
  effect bar, no modifier, and passive defenses cannot intercept it.
- `shopAccess` being optional means a handler that forgets the guard would silently no-op
  outside the plugin. Tests cover the mocked path.

## See also

- [0049. Item shops and shopping sessions](0049-item-shops-and-shopping-sessions.md)
- [0053. Defense `onDefenseTriggered` callbacks](0053-targeted-item-use-defense-intercept.md)
- [0175. Item shop themes and assignment rarity](0175-item-shop-themes-and-assignment-rarity.md)
- [`packages/plugin-item-shops/items/shared/types.ts`](../../packages/plugin-item-shops/items/shared/types.ts)
- [`packages/plugin-item-shops/items/call-screener/`](../../packages/plugin-item-shops/items/call-screener/)
