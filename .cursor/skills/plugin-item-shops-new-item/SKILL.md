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
   - Timed chat modifier on a user (self or other): which **flag** from `@repo/plugin-base` (e.g. `GROW_FLAG`), **intent** (`positive` | `negative`), **modifierName** (stable string for game state), **visibility** (default public, or `"self"` so effect bars are hidden from other users’ listener rows — see `timedModifierEffect` / `GameStateModifier.visibility`).
   - Passive defense (blocks debuffs): **defense** rules on the definition — mirror `items/warranty/index.ts`.
   - Room/API action (skip track, queue move, etc.): which **PluginContext.api** methods and **callContext** shape (`targetUserId`, `targetQueueItemId`, …).
3. **Definition**: **description**, **icon** (Lucide-style name string used by the client, e.g. `chevrons-up`), **rarity** (`common` | `uncommon` | `rare` | `legendary`), **coinValue** (catalog default), **stackable** / **maxStack** / **tradeable** / **consumable**, **requiresTarget** if any (`"self"` | `"user"` | `"queueItem"` | `"inventoryItems"` | `"userInventoryItem"` | `"mediaItem"` | `"coinAmount"` | `"spokenMessage"` — see `@repo/types` `ItemDefinition`; `"userInventoryItem"` uses gated `PEEK_USER_INVENTORY`, ADR 0147; `"mediaItem"` is an unfiltered picker over the actor's own stacks for restoration items, ADR 0159; `"spokenMessage"` collects message + voice for Media Bridge TTS, ADR 0178). For playback devices set **`slotPool: "playback"`** and **`playbackFormats`** (do not set `mediaFormat` / `artworkFrame`). Set **`gentlePlayback: true`** when the device should skip Physical Media wear-on-queue (ADR 0166). Derived Physical Media uses **`mediaFormat`** + **`slotPool: "collection"`**.
4. **Shop (theme match — ADR 0175)**: Suggest **one** shop from the taxonomy below. If none fit, **offer to create a new shop** (follow `plugin-item-shops-new-shop`) rather than dual-listing. Dual-list only if the author insists.
   - **Farmer's Market** (`shops/farmers-market/index.ts`) — inconsequential produce letter treatments
   - **Sweetwater** (`shops/sweetwater/index.ts`) — toys/gear gadgets (pedals, radio toys; may be used nefariously)
   - **Green Room** (`shops/green-room/index.ts`) — queue manipulation + long-term storage
   - **Spy World** (`shops/spy-world/index.ts`) — game-altering sneaky tools
   - **Record Store** (`localLibrary/shops/record-store.ts` → `RECORD_STORE_FIXED_ITEMS`) — Physical Media + playback capability
   For the chosen shop, set **coinValue** override (`{ shortId: items.<export>.shortId, coinValue: N }`).
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

| Pattern                                              | Use                                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single timed **flag** on targeted user (pedal-style) | `timedModifierEffect()` from `items/shared/behaviorHelpers.ts` — pass `modifierName`, `effects` (each with `durationMs`), `intent`, `successMessage`, `describe`, optional `visibility: "self"` to hide effect bars from other users.                   |
| Custom timed effects (multiple effects or non-flag)  | `applyTargetedTimedModifier()` with a full `TargetedTimedModifierSpec` (`effects` as `GameStateEffectWithMeta[]`, optional `visibility`).                                                                                                               |
| Equipped defense item that should not “activate”     | `usePassiveDefenseItem` + `definition.defense` — see `items/warranty/index.ts` (modifier/queue), `items/honeypot/index.ts` (intercept + copy), or `items/rubber-band/index.ts` (bounce `blockedModifier` onto attacker with `skipPassiveDefenseCheck`). |
| Playback device (`slotPool: "playback"`)             | `playbackFormats` on the definition; optional `gentlePlayback: true` to skip wear-on-queue (ADR 0166); `usePlaybackDevice` + `playbackDeviceSellbackValue` from `items/shared/playbackDevice.ts`. Do **not** set `mediaFormat` or `artworkFrame`. See ADR 0160 / 0166. |
| Restore Physical Media (`requiresTarget: "mediaItem"`) | `restorePhysicalMedia` from `items/shared/restoreMedia.ts`. Unfiltered picker; handler decides validity. See ADR 0159.                                                                                                                                   |
| Media Bridge TTS (`requiresTarget: "spokenMessage"`) | Custom `use` + `api.speakOnMediaBridge`; consume only on success. See `items/burner-phone` / ADR 0178.                                                                                                                                                     |
| Bespoke logic                                        | Async `use` handler: `(deps, userId, definition, callContext) => Promise<ItemUseResult>` with `{ success, consumed, message }`. Read `callContext` with narrow typing (see `empty-fridge`, `scratched-cd`).                                             |

**Room `sendSystemMessage` and the actor’s name:** resolve the actor with `await resolveItemUseActorDisplayName(deps, userId)` and post the line with `await sendAttributedSystemMessage(deps, content, ...attributions)` — never interpolate raw `getUsersByIds` usernames for room-visible copy, and never branch on the mask meta at the call site (the sender attaches `meta.maskedUserIds` / `meta.maskedLabel` for X-Ray pierce, ADR 0149). Attribution prefers the core presented-identity grant (ADR 0150) and falls back to the legacy **`anonymous_actions`** modifier (Disguise). Timed modifiers from `timedModifierEffect` already resolve actor/target names this way inside `applyTargetedTimedModifier`. The `npm run create-item` custom-handler scaffold imports the helper, resolves `displayName` for the actor, and reminds you to use it in any `sendSystemMessage`.

Target user for modifiers: `callContext` may include `targetUserId`; default target is the actor (`behaviorHelpers`).

### Shops

- Import `items` from `../../items` (or `../items` from `shops/index.ts`).
- Add `{ shortId: items.<export>.shortId, coinValue: <number> }` to that shop’s `availableItems` (Record Store fixed SKUs go in `RECORD_STORE_FIXED_ITEMS`).
- Do not duplicate catalog definition — shops only list `shortId` and price.

### Tests

- Use `createMockDeps`, `createMockDefinition`, `stubRoomUsers`, `invokeUse` from `items/shared/testHelpers.ts`.
- For flag pedals: assert `applyTimedModifier` via `expectApplyTimedModifierForPedal` and `userFactory` from `@repo/factories` for room membership.
- Cover failure paths (not in room, `defense_blocked`, missing `callContext`, API errors) mirroring `items/boost-pedal/boost-pedal.test.ts` and peers.

Run: `npm test -w @repo/plugin-item-shops`

## Checklist

```
- [ ] Discovery complete (name, shortId, behavior, icon, rarity, economy, theme-matched shop)
- [ ] items/<shortId>/index.ts with createItem (+ defense or use handler); any room line naming the actor uses `resolveItemUseActorDisplayName` + `sendAttributedSystemMessage`
- [ ] items/<shortId>/<shortId>.test.ts
- [ ] items/index.ts import + items registry
- [ ] Shop(s) updated with shortId + coinValue
- [ ] Tests pass for the workspace package
```

## References in-repo

- `docs/SHOP_ITEM_DEVELOPMENT.md` — themes + assignment rarity
- ADR 0175 — shop themes and assignment rarity
- `items/shared/types.ts` — `createItem`, `ItemUseHandler`, `ItemShopsBehaviorDeps`
- `items/shared/behaviorHelpers.ts` — `timedModifierEffect`, `applyTargetedTimedModifier`, `usePassiveDefenseItem`
- `items/shared/resolveItemUseActorDisplayName.ts` — room-visible actor label + `sendAttributedSystemMessage` (presented identity, ADR 0150; legacy `anonymous_actions`)
- `items/shared/testHelpers.ts` — mocks and `expectApplyTimedModifierForPedal`
- Examples: `items/boost-pedal`, `items/warranty`, `items/honeypot`, `items/rubber-band`, `items/empty-fridge`, `items/scratched-cd`, `items/burner-phone`
- Shops: `shops/sweetwater/index.ts`, `shops/green-room/index.ts`, `shops/farmers-market/index.ts`, `shops/spy-world/index.ts`, `localLibrary/shops/record-store.ts`
