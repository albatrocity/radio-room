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

- **Timed modifier:** use `timedModifierEffect` in `items/shared/behaviorHelpers.ts` (system messages for who was affected use `resolveItemUseActorDisplayName` for `actor` / `target` inside `applyTargetedTimedModifier`)
- **Passive defense:** use `usePassiveDefenseItem` and `definition.defense` (`scope`: `modifier` and/or `queue`). Add optional **`onDefenseTriggered`** on the item (see `createItem` / `items/p2p-file-sharing` for intercept + copy, `items/rubber-band` for redirecting **`payload.blockedModifier`** onto the attacker via **`game.reboundModifier(attackerUserId, blockedModifier)`**) — core calls it **after** consuming a matching stack; put side effects or message overrides there. See ADR 0053.
- **Custom behavior:** generated async `use` handler stub with `ItemShopsBehaviorDeps`
- **Room messages naming the actor:** when a `use` handler calls `sendSystemMessage` with the inventory owner’s name, use **`resolveItemUseActorDisplayName(deps, userId)`** from `items/shared/resolveItemUseActorDisplayName.ts` so the **`anonymous_actions`** timed modifier (Ski Mask) is respected. It reads `deps.game.getUserState(userId)`; in tests, **`applyTimedModifier` is mocked**, so mirror modifier state by mocking **`getUserState`** when asserting anonymous copy.

### Effect Types

`GameStateEffectWithMeta` supports multiple effect kinds on a single modifier, and the item CLI now supports generating multi-effect modifiers.

- **`anonymous_actions`** (`ANONYMOUS_ACTIONS_FLAG` in `@repo/game-logic` / `@repo/plugin-base`) is used by Item Shops for **room-visible attribution**, not chat transforms: while active, item behaviors that call **`resolveItemUseActorDisplayName`** (`items/shared/resolveItemUseActorDisplayName.ts`) return **`"Someone"`** for `sendSystemMessage` copy instead of the actor’s username (e.g. Ski Mask before another item that announces who acted).
- Full-screen / overlay UI flags (e.g. stackable blur) use shared stack helpers such as `countInterfaceBlurStacks` plus web helpers in `apps/web/src/lib/screenEffects.ts` and `ModifierBlurLayer`

- **flag** - Boolean flag in user game state
  - **Cross-folder (shared) flags** — written by one item and read elsewhere — live as named exports in **`items/textEffects/sizeShift.ts`** (`GROW_FLAG`, `SHRINK_FLAG`, `ECHO_FLAG`). Import them from there in item definitions.
  - **Self-contained flags** — where one item is both the only writer and the only reader (typically via its own `TextEffectKind`) — are declared as a local `const FOO_FLAG = "foo"` at the top of the item file. No central registry entry. The item wizard inlines newly-created flags this way.
  - **`countFlagStacks(modifiers, now)`** from `@repo/game-logic` folds active modifiers into **`Record<string, number>`** stack counts (one per modifier per distinct flag name).
  - **`applyTextEffects(content, stacks, TEXT_EFFECT_KINDS)`** from `@repo/plugin-base` runs item-defined **`TextEffectKind`** handlers (see below).
  - Custom flags are readable via `getActiveFlags`; they only change chat rendering once you add a **`TextEffectKind`** and register it in **`TEXT_EFFECT_KINDS`** in `items/index.ts`.
  - Full-screen / overlay UI flags (e.g. stackable blur) still use stack helpers such as `countInterfaceBlurStacks` plus web helpers in `apps/web/src/lib/screenEffects.ts` and `ModifierBlurLayer`
- **multiplier** - Scales score/coin changes while active
  - Example: `{ type: "multiplier", target: "score", value: 2 }`
- **additive** - Adds a flat amount to score/coin changes while active
  - Example: `{ type: "additive", target: "score", value: 10 }`
- **set** - Forces attribute reads to a fixed value while active (advanced)
- **lock** - Prevents attribute writes while active (advanced)

Example multi-effect payload:

```ts
import { GROW_FLAG } from "../textEffects/sizeShift"

effects: [
  { type: "flag", name: GROW_FLAG, value: true, intent: "positive" },
  { type: "multiplier", target: "score", value: 1.5, intent: "positive" },
]
```

### Authoring a `TextEffectKind`

Kinds are registered in **`TEXT_EFFECT_KINDS`** in `packages/plugin-item-shops/items/index.ts`. Each kind picks a **phase**, **activation** (`activeWhen`: flag name or `(stacks) => boolean`), and **scope** (whole message vs per-word; use **`WordContext`** to target a single word).

**Example 1 — word mutation (Coffee Pedal pattern)**

