# 0049. Item Shops and Shopping Sessions

**Date:** 2026-05-04
**Status:** Accepted

## Context

[ADR 0043](0043-game-state-tabs-and-composable-shop-helper.md) and [ADR 0047](0047-shop-plugin-base-class.md) established a **global per-item stock** model: `ShopHelper` persists `shop:stock:<shortId>` and restocks on `GAME_SESSION_STARTED`. The Music Shop plugin (`plugin-music-shop`) uses that model.

The show wants a **roguelike shopping session** model instead:

- A **master item catalog** (static code) with **rarity** and pluggable **behaviors** (what happens on use).
- A **master shop catalog** (static code) describing which items a shop *can* stock and **listed vs unlisted buyback** rates.
- **Shopping sessions** (admin-triggered): each user gets a **random shop instance** and **3 random offers** (one unit each, weighted by rarity), stored per user in plugin storage. Offers appear in a `gameStateTab`.
- **Sell** is only valid while a shop instance is open, using the assigned shop’s rates. Items remain **ephemeral to the game session** (cleared on `GAME_SESSION_ENDED`).

We still want to **retain** `ShopHelper` and `ShopPlugin` for plugins that fit the original global-stock model; the new model is a different product shape and should not force a breaking change to those abstractions.

## Decision

1. **New plugin `item-shops` (`@repo/plugin-item-shops`)** supersedes `plugin-music-shop` for the Listening Room default stack. It extends `BasePlugin` and composes a new **`ShoppingSessionHelper`** in `@repo/plugin-base/helpers` (alongside the existing `ShopHelper`).

2. **No change to `ShopHelper` / `ShopPlugin`**. The shopping-session flow is implemented in the new helper; future shop-like plugins may still extend `ShopPlugin` + `ShopHelper` when global stock is the right model.

3. **Per-user instance storage** (plugin storage, room-scoped):
   - `shopping-session:active` — whether a round is in progress.
   - `shopping-session:instances` — Redis hash: `userId` → JSON `ShoppingSessionInstance` (shop metadata + offers with `available` flags).

4. **Rarity**: `ItemDefinition` gains optional `rarity`. **Undefined rarity is treated as `common`** wherever weights or UI use it (single `resolveItemRarity` rule).

5. **Price resolution**: each item has a base `coinValue` in the item catalog. Each shop’s `availableItems` entry may set an optional `coinValue` **override** for that shop. **Unlisted** sell-backs (item not in the shop’s `availableItems`) use the **catalog** `coinValue` only as the base.

6. **User game state payload**: `GET_MY_GAME_STATE` includes `currentShopInstance` (parsed from item-shops storage) so the `current-shop-offers` template can render without a second round-trip.

7. **Admin actions** in the plugin config modal: **Start new shopping session** and **End all shopping sessions** via `EXECUTE_PLUGIN_ACTION` (same pattern as existing admin restock).

8. **Mid-session join**: on `USER_JOINED`, if `assignShopOnJoin` is true and a session is active, assign a new instance for that user (configurable; default `true`).

9. **Plugin events** (namespaced `PLUGIN:item-shops:…`) notify clients to refetch `GET_MY_GAME_STATE` when a round starts or ends.
10. **Document relationship to ADR 0043 / 0047**: game state tabs and `isSellingItems` remain in force. The **stock / purchase mechanics** of those ADRs apply to `ShopHelper` / `ShopPlugin` only; this ADR adds a second, shopping-session pattern that does not supersede 0043/0047 for other plugins.

## Consequences

### Positive

- Clear separation: legacy global stock vs new per-user sessions.
- Item **behaviors** are a code-level registry; future “Chaos” remapping of effects can swap or wrap that registry without changing core inventory.
- Reuses existing inventory, coin, and `onItemUsed` / `onItemSold` routing.

### Negative / trade-offs

- Two “shop” stories in documentation (`ShopPlugin` vs `ShoppingSessionHelper`); authors must pick the right one.
- `showWhen` on plugin tabs is still **room-scoped**; users without an instance see a **fallback** inside the tab body instead of hiding the tab per user (acceptable until a per-user `showWhen` exists).

## References

- [ADR 0042 — Game Sessions and Inventory](0042-game-sessions-and-inventory.md)
- [ADR 0043 — Game State Tabs and Composable Shop Helper](0043-game-state-tabs-and-composable-shop-helper.md)
- [ADR 0047 — ShopPlugin Base Class](0047-shop-plugin-base-class.md)
- `packages/plugin-base/helpers/ShoppingSessionHelper.ts`
- `packages/plugin-item-shops/`
