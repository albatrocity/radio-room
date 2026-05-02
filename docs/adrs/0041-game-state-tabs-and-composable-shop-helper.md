# 0041. Game State Tabs and Composable Shop Helper

**Date:** 2026-05-01
**Status:** Partially superseded by [0045](0045-shop-plugin-base-class.md)

> **Note:** The "Composable `ShopHelper` instead of a `ShopBasePlugin`" decision below is partially superseded by [ADR 0045](0045-shop-plugin-base-class.md), which introduces a `ShopPlugin` base class for the typical inheritance case while keeping `ShopHelper` available for composition. The other decisions in this ADR — the tabbed game state modal, `onItemSold` as a first-class lifecycle hook, and the `isSellingItems` config convention — remain in force.

## Context

The user-facing **Game State modal** (`apps/web/src/components/Modals/ModalUserGameState.tsx`) originally rendered a flat layout: attribute stats followed by an inventory list. As more game-related plugins were added, two pressures emerged:

1. **Plugin UI integration.** Plugins that had user-facing surfaces (e.g. the Music Shop) had been hanging buttons + modals off `userList`, even when the natural place was inside a player's own dashboard. The shop modal felt out of place next to chat buttons.
2. **Sell-flow location.** Selling items from a shop modal forced players to first locate items they already owned. Players naturally look in their own inventory to dispose of items.
3. **Shop plumbing duplication.** The Music Shop plugin held inline stock counters, ad-hoc purchase logic, and ad-hoc UI generation. Adding a second shop plugin (potions, hint tokens, etc.) would have meant copying the same plumbing.

Additionally, [ADR 0006](0006-plugin-system-for-room-features.md) established that plugin UI is **declarative**: plugins ship JSON, the frontend renders it. Any solution had to keep React out of plugin packages.

## Decision

We're making three coordinated changes:

### 1. Tabbed game state modal with a plugin tab area

`ModalUserGameState` becomes a tabbed container.

- A built-in **Inventory** tab is always the first tab and is owned by the frontend. It shows the active session's attributes and the user's items, with declaratively-derived **Use** and **Sell** buttons next to each item.
- A new component area `gameStateTab` and component type `tab` let plugins register additional tabs. Tab visibility is gated by `showWhen`, so plugins can hide tabs based on config (e.g. Music Shop hides the Shop tab when `isSellingItems: false`).
- Tab content is rendered by `PluginComponentRenderer` inside a `PluginComponentProvider`, so existing template components (`text-block`, `button`, `game-attribute`, etc.) Just Work inside tabs.
- A `UserGameStateContext` exposes the user's snapshot (attributes / inventory / session) to React components rendered inside the modal. The `game-attribute` template component reads from this context to display live values such as the user's coin balance.

### 2. Composable `ShopHelper` instead of a `ShopBasePlugin`

Common shop logic (per-item stock in plugin storage, atomic purchase / sell flows with refunds, declarative UI generation, default `storeKeys`) lives in a new `ShopHelper` class shipped via `@repo/plugin-base/helpers`.

- Plugins **compose** the helper (`this.shop = new ShopHelper(name, context, items)`) instead of inheriting from a `ShopBasePlugin`. This keeps the inheritance slot free for plugins that are simultaneously a game and a shop, and leaves room for additional helpers (rounds, leaderboards) without hierarchy conflicts.
- The helper does not subscribe to events itself - it exposes methods (`restockAll`, `purchase`, `sell`) that the host plugin calls from its own event handlers and `executeAction` switch.

### 3. `onItemSold` symmetrical with `onItemUsed`

Sell flows are routed by the inventory layer rather than going through `EXECUTE_PLUGIN_ACTION`.

- New `Plugin.onItemSold(userId, item, definition, context?)` mirrors `onItemUsed`. The plugin owning the item is responsible for the full sale (remove item, credit coins, restock, emit UI updates). The handler returns an `ItemSellResult` with an optional `refund`.
- `PluginRegistry.invokeOnItemSold` mirrors `invokeOnItemUsed`. The new socket handler `SELL_INVENTORY_ITEM { itemId }` looks up the source plugin from the item definition and dispatches.
- Frontend Sell buttons emit `SELL_INVENTORY_ITEM` and the server replies on `INVENTORY_ACTION_RESULT { success, message, refund? }`.

A parallel `USE_INVENTORY_ITEM { itemId }` socket handler is added so the **Use** button in the inventory tab can dispatch through the existing `InventoryService.useItem` flow without going through `EXECUTE_PLUGIN_ACTION`.

### 4. `isSellingItems` config convention

Shop plugins should expose a separate boolean for "actively selling" so admins can pause sales without disabling item effects:

| `enabled` | `isSellingItems` | Behavior                                                                 |
| --------- | ---------------- | ------------------------------------------------------------------------ |
| `true`    | `true`           | Shop tab visible, can buy, can use, can sell back.                       |
| `true`    | `false`          | Shop tab hidden, purchases blocked. Items still usable and sellable.     |
| `false`   | -                | Plugin fully off (item effects also blocked).                            |

## Consequences

### Positive

- **Plugins compose, not inherit.** `ShopHelper` is a member, so a plugin can hold multiple helpers without single-inheritance pain. This is the pattern future helpers will follow.
- **Shop logic is centralized.** New shop plugins ship a `ShopItem[]` and a config schema; stock, refunds, and UI follow for free.
- **Sell flows are typed and routed by ownership.** `onItemSold` makes selling a first-class plugin lifecycle hook on par with `onItemUsed`.
- **Plugin tab UI follows the existing declarative model.** No React in plugin packages; the renderer reuses the same `PluginComponentProvider` machinery as other areas.
- **Shop UX moves into the player's own dashboard.** Players sell from inventory. Shops live next to stats. The user list isn't a junk drawer for plugin buttons.

### Negative / trade-offs

- **`gameStateTab` is a new area to maintain.** The modal has to know how to wrap plugin tab content with a `PluginComponentProvider`. This is encapsulated in `ModalUserGameState`.
- **`ShopHelper` is opinionated about storage layout.** Stock keys live under `shop:stock:<shortId>`. Plugins that need a different layout can ignore the helper and use the inventory and game APIs directly.
- **Two flows for selling.** Plugins can either implement `onItemSold` (preferred) or wire a custom action through `executeAction`. We accept the ambiguity to avoid forcing all sell-back logic through inventory routing.
- **Pre-existing `inventory-grid` etc. are still unimplemented.** Tabs use template components that already exist (`text-block`, `button`, `game-attribute`). Future work can add `inventory-grid` and friends; tabs render fine without them.

## References

- [ADR 0006 — Plugin System for Room Features](0006-plugin-system-for-room-features.md)
- [ADR 0040 — Game Sessions and Inventory as Core Infrastructure](0040-game-sessions-and-inventory.md)
- `packages/plugin-base/helpers/ShopHelper.ts`
- `apps/web/src/components/Modals/ModalUserGameState.tsx`
- `apps/web/src/components/Modals/UserGameStateContext.tsx`
- `packages/types/PluginComponent.ts` (`PluginTabComponent`, `gameStateTab`)
- `packages/server/controllers/roomsController.ts` (`USE_INVENTORY_ITEM`, `SELL_INVENTORY_ITEM`)