Self-contained items declare their flag as a local `const` and pair it with their `TextEffectKind` in the same file. The flag is wired to the timed modifier via `timedModifierEffect` below; nothing outside this file needs the constant.

```ts
const COFFEE_FLAG = "coffee"

const coffeeTextEffect: TextEffectKind = {
  phase: "word",
  activeWhen: COFFEE_FLAG,
  transform: (word) => word.replace(/[zZ]/g, "!"),
}
```

**Example 2 — per-letter segmentation + stack-driven Chakra token (hypothetical)**

Use `type: "color"` with **`palette` + `token`** (see [Chakra colors](https://chakra-ui.com/docs/theming/colors)); intensity can track stack count by choosing different tokens.

```ts
export const ORANGE_LETTER_FLAG = "orange_letter"

const TOKEN_BY_STACK = { 1: "fg", 2: "solid", 3: "emphasized" } as const

export const orangeLetterTextEffect: TextEffectKind = {
  phase: "segment",
  activeWhen: ORANGE_LETTER_FLAG,
  build: (word, stacks) => {
    const count = Math.min(3, Math.max(1, stacks[ORANGE_LETTER_FLAG] ?? 0)) as 1 | 2 | 3
    const token = TOKEN_BY_STACK[count]
    const out: TextSegment[] = []
    let buf = ""
    for (const ch of word) {
      if (ch === "i" || ch === "I") {
        if (buf) out.push({ text: buf })
        out.push({ text: ch, effects: [{ type: "color", palette: "orange", token }] })
        buf = ""
      } else {
        buf += ch
      }
    }
    if (buf) out.push({ text: buf })
    return out.length ? out : null
  },
}
```

**Example 3 — content-scoped word picking (`WordContext`)**

```ts
export const HIGHLIGHT_LONGEST_FLAG = "highlight_longest"

export const highlightLongestTextEffect: TextEffectKind = {
  phase: "decorate",
  activeWhen: HIGHLIGHT_LONGEST_FLAG,
  effects: (_stacks, ctx) => {
    let longestIdx = 0
    for (let i = 1; i < ctx.allWords.length; i++) {
      if (ctx.allWords[i]!.length > ctx.allWords[longestIdx]!.length) longestIdx = i
    }
    if (ctx.wordIndex !== longestIdx) return []
    return [{ type: "color", palette: "yellow", token: "emphasized" }]
  },
}
```

**Applying a font family.** Emit `{ type: "font", value: <family> }` from a `decorate` or `segment` phase kind. Whole-message fonts use `decorate` (every word inherits); per-word or per-letter fonts use `segment` with **`WordContext`**. Echo segments automatically inherit **non-`size`** effects from the base word segment, so fonts (and colors from decorate) propagate without wiring echo to item-specific flags. Available values today: `comicSans`, `monospace`, `serif`, `papyrus` — extend the enum in **`packages/types/ChatMessage.ts`** and add a CSS stack in **`packages/game-logic/src/textEffectStyles.ts`** (`fontFamilyFor`).

### Timed modifier durations (`timedModifierEffect`)

- Each effect in `effects` **must** include **`durationMs`** (`GameStateEffectWithMeta`). It is consumed when applying the modifier and **not** stored on the persisted modifier.
- If resolved durations differ across effects, the helper applies **one `applyTimedModifier` call per duration group**. Modifier names become `${modifierName}__${durationMs}` when more than one group exists so stacking semantics stay per bucket.

### Modifier visibility (`visibility`)

Timed modifiers default to **public** (everyone sees the effect bar / tooltip for that user’s row in the listener list). Set **`visibility: "self"`** on `timedModifierEffect` to persist `visibility: "self"` on `GameStateModifier`: the web client hides those modifiers when rendering **another** user’s `UserEffectBars` (your own row still shows them).

Use `"self"` when showing the bar would leak private state (e.g. anonymity / disguise-style effects).

```ts
use: timedModifierEffect({
  modifierName: "disguise",
  visibility: "self",
  effects: [
    {
      type: "flag",
      name: ANONYMOUS_ACTIONS_FLAG,
      value: true,
      intent: "neutral",
      durationMs: 5 * 60 * 1000,
    },
  ],
  successMessage: "…",
  describe: () => `Someone went anonymous`,
})
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
- `packages/plugin-item-shops/items/shared/resolveItemUseActorDisplayName.ts`
- `packages/plugin-item-shops/items/shared/testHelpers.ts`
- `packages/plugin-item-shops/shops/sweetwater/index.ts` (advanced timers/messages)
- `packages/plugin-item-shops/shops/green-room/index.ts` (minimal `onBuy`)
