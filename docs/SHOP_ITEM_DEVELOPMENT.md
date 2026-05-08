# Item Shops Development Guide

This guide covers how to create and extend item-shop content in `@repo/plugin-item-shops`, including the CLI scaffolding tools for both items and shops.

## Quick Start

- Create an item scaffold:
  - `npm run create-item -w @repo/plugin-item-shops`
- Create a shop scaffold:
  - `npm run create-shop -w @repo/plugin-item-shops`
- Run package tests:
  - `npm test -w @repo/plugin-item-shops`

Both CLIs generate code in `packages/plugin-item-shops` and update registries for you.

## Plugin Structure

- Item definitions live in `packages/plugin-item-shops/items/<shortId>/index.ts`
- Item registry lives in `packages/plugin-item-shops/items/index.ts`
- Shop definitions live in `packages/plugin-item-shops/shops/<shopId>/index.ts`
- Shop catalog lives in `packages/plugin-item-shops/shops/index.ts`

## Creating Items

Use the item generator first:

```bash
npm run create-item -w @repo/plugin-item-shops
```

### What the item CLI asks for

- Item identity (`name`, `shortId`)
- Item definition fields (`description`, `icon`, `rarity`, `coinValue`, stack/trade/consume settings)
- Behavior type:
  - timed modifier
  - passive defense
  - custom handler stub
  - none
- Optional shop registration (per-shop `coinValue`)

### What the item CLI generates

- `items/<shortId>/index.ts`
- `items/<shortId>/<shortId>.test.ts`
- `items/index.ts` registration
- Selected shop `availableItems` updates

### Item behavior patterns

- **Timed modifier:** use `timedModifierEffect` in `items/shared/behaviorHelpers.ts`
- **Passive defense:** use `usePassiveDefenseItem` and `definition.defense`
- **Custom behavior:** generated async `use` handler stub with `ItemShopsBehaviorDeps`

### Effect Types

`GameStateEffectWithMeta` supports multiple effect kinds on a single modifier, and the item CLI now supports generating multi-effect modifiers.

- **flag** - Boolean flag in user game state
  - Text-effect flags currently wired to chat rendering are:
    - `GROW_FLAG`, `SHRINK_FLAG`, `ECHO_FLAG`, `GATE_FLAG`, `SCRAMBLE_FLAG`, `COMIC_SANS_FLAG`
  - Custom flags can be created by the CLI and are immediately readable via `getActiveFlags`
  - A custom flag will only affect UI text rendering after wiring it through text effect code paths (`countTextEffectStacks` / text transform helpers)
  - Full-screen / overlay UI flags (e.g. stackable blur) use shared stack helpers such as `countInterfaceBlurStacks` plus web helpers in `apps/web/src/lib/screenEffects.ts` and `ModifierBlurLayer`
- **multiplier** - Scales score/coin changes while active
  - Example: `{ type: "multiplier", target: "score", value: 2 }`
- **additive** - Adds a flat amount to score/coin changes while active
  - Example: `{ type: "additive", target: "score", value: 10 }`
- **set** - Forces attribute reads to a fixed value while active (advanced)
- **lock** - Prevents attribute writes while active (advanced)

Example multi-effect payload:

```ts
effects: [
  { type: "flag", name: GROW_FLAG, value: true, intent: "positive" },
  { type: "multiplier", target: "score", value: 1.5, intent: "positive" },
]
```

## Creating Shops

Use the shop generator:

```bash
npm run create-shop -w @repo/plugin-item-shops
```

### What the shop CLI asks for

- Shop identity (`shopId`, display `name`)
- `openingMessage` (optional, may include `{{shopName}}`)
- Economy rates (`listedBuybackRate`, `unlistedBuybackRate`)
- Available item lineup and per-item prices

### What the shop CLI generates

- `shops/<shopId>/index.ts`
  - Includes a no-op `onBuy` scaffold:
    - `function <shopName>OnBuy(_ctx: ShopBuyContext): void {}`
- `shops/index.ts` updates:
  - import for the new shop constant
  - shop constant appended to `SHOP_CATALOG`

### Shop callback guidance (`onBuy`)

`onBuy` runs after a successful purchase. Use `ShopBuyContext` from `@repo/plugin-base/helpers` to:

- read purchase context (`userId`, `username`, `itemShortId`, `itemName`)
- persist shop-scoped state (`getState`, `setState`, `deleteState`)
- manage timers (`startTimer`, `getTimer`, `clearTimer`)
- send messages (`sendSystemMessage`)

Start simple and keep callbacks deterministic. If logic grows, extract helper functions and add focused tests.

## Testing Guidance

- Item and shop tests use Vitest in this package.
- Run:

```bash
npm test -w @repo/plugin-item-shops
```

- For shop `onBuy` behavior:
  - mock `ShopBuyContext` methods with `vi.fn()`
  - assert state/timer/message side effects
  - if using timer callbacks, capture and invoke the callback in tests

## Useful References

- `packages/plugin-item-shops/items/shared/behaviorHelpers.ts`
- `packages/plugin-item-shops/items/shared/testHelpers.ts`
- `packages/plugin-item-shops/shops/sweetwater/index.ts` (advanced timers/messages)
- `packages/plugin-item-shops/shops/green-room/index.ts` (minimal `onBuy`)
