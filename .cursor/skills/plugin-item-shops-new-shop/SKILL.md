---
name: plugin-item-shops-new-shop
description: Adds a new shop to @repo/plugin-item-shops—dedicated shop module, item lineup and prices, optional onBuy/onSessionEnd, Vitest for onBuy, SHOP_CATALOG registration. Use when creating shops under packages/plugin-item-shops/shops, editing shops/index.ts, or wiring ShopBuyContext callbacks.
disable-model-invocation: true
---

# New shop in plugin-item-shops

## Discovery (ask first)

1. **shopId** — stable string (kebab-case), unique across `SHOP_CATALOG`.
2. **name** — display name; **`openingMessage`** — optional; may use `{{shopName}}` like existing shops.
3. **Thematic description** (required) — what belongs in this shop? Written into the shop module comment. Existing themes (ADR 0175): Farmer's Market = produce letter flair; Sweetwater = toys/gear; Green Room = queue + storage; Spy World = sneaky game-altering tools; Record Store = Physical Media + playback. New shops need their own one-sentence theme.
4. **Assignment rarity** — `common` | `uncommon` | `rare` | `legendary` (same weights as items: 4 / 3 / 2 / 1). Defaults for existing shops: Record Store / Farmer's Market / Sweetwater = common; Green Room = rare; Spy World = legendary.
5. **Inventory**: which catalog items (from `items/index.ts`) and **per-item prices** — each `availableItems` entry is `{ shortId: items.<camel>.shortId, coinValue?: number }`. Omit `coinValue` only when the item’s catalog `coinValue` should apply. Prefer items that match the theme.
6. **Economy**: **listedBuybackRate** and **unlistedBuybackRate** (multipliers vs base price; see Sweetwater vs Green Room for scale).
7. **onBuy**: Needed after each successful purchase? If yes, what side effects (state, timers, follow-up messages)?
8. **onSessionEnd**: Optional cleanup when the shopping round ends (timers are cleared automatically—use for extra teardown if required).

Canonical type definitions live in `packages/game-logic/src/shoppingSessionCatalog.ts` (`ShopCatalogEntry`, `ShopBuyContext`).

## Implementation

### Layout (always)

Create **`packages/plugin-item-shops/shops/<shopId>/index.ts`** exporting e.g. `export const MY_SHOP: ItemShopsShopCatalogEntry = { ... }`. Register that export from `shops/index.ts`. Do not add new shops as inline objects in `shops/index.ts` (legacy entries may remain until refactored).

### Shop object fields

| Field | Notes |
|-------|--------|
| `shopId`, `name` | Required |
| `rarity` | Assignment rarity (`ItemRarity`); omit = common |
| Theme comment | JSDoc above the export with theme + rarity (ADR 0175) |
| `openingMessage` | Optional |
| `availableItems` | `ShopAvailableItem[]` — must reference **registered** item `shortId`s |
| `listedBuybackRate`, `unlistedBuybackRate` | Required numbers |
| `onBuy` | `(ctx: ShopBuyContext) => void \| Promise<void>` — runs after purchase succeeds |
| `onSessionEnd` | Optional; plugin invokes when session ends (`plugin-item-shops/index.ts`) |

Import types: `ItemShopsShopCatalogEntry`, `ShopBuyContext` from `@repo/plugin-base/helpers`. Import `items` from `../../items`.

### Tests when `onBuy` exists

Add **`shops/<shopId>/<shopId>.test.ts`** (Vitest).

1. **Extract testable units** when logic is non-trivial: move timer loops, message formatting, and branching into named functions (same module or `messages.ts` sibling) so tests call them with plain data—not only the full `onBuy` closure. `sweetwater` already splits follow-up delivery from the hook.
2. **Mock `ShopBuyContext`**: `vi.fn()` for `startTimer`, `sendSystemMessage`, `setState`, `getState`, `isGameSessionActive`, `isUserInRoom`, etc. Return resolved promises for async methods.
3. **Invoke** `MY_SHOP.onBuy!(ctx)` (or the extracted handler), then `expect` the right **state keys**, **timer registrations** (`startTimer` called with expected duration/callback shape), and **messages**.
4. **Timer callbacks**: capture `config.callback` from the `startTimer` mock implementation and `await callback()` in tests to verify follow-up behavior.

Run: `npm test -w @repo/plugin-item-shops`

Shops with **no** `onBuy` need no shop-level test file unless you add regression tests for static catalog shape.

### `ShopBuyContext` (for `onBuy`)

Use **`ctx.userId`**, **`ctx.username`**, **`ctx.itemShortId`**, **`ctx.itemName`**, **`ctx.roomId`**.

| API | Use |
|-----|-----|
| `startTimer` / `getTimer` / `clearTimer` | Timer ids are **auto-prefixed with `shopId`** — use stable suffixes per user (e.g. `followup:${userId}`). |
| `sendSystemMessage(message, meta?, mentions?)` | Room announcements; optional `meta` / `mentions` for DM-style targeting (see Sweetwater). |
| `isShoppingActive` | Shopping round still open |
| `isGameSessionActive` | Game session present |
| `isUserInRoom(userId)` | Buyer or other user still present |
| `getState` / `setState` / `deleteState` | **Shop-scoped** key/value store (not persisted across server restarts). |

**Patterns**

- **Simple state on buy**: `green-room/index.ts` — `setState` with username.
- **Deferred follow-ups**: `sweetwater/index.ts` — store rep state, `startTimer`, reschedule only while game + room checks pass; clear timer and state when leaving.

### Register in catalog

In `packages/plugin-item-shops/shops/index.ts`:

1. `import { MY_SHOP } from "./<shopId>"`.
2. Append **`MY_SHOP`** to the **`SHOP_CATALOG`** array.

`defaultItemShopsConfig.enabledShopIds` defaults to **all** `shopId`s from `SHOP_CATALOG` (`types.ts`), so new shops participate in rarity-weighted assignment unless an admin narrows **enabledShopIds** in plugin config.

### Do not

- List items that are not in `ITEM_CATALOG` (derived from `items` registry).
- Duplicate item definitions in the shop—only `shortId` + optional `coinValue`.
- Skip asking for theme / rarity.

## Checklist

```
- [ ] Discovery: shopId, name, theme, rarity, openingMessage, items + prices, buyback rates, onBuy/session hooks
- [ ] shops/<shopId>/index.ts satisfies ItemShopsShopCatalogEntry (theme comment + rarity)
- [ ] shops/index.ts imports and SHOP_CATALOG includes the shop
- [ ] If onBuy: shops/<shopId>/<shopId>.test.ts with mocked ShopBuyContext (and extracted helpers if needed)
- [ ] If onBuy uses timers: cancel paths when session/game/room invalid (mirror Sweetwater)
```

## References in-repo

- ADR 0175 — shop themes and assignment rarity
- `docs/SHOP_ITEM_DEVELOPMENT.md` — themes + rarity
- `shops/sweetwater/index.ts` — timers, `sendSystemMessage` with meta, state
- `shops/green-room/index.ts` — minimal `onBuy`
- `shops/index.ts` — `SHOP_CATALOG` assembly
- `packages/game-logic/src/shoppingSessionCatalog.ts` — `ShopBuyContext`, `ShopCatalogEntry`, `pickWeightedShop`
