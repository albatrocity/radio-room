---
name: plugin-item-shops-new-item
description: Adds a new consumable or passive item to @repo/plugin-item-shops—discovery questions, createItem + behavior helpers, shop registration, Vitest. Use when creating or extending items under packages/plugin-item-shops/items, registering exports in items/index.ts, or listing items in shops/.
disable-model-invocation: true
---

# New item in plugin-item-shops

## Discovery (ask first)

Gather answers before editing:

1. **Display name** and **shortId** (kebab-case, unique; becomes folder name `items/<shortId>/`).
2. **Behavior category**
   - Timed chat modifier on a user (self or other): which **flag** from `@repo/plugin-base` (e.g. `GROW_FLAG`), **intent** (`positive` | `negative`), **modifierName** (stable string for game state).
   - Passive defense (blocks debuffs): **defense** rules on the definition — mirror `items/warranty/index.ts`.
   - Room/API action (skip track, queue move, etc.): which **PluginContext.api** methods and **callContext** shape (`targetUserId`, `targetQueueItemId`, …).
3. **Definition**: **description**, **icon** (Lucide-style name string used by the client, e.g. `chevrons-up`), **rarity** (`common` | `uncommon` | `rare` | `legendary`), **coinValue** (catalog default), **stackable** / **maxStack** / **tradeable** / **consumable**, **requiresTarget** if any (`"self"` | `"user"` | `"queueItem"` — see `@repo/types` `ItemDefinition`).
4. **Shops**: Which shop(s) sell it — **Sweetwater** (`shops/sweetwater/index.ts`), **Green Room** (`shops/green-room/index.ts`), and/or **inline shops** in `shops/index.ts` (e.g. `startup-guy`). For each, **coinValue** override at that shop (`{ shortId: items.<export>.shortId, coinValue: N }`).
5. **New flag or effect type?** If no existing flag fits, plan adding a constant in `packages/plugin-base` (and any text-transform wiring) before using `timedModifierEffect`.

## Implementation

### File layout

- `packages/plugin-item-shops/items/<shortId>/index.ts` — item export using `createItem` from `../shared/types`.
- `packages/plugin-item-shops/items/<shortId>/<shortId>.test.ts` — Vitest; reuse `../shared/testHelpers`.

### Register the item

In `packages/plugin-item-shops/items/index.ts`:

1. `import { <camelCase> } from "./<shortId>"`
2. Add `<camelCase>` to the `items` object (camelCase derived from shortId, e.g. `boost-pedal` → `boostPedal`).

`ITEM_CATALOG` and `ITEM_USE_BEHAVIORS` are derived automatically from `items`.

### Behavior — reuse helpers when possible

| Pattern | Use |
|--------|-----|
| Single timed **flag** on targeted user (pedal-style) | `timedModifierEffect()` from `items/shared/behaviorHelpers.ts` — pass `modifierName`, `flag`, `intent`, `successMessage`, `describe`. Duration comes from `deps.effectDurationMs`. |
| Custom timed effects (multiple effects or non-flag) | `applyTargetedTimedModifier()` with a full `TargetedTimedModifierSpec` (`effects` as `GameStateEffectWithMeta[]`). |
| Equipped defense item that should not “activate” | `usePassiveDefenseItem` + `definition.defense` — see `items/warranty/index.ts`. |
| Bespoke logic | Async `use` handler: `(deps, userId, definition, callContext) => Promise<ItemUseResult>` with `{ success, consumed, message }`. Read `callContext` with narrow typing (see `empty-fridge`, `scratched-cd`). |

Target user for modifiers: `callContext` may include `targetUserId`; default target is the actor (`behaviorHelpers`).

### Shops

- Import `items` from `../../items` (or `../items` from `shops/index.ts`).
- Add `{ shortId: items.<export>.shortId, coinValue: <number> }` to that shop’s `availableItems`.
- Do not duplicate catalog definition — shops only list `shortId` and price.

### Tests

- Use `createMockDeps`, `createMockDefinition`, `stubRoomUsers`, `invokeUse` from `items/shared/testHelpers.ts`.
- For flag pedals: assert `applyTimedModifier` via `expectApplyTimedModifierForPedal` and `userFactory` from `@repo/factories` for room membership.
- Cover failure paths (not in room, `defense_blocked`, missing `callContext`, API errors) mirroring `items/boost-pedal/boost-pedal.test.ts` and peers.

Run: `npm test -w @repo/plugin-item-shops`

## Checklist

```
- [ ] Discovery complete (name, shortId, behavior, icon, rarity, economy, shops)
- [ ] items/<shortId>/index.ts with createItem (+ defense or use handler)
- [ ] items/<shortId>/<shortId>.test.ts
- [ ] items/index.ts import + items registry
- [ ] Shop(s) updated with shortId + coinValue
- [ ] Tests pass for the workspace package
```

## References in-repo

- `items/shared/types.ts` — `createItem`, `ItemUseHandler`, `ItemShopsBehaviorDeps`
- `items/shared/behaviorHelpers.ts` — `timedModifierEffect`, `applyTargetedTimedModifier`, `usePassiveDefenseItem`
- `items/shared/testHelpers.ts` — mocks and `expectApplyTimedModifierForPedal`
- Examples: `items/boost-pedal`, `items/warranty`, `items/empty-fridge`, `items/scratched-cd`
- Shops: `shops/sweetwater/index.ts`, `shops/green-room/index.ts`, `shops/index.ts`
